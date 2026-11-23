/* Clawd Coach — PGN, ouvertures, analyse Stockfish et classification des coups (façon « Bilan de partie »).
 * Modèle : chances de gain (courbe lichess) -> points espérés perdus -> catégorie.
 * Seuils : Meilleur 0 · Excellent ≤ 2 % · Bon ≤ 5 % · Imprécision ≤ 10 % · Erreur ≤ 20 % · Gaffe > 20 %. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const Chess = root.Chess;
  const A = (CC.Analysis = {});

  /* ======================= PGN ======================= */
  A.parsePGN = function (text, opts) {
    const maxPlies = (opts && opts.maxPlies) || Infinity;
    text = String(text || '').replace(/\r/g, '').replace(/^﻿/, '').trim();
    if (!text) throw new Error('Le PGN est vide.');
    const headers = {};
    const re = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm;
    let m;
    while ((m = re.exec(text))) headers[m[1]] = m[2].replace(/\\(.)/g, '$1');
    const body = text.replace(/^\s*\[[^\]\n]*\]\s*$/gm, ' ');

    const tokens = [];
    let depth = 0;
    for (let i = 0; i < body.length; ) {
      const ch = body[i];
      if (ch === '{') {
        const j = body.indexOf('}', i);
        if (!depth) tokens.push({ c: body.slice(i + 1, j < 0 ? body.length : j) });
        i = j < 0 ? body.length : j + 1;
      } else if (ch === ';') {
        const j = body.indexOf('\n', i);
        i = j < 0 ? body.length : j + 1;
      } else if (ch === '(') {
        depth++;
        i++;
      } else if (ch === ')') {
        depth = Math.max(0, depth - 1);
        i++;
      } else if (ch <= ' ') {
        i++;
      } else {
        let j = i;
        while (j < body.length && !/[\s{}();]/.test(body[j])) j++;
        if (!depth) tokens.push({ t: body.slice(i, j) });
        i = j;
      }
    }

    const variant = (headers.Variant || '').toLowerCase();
    if (variant && !/^(standard|chess|from position)$/.test(variant)) {
      throw new Error(`Variante non prise en charge : ${headers.Variant}`);
    }
    const startFen = headers.FEN ? headers.FEN.trim() : CC.START_FEN;
    const chess = new Chess();
    if (!chess.load(startFen)) throw new Error('Position de départ (FEN) invalide.');

    const moves = [];
    for (const tok of tokens) {
      if (tok.c != null) {
        const k = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/.exec(tok.c);
        if (k && moves.length) moves[moves.length - 1].clock = +k[1] * 3600 + +k[2] * 60 + parseFloat(k[3]);
        continue;
      }
      let s = tok.t;
      if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(s) || moves.length >= maxPlies) break;
      s = s.replace(/^\d+\.+/, '');
      if (!s || /^\$\d+$/.test(s)) continue;
      s = s.replace(/[!?]+$/, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
      if (!s) continue;
      const fenBefore = chess.fen();
      const mv = chess.move(s, { sloppy: true });
      if (!mv) throw new Error(`Coup illisible : « ${tok.t} » (après ${moves.length} demi-coups).`);
      moves.push({
        san: mv.san,
        from: mv.from,
        to: mv.to,
        piece: mv.piece,
        captured: mv.captured || null,
        promotion: mv.promotion || null,
        flags: mv.flags,
        color: mv.color,
        uci: mv.from + mv.to + (mv.promotion || ''),
        fenBefore,
        fenAfter: chess.fen(),
        clock: null,
      });
    }
    if (!moves.length) throw new Error('Aucun coup trouvé dans ce PGN.');
    const sp = startFen.split(' ');
    const st = CC.START_FEN.split(' ');
    return { headers, startFen, standardStart: sp[0] === st[0] && sp[1] === 'w', moves, pgn: text };
  };

  A.fromChessCom = function (g) {
    const p = A.parsePGN(g.pgn);
    const id = CC.ChessCom.gameId(g.url) || CC.hash(g.pgn);
    return Object.assign(p, {
      source: 'chesscom',
      url: g.url,
      id,
      key: 'cc-' + id,
      white: { name: g.white.username, rating: g.white.rating, result: g.white.result },
      black: { name: g.black.username, rating: g.black.rating, result: g.black.result },
      timeClass: g.time_class,
      timeControl: g.time_control,
      endTime: g.end_time,
      ccAccuracy: g.accuracies || null,
    });
  };

  A.fromPGN = function (text) {
    const p = A.parsePGN(text);
    const h = p.headers;
    const res = h.Result || '*';
    const wr = res === '1-0' ? 'win' : res === '0-1' ? 'lose' : res === '1/2-1/2' ? 'agreed' : null;
    const br = res === '0-1' ? 'win' : res === '1-0' ? 'lose' : res === '1/2-1/2' ? 'agreed' : null;
    const key = 'pgn-' + CC.hash(p.startFen + p.moves.map((x) => x.uci).join(''));
    return Object.assign(p, {
      source: 'pgn',
      url: h.Link || null,
      id: key,
      key,
      white: { name: h.White || 'Blancs', rating: parseInt(h.WhiteElo, 10) || null, result: wr },
      black: { name: h.Black || 'Noirs', rating: parseInt(h.BlackElo, 10) || null, result: br },
      timeClass: null,
      timeControl: h.TimeControl || null,
      endTime: null,
    });
  };

  /* ======================= Ouvertures (lichess chess-openings, CC0) ======================= */
  let OPEN = null;
  function openings() {
    if (OPEN) return OPEN;
    const byLine = new Map();
    const prefixes = new Set();
    for (const row of String(root.__OPENINGS_TSV || '').split('\n')) {
      const [eco, name, sans] = row.split('\t');
      if (!sans) continue;
      const clean = sans.replace(/[+#]/g, '');
      byLine.set(clean, { eco, name });
      let k = -1;
      while ((k = clean.indexOf(' ', k + 1)) >= 0) prefixes.add(clean.slice(0, k));
      prefixes.add(clean);
    }
    return (OPEN = { byLine, prefixes });
  }
  A.identifyOpening = function (sans) {
    const { byLine, prefixes } = openings();
    let key = '';
    let bookPlies = 0;
    let opening = null;
    for (let k = 0; k < sans.length; k++) {
      const s = sans[k].replace(/[+#]/g, '');
      key = k ? key + ' ' + s : s;
      if (!prefixes.has(key)) break;
      bookPlies = k + 1;
      const o = byLine.get(key);
      if (o) opening = Object.assign({ plies: k + 1 }, o);
    }
    return { bookPlies, opening };
  };

  /* ======================= Outils échiquier ======================= */
  A.uciMove = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  A.pvToSan = function (fen, pv, max) {
    const ch = new Chess(fen);
    const out = [];
    for (const u of (pv || []).slice(0, max || 8)) {
      const mv = ch.move(A.uciMove(u));
      if (!mv) break;
      out.push(mv.san);
    }
    return out;
  };
  A.sanOf = (fen, uci) => (uci ? A.pvToSan(fen, [uci], 1)[0] || null : null);

  function material(fen) {
    const out = { w: 0, b: 0, np: 0 };
    for (const c of fen.split(' ')[0]) {
      const t = c.toLowerCase();
      const v = CC.VAL[t];
      if (v === undefined) continue;
      if (c === t) out.b += v;
      else out.w += v;
      if (t !== 'p' && t !== 'k') out.np += v;
    }
    return out;
  }
  A.material = material;

  /** Bilan matériel (point de vue `color`) en jouant une variante */
  A.materialSwing = function (fen, pv, color, maxPlies) {
    maxPlies = maxPlies || 6;
    const ch = new Chess(fen);
    const m0 = material(fen);
    const lost = [];
    const won = [];
    for (let k = 0; k < (pv || []).length && k < maxPlies + 2; k++) {
      const mv = ch.move(A.uciMove(pv[k]));
      if (!mv) break;
      if (mv.captured) (mv.color === color ? won : lost).push(mv.captured);
      if (k + 1 >= maxPlies && !mv.captured) break;
    }
    const m1 = material(ch.fen());
    const d = (x) => (color === 'w' ? x.w - x.b : x.b - x.w);
    return { delta: d(m1) - d(m0), lost, won };
  };

  const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KG = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const onBoard = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8;

  function attacksFrom(ch, sq) {
    const p = ch.get(sq);
    if (!p) return [];
    const [x, y] = CC.sqXY(sq);
    const out = [];
    if (p.type === 'p') {
      const d = p.color === 'w' ? 1 : -1;
      for (const dx of [-1, 1]) if (onBoard(x + dx, y + d)) out.push(CC.xySq(x + dx, y + d));
    } else if (p.type === 'n' || p.type === 'k') {
      for (const [dx, dy] of p.type === 'n' ? KN : KG) if (onBoard(x + dx, y + dy)) out.push(CC.xySq(x + dx, y + dy));
    } else {
      const dirs = p.type === 'b' ? DIAG : p.type === 'r' ? ORTH : DIAG.concat(ORTH);
      for (const [dx, dy] of dirs) {
        let a = x + dx;
        let b = y + dy;
        while (onBoard(a, b)) {
          const s = CC.xySq(a, b);
          out.push(s);
          if (ch.get(s)) break;
          a += dx;
          b += dy;
        }
      }
    }
    return out;
  }
  function attackedBy(ch, sq, color) {
    for (const s of ch.SQUARES) {
      const q = ch.get(s);
      if (q && q.color === color && attacksFrom(ch, s).includes(sq)) return true;
    }
    return false;
  }
  A.attackedBy = (fen, sq, color) => attackedBy(new Chess(fen), sq, color);

  /** Pièces (≥ cavalier) de `color` que l'adversaire peut gagner tout de suite (échange statique simplifié) */
  A.hanging = function (fen, color) {
    const parts = fen.split(' ');
    if (parts[1] === color) {
      parts[1] = color === 'w' ? 'b' : 'w';
      parts[3] = '-';
    }
    const ch = new Chess();
    if (!ch.load(parts.join(' '))) return [];
    const out = [];
    for (const m of ch.moves({ verbose: true })) {
      if (!m.captured || CC.VAL[m.captured] < 3) continue;
      ch.move(m);
      const recap = ch.moves({ verbose: true }).some((r) => r.to === m.to);
      ch.undo();
      const gain = CC.VAL[m.captured] - (recap ? CC.VAL[m.piece] : 0);
      if (gain >= 2) out.push({ square: m.to, piece: m.captured, by: m.piece, gain, uci: m.from + m.to + (m.promotion || ''), san: m.san });
    }
    out.sort((a, b) => b.gain - a.gain);
    return out;
  };

  /** Fourchette : la pièce en `sq` attaque au moins deux cibles intéressantes */
  A.forkInfo = function (fen, sq) {
    const ch = new Chess();
    if (!ch.load(fen)) return null;
    const p = ch.get(sq);
    if (!p || p.type === 'k') return null;
    const opp = p.color === 'w' ? 'b' : 'w';
    const targets = [];
    for (const t of attacksFrom(ch, sq)) {
      const q = ch.get(t);
      if (!q || q.color === p.color) continue;
      if (q.type === 'k' || (CC.VAL[q.type] >= 3 && (CC.VAL[q.type] > CC.VAL[p.type] || !attackedBy(ch, t, opp)))) targets.push(q.type);
    }
    if (targets.length < 2) return null;
    targets.sort((a, b) => (b === 'k') - (a === 'k') || CC.VAL[b] - CC.VAL[a]);
    return { piece: p.type, targets };
  };

  /* ======================= Analyse moteur ======================= */
  A.evalPosition = async function (fen, engine, opts) {
    const ch = new Chess(fen);
    const turn = ch.turn();
    const legal = ch.moves().length;
    if (ch.in_checkmate()) {
      return { terminal: 'checkmate', legal: 0, lines: [{ score: { mate: 0, cp: turn === 'w' ? -100000 : 100000 }, pv: [] }] };
    }
    if (legal === 0 || ch.insufficient_material()) {
      return { terminal: 'draw', legal, lines: [{ score: { cp: 0, mate: null }, pv: [] }] };
    }
    const res = await engine.analyze(fen, { depth: opts.depth, movetime: opts.movetime, multipv: legal > 1 ? 2 : 1, owner: opts.owner });
    const lines = res.lines.length ? res.lines : [{ score: { cp: 0, mate: null }, pv: res.best ? [res.best] : [] }];
    return { terminal: null, legal, lines: lines.map((l) => ({ score: l.score, pv: l.pv.slice(0, 12), depth: l.depth })) };
  };

  /* Sérialisation compacte pour le cache local */
  A.packEvals = (evals) =>
    evals.map((e) => ({ t: e.terminal, l: e.legal, L: e.lines.map((x) => [x.score.cp, x.score.mate, x.pv.slice(0, 8).join(' '), x.depth || 0]) }));
  A.unpackEvals = (data) =>
    data.map((e) => ({
      terminal: e.t || null,
      legal: e.l,
      lines: e.L.map((x) => ({ score: { cp: x[0], mate: x[1] }, pv: x[2] ? x[2].split(' ') : [], depth: x[3] })),
    }));

  /* ======================= Classification ======================= */
  const moveAccuracy = (loss) => (loss <= 0 ? 100 : CC.clamp(103.1668 * Math.exp(-0.04354 * loss) - 3.1669 + 1, 0, 100));

  function classify(game, evals, i, book, prev) {
    const mv = game.moves[i];
    const color = mv.color;
    const opp = color === 'w' ? 'b' : 'w';
    const E0 = evals[i];
    const E1 = evals[i + 1];
    const best = E0.lines[0];
    const second = E0.lines[1] || null;
    const bestUci = best.pv[0] || null;
    const wpBest = CC.winFor(best.score, color);
    const isBest = !!bestUci && bestUci === mv.uci;
    const scoreAfter = E1.lines[0].score;
    let wpAfter;
    if (E1.terminal === 'checkmate') wpAfter = 100;
    else if (isBest) wpAfter = wpBest;
    else if (second && second.pv[0] === mv.uci) wpAfter = CC.winFor(second.score, color);
    else wpAfter = CC.winFor(scoreAfter, color);
    const loss = Math.max(0, wpBest - wpAfter);

    let cls;
    if (E0.legal === 1) cls = 'forced';
    else if (isBest || E1.terminal === 'checkmate') cls = 'best';
    else if (loss <= 2) cls = 'excellent';
    else if (loss <= 5) cls = 'good';
    else if (loss <= 10) cls = 'inaccuracy';
    else if (loss <= 20) cls = 'mistake';
    else cls = 'blunder';

    // Indulgence quand on reste largement gagnant
    if (CC.SEVERE[cls] && wpAfter >= 95) cls = 'good';
    else if ((cls === 'mistake' || cls === 'blunder') && wpAfter >= 88) cls = 'inaccuracy';

    // Coup de la théorie : « Théorique » comme sur chess.com (sauf vraie gaffe, ex. le mat du sot 2.g4??)
    const inBook = i < book.bookPlies;
    if (inBook && cls !== 'forced' && E1.terminal !== 'checkmate' && loss <= 20) cls = 'book';

    // Occasion manquée : l'adversaire venait de faire une erreur, ou il y avait un mat
    const mateBest = CC.mateFor(best.score, color);
    if ((cls === 'mistake' || cls === 'blunder') && i > 0 && prev[i - 1] && prev[i - 1].loss >= 10) {
      const wpBeforeOppError = CC.winFor(evals[i - 1].lines[0].score, color);
      if (wpAfter >= wpBeforeOppError - 5) cls = 'miss';
    }
    if (CC.SEVERE[cls] && cls !== 'miss' && mateBest != null && mateBest > 0 && wpAfter >= 60) cls = 'miss';

    // Brillant (sacrifice correct) / Très bon coup (seul bon coup)
    let sacrifice = null;
    let gap = 0;
    if (!inBook && E0.legal > 1 && E1.terminal !== 'checkmate' && (cls === 'best' || cls === 'excellent')) {
      const capturedVal = mv.captured ? CC.VAL[mv.captured] : 0;
      // Un sacrifice qui mène à un mat forcé reste brillant même si la position était déjà gagnante
      const matingSac = isBest && mateBest != null && mateBest > 0;
      if (wpAfter >= 50 && (wpBest < 97 || matingSac)) {
        const h = A.hanging(mv.fenAfter, color)[0];
        if (h && h.gain - capturedVal >= 1) {
          sacrifice = h;
          cls = 'brilliant';
        }
      }
      if (cls === 'best' && second && E0.legal > 2) {
        gap = wpBest - CC.winFor(second.score, color);
        const prevMv = game.moves[i - 1];
        const recapture = !!(mv.captured && prevMv && prevMv.captured && prevMv.to === mv.to);
        const freeCapture =
          !!mv.captured && (CC.VAL[mv.captured] >= CC.VAL[mv.piece] || !A.attackedBy(mv.fenBefore, mv.to, opp));
        if (gap >= 18 && wpBest >= 30 && wpBest <= 93 && !recapture && !freeCapture) cls = 'great';
      }
    }

    return {
      i,
      color,
      san: mv.san,
      uci: mv.uci,
      cls,
      loss,
      acc: isBest || cls === 'book' || cls === 'forced' ? 100 : moveAccuracy(loss),
      wpBest,
      wpAfter,
      isBest,
      bestUci,
      scoreBefore: best.score,
      scoreAfter,
      mateBest,
      sacrifice,
      gap,
      inBook,
    };
  }

  function std(xs) {
    const n = xs.length;
    if (!n) return 0;
    const mu = xs.reduce((s, x) => s + x, 0) / n;
    return Math.sqrt(xs.reduce((s, x) => s + (x - mu) * (x - mu), 0) / n);
  }

  /** Précision de partie (méthode lichess : moyenne pondérée par la volatilité + moyenne harmonique) */
  function gameAccuracy(moves, wps) {
    const n = wps.length;
    const ws = CC.clamp(Math.floor(n / 10), 2, 8);
    const windows = [];
    for (let k = 0; k < Math.min(ws, n) - 2; k++) windows.push(wps.slice(0, ws));
    for (let k = 0; k + ws <= n; k++) windows.push(wps.slice(k, k + ws));
    const weights = windows.map((xs) => CC.clamp(std(xs), 0.5, 12));
    const res = {};
    for (const c of ['w', 'b']) {
      const items = moves.map((m, idx) => ({ a: m.acc, w: weights[idx] || 1, c: m.color })).filter((x) => x.c === c);
      if (!items.length) {
        res[c] = null;
        continue;
      }
      const wsum = items.reduce((s, x) => s + x.w, 0);
      const wmean = items.reduce((s, x) => s + x.a * x.w, 0) / wsum;
      const hmean = items.length / items.reduce((s, x) => s + 1 / Math.max(x.a, 1), 0);
      res[c] = (wmean + hmean) / 2;
    }
    return res;
  }

  function phaseOf(fen, ply, bookPlies) {
    if (material(fen).np <= 26) return 'endgame';
    if (ply < Math.max(20, bookPlies)) return 'opening';
    return 'middlegame';
  }
  A.accToCls = (a) =>
    a >= 95 ? 'best' : a >= 85 ? 'excellent' : a >= 72 ? 'good' : a >= 60 ? 'inaccuracy' : a >= 45 ? 'mistake' : 'blunder';

  /** Bilan complet d'une partie analysée */
  A.review = function (game, evals) {
    const N = game.moves.length;
    const book = game.standardStart ? A.identifyOpening(game.moves.map((x) => x.san)) : { bookPlies: 0, opening: null };
    const moves = [];
    for (let i = 0; i < N; i++) moves.push(classify(game, evals, i, book, moves));
    const wps = evals.map((e) => CC.winWhite(e.lines[0].score));
    const accuracy = gameAccuracy(moves, wps);
    const counts = { w: {}, b: {} };
    for (const c of Object.keys(CC.CLS)) {
      counts.w[c] = 0;
      counts.b[c] = 0;
    }
    const phaseAcc = { opening: { w: [], b: [] }, middlegame: { w: [], b: [] }, endgame: { w: [], b: [] } };
    for (const m of moves) {
      counts[m.color][m.cls]++;
      m.phase = phaseOf(game.moves[m.i].fenBefore, m.i, book.bookPlies);
      phaseAcc[m.phase][m.color].push(m.acc);
    }
    const phases = {};
    for (const p of Object.keys(phaseAcc)) {
      phases[p] = {};
      for (const c of ['w', 'b']) {
        const arr = phaseAcc[p][c];
        if (!arr.length) phases[p][c] = null;
        else {
          const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
          phases[p][c] = { acc: avg, cls: A.accToCls(avg), n: arr.length };
        }
      }
    }
    const keyMoments = moves.filter((m) => ['brilliant', 'great', 'miss', 'mistake', 'blunder'].includes(m.cls)).map((m) => m.i);
    return { moves, accuracy, counts, phases, opening: book.opening, bookPlies: book.bookPlies, wps, keyMoments };
  };
})(window);
