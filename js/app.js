/* Clawd Coach — application (vues, navigation, bilan, réessai, variantes, réglages) */
(function () {
  'use strict';
  const CC = window.CC;
  const A = CC.Analysis;
  const Chess = window.Chess;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const PRESETS = {
    fast: { depth: 11, movetime: 600, label: 'Rapide' },
    normal: { depth: 14, movetime: 1800, label: 'Normale' },
    deep: { depth: 18, movetime: 3500, label: 'Profonde' },
  };
  const DEFAULTS = { depth: 'normal', board: 'claude', sound: true, arrows: true, apiKey: '', model: 'claude-opus-5-5', threads: 'auto', aiProvider: '', geminiKey: '', geminiModel: 'gemini-3.5-flash' };
  const VERBS = ['Cogite', 'Calcule', 'Mijote', 'Rumine', 'Gamberge', 'Phosphore', 'Mouline', 'Turbine', 'Fignole', 'Décortique', 'Médite', 'Triture', 'Peaufine', 'Combine', 'Jongle', 'Échafaude'];
  const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
  const VAR_HL = 'rgba(244, 196, 79, .45)';
  const G_DOTS = { brilliant: 1, great: 1, miss: 1, mistake: 1, blunder: 1 };

  const ICON = {
    first: '<svg viewBox="0 0 24 24"><path d="M6 5v14M18 6l-7 6 7 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    last: '<svg viewBox="0 0 24 24"><path d="M18 5v14M6 6l7 6-7 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M10 8.2v7.6l6-3.8z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M9.3 8.3h2v7.4h-2zM12.7 8.3h2v7.4h-2z" fill="currentColor"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.9 6.3.6-4.8 4.3 1.4 6.3L12 16.9 6.4 20.1l1.4-6.3L3 9.5l6.3-.6z" fill="currentColor"/></svg>',
    retry: '<svg viewBox="0 0 24 24"><path d="M12 5a7 7 0 1 1-6.6 4.7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M4 4.5l1.4 5.2 5.2-1.4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
    bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M10 6l-6 6 6 6M4.5 12H20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    key: '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.6 6.4 6.6.4-5.1 4.2 1.7 6.6L12 16.8l-5.8 3.6 1.7-6.6-5.1-4.2 6.6-.4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  };
  const TIME_ICON = {
    bullet: '<svg class="ti ti-bullet" viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="19" rx="3" transform="rotate(45 12 12)" fill="currentColor"/></svg>',
    blitz: '<svg class="ti ti-blitz" viewBox="0 0 24 24"><path d="M13.5 2L4.5 13.5H11l-1.5 8.5 9-11.5H12z" fill="currentColor"/></svg>',
    rapid: '<svg class="ti ti-rapid" viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 13.5V9.5M9.5 2.8h5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    daily: '<svg class="ti ti-daily" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.6" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  };
  const TIME_FR = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapide', daily: 'Daily' };

  const S = {
    settings: Object.assign({}, DEFAULTS, CC.store.get('cc.settings', {})),
    username: CC.store.get('cc.username', '') || 'Theking7252', // pseudo par défaut du propriétaire
    profile: null,
    stats: null,
    games: [],
    archives: [],
    archiveCursor: -1,
    filter: 'all',
    loadingGames: false,
    game: null,
    evals: null,
    review: null,
    userColor: 'w',
    orientation: 'w',
    mode: null,
    ply: 0,
    variation: null,
    retry: null,
    run: 0,
    varToken: 0,
    autoTimer: null,
    varTimer: null,
    verbTimer: null,
    verbIdx: 0,
    progDone: 0,
    lastScore: null,
    lastMood: null,
    avatars: {},
    ai: new Map(),
    index: CC.store.get('cc.an.index', {}),
  };
  if (!PRESETS[S.settings.depth]) S.settings.depth = 'normal';

  const engine = new CC.Engine(); // moteur interactif (variantes, réessai)
  const pool = new CC.EnginePool(); // moteurs parallèles (analyse des parties)
  let board = null;

  /* =================== Sons (synthétisés, sans fichier) =================== */
  const Sound = (() => {
    let ctx = null;
    function click(t, freq, gain, dur) {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f);
      f.connect(g);
      g.connect(ctx.destination);
      src.start(t);
    }
    function tone(t, freq, gain, dur) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
    /* Son des pièces : le fichier choisi par l'utilisateur (assets/sounds/move.wav),
       joué via un petit groupe d'éléments <audio> pour enchaîner les coups sans coupure. */
    const SAMPLE = 'assets/sounds/move.wav';
    const voices = [];
    let vi = 0;
    let sampleOk = true;
    function sample(vol, rate) {
      if (!sampleOk) return false;
      try {
        if (!voices.length) {
          for (let k = 0; k < 4; k++) {
            const a = new Audio(SAMPLE);
            a.preload = 'auto';
            a.onerror = () => (sampleOk = false);
            voices.push(a);
          }
        }
        const a = voices[vi++ % voices.length];
        a.volume = vol;
        a.preservesPitch = false;
        a.playbackRate = rate || 1;
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
        return true;
      } catch (e) {
        sampleOk = false;
        return false;
      }
    }
    function play(kind) {
      if (!S.settings.sound) return;
      if (kind === 'move' && sample(0.85, 1)) return;
      if (kind === 'capture' && sample(1, 0.9)) return;
      if (kind === 'castle' && sample(0.85, 1)) {
        setTimeout(() => sample(0.6, 1.08), 95);
        return;
      }
      if (kind === 'check' && sample(0.9, 1)) {
        try {
          ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
          if (ctx.state === 'suspended') ctx.resume();
          tone(ctx.currentTime + 0.03, 880, 0.04, 0.14);
        } catch (e) {
          /* pas d'audio synthétisé */
        }
        return;
      }
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const t = ctx.currentTime + 0.005;
        if (kind === 'move') click(t, 1900, 0.55, 0.055);
        else if (kind === 'capture') {
          click(t, 1300, 0.85, 0.075);
          click(t + 0.03, 2300, 0.35, 0.05);
        } else if (kind === 'castle') {
          click(t, 1900, 0.5, 0.05);
          click(t + 0.09, 1700, 0.5, 0.05);
        } else if (kind === 'check') {
          click(t, 1600, 0.6, 0.06);
          tone(t + 0.02, 880, 0.05, 0.14);
        } else if (kind === 'success') {
          tone(t, 660, 0.06, 0.12);
          tone(t + 0.1, 990, 0.06, 0.18);
        } else if (kind === 'fail') tone(t, 300, 0.05, 0.2);
      } catch (e) {
        /* audio indisponible */
      }
    }
    return { play };
  })();
  function moveSound(mv) {
    if (!mv) return;
    if (mv.san.includes('+') || mv.san.includes('#')) Sound.play('check');
    else if (mv.captured) Sound.play('capture');
    else if (mv.flags && (mv.flags.includes('k') || mv.flags.includes('q'))) Sound.play('castle');
    else Sound.play('move');
  }

  /* =================== Utilitaires UI =================== */
  function toast(msg) {
    const t = $('#toast');
    t.innerHTML = msg;
    t.classList.add('show');
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }
  function saveSettings() {
    CC.store.set('cc.settings', S.settings);
  }
  function setHash(params) {
    const s = new URLSearchParams(params).toString();
    try {
      history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
    } catch (e) {
      location.hash = s;
    }
  }
  const fenAt = (p) => (p <= 0 ? S.game.startFen : S.game.moves[p - 1].fenAfter);
  function currentFen() {
    if (S.retry) return S.retry.curFen || S.retry.fen;
    const v = S.variation;
    if (v) return v.idx >= 0 ? v.line[v.idx].fen : fenAt(v.base);
    return fenAt(S.ply);
  }
  function checkSquare(fen) {
    const ch = new Chess(fen);
    if (!ch.in_check()) return null;
    const turn = ch.turn();
    for (const sq of ch.SQUARES) {
      const p = ch.get(sq);
      if (p && p.type === 'k' && p.color === turn) return sq;
    }
    return null;
  }
  const evalChip = (score) =>
    score ? `<span class="eval-chip ${score.cp >= 0 ? 'w' : 'b'}">${CC.fmtEval(score)}</span>` : '';
  function fmtClock(sec) {
    const s = Math.max(0, sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = Math.floor(s % 60);
    const p2 = (x) => String(x).padStart(2, '0');
    if (h) return `${h}:${p2(m)}:${p2(ss)}`;
    if (s < 20) return `${m}:${p2(ss)}.${Math.floor((s * 10) % 10)}`;
    return `${m}:${p2(ss)}`;
  }
  function avatarHTML(name, color) {
    const url = S.avatars[(name || '').toLowerCase()];
    return url ? `<img src="${CC.esc(url)}" alt="" loading="lazy">` : `<img src="assets/pieces/${color}P.svg" alt="" class="pawn">`;
  }
  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const now = new Date();
    const opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('fr-FR', opts);
  }
  function setBtnLoading(sel, on) {
    const b = $(sel);
    if (!b) return;
    b.disabled = on;
    b.classList.toggle('loading', on);
  }
  function setMood(mood, anim, force) {
    const key = mood + '|' + anim;
    if (!force && key === S.lastMood) return;
    S.lastMood = key;
    Clawd.set($('#coach-clawd'), mood || 'idle', anim === undefined ? 'bob' : anim);
  }

  /* Spinner façon Claude Code */
  let spinIdx = 0;
  setInterval(() => {
    const els = document.querySelectorAll('.cc-spin');
    if (!els.length) return;
    spinIdx = (spinIdx + 1) % SPIN.length;
    els.forEach((el) => (el.textContent = SPIN[spinIdx]));
  }, 120);

  function setEngineStatus(s) {
    const el = $('#engine-status');
    if (!el) return;
    el.dataset.state = s;
    $('.es-label', el).textContent =
      { loading: 'Stockfish se réveille…', ready: 'Stockfish prêt', busy: 'Stockfish calcule…', error: 'Stockfish indisponible' }[s] ||
      'Stockfish';
  }

  /* =================== Vues =================== */
  function showView(name) {
    $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + name));
    $$('.nav-item[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
    document.body.dataset.view = name;
    if (name !== 'review') {
      stopAuto();
      stopVarAuto();
    }
    if (name === 'home' && S.games.length) renderGames();
    if (name === 'insights' && CC.InsightsUI) CC.InsightsUI.show();
    if (name === 'chat' && CC.ChatUI) CC.ChatUI.show();
    if (name === 'rep' && CC.RepUI) CC.RepUI.show();
  }
  function hero(html, mood, anim) {
    $('#hero-bubble').innerHTML = html;
    Clawd.set($('#hero-clawd'), mood || 'idle', anim === undefined ? 'bob' : anim);
  }

  /* =================== Accueil : parties chess.com =================== */
  async function loadGames(name, openId) {
    name = String(name || '').trim().replace(/^@/, '');
    if (!name) {
      hero('Il me faut ton pseudo chess.com 🙂', 'meh');
      return;
    }
    if (S.loadingGames) return;
    S.loadingGames = true;
    showView('home');
    hero(`Je fouille les archives de <b>${CC.esc(name)}</b>…`, 'thinking', 'walk');
    setBtnLoading('#form-user button[type=submit]', true);
    $('#games-card').hidden = false;
    $('#games-list').innerHTML = '<div class="skeleton"></div>'.repeat(6);
    try {
      const archives = await CC.ChessCom.archives(name);
      S.username = name;
      CC.store.set('cc.username', name);
      S.archives = archives;
      S.archiveCursor = archives.length - 1;
      S.games = [];
      S.profile = null;
      $('#profile').hidden = true;
      await loadMoreGames(25);
      renderGames();
      loadProfile(name);
      setHash({ u: name });
      if (!S.games.length) hero(`Aucune partie trouvée pour <b>${CC.esc(name)}</b>. Joue une partie et reviens me voir !`, 'meh');
      else hero(`J’ai trouvé tes parties, <b>${CC.esc(displayName())}</b> ! Choisis-en une et je te fais le bilan coup par coup.`, 'happy', 'jump');
      if (openId) {
        const g = S.games.find((x) => CC.ChessCom.gameId(x.url) === openId) || (await CC.ChessCom.findGame(name, openId, 6));
        if (g) openChessComGame(g, name);
      }
    } catch (e) {
      $('#games-card').hidden = true;
      hero(
        e.code === 'notfound'
          ? `Je ne trouve pas <b>${CC.esc(name)}</b> sur chess.com 🤔 Vérifie l’orthographe du pseudo.`
          : CC.esc(e.message || String(e)),
        'worried',
        null
      );
    } finally {
      S.loadingGames = false;
      setBtnLoading('#form-user button[type=submit]', false);
    }
  }

  async function loadMoreGames(min) {
    let added = 0;
    while (S.archiveCursor >= 0 && added < min) {
      const games = await CC.ChessCom.month(S.archives[S.archiveCursor]);
      S.archiveCursor--;
      S.games.push(...games);
      added += games.length;
    }
    $('#btn-more').hidden = S.archiveCursor < 0;
  }

  function displayName() {
    const me = S.username.toLowerCase();
    for (const g of S.games) {
      if (g.white.username.toLowerCase() === me) return g.white.username;
      if (g.black.username.toLowerCase() === me) return g.black.username;
    }
    return S.username;
  }

  async function loadProfile(name) {
    try {
      const [p, st] = await Promise.all([CC.ChessCom.profile(name), CC.ChessCom.stats(name).catch(() => null)]);
      if (name !== S.username) return;
      S.profile = p;
      S.stats = st;
      S.avatars[name.toLowerCase()] = p.avatar || null;
      renderProfile();
    } catch (e) {
      /* facultatif */
    }
  }

  function renderProfile() {
    const p = S.profile;
    if (!p) return;
    const st = S.stats || {};
    const r = (k) => (st[k] && st[k].last ? st[k].last.rating : null);
    const items = [
      ['bullet', r('chess_bullet')],
      ['blitz', r('chess_blitz')],
      ['rapid', r('chess_rapid')],
      ['daily', r('chess_daily')],
    ].filter((x) => x[1]);
    const el = $('#profile');
    el.hidden = false;
    el.innerHTML =
      `<div class="prof-avatar">${p.avatar ? `<img src="${CC.esc(p.avatar)}" alt="">` : '<img src="assets/pieces/wP.svg" alt="" class="pawn">'}</div>` +
      `<div class="prof-main"><div class="prof-name">${p.title ? `<span class="title-badge">${CC.esc(p.title)}</span>` : ''}${CC.esc(displayName())}</div>` +
      `<div class="prof-ratings">${items.map(([k, v]) => `<span class="rating-chip">${TIME_ICON[k]}<span>${TIME_FR[k]}</span><b>${v}</b></span>`).join('')}</div></div>` +
      (p.url ? `<a class="btn btn-ghost" href="${CC.esc(p.url)}" target="_blank" rel="noopener">Profil chess.com ↗</a>` : '');
  }

  function filteredGames() {
    return S.games.filter((g) => S.filter === 'all' || g.time_class === S.filter);
  }

  function renderGames() {
    const list = filteredGames();
    const el = $('#games-list');
    if (!list.length) {
      el.innerHTML = `<div class="empty">Aucune partie${S.filter !== 'all' ? ' dans cette cadence' : ''} pour l’instant.</div>`;
      return;
    }
    const me = S.username.toLowerCase();
    el.innerHTML =
      '<div class="grow ghead"><span class="h-type"></span><span class="h-players">Joueurs</span><span class="h-result">Résultat</span>' +
      '<span class="h-acc" title="Ta précision (✻ = calculée ici)">Précision</span><span class="h-moves">Coups</span><span class="h-date">Date</span><span class="h-go"></span></div>' +
      list.map((g) => gameRow(g, me)).join('');
  }

  function gameRow(g, me) {
    const id = CC.ChessCom.gameId(g.url);
    const meWhite = g.white.username.toLowerCase() === me;
    const my = meWhite ? g.white : g.black;
    const res = CC.ChessCom.resultCode(my.result);
    const nMoves = (() => {
      const m = String(g.pgn || '').match(/(\d+)\.(?:\s|\.\.\.)/g);
      return m ? parseInt(m[m.length - 1], 10) : '';
    })();
    const idx = S.index['cc-' + id];
    const ours = idx && idx.acc ? (meWhite ? idx.acc.w : idx.acc.b) : null;
    const theirs = g.accuracies ? (meWhite ? g.accuracies.white : g.accuracies.black) : null;
    let acc = '—';
    if (ours != null) acc = `<span class="acc-ours" title="Précision calculée par Clawd Coach">✻ ${ours.toFixed(1)}</span>`;
    else if (theirs != null) acc = theirs.toFixed(1);
    const variant = g.rules && g.rules !== 'chess';
    const pl = (p, c) =>
      `<span class="g-pl${p.username.toLowerCase() === me ? ' me' : ''}"><i class="sq-${c}"></i>${CC.esc(p.username)} <em>(${p.rating})</em></span>`;
    return (
      `<button class="grow${variant ? ' disabled' : ''}" data-id="${id}" title="${variant ? 'Variante non prise en charge' : 'Analyser cette partie'}">` +
      `<span class="g-type" title="${TIME_FR[g.time_class] || g.time_class}">${TIME_ICON[g.time_class] || ''}</span>` +
      `<span class="g-players">${pl(g.white, 'w')}${pl(g.black, 'b')}</span>` +
      `<span class="g-result ${res}" title="${CC.esc(CC.ChessCom.resultLabel(my.result))}">${res === 'win' ? '+' : res === 'loss' ? '−' : '='}</span>` +
      `<span class="g-acc">${acc}</span><span class="g-moves">${nMoves}</span><span class="g-date">${fmtDate(g.end_time)}</span>` +
      `<span class="g-go">${idx ? 'Revoir' : 'Analyser'}</span></button>`
    );
  }

  function openChessComGame(g, meName) {
    if (g.rules && g.rules !== 'chess') {
      toast(`Variante non prise en charge (${CC.esc(g.rules)})`);
      return;
    }
    let game;
    try {
      game = A.fromChessCom(g);
    } catch (e) {
      toast(CC.esc(e.message));
      return;
    }
    const me = String(meName || S.username || '').toLowerCase();
    const pref = game.black.name.toLowerCase() === me ? 'b' : game.white.name.toLowerCase() === me ? 'w' : 'auto';
    setHash({ u: S.username || meName || '', g: game.id });
    openGame(game, pref);
    fetchAvatars(game);
  }

  function fetchAvatars(game) {
    for (const p of [game.white, game.black]) {
      const k = p.name.toLowerCase();
      if (S.avatars[k] !== undefined) continue;
      S.avatars[k] = null;
      CC.ChessCom.profile(p.name)
        .then((prof) => {
          S.avatars[k] = prof.avatar || null;
          if (S.game === game) {
            renderStrips();
            if (S.mode === 'summary') renderSummary();
          }
        })
        .catch(() => {});
    }
  }

  async function openLink() {
    const url = $('#in-link').value.trim();
    const id = CC.ChessCom.gameId(url);
    const name = ($('#in-link-user').value.trim() || S.username).replace(/^@/, '');
    if (!id) {
      hero('Ce lien ne ressemble pas à une partie chess.com 🤔<br><span class="muted">Exemple : https://www.chess.com/game/live/123456789</span>', 'meh');
      return;
    }
    if (!name) {
      hero('Indique aussi le pseudo d’un des deux joueurs : je retrouve la partie dans ses archives.', 'meh');
      return;
    }
    const local = S.games.find((g) => CC.ChessCom.gameId(g.url) === id);
    if (local) {
      openChessComGame(local, name);
      return;
    }
    hero(`Je cherche la partie <b>${id}</b> dans les archives de <b>${CC.esc(name)}</b>…`, 'thinking', 'walk');
    setBtnLoading('#form-link button[type=submit]', true);
    try {
      const g = await CC.ChessCom.findGame(name, id, 12);
      if (!g) {
        hero('Partie introuvable dans les 12 derniers mois de ce joueur 😕', 'worried', null);
        return;
      }
      if (!S.username) {
        S.username = name;
        CC.store.set('cc.username', name);
      }
      hero('Trouvée ! 🎯', 'happy', 'jump');
      openChessComGame(g, name);
    } catch (e) {
      hero(e.code === 'notfound' ? 'Ce pseudo est introuvable sur chess.com.' : CC.esc(e.message), 'worried', null);
    } finally {
      setBtnLoading('#form-link button[type=submit]', false);
    }
  }

  function openPGN() {
    let game;
    try {
      game = A.fromPGN($('#in-pgn').value);
    } catch (e) {
      hero('Je n’arrive pas à lire ce PGN : ' + CC.esc(e.message), 'worried', null);
      return;
    }
    let pref = $('#in-pgn-color').value;
    if (pref === 'auto') {
      const me = S.username.toLowerCase();
      pref = me && game.black.name.toLowerCase() === me ? 'b' : 'w';
    }
    setHash({});
    openGame(game, pref);
    if (/chess\.com/i.test(game.headers.Site || '')) fetchAvatars(game);
  }

  /* =================== Ouverture d'une partie & analyse =================== */
  function openGame(game, pref, opts) {
    cancelAnalysis();
    stopAuto();
    stopVarAuto();
    S.game = game;
    S.evals = null;
    S.review = null;
    S.variation = null;
    S.retry = null;
    S.ai = new Map();
    S.pending = opts || null;
    S.userColor = pref === 'b' ? 'b' : 'w';
    S.orientation = S.userColor;
    board.setOrientation(S.orientation);
    S.ply = 0;
    $('.nav-item[data-nav="review"]').disabled = false;
    showView('review');
    renderStrips();
    renderGamePosition(false);
    const cached = loadCache(game);
    if (cached) {
      S.evals = cached.evals;
      S.evalsDepth = cached.depth;
      finishAnalysis();
    } else runAnalysis();
  }

  /** Rouvre une partie mémorisée dans « Mes faiblesses » (et lance « Réessayer » sur un coup) */
  function openFromFacts(f, retryAt) {
    let game;
    try {
      game = A.fromPGN(f.pgn);
    } catch (e) {
      toast('Impossible de rouvrir cette partie : ' + CC.esc(e.message));
      return;
    }
    Object.assign(game, { key: f.key, id: f.id, source: f.src, url: f.url, timeClass: f.tc, endTime: f.t });
    openGame(game, f.color, retryAt != null ? { retryAt } : null);
    if (f.src === 'chesscom') fetchAvatars(game);
  }

  /** Nombre de Stockfish lancés en parallèle */
  function threadCount() {
    const t = S.settings.threads;
    if (t && t !== 'auto') return CC.clamp(parseInt(t, 10) || 1, 1, 12);
    return CC.clamp((navigator.hardwareConcurrency || 4) - 2, 1, 8);
  }

  /** Analyse toutes les positions d'une partie en parallèle ; les positions théoriques sont survolées */
  function analyzeGame(game, preset, cb) {
    const fens = [game.startFen].concat(game.moves.map((m) => m.fenAfter));
    const bookPlies = game.standardStart ? A.identifyOpening(game.moves.map((m) => m.san)).bookPlies : 0;
    const full = Object.assign({}, preset, { owner: cb.owner });
    const light = { depth: Math.min(preset.depth, 10), movetime: Math.min(preset.movetime, 300), owner: cb.owner };
    return pool.run(fens, threadCount(), (fen, eng, k) => A.evalPosition(fen, eng, k < bookPlies ? light : full), cb);
  }

  async function runAnalysis() {
    const run = ++S.run;
    const owner = 'game-' + run;
    const game = S.game;
    const preset = PRESETS[S.settings.depth] || PRESETS.normal;
    const N = game.moves.length;
    const evals = new Array(N + 1).fill(null);
    S.evals = evals;
    S.evalsDepth = S.settings.depth;
    S.review = null;
    S.mode = 'loading';
    S.ply = 0;
    S.runOwner = owner;
    renderGamePosition(false);
    renderPanel();
    const t0 = Date.now();
    startSpinner(t0, N + 1);
    let done = 0;
    let frame = 0;
    try {
      await analyzeGame(game, preset, {
        owner,
        isCancelled: () => run !== S.run,
        onDone: (k, ev) => {
          if (run !== S.run) return;
          evals[k] = ev;
          done++;
          updateProgress(done, N + 1, t0);
          if (!frame) {
            frame = requestAnimationFrame(() => {
              frame = 0;
              if (run === S.run) renderGraph();
            });
          }
          if (k === 0) updateEvalBar(ev.lines[0].score);
        },
      });
    } catch (e) {
      if (run !== S.run) return;
      stopSpinner();
      setBubble({
        title: 'Oups, le moteur a planté',
        text: CC.esc(e.message || String(e)),
        mood: 'shocked',
        anim: 'shake',
        actions: '<button class="btn btn-sm btn-primary" data-act="retry-analysis">Relancer l’analyse</button>',
      });
      return;
    }
    stopSpinner();
    if (run !== S.run || evals.some((e) => !e)) return;
    saveCache(game, evals, S.settings.depth);
    finishAnalysis();
  }

  function cancelAnalysis() {
    S.run++;
    stopSpinner();
    if (S.runOwner) pool.stop(S.runOwner);
    S.runOwner = null;
  }

  function finishAnalysis() {
    S.review = A.review(S.game, S.evals);
    S.index[S.game.key] = { t: Date.now(), acc: S.review.accuracy };
    CC.store.set('cc.an.index', S.index);
    // Alimente « Mes faiblesses » quand c'est une partie du joueur
    const me = S.username.toLowerCase();
    const mine = (S.userColor === 'w' ? S.game.white.name : S.game.black.name) || '';
    if (me && mine.toLowerCase() === me) {
      try {
        CC.Insights.save(CC.Insights.facts(S.game, S.review, S.evals, S.userColor, S.evalsDepth));
      } catch (e) {
        console.warn('[insights]', e);
      }
    }
    S.mode = 'summary';
    S.variation = null;
    S.retry = null;
    S.ply = S.game.moves.length;
    renderGamePosition(false);
    renderStrips();
    renderPanel();
    if (!$('#view-home').hidden) renderGames();
    const pend = S.pending;
    S.pending = null;
    if (pend && pend.retryAt != null && S.review.moves[pend.retryAt]) {
      setPly(pend.retryAt + 1, false);
      startRetry();
    }
  }

  /* Cache local des analyses (par partie et profondeur) */
  const cacheKey = (game, depth) => `cc.an.${game.key}.${depth || S.settings.depth}`;
  function loadCache(game, depth) {
    const order = depth ? [depth] : [S.settings.depth, 'deep', 'normal', 'fast'];
    for (const dk of order) {
      const d = CC.store.get(cacheKey(game, dk), null);
      if (d && d.v === 1 && d.n === game.moves.length && Array.isArray(d.e) && d.e.length === game.moves.length + 1) {
        try {
          return { evals: A.unpackEvals(d.e), depth: dk };
        } catch (e) {
          /* entrée corrompue : on continue */
        }
      }
    }
    return null;
  }
  function saveCache(game, evals, depth) {
    const key = cacheKey(game, depth);
    const data = { v: 1, n: game.moves.length, t: Date.now(), e: A.packEvals(evals) };
    if (!CC.store.set(key, data)) {
      pruneCache(20);
      CC.store.set(key, data);
    }
    pruneCache(150);
  }
  function pruneCache(max) {
    const keys = CC.store.keys('cc.an.').filter((k) => k !== 'cc.an.index');
    if (keys.length <= max) return;
    const items = keys.map((k) => [k, (CC.store.get(k, {}) || {}).t || 0]).sort((a, b) => a[1] - b[1]);
    for (const [k] of items.slice(0, keys.length - max)) CC.store.del(k);
  }

  /* Progression façon Claude Code */
  function startSpinner(t0, total) {
    stopSpinner();
    S.verbIdx = Math.floor(Math.random() * VERBS.length);
    S.progDone = 0;
    let tick = 0;
    S.verbTimer = setInterval(() => {
      tick++;
      if (tick % 3 === 0) {
        S.verbIdx = (S.verbIdx + 1) % VERBS.length;
        const v = $('#cc-verb');
        if (v) v.textContent = VERBS[S.verbIdx] + '…';
      }
      updateProgress(S.progDone, total, t0);
    }, 1000);
    updateProgress(0, total, t0);
  }
  function updateProgress(done, total, t0) {
    S.progDone = done;
    const bar = $('#cc-progress');
    if (bar) bar.style.width = Math.round((done / total) * 100) + '%';
    const meta = $('#cc-meta');
    if (meta) meta.textContent = `(${Math.round((Date.now() - t0) / 1000)} s · ${done}/${total} positions · Échap pour annuler)`;
  }
  function stopSpinner() {
    clearInterval(S.verbTimer);
    S.verbTimer = null;
  }

  /* =================== Panneau de droite =================== */
  function renderPanel() {
    const mode = S.mode;
    $('#summary').hidden = mode !== 'summary';
    $('#movelist').hidden = mode !== 'moves';
    $('#view-review').dataset.mode = mode || '';
    renderFoot();
    renderGraph();
    if (mode === 'loading') renderLoadingBubble();
    else if (mode === 'summary') {
      renderSummary();
      renderSummaryBubble();
    } else if (mode === 'moves') {
      renderMoveList();
      renderCoach();
    }
  }

  function renderFoot() {
    const f = $('#panel-foot');
    if (S.mode === 'loading') f.innerHTML = '<button class="btn btn-wide" data-act="cancel">Annuler l’analyse</button>';
    else if (S.mode === 'summary') f.innerHTML = '<button class="btn btn-primary btn-xl" data-act="start">Commencer le bilan</button>';
    else
      f.innerHTML =
        '<div class="navbtns">' +
        `<button class="btn navb" data-act="first" title="Début (↑)" aria-label="Début">${ICON.first}</button>` +
        `<button class="btn navb" data-act="prev" title="Coup précédent (←)" aria-label="Coup précédent">${ICON.prev}</button>` +
        `<button class="btn navb" data-act="play" title="Lecture automatique (Espace)" aria-label="Lecture">${S.autoTimer ? ICON.pause : ICON.play}</button>` +
        `<button class="btn navb btn-primary" data-act="next" title="Coup suivant (→)" aria-label="Coup suivant">${ICON.next}</button>` +
        `<button class="btn navb" data-act="last" title="Fin (↓)" aria-label="Fin">${ICON.last}</button>` +
        '</div>';
  }

  function setBubble(o) {
    $('#coach-bubble').innerHTML =
      `<div class="bubble-head">${o.icon || ''}<div class="bubble-title">${o.title || ''}</div>${o.chip || ''}</div>` +
      (o.extra || '') +
      (o.text ? `<div class="bubble-text">${o.text}</div>` : '') +
      '<div class="bubble-ai" id="bubble-ai" hidden></div>';
    $('#coach-actions').innerHTML = o.actions || '';
    setMood(o.mood, o.anim, o.force !== false);
  }

  function renderLoadingBubble() {
    const preset = PRESETS[S.settings.depth] || PRESETS.normal;
    setBubble({
      title: 'Analyse de la partie',
      text:
        '<div class="cc-term"><div class="cc-term-line"><span class="cc-spin">✻</span> ' +
        `<span class="cc-verb" id="cc-verb">${VERBS[S.verbIdx] || VERBS[0]}…</span> <span class="cc-meta" id="cc-meta"></span></div>` +
        '<div class="progress"><div class="progress-fill" id="cc-progress"></div></div></div>' +
        `<div class="muted small">Stockfish 10 · profondeur ${preset.depth} · ${S.game.moves.length} demi-coups. Le résultat est gardé en cache : la prochaine fois, c’est instantané.</div>`,
      mood: 'thinking',
      anim: 'walk',
    });
  }

  function aiButton(act, label) {
    return `<button class="btn btn-sm btn-ai" data-act="${act}" title="${CC.AI.hasKey(S.settings) ? 'Explication rédigée par ' + CC.AI.name(S.settings) : 'Ajoute une clé API (Claude ou Gemini) dans les réglages'}"><span class="ai-star">${CC.AI.icon(CC.AI.provider(S.settings))}</span> ${label}</button>`;
  }

  function renderSummaryBubble() {
    const c = CC.Coach.summary({ game: S.game, review: S.review, userColor: S.userColor });
    setBubble({
      title: 'Bilan de la partie',
      text: c.html,
      mood: c.mood,
      anim: c.anim,
      actions: aiButton('ai-game', 'Bilan détaillé par ' + CC.AI.name(S.settings)) + '<button class="btn btn-sm" data-act="chat-game">💬 En parler avec Clawd</button>',
    });
    renderAi('game');
  }

  function renderSummary() {
    const r = S.review;
    const g = S.game;
    const fp = (a) => (a == null ? '—' : a.toFixed(1).replace('.', ','));
    const player = (c) => {
      const p = c === 'w' ? g.white : g.black;
      return `<div class="sum-player${c === S.userColor ? ' me' : ''}" title="${CC.esc(p.name)}"><div class="sum-av">${avatarHTML(p.name, c)}</div><div class="sum-pname">${CC.esc(p.name)}</div></div>`;
    };
    let rows = '';
    for (const k of CC.CLS_ORDER) {
      const meta = CC.CLS[k];
      rows += `<div class="srow"><span class="slabel" style="color:${meta.color}">${meta.label}</span><span class="scount">${r.counts.w[k]}</span><span class="sicon">${CC.icon(k)}</span><span class="scount">${r.counts.b[k]}</span></div>`;
    }
    let phases = '';
    for (const [k, l] of [['opening', 'Ouverture'], ['middlegame', 'Milieu de partie'], ['endgame', 'Finale']]) {
      const pw = r.phases[k].w;
      const pb = r.phases[k].b;
      if (!pw && !pb) continue;
      const cell = (x) => (x ? `<span title="${fp(x.acc)} %">${CC.icon(x.cls)}</span>` : '');
      phases += `<div class="srow phase"><span class="slabel">${l}</span><span class="scount">${cell(pw)}</span><span class="sicon"></span><span class="scount">${cell(pb)}</span></div>`;
    }
    const preset = PRESETS[S.settings.depth] || PRESETS.normal;
    const term = g.headers.Termination ? `<div class="sum-term">${CC.esc(g.headers.Termination)}</div>` : '';
    $('#summary').innerHTML =
      (r.opening ? `<div class="sum-opening"><span class="muted">Ouverture</span> ${CC.esc(r.opening.name)}</div>` : '') +
      term +
      `<div class="srow sum-head"><span class="slabel">Joueurs</span>${player('w')}<span></span>${player('b')}</div>` +
      `<div class="srow sum-acc"><span class="slabel">Précision</span><span class="acc-box w">${fp(r.accuracy.w)}</span><span></span><span class="acc-box b">${fp(r.accuracy.b)}</span></div>` +
      `<div class="sum-sep"></div>${rows}` +
      (phases ? `<div class="sum-sep"></div>${phases}` : '') +
      `<div class="sum-foot muted small">Stockfish 10 · profondeur ${(PRESETS[S.evalsDepth] || preset).depth} · <button class="linkbtn" data-act="reanalyze">↻ Réanalyser</button></div>`;
  }

  function keyNavButtons() {
    if (!S.review || !S.review.keyMoments.length) return '';
    return (
      '<span class="key-nav">' +
      '<button class="btn btn-sm btn-icon" data-act="key-prev" title="Moment clé précédent">◀</button>' +
      '<span class="key-label">Moments clés</span>' +
      '<button class="btn btn-sm btn-icon" data-act="key-next" title="Moment clé suivant">▶</button></span>'
    );
  }

  function renderCoach() {
    if (S.mode !== 'moves') return;
    if (S.retry) return renderRetryBubble(S.retry.state || 'start');
    if (S.variation) return renderVarBubble(S.variation.ev || null);
    if (S.ply === 0) {
      setBubble({
        title: 'C’est parti !',
        chip: evalChip(S.evals[0].lines[0].score),
        text: CC.Coach.intro({ review: S.review }),
        mood: 'happy',
        anim: 'bob',
        actions: keyNavButtons(),
      });
      return;
    }
    const i = S.ply - 1;
    const m = S.review.moves[i];
    const c = CC.Coach.move({ game: S.game, evals: S.evals, review: S.review, i, userColor: S.userColor });
    let acts = '';
    if (!m.isBest && m.bestUci && m.cls !== 'book' && m.cls !== 'forced' && !S.game.moves[i].san.includes('#')) {
      acts += `<button class="btn btn-sm" data-act="best">${ICON.star}Meilleur coup</button>`;
    }
    if (CC.SEVERE[m.cls] && m.color === S.userColor) acts += `<button class="btn btn-sm btn-primary" data-act="retry">${ICON.retry}Réessayer</button>`;
    if (S.evals[S.ply].lines[0].pv.length) acts += `<button class="btn btn-sm" data-act="followup">${ICON.eye}Voir la suite</button>`;
    acts += aiButton('ai-move', 'Pourquoi ?');
    acts += keyNavButtons();
    setBubble({ icon: CC.icon(m.cls), title: c.title, chip: evalChip(S.evals[S.ply].lines[0].score), text: c.html, actions: acts, mood: c.mood, anim: c.anim });
    renderAi('m' + i);
  }

  /* =================== Échiquier & barre d'évaluation =================== */
  function renderGamePosition(animate) {
    const p = S.ply;
    board.setPosition(fenAt(p), animate);
    const hl = [];
    let badge = null;
    const arrows = [];
    if (p > 0) {
      const mv = S.game.moves[p - 1];
      const rm = S.review ? S.review.moves[p - 1] : null;
      const col = rm && S.mode === 'moves' ? CC.hexA(CC.CLS[rm.cls].color, 0.5) : VAR_HL;
      hl.push({ sq: mv.from, color: col }, { sq: mv.to, color: col });
      if (rm && S.mode === 'moves') {
        badge = { sq: mv.to, cls: rm.cls };
        if (S.settings.arrows && !rm.isBest && rm.bestUci && rm.cls !== 'book' && rm.cls !== 'forced' && !mv.san.includes('#')) {
          arrows.push({ from: rm.bestUci.slice(0, 2), to: rm.bestUci.slice(2, 4), color: CC.CLS.best.color });
        }
      }
    }
    board.setHighlights(hl);
    board.setBadge(badge);
    board.setArrows(arrows);
    board.setHint(null);
    board.setCheck(checkSquare(fenAt(p)));
    const e = S.evals && S.evals[p];
    updateEvalBar(e ? e.lines[0].score : null);
    updateMovable();
  }

  function updateEvalBar(score) {
    S.lastScore = score;
    const bar = $('#evalbar');
    const fill = $('.evalbar-fill', bar);
    const label = $('.evalbar-label', bar);
    bar.classList.toggle('flipped', S.orientation === 'b');
    if (!score) {
      fill.style.height = '50%';
      label.textContent = '';
      return;
    }
    const wp = score.mate != null ? (score.cp > 0 ? 100 : 0) : CC.clamp(CC.winWhite(score), 3, 97);
    fill.style.height = wp + '%';
    const whiteAhead = score.cp >= 0;
    const whiteSide = S.orientation === 'w' ? 'bottom' : 'top';
    const pos = whiteAhead ? whiteSide : whiteSide === 'bottom' ? 'top' : 'bottom';
    label.className = `evalbar-label ${pos} ${whiteAhead ? 'on-white' : 'on-black'}`;
    label.textContent = CC.fmtEval(score, true);
  }

  function updateMovable() {
    const can = (S.mode === 'moves' && !S.retry) || (S.retry && !S.retry.locked && !S.retry.solved);
    if (!can || !S.game) {
      board.setMovable(null);
      return;
    }
    const ch = new Chess(currentFen());
    const vs = S.variation && S.variation.vsEngine;
    if (ch.game_over() || (vs && (S.variation.thinking || ch.turn() !== vs))) {
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

  const INIT = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  function materialInfo(fen) {
    const cnt = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    for (const c of fen.split(' ')[0]) {
      const t = c.toLowerCase();
      if (t in INIT) cnt[c === t ? 'b' : 'w'][t]++;
    }
    const caps = { w: [], b: [] };
    for (const c of ['w', 'b']) {
      const o = c === 'w' ? 'b' : 'w';
      for (const t of ['p', 'b', 'n', 'r', 'q']) {
        const miss = Math.max(0, INIT[t] - cnt[o][t]);
        for (let k = 0; k < miss; k++) caps[c].push(t);
      }
    }
    const val = (c) => Object.keys(INIT).reduce((s, t) => s + cnt[c][t] * CC.VAL[t], 0);
    const d = val('w') - val('b');
    return { caps, diff: { w: d, b: -d } };
  }

  function clockAt(c) {
    const g = S.game;
    const upto = S.retry ? S.retry.i : S.variation ? S.variation.base : S.ply;
    let last = null;
    for (let j = 0; j < upto; j++) if (g.moves[j].color === c && g.moves[j].clock != null) last = g.moves[j].clock;
    if (last != null) return last;
    if (!g.moves.some((m) => m.clock != null)) return null;
    const tc = String(g.timeControl || g.headers.TimeControl || '');
    if (tc.includes('/')) return null;
    const base = parseInt(tc.split('+')[0], 10);
    return isFinite(base) ? base : null;
  }

  function renderStrips() {
    if (!S.game) return;
    const bottom = S.orientation;
    const top = bottom === 'w' ? 'b' : 'w';
    const fen = currentFen();
    const mat = materialInfo(fen);
    const toMove = fen.split(' ')[1];
    $('#pstrip-top').innerHTML = strip(top, mat, toMove);
    $('#pstrip-bottom').innerHTML = strip(bottom, mat, toMove);
  }
  function strip(c, mat, toMove) {
    const p = c === 'w' ? S.game.white : S.game.black;
    const opp = c === 'w' ? 'b' : 'w';
    const clock = clockAt(c);
    const caps = mat.caps[c].map((t) => `<img src="assets/pieces/${opp}${t.toUpperCase()}.svg" alt="" class="cap cap-${t}">`).join('');
    const adv = mat.diff[c];
    return (
      `<div class="pavatar">${avatarHTML(p.name, c)}</div>` +
      `<div class="pinfo"><div class="pname"><span class="pn">${CC.esc(p.name)}</span>${p.rating ? `<span class="prating">(${p.rating})</span>` : ''}${c === S.userColor ? '<span class="you-tag">toi</span>' : ''}</div>` +
      `<div class="pcaps">${caps}${adv > 0 ? `<span class="padv">+${adv}</span>` : ''}</div></div>` +
      (clock != null ? `<div class="pclock ${c}${toMove === c && !S.variation && !S.retry ? ' active' : ''}">${fmtClock(clock)}</div>` : '')
    );
  }

  /* =================== Graphe d'évaluation =================== */
  function renderGraph() {
    const g = $('#graph');
    if (!S.game || !S.evals) {
      g.innerHTML = '';
      return;
    }
    const N = S.game.moves.length || 1;
    const W = 1000;
    const H = 100;
    const X = (p) => (p / N) * W;
    const Y = (wp) => H - (wp / 100) * H;
    // L'analyse parallèle remplit le graphe par morceaux : on trace chaque segment contigu
    let d = '';
    let seg = [];
    const flush = () => {
      if (seg.length > 1) {
        d += `M${X(seg[0][0]).toFixed(1)} ${H} ` + seg.map(([p, wp]) => `L${X(p).toFixed(1)} ${Y(wp).toFixed(1)}`).join(' ');
        d += ` L${X(seg[seg.length - 1][0]).toFixed(1)} ${H} Z `;
      }
      seg = [];
    };
    for (let p = 0; p <= S.game.moves.length; p++) {
      const e = S.evals[p];
      if (e) seg.push([p, CC.clamp(CC.winWhite(e.lines[0].score), 1, 99)]);
      else flush();
    }
    flush();
    let html = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="g-area" d="${d}"/><line class="g-mid" x1="0" y1="50" x2="${W}" y2="50"/></svg>`;
    if (S.review) {
      for (const m of S.review.moves) {
        if (!G_DOTS[m.cls]) continue;
        const wp = CC.clamp(S.review.wps[m.i + 1], 4, 96);
        html += `<span class="g-dot" style="left:${(X(m.i + 1) / W) * 100}%;top:${(Y(wp) / H) * 100}%;background:${CC.CLS[m.cls].color}"></span>`;
      }
    }
    html += '<span class="g-cursor" id="g-cursor"></span><span class="g-tip" id="g-tip" hidden></span>';
    g.innerHTML = html;
    renderGraphCursor();
  }
  function renderGraphCursor() {
    const c = $('#g-cursor');
    if (!c || !S.game) return;
    const N = S.game.moves.length || 1;
    const p = S.variation ? S.variation.base : S.retry ? S.retry.i : S.ply;
    c.style.left = (p / N) * 100 + '%';
    c.hidden = S.mode !== 'moves';
  }
  function graphPly(e) {
    const r = $('#graph').getBoundingClientRect();
    const N = S.game.moves.length;
    return CC.clamp(Math.round(((e.clientX - r.left) / r.width) * N), 0, N);
  }

  /* =================== Liste des coups =================== */
  function renderMoveList() {
    const ml = $('#movelist');
    const moves = S.game.moves;
    let html = '';
    let open = false;
    for (let i = 0; i < moves.length; i++) {
      const mv = moves[i];
      const rm = S.review && S.review.moves[i];
      if (mv.color === 'w' || i === 0) {
        if (open) html += '</div>';
        html += `<div class="mrow"><span class="mnum">${parseInt(mv.fenBefore.split(' ')[5], 10) || 1}.</span>`;
        open = true;
        if (mv.color === 'b') html += '<span class="mv empty">…</span>';
      }
      html += `<button class="mv" data-p="${i + 1}">${rm ? CC.icon(rm.cls) : ''}<span>${CC.sanHTML(mv.san)}</span></button>`;
    }
    if (open) html += '</div>';
    ml.innerHTML = html;
    markActiveMove();
  }
  function markActiveMove() {
    const ml = $('#movelist');
    $$('.mv.active', ml).forEach((e) => e.classList.remove('active'));
    const el = $(`.mv[data-p="${S.ply}"]`, ml);
    if (!el) return;
    el.classList.add('active');
    const top = el.offsetTop - ml.offsetTop;
    if (top < ml.scrollTop + 8 || top > ml.scrollTop + ml.clientHeight - 40) ml.scrollTop = top - ml.clientHeight / 2;
  }

  /* =================== Navigation =================== */
  function setPly(p, animate) {
    if (!S.game || !S.review) return;
    p = CC.clamp(p, 0, S.game.moves.length);
    const prev = S.ply;
    S.ply = p;
    S.variation = null;
    S.retry = null;
    S.varToken++;
    stopVarAuto();
    if (S.mode !== 'moves') {
      S.mode = 'moves';
      renderPanel();
    } else {
      renderCoach();
      markActiveMove();
      renderGraphCursor();
    }
    renderGamePosition(animate && Math.abs(p - prev) === 1);
    renderStrips();
    if (animate && p === prev + 1) moveSound(S.game.moves[p - 1]);
  }
  function startReview() {
    stopAuto();
    S.mode = 'moves';
    S.ply = 0;
    renderPanel();
    setPly(1, false);
    moveSound(S.game.moves[0]);
  }
  function navNext() {
    if (!S.review) return;
    if (S.mode === 'summary') {
      startReview();
      return;
    }
    if (S.retry) return;
    if (S.variation) {
      stopVarAuto();
      const v = S.variation;
      if (v.idx < v.line.length - 1) {
        v.idx++;
        renderVariation(true);
      }
      return;
    }
    setPly(S.ply + 1, true);
  }
  function navPrev() {
    if (!S.review) return;
    if (S.retry) {
      exitRetry();
      return;
    }
    if (S.variation) {
      stopVarAuto();
      const v = S.variation;
      if (v.idx >= 0) {
        v.idx--;
        renderVariation(true);
      } else exitVariation();
      return;
    }
    setPly(S.ply - 1, true);
  }
  function navFirst() {
    if (S.review) setPly(0, false);
  }
  function navLast() {
    if (S.review) setPly(S.game.moves.length, false);
  }
  function toggleAuto() {
    if (S.autoTimer) {
      stopAuto();
      return;
    }
    if (!S.review) return;
    if (S.ply >= S.game.moves.length) setPly(0, false);
    S.autoTimer = setInterval(() => {
      if (!S.game || S.ply >= S.game.moves.length || S.variation || S.retry || S.mode !== 'moves') {
        stopAuto();
        return;
      }
      setPly(S.ply + 1, true);
    }, 1300);
    renderFoot();
  }
  function stopAuto() {
    if (!S.autoTimer) return;
    clearInterval(S.autoTimer);
    S.autoTimer = null;
    if (S.mode === 'moves') renderFoot();
  }
  function stopVarAuto() {
    if (S.varTimer) {
      clearInterval(S.varTimer);
      S.varTimer = null;
    }
  }
  function nextKey(dir) {
    const keys = S.review.keyMoments;
    const cur = S.ply - 1;
    const target = dir > 0 ? keys.find((i) => i > cur) : keys.slice().reverse().find((i) => i < cur);
    if (target != null) setPly(target + 1, false);
    else toast(dir > 0 ? 'Plus de moment clé après celui-ci.' : 'Pas de moment clé avant.');
  }
  function flip() {
    S.orientation = S.orientation === 'w' ? 'b' : 'w';
    board.setOrientation(S.orientation);
    renderStrips();
    updateEvalBar(S.lastScore);
  }

  /* =================== Variantes (exploration libre & suites moteur) =================== */
  function lineMove(mv, fenBefore, fenAfter) {
    return {
      san: mv.san,
      uci: mv.from + mv.to + (mv.promotion || ''),
      from: mv.from,
      to: mv.to,
      color: mv.color,
      captured: mv.captured || null,
      flags: mv.flags,
      fenBefore,
      fen: fenAfter,
    };
  }

  function onBoardMove(from, to, promo) {
    if (S.retry) {
      handleRetryMove(from, to, promo);
      return;
    }
    if (S.mode !== 'moves') return;
    stopAuto();
    stopVarAuto();
    const fen = currentFen();
    const ch = new Chess(fen);
    const mv = ch.move({ from, to, promotion: promo || 'q' });
    if (!mv) return;
    const uci = mv.from + mv.to + (mv.promotion || '');
    if (!S.variation) {
      const next = S.game.moves[S.ply];
      if (next && next.uci === uci) {
        setPly(S.ply + 1, true);
        return;
      }
      S.variation = { base: S.ply, returnPly: S.ply, line: [], idx: -1 };
    } else {
      S.variation.line = S.variation.line.slice(0, S.variation.idx + 1);
      S.variation.fromPv = false;
      S.variation.title = null;
    }
    S.variation.line.push(lineMove(mv, fen, ch.fen()));
    S.variation.idx = S.variation.line.length - 1;
    renderVariation(true);
    if (S.variation.vsEngine) engineVarReply();
  }

  function playLine(base, pv, title) {
    stopAuto();
    stopVarAuto();
    const returnPly = S.ply;
    S.retry = null;
    const ch = new Chess(fenAt(base));
    const line = [];
    for (const u of (pv || []).slice(0, 10)) {
      const before = ch.fen();
      const mv = ch.move(A.uciMove(u));
      if (!mv) break;
      line.push(lineMove(mv, before, ch.fen()));
    }
    if (!line.length) return;
    S.variation = { base, returnPly, line, idx: -1, fromPv: true, title };
    renderVariation(false);
    S.varTimer = setInterval(() => {
      const v = S.variation;
      if (!v || v.idx >= v.line.length - 1) {
        stopVarAuto();
        return;
      }
      v.idx++;
      renderVariation(true);
    }, 950);
  }

  function renderVariation(animate) {
    const v = S.variation;
    const fen = currentFen();
    board.setPosition(fen, animate);
    const cur = v.idx >= 0 ? v.line[v.idx] : null;
    board.setHighlights(cur ? [{ sq: cur.from, color: VAR_HL }, { sq: cur.to, color: VAR_HL }] : []);
    board.setBadge(null);
    board.setArrows([]);
    board.setHint(null);
    board.setCheck(checkSquare(fen));
    updateMovable();
    renderStrips();
    renderGraphCursor();
    v.ev = null;
    renderVarBubble(null);
    if (cur && animate) moveSound(cur);
    if (!(v.vsEngine && fen.split(' ')[1] !== v.vsEngine)) evalVariation(fen);
  }

  async function evalVariation(fen) {
    const token = ++S.varToken;
    const ch = new Chess(fen);
    let score = null;
    if (ch.in_checkmate()) score = { mate: 0, cp: ch.turn() === 'w' ? -100000 : 100000 };
    else if (ch.in_stalemate() || ch.insufficient_material()) score = { cp: 0, mate: null };
    if (score) {
      updateEvalBar(score);
      S.variation.ev = { score, pv: [] };
      renderVarBubble(S.variation.ev);
      return;
    }
    try {
      const res = await engine.analyzeLatest(fen, { depth: 13, movetime: 1200, multipv: 1 });
      if (token !== S.varToken || !S.variation || currentFen() !== fen) return;
      const line = res.lines[0];
      if (!line) return;
      updateEvalBar(line.score);
      if (S.settings.arrows && line.pv[0]) board.setArrows([{ from: line.pv[0].slice(0, 2), to: line.pv[0].slice(2, 4), color: '#6A9BCC' }]);
      S.variation.ev = { score: line.score, pv: line.pv };
      renderVarBubble(S.variation.ev);
    } catch (e) {
      /* demande périmée */
    }
  }

  function renderVarBubble(ev) {
    const v = S.variation;
    if (!v) return;
    let lineHTML = '';
    v.line.forEach((m, k) => {
      if (k === 0 || m.color === 'w') lineHTML += `<span class="vnum">${CC.moveLabel(m.fenBefore, m.color)}</span>`;
      lineHTML += `<button class="vmove${k === v.idx ? ' active' : ''}" data-vidx="${k}">${CC.sanHTML(m.san)}</button>`;
    });
    let text;
    const fenNow = currentFen();
    if (v.vsEngine) {
      // Partie libre contre Stockfish
      const ch = new Chess(fenNow);
      if (ch.in_checkmate()) text = ch.turn() === v.vsEngine ? '<b>Échec et mat… Stockfish a gagné.</b>' : '<b>Échec et mat, tu as gagné ! 🎉</b>';
      else if (ch.game_over()) text = '<b>Partie nulle.</b>';
      else if (v.thinking || ch.turn() !== v.vsEngine) text = '<span class="cc-spin">✻</span> Stockfish réfléchit…';
      else text = `<b>À toi de jouer</b> (${v.vsEngine === 'w' ? 'Blancs' : 'Noirs'}). Continue comme en partie.`;
    } else if (ev && ev.score.mate === 0) text = 'Échec et mat.';
    else if (ev && ev.pv && ev.pv.length) text = `<span class="muted">Meilleure suite :</span> ${A.pvToSan(fenNow, ev.pv, 5).map(CC.sanHTML).join(' ')}`;
    else if (ev) text = 'Position nulle.';
    else text = '<span class="muted"><span class="cc-spin">✻</span> Stockfish évalue la position…</span>';
    setBubble({
      title: v.title || 'Variante',
      chip: ev ? evalChip(ev.score) : '',
      extra: `<div class="vline">${lineHTML}</div>`,
      text,
      actions: `<button class="btn btn-sm" data-act="exit-var">${ICON.back}Retour à la partie</button>`,
      mood: 'thinking',
      anim: 'bob',
      force: false,
    });
  }

  function exitVariation() {
    if (!S.variation) return;
    const back = S.variation.returnPly;
    stopVarAuto();
    S.variation = null;
    S.varToken++;
    S.ply = back;
    renderGamePosition(false);
    renderCoach();
    markActiveMove();
    renderGraphCursor();
    renderStrips();
  }

  /* =================== Mode « Réessayer » =================== */
  function startRetry() {
    const i = S.ply - 1;
    const mv = S.game.moves[i];
    if (!mv) return;
    stopAuto();
    stopVarAuto();
    S.variation = null;
    S.varToken++;
    S.retry = { i, fen: mv.fenBefore, curFen: null, color: mv.color, tries: 0, solved: false, locked: false, state: 'start' };
    board.setPosition(mv.fenBefore, true);
    board.setHighlights(prevMoveHL(i));
    board.setBadge(null);
    board.setArrows([]);
    board.setHint(null);
    board.setCheck(checkSquare(mv.fenBefore));
    updateEvalBar(S.evals[i].lines[0].score);
    renderStrips();
    renderRetryBubble('start');
    updateMovable();
  }
  function prevMoveHL(i) {
    const pm = S.game.moves[i - 1];
    return pm ? [{ sq: pm.from, color: VAR_HL }, { sq: pm.to, color: VAR_HL }] : [];
  }

  function renderRetryBubble(state, data) {
    const r = S.retry;
    if (!r) return;
    r.state = state;
    if (data) r.data = data;
    data = r.data || {};
    const sideFr = r.color === 'w' ? 'les Blancs' : 'les Noirs';
    const played = S.game.moves[r.i].san;
    const helpBtns =
      `<button class="btn btn-sm" data-act="hint">${ICON.bulb}Indice</button>` +
      `<button class="btn btn-sm" data-act="solution">${ICON.star}Solution</button>` +
      `<button class="btn btn-sm" data-act="exit-retry">${ICON.back}Retour</button>`;
    if (state === 'start') {
      setBubble({
        title: 'À toi de trouver mieux !',
        text: `Dans la partie, tu as joué <b class="san">${CC.sanHTML(played)}</b>. Trouve un meilleur coup pour ${sideFr} : déplace une pièce sur l’échiquier.`,
        actions: helpBtns,
        mood: 'thinking',
        anim: 'bob',
      });
    } else if (state === 'checking') {
      setBubble({
        title: 'Je vérifie ton coup…',
        text: '<span class="cc-spin">✻</span> Stockfish réfléchit.',
        actions: '',
        mood: 'thinking',
        anim: 'walk',
      });
    } else if (state === 'success') {
      const meta = CC.CLS[data.cls];
      setBubble({
        icon: CC.icon(data.cls),
        title: `<b class="san">${CC.sanHTML(data.san)}</b> <span class="cls-txt" style="color:${meta.ink}">${meta.phrase}</span>`,
        text: data.cls === 'best' ? 'Bravo, c’est exactement ça ! 🎯' : 'Très bien vu, presque aussi fort que le meilleur coup !',
        actions:
          `<button class="btn btn-sm btn-primary" data-act="retry-play">${ICON.play}Continuer la partie</button>` +
          `<button class="btn btn-sm" data-act="retry-line">${ICON.eye}Voir la suite</button>` +
          `<button class="btn btn-sm" data-act="retry-continue">Coup suivant ${ICON.next}</button>`,
        mood: 'star',
        anim: 'jump',
      });
    } else if (state === 'fail') {
      const meta = CC.CLS[data.cls];
      setBubble({
        icon: CC.icon(data.cls),
        title: `<b class="san">${CC.sanHTML(data.san)}</b> <span class="cls-txt" style="color:${meta.ink}">${meta.phrase}</span>`,
        text: data.same
          ? 'C’est le coup que tu avais joué 😉 Cherche autre chose !'
          : r.tries >= 2
          ? 'Pas encore… Un petit indice ?'
          : 'Pas tout à fait. Essaie encore !',
        actions: helpBtns,
        mood: 'meh',
        anim: 'shake',
      });
    } else if (state === 'solution') {
      const bestSan = A.sanOf(r.fen, S.evals[r.i].lines[0].pv[0]);
      const gain = A.materialSwing(r.fen, S.evals[r.i].lines[0].pv, r.color);
      const mate = CC.mateFor(S.evals[r.i].lines[0].score, r.color);
      let why = '';
      if (mate != null && mate > 0) why = ` Il menait à un mat en ${mate}.`;
      else if (gain.delta >= 2) why = ` Il gagnait du matériel (+${gain.delta}).`;
      setBubble({
        icon: CC.icon('best'),
        title: `<b class="san">${CC.sanHTML(bestSan || '?')}</b> <span class="cls-txt" style="color:${CC.CLS.best.ink}">était le meilleur coup</span>`,
        text: 'Voici la solution.' + why,
        actions:
          `<button class="btn btn-sm btn-primary" data-act="retry-play">${ICON.play}Continuer la partie</button>` +
          `<button class="btn btn-sm" data-act="retry-line">${ICON.eye}Voir la suite</button>` +
          `<button class="btn btn-sm" data-act="retry-continue">Coup suivant ${ICON.next}</button>`,
        mood: 'happy',
        anim: 'bob',
      });
    }
  }

  async function handleRetryMove(from, to, promo) {
    const r = S.retry;
    if (!r || r.locked || r.solved) return;
    const ch = new Chess(r.fen);
    const mv = ch.move({ from, to, promotion: promo || 'q' });
    if (!mv) return;
    const uci = mv.from + mv.to + (mv.promotion || '');
    r.locked = true;
    r.curFen = ch.fen();
    board.setPosition(r.curFen, true);
    board.setHint(null);
    board.setArrows([]);
    board.setHighlights([{ sq: mv.from, color: VAR_HL }, { sq: mv.to, color: VAR_HL }]);
    board.setCheck(checkSquare(r.curFen));
    board.setMovable(null);
    moveSound(mv);
    const E0 = S.evals[r.i];
    const wpBest = CC.winFor(E0.lines[0].score, r.color);
    const same = uci === S.game.moves[r.i].uci;
    let wp = null;
    if (uci === E0.lines[0].pv[0] || ch.in_checkmate()) wp = wpBest;
    else if (E0.lines[1] && E0.lines[1].pv[0] === uci) wp = CC.winFor(E0.lines[1].score, r.color);
    else if (same) wp = S.review.moves[r.i].wpAfter;
    else if (ch.in_stalemate() || ch.insufficient_material()) wp = 50;
    else {
      renderRetryBubble('checking');
      try {
        const res = await engine.analyze(r.curFen, { depth: 12, movetime: 1500, multipv: 1 });
        wp = CC.winFor(res.lines[0].score, r.color);
      } catch (e) {
        wp = null;
      }
      if (S.retry !== r) return;
    }
    const loss = wp == null ? 0 : Math.max(0, wpBest - wp);
    const isBest = uci === E0.lines[0].pv[0] || ch.in_checkmate();
    const cls = isBest ? 'best' : loss <= 2 ? 'excellent' : loss <= 5 ? 'good' : loss <= 10 ? 'inaccuracy' : loss <= 20 ? 'mistake' : 'blunder';
    board.setBadge({ sq: mv.to, cls });
    if (!same && (isBest || loss <= 2)) {
      r.solved = true;
      r.locked = false;
      r.solvedMove = mv;
      renderRetryBubble('success', { san: mv.san, cls });
      Sound.play('success');
      return;
    }
    r.tries++;
    renderRetryBubble('fail', { san: mv.san, cls, same });
    Sound.play('fail');
    setTimeout(() => {
      if (S.retry !== r) return;
      r.curFen = null;
      r.locked = false;
      board.setPosition(r.fen, true);
      board.setBadge(null);
      board.setHighlights(prevMoveHL(r.i));
      board.setCheck(checkSquare(r.fen));
      updateMovable();
    }, 1400);
  }

  function retryHint() {
    const r = S.retry;
    if (!r) return;
    const best = S.evals[r.i].lines[0].pv[0];
    if (!best) return;
    const from = best.slice(0, 2);
    const p = new Chess(r.fen).get(from);
    board.setHint(from);
    setBubble({
      title: 'Indice',
      text: p ? `Regarde du côté de ${CC.ton(p.type)} en ${from}… 👀` : 'Regarde bien la case en surbrillance.',
      actions:
        `<button class="btn btn-sm" data-act="solution">${ICON.star}Solution</button>` +
        `<button class="btn btn-sm" data-act="exit-retry">${ICON.back}Retour</button>`,
      mood: 'wink',
      anim: 'bob',
    });
  }

  function retrySolution() {
    const r = S.retry;
    if (!r) return;
    const best = S.evals[r.i].lines[0].pv[0];
    if (!best) return;
    const ch = new Chess(r.fen);
    const mv = ch.move(A.uciMove(best));
    if (!mv) return;
    r.solved = true;
    r.locked = false;
    r.curFen = ch.fen();
    r.solvedMove = mv;
    board.setPosition(r.curFen, true);
    board.setHint(null);
    board.setHighlights([{ sq: mv.from, color: CC.hexA(CC.CLS.best.color, 0.5) }, { sq: mv.to, color: CC.hexA(CC.CLS.best.color, 0.5) }]);
    board.setBadge({ sq: mv.to, cls: 'best' });
    board.setCheck(checkSquare(r.curFen));
    board.setMovable(null);
    moveSound(mv);
    renderRetryBubble('solution');
  }

  /** Après avoir trouvé le bon coup : on continue la partie contre Stockfish depuis cette position */
  function retryPlay() {
    const r = S.retry;
    if (!r || !r.solvedMove) return;
    S.retry = null;
    S.variation = {
      base: r.i,
      returnPly: r.i + 1,
      line: [lineMove(r.solvedMove, r.fen, r.curFen)],
      idx: 0,
      vsEngine: r.color,
      title: 'Partie libre contre Stockfish',
    };
    renderVariation(false);
    engineVarReply();
  }

  /** En partie libre : Stockfish répond au coup du joueur */
  async function engineVarReply() {
    const v = S.variation;
    if (!v || !v.vsEngine) return;
    const fen = currentFen();
    const ch = new Chess(fen);
    if (ch.game_over() || ch.turn() === v.vsEngine) return;
    v.thinking = true;
    board.setMovable(null);
    renderVarBubble(v.ev || null);
    let res;
    try {
      res = await engine.analyze(fen, { depth: 12, movetime: 800, multipv: 1 });
    } catch (e) {
      return;
    }
    if (S.variation !== v || currentFen() !== fen) return;
    const u = res.best || (res.lines[0] && res.lines[0].pv[0]);
    const mv = u && ch.move(A.uciMove(u));
    v.thinking = false;
    if (!mv) return renderVariation(false);
    v.line = v.line.slice(0, v.idx + 1);
    v.line.push(lineMove(mv, fen, ch.fen()));
    v.idx = v.line.length - 1;
    renderVariation(true);
  }

  function exitRetry() {
    const r = S.retry;
    if (!r) return;
    S.retry = null;
    S.ply = r.i + 1;
    renderGamePosition(false);
    renderCoach();
    markActiveMove();
    renderGraphCursor();
    renderStrips();
  }
  function continueAfterRetry() {
    const r = S.retry;
    if (!r) return;
    S.retry = null;
    setPly(Math.min(r.i + 2, S.game.moves.length), false);
  }
  function retryLine() {
    const r = S.retry;
    if (!r) return;
    S.retry = null;
    S.ply = r.i + 1;
    playLine(r.i, S.evals[r.i].lines[0].pv, 'Meilleure suite');
  }

  /** Résumé texte de la partie ouverte (contexte envoyé au chat) */
  function gameContextText() {
    if (!S.game || !S.review) return '';
    const g = S.game;
    const r = S.review;
    const me = S.userColor;
    const opp = me === 'w' ? 'b' : 'w';
    const side = (c) => (c === 'w' ? 'Blancs' : 'Noirs');
    const meP = me === 'w' ? g.white : g.black;
    const f1 = (x) => (x == null ? '?' : x.toFixed(1));
    let moves = '';
    g.moves.forEach((mv, i) => {
      if (mv.color === 'w' || i === 0) moves += (i ? ' ' : '') + CC.moveLabel(mv.fenBefore, mv.color) + ' ';
      else moves += ' ';
      moves += mv.san;
    });
    const L = [
      `Partie : ${g.white.name} (${g.white.rating || '?'}, Blancs) contre ${g.black.name} (${g.black.rating || '?'}, Noirs)${g.timeClass ? `, cadence ${g.timeClass}` : ''}${g.endTime ? `, le ${fmtDate(g.endTime)}` : ''}.`,
      `Le joueur coaché joue les ${side(me)}. Résultat pour lui : ${meP.result ? CC.ChessCom.resultLabel(meP.result) : 'inconnu'}${g.headers.Termination ? ` (${g.headers.Termination})` : ''}.`,
      r.opening ? `Ouverture : ${r.opening.name} (${r.opening.eco}).` : '',
      `Précision : joueur ${f1(r.accuracy[me])} %, adversaire ${f1(r.accuracy[opp])} %.`,
      `Coups : ${moves}`,
      'Moments clés (Stockfish) :',
    ];
    for (const i of r.keyMoments.slice(0, 16)) {
      const m = r.moves[i];
      const mv = g.moves[i];
      L.push(
        `- ${CC.moveLabel(mv.fenBefore, mv.color)} ${mv.san} (${m.color === me ? 'joueur' : 'adversaire'}) : ${CC.CLS[m.cls].label}, éval ${CC.fmtEval(m.scoreBefore)} → ${CC.fmtEval(m.scoreAfter)}, meilleur coup ${A.sanOf(mv.fenBefore, m.bestUci) || '?'}`
      );
    }
    return L.filter(Boolean).join('\n');
  }

  /* =================== Coach Claude (optionnel) =================== */
  function currentAiKey() {
    if (S.mode === 'summary') return 'game';
    if (S.mode === 'moves' && !S.variation && !S.retry && S.ply > 0) return 'm' + (S.ply - 1);
    return null;
  }
  function formatAi(text) {
    return CC.esc(text.trim())
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }
  function renderAi(key) {
    if (currentAiKey() !== key) return;
    const box = $('#bubble-ai');
    const e = S.ai.get(key);
    if (!box || !e) return;
    box.hidden = false;
    const prov = e.provider || 'claude';
    box.innerHTML =
      `<div class="ai-head"><span class="ai-badge ${prov}">${CC.AI.icon(prov)} ${prov === 'gemini' ? 'Gemini' : 'Claude'}</span><span class="ai-model">${CC.esc(CC.AI.modelLabel(e.model))}</span>` +
      (e.pending && !e.text ? `<span class="ai-wait"><span class="cc-spin">✻</span> ${VERBS[(e.t0 || 0) % VERBS.length]}…</span>` : '') +
      '</div>' +
      (e.error ? `<div class="ai-err">${CC.esc(e.error)}</div>` : `<div class="ai-text"><p>${formatAi(e.text)}${e.pending ? '<span class="caret"></span>' : ''}</p></div>`);
  }
  async function askAI(kind) {
    if (!CC.AI.hasKey(S.settings)) {
      openSettings('ai');
      toast('Ajoute une clé API (Claude ou Gemini) pour activer le coach IA ✻');
      return;
    }
    const key = kind === 'game' ? 'game' : 'm' + (S.ply - 1);
    const prev = S.ai.get(key);
    if (prev && (prev.pending || !prev.error)) {
      renderAi(key);
      return;
    }
    const ctx = { game: S.game, review: S.review, evals: S.evals, userColor: S.userColor, i: S.ply - 1 };
    const prompt = kind === 'game' ? CCClaude.gamePrompt(ctx) : CCClaude.movePrompt(ctx);
    const entry = { text: '', pending: true, error: null, provider: CC.AI.provider(S.settings), model: CC.AI.model(S.settings), t0: Math.floor(Math.random() * 100) };
    S.ai.set(key, entry);
    renderAi(key);
    let raf = 0;
    try {
      const r = await CC.AI.ask(S.settings, {
        prompt,
        maxTokens: kind === 'game' ? 8000 : 6000,
        onText: (d) => {
          entry.text += d;
          if (!raf) raf = requestAnimationFrame(() => ((raf = 0), renderAi(key)));
        },
      });
      entry.model = r.model || entry.model; // modèle réellement utilisé (repli Gemini éventuel)
    } catch (e) {
      entry.error = CC.AI.errorText(e);
    }
    entry.pending = false;
    if (!entry.text && !entry.error) entry.error = 'Réponse vide.';
    renderAi(key);
  }

  /* =================== Réglages =================== */
  function applyBoardTheme() {
    $$('.cc-board, #board').forEach((el) => {
      ['claude', 'kraft', 'green', 'slate'].forEach((t) => el.classList.remove('theme-' + t));
      el.classList.add('theme-' + (S.settings.board || 'claude'));
    });
  }
  function openSettings(focus) {
    $('#modal').hidden = false;
    $$('input[name="depth"]').forEach((r) => (r.checked = r.value === S.settings.depth));
    $$('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.theme === S.settings.board));
    $('#set-sound').checked = !!S.settings.sound;
    $('#set-arrows').checked = !!S.settings.arrows;
    $('#set-key').value = S.settings.apiKey || '';
    $('#set-model').value = S.settings.model;
    $('#set-gkey').value = S.settings.geminiKey || '';
    $('#set-gmodel').value = S.settings.geminiModel || 'gemini-3.5-flash';
    showProvider();
    const auto = CC.clamp((navigator.hardwareConcurrency || 4) - 2, 1, 8);
    $('#set-threads option[value="auto"]').textContent = `Automatique (${auto} moteurs)`;
    $('#set-threads').value = String(S.settings.threads || 'auto');
    $('#key-status').textContent = '';
    if (focus === 'ai') {
      $('#set-ai').scrollIntoView({ block: 'nearest' });
      setTimeout(() => $('#set-key').focus(), 60);
    }
  }
  /** Affiche les champs du fournisseur d'IA choisi (Claude ou Gemini) */
  function showProvider() {
    const p = CC.AI.provider(S.settings);
    $$('input[name="provider"]').forEach((r) => (r.checked = r.value === p));
    $$('.prov').forEach((el) => (el.hidden = el.dataset.prov !== p));
  }
  function closeSettings() {
    $('#modal').hidden = true;
  }

  /* =================== Événements =================== */
  function bindUI() {
    $('#brand').addEventListener('click', (e) => {
      e.preventDefault();
      showView('home');
    });
    $$('.nav-item[data-nav]').forEach((b) =>
      b.addEventListener('click', () => {
        const n = b.dataset.nav;
        if (n === 'settings') openSettings();
        else if (n === 'insights' || n === 'chat' || n === 'rep') showView(n);
        else if (n === 'review' && S.game) {
          showView('review');
          if (!S.review && S.mode !== 'loading') runAnalysis();
        } else if (n === 'home') showView('home');
      })
    );

    // Onglets de l'accueil
    $$('.tab').forEach((t) =>
      t.addEventListener('click', () => {
        $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
        $$('.tab-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === t.dataset.tab));
        const f = $(`.tab-pane[data-pane="${t.dataset.tab}"] input, .tab-pane[data-pane="${t.dataset.tab}"] textarea`);
        if (f) f.focus();
      })
    );
    $('#form-user').addEventListener('submit', (e) => {
      e.preventDefault();
      loadGames($('#in-user').value);
    });
    $('#form-link').addEventListener('submit', (e) => {
      e.preventDefault();
      openLink();
    });
    $('#form-pgn').addEventListener('submit', (e) => {
      e.preventDefault();
      openPGN();
    });
    $$('.filter').forEach((f) =>
      f.addEventListener('click', () => {
        S.filter = f.dataset.filter;
        $$('.filter').forEach((x) => x.classList.toggle('active', x === f));
        renderGames();
      })
    );
    $('#games-list').addEventListener('click', (e) => {
      const row = e.target.closest('.grow[data-id]');
      if (!row || row.classList.contains('disabled')) return;
      const g = S.games.find((x) => CC.ChessCom.gameId(x.url) === row.dataset.id);
      if (g) openChessComGame(g);
    });
    $('#btn-last').addEventListener('click', () => {
      const g = filteredGames().find((x) => !x.rules || x.rules === 'chess');
      if (g) openChessComGame(g);
      else toast('Aucune partie à analyser.');
    });
    $('#btn-more').addEventListener('click', async () => {
      setBtnLoading('#btn-more', true);
      try {
        await loadMoreGames(20);
        renderGames();
      } catch (e) {
        toast(CC.esc(e.message));
      } finally {
        setBtnLoading('#btn-more', false);
      }
    });

    // Panneau de bilan
    $('#view-review').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        handleAct(b.dataset.act);
        return;
      }
      const mvb = e.target.closest('.mv[data-p]');
      if (mvb) {
        stopAuto();
        setPly(+mvb.dataset.p, false);
        return;
      }
      const vb = e.target.closest('[data-vidx]');
      if (vb && S.variation) {
        stopVarAuto();
        S.variation.idx = +vb.dataset.vidx;
        renderVariation(false);
      }
    });
    $('#btn-flip').addEventListener('click', flip);
    $('#btn-settings2').addEventListener('click', () => openSettings());

    // Graphe
    const graph = $('#graph');
    graph.addEventListener('click', (e) => {
      if (!S.review) return;
      stopAuto();
      setPly(graphPly(e), false);
    });
    graph.addEventListener('mousemove', (e) => {
      if (!S.review) return;
      const p = graphPly(e);
      const tip = $('#g-tip');
      if (!tip) return;
      const r = graph.getBoundingClientRect();
      const sc = S.evals[p].lines[0].score;
      tip.innerHTML = p
        ? `${CC.moveLabel(S.game.moves[p - 1].fenBefore, S.game.moves[p - 1].color)} ${CC.sanHTML(S.game.moves[p - 1].san)} · ${CC.fmtEval(sc)}`
        : `Départ · ${CC.fmtEval(sc)}`;
      tip.hidden = false;
      tip.style.left = CC.clamp(e.clientX - r.left, 40, r.width - 40) + 'px';
    });
    graph.addEventListener('mouseleave', () => {
      const tip = $('#g-tip');
      if (tip) tip.hidden = true;
    });

    // Réglages
    $('#modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeSettings();
    });
    $$('input[name="depth"]').forEach((r) =>
      r.addEventListener('change', () => {
        S.settings.depth = r.value;
        saveSettings();
        toast(`Profondeur ${PRESETS[r.value].label.toLowerCase()} : s’applique aux prochaines analyses.`);
      })
    );
    $$('.swatch').forEach((b) =>
      b.addEventListener('click', () => {
        S.settings.board = b.dataset.theme;
        saveSettings();
        applyBoardTheme();
        $$('.swatch').forEach((x) => x.classList.toggle('active', x === b));
      })
    );
    $('#set-sound').addEventListener('change', (e) => {
      S.settings.sound = e.target.checked;
      saveSettings();
      if (S.settings.sound) Sound.play('move');
    });
    $('#set-arrows').addEventListener('change', (e) => {
      S.settings.arrows = e.target.checked;
      saveSettings();
      if (S.game && S.review && !S.variation && !S.retry) renderGamePosition(false);
    });
    $('#set-key').addEventListener('change', (e) => {
      S.settings.apiKey = e.target.value.trim();
      saveSettings();
      S.ai = new Map();
    });
    $('#set-model').addEventListener('change', (e) => {
      S.settings.model = e.target.value;
      saveSettings();
      S.ai = new Map();
    });
    $('#set-gkey').addEventListener('change', (e) => {
      S.settings.geminiKey = e.target.value.trim();
      saveSettings();
      S.ai = new Map();
    });
    $('#set-gmodel').addEventListener('change', (e) => {
      S.settings.geminiModel = e.target.value;
      saveSettings();
      S.ai = new Map();
    });
    $$('input[name="provider"]').forEach((r) =>
      r.addEventListener('change', () => {
        S.settings.aiProvider = r.value;
        saveSettings();
        S.ai = new Map();
        showProvider();
        $('#key-status').textContent = '';
      })
    );
    $('#btn-test-key').addEventListener('click', async () => {
      const gem = CC.AI.provider(S.settings) === 'gemini';
      const key = (gem ? $('#set-gkey') : $('#set-key')).value.trim();
      const st = $('#key-status');
      if (!key) {
        st.textContent = 'Colle d’abord ta clé.';
        st.className = 'key-status err';
        return;
      }
      if (gem) S.settings.geminiKey = key;
      else S.settings.apiKey = key;
      saveSettings();
      st.innerHTML = '<span class="cc-spin">✻</span> Vérification…';
      st.className = 'key-status';
      try {
        const name = await CC.AI.testKey(S.settings);
        st.textContent = `✓ Clé valide : ${name}`;
        st.className = 'key-status ok';
      } catch (err) {
        st.textContent = CC.AI.errorText(err);
        st.className = 'key-status err';
      }
    });
    $('#btn-forget-key').addEventListener('click', () => {
      if (CC.AI.provider(S.settings) === 'gemini') {
        S.settings.geminiKey = '';
        $('#set-gkey').value = '';
      } else {
        S.settings.apiKey = '';
        $('#set-key').value = '';
      }
      saveSettings();
      $('#key-status').textContent = 'Clé supprimée de ce navigateur.';
      $('#key-status').className = 'key-status';
    });
    $('#set-threads').addEventListener('change', (e) => {
      S.settings.threads = e.target.value;
      saveSettings();
      const n = threadCount();
      toast(`Analyse sur ${n} moteur${n > 1 ? 's' : ''} Stockfish en parallèle.`);
    });
    $('#btn-clear-cache').addEventListener('click', () => {
      CC.store.keys('cc.an.').forEach((k) => CC.store.del(k));
      S.index = {};
      toast('Cache des analyses vidé.');
      if (S.games.length) renderGames();
    });

    // Clavier
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (!$('#modal').hidden) {
        if (e.key === 'Escape') closeSettings();
        return;
      }
      if ($('#view-review').hidden || !S.game) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          stopAuto();
          navNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          stopAuto();
          navPrev();
          break;
        case 'ArrowUp':
        case 'Home':
          e.preventDefault();
          stopAuto();
          navFirst();
          break;
        case 'ArrowDown':
        case 'End':
          e.preventDefault();
          stopAuto();
          navLast();
          break;
        case ' ':
          e.preventDefault();
          if (S.mode === 'moves') toggleAuto();
          else if (S.mode === 'summary') startReview();
          break;
        case 'f':
        case 'F':
          flip();
          break;
        case 'Escape':
          if (S.retry) exitRetry();
          else if (S.variation) exitVariation();
          else if (S.mode === 'loading') {
            cancelAnalysis();
            showView('home');
          }
          break;
        default:
      }
    });
  }

  function handleAct(act) {
    switch (act) {
      case 'start':
        startReview();
        break;
      case 'cancel':
        cancelAnalysis();
        S.mode = null;
        showView('home');
        break;
      case 'retry-analysis':
        runAnalysis();
        break;
      case 'reanalyze':
        CC.store.del(cacheKey(S.game));
        runAnalysis();
        break;
      case 'first':
        stopAuto();
        navFirst();
        break;
      case 'prev':
        stopAuto();
        navPrev();
        break;
      case 'next':
        stopAuto();
        navNext();
        break;
      case 'last':
        stopAuto();
        navLast();
        break;
      case 'play':
        toggleAuto();
        break;
      case 'best':
        if (S.ply > 0) playLine(S.ply - 1, S.evals[S.ply - 1].lines[0].pv, 'Meilleur coup');
        break;
      case 'followup':
        playLine(S.ply, S.evals[S.ply].lines[0].pv, 'Suite probable');
        break;
      case 'retry':
        startRetry();
        break;
      case 'hint':
        retryHint();
        break;
      case 'solution':
        retrySolution();
        break;
      case 'exit-retry':
        exitRetry();
        break;
      case 'retry-continue':
        continueAfterRetry();
        break;
      case 'retry-play':
        retryPlay();
        break;
      case 'retry-line':
        retryLine();
        break;
      case 'exit-var':
        exitVariation();
        break;
      case 'key-prev':
        nextKey(-1);
        break;
      case 'key-next':
        nextKey(1);
        break;
      case 'ai-move':
        askAI('move');
        break;
      case 'ai-game':
        askAI('game');
        break;
      case 'chat-game':
        if (CC.ChatUI) CC.ChatUI.aboutGame(gameContextText());
        break;
      default:
    }
  }

  /* =================== Démarrage =================== */
  function init() {
    board = new CC.Board($('#board'), { orientation: 'w' });
    board.onUserMove = onBoardMove;
    applyBoardTheme();
    board.setPosition(CC.START_FEN, false);
    Clawd.set($('#brand-clawd'), 'idle');
    Clawd.set($('#hero-clawd'), 'idle', 'bob');
    engine.onStatus = setEngineStatus;
    bindUI();
    $('#in-user').value = S.username;
    if (S.username) $('#in-link-user').placeholder = `Pseudo d’un des joueurs (par défaut : ${S.username})`;

    const h = new URLSearchParams(location.hash.slice(1));
    const u = h.get('u');
    if (u) {
      $('#in-user').value = u;
      loadGames(u, h.get('g'));
    } else if (S.username) {
      loadGames(S.username);
    } else {
      setTimeout(() => $('#in-user').focus(), 50);
    }
    // index.html#u=Pseudo modifié à la main : on recharge les parties sans recharger la page
    window.addEventListener('hashchange', () => {
      const h2 = new URLSearchParams(location.hash.slice(1));
      const u2 = h2.get('u');
      if (u2 && u2.toLowerCase() !== (S.username || '').toLowerCase()) {
        $('#in-user').value = u2;
        loadGames(u2, h2.get('g'));
      }
    });
    // Réveille Stockfish en tâche de fond (et chauffe le JIT) pour que la première analyse démarre vite
    setTimeout(() => {
      engine
        .init()
        .then(() => engine.analyze('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', { depth: 16, movetime: 2500, multipv: 2 }))
        .catch(() => setEngineStatus('error'));
    }, 400);

    // API interne pour les modules « Mes faiblesses » et « Chat »
    CC.App = {
      S,
      PRESETS,
      pool,
      engine,
      showView,
      toast,
      openSettings,
      threadCount,
      analyzeGame,
      loadCache,
      saveCache,
      openFromFacts,
      displayName,
      fmtDate,
      TIME_ICON,
      TIME_FR,
      sound: moveSound,
      playSound: (k) => Sound.play(k),
      applyBoardTheme,
    };
    if (CC.InsightsUI) CC.InsightsUI.init(CC.App);
    if (CC.ChatUI) CC.ChatUI.init(CC.App);
    if (CC.RepUI) {
      CC.RepUI.init(CC.App);
      applyBoardTheme();
    }
    // Chauffe aussi les moteurs parallèles (la toute première recherche de chaque moteur est lente)
    setTimeout(() => pool.warm(threadCount()).catch(() => {}), 1500);

    // Petit utilitaire de test : window.__cc
    window.__cc = { S, openGame, A, engine, pool };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
