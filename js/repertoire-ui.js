/* Clawd Coach — onglet « Répertoire » : construire ses ouvertures, les réviser (répétition espacée),
 * exercices tirés de ses propres erreurs (avec partie libre contre Stockfish ensuite), écarts dans ses parties. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const A = CC.Analysis;
  const R = CC.Rep;
  const Chess = root.Chess;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const HL = 'rgba(244, 196, 79, .45)';
  const GREEN = '#4EBA65';
  const BLUE = '#6A9BCC';
  const side = (c) => (c === 'w' ? 'Blancs' : 'Noirs');
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const san = (s) => `<b class="san">${CC.sanHTML(s)}</b>`;

  let app = null;
  let board = null;
  const RP = {
    color: CC.store.get('cc.rep.color', 'w'),
    tab: 'tree',
    tpaths: [], // chemins des coups cliquables de l'arbre
    path: [],
    dataToken: 0,
    stats: { w: null, b: null },
    allGames: null,
    loadingGames: null,
    drill: null,
    ex: null,
    undo: null,
    buildReport: null,
    busy: null,
  };

  /* ---------------- Outils ---------------- */
  // (R.line met les coups en cache : ces fonctions sont appelées des centaines de fois par écran)
  function fenOf(path) {
    const l = R.line(path);
    return l.length ? l[l.length - 1].fen : CC.START_FEN;
  }
  function sansOf(path) {
    return R.line(path).map((m) => ({ san: m.san, label: CC.moveLabel(m.fenBefore, m.color), color: m.color }));
  }
  const curFen = () => fenOf(RP.path);
  const turnOf = (fen) => fen.split(' ')[1];
  const uciOf = (mv) => mv.from + mv.to + (mv.promotion || '');

  function movable(fen, only) {
    const ch = new Chess(fen);
    if (ch.game_over() || (only && ch.turn() !== only)) {
      board.setMovable(null);
      return;
    }
    const dests = new Map();
    for (const m of ch.moves({ verbose: true })) {
      if (!dests.has(m.from)) dests.set(m.from, []);
      dests.get(m.from).push(m.to);
    }
    board.setMovable({ color: ch.turn(), dests });
  }
  function lastHL(uci) {
    board.setHighlights(uci ? [{ sq: uci.slice(0, 2), color: HL }, { sq: uci.slice(2, 4), color: HL }] : []);
  }
  function check(fen) {
    const ch = new Chess(fen);
    if (!ch.in_check()) return null;
    for (const sq of ch.SQUARES) {
      const p = ch.get(sq);
      if (p && p.type === 'k' && p.color === ch.turn()) return sq;
    }
    return null;
  }
  function show(fen, animate, last) {
    board.setPosition(fen, animate);
    lastHL(last);
    board.setCheck(check(fen));
  }
  function evalBar(score) {
    const bar = $('#rep-evalbar');
    const fill = $('.evalbar-fill', bar);
    const label = $('.evalbar-label', bar);
    bar.classList.toggle('flipped', board.orientation === 'b');
    if (!score) {
      fill.style.height = '50%';
      label.textContent = '';
      return;
    }
    const wp = score.mate != null ? (score.cp > 0 ? 100 : 0) : CC.clamp(CC.winWhite(score), 3, 97);
    fill.style.height = wp + '%';
    const whiteAhead = score.cp >= 0;
    const whiteSide = board.orientation === 'w' ? 'bottom' : 'top';
    label.className = `evalbar-label ${whiteAhead ? whiteSide : whiteSide === 'bottom' ? 'top' : 'bottom'} ${whiteAhead ? 'on-white' : 'on-black'}`;
    label.textContent = CC.fmtEval(score, true);
  }
  function mood(m, anim) {
    Clawd.set($('#rep-clawd'), m || 'idle', anim === undefined ? 'bob' : anim);
  }

  /* ---------------- Tes parties (3 derniers mois) ---------------- */
  async function ensureGames() {
    if (!app.S.username) return null;
    if (RP.allGames && Date.now() - RP.allGames.at < 300000) return RP.allGames.games;
    if (RP.loadingGames) return RP.loadingGames;
    RP.loadingGames = (async () => {
      const me = app.S.username.toLowerCase();
      const archives = await CC.ChessCom.archives(app.S.username);
      let raw = [];
      for (const u of archives.slice(-3).reverse()) raw = raw.concat(await CC.ChessCom.month(u));
      const games = raw
        .filter((g) => (!g.rules || g.rules === 'chess') && g.pgn)
        .map((g) => {
          const white = g.white.username.toLowerCase() === me;
          if (!white && g.black.username.toLowerCase() !== me) return null;
          const my = white ? g.white : g.black;
          const opp = white ? g.black : g.white;
          return { pgn: g.pgn, color: white ? 'w' : 'b', result: CC.ChessCom.resultCode(my.result), t: g.end_time, url: g.url, opp: opp.username, tc: g.time_control };
        })
        .filter(Boolean)
        .slice(0, 300);
      RP.stats = { w: R.gameStats(games.filter((g) => g.color === 'w')), b: R.gameStats(games.filter((g) => g.color === 'b')) };
      RP.allGames = { at: Date.now(), games };
      return games;
    })();
    try {
      return await RP.loadingGames;
    } finally {
      RP.loadingGames = null;
    }
  }

  /* ---------------- Onglets ---------------- */
  function renderTabs() {
    $$('#rep-tabs .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === RP.tab));
    $$('#rep-color .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.v === RP.color));
    renderTab();
  }
  /** Barre sous l'échiquier : navigation dans l'arbre, ou flèches ◀ ▶ pendant une révision */
  function renderNav() {
    const nav = $('#rep-nav');
    const browse = RP.tab === 'build' || RP.tab === 'tree';
    const drill = RP.tab === 'review' && RP.drill && RP.drill.cards[RP.drill.i];
    nav.hidden = !browse && !drill;
    if (drill) {
      const d = RP.drill;
      const c = d.cards[d.i];
      const at = d.view == null ? c.path.length : d.view;
      nav.innerHTML =
        '<button class="btn btn-sm rv-arrow" data-nav="rv-back" title="Coup précédent (←)"' + (at > 0 ? '' : ' disabled') + '>◀</button>' +
        '<button class="btn btn-sm rv-arrow" data-nav="rv-fwd" title="' + (d.view == null ? (d.state === 'ask' ? 'Montre-moi le coup (→)' : 'Coup suivant (→)') : 'Avancer (→)') + '">▶</button>' +
        '<span class="rv-where">' + (d.view == null ? (d.state === 'done' ? 'Coup trouvé' : 'À toi de jouer') : 'Tu revois le coup ' + at + ' sur ' + c.path.length) + '</span>' +
        '<button class="btn btn-sm" data-nav="flip" title="Retourner l’échiquier">⇅</button>';
    } else if (browse && !nav.querySelector('[data-nav="start"]')) {
      nav.innerHTML =
        '<button class="btn btn-sm" data-nav="start" title="Début (↑)">⏮ Début</button>' +
        '<button class="btn btn-sm" data-nav="back" title="Coup précédent (←)">◀ Retour</button>' +
        '<button class="btn btn-sm" data-nav="flip" title="Retourner l’échiquier">⇅ Retourner</button>';
    }
  }
  function renderTab() {
    const browse = RP.tab === 'build' || RP.tab === 'tree';
    renderNav();
    $('#rep-line').style.visibility = browse ? 'visible' : 'hidden';
    if (RP.tab === 'tree') renderTree(false);
    else if (RP.tab === 'build') renderBuild(false);
    else if (RP.tab === 'review') {
      if (RP.drill) showCard();
      else renderReviewHome();
    } else if (RP.tab === 'ex') {
      if (RP.ex) renderEx();
      else renderExHome();
    } else renderGamesTab();
  }
  function setBody(html, foot) {
    $('#rep-body').innerHTML = html;
    $('#rep-foot').innerHTML = foot || '';
  }

  /* =================== CONSTRUIRE =================== */
  function statsLine() {
    const q = R.queue(RP.color);
    return `<div class="rep-stats"><span><b>${q.cards.length}</b> ${q.cards.length > 1 ? 'coups' : 'coup'} avec les ${side(RP.color)}</span><span><b>${q.due.length}</b> à réviser</span><span><b>${Math.min(q.fresh.length, Math.max(0, R.newLeft()))}</b> nouveaux</span></div>`;
  }

  function renderLine() {
    const moves = sansOf(RP.path);
    let html = `<button class="rl-move${RP.path.length ? '' : ' active'}" data-ply="0">Départ</button>`;
    moves.forEach((m, k) => {
      if (m.color === 'w' || k === 0) html += `<span class="rl-num">${CC.esc(m.label)}</span>`;
      html += `<button class="rl-move${k === moves.length - 1 ? ' active' : ''}" data-ply="${k + 1}">${CC.sanHTML(m.san)}</button>`;
    });
    $('#rep-line').innerHTML = html;
    $('#rep-line').scrollLeft = 1e6;
  }

  function renderBuild(animate) {
    const fen = curFen();
    const color = RP.color;
    if (board.orientation !== color) board.setOrientation(color);
    show(fen, animate, RP.path[RP.path.length - 1]);
    board.setBadge(null);
    board.setHint(null);
    const mine = turnOf(fen) === color;
    const rep = mine ? R.get(color, fen) : null;
    board.setArrows(rep ? [{ from: rep.uci.slice(0, 2), to: rep.uci.slice(2, 4), color: GREEN }] : []);
    movable(fen, null);
    renderLine();
    const sans = sansOf(RP.path).map((m) => m.san);
    const op = A.identifyOpening(sans).opening;
    let html = statsLine();
    if (RP.buildReport && RP.buildReport.color === color) html += buildReportHTML();
    html += `<div class="rep-pos"><div class="rep-op">${op ? CC.esc(op.name) : RP.path.length ? 'Hors des ouvertures répertoriées' : 'Position de départ'}</div><div class="rep-turn${mine ? ' me' : ''}">${mine ? 'À toi de jouer' : 'Coup de l’adversaire'}</div></div>`;
    if (mine) {
      html += rep
        ? `<div class="rep-mine ok"><span>Ton coup ici :</span> ${san(rep.san)} <span class="rep-src">${CC.esc(rep.src || '')}</span><button class="linkbtn" data-why-here>Pourquoi ?</button><button class="linkbtn" data-rm>Retirer</button></div><div class="bubble why-box" id="why-box" hidden></div>`
        : '<div class="rep-mine">Pas encore de coup ici : joue-le sur l’échiquier ou choisis-en un ci-dessous.</div>';
    } else {
      html += '<div class="rep-mine muted">Choisis la réponse adverse à préparer (ou joue-la sur l’échiquier).</div>';
    }
    RP.tpaths = [];
    const after = treeHTML(color, RP.path, 10, 80);
    if (after) html += '<details class="og tree-mini" open><summary><span class="og-name">Suite enregistrée</span></summary>' + after + '</details>';
    html += '<div class="rep-cands" id="rep-cands"><p class="muted small"><span class="cc-spin">✻</span> Je cherche les coups possibles…</p></div>';
    setBody(
      html,
      `<button class="btn btn-sm btn-primary" data-auto>✻ Créer depuis mes parties</button>${presetFor(color) ? '<button class="btn btn-sm" data-preset>📘 Mes répertoires</button>' : ''}${RP.undo && (RP.undo.both || RP.undo.color === color) ? '<button class="btn btn-sm" data-undo>Annuler le dernier changement</button>' : ''}`
    );
    mood(mine && !rep ? 'thinking' : 'idle', 'bob');
    loadPositionData(fen, mine);
  }

  /* =================== POURQUOI CE COUP ? =================== */
  let whyToken = 0;
  /** Explique un coup du répertoire : Stockfish (éval, autres coups, menace adverse si on passait) puis le coach IA */
  async function explainMove(path, uci) {
    const box = $('#why-box');
    if (!box) return;
    const token = ++whyToken;
    box.hidden = false;
    box.innerHTML = '<span class="cc-spin">✻</span> Stockfish regarde la position…';
    const fen = fenOf(path);
    const mover = turnOf(fen);
    const ch = new Chess(fen);
    const mv = ch.move(A.uciMove(uci));
    if (!mv) return;
    const sans = sansOf(path);
    const lineTxt = sans.map((m, k) => (m.color === 'w' || k === 0 ? m.label + ' ' : '') + m.san).join(' ') || 'position de départ';
    const op = A.identifyOpening(sans.map((m) => m.san).concat(mv.san)).opening;
    let alts = '';
    let evalTxt = '';
    let threat = '';
    try {
      const res = await app.engine.analyze(fen, { depth: 14, movetime: 1500, multipv: 3 });
      if (token !== whyToken) return;
      alts = res.lines.map((l) => (A.sanOf(fen, l.pv[0]) || '?') + ' (' + CC.fmtEval(l.score) + ')').join(', ');
      const own = res.lines.find((l) => l.pv[0] === uci);
      let sc = own ? own.score : null;
      if (!sc) {
        const r2 = await app.engine.analyze(ch.fen(), { depth: 14, movetime: 1500, multipv: 1 });
        sc = r2.lines[0] && r2.lines[0].score;
      }
      evalTxt = sc ? CC.fmtEval(sc) : '';
      // Et si on passait son tour ? Le meilleur coup adverse montre ce que notre coup empêche
      if (!new Chess(fen).in_check()) {
        const p = fen.split(' ');
        p[1] = mover === 'w' ? 'b' : 'w';
        p[3] = '-';
        const nf = p.join(' ');
        if (new Chess(nf).moves().length) {
          const r3 = await app.engine.analyze(nf, { depth: 12, movetime: 1000, multipv: 1 });
          if (r3.lines[0]) threat = A.pvToSan(nf, r3.lines[0].pv, 3).join(' ');
        }
      }
    } catch (e) {
      /* Stockfish indisponible : on explique quand même */
    }
    if (token !== whyToken) return;
    const facts =
      '<div class="why-facts">Stockfish : ' + san(mv.san) + (evalTxt ? ' → ' + CC.esc(evalTxt) : '') + (alts ? '<br>Meilleurs coups ici : ' + CC.esc(alts) : '') +
      (threat ? '<br>Si tu passais ton tour, l’adversaire jouerait : <b>' + CC.esc(threat) + '</b>' : '') + '</div>';
    if (!CC.AI.hasKey(app.S.settings)) {
      box.innerHTML = facts + '<div class="muted small">Ajoute une clé Claude ou Gemini dans les Réglages pour que Clawd t’explique l’idée en français.</div>';
      return;
    }
    box.innerHTML = facts + '<div class="why-text"><span class="cc-spin">✻</span> Clawd réfléchit…</div>';
    const prompt = [
      'Ouverture : ' + (op ? op.name : 'inconnue') + '.',
      'Coups joués : ' + lineTxt + '.',
      'Le joueur a les ' + side(RP.color) + ' ; dans son répertoire, il joue ici ' + mv.san + ' (coup des ' + side(mover) + ').',
      'Position avant le coup (FEN) : ' + fen,
      evalTxt ? 'Stockfish : après ' + mv.san + ', évaluation ' + evalTxt + ' (en pions, point de vue des Blancs).' : '',
      alts ? 'Meilleurs coups selon Stockfish dans cette position : ' + alts + '.' : '',
      threat ? 'Si ce camp passait son tour, le meilleur coup adverse serait : ' + threat + '.' : '',
      '',
      'Explique simplement, en 3 phrases maximum (60 mots), l’idée de ' + mv.san + ' : ce qu’il empêche ou ce qu’il prépare. Appuie-toi sur la menace adverse indiquée. Si un autre coup est nettement meilleur selon Stockfish, dis-le en une phrase.',
    ]
      .filter(Boolean)
      .join('\n');
    let acc = '';
    try {
      await CC.AI.ask(app.S.settings, {
        prompt,
        maxTokens: 2000,
        onText: (d) => {
          if (token !== whyToken) return;
          acc += d;
          const t = box.querySelector('.why-text');
          if (t) t.innerHTML = CC.esc(acc);
        },
      });
    } catch (e) {
      const t = box.querySelector('.why-text');
      if (t && token === whyToken) t.innerHTML = '<span class="ko-txt">' + CC.esc(CC.AI.errorText(e)) + '</span>';
    }
  }

  /* =================== MON RÉPERTOIRE (vue façon Chessbook) =================== */
  /** Arbre du répertoire depuis une position : [{ uci, san, mine, kids }] ; kids === null = transposition */
  function subtree(color, fen, depth, seen, budget) {
    // coups et positions filles en cache (R.step, R.childrenOf) : rapide même avec un gros répertoire
    const key = R.fenKey(fen);
    if (seen.has(key)) return null;
    seen.add(key);
    const out = [];
    if (depth <= 0 || budget.n <= 0) return out;
    if (turnOf(fen) === color) {
      const e = R.get(color, fen);
      if (!e) return out;
      const r = R.step(fen, e.uci);
      if (!r) return out;
      budget.n--;
      out.push({ uci: e.uci, san: r.san, mine: true, kids: subtree(color, r.fen, depth - 1, seen, budget) });
      return out;
    }
    const rep = R.data()[color];
    for (const m of R.childrenOf(fen).filter((x) => rep[x.key]).sort(R.pawnFirst)) {
      const r = R.step(fen, m.uci);
      if (!r) continue;
      budget.n--;
      out.push({ uci: m.uci, san: r.san, mine: false, f2: r.fen });
    }
    for (const o of out) o.kids = subtree(color, o.f2, depth - 1, seen, budget);
    const size = (n) => (n.kids ? n.kids.reduce((t, k) => t + 1 + size(k), 0) : 0);
    out.sort((a, b) => size(b) - size(a));
    return out;
  }
  const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  function tmove(node, path, num) {
    const ply = path.length;
    const full = path.concat(node.uci);
    const label = ply % 2 === 0 ? (ply / 2 + 1) + '.' : num ? (Math.floor(ply / 2) + 1) + '…' : '';
    const i = RP.tpaths.push(full) - 1;
    return (label ? '<span class="tv-n">' + label + '</span>' : '') +
      '<button class="tv-m' + (node.mine ? ' mine' : '') + (samePath(full, RP.path) ? ' on' : '') + '" data-ti="' + i + '">' + CC.sanHTML(node.san) + '</button>';
  }
  /** Ligne principale + variantes en retrait (comme un arbre lichess ou Chessbook) */
  function seqHTML(nodes, path, num) {
    let html = '';
    let list = nodes;
    let p = path;
    let n = num;
    while (list && list.length) {
      const main = list[0];
      html += tmove(main, p, n);
      n = false;
      if (list.length > 1) {
        html += '<div class="tv-vars">' + list.slice(1).map((a) =>
          '<div class="tv-var">' + tmove(a, p, true) + (a.kids === null ? '<span class="tv-trans">transposition</span>' : seqHTML(a.kids, p.concat(a.uci), false)) + '</div>'
        ).join('') + '</div>';
        n = true;
      }
      if (main.kids === null) {
        html += '<span class="tv-trans">→ transposition</span>';
        break;
      }
      p = p.concat(main.uci);
      list = main.kids;
    }
    return html;
  }
  function treeHTML(color, path, depth, cap) {
    const budget = { n: cap };
    const nodes = subtree(color, fenOf(path), depth, new Set(), budget) || [];
    if (!nodes.length) return '';
    return '<div class="tv">' + seqHTML(nodes, path, path.length % 2 === 1) + '</div>' +
      (budget.n <= 0 ? '<p class="muted small">… arbre coupé : avance dans une variante pour voir la suite.</p>' : '');
  }

  /** Sections façon Chessbook : on suit la ligne tant qu'elle est unique, puis un bloc repliable par réponse adverse,
   *  avec ta réponse dans le titre (« Contre 2…Nc6 → 3.Bc4 ») ; les blocs s'imbriquent à chaque nouvelle bifurcation. */
  const plyLabel = (ply) => (ply % 2 === 0 ? ply / 2 + 1 + '.' : Math.floor(ply / 2) + 1 + '…');
  const countMine = (n) => (n.mine ? 1 : 0) + (n.kids ? n.kids.reduce((t, k) => t + countMine(k), 0) : 0);
  function secHTML(nodes, path, num, level) {
    let html = '';
    let stem = '';
    let p = path;
    let n = num;
    let list = nodes;
    while (list && list.length === 1) {
      stem += tmove(list[0], p, n);
      n = false;
      p = p.concat(list[0].uci);
      list = list[0].kids;
    }
    if (stem) html += '<div class="tv tv-stem">' + stem + (list === null ? '<span class="tv-trans">→ transposition</span>' : '') + '</div>';
    if (!list || !list.length) return html;
    const ply = p.length;
    for (const nd of list) {
      const ans = nd.kids && nd.kids.length === 1 && nd.kids[0].mine ? nd.kids[0] : null;
      const op = level < 2 ? A.identifyOpening(sansOf(p.concat(nd.uci)).map((m) => m.san)).opening : null;
      const inside = RP.path.length > ply && RP.path[ply] === nd.uci;
      const nMine = countMine(nd);
      html +=
        '<details class="og tsec"' + (inside ? ' open' : '') + '><summary><span class="og-name">Contre ' + plyLabel(ply) + ' ' + CC.sanHTML(nd.san) +
        (ans ? ' <span class="tsec-ans">→ ' + plyLabel(ply + 1) + ' ' + CC.sanHTML(ans.san) + '</span>' : '') +
        (op ? ' <span class="tsec-op">' + CC.esc(op.name.split(':').pop().trim()) + '</span>' : '') +
        '</span><span class="og-n">' + nMine + ' coup' + (nMine > 1 ? 's' : '') + '</span><button class="og-play" data-drill-ti="' + (RP.tpaths.push(p.concat(nd.uci)) - 1) + '" title="Réviser cette ligne">▶</button></summary><div class="tsec-body">' +
        (nd.kids === null ? '<div class="tv tv-stem">' + tmove(nd, p, true) + '<span class="tv-trans">→ transposition</span></div>' : secHTML([nd], p, true, level + 1)) +
        '</div></details>';
    }
    return html;
  }
  function treeSections(color, path) {
    const budget = { n: 1200 };
    const nodes = subtree(color, fenOf(path), 80, new Set(), budget) || [];
    if (!nodes.length) return '';
    return secHTML(nodes, path, path.length % 2 === 1, 0) + (budget.n <= 0 ? '<p class="muted small">… arbre coupé : avance dans une variante pour voir la suite.</p>' : '');
  }

  /** Pièges de mat des packs de cette couleur qui passent par le chemin donné (tous si on est au départ) */
  function trapsFor(color, path) {
    const out = [];
    for (const pre of CC.RepPresets || []) {
      if (pre.color !== color) continue;
      for (const t of pre.traps || []) {
        const p = sanPath(t.line);
        if (path.length && !(p.length > path.length && samePath(p.slice(0, path.length), path))) continue;
        out.push(Object.assign({ path: p, pack: pre }, t));
      }
    }
    return out;
  }

  /** Lignes complètes du répertoire, regroupées par ouverture */
  function openingGroups(color, walked) {
    const nodes = walked || R.walk(color);
    const prefixes = nodes.map((nd) => nd.path.join(' '));
    const groups = new Map();
    for (const nd of nodes) {
      const full = nd.path.concat(nd.move.uci);
      const fs = full.join(' ') + ' ';
      if (prefixes.some((p) => p.startsWith(fs))) continue; // pas une fin de ligne
      const op = A.identifyOpening(nd.sans.concat(nd.move.san)).opening;
      const name = op ? op.name.split(':')[0].trim() : 'Autres lignes';
      if (!groups.has(name)) groups.set(name, { name, lines: [] });
      groups.get(name).lines.push(full);
    }
    return Array.from(groups.values()).sort((a, b) => b.lines.length - a.lines.length);
  }
  /** Une ligne en texte (toucher la ligne lance sa révision) */
  function lineHTML(path) {
    let html = '';
    for (const mv of R.line(path)) {
      if (mv.color === 'w') html += '<span class="tv-n">' + CC.moveLabel(mv.fenBefore, 'w') + '</span>';
      html += '<span class="tv-s' + (mv.color === RP.color ? ' mine' : '') + '">' + CC.sanHTML(mv.san) + '</span>';
    }
    return html;
  }

  function renderTree(animate) {
    RP.tpaths = [];
    const color = RP.color;
    const fen = curFen();
    if (board.orientation !== color) board.setOrientation(color);
    show(fen, animate, RP.path[RP.path.length - 1]);
    board.setBadge(null);
    board.setHint(null);
    movable(fen, null);
    renderLine();
    const mine = turnOf(fen) === color;
    const rep = mine ? R.get(color, fen) : null;
    // flèches : ton coup en vert, réponses adverses préparées en bleu
    const arrows = [];
    if (rep) arrows.push({ from: rep.uci.slice(0, 2), to: rep.uci.slice(2, 4), color: GREEN });
    let replies = [];
    if (!mine) {
      replies = new Chess(fen).moves({ verbose: true }).filter((m) => {
        const c2 = new Chess(fen);
        c2.move(m);
        return !!R.get(color, c2.fen());
      });
      replies.slice(0, 6).forEach((m) => arrows.push({ from: m.from, to: m.to, color: BLUE }));
    }
    board.setArrows(arrows);
    const q = R.queue(color);
    const size = R.size(color);
    const fresh = Math.min(q.fresh.length, Math.max(0, R.newLeft()));
    const op = A.identifyOpening(sansOf(RP.path).map((m) => m.san)).opening;
    const groups = size ? openingGroups(color, q.cards) : [];
    let html = '';
    if (!size) {
      html += '<div class="tree-empty"><p><b>Ton répertoire ' + side(color) + ' est vide.</b></p><p class="muted">Ajoute le répertoire conseillé en un clic, crée-le depuis tes parties, ou joue tes coups dans « Construire ».</p></div>';
    } else {
      html += '<div class="tree-sum">' +
        '<div><b>' + size + '</b><span>positions</span></div>' +
        '<div><b>' + groups.reduce((t, g) => t + g.lines.length, 0) + '</b><span>lignes</span></div>' +
        '<div class="' + (q.due.length ? 'due' : '') + '"><b>' + q.due.length + '</b><span>à réviser</span></div>' +
        '<div><b>' + fresh + '</b><span>nouveaux</span></div></div>';
      html += '<div class="rep-pos"><div class="rep-op">' + (op ? CC.esc(op.name) : RP.path.length ? 'Hors des ouvertures répertoriées' : 'Position de départ') + '</div><div class="rep-turn' + (mine ? ' me' : '') + '">' + (mine ? 'À toi de jouer' : 'Coup de l’adversaire') + '</div></div>';
      if (mine) {
        html += rep
          ? '<div class="rep-mine ok"><span>Ton coup ici :</span> ' + san(rep.san) + '<button class="linkbtn" data-why-here>Pourquoi ?</button></div><div class="bubble why-box" id="why-box" hidden></div>'
          : '<div class="rep-mine">Aucun coup prévu ici. <button class="linkbtn" data-edit>Ajoute-le dans « Construire »</button></div>';
      } else {
        html += replies.length
          ? '<div class="rep-mine"><span>Réponses adverses préparées :</span> ' + replies.map((m) => san(m.san)).join(' ') + '</div>'
          : '<div class="rep-mine muted">Aucune réponse adverse préparée ici.</div>';
      }
      // Les pièges de mat (gambits « début de partie ») qui passent par cette position : un toucher = révision
      const traps = trapsFor(color, RP.path);
      RP.traps = traps;
      if (traps.length) {
        html +=
          '<details class="og traps"' + (RP.trapsClosed ? '' : ' open') + '><summary><span class="og-name">⚔️ Tes pièges de mat' + (RP.path.length ? ' depuis ici' : '') + '</span><span class="og-n">' + traps.length + '</span></summary><div class="trap-list">' +
          traps
            .map(
              (x, i) =>
                '<div class="trap" data-drill-trap="' + i + '" title="Réviser ce piège"><div class="trap-h"><span class="ol-play">▶</span><b>' + CC.esc(x.name) + '</b>' +
                (/#$/.test(x.line) ? '<span class="tag good">mat</span>' : '') + (x.pack.extra ? '<span class="tag warn">gambit en plus</span>' : '') + '</div>' +
                '<div class="trap-d">' + CC.esc(x.desc) + '</div><div class="trap-l">' + lineHTML(x.path) + '</div></div>'
            )
            .join('') +
          '</div></details>';
      }
      const tree = treeSections(color, RP.path);
      html += '<h4 class="tree-h">' + (RP.path.length ? 'La suite dans ton répertoire' : 'Tout ton répertoire') + '</h4>';
      html += tree || '<p class="muted small">Rien d’enregistré après cette position.</p>';
      html += '<h4 class="tree-h">Tes ouvertures (' + groups.length + ')</h4><div class="og-list">';
      RP.groups = groups;
      RP.tlines = [];
      groups.forEach((g, gi) => {
        const open = RP.path.length && g.lines.some((l) => l.length >= RP.path.length && samePath(l.slice(0, RP.path.length), RP.path));
        html += '<details class="og og-g"' + (open ? ' open' : '') + '><summary data-drill-group="' + gi + '" title="Réviser ' + CC.esc(g.name) + '"><span class="og-name">' + CC.esc(g.name) + '</span><span class="og-n">' + g.lines.length + ' ligne' + (g.lines.length > 1 ? 's' : '') + '</span><span class="og-play">▶ Réviser</span><span class="og-chev" data-og-toggle title="Voir les coups">▾</span></summary><div class="og-lines">' +
          g.lines.map((l) => '<div class="og-line" data-drill-line="' + (RP.tlines.push({ path: l, name: g.name }) - 1) + '" title="Réviser cette ligne"><span class="ol-play">▶</span>' + lineHTML(l) + '</div>').join('') + '</div></details>';
      });
      html += '</div>';
    }
    const todo = q.due.length + fresh;
    setBody(
      html,
      (size && RP.path.length ? '<button class="btn btn-sm btn-primary" data-drill-here>▶ Réviser cette ligne</button>' : '') +
        (size ? '<button class="btn btn-sm' + (RP.path.length ? '' : ' btn-primary') + '" data-start-review>' + (RP.path.length ? 'Tout réviser' : 'Réviser') + (todo ? ' (' + todo + ')' : '') + '</button>' : '') +
        '<button class="btn btn-sm" data-edit>✏️ Modifier ici</button>' +
        (presetFor(color) ? '<button class="btn btn-sm" data-preset>📘 Mes répertoires</button>' : '') +
        (RP.undo && (RP.undo.both || RP.undo.color === color) ? '<button class="btn btn-sm" data-undo>Annuler le dernier changement</button>' : '')
    );
    mood(size ? 'happy' : 'meh', 'bob');
  }

  function buildReportHTML() {
    const b = RP.buildReport;
    let h = `<div class="rep-report"><b>Répertoire créé depuis tes parties :</b> ${b.added} ${b.added > 1 ? 'coups ajoutés' : 'coup ajouté'}${b.improved.length ? `, dont <b>${b.improved.length}</b> ${b.improved.length > 1 ? 'améliorés' : 'amélioré'} par Stockfish` : ''}.`;
    if (b.improved.length) {
      h += '<ul>' + b.improved.slice(0, 6).map((x) => `<li>Au lieu de ${san(x.p.san)} (ton habitude, −${Math.round(x.r.loss)} %), joue ${san(x.r.bestSan)} <button class="linkbtn" data-goto="${CC.esc(JSON.stringify(x.p.path || []))}">voir</button></li>`).join('') + '</ul>';
    }
    return h + '<button class="linkbtn" data-hide-report>Masquer</button></div>';
  }

  async function loadPositionData(fen, mine) {
    const token = ++RP.dataToken;
    const d = { masters: null, engine: null, games: null, err: null };
    const render = () => {
      if (token === RP.dataToken && RP.tab === 'build') renderCands(fen, mine, d);
    };
    const st = RP.stats[RP.color];
    if (st) d.games = st.get(R.fenKey(fen)) || null;
    else if (app.S.username) {
      ensureGames()
        .then(() => {
          if (token !== RP.dataToken) return;
          d.games = RP.stats[RP.color].get(R.fenKey(fen)) || null;
          render();
        })
        .catch(() => {});
    }
    render();
    R.masters(fen)
      .then((m) => {
        d.masters = m;
        render();
      })
      .catch((e) => {
        d.err = e.message;
        render();
      });
    try {
      const res = await app.engine.analyzeLatest(fen, { depth: 13, movetime: 1500, multipv: 4 });
      if (token !== RP.dataToken) return;
      d.engine = res.lines;
      if (RP.tab === 'build') evalBar(res.lines[0] && res.lines[0].score);
      render();
    } catch (e) {
      /* demande périmée */
    }
  }

  function wdlBar(m) {
    const n = m.white + m.draws + m.black || 1;
    return `<span class="wdl" title="Blancs ${pct(m.white, n)} % · nulles ${pct(m.draws, n)} % · Noirs ${pct(m.black, n)} %"><i class="w" style="width:${(m.white / n) * 100}%"></i><i class="d" style="width:${(m.draws / n) * 100}%"></i><i class="b" style="width:${(m.black / n) * 100}%"></i></span>`;
  }

  function renderCands(fen, mine, d) {
    const box = $('#rep-cands');
    if (!box) return;
    const rows = new Map();
    const rowFor = (s, uci) => {
      const k = s.replace(/[+#]/g, '');
      if (!rows.has(k)) rows.set(k, { san: s, uci, mx: null, eng: null, games: null });
      const r = rows.get(k);
      if (!r.uci && uci) r.uci = uci;
      return r;
    };
    if (d.masters) {
      for (const m of d.masters.moves) {
        const mv = new Chess(fen).move(m.san);
        if (mv) rowFor(mv.san, uciOf(mv)).mx = m;
      }
    }
    if (d.engine) {
      d.engine.forEach((l, k) => {
        if (!l.pv[0]) return;
        const s = A.sanOf(fen, l.pv[0]);
        if (s) rowFor(s, l.pv[0]).eng = { score: l.score, rank: k };
      });
    }
    if (d.games) for (const m of d.games.moves.values()) rowFor(m.san, m.uci).games = m;
    const rep = mine ? R.get(RP.color, fen) : null;
    if (rep) rowFor(rep.san, rep.uci);
    const list = Array.from(rows.values())
      .sort((a, b) => {
        const ra = rep && a.uci === rep.uci ? 1 : 0;
        const rb = rep && b.uci === rep.uci ? 1 : 0;
        return rb - ra || ((b.mx && b.mx.n) || 0) - ((a.mx && a.mx.n) || 0) || ((a.eng ? a.eng.rank : 9) - (b.eng ? b.eng.rank : 9)) || ((b.games && b.games.n) || 0) - ((a.games && a.games.n) || 0);
      })
      .slice(0, 9);
    if (!list.length) {
      box.innerHTML = `<p class="muted small">${d.err ? CC.esc(d.err) : '<span class="cc-spin">✻</span> Je cherche les coups possibles…'}</p>`;
      return;
    }
    const total = d.masters ? d.masters.total : 0;
    const ch = new Chess(fen);
    let html = `<table class="tbl cands"><thead><tr><th>Coup</th><th title="Parties de maîtres (base lichess)">Maîtres</th><th>Moteur</th><th class="num" title="${mine ? 'Dans tes parties : combien de fois tu as joué ce coup, et ton score' : 'Dans tes parties : combien de fois tes adversaires l’ont joué contre toi, et ton score'}">Toi</th><th></th></tr></thead><tbody>`;
    for (const r of list) {
      const isRep = rep && r.uci === rep.uci;
      const mxCell = r.mx && total ? `<span class="mx-pct">${pct(r.mx.n, total)} %</span>${wdlBar(r.mx)}` : '<span class="muted">—</span>';
      const engCell = r.eng ? `<span class="eval-chip ${r.eng.score.cp >= 0 ? 'w' : 'b'}">${CC.fmtEval(r.eng.score)}</span>${r.eng.rank === 0 ? ' <span class="star-best" title="Meilleur coup Stockfish">★</span>' : ''}` : '<span class="muted">—</span>';
      const gCell = r.games ? `×${r.games.n} <span class="muted">· ${pct(r.games.pts, r.games.n)} %</span>` : '<span class="muted">—</span>';
      let act;
      if (mine) act = isRep ? '<span class="tag good">✓ ton coup</span>' : `<button class="btn btn-sm" data-pick="${r.uci}">Choisir</button>`;
      else {
        ch.load(fen);
        const mv = ch.move(A.uciMove(r.uci));
        const ready = mv && R.get(RP.color, ch.fen());
        act = ready ? '<span class="tag good">✓ prêt</span>' : '<span class="tag warn">à préparer</span>';
      }
      html += `<tr class="${isRep ? 'is-rep' : ''}"><td><button class="cand-san" data-go="${r.uci}">${CC.sanHTML(r.san)}</button></td><td class="mx">${mxCell}</td><td>${engCell}</td><td class="num">${gCell}</td><td class="act">${act}</td></tr>`;
    }
    html += '</tbody></table>';
    if (d.masters) html += `<p class="card-foot">${total.toLocaleString('fr-FR')} parties de maîtres dans cette position${d.masters.opening ? ` · ${CC.esc(d.masters.opening.name)}` : ''} · base lichess</p>`;
    else if (d.err) html += `<p class="card-foot">${CC.esc(d.err)}</p>`;
    box.innerHTML = html;
  }

  function goPath(path, animate) {
    RP.path = path.slice();
    if (RP.tab === 'tree') renderTree(animate);
    else renderBuild(animate);
  }

  function buildMove(from, to, promo) {
    const fen = curFen();
    const ch = new Chess(fen);
    const mv = ch.move({ from, to, promotion: promo || 'q' });
    if (!mv) return;
    const uci = uciOf(mv);
    if (turnOf(fen) === RP.color) {
      const prev = R.get(RP.color, fen);
      if (!prev || prev.uci !== uci) pick(fen, uci, mv.san, prev, true);
    }
    RP.path.push(uci);
    app.sound(mv);
    renderBuild(true);
  }

  function pick(fen, uci, s, prev, silent) {
    const snap = R.snapshot(RP.color);
    R.set(RP.color, fen, uci, s);
    if (prev) {
      R.prune(RP.color);
      R.save();
    }
    RP.undo = { color: RP.color, snap };
    app.toast(prev ? `Ton coup ici devient ${CC.esc(s)} (au lieu de ${CC.esc(prev.san)}). <button class="linkbtn" data-undo>Annuler</button>` : `${CC.esc(s)} ajouté à ton répertoire ✓`);
    if (!silent) renderBuild(false);
  }

  /* ---------------- Création automatique depuis tes parties ---------------- */
  async function autoBuild() {
    if (RP.busy) return;
    const color = RP.color;
    if (!app.S.username) {
      app.toast('Indique d’abord ton pseudo chess.com dans « Mes parties ».');
      return;
    }
    RP.busy = true;
    setBody(`<div class="cc-term"><div class="cc-term-line"><span class="cc-spin">✻</span> <span class="cc-verb" id="rep-busy">Je récupère tes parties…</span></div></div>`, '');
    mood('thinking', 'walk');
    try {
      await ensureGames();
      const props = R.proposeFromStats(color, RP.stats[color], { minN: 2, maxPly: 16 });
      if (!props.length) {
        app.toast(`Pas assez de parties avec les ${side(color)} pour en tirer un répertoire.`);
        return;
      }
      $('#rep-busy').textContent = `Stockfish vérifie tes ${props.length} coups habituels…`;
      const opts = { depth: 12, movetime: 900 };
      const results = await app.pool.run(props, app.threadCount(), async (p, eng) => {
        const res = await eng.analyze(p.fen, Object.assign({ multipv: 3 }, opts));
        const best = res.lines[0];
        if (!best || !best.pv[0]) return null;
        const wpBest = CC.winFor(best.score, color);
        let wp;
        const line = res.lines.find((l) => l.pv[0] === p.uci);
        if (line) wp = CC.winFor(line.score, color);
        else {
          const ch = new Chess(p.fen);
          if (!ch.move(A.uciMove(p.uci))) return null;
          const r2 = await eng.analyze(ch.fen(), Object.assign({ multipv: 1 }, opts));
          wp = r2.lines[0] ? CC.winFor(r2.lines[0].score, color) : wpBest;
        }
        return { loss: Math.max(0, wpBest - wp), bestUci: best.pv[0], bestSan: A.sanOf(p.fen, best.pv[0]) };
      });
      const snap = R.snapshot(color);
      let added = 0;
      const improved = [];
      props.forEach((p, k) => {
        const r = results[k];
        if (!r || R.get(color, p.fen)) return; // on garde tes choix existants
        p.path = (() => {
          const ch = new Chess();
          const out = [];
          for (const s of p.sans) {
            const mv = ch.move(s);
            if (!mv) break;
            out.push(uciOf(mv));
          }
          return out;
        })();
        if (r.loss >= 7 && r.bestUci) {
          R.set(color, p.fen, r.bestUci, r.bestSan, 'moteur');
          improved.push({ p, r });
        } else R.set(color, p.fen, p.uci, p.san, 'tes parties');
        added++;
      });
      R.prune(color);
      R.save();
      RP.undo = { color, snap };
      RP.buildReport = { color, added, improved };
      RP.path = [];
    } catch (e) {
      app.toast(CC.esc(e.message || String(e)));
    } finally {
      RP.busy = false;
      renderTab();
    }
  }

  /* ---------------- Répertoires tout prêts ---------------- */
  const presetFor = (color) => (CC.RepPresets || []).find((p) => p.color === color) || null;
  const presetsFor = (color) => (CC.RepPresets || []).filter((p) => p.color === color);
  /** Où en est ce pack dans ton répertoire : coups déjà identiques, différents, absents */
  function presetState(pre) {
    const d = R.data()[pre.color];
    let same = 0;
    let diff = 0;
    let missing = 0;
    const seen = new Set();
    for (const line of pre.lines) {
      for (const mv of R.line(line)) {
        if (mv.color !== pre.color) continue;
        const k = R.fenKey(mv.fenBefore);
        if (seen.has(k)) continue;
        seen.add(k);
        const e = d[k];
        if (!e) missing++;
        else if (e.uci === mv.uci) same++;
        else diff++;
      }
    }
    return { same, diff, missing, total: seen.size };
  }
  function renderPresets() {
    const list = presetsFor(RP.color);
    let html = '<div class="rp-head"><b>Répertoires ' + side(RP.color) + '</b><button class="linkbtn" data-presets-close>Retour</button></div>';
    html += '<p class="muted small">Construits à partir de tes parties : tes ouvertures avec leurs pièges de mat, plus un gambit en plus. « Ajouter » complète ton répertoire sans toucher à tes coups ; « Remplacer » met les coups du pack à la place des tiens là où ils diffèrent (tu peux annuler).</p>';
    for (const pre of list) {
      const st = presetState(pre);
      const full = st.same === st.total;
      html += '<div class="rp-card' + (pre.variant || pre.extra ? ' gambit' : '') + '"><div class="rp-title">' + (pre.variant || pre.extra ? '⚔️ ' : '📘 ') + CC.esc(pre.name) + '</div>' +
        '<div class="rp-desc">' + CC.esc(pre.desc) + '</div>' +
        '<div class="rp-meta">' + pre.lines.length + ' lignes · ' + (pre.traps ? pre.traps.length + ' pièges de mat · ' : '') + st.total + ' coups à toi · ' +
        (full ? '<b class="ok">déjà dans ton répertoire ✓</b>' : st.same + ' déjà identiques' + (st.diff ? ', <b>' + st.diff + ' différents des tiens</b>' : '') + (st.missing ? ', ' + st.missing + ' nouveaux' : '')) + '</div>' +
        '<div class="rp-btns">' +
        (st.missing && !full ? '<button class="btn btn-sm' + (pre.variant ? '' : ' btn-primary') + '" data-preset-add="' + pre.id + '">Ajouter</button>' : '') +
        (st.diff ? '<button class="btn btn-sm' + (pre.variant ? ' btn-primary' : '') + '" data-preset-replace="' + pre.id + '">Remplacer mes coups</button>' : '') +
        '<button class="btn btn-sm" data-preset-drill="' + pre.id + '">▶ Réviser ces lignes</button></div></div>';
    }
    setBody(html, '');
    mood('thinking', 'bob');
  }
  function applyPreset(id, replace) {
    const pre = (CC.RepPresets || []).find((p) => p.id === id);
    if (!pre) return;
    const snap = R.snapshot(pre.color);
    const r = R.addPreset(pre, { replace });
    if (!r.added && !r.replaced) {
      app.toast('Rien à changer : ces coups sont déjà dans ton répertoire.');
      return;
    }
    RP.undo = { color: pre.color, snap };
    RP.presets = false;
    RP.tab = 'tree';
    RP.path = [];
    app.toast(CC.esc(pre.name) + ' : ' + (r.added ? r.added + ' coups ajoutés' : '') + (r.added && r.replaced ? ', ' : '') + (r.replaced ? r.replaced + ' remplacés' : '') + '. <button class="linkbtn" data-undo>Annuler</button>');
    renderTabs();
  }
  function addPreset() {
    const pre = presetFor(RP.color);
    if (!pre) return;
    const snap = R.snapshot(pre.color);
    const r = R.addPreset(pre);
    if (!r.added) {
      app.toast('Ce répertoire est déjà dans le tien (ou en conflit avec tes coups).');
      return;
    }
    RP.undo = { color: pre.color, snap };
    app.toast(`Ajouté : ${CC.esc(pre.name)}, ${r.added} coups${r.skipped ? ` (${r.skipped} lignes ignorées car tu y joues autre chose)` : ''}. <button class="linkbtn" data-undo>Annuler</button>`);
    renderTab();
  }

  function undo() {
    const u = RP.undo;
    if (!u) return;
    if (u.both) {
      for (const c of ['w', 'b']) R.restore(c, u.both[c]);
    } else {
      R.restore(u.color, u.snap);
      R.prune(u.color);
    }
    R.save();
    RP.undo = null;
    RP.buildReport = null;
    app.toast('Changement annulé.');
    renderTab();
  }

  /* =================== RÉVISER (répétition espacée) =================== */
  function renderReviewHome() {
    const q = R.queue(RP.color);
    const fresh = Math.min(q.fresh.length, Math.max(0, R.newLeft()));
    show(CC.START_FEN, false, null);
    board.setArrows([]);
    board.setBadge(null);
    board.setMovable(null);
    evalBar(null);
    mood(q.due.length ? 'happy' : 'idle', 'bob');
    const next = R.nextDueText(RP.color);
    setBody(
      `<div class="rep-big">
        <div class="rep-big-n">${q.due.length + fresh}</div>
        <div>${q.due.length + fresh > 1 ? 'coups à travailler' : 'coup à travailler'} avec les ${side(RP.color)}</div>
        <div class="muted small">${q.due.length} à revoir · ${fresh} nouveaux (${R.NEW_PER_DAY} par jour au maximum)${next ? ` · prochaine révision ${next}` : ''}</div>
      </div>
      <p class="rep-help">Je joue les coups de ton adversaire, tu retrouves les tiens. Un coup bien su revient de plus en plus tard (1, 3, 7, 16 jours…), un coup oublié revient tout de suite.</p>
      ${q.cards.length ? '' : '<p class="muted">Ton répertoire est vide : construis-le d’abord (onglet « Construire »), ou crée-le depuis tes parties.</p>'}`,
      q.due.length + fresh ? '<button class="btn btn-primary btn-xl" data-start-review>Commencer la révision</button>' : '<button class="btn btn-wide" data-tab-go="build">Construire mon répertoire</button>'
    );
  }

  function startReview() {
    const q = R.queue(RP.color);
    const cards = q.due.concat(q.fresh.slice(0, Math.max(0, R.newLeft()))).slice(0, 20);
    if (!cards.length) {
      app.toast('Rien à réviser pour l’instant 🎉');
      return;
    }
    RP.drill = { cards, i: 0, ok: 0, ko: 0, state: 'ask' };
    RP.tab = 'review';
    renderTabs();
  }

  /* ---------- Révision d'une ligne précise (comme « Practice » dans Chessbook) ---------- */
  /** Cartes le long de lignes (chemins uci depuis le départ) : à chaque coup du joueur, le coup attendu est celui de la ligne.
   *  Si ce coup est aussi celui du répertoire, la réponse compte pour la répétition espacée. */
  function lineCards(paths) {
    const color = RP.color;
    const srs = R.data().srs;
    const seen = new Set();
    const cards = [];
    for (const path of paths) {
      const sans = [];
      const moves = R.line(path);
      for (let k = 0; k < moves.length; k++) {
        const fen = moves[k].fenBefore;
        const mv = moves[k];
        if (mv.color === color) {
          const key = R.fenKey(fen);
          const uci = mv.uci;
          const e = R.get(color, fen);
          const ck = e && e.uci === uci ? R.cardKey(color, key, uci) : null;
          if (!seen.has(key + '|' + uci)) {
            seen.add(key + '|' + uci);
            cards.push({ fen, key, path: path.slice(0, k), sans: sans.slice(), move: { uci, san: mv.san }, ck, srs: ck ? srs[ck] || null : null });
          }
        }
        sans.push(mv.san);
      }
    }
    return cards;
  }
  /** Toutes les lignes du répertoire qui passent par ce chemin, du départ jusqu'au bout de chaque ligne */
  function branchPaths(path) {
    const out = [];
    const rec = (nodes, p) => {
      for (const n of nodes) {
        const p2 = p.concat(n.uci);
        if (!n.kids || !n.kids.length) out.push(p2);
        else rec(n.kids, p2);
      }
    };
    const nodes = subtree(RP.color, fenOf(path), 80, new Set(), { n: 3000 }) || [];
    if (nodes.length) rec(nodes, path.slice());
    else out.push(path.slice());
    return out;
  }
  function lineTitle(path) {
    const sans = sansOf(path);
    const op = A.identifyOpening(sans.map((m) => m.san)).opening;
    if (op) return op.name;
    return sans.slice(-4).map((m) => (m.color === 'w' ? m.label + ' ' : '') + m.san).join(' ') || 'Ligne';
  }
  const sanPath = (line) => R.line(line).map((m) => m.uci);
  function startLineReview(paths, title) {
    const cards = lineCards(paths);
    if (!cards.length) {
      app.toast('Aucun coup à toi dans cette ligne.');
      return;
    }
    RP.drill = { cards: cards.slice(0, 60), i: 0, ok: 0, ko: 0, state: 'ask', title, src: { paths, title } };
    RP.lastDrillSrc = RP.drill.src;
    RP.tab = 'review';
    renderTabs();
  }

  function showCard() {
    const d = RP.drill;
    const c = d.cards[d.i];
    if (!c) return finishReview();
    d.state = 'ask';
    d.pause = false;
    d.view = null;
    d.msg = null;
    whyToken++;
    board.setOrientation(RP.color);
    board.setArrows([]);
    board.setBadge(null);
    board.setHint(null);
    evalBar(null);
    const prev = c.path.slice(0, -1);
    if (c.path.length) {
      show(fenOf(prev), false, prev[prev.length - 1]);
      board.setMovable(null);
      setTimeout(() => {
        if (RP.drill !== d || d.cards[d.i] !== c || d.view != null) return;
        show(c.fen, true, c.path[c.path.length - 1]);
        movable(c.fen, RP.color);
      }, 380);
    } else {
      show(c.fen, false, null);
      movable(c.fen, RP.color);
    }
    renderCardPanel();
  }

  function renderCardPanel(extra) {
    const d = RP.drill;
    const c = d.cards[d.i];
    if (extra !== undefined) d.msg = extra || null;
    const at = d.view == null ? c.path.length : d.view;
    // la ligne jouée : chaque coup se touche pour y revenir (comme les flèches ◀ ▶)
    const line = c.path.length
      ? sansOf(c.path).map((m, k) => (m.color === 'w' || k === 0 ? `<span class="rl-num">${CC.esc(m.label)}</span>` : '') + `<button class="dl-m${k + 1 === at && d.view != null ? ' on' : ''}${m.color === RP.color ? ' mine' : ''}" data-dv="${k + 1}">${CC.sanHTML(m.san)}</button>`).join(' ')
      : 'Position de départ';
    const op = A.identifyOpening(c.sans).opening;
    const viewing = d.view != null;
    const msg = viewing
      ? (d.viewMsg ? d.viewMsg + ' ' : '') + `<b>Tu revois la ligne</b> (coup ${at} sur ${c.path.length}). ${turnOf(fenOf(c.path.slice(0, at))) === RP.color ? 'Rejoue ton coup, ou ' : ''}▶ pour avancer.`
      : d.msg || `<b>À toi !</b> Quel est ton coup avec les ${side(RP.color)} ?`;
    setBody(
      `<div class="drill-prog"><span>${d.title ? `<b>${CC.esc(d.title)}</b> · ` : ''}Coup ${d.i + 1} / ${d.cards.length}</span><span class="muted">${d.ok} ✓ · ${d.ko} ✗</span></div>
      <div class="progress"><div class="progress-fill" style="width:${(d.i / d.cards.length) * 100}%"></div></div>
      <div class="bubble drill-bubble">${msg}
        <div class="drill-line">${line}</div>${op ? `<div class="muted small">${CC.esc(op.name)}</div>` : ''}</div>
      <div class="bubble why-box" id="why-box" hidden></div>`,
      `${viewing ? '<button class="btn btn-sm btn-primary" data-rv-live>Revenir au coup à trouver</button>' : d.state === 'ask' ? '<button class="btn btn-sm" data-reveal>Je ne sais plus</button>' : '<button class="btn btn-sm" data-why>Pourquoi ce coup ?</button>'}${!viewing && d.state === 'done' ? '<button class="btn btn-sm btn-primary" data-next-card>Continuer</button>' : ''}<button class="btn btn-sm btn-ghost" data-stop-review>Arrêter</button>`
    );
    renderNav();
    if (!d.msg && !viewing) mood('thinking', 'bob');
  }

  /* ---------- Flèches ◀ ▶ : revoir les coups de la ligne pendant la révision ---------- */
  /** Remet l'échiquier sur le coup à trouver (ou sur le coup trouvé) */
  function liveBoard() {
    const d = RP.drill;
    const c = d.cards[d.i];
    d.view = null;
    if (d.navPause) {
      d.navPause = false;
      d.pause = false;
    }
    board.setBadge(null);
    if (d.state === 'done') {
      const ch = new Chess(c.fen);
      ch.move(A.uciMove(c.move.uci));
      show(ch.fen(), false, c.move.uci);
      board.setArrows([]);
      board.setMovable(null);
    } else {
      show(c.fen, false, c.path[c.path.length - 1]);
      board.setArrows(d.state === 'fix' ? [{ from: c.move.uci.slice(0, 2), to: c.move.uci.slice(2, 4), color: GREEN }] : []);
      movable(c.fen, RP.color);
    }
    renderCardPanel();
  }
  /** Montre la position après k coups de la ligne ; si c'était à toi de jouer, tu peux rejouer ton coup */
  function viewPly(k, animate) {
    const d = RP.drill;
    const c = d.cards[d.i];
    if (!c) return;
    k = Math.max(0, Math.min(k, c.path.length));
    d.viewMsg = null;
    if (k === c.path.length) return liveBoard();
    d.view = k;
    d.pause = true; // pas de passage automatique au coup suivant pendant qu'on revoit la ligne
    d.navPause = true;
    const p = c.path.slice(0, k);
    const fen = fenOf(p);
    show(fen, !!animate, p[p.length - 1]);
    board.setArrows([]);
    board.setBadge(null);
    if (turnOf(fen) === RP.color) movable(fen, RP.color);
    else board.setMovable(null);
    renderCardPanel();
  }
  function stepBack() {
    const d = RP.drill;
    if (!d || !d.cards[d.i]) return;
    const at = d.view == null ? d.cards[d.i].path.length : d.view;
    if (at > 0) viewPly(at - 1, false);
  }
  function stepForward() {
    const d = RP.drill;
    if (!d) return;
    const c = d.cards[d.i];
    if (!c) return;
    if (d.view != null) {
      const k = d.view + 1;
      const mv = new Chess(fenOf(c.path.slice(0, d.view))).move(A.uciMove(c.path[d.view]));
      if (mv) app.sound(mv);
      if (k >= c.path.length) liveBoard();
      else viewPly(k, true);
      return;
    }
    if (d.state === 'ask') return reveal();
    if (d.state === 'fix') return reviewMove(c.move.uci.slice(0, 2), c.move.uci.slice(2, 4), c.move.uci[4]);
    d.i++;
    showCard();
  }
  /** Coup joué sur une position passée de la ligne : on vérifie sans toucher à la répétition espacée */
  function replayMove(from, to, promo) {
    const d = RP.drill;
    const c = d.cards[d.i];
    const k = d.view;
    const fen = fenOf(c.path.slice(0, k));
    const mv = new Chess(fen).move({ from, to, promotion: promo || 'q' });
    if (!mv) return;
    const exp = c.path[k];
    if (uciOf(mv) === exp) {
      app.sound(mv);
      viewPly(k + 1, true);
      // la réponse adverse suit toute seule, comme pendant la révision
      if (d.view != null && d.view < c.path.length && turnOf(fenOf(c.path.slice(0, d.view))) !== RP.color) {
        setTimeout(() => {
          if (RP.drill !== d || d.view !== k + 1) return;
          const m2 = new Chess(fenOf(c.path.slice(0, k + 1))).move(A.uciMove(c.path[k + 1]));
          if (m2) app.sound(m2);
          viewPly(k + 2, true);
        }, 450);
      }
    } else {
      const good = new Chess(fen).move(A.uciMove(exp));
      const x = new Chess(fen);
      x.move({ from, to, promotion: promo || 'q' });
      show(x.fen(), true, uciOf(mv));
      board.setBadge({ sq: mv.to, cls: 'mistake' });
      board.setMovable(null);
      setTimeout(() => {
        if (RP.drill !== d || d.view !== k) return;
        show(fen, false, c.path[k - 1]);
        board.setBadge(null);
        board.setArrows([{ from: exp.slice(0, 2), to: exp.slice(2, 4), color: GREEN }]);
        movable(fen, RP.color);
        d.viewMsg = good ? `<span class="ko-txt">✗ Ici, ton coup était ${san(good.san)}.</span>` : null;
        renderCardPanel();
      }, 700);
    }
  }

  function reviewMove(from, to, promo) {
    const d = RP.drill;
    if (d.view != null) return replayMove(from, to, promo);
    const c = d.cards[d.i];
    const ch = new Chess(c.fen);
    const mv = ch.move({ from, to, promotion: promo || 'q' });
    if (!mv) return;
    show(ch.fen(), true, uciOf(mv));
    board.setMovable(null);
    app.sound(mv);
    if (uciOf(mv) === c.move.uci) {
      const first = d.state === 'ask';
      if (first) {
        if (c.ck) R.grade(c.ck, true);
        d.ok++;
      }
      d.state = 'done';
      board.setBadge({ sq: mv.to, cls: 'best' });
      mood('happy', 'jump');
      renderCardPanel(first ? '<b class="ok-txt">✓ Exact !</b>' : '<b>C’est ça, retenu pour la prochaine fois.</b>');
      // passage automatique au coup suivant, sauf si on a demandé « Pourquoi ? »
      setTimeout(() => {
        if (RP.drill !== d || d.cards[d.i] !== c || d.pause) return;
        d.i++;
        showCard();
      }, 1200);
    } else {
      if (d.state === 'ask') {
        if (c.ck) R.grade(c.ck, false);
        d.ko++;
      }
      d.state = 'fix';
      board.setBadge({ sq: mv.to, cls: 'mistake' });
      mood('meh', 'shake');
      renderCardPanel(`<b class="ko-txt">✗ Pas celui-là.</b> Ton coup ici : ${san(c.move.san)}. Joue-le pour continuer.`);
      setTimeout(() => {
        if (RP.drill !== d || d.view != null || d.cards[d.i] !== c) return;
        show(c.fen, false, c.path[c.path.length - 1]);
        board.setBadge(null);
        board.setArrows([{ from: c.move.uci.slice(0, 2), to: c.move.uci.slice(2, 4), color: GREEN }]);
        movable(c.fen, RP.color);
      }, 900);
    }
  }

  function reveal() {
    const d = RP.drill;
    const c = d.cards[d.i];
    if (d.state === 'ask') {
      if (c.ck) R.grade(c.ck, false);
      d.ko++;
    }
    d.state = 'fix';
    board.setArrows([{ from: c.move.uci.slice(0, 2), to: c.move.uci.slice(2, 4), color: GREEN }]);
    renderCardPanel(`Ton coup ici : ${san(c.move.san)}. Joue-le pour le mémoriser.`);
  }

  function finishReview() {
    const d = RP.drill;
    RP.drill = null;
    renderNav();
    const next = R.nextDueText(RP.color);
    mood(d.ko ? 'happy' : 'star', 'jump');
    setBody(
      `<div class="rep-big"><div class="rep-big-n">${d.ok}/${d.cards.length}</div><div>coups retrouvés du premier coup</div><div class="muted small">${next ? `Prochaine révision ${next}.` : ''}</div></div>
      <p class="rep-help">${d.ko ? 'Les coups oubliés reviendront dans 10 minutes, puis demain.' : 'Sans faute ! Ton répertoire est bien en place.'}</p>`,
      d.src
        ? '<button class="btn btn-primary" data-drill-again>Recommencer cette ligne</button><button class="btn" data-tab-go="tree">Retour au répertoire</button>'
        : '<button class="btn btn-primary" data-start-review>Encore une série</button><button class="btn" data-tab-go="tree">Retour au répertoire</button>'
    );
  }

  /* =================== EXERCICES (tes erreurs) + partie libre =================== */
  function renderExHome() {
    show(CC.START_FEN, false, null);
    board.setArrows([]);
    board.setBadge(null);
    board.setMovable(null);
    evalBar(null);
    mood('idle', 'bob');
    const sets = CC.InsightsUI ? CC.InsightsUI.exerciseSets() : [];
    const list = sets.length
      ? sets.map((s, k) => `<button class="set-row" data-set="${k}"><b>${CC.esc(s.title)}</b><span class="muted">${s.items.length} ${s.items.length > 1 ? 'positions' : 'position'}${s.sub ? ' · ' + CC.esc(s.sub) : ''}</span><span class="set-go">S’entraîner ›</span></button>`).join('')
      : '<p class="muted">Analyse d’abord tes parties dans l’onglet « Faiblesses » : je fabrique tes exercices à partir de tes propres erreurs.</p>';
    setBody(`<p class="rep-help">Des positions tirées de <b>tes</b> parties, là où tu t’es trompé. Trouve le bon coup, puis <b>continue la partie contre Stockfish</b> pour voir si tu sais exploiter la position.</p><div class="set-list">${list}</div>`, '');
    RP.sets = sets;
  }

  function startExercises(items, title) {
    const list = (items || []).filter((x) => x && x.fen && x.best);
    if (!list.length) {
      app.toast('Pas de position pour cet exercice.');
      return;
    }
    RP.ex = { items: list, i: 0, ok: 0, title: title || 'Exercices', state: 'ask', tries: 0, play: null };
    RP.tab = 'ex';
    app.showView('rep'); // affiche l'onglet (et la première position)
  }

  function renderEx() {
    const ex = RP.ex;
    const it = ex.items[ex.i];
    if (!it) return finishEx();
    if (ex.state === 'ask' && !ex.shown) {
      ex.shown = true;
      const turn = turnOf(it.fen);
      board.setOrientation(turn);
      show(it.fen, false, null);
      board.setArrows([]);
      board.setBadge(null);
      board.setHint(null);
      evalBar(null);
      movable(it.fen, turn);
    }
    const turn = turnOf(it.fen);
    const ctx = `${it.opp ? `contre ${CC.esc(it.opp)}` : ''}${it.t ? ` · ${CC.esc(app.fmtDate(it.t))}` : ''}${it.tcKey ? ` · ${CC.esc(CC.Insights.tcLabel(it.tcKey))}` : ''}`;
    let text;
    let foot = '';
    if (ex.play) return renderPlay();
    if (ex.state === 'ask' || ex.state === 'wrong') {
      text =
        (ex.state === 'wrong' ? `${san(ex.lastSan)} <span class="cls-txt" style="color:${CC.CLS[ex.lastCls].ink}">${CC.CLS[ex.lastCls].phrase}</span>. Réessaie !<br>` : '') +
        `Dans ta partie ${ctx}, tu as joué ${san((it.label || '') + ' ' + it.san)}. <b>Trouve mieux</b> pour les ${side(turn)}.`;
      foot = '<button class="btn btn-sm" data-ex-hint>Indice</button><button class="btn btn-sm" data-ex-sol>Solution</button><button class="btn btn-sm btn-ghost" data-ex-next>Passer</button>';
      mood(ex.state === 'wrong' ? 'meh' : 'thinking', ex.state === 'wrong' ? 'shake' : 'bob');
    } else if (ex.state === 'checking') {
      text = '<span class="cc-spin">✻</span> Stockfish vérifie ton coup…';
      mood('thinking', 'walk');
    } else {
      // résolu (par toi ou via la solution)
      const meta = CC.CLS[ex.solvedCls || 'best'];
      text = ex.solvedBySolution
        ? `La solution était ${san(it.best)}.`
        : `<b class="ok-txt">Bravo !</b> ${san(ex.solvedSan)} <span class="cls-txt" style="color:${meta.ink}">${meta.phrase}</span>.`;
      text += ' Tu peux maintenant <b>continuer la partie</b> contre Stockfish à partir d’ici.';
      foot = '<button class="btn btn-sm btn-primary" data-ex-play>▶ Continuer la partie</button><button class="btn btn-sm" data-ex-next>Position suivante ›</button>';
      mood(ex.solvedBySolution ? 'idle' : 'star', ex.solvedBySolution ? 'bob' : 'jump');
    }
    setBody(
      `<div class="drill-prog"><span>${CC.esc(ex.title)} · ${ex.i + 1} / ${ex.items.length}</span><span class="muted">${ex.ok} ✓</span></div>
      <div class="progress"><div class="progress-fill" style="width:${(ex.i / ex.items.length) * 100}%"></div></div>
      <div class="bubble drill-bubble">${text}</div>`,
      foot + '<button class="btn btn-sm btn-ghost" data-ex-quit>Arrêter</button>'
    );
  }

  async function exMove(from, to, promo) {
    const ex = RP.ex;
    if (ex.play) return playMove(from, to, promo);
    if (ex.state !== 'ask' && ex.state !== 'wrong') return;
    const it = ex.items[ex.i];
    const turn = turnOf(it.fen);
    const ch = new Chess(it.fen);
    const mv = ch.move({ from, to, promotion: promo || 'q' });
    if (!mv) return;
    show(ch.fen(), true, uciOf(mv));
    board.setMovable(null);
    board.setHint(null);
    app.sound(mv);
    let good = mv.san.replace(/[+#]/g, '') === it.best.replace(/[+#]/g, '') || ch.in_checkmate();
    let cls = 'best';
    if (!good) {
      ex.state = 'checking';
      renderEx();
      try {
        const res = await app.engine.analyze(it.fen, { depth: 12, movetime: 1200, multipv: 3 });
        if (RP.ex !== ex) return;
        const wpBest = CC.winFor(res.lines[0].score, turn);
        const line = res.lines.find((l) => l.pv[0] === uciOf(mv));
        let wp;
        if (line) wp = CC.winFor(line.score, turn);
        else {
          const r2 = await app.engine.analyze(ch.fen(), { depth: 12, movetime: 1200, multipv: 1 });
          wp = CC.winFor(r2.lines[0].score, turn);
        }
        const loss = Math.max(0, wpBest - wp);
        good = loss <= 2;
        cls = good ? 'excellent' : loss <= 5 ? 'good' : loss <= 10 ? 'inaccuracy' : loss <= 20 ? 'mistake' : 'blunder';
      } catch (e) {
        cls = 'mistake';
      }
      if (RP.ex !== ex) return;
    }
    board.setBadge({ sq: mv.to, cls });
    if (good) {
      ex.state = 'solved';
      ex.solvedCls = cls;
      ex.solvedSan = mv.san;
      ex.solvedBySolution = false;
      ex.afterFen = ch.fen();
      ex.afterUci = uciOf(mv);
      if (!ex.tries) ex.ok++;
      app.playSound('success');
      renderEx();
    } else {
      ex.tries++;
      ex.state = 'wrong';
      ex.lastSan = mv.san;
      ex.lastCls = cls;
      app.playSound('fail');
      renderEx();
      setTimeout(() => {
        if (RP.ex !== ex || ex.state !== 'wrong') return;
        show(it.fen, false, null);
        board.setBadge(null);
        movable(it.fen, turn);
      }, 1300);
    }
  }

  function exHint() {
    const ex = RP.ex;
    const it = ex.items[ex.i];
    const mv = new Chess(it.fen).move(it.best);
    if (!mv) return;
    board.setHint(mv.from);
    app.toast(`Regarde du côté de ${CC.ton(mv.piece)} en ${mv.from} 👀`);
  }
  function exSolution() {
    const ex = RP.ex;
    const it = ex.items[ex.i];
    const ch = new Chess(it.fen);
    const mv = ch.move(it.best);
    if (!mv) return;
    show(ch.fen(), true, uciOf(mv));
    board.setHint(null);
    board.setBadge({ sq: mv.to, cls: 'best' });
    board.setMovable(null);
    app.sound(mv);
    ex.tries++;
    ex.state = 'solved';
    ex.solvedBySolution = true;
    ex.afterFen = ch.fen();
    ex.afterUci = uciOf(mv);
    renderEx();
  }
  function exNext() {
    const ex = RP.ex;
    ex.i++;
    ex.state = 'ask';
    ex.shown = false;
    ex.tries = 0;
    ex.play = null;
    renderEx();
  }
  function finishEx() {
    const ex = RP.ex;
    RP.ex = null;
    mood(ex.ok === ex.items.length ? 'star' : 'happy', 'jump');
    setBody(
      `<div class="rep-big"><div class="rep-big-n">${ex.ok}/${ex.items.length}</div><div>positions trouvées du premier coup</div></div><p class="rep-help">Refais ces exercices dans quelques jours : c’est en revoyant tes propres erreurs qu’on arrête de les répéter.</p>`,
      '<button class="btn" data-tab-go="ex">Autres exercices</button>'
    );
  }

  /* Partie libre contre Stockfish depuis la position trouvée */
  function startPlay() {
    const ex = RP.ex;
    const it = ex.items[ex.i];
    ex.play = { fen: ex.afterFen, color: turnOf(it.fen), moves: [{ san: ex.solvedSan || it.best, fenBefore: it.fen }], over: null, thinking: false, lastUci: ex.afterUci };
    board.setBadge(null);
    renderPlay();
    engineReply();
  }
  function renderPlay() {
    const p = RP.ex.play;
    let moves = '';
    p.moves.forEach((m, k) => {
      const lab = CC.moveLabel(m.fenBefore, turnOf(m.fenBefore));
      if (turnOf(m.fenBefore) === 'w' || k === 0) moves += `<span class="rl-num">${CC.esc(lab)}</span>`;
      moves += CC.sanHTML(m.san) + ' ';
    });
    let state;
    if (p.over === 'won') state = '<b class="ok-txt">Échec et mat, tu as gagné ! 🎉</b>';
    else if (p.over === 'lost') state = '<b class="ko-txt">Échec et mat… Stockfish a gagné.</b>';
    else if (p.over === 'draw') state = '<b>Partie nulle.</b>';
    else if (p.thinking) state = '<span class="cc-spin">✻</span> Stockfish réfléchit…';
    else state = `<b>À toi de jouer</b> (${side(p.color)}).`;
    setBody(
      `<div class="drill-prog"><span>Partie libre contre Stockfish</span><span class="muted">${CC.esc(RP.ex.title)} · ${RP.ex.i + 1}/${RP.ex.items.length}</span></div>
      <div class="bubble drill-bubble">${state}<div class="drill-line">${moves}</div></div>
      <p class="rep-help">Joue la position jusqu’au bout comme en partie : c’est le meilleur moyen d’apprendre à convertir un avantage.</p>`,
      '<button class="btn btn-sm btn-primary" data-ex-next>Position suivante ›</button><button class="btn btn-sm" data-ex-restart>Recommencer la position</button><button class="btn btn-sm btn-ghost" data-ex-quit>Arrêter</button>'
    );
    mood(p.over === 'won' ? 'cool' : p.over === 'lost' ? 'sad' : p.thinking ? 'thinking' : 'idle', p.over === 'won' ? 'jump' : 'bob');
  }
  async function engineReply() {
    const ex = RP.ex;
    const p = ex && ex.play;
    if (!p) return;
    const ch = new Chess(p.fen);
    if (ch.game_over()) return endPlay(ch);
    if (ch.turn() === p.color) {
      movable(p.fen, p.color);
      return;
    }
    p.thinking = true;
    board.setMovable(null);
    renderPlay();
    let res;
    try {
      res = await app.engine.analyze(p.fen, { depth: 12, movetime: 800, multipv: 1 });
    } catch (e) {
      return;
    }
    if (!RP.ex || RP.ex.play !== p) return;
    const u = res.best || (res.lines[0] && res.lines[0].pv[0]);
    const before = p.fen;
    const mv = u && ch.move(A.uciMove(u));
    p.thinking = false;
    if (!mv) return renderPlay();
    p.fen = ch.fen();
    p.moves.push({ san: mv.san, fenBefore: before });
    show(p.fen, true, uciOf(mv));
    app.sound(mv);
    if (res.lines[0]) evalBar(res.lines[0].score);
    if (ch.game_over()) return endPlay(ch);
    movable(p.fen, p.color);
    renderPlay();
  }
  function playMove(from, to, promo) {
    const p = RP.ex.play;
    if (p.thinking || p.over) return;
    const ch = new Chess(p.fen);
    const before = p.fen;
    const mv = ch.move({ from, to, promotion: promo || 'q' });
    if (!mv) return;
    p.fen = ch.fen();
    p.moves.push({ san: mv.san, fenBefore: before });
    show(p.fen, true, uciOf(mv));
    app.sound(mv);
    engineReply();
  }
  function endPlay(ch) {
    const p = RP.ex.play;
    p.thinking = false;
    p.over = ch.in_checkmate() ? (ch.turn() === p.color ? 'lost' : 'won') : 'draw';
    board.setMovable(null);
    app.playSound(p.over === 'won' ? 'success' : 'fail');
    renderPlay();
  }
  function exRestart() {
    const ex = RP.ex;
    ex.play = null;
    ex.state = 'ask';
    ex.shown = false;
    renderEx();
  }

  /* =================== MES PARTIES (écarts, trous) =================== */
  async function renderGamesTab() {
    board.setMovable(null);
    board.setArrows([]);
    board.setBadge(null);
    evalBar(null);
    mood('thinking', 'walk');
    if (!app.S.username) {
      setBody('<p class="muted">Indique d’abord ton pseudo dans « Mes parties ».</p>');
      return;
    }
    setBody('<p class="muted"><span class="cc-spin">✻</span> Je compare tes parties à ton répertoire…</p>');
    let games;
    try {
      games = await ensureGames();
    } catch (e) {
      setBody(`<p class="muted">${CC.esc(e.message)}</p>`);
      return;
    }
    if (RP.tab !== 'games') return;
    const color = RP.color;
    const mine = games.filter((g) => g.color === color && g.parsed);
    const size = R.size(color);
    const devs = R.deviations(color, mine, 12);
    const gaps = R.gaps(color, RP.stats[color], 8);
    let followSum = 0;
    for (const g of mine) {
      let k = 0;
      for (const mv of g.parsed.moves) {
        if (mv.color !== color) continue;
        const e = R.get(color, mv.fenBefore);
        if (!e || e.uci !== mv.uci) break;
        k++;
      }
      followSum += k;
    }
    const avg = mine.length ? followSum / mine.length : 0;
    let html = `<div class="rep-big"><div class="rep-big-n">${avg.toFixed(1).replace('.', ',')}</div><div>coups suivis en moyenne dans ton répertoire</div><div class="muted small">sur tes ${mine.length} dernières parties avec les ${side(color)}</div></div>`;
    if (!size) html += `<p class="rep-help">Ton répertoire ${side(color).toLowerCase()} est vide. Crée-le à partir de tes parties : je garde tes coups habituels et je corrige ceux qui sont douteux.</p>`;
    if (devs.length) {
      html += '<h4 class="rep-h4">Tes derniers écarts</h4><div class="dev-list">';
      for (const dv of devs) {
        const path = dv.game.parsed.moves.slice(0, dv.type === 'forgot' ? dv.i : dv.i + 1).map((m) => m.uci);
        const when = dv.game.t ? app.fmtDate(dv.game.t) : '';
        const txt =
          dv.type === 'forgot'
            ? `${CC.esc(dv.label)} tu as joué ${san(dv.played)} au lieu de ${san(dv.expected)}`
            : `${CC.esc(dv.label)} ${san(dv.played)} de ton adversaire : pas encore préparé`;
        html += `<div class="dev-row"><span class="dev-ic ${dv.type}">${dv.type === 'forgot' ? '✗' : '?'}</span><span class="dev-main">${txt}<span class="err-sub">contre ${CC.esc(dv.game.opp)} · ${CC.esc(when)} · ${CC.esc(CC.Insights.tcLabel(dv.game.tc))}</span></span><button class="btn btn-sm" data-goto="${CC.esc(JSON.stringify(path))}">${dv.type === 'forgot' ? 'Revoir' : 'Préparer'}</button></div>`;
      }
      html += '</div>';
    } else if (size) html += '<p class="rep-help">Aucun écart récent : tu suis bien ta préparation 👏</p>';
    if (gaps.length) {
      html += '<h4 class="rep-h4">Positions fréquentes à préparer</h4><div class="dev-list">';
      for (const gp of gaps) {
        const line = sansOf(gp.path)
          .slice(-4)
          .map((m) => CC.sanHTML(m.san))
          .join(' ');
        html += `<div class="dev-row"><span class="dev-ic gap">${gp.n}×</span><span class="dev-main">…${line}<span class="err-sub">tu y joues d’habitude ${CC.sanHTML(gp.usual.san)} (${pct(gp.usual.pts, gp.usual.n)} % de points)</span></span><button class="btn btn-sm" data-goto="${CC.esc(JSON.stringify(gp.path))}">Préparer</button></div>`;
      }
      html += '</div>';
    }
    setBody(html, '<button class="btn btn-sm btn-primary" data-auto>✻ Créer depuis mes parties</button>');
    mood(devs.length ? 'meh' : 'happy', 'bob');
  }

  /* =================== Initialisation =================== */
  const UI = (CC.RepUI = {});
  UI.init = function (a) {
    app = a;
    // Une seule fois (répertoire v2) : on retire ce que les anciens répertoires conseillés avaient ajouté
    // et on met tes ouvertures + les pièges de mat + le gambit en plus de chaque couleur. Tes coups à toi
    // (Construire, tes parties, le chat) sont gardés et passent avant les packs. Annulable.
    if (!CC.store.get('cc.rep.v2', false)) {
      CC.store.set('cc.rep.v2', true);
      const d = R.data();
      const snaps = { w: R.snapshot('w'), b: R.snapshot('b') };
      let removed = 0;
      for (const c of ['w', 'b']) {
        for (const k of Object.keys(d[c])) {
          if (d[c][k].src === 'conseillé' || d[c][k].src === 'gambit') {
            delete d[c][k];
            removed++;
          }
        }
      }
      const added = [];
      for (const pre of CC.RepPresets || []) {
        if (pre.variant) continue;
        if (R.addPreset(pre).added) added.push(pre);
      }
      R.prune('w');
      R.prune('b');
      R.save();
      if (added.length || removed) {
        RP.undo = { both: snaps };
        RP.presetNote = added;
        RP.migrated = removed > 0;
      }
    }
    board = new CC.Board($('#rep-board'), { orientation: RP.color });
    board.onUserMove = (from, to, promo) => {
      if (RP.tab === 'review' && RP.drill) reviewMove(from, to, promo);
      else if (RP.tab === 'ex' && RP.ex) exMove(from, to, promo);
      else if (RP.tab === 'build') buildMove(from, to, promo);
      else if (RP.tab === 'tree') {
        const mv = new Chess(curFen()).move({ from, to, promotion: promo || 'q' });
        if (mv) {
          RP.path.push(uciOf(mv));
          app.sound(mv);
          renderTree(true);
        }
      }
    };
    board.setPosition(CC.START_FEN, false);
    window.__rep = { RP, R, board }; // petit accès pour les tests automatisés
    $('#rep-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      RP.tab = b.dataset.tab;
      renderTabs();
    });
    $('#rep-color').addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      if (!b || b.dataset.v === RP.color) return;
      RP.color = b.dataset.v;
      CC.store.set('cc.rep.color', RP.color);
      RP.path = [];
      RP.drill = null;
      renderTabs();
    });
    $('#rep-line').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ply]');
      if (b) goPath(RP.path.slice(0, +b.dataset.ply), false);
    });
    $('#rep-nav').addEventListener('click', (e) => {
      const b = e.target.closest('[data-nav]');
      if (!b) return;
      if (b.dataset.nav === 'rv-back') return stepBack();
      if (b.dataset.nav === 'rv-fwd') return stepForward();
      if (b.dataset.nav === 'start') goPath([], false);
      else if (b.dataset.nav === 'back') goPath(RP.path.slice(0, -1), true);
      else if (b.dataset.nav === 'flip') {
        board.flip();
        evalBar(null);
      }
    });
    $('#view-rep').addEventListener('click', (e) => {
      const t = e.target;
      const pickB = t.closest('[data-pick]');
      if (pickB) {
        const fen = curFen();
        const mv = new Chess(fen).move(A.uciMove(pickB.dataset.pick));
        if (mv) pick(fen, uciOf(mv), mv.san, R.get(RP.color, fen));
        return;
      }
      const dg = t.closest('summary[data-drill-group]');
      if (dg) {
        if (t.closest('[data-og-toggle]')) return; // la flèche ouvre ou ferme la liste des coups
        e.preventDefault();
        const g = (RP.groups || [])[+dg.dataset.drillGroup];
        if (g) startLineReview(g.lines, g.name);
        return;
      }
      const dl = t.closest('[data-drill-line]');
      if (dl) {
        const l = (RP.tlines || [])[+dl.dataset.drillLine];
        if (l) startLineReview([l.path], l.name);
        return;
      }
      const db = t.closest('[data-drill-ti]');
      if (db) {
        e.preventDefault();
        const p = RP.tpaths[+db.dataset.drillTi];
        if (p) startLineReview(branchPaths(p), lineTitle(p));
        return;
      }
      if (t.closest('[data-drill-here]')) return startLineReview(branchPaths(RP.path), lineTitle(RP.path));
      if (t.closest('[data-drill-again]') && RP.lastDrillSrc) return startLineReview(RP.lastDrillSrc.paths, RP.lastDrillSrc.title);
      const pd = t.closest('[data-preset-drill]');
      if (pd) {
        const pre = (CC.RepPresets || []).find((x) => x.id === pd.dataset.presetDrill);
        if (pre) {
          RP.presets = false;
          startLineReview(pre.lines.map(sanPath), pre.name);
        }
        return;
      }
      const tm = t.closest('[data-ti]');
      if (tm) {
        const p = RP.tpaths[+tm.dataset.ti];
        if (p) {
          const prev = RP.path;
          const one = p.length === prev.length + 1 && samePath(p.slice(0, -1), prev);
          if (one) {
            const mv = new Chess(fenOf(prev)).move(A.uciMove(p[p.length - 1]));
            if (mv) app.sound(mv);
          }
          RP.path = p.slice();
          if (RP.tab === 'tree') renderTree(one);
          else renderBuild(one);
        }
        return;
      }
      if (t.closest('[data-edit]')) {
        RP.tab = 'build';
        renderTabs();
        return;
      }
      const go = t.closest('[data-go]');
      if (go) {
        const mv = new Chess(curFen()).move(A.uciMove(go.dataset.go));
        if (mv) {
          RP.path.push(go.dataset.go);
          app.sound(mv);
          renderBuild(true);
        }
        return;
      }
      const gt = t.closest('[data-goto]');
      if (gt) {
        RP.tab = 'build';
        RP.path = JSON.parse(gt.dataset.goto);
        renderTabs();
        return;
      }
      if (t.closest('[data-rm]')) {
        const snap = R.snapshot(RP.color);
        R.remove(RP.color, curFen());
        RP.undo = { color: RP.color, snap };
        app.toast('Coup retiré (et la suite). <button class="linkbtn" data-undo>Annuler</button>');
        renderBuild(false);
        return;
      }
      if (t.closest('[data-auto]')) return autoBuild();
      if (t.closest('[data-preset]')) {
        RP.presets = true;
        return renderPresets();
      }
      if (t.closest('[data-presets-close]')) {
        RP.presets = false;
        return renderTab();
      }
      const pa = t.closest('[data-preset-add]');
      if (pa) return applyPreset(pa.dataset.presetAdd, false);
      const pr = t.closest('[data-preset-replace]');
      if (pr) return applyPreset(pr.dataset.presetReplace, true);
      const pv = t.closest('[data-preset-view]');
      if (pv) {
        const pre = (CC.RepPresets || []).find((p) => p.id === pv.dataset.presetView);
        if (pre) {
          const ch = new Chess();
          const path = [];
          for (const sn of pre.lines[0].split(' ')) {
            const mv = ch.move(sn);
            if (!mv) break;
            path.push(uciOf(mv));
          }
          RP.presets = false;
          RP.tab = 'build';
          RP.path = path.slice(0, Math.min(path.length, 6));
          renderTabs();
        }
        return;
      }
      if (t.closest('[data-undo]')) return undo();
      if (t.closest('[data-hide-report]')) {
        RP.buildReport = null;
        return renderBuild(false);
      }
      if (t.closest('[data-start-review]')) return startReview();
      if (t.closest('[data-reveal]')) return reveal();
      if (t.closest('[data-why]') && RP.drill) {
        const c = RP.drill.cards[RP.drill.i];
        RP.drill.pause = true;
        if (c) explainMove(c.path, c.move.uci);
        return;
      }
      if (t.closest('[data-next-card]') && RP.drill) {
        RP.drill.i++;
        return showCard();
      }
      const dv = t.closest('[data-dv]');
      if (dv && RP.drill) return viewPly(+dv.dataset.dv, false);
      if (t.closest('[data-rv-live]') && RP.drill) return liveBoard();
      const tr = t.closest('[data-drill-trap]');
      if (tr) {
        const x = (RP.traps || [])[+tr.dataset.drillTrap];
        if (x) startLineReview([sanPath(x.line)], x.name);
        return;
      }
      if (t.closest('[data-why-here]')) {
        const e2 = R.get(RP.color, curFen());
        if (e2) explainMove(RP.path, e2.uci);
        return;
      }
      if (t.closest('[data-stop-review]')) {
        RP.drill = null;
        return renderTab();
      }
      const tg = t.closest('[data-tab-go]');
      if (tg) {
        RP.tab = tg.dataset.tabGo;
        return renderTabs();
      }
      const set = t.closest('[data-set]');
      if (set && RP.sets) {
        const s = RP.sets[+set.dataset.set];
        return startExercises(s.items, s.title);
      }
      if (t.closest('[data-ex-hint]')) return exHint();
      if (t.closest('[data-ex-sol]')) return exSolution();
      if (t.closest('[data-ex-next]')) return exNext();
      if (t.closest('[data-ex-play]')) return startPlay();
      if (t.closest('[data-ex-restart]')) return exRestart();
      if (t.closest('[data-ex-quit]')) {
        RP.ex = null;
        return renderTab();
      }
    });
    // On se souvient si la liste des pièges est repliée
    $('#view-rep').addEventListener(
      'toggle',
      (e) => {
        if (e.target.matches && e.target.matches('details.traps')) RP.trapsClosed = !e.target.open;
      },
      true
    );
    // Le bouton « Annuler » des notifications
    $('#toast').addEventListener('click', (e) => {
      if (e.target.closest('[data-undo]')) undo();
    });
    document.addEventListener('keydown', (e) => {
      if ($('#view-rep').hidden) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (RP.tab === 'review' && RP.drill) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          stepBack();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          stepForward();
        }
        return;
      }
      if (RP.tab !== 'build' && RP.tab !== 'tree') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPath(RP.path.slice(0, -1), true);
      } else if (e.key === 'ArrowUp' || e.key === 'Home') {
        e.preventDefault();
        goPath([], false);
      }
    });
  };
  UI.show = function () {
    if (RP.presetNote) {
      const list = RP.presetNote;
      RP.presetNote = null;
      if (list.length) RP.color = list[0].color;
      RP.path = [];
      RP.tab = 'tree';
      const extra = list.filter((p) => p.extra).map((p) => CC.esc(p.name.split(':').pop().trim()));
      setTimeout(
        () =>
          app.toast(
            (RP.migrated ? 'Répertoire refait : ' : 'Répertoire prêt : ') +
              'tes ouvertures, les pièges de mat' +
              (extra.length ? ' et en plus ' + extra.join(', ') : '') +
              '. <button class="linkbtn" data-undo>Annuler</button>'
          ),
        300
      );
    }
    renderTabs();
  };
  UI.startExercises = startExercises;
  UI.openTab = function (tab) {
    RP.tab = tab;
    app.showView('rep');
  };
  /** Ouvre le constructeur sur une ligne donnée */
  UI.openAt = function (color, path) {
    RP.color = color;
    RP.path = path || [];
    RP.tab = 'build';
    app.showView('rep');
  };
})(window);
