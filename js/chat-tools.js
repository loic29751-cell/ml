/* Clawd Coach — outils que l'IA du chat peut utiliser pour gérer le répertoire d'ouvertures.
 * Chaque appel est validé ici (couleur, coups légaux, conflits) avant de toucher au répertoire. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const R = CC.Rep;
  const A = CC.Analysis;
  const Chess = root.Chess;
  const T = (CC.ChatTools = {});

  const COLOR = { type: 'string', enum: ['w', 'b'], description: '« w » = répertoire avec les Blancs, « b » = répertoire avec les Noirs' };
  const MOVES = {
    type: 'array',
    items: { type: 'string' },
    description: 'Coups en notation SAN anglaise depuis la position initiale, dans l’ordre (ex. ["e4","c6","d4","d5","Nc3"]).',
  };
  T.DEFS = [
    {
      name: 'get_repertoire',
      description:
        'Liste les lignes actuellement dans le répertoire d’ouvertures du joueur pour une couleur. À appeler avant de proposer ou d’ajouter des lignes, pour éviter les doublons et les conflits.',
      props: { color: COLOR },
      required: ['color'],
    },
    {
      name: 'add_repertoire_line',
      description:
        'Ajoute UNE ligne d’ouverture au répertoire du joueur. Les coups du camp « color » deviennent les coups du joueur ; ceux de l’adversaire deviennent des réponses préparées. Pour plusieurs variantes, appelle l’outil une fois par ligne (6 à 14 demi-coups chacune). Si le répertoire contient déjà un autre coup à une position de la ligne, l’ajout est refusé, sauf avec replace=true (seulement si le joueur a demandé de remplacer).',
      props: {
        color: COLOR,
        moves: MOVES,
        name: { type: 'string', description: 'Nom de l’ouverture ou de la variante, par exemple « Caro-Kann, variante d’avance ».' },
        replace: { type: 'boolean', description: 'true pour remplacer un coup déjà présent dans le répertoire.' },
      },
      required: ['color', 'moves'],
    },
    {
      name: 'remove_repertoire_line',
      description:
        'Retire du répertoire le dernier coup du joueur de la ligne donnée, et toute la suite. « moves » va de la position initiale jusqu’à ce coup inclus.',
      props: { color: COLOR, moves: MOVES },
      required: ['color', 'moves'],
    },
  ];

  /* Définitions au format de chaque fournisseur (toujours identiques d'un appel à l'autre) */
  T.claude = () =>
    T.DEFS.map((d) => ({
      name: d.name,
      description: d.description,
      eager_input_streaming: true,
      input_schema: { type: 'object', properties: d.props, required: d.required, additionalProperties: false },
    }));
  const toGemini = (s) => {
    const o = { type: s.type.toUpperCase() };
    if (s.description) o.description = s.description;
    if (s.enum) o.enum = s.enum;
    if (s.items) o.items = toGemini(s.items);
    if (s.properties) {
      o.properties = {};
      for (const k of Object.keys(s.properties)) o.properties[k] = toGemini(s.properties[k]);
    }
    if (s.required) o.required = s.required;
    return o;
  };
  T.gemini = () => [
    { functionDeclarations: T.DEFS.map((d) => ({ name: d.name, description: d.description, parameters: toGemini({ type: 'object', properties: d.props, required: d.required }) })) },
  ];

  /* ---------------- Validation ---------------- */
  const normColor = (c) => {
    const s = String(c || '').toLowerCase();
    if (s === 'w' || s.startsWith('white') || s.startsWith('blanc')) return 'w';
    if (s === 'b' || s.startsWith('black') || s.startsWith('noir')) return 'b';
    return null;
  };
  T.validate = function (name, input) {
    const def = T.DEFS.find((d) => d.name === name);
    if (!def) return { ok: false, error: `outil inconnu : ${name}` };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'paramètres manquants' };
    if (!normColor(input.color)) return { ok: false, error: 'color doit valoir "w" ou "b"' };
    if (def.props.moves) {
      if (!Array.isArray(input.moves) || !input.moves.length || input.moves.some((m) => typeof m !== 'string')) return { ok: false, error: 'moves doit être une liste de coups (texte)' };
      if (input.moves.length > 40) return { ok: false, error: 'ligne trop longue (40 demi-coups au maximum)' };
    }
    if (input.name != null && typeof input.name !== 'string') return { ok: false, error: 'name doit être un texte' };
    if (input.replace != null && typeof input.replace !== 'boolean') return { ok: false, error: 'replace doit valoir true ou false' };
    return { ok: true };
  };

  /** Rejoue une liste de coups SAN depuis le départ */
  function parseLine(moves) {
    const ch = new Chess();
    const out = [];
    for (let i = 0; i < moves.length; i++) {
      const raw = String(moves[i])
        .trim()
        .replace(/^\d+\.+\s*/, '')
        .replace(/[!?]+$/, '')
        .replace(/^0-0-0/, 'O-O-O')
        .replace(/^0-0/, 'O-O');
      if (!raw) continue;
      const fb = ch.fen();
      const mv = ch.move(raw, { sloppy: true });
      if (!mv) return { ok: false, index: i, token: moves[i], legal: ch.moves().slice(0, 40) };
      out.push({ san: mv.san, uci: mv.from + mv.to + (mv.promotion || ''), color: mv.color, fenBefore: fb, fenAfter: ch.fen() });
    }
    return { ok: true, moves: out };
  }
  const lineText = (moves) =>
    moves
      .map((m, k) => (m.color === 'w' ? CC.moveLabel(m.fenBefore, 'w') + ' ' : k === 0 ? CC.moveLabel(m.fenBefore, 'b') + ' ' : '') + m.san)
      .join(' ');

  /* ---------------- Exécution ---------------- */
  /* Chaque action garde la différence avant/après (clé de position -> [avant, après]).
   * Annuler ne touche que ces positions : on peut annuler une action sans défaire les suivantes. */
  const clone = (o) => JSON.parse(JSON.stringify(o || {}));
  const uciOf = (e) => (e ? e.uci : null);
  function diffOf(before, after) {
    const d = {};
    for (const k of new Set(Object.keys(before).concat(Object.keys(after)))) {
      const a = before[k] || null;
      const b = after[k] || null;
      if (uciOf(a) !== uciOf(b)) d[k] = [a, b];
    }
    return d;
  }
  /** dir : 'undo' (revenir à avant) ou 'redo' (réappliquer) ; renvoie le nombre de positions modifiées */
  T.apply = function (act, dir) {
    if (!act || !act.diff) return 0;
    const data = R.data();
    const d = data[act.color];
    const from = dir === 'undo' ? 1 : 0;
    const to = 1 - from;
    let n = 0;
    for (const k of Object.keys(act.diff)) {
      if (uciOf(d[k]) !== uciOf(act.diff[k][from])) continue; // modifié depuis : on n'y touche pas
      if (act.diff[k][to]) d[k] = act.diff[k][to];
      else delete d[k];
      n++;
    }
    if (dir === 'undo' && act.srs) for (const ck of Object.keys(act.srs)) if (!data.srs[ck]) data.srs[ck] = act.srs[ck];
    R.prune(act.color);
    R.save();
    if (n) act.undone = dir === 'undo';
    return n;
  };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  async function finalEval(fen, color, engine) {
    try {
      const res = await engine.analyze(fen, { depth: 12, movetime: 800, multipv: 1 });
      const sc = res.lines[0] && res.lines[0].score;
      if (!sc) return null;
      const pov = CC.winFor(sc, color);
      return { text: CC.fmtEval(sc), bad: pov < 30 };
    } catch (e) {
      return null;
    }
  }

  function getRepertoire(input) {
    const color = normColor(input.color);
    const nodes = R.walk(color);
    const lines = [];
    const prefixes = new Set();
    for (const n of nodes) prefixes.add(n.path.join(' '));
    for (const n of nodes) {
      const full = n.path.concat(n.move.uci).join(' ');
      // ligne « feuille » : aucune autre position du répertoire ne la prolonge
      const extended = Array.from(prefixes).some((p) => p !== n.path.join(' ') && p.startsWith(full + ' '));
      if (!extended) lines.push(n.sans.concat(n.move.san));
    }
    const fmt = (sans) => {
      const ch = new Chess();
      const out = [];
      for (const s of sans) {
        const fb = ch.fen();
        const mv = ch.move(s);
        if (!mv) break;
        out.push({ san: mv.san, color: mv.color, fenBefore: fb });
      }
      return lineText(out);
    };
    return {
      result: {
        color,
        positions_avec_un_coup: nodes.length,
        lignes: lines.slice(0, 60).map(fmt),
        tronque: lines.length > 60,
      },
    };
  }

  async function addLine(input, ctx) {
    const color = normColor(input.color);
    const p = parseLine(input.moves);
    if (!p.ok) {
      return { isError: true, result: { ok: false, erreur: `coup illégal ou illisible « ${p.token} » (demi-coup ${p.index + 1})`, coups_legaux_a_ce_moment: p.legal } };
    }
    const mine = p.moves.filter((m) => m.color === color);
    if (!mine.length) return { isError: true, result: { ok: false, erreur: 'la ligne ne contient aucun coup du joueur' } };
    const conflicts = [];
    for (const m of mine) {
      const e = R.get(color, m.fenBefore);
      if (e && e.uci !== m.uci) conflicts.push(`${CC.moveLabel(m.fenBefore, color)} : le répertoire joue déjà ${e.san}, pas ${m.san}`);
    }
    if (conflicts.length && !input.replace) {
      return { result: { ok: false, conflits: conflicts, conseil: 'Demande au joueur s’il veut remplacer ces coups, puis rappelle l’outil avec replace=true.' } };
    }
    const before = clone(R.data()[color]);
    let added = 0;
    let already = 0;
    let replaced = 0;
    for (const m of mine) {
      const e = R.get(color, m.fenBefore);
      if (e && e.uci === m.uci) {
        already++;
        continue;
      }
      if (e) replaced++;
      R.set(color, m.fenBefore, m.uci, m.san, 'chat');
      added++;
    }
    if (replaced) {
      R.prune(color);
      R.save();
    }
    const last = p.moves[p.moves.length - 1];
    const ev = ctx && ctx.engine ? await finalEval(last.fenAfter, color, ctx.engine) : null;
    const opening = A.identifyOpening(p.moves.map((m) => m.san)).opening;
    const line = lineText(p.moves);
    const diff = diffOf(before, R.data()[color]);
    const result = {
      ok: true,
      couleur: color,
      ligne: line,
      coups_ajoutes: added,
      deja_presents: already,
      remplaces: replaced,
      ouverture: opening ? opening.name : null,
      evaluation_finale_stockfish: ev ? ev.text + ' (point de vue des Blancs)' : null,
    };
    if (ev && ev.bad) result.attention = 'La position finale est nettement défavorable au joueur selon Stockfish : vérifie la ligne.';
    return {
      result,
      action: added
        ? { id: newId(), type: 'add', color, line, name: input.name || (opening && opening.name) || null, added, replaced, eval: ev ? ev.text : null, bad: !!(ev && ev.bad), path: p.moves.map((m) => m.uci), diff }
        : null,
    };
  }

  function removeLine(input) {
    const color = normColor(input.color);
    const p = parseLine(input.moves);
    if (!p.ok) return { isError: true, result: { ok: false, erreur: `coup illégal ou illisible « ${p.token} » (demi-coup ${p.index + 1})` } };
    const mine = p.moves.filter((m) => m.color === color);
    const target = mine[mine.length - 1];
    if (!target) return { isError: true, result: { ok: false, erreur: 'la ligne ne contient aucun coup du joueur' } };
    const e = R.get(color, target.fenBefore);
    if (!e) return { result: { ok: false, erreur: 'cette position n’a pas de coup dans le répertoire' } };
    const before = clone(R.data()[color]);
    const srsBefore = clone(R.data().srs);
    R.remove(color, target.fenBefore);
    const diff = diffOf(before, R.data()[color]);
    const srs = {};
    for (const ck of Object.keys(srsBefore)) if (!R.data().srs[ck]) srs[ck] = srsBefore[ck];
    const line = lineText(p.moves.slice(0, p.moves.indexOf(target) + 1));
    return {
      result: { ok: true, retire: `${CC.moveLabel(target.fenBefore, color)} ${e.san} et la suite (${Object.keys(diff).length} positions)`, positions_restantes: R.size(color) },
      action: { id: newId(), type: 'remove', color, line, removed: e.san, count: Object.keys(diff).length, path: p.moves.slice(0, p.moves.indexOf(target)).map((m) => m.uci), diff, srs },
    };
  }

  /** Exécute un outil ; ne lève jamais d'exception (l'erreur est renvoyée au modèle) */
  T.run = async function (name, input, ctx) {
    const v = T.validate(name, input);
    if (!v.ok) return { isError: true, result: { ok: false, erreur: v.error } };
    try {
      if (name === 'get_repertoire') return getRepertoire(input);
      if (name === 'add_repertoire_line') return await addLine(input, ctx);
      if (name === 'remove_repertoire_line') return removeLine(input);
    } catch (e) {
      return { isError: true, result: { ok: false, erreur: String((e && e.message) || e) } };
    }
    return { isError: true, result: { ok: false, erreur: 'outil inconnu' } };
  };
})(window);
