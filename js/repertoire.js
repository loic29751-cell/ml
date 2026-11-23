/* Clawd Coach — répertoire d'ouvertures : un coup par position (transpositions comprises),
 * révision espacée (boîtes de Leitner), statistiques et écarts tirés de tes parties. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const Chess = root.Chess;
  const A = CC.Analysis;
  const R = (CC.Rep = {});
  const KEY = 'cc.rep';
  const DAY = 86400000;
  R.INTERVALS = [0, 1, 3, 7, 16, 35, 90]; // jours d'attente par boîte
  R.NEW_PER_DAY = 10;

  /** Clé d'une position (transpositions comprises) : la case « en passant » n'est gardée que si la prise est possible */
  R.fenKey = (fen) => {
    const p = fen.split(' ');
    let ep = p[3] || '-';
    if (ep !== '-') {
      const file = ep.charCodeAt(0) - 97;
      const pawn = p[1] === 'w' ? 'P' : 'p';
      const row = p[0].split('/')[p[1] === 'w' ? 3 : 4]; // rangée 5 (Blancs au trait) ou 4 (Noirs au trait)
      const cells = [];
      for (const c of row) {
        if (c >= '1' && c <= '8') for (let k = 0; k < +c; k++) cells.push('');
        else cells.push(c);
      }
      if (!((file > 0 && cells[file - 1] === pawn) || (file < 7 && cells[file + 1] === pawn))) ep = '-';
    }
    return [p[0], p[1], p[2], ep].join(' ');
  };
  const blank = () => ({ v: 1, w: {}, b: {}, srs: {}, newDay: '', newCount: 0 });
  let data = null;
  R.data = () => {
    if (!data) {
      data = CC.store.get(KEY, null);
      if (!data || data.v !== 1) data = blank();
    }
    return data;
  };
  R.save = () => CC.store.set(KEY, R.data());
  R.snapshot = (color) => JSON.stringify(R.data()[color]);
  R.restore = (color, snap) => {
    R.data()[color] = JSON.parse(snap);
    R.save();
  };

  /** Mon coup dans cette position : { uci, san, t, src } ou null */
  R.get = (color, fen) => R.data()[color][R.fenKey(fen)] || null;
  R.set = (color, fen, uci, san, src) => {
    R.data()[color][R.fenKey(fen)] = { uci, san, t: Date.now(), src: src || 'manuel' };
    R.save();
  };
  R.remove = (color, fen) => {
    delete R.data()[color][R.fenKey(fen)];
    R.prune(color);
    R.save();
  };
  R.size = (color) => Object.keys(R.data()[color]).length;

  /**
   * Positions où c'est à moi de jouer, atteignables depuis le départ en suivant mes coups
   * et les réponses adverses préparées : [{ fen, key, path:[uci], sans:[san], move }]
   */
  R.walk = function (color, maxPly) {
    const d = R.data()[color];
    const out = [];
    const seen = new Set();
    const ch = new Chess();
    const rec = (fen, path, sans) => {
      if (path.length > (maxPly || 40)) return;
      ch.load(fen);
      if (ch.turn() === color) {
        const key = R.fenKey(fen);
        if (seen.has(key)) return;
        seen.add(key);
        const e = d[key];
        if (!e) return;
        out.push({ fen, key, path, sans, move: e });
        const mv = ch.move(A.uciMove(e.uci));
        if (mv) rec(ch.fen(), path.concat(e.uci), sans.concat(mv.san));
      } else {
        const replies = ch.moves({ verbose: true });
        for (const m of replies) {
          ch.load(fen);
          ch.move(m);
          const f2 = ch.fen();
          if (d[R.fenKey(f2)]) rec(f2, path.concat(m.from + m.to + (m.promotion || '')), sans.concat(m.san));
        }
      }
    };
    rec(CC.START_FEN, [], []);
    return out;
  };

  /** Retire les positions devenues inaccessibles (et leurs fiches de révision) */
  R.prune = function (color) {
    const d = R.data();
    const keep = new Set(R.walk(color).map((n) => n.key));
    for (const k of Object.keys(d[color])) if (!keep.has(k)) delete d[color][k];
    const alive = new Set(['w', 'b'].flatMap((c) => Object.keys(d[c]).map((k) => c + '|' + k + '|' + d[c][k].uci)));
    for (const ck of Object.keys(d.srs)) if (!alive.has(ck)) delete d.srs[ck];
  };

  /* ---------------- Révision espacée ---------------- */
  R.cardKey = (color, key, uci) => color + '|' + key + '|' + uci;
  const today = () => new Date().toISOString().slice(0, 10);
  R.newLeft = () => {
    const d = R.data();
    return R.NEW_PER_DAY - (d.newDay === today() ? d.newCount : 0);
  };
  /** Fiches dues + nouvelles (dans l'ordre du répertoire) */
  R.queue = function (color) {
    const d = R.data();
    const now = Date.now();
    const cards = R.walk(color).map((n) => Object.assign(n, { ck: R.cardKey(color, n.key, n.move.uci), srs: d.srs[R.cardKey(color, n.key, n.move.uci)] || null }));
    const due = cards.filter((c) => c.srs && c.srs.due <= now).sort((a, b) => a.srs.due - b.srs.due);
    const fresh = cards.filter((c) => !c.srs);
    return { cards, due, fresh };
  };
  R.grade = function (ck, ok) {
    const d = R.data();
    const s = d.srs[ck] || { box: 0, due: 0, ok: 0, ko: 0 };
    if (!d.srs[ck]) {
      if (d.newDay !== today()) {
        d.newDay = today();
        d.newCount = 0;
      }
      d.newCount++;
    }
    if (ok) {
      s.box = Math.min(R.INTERVALS.length - 1, s.box + 1);
      s.ok++;
      s.due = Date.now() + R.INTERVALS[s.box] * DAY;
    } else {
      s.box = 1;
      s.ko++;
      s.due = Date.now() + 10 * 60000; // à revoir dans 10 minutes
    }
    s.last = Date.now();
    d.srs[ck] = s;
    R.save();
    return s;
  };
  R.nextDueText = function (color) {
    const q = R.queue(color);
    const future = q.cards.filter((c) => c.srs && c.srs.due > Date.now()).map((c) => c.srs.due);
    if (!future.length) return '';
    const t = Math.min(...future) - Date.now();
    if (t < 3600000) return `dans ${Math.max(1, Math.round(t / 60000))} min`;
    if (t < DAY) return `dans ${Math.round(t / 3600000)} h`;
    return `dans ${Math.round(t / DAY)} j`;
  };

  /* ---------------- Tes parties ---------------- */
  /** games : [{ pgn, color, result, t, url, opp, tc }] -> Map clé -> { fen, turn, n, moves: Map(uci -> { uci, san, n, pts }) } */
  R.gameStats = function (games, maxPly) {
    const pos = new Map();
    for (const g of games) {
      let p;
      try {
        p = A.parsePGN(g.pgn, { maxPlies: maxPly || 20 });
      } catch (e) {
        continue;
      }
      if (!p.standardStart) continue;
      g.parsed = p;
      const pts = g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0;
      p.moves.forEach((mv, idx) => {
        const key = R.fenKey(mv.fenBefore);
        let e = pos.get(key);
        if (!e) {
          e = { key, fen: mv.fenBefore, turn: mv.color, n: 0, moves: new Map(), path: p.moves.slice(0, idx).map((x) => x.uci) };
          pos.set(key, e);
        }
        e.n++;
        let m = e.moves.get(mv.uci);
        if (!m) {
          m = { uci: mv.uci, san: mv.san, n: 0, pts: 0 };
          e.moves.set(mv.uci, m);
        }
        m.n++;
        m.pts += pts;
      });
    }
    return pos;
  };

  /**
   * Ajoute au répertoire la ligne d'une partie jusqu'au coup `upto`, puis la correction (finalUci) à cet endroit.
   * Si le répertoire contient déjà un autre coup plus tôt sur cette ligne, rien n'est modifié (conflit).
   */
  R.addLine = function (color, moves, upto, finalUci, finalSan, src) {
    const d = R.data()[color];
    const todo = [];
    for (let k = 0; k < upto; k++) {
      const mv = moves[k];
      if (mv.color !== color) continue;
      const e = d[R.fenKey(mv.fenBefore)];
      if (!e) todo.push(mv);
      else if (e.uci !== mv.uci) return { ok: false, conflictAt: k, expected: e.san };
    }
    for (const mv of todo) d[R.fenKey(mv.fenBefore)] = { uci: mv.uci, san: mv.san, t: Date.now(), src: 'partie' };
    d[R.fenKey(moves[upto].fenBefore)] = { uci: finalUci, san: finalSan, t: Date.now(), src: src || 'correction' };
    R.save();
    return { ok: true, added: todo.length + 1 };
  };

  /** Répertoire proposé à partir de tes coups habituels : [{ fen, key, uci, san, n, total, pts, sans }] */
  R.proposeFromStats = function (color, stats, opts) {
    const minN = (opts && opts.minN) || 2;
    const maxPly = (opts && opts.maxPly) || 16;
    const res = [];
    const seen = new Set();
    const ch = new Chess();
    const rec = (fen, sans) => {
      if (sans.length >= maxPly) return;
      const p = stats.get(R.fenKey(fen));
      if (!p || p.n < minN || seen.has(p.key)) return;
      seen.add(p.key);
      const moves = Array.from(p.moves.values()).sort((a, b) => b.n - a.n);
      if (p.turn === color) {
        const m = moves[0];
        res.push({ fen, key: p.key, uci: m.uci, san: m.san, n: m.n, total: p.n, pts: m.pts, sans });
        ch.load(fen);
        if (ch.move(A.uciMove(m.uci))) rec(ch.fen(), sans.concat(m.san));
      } else {
        for (const m of moves.filter((x) => x.n >= minN).slice(0, 4)) {
          ch.load(fen);
          if (ch.move(A.uciMove(m.uci))) rec(ch.fen(), sans.concat(m.san));
        }
      }
    };
    rec(CC.START_FEN, []);
    return res;
  };

  /** Premier écart au répertoire dans chaque partie (les plus récentes d'abord) */
  R.deviations = function (color, games, limit) {
    const d = R.data()[color];
    if (!Object.keys(d).length) return [];
    const out = [];
    for (const g of games) {
      if (out.length >= (limit || 15)) break;
      const p = g.parsed;
      if (!p || !p.standardStart) continue;
      let followed = 0;
      for (let i = 0; i < p.moves.length; i++) {
        const mv = p.moves[i];
        if (mv.color === color) {
          const e = d[R.fenKey(mv.fenBefore)];
          if (!e) break; // fin de la préparation
          if (e.uci !== mv.uci) {
            out.push({ type: 'forgot', game: g, i, fen: mv.fenBefore, played: mv.san, expected: e.san, label: CC.moveLabel(mv.fenBefore, mv.color), followed });
            break;
          }
          followed++;
        } else if (i + 1 < p.moves.length && !d[R.fenKey(mv.fenAfter)]) {
          if (followed > 0 || (color === 'b' && i === 0)) {
            out.push({ type: 'unprepared', game: g, i, fen: mv.fenAfter, played: mv.san, label: CC.moveLabel(mv.fenBefore, mv.color), followed });
          }
          break;
        }
      }
    }
    return out;
  };

  /** Positions fréquentes de tes parties (à toi de jouer) qui ne sont pas encore dans le répertoire */
  R.gaps = function (color, stats, limit) {
    const d = R.data()[color];
    return Array.from(stats.values())
      .filter((p) => p.turn === color && p.n >= 3 && !d[p.key])
      .sort((a, b) => b.n - a.n)
      .slice(0, limit || 8)
      .map((p) => {
        const top = Array.from(p.moves.values()).sort((a, b) => b.n - a.n)[0];
        return { fen: p.fen, key: p.key, n: p.n, usual: top, path: p.path };
      });
  };

  /* ---------------- Base des maîtres (lichess, sans compte) ---------------- */
  const MX = 'https://explorer.lichess.ovh/masters?fen=';
  const mem = new Map();
  R.masters = async function (fen) {
    const k = R.fenKey(fen);
    if (mem.has(k)) return mem.get(k);
    const ls = CC.store.get('cc.mx.' + k, null);
    if (ls && Date.now() - ls.t < 30 * DAY) {
      mem.set(k, ls.d);
      return ls.d;
    }
    const res = await fetch(MX + encodeURIComponent(fen));
    if (res.status === 429) throw new Error('Base des maîtres : trop de requêtes, réessaie dans une minute.');
    if (!res.ok) throw new Error('Base des maîtres indisponible (' + res.status + ')');
    const j = await res.json();
    const d = {
      total: j.white + j.draws + j.black,
      white: j.white,
      draws: j.draws,
      black: j.black,
      opening: j.opening || null,
      moves: (j.moves || []).slice(0, 8).map((m) => ({ san: m.san, n: m.white + m.draws + m.black, white: m.white, draws: m.draws, black: m.black, rating: m.averageRating })),
    };
    mem.set(k, d);
    const keys = CC.store.keys('cc.mx.');
    if (keys.length > 400) keys.slice(0, 100).forEach((x) => CC.store.del(x));
    CC.store.set('cc.mx.' + k, { t: Date.now(), d });
    return d;
  };

  /* ---------------- Propositions selon les faiblesses ---------------- */
  const LI = (theme, label) => ({ label, url: 'https://lichess.org/training/' + theme });
  R.THEMES = {
    hanging: [LI('hangingPiece', 'Pièces en prise'), LI('trappedPiece', 'Pièces piégées')],
    tactics: [LI('fork', 'Fourchettes'), LI('pin', 'Clouages'), LI('discoveredAttack', 'Attaques à la découverte'), LI('defensiveMove', 'Coups de défense')],
    missed: [LI('advantage', 'Saisir l’avantage'), LI('crushing', 'Punir une gaffe'), LI('mateIn2', 'Mats en 2')],
    endgame: [LI('endgame', 'Finales'), LI('rookEndgame', 'Finales de tours'), { label: 'Exercices de finales (lichess)', url: 'https://lichess.org/practice' }],
    opening: [LI('opening', 'Tactiques d’ouverture')],
    conversion: [LI('advantage', 'Convertir un avantage'), LI('crushing', 'Finir le travail')],
    time: [{ label: 'Puzzle Storm (vitesse)', url: 'https://lichess.org/storm' }, LI('short', 'Puzzles courts')],
    color: [LI('opening', 'Tactiques d’ouverture')],
    blunders: [LI('hangingPiece', 'Pièces en prise'), LI('defensiveMove', 'Coups de défense')],
  };
  R.editorUrl = (fen) => 'https://lichess.org/editor/' + fen.replace(/ /g, '_');
})(window);
