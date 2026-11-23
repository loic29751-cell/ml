/* Clawd Coach — puzzles : puzzles lichess (base publique, sans compte) choisis selon tes faiblesses,
 * plus tes propres erreurs en exercices. Progression et niveau gardés dans ce navigateur. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const Chess = root.Chess;
  const A = CC.Analysis;
  const $ = (s, r) => (r || document).querySelector(s);
  const KEY = 'cc.pz';
  const API = 'https://lichess.org/api/puzzle/batch/';
  const HL = 'rgba(244, 196, 79, .45)';

  // Thèmes lichess ; « Pour toi » enchaîne ceux qui collent à tes faiblesses (pièces en prise d'abord)
  const THEMES = [
    { k: 'mine', label: 'Pour toi' },
    { k: 'hangingPiece', label: 'Pièces en prise' },
    { k: 'fork', label: 'Fourchettes' },
    { k: 'pin', label: 'Clouages' },
    { k: 'mateIn1', label: 'Mat en 1' },
    { k: 'mateIn2', label: 'Mat en 2' },
    { k: 'defensiveMove', label: 'Défense' },
    { k: 'endgame', label: 'Finales' },
    { k: 'errors', label: 'Mes erreurs' },
  ];
  const MIX = ['hangingPiece', 'fork', 'mateIn1', 'hangingPiece', 'pin', 'mateIn2', 'defensiveMove', 'hangingPiece', 'skewer', 'discoveredAttack', 'trappedPiece'];
  const LEVELS = [
    { k: 'easiest', label: 'Facile' },
    { k: 'easier', label: 'Moyen' },
    { k: 'normal', label: 'Difficile' },
  ];
  const THEME_FR = {
    hangingPiece: 'pièce en prise', fork: 'fourchette', pin: 'clouage', skewer: 'enfilade', mateIn1: 'mat en 1', mateIn2: 'mat en 2', mateIn3: 'mat en 3',
    mate: 'mat', defensiveMove: 'coup de défense', discoveredAttack: 'attaque à la découverte', trappedPiece: 'pièce piégée', endgame: 'finale',
    middlegame: 'milieu de partie', opening: 'ouverture', sacrifice: 'sacrifice', deflection: 'déviation', attraction: 'attraction', backRankMate: 'mat du couloir',
    advantage: 'gain d’avantage', crushing: 'gain décisif', short: 'court', long: 'long', oneMove: 'un coup', doubleCheck: 'échec double',
    capturingDefender: 'capture du défenseur', exposedKing: 'roi exposé', kingsideAttack: 'attaque à l’aile roi', promotion: 'promotion',
    intermezzo: 'coup intermédiaire', quietMove: 'coup tranquille', xRayAttack: 'attaque rayons X', zugzwang: 'zugzwang', rookEndgame: 'finale de tours',
    pawnEndgame: 'finale de pions', smotheredMate: 'mat à l’étouffée', anastasiaMate: 'mat d’Anastasia', arabianMate: 'mat arabe',
  };

  let app = null;
  let board = null;
  const P = {
    theme: 'mine',
    level: 'easiest',
    queues: new Map(), // thème -> puzzles en attente
    mixI: 0,
    cur: null, // { id, rating, themes, fen, pre, last, sol, k, color, state: 'play'|'wrong'|'solved'|'failed'|'loading', failed, hint }
    loading: false,
  };

  /* ---------------- Progression ---------------- */
  const blank = () => ({ v: 1, rating: 600, ok: 0, ko: 0, streak: 0, best: 0, seen: [], themes: {} });
  let stats = null;
  const S = () => (stats = stats || Object.assign(blank(), CC.store.get(KEY, {})));
  const saveStats = () => CC.store.set(KEY, S());
  function record(ok, pz) {
    const s = S();
    const expected = 1 / (1 + Math.pow(10, (pz.rating - s.rating) / 400));
    const kf = s.ok + s.ko < 20 ? 40 : 24;
    s.rating = Math.max(100, Math.round(s.rating + kf * ((ok ? 1 : 0) - expected)));
    if (ok) {
      s.ok++;
      s.streak++;
      s.best = Math.max(s.best, s.streak);
    } else {
      s.ko++;
      s.streak = 0;
    }
    const t = (s.themes[pz.theme] = s.themes[pz.theme] || { ok: 0, ko: 0 });
    if (ok) t.ok++;
    else t.ko++;
    saveStats();
  }

  /* ---------------- Récupération des puzzles ---------------- */
  async function getJSON(url) {
    const res = await fetch(url);
    if (res.status === 429) throw new Error('lichess : trop de demandes, réessaie dans une minute.');
    if (!res.ok) throw new Error('Puzzles lichess indisponibles (' + res.status + ').');
    return res.json();
  }
  /** Sans compte, lichess renvoie toujours la même série par thème : on la prend en entier (50),
   *  puis, une fois tout vu, on passe aux puzzles au hasard (un par un). */
  async function fetchBatch(theme) {
    const seen = new Set(S().seen);
    const keep = (list) => list.filter((x) => x && x.puzzle && !seen.has(x.puzzle.id)).map((x) => toPuzzle(x, theme)).filter(Boolean);
    const j = await getJSON(`${API}${encodeURIComponent(theme)}?nb=50&difficulty=${P.level}`);
    let out = keep(j.puzzles || []);
    if (out.length) return out;
    const more = await Promise.all([0, 1, 2].map(() => getJSON(`https://lichess.org/api/puzzle/next?angle=${encodeURIComponent(theme)}&difficulty=${P.level}`).catch(() => null)));
    out = keep(more);
    return out.filter((pz, i) => out.findIndex((x) => x.id === pz.id) === i);
  }
  /** Position du puzzle : on rejoue la partie jusqu'au dernier coup adverse */
  function toPuzzle(x, theme) {
    const ch = new Chess();
    const sans = String(x.game.pgn || '').trim().split(/\s+/);
    let last = null;
    let pre = null;
    for (const s of sans) {
      pre = ch.fen();
      last = ch.move(s);
      if (!last) return null;
    }
    if (!last || !x.puzzle.solution || !x.puzzle.solution.length) return null;
    return {
      id: x.puzzle.id,
      rating: x.puzzle.rating,
      themes: x.puzzle.themes || [],
      theme,
      pre,
      fen: ch.fen(),
      last: last.from + last.to + (last.promotion || ''),
      lastSan: last.san,
      sol: x.puzzle.solution.slice(),
      color: ch.turn(),
    };
  }
  async function nextPuzzle() {
    if (P.loading) return;
    if (P.theme === 'errors') return openErrors();
    const theme = P.theme === 'mine' ? MIX[P.mixI++ % MIX.length] : P.theme;
    const key = theme + '|' + P.level;
    P.loading = true;
    P.cur = null;
    render();
    try {
      let q = P.queues.get(key) || [];
      if (!q.length) {
        q = await fetchBatch(theme);
        if (!q.length) q = await fetchBatch(theme); // tout déjà vu : un deuxième lot
        P.queues.set(key, q);
      }
      const pz = q.shift();
      if (!pz) throw new Error('Plus de puzzles pour ce thème pour l’instant.');
      start(pz);
    } catch (e) {
      P.error = e.message || String(e);
    } finally {
      P.loading = false;
      render();
    }
  }

  /* ---------------- Échiquier ---------------- */
  const uci2 = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
  function checkSq(fen) {
    const ch = new Chess(fen);
    if (!ch.in_check()) return null;
    const t = ch.turn();
    for (const sq of ch.SQUARES) {
      const p = ch.get(sq);
      if (p && p.type === 'k' && p.color === t) return sq;
    }
    return null;
  }
  function show(fen, animate, last) {
    board.setPosition(fen, animate);
    board.setHighlights(last ? [{ sq: last.slice(0, 2), color: HL }, { sq: last.slice(2, 4), color: HL }] : []);
    board.setCheck(checkSq(fen));
  }
  function movable(fen) {
    const ch = new Chess(fen);
    const dests = new Map();
    for (const m of ch.moves({ verbose: true })) {
      if (!dests.has(m.from)) dests.set(m.from, []);
      dests.get(m.from).push(m.to);
    }
    board.setMovable({ color: ch.turn(), dests });
  }

  function start(pz) {
    S().seen = S().seen.concat(pz.id).slice(-600);
    saveStats();
    P.error = null;
    P.cur = Object.assign(pz, { k: 0, state: 'intro', failed: false, cur: pz.fen });
    board.setOrientation(pz.color);
    board.setBadge(null);
    board.setHint(null);
    board.setArrows([]);
    show(pz.pre, false, null);
    setTimeout(() => {
      if (P.cur !== pz) return;
      const ch = new Chess(pz.pre);
      const mv = ch.move(uci2(pz.last));
      show(pz.fen, true, pz.last);
      if (mv) app.sound(mv);
      pz.state = 'play';
      movable(pz.fen);
      render();
    }, 450);
  }

  function userMove(from, to, promo) {
    const pz = P.cur;
    if (!pz || (pz.state !== 'play' && pz.state !== 'wrong')) return;
    const ch = new Chess(pz.cur);
    const mv = ch.move({ from, to, promotion: promo || 'q' });
    if (!mv) return;
    const u = mv.from + mv.to + (mv.promotion || '');
    const want = pz.sol[pz.k];
    board.setHint(null);
    // Bon coup : celui de la solution, ou n'importe quel mat (règle lichess)
    const good = u === want || ch.in_checkmate();
    show(ch.fen(), true, u);
    app.sound(mv);
    if (!good) {
      board.setBadge({ sq: mv.to, cls: 'blunder' });
      board.setMovable(null);
      pz.state = 'wrong';
      if (!pz.failed) {
        pz.failed = true;
        record(false, pz);
      }
      Clawd.set($('#pz-clawd'), 'worried', 'shake');
      render();
      setTimeout(() => {
        if (P.cur !== pz || pz.state !== 'wrong') return;
        board.setBadge(null);
        show(pz.cur, false, pz.k ? pz.sol[pz.k - 1] : pz.last);
        movable(pz.cur);
      }, 900);
      return;
    }
    board.setBadge({ sq: mv.to, cls: 'best' });
    pz.cur = ch.fen();
    pz.k++;
    if (pz.k >= pz.sol.length || ch.in_checkmate()) return solved();
    // Réponse adverse
    board.setMovable(null);
    pz.state = 'reply';
    render();
    setTimeout(() => {
      if (P.cur !== pz) return;
      const c2 = new Chess(pz.cur);
      const r = c2.move(uci2(pz.sol[pz.k]));
      if (!r) return solved();
      board.setBadge(null);
      pz.cur = c2.fen();
      show(pz.cur, true, pz.sol[pz.k]);
      app.sound(r);
      pz.k++;
      pz.state = pz.failed ? 'wrong' : 'play';
      movable(pz.cur);
      render();
    }, 550);
  }

  function solved() {
    const pz = P.cur;
    pz.state = pz.failed ? 'failed' : 'solved';
    board.setMovable(null);
    if (!pz.failed) record(true, pz);
    Clawd.set($('#pz-clawd'), pz.failed ? 'meh' : 'star', pz.failed ? 'bob' : 'jump');
    render();
  }

  function hint() {
    const pz = P.cur;
    if (!pz || (pz.state !== 'play' && pz.state !== 'wrong')) return;
    board.setHint(pz.sol[pz.k].slice(0, 2));
    if (!pz.failed) {
      pz.failed = true;
      record(false, pz);
    }
    pz.hint = true;
    render();
  }
  function solution() {
    const pz = P.cur;
    if (!pz || pz.state === 'solved' || pz.state === 'failed') return;
    if (!pz.failed) {
      pz.failed = true;
      record(false, pz);
    }
    board.setMovable(null);
    board.setHint(null);
    pz.state = 'showing';
    render();
    const step = () => {
      if (P.cur !== pz) return;
      if (pz.k >= pz.sol.length) return solved();
      const ch = new Chess(pz.cur);
      const mv = ch.move(uci2(pz.sol[pz.k]));
      if (!mv) return solved();
      pz.cur = ch.fen();
      show(pz.cur, true, pz.sol[pz.k]);
      app.sound(mv);
      pz.k++;
      setTimeout(step, 750);
    };
    step();
  }

  /* ---------------- Mes erreurs : positions de mes parties ---------------- */
  function openErrors() {
    const sets = CC.InsightsUI && CC.InsightsUI.exerciseSets ? CC.InsightsUI.exerciseSets() : [];
    const set = sets.find((x) => x.items && x.items.length);
    if (!set) {
      app.toast('Analyse d’abord tes parties dans « Faiblesses » : j’en tirerai tes propres puzzles.');
      P.theme = 'mine';
      render();
      return;
    }
    CC.RepUI.startExercises(set.items, set.title);
  }

  /* ---------------- Rendu ---------------- */
  const side = (c) => (c === 'w' ? 'Blancs' : 'Noirs');
  function render() {
    const pz = P.cur;
    const s = S();
    $('#pz-themes').innerHTML = THEMES.map((t) => `<button class="chip${P.theme === t.k ? ' on' : ''}" data-theme="${t.k}">${t.label}</button>`).join('');
    $$('#pz-level .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.v === P.level));
    $('#pz-stats').innerHTML =
      `<div class="pz-stat"><b>${s.rating}</b><span>ton niveau</span></div>` +
      `<div class="pz-stat"><b>${s.ok}</b><span>réussis</span></div>` +
      `<div class="pz-stat"><b>${s.streak}</b><span>série${s.best ? ` (record ${s.best})` : ''}</span></div>`;
    let msg = '';
    let foot = '';
    if (P.error) {
      msg = `<b>Oups.</b> ${CC.esc(P.error)}`;
      foot = '<button class="btn btn-primary" data-next>Réessayer</button>';
    } else if (P.loading || !pz) {
      msg = '<span class="cc-spin">✻</span> Je te choisis un puzzle…';
    } else {
      const toMove = `Trait aux <b>${side(pz.color)}</b>`;
      if (pz.state === 'intro') msg = `${toMove} : regarde bien le dernier coup adverse…`;
      else if (pz.state === 'play') msg = pz.k ? '<b>Bien !</b> Continue, ce n’est pas fini.' : `${toMove}. Trouve le meilleur coup !${pz.hint ? ' (indice : la pièce en surbrillance)' : ''}`;
      else if (pz.state === 'wrong') msg = '<b>Pas ça.</b> Regarde les échecs, les captures et les menaces, puis réessaie.';
      else if (pz.state === 'reply') msg = '<b>Bien vu !</b> L’adversaire répond…';
      else if (pz.state === 'showing') msg = 'Voici la solution…';
      else if (pz.state === 'solved') msg = `<b>Réussi !</b> ${pz.themes.filter((t) => THEME_FR[t]).slice(0, 3).map((t) => THEME_FR[t]).join(' · ')}`;
      else if (pz.state === 'failed') msg = `Pas grave, retiens l’idée : <b>${pz.themes.filter((t) => THEME_FR[t]).slice(0, 3).map((t) => THEME_FR[t]).join(' · ')}</b>.`;
      const done = pz.state === 'solved' || pz.state === 'failed';
      if (done) {
        msg += `<div class="pz-meta">Puzzle noté ${pz.rating} · <a href="https://lichess.org/training/${pz.id}" target="_blank" rel="noopener">voir sur lichess ↗</a></div>`;
        foot = '<button class="btn btn-primary" data-next>Puzzle suivant ›</button>';
      } else {
        foot = '<button class="btn" data-hint>💡 Indice</button><button class="btn" data-solution>Solution</button><button class="btn" data-next>Passer</button>';
      }
    }
    $('#pz-msg').innerHTML = msg;
    $('#pz-foot').innerHTML = foot;
    $('#pz-turn').innerHTML = pz ? `<span class="pz-dot ${pz.color}"></span>Tu joues les ${side(pz.color)}` : '';
  }
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------------- Initialisation ---------------- */
  const UI = (CC.PuzzleUI = {});
  UI.init = function (a) {
    app = a;
    board = new CC.Board($('#pz-board'), { orientation: 'w' });
    board.onUserMove = userMove;
    board.setPosition(CC.START_FEN, false);
    Clawd.set($('#pz-clawd'), 'happy', 'bob');
    const saved = CC.store.get('cc.pz.prefs', null);
    if (saved) {
      if (THEMES.some((t) => t.k === saved.theme) && saved.theme !== 'errors') P.theme = saved.theme;
      if (LEVELS.some((l) => l.k === saved.level)) P.level = saved.level;
    }
    $('#view-puzzles').addEventListener('click', (e) => {
      const t = e.target;
      const th = t.closest('[data-theme]');
      if (th) {
        P.theme = th.dataset.theme;
        CC.store.set('cc.pz.prefs', { theme: P.theme, level: P.level });
        if (P.theme === 'errors') {
          render();
          return openErrors();
        }
        return nextPuzzle();
      }
      const lv = t.closest('#pz-level [data-v]');
      if (lv) {
        P.level = lv.dataset.v;
        CC.store.set('cc.pz.prefs', { theme: P.theme, level: P.level });
        return nextPuzzle();
      }
      if (t.closest('[data-next]')) return nextPuzzle();
      if (t.closest('[data-hint]')) return hint();
      if (t.closest('[data-solution]')) return solution();
    });
  };
  UI.show = function () {
    if (!P.cur && !P.loading) nextPuzzle();
    else render();
  };
  window.__pz = { P, S, board: () => board };
})(window);
