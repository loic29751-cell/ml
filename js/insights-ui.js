/* Clawd Coach — page « Mes faiblesses » : analyse en lot d'une période, rapport, graphiques, entraînement */
(function (root) {
  'use strict';
  const CC = root.CC;
  const A = CC.Analysis;
  const I = CC.Insights;
  const Chess = root.Chess;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const VERBS = ['Décortique', 'Épluche', 'Passe au crible', 'Mouline', 'Cogite', 'Fouille', 'Dissèque', 'Rumine'];
  const SEC_PER_POS = { fast: 0.32, normal: 0.85, deep: 2.2 };
  const f1 = (x) => (x == null ? '—' : x.toFixed(1).replace('.', ','));
  const f0 = (x) => (x == null ? '—' : String(Math.round(x)));
  const RES = { win: 'Victoire', draw: 'Nulle', loss: 'Défaite' };
  const TC = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapide', daily: 'Daily' };

  let app = null;
  const B = {
    period: 'month',
    tc: 'all', // cadence exacte : 'all', '300' (5 min), '600' (10 min), '180+2'…
    periodGames: null,
    depth: 'fast',
    run: 0,
    running: false,
    report: null,
    prev: null,
    facts: [],
    todo: null,
    total: null,
    cache: {},
    trendW: 0,
  };

  /* ---------------- Périodes ---------------- */
  function periodInfo(kind, back) {
    if (kind === 'all') {
      // toutes les parties, depuis la création du compte (pas de période précédente à comparer)
      if (back) return { all: true, months: [], from: 0, to: 0, label: '' };
      return { all: true, months: ['all'], from: 0, to: Date.now() + 7 * 86400000, label: 'toutes tes parties' };
    }
    const now = new Date();
    const span = kind === '3m' ? 3 : 1;
    const end = now.getMonth() - (kind === 'last' ? 1 : 0) - (back ? span : 0);
    const to = new Date(now.getFullYear(), end + 1, 1);
    const from = new Date(now.getFullYear(), end - span + 1, 1);
    const months = [];
    for (let k = 0; k < span; k++) {
      const d = new Date(from.getFullYear(), from.getMonth() + k, 1);
      months.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const yr = (d) => (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '');
    const last = new Date(to.getTime() - 1);
    const label = span === 1 ? MONTHS[from.getMonth()] + yr(from) : `${MONTHS[from.getMonth()]} à ${MONTHS[last.getMonth()]}${yr(last)}`;
    return { months, from: from.getTime(), to: to.getTime(), label };
  }

  function factsFor(info) {
    const me = (app.S.username || '').toLowerCase();
    return I.all().filter(
      (f) => f.me && f.me.toLowerCase() === me && f.t && f.t * 1000 >= info.from && f.t * 1000 < info.to && (B.tc === 'all' || (f.tcKey || 'autre') === B.tc)
    );
  }
  function periodFactsAllTc(info) {
    const me = (app.S.username || '').toLowerCase();
    return I.all().filter((f) => f.me && f.me.toLowerCase() === me && f.t && f.t * 1000 >= info.from && f.t * 1000 < info.to);
  }

  /** Toutes les parties « échecs standard » du joueur sur la période (toutes cadences) */
  async function fetchGames(info) {
    const key = info.months.join(',');
    const hit = B.cache[key];
    if (hit && Date.now() - hit.at < 120000) return hit.games;
    const archives = await CC.ChessCom.archives(app.S.username);
    const urls = info.all ? archives : archives.filter((u) => info.months.some((m) => u.endsWith('/' + m)));
    const me = app.S.username.toLowerCase();
    let games = [];
    for (const u of urls) games = games.concat(await CC.ChessCom.month(u));
    games = games.filter(
      (g) =>
        (!g.rules || g.rules === 'chess') &&
        g.pgn &&
        g.end_time * 1000 >= info.from &&
        g.end_time * 1000 < info.to &&
        [g.white.username, g.black.username].some((n) => n.toLowerCase() === me)
    );
    B.cache[key] = { at: Date.now(), games };
    return games;
  }
  const tcOf = (g) => g.time_control || 'autre';
  const forTc = (games) => (B.tc === 'all' ? games : games.filter((g) => tcOf(g) === B.tc));

  /** Puces des cadences réellement jouées sur la période (5 min, 10 min…) */
  function renderChips() {
    const counts = new Map();
    const src = B.periodGames ? B.periodGames.map(tcOf) : periodFactsAllTc(periodInfo(B.period)).map((f) => f.tcKey || 'autre');
    for (const k of src) counts.set(k, (counts.get(k) || 0) + 1);
    const keys = Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a));
    if (B.tc !== 'all' && !counts.has(B.tc)) keys.push(B.tc);
    $('#ins-tc').innerHTML =
      `<button class="seg-btn${B.tc === 'all' ? ' active' : ''}" data-v="all">Toutes <span class="cnt">${src.length}</span></button>` +
      keys
        .map((k) => `<button class="seg-btn${B.tc === k ? ' active' : ''}" data-v="${CC.esc(k)}">${CC.esc(I.tcLabel(k))} <span class="cnt">${counts.get(k) || 0}</span></button>`)
        .join('');
  }
  const isDone = (g) => !!I.get('cc-' + CC.ChessCom.gameId(g.url));

  /* ---------------- Contrôles & progression ---------------- */
  function estimate(games) {
    const plies = games.reduce((s, g) => s + ((String(g.pgn).match(/\d+\.\s/g) || []).length * 2 || 60), 0);
    const sec = (plies * (SEC_PER_POS[B.depth] || 0.4)) / Math.max(1, app.threadCount());
    if (sec < 60) return `≈ ${Math.max(5, Math.round(sec / 5) * 5)} s`;
    return `≈ ${Math.round(sec / 60)} min`;
  }

  function renderControls() {
    $$('#ins-period .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.v === B.period));
    renderChips();
    $('#ins-depth').value = B.depth;
    const btn = $('#ins-run');
    const st = $('#ins-status');
    if (!app.S.username) {
      btn.disabled = true;
      btn.textContent = 'Analyser mes parties';
      st.innerHTML = 'Indique d’abord ton pseudo dans <button class="linkbtn" data-go="home">Mes parties</button>.';
      return;
    }
    if (B.running) {
      btn.disabled = false;
      btn.classList.remove('btn-primary');
      btn.textContent = 'Arrêter';
      return;
    }
    btn.classList.add('btn-primary');
    if (B.todo == null) {
      btn.disabled = true;
      btn.textContent = 'Analyser mes parties';
      st.innerHTML = '<span class="cc-spin">✻</span> Je regarde tes parties sur chess.com…';
      return;
    }
    const done = B.total - B.todo.length;
    if (!B.total) {
      btn.disabled = true;
      btn.textContent = 'Aucune partie';
      st.textContent = 'Aucune partie sur cette période.';
    } else if (!B.todo.length) {
      btn.disabled = true;
      btn.textContent = 'Tout est analysé ✓';
      st.textContent = `${B.total} ${B.total > 1 ? 'parties' : 'partie'} sur la période, toutes analysées.`;
    } else {
      btn.disabled = false;
      btn.textContent = `Analyser ${B.todo.length} ${B.todo.length > 1 ? 'parties' : 'partie'} (${estimate(B.todo)})`;
      st.textContent = `${B.total} ${B.total > 1 ? 'parties' : 'partie'} sur la période · ${done} déjà ${done > 1 ? 'analysées' : 'analysée'} · ${app.threadCount()} moteurs en parallèle`;
    }
  }

  async function refreshCounts() {
    if (!app.S.username) {
      renderControls();
      return;
    }
    B.todo = null;
    renderControls();
    try {
      B.periodGames = await fetchGames(periodInfo(B.period));
      const games = forTc(B.periodGames);
      B.total = games.length;
      B.todo = games.filter((g) => !isDone(g));
    } catch (e) {
      B.todo = [];
      B.total = 0;
      $('#ins-status').textContent = e.message || String(e);
      return;
    }
    renderControls();
  }

  function setProgress(done, total, t0, label) {
    const box = $('#ins-progress');
    box.hidden = false;
    const pct = total ? Math.round((done / total) * 100) : 0;
    let eta = '';
    if (done > 0 && total > done) {
      const sec = ((Date.now() - t0) / done) * (total - done) / 1000;
      eta = sec < 60 ? ` · ~${Math.max(1, Math.round(sec))} s restantes` : ` · ~${Math.round(sec / 60)} min restantes`;
    }
    $('#ins-verb').textContent = (label || VERBS[Math.floor(Date.now() / 3000) % VERBS.length]) + '…';
    $('#ins-meta').textContent = total ? `(partie ${Math.min(done + 1, total)}/${total}${eta} · Échap pour arrêter)` : '';
    $('#ins-bar').style.width = pct + '%';
  }

  async function runBatch() {
    if (B.running) {
      stopBatch();
      return;
    }
    if (!app.S.username) return;
    const token = ++B.run;
    const owner = 'batch-' + token;
    B.running = true;
    renderControls();
    setProgress(0, 0, Date.now(), 'Récupère tes parties');
    const me = app.S.username.toLowerCase();
    let done = 0;
    try {
      const games = forTc(await fetchGames(periodInfo(B.period))).filter((g) => !isDone(g));
      const limit = root.__ccBatchLimit || Infinity; // utilisé par les tests
      const list = games.slice(0, limit);
      const t0 = Date.now();
      const preset = app.PRESETS[B.depth] || app.PRESETS.fast;
      for (const g of list) {
        if (token !== B.run) return;
        setProgress(done, list.length, t0);
        let game;
        try {
          game = A.fromChessCom(g);
        } catch (e) {
          done++;
          continue;
        }
        const color = game.black.name.toLowerCase() === me ? 'b' : 'w';
        const cached = app.loadCache(game);
        let evals = cached && cached.evals;
        let depth = cached && cached.depth;
        if (!evals) {
          evals = await app.analyzeGame(game, preset, { owner, isCancelled: () => token !== B.run });
          if (token !== B.run || evals.some((e) => !e)) return;
          depth = B.depth;
          app.saveCache(game, evals, depth);
        }
        const review = A.review(game, evals);
        app.S.index[game.key] = { t: Date.now(), acc: review.accuracy };
        I.save(I.facts(game, review, evals, color, depth));
        done++;
        if (done % 3 === 0 || done === list.length) renderAll();
      }
      CC.store.set('cc.an.index', app.S.index);
    } catch (e) {
      app.toast(CC.esc(e.message || String(e)));
    } finally {
      if (token === B.run) {
        B.running = false;
        $('#ins-progress').hidden = true;
        B.cache = {};
        renderAll();
        refreshCounts();
        if (done) app.toast(`${done} ${done > 1 ? 'parties analysées' : 'partie analysée'} ✓`);
      }
    }
  }

  function stopBatch() {
    const owner = 'batch-' + B.run;
    B.run++;
    B.running = false;
    app.pool.stop(owner);
    $('#ins-progress').hidden = true;
    CC.store.set('cc.an.index', app.S.index);
    renderAll();
    refreshCounts();
  }

  /* ---------------- Rapport ---------------- */
  function renderAll() {
    const info = periodInfo(B.period);
    B.facts = factsFor(info);
    B.report = B.facts.length ? I.report(B.facts) : null;
    const prevFacts = B.period === '3m' || B.period === 'all' ? [] : factsFor(periodInfo(B.period, true));
    B.prev = prevFacts.length >= 3 ? I.report(prevFacts) : null;
    B.prevLabel = periodInfo(B.period, true).label;
    renderBubble(info);
    renderBody(info);
  }

  function renderBubble(info) {
    const r = B.report;
    let html;
    let mood = 'idle';
    let anim = 'bob';
    if (B.running) {
      html = 'Je décortique tes parties… Tu peux continuer à naviguer, je travaille en fond.';
      mood = 'thinking';
      anim = 'walk';
    } else if (!r) {
      html = `Je n’ai encore analysé aucune de tes parties de <b>${CC.esc(info.label)}</b>. Lance l’analyse : je passe tout au crible et je te dis où tu perds des points.`;
    } else {
      const w = r.weaknesses[0];
      html = `J’ai décortiqué <b>${r.n}</b> ${r.n > 1 ? 'parties' : 'partie'} de ${CC.esc(info.label)} (${r.res.win} V · ${r.res.draw} N · ${r.res.loss} D).`;
      if (w) {
        html += ` Ta priorité n°1 : <b>${CC.esc(w.title.toLowerCase())}</b>.`;
        mood = 'meh';
      } else {
        html += ' Je ne vois pas de faiblesse marquée : continue comme ça !';
        mood = 'happy';
      }
      // Vue « Toutes » : une priorité par cadence (5 min, 10 min…)
      const groups = B.tc === 'all' ? I.byTc(B.facts).filter((g) => g.facts.length >= 3).slice(0, 3) : [];
      if (groups.length >= 2) {
        html += ' Par cadence : ' + groups.map((g) => {
          const w2 = I.report(g.facts).weaknesses[0];
          return `en <b>${CC.esc(g.label)}</b>, ${w2 ? CC.esc(w2.title.toLowerCase()) : 'rien de marqué'}`;
        }).join(' ; ') + '.';
      } else if (r.strengths.length) html += ` Côté positif : ${CC.esc(r.strengths[0])}.`;
      if (r.n < 8) html += ' <span class="muted">(Plus il y a de parties, plus le diagnostic est fiable.)</span>';
    }
    $('#ins-bubble').innerHTML = html;
    Clawd.set($('#ins-clawd'), mood, anim);
  }

  function delta(cur, prev, upGood, unit) {
    if (prev == null || cur == null) return '';
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return `<span class="delta flat">= vs ${CC.esc(B.prevLabel)}</span>`;
    const good = upGood ? d > 0 : d < 0;
    return `<span class="delta ${good ? 'good' : 'bad'}">${d > 0 ? '▲' : '▼'} ${d > 0 ? '+' : '−'}${f1(Math.abs(d))}${unit || ''} vs ${CC.esc(B.prevLabel)}</span>`;
  }

  function kpis(r) {
    const p = B.prev;
    const tile = (label, value, sub, d) =>
      `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ''}${d || ''}</div>`;
    return (
      '<div class="kpis">' +
      tile('Parties analysées', String(r.n), `${r.res.win} V · ${r.res.draw} N · ${r.res.loss} D`) +
      tile('Précision moyenne', f1(r.accAvg) + ' %', '', delta(r.accAvg, p && p.accAvg, true, ' pt')) +
      tile('Score', f0(r.score) + ' %', 'des points marqués', delta(r.score, p && p.score, true, ' pt')) +
      tile('Gaffes par partie', f1(r.blundersPG), `+ ${f1(r.mistakesPG)} erreurs`, delta(r.blundersPG, p && p.blundersPG, false)) +
      tile('Occasions manquées', f1(r.missedPG), 'par partie', delta(r.missedPG, p && p.missedPG, false)) +
      '</div>'
    );
  }

  function weakestPhase(r) {
    const ps = I.PH.filter((p) => r.phase[p] && r.phase[p].n >= 10);
    if (ps.length < 2) return '—';
    const w = ps.sort((a, b) => r.phase[a].acc - r.phase[b].acc)[0];
    return `${I.PH_FR[w]} <span class="muted">(${f1(r.phase[w].acc)} %)</span>`;
  }

  /** Forces et faiblesses séparées par cadence (5 min, 10 min…) */
  function compareCard() {
    const groups = I.byTc(B.facts).filter((g) => g.facts.length >= 2).slice(0, 4);
    if (groups.length < 2) return '';
    const reps = groups.map((g) => ({ g, r: I.report(g.facts) }));
    const row = (label, fn) => `<tr><th scope="row">${label}</th>${reps.map(({ r }) => `<td>${fn(r)}</td>`).join('')}</tr>`;
    return `<div class="card ins-card compare"><h3>Par cadence</h3><p class="card-sub">Tes forces et faiblesses, séparées par contrôle de temps. Clique sur une cadence pour son rapport complet.</p>
      <div class="tbl-wrap"><table class="tbl cmp"><thead><tr><th></th>${reps
        .map(({ g }) => `<th><button class="tc-pick" data-tcpick="${CC.esc(g.key)}">${CC.esc(g.label)}</button></th>`)
        .join('')}</tr></thead><tbody>
      ${row('Parties', (r) => `${r.n} <span class="muted">(${r.res.win} V · ${r.res.draw} N · ${r.res.loss} D)</span>`)}
      ${row('Score', (r) => f0(r.score) + ' %')}
      ${row('Précision', (r) => f1(r.accAvg) + ' %')}
      ${row('Gaffes par partie', (r) => f1(r.blundersPG))}
      ${row('Occasions manquées', (r) => f1(r.missedPG) + ' <span class="muted">/ partie</span>')}
      ${row('Erreurs en zeitnot', (r) => (r.time ? Math.round(r.time.lowShare * 100) + ' %' : '—'))}
      ${row('Phase la plus faible', weakestPhase)}
      ${row('Priorité n°1', (r) => (r.weaknesses[0] ? `<span class="flag-bad">⚠</span> <b>${CC.esc(r.weaknesses[0].title)}</b>` : '<span class="muted">rien de marqué</span>'))}
      ${row('Point fort', (r) => (r.strengths[0] ? `<span class="flag-good">✓</span> ${CC.esc(r.strengths[0])}` : '—'))}
      </tbody></table></div></div>`;
  }

  function weaknessCards(r) {
    if (!r.weaknesses.length) {
      return '<div class="card ins-card"><p class="muted">Aucune faiblesse marquée sur cette période. Analyse plus de parties pour un diagnostic plus fin.</p></div>';
    }
    return (
      '<div class="weak-grid">' +
      r.weaknesses
        .map(
          (w, k) => `<div class="card weak">
        <div class="weak-rank">${k + 1}</div>
        <div class="weak-head"><span class="weak-badge">⚠ À travailler</span><h3>${CC.esc(w.title)}</h3></div>
        <div class="weak-stat"><b>${CC.esc(w.stat)}</b> <span>${CC.esc(w.statSub)}</span></div>
        <p class="weak-text">${CC.esc(w.text)}</p>
        <p class="weak-advice"><span class="ai-star">✻</span> ${CC.esc(w.advice)}</p>
        <div class="weak-acts">
        ${w.examples.length ? `<button class="btn btn-sm btn-primary" data-train-list="${k}">S’entraîner sur ${w.examples.length} ${w.examples.length > 1 ? 'positions' : 'position'}</button>` : ''}
        ${w.key === 'opening' && w.examples.some((e) => e.phase === 'opening') ? `<button class="btn btn-sm" data-rep-fix="${k}">Ajouter les bons coups à mon répertoire</button>` : ''}
        </div>
        ${(CC.Rep.THEMES[w.key] || []).length ? `<div class="weak-links"><span class="muted">Puzzles lichess :</span> ${CC.Rep.THEMES[w.key].map((l) => `<a class="chip-link" href="${l.url}" target="_blank" rel="noopener">${CC.esc(l.label)} ↗</a>`).join('')}</div>` : ''}
      </div>`
        )
        .join('') +
      '</div>'
    );
  }

  function phaseCard(r) {
    const rows = I.PH.filter((p) => r.phase[p]);
    if (!rows.length) return '';
    const accs = rows.map((p) => r.phase[p].acc);
    const best = Math.max(...accs);
    const worst = Math.min(...accs);
    const weakP = rows.length > 1 && best - worst >= 5 ? rows[accs.indexOf(worst)] : null;
    return (
      '<div class="card ins-card"><h3>Précision par phase</h3><div class="meters">' +
      rows
        .map((p) => {
          const x = r.phase[p];
          return `<div class="meter-row" tabindex="0" title="${I.PH_FR[p]} : ${f1(x.acc)} % sur ${x.n} coups, ${r.phaseErr[p]} erreurs graves">
          <span class="m-name">${I.PH_FR[p]}</span>
          <span class="m-track"><span class="m-fill" style="width:${CC.clamp(x.acc, 0, 100)}%"></span></span>
          <span class="m-val">${f1(x.acc)} %</span>
          <span class="m-flag">${p === weakP ? '<span class="flag-bad">⚠ point faible</span>' : ''}</span></div>`;
        })
        .join('') +
      `</div><p class="card-foot">${rows.map((p) => `${I.PH_FR[p]} : ${r.phaseErr[p]} erreur${r.phaseErr[p] > 1 ? 's' : ''} grave${r.phaseErr[p] > 1 ? 's' : ''}`).join(' · ')}</p></div>`
    );
  }

  function sourcesCard(r) {
    if (!r.motifs.length) return '<div class="card ins-card"><h3>D’où viennent tes erreurs</h3><p class="muted">Aucune erreur grave sur cette période. Bravo !</p></div>';
    const max = r.motifs[0].n;
    return (
      `<div class="card ins-card"><h3>D’où viennent tes erreurs</h3><p class="card-sub">${r.errorsTotal} erreurs graves (erreurs, gaffes, occasions manquées)</p><div class="hbars">` +
      r.motifs
        .map(
          (m) => `<div class="hb-row" tabindex="0" data-tip="${CC.esc(`${m.label} : ${m.n} (${Math.round(m.share * 100)} % des erreurs graves)`)}">
        <span class="hb-label">${CC.esc(m.label)}</span>
        <span class="hb-area"><span class="hb-bar" style="width:${Math.max(2, (m.n / max) * 78)}%"></span><span class="hb-val">${m.n} · ${Math.round(m.share * 100)} %</span></span>
      </div>`
        )
        .join('') +
      '</div></div>'
    );
  }

  function timeCard(r) {
    const t = r.time;
    if (!t) return '<div class="card ins-card"><h3>Gestion du temps</h3><p class="muted">Pas de pendule sur ces parties (daily ou PGN sans horloge).</p></div>';
    const share = Math.round(t.lowShare * 100);
    const bad = t.err >= 4 && t.lowShare >= 0.3;
    return `<div class="card ins-card"><h3>Gestion du temps</h3>
      <div class="meters"><div class="meter-row" tabindex="0" title="${t.lowErr} erreurs graves sur ${t.err} commises avec moins de 10 % du temps">
        <span class="m-name">Erreurs en zeitnot</span>
        <span class="m-track"><span class="m-fill" style="width:${share}%"></span></span>
        <span class="m-val">${share} %</span><span class="m-flag">${bad ? '<span class="flag-bad">⚠ à surveiller</span>' : ''}</span></div></div>
      <ul class="facts-list">
        <li>${t.lowN ? `Précision avec moins de 10 % du temps : <b>${f1(t.accLow)} %</b> (sinon ${f1(t.accNorm)} %)` : 'Aucun coup joué en zeitnot sur ces parties 👍'}</li>
        <li>Parties avec un passage en zeitnot : <b>${t.gamesLow}</b> sur ${t.games}</li>
        <li>Coups joués en zeitnot : <b>${t.lowN}</b></li>
      </ul></div>`;
  }

  function colorCard(r) {
    const c = (k) => {
      const s = r.byColor[k];
      return `<div class="side ${k}"><div class="side-name"><i class="sq-${k}"></i>${k === 'w' ? 'Blancs' : 'Noirs'}</div><div class="side-val">${f0(s.score)} %</div><div class="side-sub">${s.n} ${s.n > 1 ? 'parties' : 'partie'} · précision ${f1(s.acc)} %</div></div>`;
    };
    const cv = r.conversion;
    return `<div class="card ins-card"><h3>Par couleur et conversion</h3><div class="sides">${c('w')}${c('b')}</div>
      <ul class="facts-list"><li>Positions gagnantes : <b>${cv.winning}</b>, dont <b>${cv.thrown.length}</b> non gagnées</li><li>Remontées gagnées : <b>${cv.comebacks.length}</b></li><li>Coups brillants : <b>${r.brilliant}</b> · très bons coups : <b>${r.great}</b></li></ul></div>`;
  }

  function trendCard(r) {
    if (r.trend.length < 2) return '';
    return `<div class="card ins-card trend-card"><h3>Précision partie par partie</h3><p class="card-sub">Clique sur un point pour revoir la partie · moyenne ${f1(r.accAvg)} %</p>
      <div class="trend" id="trend" tabindex="0" aria-label="Précision par partie, de la plus ancienne à la plus récente"></div></div>`;
  }

  function trendSVG(r, W) {
    const pts = r.trend;
    const n = pts.length;
    const H = 200;
    const m = { l: 34, r: 52, t: 14, b: 26 };
    const minAcc = Math.min(...pts.map((p) => p.acc));
    const lo = CC.clamp(Math.floor((minAcc - 5) / 10) * 10, 0, 90);
    const x = (i) => m.l + (i / (n - 1)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - lo) / (100 - lo)) * (H - m.t - m.b);
    const step = 100 - lo > 40 ? 20 : 10;
    let g = '';
    for (let v = lo; v <= 100; v += step) {
      g += `<line class="t-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="t-tick" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.acc).toFixed(1)}`).join(' ');
    const area = `${line} L${x(n - 1).toFixed(1)} ${y(lo)} L${x(0).toFixed(1)} ${y(lo)} Z`;
    const ya = y(r.accAvg);
    const last = pts[n - 1];
    const date = (t) => (t ? app.fmtDate(t) : '');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Précision moyenne ${f1(r.accAvg)} %">
      ${g}
      <line class="t-base" x1="${m.l}" x2="${W - m.r}" y1="${y(lo)}" y2="${y(lo)}"/>
      <path class="t-area" d="${area}"/>
      <line class="t-avg" x1="${m.l}" x2="${W - m.r}" y1="${ya}" y2="${ya}"/>
      <text class="t-avg-label" x="${m.l + 6}" y="${ya - 5}">moyenne ${f1(r.accAvg)}</text>
      <path class="t-line" d="${line}"/>
      <circle class="t-end" cx="${x(n - 1)}" cy="${y(last.acc)}" r="4.5"/>
      <text class="t-end-label" x="${x(n - 1) + 9}" y="${y(last.acc) - 8}">${f1(last.acc)}</text>
      <text class="t-tick" x="${m.l}" y="${H - 6}">${date(pts[0].t)}</text>
      <text class="t-tick" x="${W - m.r}" y="${H - 6}" text-anchor="end">${date(last.t)}</text>
      <line class="t-cross" id="t-cross" x1="0" x2="0" y1="${m.t}" y2="${y(lo)}" visibility="hidden"/>
      <circle class="t-hover" id="t-hover" r="5" cx="0" cy="0" visibility="hidden"/>
      <rect class="t-hit" x="${m.l - 6}" y="0" width="${W - m.l - m.r + 12}" height="${H - m.b}"/>
    </svg><div class="t-tip" id="t-tip" hidden></div>`;
  }

  function drawTrend() {
    const el = $('#trend');
    if (!el || !B.report || B.report.trend.length < 2) return;
    const W = Math.max(280, el.clientWidth);
    B.trendW = W;
    el.innerHTML = trendSVG(B.report, W);
    const pts = B.report.trend;
    const n = pts.length;
    const m = { l: 34, r: 52 };
    const H = 200;
    const lo = CC.clamp(Math.floor((Math.min(...pts.map((p) => p.acc)) - 5) / 10) * 10, 0, 90);
    const x = (i) => m.l + (i / (n - 1)) * (W - m.l - m.r);
    const y = (v) => 14 + (1 - (v - lo) / (100 - lo)) * (H - 14 - 26);
    let cur = -1;
    const show = (i) => {
      cur = CC.clamp(i, 0, n - 1);
      const p = pts[cur];
      const cross = $('#t-cross', el);
      const dot = $('#t-hover', el);
      cross.setAttribute('x1', x(cur));
      cross.setAttribute('x2', x(cur));
      cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', x(cur));
      dot.setAttribute('cy', y(p.acc));
      dot.setAttribute('visibility', 'visible');
      const tip = $('#t-tip', el);
      tip.hidden = false;
      tip.innerHTML = `<b>${f1(p.acc)} %</b><span>${CC.esc(p.t ? app.fmtDate(p.t) : '')} · contre ${CC.esc(p.opp)}</span><span>${RES[p.result] || ''} · ${p.color === 'w' ? 'Blancs' : 'Noirs'}${p.tc ? ' · ' + (TC[p.tc] || p.tc) : ''}</span>`;
      const left = CC.clamp(x(cur), 70, W - 70);
      tip.style.left = left + 'px';
      tip.style.top = Math.max(0, y(p.acc) - 74) + 'px';
    };
    const hide = () => {
      cur = -1;
      $('#t-cross', el).setAttribute('visibility', 'hidden');
      $('#t-hover', el).setAttribute('visibility', 'hidden');
      $('#t-tip', el).hidden = true;
    };
    const idxAt = (e) => {
      const r = el.getBoundingClientRect();
      return Math.round(((e.clientX - r.left - m.l) / (W - m.l - m.r)) * (n - 1));
    };
    const hit = $('.t-hit', el);
    hit.addEventListener('pointermove', (e) => show(idxAt(e)));
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('click', (e) => openFact(pts[CC.clamp(idxAt(e), 0, n - 1)].key));
    el.onkeydown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        show((cur < 0 ? n - 1 : cur) + (e.key === 'ArrowRight' ? 1 : -1));
      } else if (e.key === 'Enter' && cur >= 0) openFact(pts[cur].key);
    };
    el.onblur = hide;
  }

  function openingsCard(r) {
    if (!r.openings.length) return '';
    const rows = r.openings
      .slice(0, 12)
      .map((o) => {
        const tag = o.n >= 3 && o.score <= 35 ? '<span class="tag bad">à revoir</span>' : o.n >= 3 && o.score >= 60 ? '<span class="tag good">✓ solide</span>' : '';
        return `<tr><td>${CC.esc(o.name)} ${tag}</td><td><i class="sq-${o.color}"></i> ${o.color === 'w' ? 'Blancs' : 'Noirs'}</td><td class="num">${o.n}</td><td class="num">${f0(o.score)} %</td><td class="num">${f1(o.acc)} %</td></tr>`;
      })
      .join('');
    return `<div class="card ins-card"><h3>Tes ouvertures</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ouverture</th><th>Couleur</th><th class="num">Parties</th><th class="num">Score</th><th class="num">Précision</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function errorRow(e) {
    return `<div class="err-row">
      <span class="err-ic">${CC.icon(e.cls)}</span>
      <span class="err-main"><b class="san">${CC.esc(e.label)} ${CC.sanHTML(e.san)}</b> <span class="muted">→ meilleur</span> <b class="san">${CC.sanHTML(e.best || '?')}</b>
        <span class="err-sub">${CC.esc(I.MOTIFS[e.motif] || e.motif)} · ${CC.esc(I.PH_FR[e.phase] || '')}${e.low ? ' · zeitnot' : ''} · contre ${CC.esc(e.opp)}${e.t ? ' · ' + CC.esc(app.fmtDate(e.t)) : ''}</span></span>
      <span class="err-loss">−${f0(e.loss)} %</span>
      <button class="btn btn-sm" data-train="${CC.esc(e.gameKey)}" data-i="${e.i}">Rejouer</button>
    </div>`;
  }

  function worstCard(r) {
    if (!r.worst.length) return '';
    return `<div class="card ins-card"><div class="plan-head"><h3>Tes 10 pires erreurs</h3><button class="btn btn-sm btn-primary" data-train-worst>Tout rejouer en exercices</button></div><p class="card-sub">« Rejouer » ouvre la partie sur ce coup ; en exercices, tu enchaînes les positions et tu peux continuer chaque partie contre Stockfish.</p><div class="err-list">${r.worst.map(errorRow).join('')}</div></div>`;
  }

  /* ---------------- Programme de la semaine (propositions selon tes faiblesses) ---------------- */
  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const SHORT = {
    time: 'garder au moins une minute pour la fin de partie',
    hanging: 'avant chaque coup, vérifier les pièces non défendues',
    tactics: 'regarder les échecs, captures et menaces adverses',
    missed: 'après chaque coup adverse, chercher ce qu’il laisse sans défense',
    endgame: 'en finale, activer ton roi tout de suite',
    opening: 'suivre ton répertoire et te développer avant d’attaquer',
    conversion: 'quand tu es mieux, échanger les pièces et simplifier',
    color: 'jouer une ouverture que tu comprends avec cette couleur',
    blunders: 'faire un dernier contrôle avant de lâcher la pièce',
  };
  function weekKey() {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    return monday.toISOString().slice(0, 10);
  }
  function makePlan(r) {
    const ws = r.weaknesses;
    const tasks = [];
    const t = (day, text, act) => tasks.push({ id: tasks.length, day, text, act: act || null, done: false });
    const theme = (w, k) => {
      const list = w && CC.Rep.THEMES[w.key];
      return list && list.length ? list[k % list.length] : null;
    };
    const repSize = CC.Rep.size('w') + CC.Rep.size('b');
    const w1 = ws[0];
    const w2 = ws[1] || null;
    const w3 = ws[2] || null;
    const label = B.tc !== 'all' ? ` (${I.tcLabel(B.tc)})` : '';
    if (w1) t(0, `Exercices sur tes positions : ${w1.title.toLowerCase()}`, { type: 'ex', w: 0 });
    t(0, repSize ? 'Réviser ton répertoire (10 min)' : 'Créer ton répertoire depuis tes parties', { type: 'rep' });
    const th1 = theme(w1, 0);
    if (th1) t(1, `15 min de puzzles lichess : ${th1.label}`, { type: 'link', url: th1.url });
    t(1, `Jouer 2 parties${label} en pensant à ${w1 ? SHORT[w1.key] || 'vérifier les menaces adverses' : 'vérifier les menaces adverses'}`);
    if (w2) t(2, `Exercices sur tes positions : ${w2.title.toLowerCase()}`, { type: 'ex', w: 1 });
    t(2, 'Réviser ton répertoire (10 min)', { type: 'rep' });
    const th2 = theme(w2 || w1, 1);
    if (th2) t(3, `15 min de puzzles lichess : ${th2.label}`, { type: 'link', url: th2.url });
    if (r.worst.length) t(3, 'Rejouer tes 3 pires erreurs du mois', { type: 'worst' });
    if (w3) t(4, `Exercices sur tes positions : ${w3.title.toLowerCase()}`, { type: 'ex', w: 2 });
    else t(4, 'Exercices de finales sur lichess (20 min)', { type: 'link', url: 'https://lichess.org/practice' });
    t(4, 'Réviser ton répertoire (10 min)', { type: 'rep' });
    t(5, `Jouer 3 parties${label}, puis les analyser ici`, { type: 'home' });
    t(6, 'Bilan : relancer l’analyse de tes nouvelles parties', { type: 'top' });
    t(6, 'Demander à Clawd ce qui a progressé', { type: 'chat' });
    return { week: weekKey(), tc: B.tc, tasks };
  }
  function getPlan(r, fresh) {
    const key = 'cc.plan.' + B.tc;
    let p = CC.store.get(key, null);
    if (fresh || !p || p.week !== weekKey()) {
      p = makePlan(r);
      CC.store.set(key, p);
    }
    return p;
  }
  function planCard(r) {
    const p = getPlan(r);
    const today = (new Date().getDay() + 6) % 7;
    const done = p.tasks.filter((x) => x.done).length;
    let days = '';
    for (let d = 0; d < 7; d++) {
      const ts = p.tasks.filter((x) => x.day === d);
      if (!ts.length) continue;
      days += `<div class="plan-day${d === today ? ' today' : ''}"><div class="pd-name">${DAYS[d]}${d === today ? ' <span class="pd-today">aujourd’hui</span>' : ''}</div>${ts
        .map(
          (x) =>
            `<label class="task${x.done ? ' done' : ''}"><input type="checkbox" data-task="${x.id}"${x.done ? ' checked' : ''}><span>${CC.esc(x.text)}</span>${x.act ? `<button class="linkbtn" data-task-go="${x.id}">${x.act.type === 'link' ? 'Ouvrir ↗' : 'Go ›'}</button>` : ''}</label>`
        )
        .join('')}</div>`;
    }
    return `<div class="card ins-card plan"><div class="plan-head"><h3>Ton programme de la semaine${B.tc !== 'all' ? ` en ${CC.esc(I.tcLabel(B.tc))}` : ''}</h3><span class="plan-n">${done}/${p.tasks.length} fait${done > 1 ? 's' : ''}</span><button class="linkbtn" data-plan-new>Nouveau programme</button></div>
      <p class="card-sub">Proposé d’après tes faiblesses : exercices sur tes propres positions, révision du répertoire, puzzles ciblés.</p><div class="plan-days">${days}</div></div>`;
  }
  function runTask(id) {
    const p = getPlan(B.report);
    const x = p.tasks.find((y) => y.id === id);
    if (!x || !x.act) return;
    const r = B.report;
    const a = x.act;
    if (a.type === 'ex' && r.weaknesses[a.w]) CC.RepUI.startExercises(r.weaknesses[a.w].examples, 'Exercices : ' + r.weaknesses[a.w].title);
    else if (a.type === 'worst') CC.RepUI.startExercises(r.worst.slice(0, 3), 'Tes pires erreurs');
    else if (a.type === 'rep') CC.RepUI.openTab('review');
    else if (a.type === 'link') window.open(a.url, '_blank', 'noopener');
    else if (a.type === 'home') app.showView('home');
    else if (a.type === 'chat') app.showView('chat');
    else if (a.type === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Ajoute au répertoire les bons coups là où tu te trompes en ouverture */
  function addOpeningFixes(w) {
    let added = 0;
    let conflicts = 0;
    let last = null;
    for (const e of w.examples.filter((x) => x.phase === 'opening')) {
      const f = I.get(e.gameKey);
      if (!f || !f.pgn) continue;
      let moves;
      try {
        moves = A.parsePGN(f.pgn, { maxPlies: e.i + 1 }).moves;
      } catch (err) {
        continue;
      }
      const best = new Chess(e.fen).move(e.best);
      if (!best || !moves[e.i]) continue;
      const res = CC.Rep.addLine(e.color, moves, e.i, best.from + best.to + (best.promotion || ''), best.san, 'faiblesse');
      if (res.ok) {
        added++;
        last = { color: e.color, path: moves.slice(0, e.i).map((m) => m.uci) };
      } else conflicts++;
    }
    if (added) {
      app.toast(`${added} ${added > 1 ? 'corrections ajoutées' : 'correction ajoutée'} à ton répertoire ✓${conflicts ? ` (${conflicts} en conflit avec tes coups actuels)` : ''}`);
      if (last) CC.RepUI.openAt(last.color, last.path);
    } else app.toast(conflicts ? 'Ton répertoire contient déjà d’autres coups plus tôt sur ces lignes : ouvre-le pour décider.' : 'Rien à ajouter.');
  }

  function detailTable(facts) {
    const rows = facts
      .slice()
      .sort((a, b) => (b.t || 0) - (a.t || 0))
      .map(
        (f) =>
          `<tr><td>${CC.esc(f.t ? app.fmtDate(f.t) : '')}</td><td>${CC.esc(f.opp)}${f.oppElo ? ` <span class="muted">(${f.oppElo})</span>` : ''}</td><td><i class="sq-${f.color}"></i></td><td>${RES[f.result] || '—'}</td><td class="num">${f1(f.acc)}</td><td class="num">${(f.counts && f.counts.blunder) || 0}</td><td class="num">${(f.counts && f.counts.mistake) || 0}</td><td>${CC.esc(f.opening ? f.opening.name.split(':')[0] : '—')}</td><td><button class="linkbtn" data-open="${CC.esc(f.key)}">Ouvrir</button></td></tr>`
      )
      .join('');
    return `<details class="card ins-card detail"><summary>Détail par partie (${facts.length})</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Adversaire</th><th>Couleur</th><th>Résultat</th><th class="num">Précision</th><th class="num">Gaffes</th><th class="num">Erreurs</th><th>Ouverture</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }

  function renderBody(info) {
    const body = $('#ins-body');
    const r = B.report;
    if (!r) {
      body.innerHTML = `<div class="card ins-empty"><p>Pas encore de données pour <b>${CC.esc(info.label)}</b>${B.tc !== 'all' ? ` en ${CC.esc(I.tcLabel(B.tc))}` : ''}.</p><p class="muted">Les parties que tu analyses une par une comptent aussi.</p></div>`;
      return;
    }
    body.innerHTML =
      kpis(r) +
      (B.tc === 'all' ? compareCard() : '') +
      `<h2 class="ins-h2">Tes priorités${B.tc !== 'all' ? ` en ${CC.esc(I.tcLabel(B.tc))}` : ' (toutes cadences)'}</h2>` +
      weaknessCards(r) +
      planCard(r) +
      '<h2 class="ins-h2">Le détail</h2>' +
      trendCard(r) +
      `<div class="ins-grid">${phaseCard(r)}${sourcesCard(r)}${timeCard(r)}${colorCard(r)}</div>` +
      openingsCard(r) +
      worstCard(r) +
      detailTable(B.facts);
    drawTrend();
  }

  /* ---------------- Ouvrir / s'entraîner ---------------- */
  function openFact(key, i) {
    const f = I.get(key);
    if (!f || !f.pgn) {
      app.toast('Partie introuvable dans le cache.');
      return;
    }
    app.openFromFacts(f, i);
  }

  function showTip(row) {
    const tip = $('#ins-tip');
    if (!row) {
      tip.hidden = true;
      return;
    }
    tip.textContent = row.dataset.tip;
    tip.hidden = false;
    const r = row.getBoundingClientRect();
    tip.style.left = r.left + r.width / 2 + 'px';
    tip.style.top = r.top + window.scrollY - 8 + 'px';
  }

  /* ---------------- Initialisation ---------------- */
  const UI = (CC.InsightsUI = {});
  UI.init = function (a) {
    app = a;
    B.depth = CC.store.get('cc.ins.depth', 'fast');
    $('#ins-period').addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      if (!b || B.running) return;
      B.period = b.dataset.v;
      renderAll();
      refreshCounts();
    });
    const pickTc = (v) => {
      if (B.running) return;
      B.tc = v;
      renderAll();
      refreshCounts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    $('#ins-tc').addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      if (b) pickTc(b.dataset.v);
    });
    $('#ins-body').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tcpick]');
      if (b) pickTc(b.dataset.tcpick);
    });
    $('#ins-depth').addEventListener('change', (e) => {
      B.depth = e.target.value;
      CC.store.set('cc.ins.depth', B.depth);
      renderControls();
    });
    $('#ins-run').addEventListener('click', runBatch);
    $('#ins-body').addEventListener('change', (e) => {
      const cb = e.target.closest('[data-task]');
      if (!cb || !B.report) return;
      const p = getPlan(B.report);
      const x = p.tasks.find((y) => y.id === +cb.dataset.task);
      if (!x) return;
      x.done = cb.checked;
      CC.store.set('cc.plan.' + B.tc, p);
      cb.closest('.task').classList.toggle('done', x.done);
      const n = p.tasks.filter((y) => y.done).length;
      const el = cb.closest('.plan').querySelector('.plan-n');
      if (el) el.textContent = n + '/' + p.tasks.length + ' fait' + (n > 1 ? 's' : '');
      if (n === p.tasks.length) app.toast('Programme de la semaine terminé, bravo ! 🎉');
    });
    $('#ins-stop').addEventListener('click', stopBatch);
    $('#view-insights').addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) app.showView(go.dataset.go);
      const tr = e.target.closest('[data-train]');
      if (tr) openFact(tr.dataset.train, +tr.dataset.i);
      const op = e.target.closest('[data-open]');
      if (op) openFact(op.dataset.open);
      const tl = e.target.closest('[data-train-list]');
      if (tl && B.report) {
        const w = B.report.weaknesses[+tl.dataset.trainList];
        if (w && w.examples.length) CC.RepUI.startExercises(w.examples, 'Exercices : ' + w.title);
      }
      if (e.target.closest('[data-train-worst]') && B.report) CC.RepUI.startExercises(B.report.worst, 'Tes pires erreurs');
      const fx = e.target.closest('[data-rep-fix]');
      if (fx && B.report) addOpeningFixes(B.report.weaknesses[+fx.dataset.repFix]);
      const tg = e.target.closest('[data-task-go]');
      if (tg) runTask(+tg.dataset.taskGo);
      if (e.target.closest('[data-plan-new]') && B.report) {
        getPlan(B.report, true);
        renderBody(periodInfo(B.period));
      }
      if (e.target.closest('[data-chat]')) app.showView('chat');
    });
    $('#ins-body').addEventListener('pointerover', (e) => showTip(e.target.closest('.hb-row')));
    $('#ins-body').addEventListener('pointerout', (e) => {
      if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.hb-row')) showTip(null);
    });
    $('#ins-body').addEventListener('focusin', (e) => showTip(e.target.closest('.hb-row')));
    $('#ins-body').addEventListener('focusout', () => showTip(null));
    window.addEventListener('resize', () => {
      const el = $('#trend');
      if (el && !$('#view-insights').hidden && Math.abs(el.clientWidth - B.trendW) > 8) drawTrend();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && B.running && !$('#view-insights').hidden) stopBatch();
    });
  };
  UI.show = function () {
    renderAll();
    refreshCounts();
  };
  /** Rapport texte de la période affichée (ou de toutes les parties si elle est vide) pour le chat */
  UI.context = function () {
    let info = periodInfo(B.period);
    let facts = periodFactsAllTc(info); // toutes cadences, puis une section par cadence
    if (!facts.length) {
      info = { label: 'toutes les parties analysées' };
      const me = (app.S.username || '').toLowerCase();
      facts = I.all().filter((f) => f.me && f.me.toLowerCase() === me);
    }
    if (!facts.length) return null;
    const r = I.report(facts);
    const st = app.S.stats || {};
    const rt = (k) => (st[k] && st[k].last ? st[k].last.rating : null);
    const ratings = [['blitz', rt('chess_blitz')], ['rapide', rt('chess_rapid')], ['bullet', rt('chess_bullet')]]
      .filter((x) => x[1])
      .map((x) => `${x[0]} ${x[1]}`)
      .join(', ');
    let text = I.reportText(r, { name: app.displayName() || app.S.username, ratings, period: info.label, cadence: 'toutes' });
    const groups = I.byTc(facts).filter((g) => g.facts.length >= 2).slice(0, 4);
    if (groups.length) {
      text +=
        '\n\nRAPPORTS SÉPARÉS PAR CADENCE (le joueur veut des forces/faiblesses et des conseils distincts selon le contrôle de temps) :\n' +
        groups.map((g) => I.summaryText(I.report(g.facts), g.label)).join('\n\n');
    }
    return { n: r.n, label: info.label, text };
  };
  UI.isRunning = () => B.running;
  /** Réanalyse toutes les parties (toutes périodes, toutes cadences) ; renvoie le contexte pour le coach */
  UI.runFull = async function () {
    if (B.running) stopBatch();
    B.period = 'all';
    B.tc = 'all';
    renderAll();
    await refreshCounts();
    if (B.todo && B.todo.length) await runBatch();
    return UI.context();
  };
  /** Séries d'exercices tirées de tes erreurs (pour l'onglet Répertoire › Exercices) */
  UI.exerciseSets = function () {
    let r = B.report;
    if (!r) {
      const me = (app.S.username || '').toLowerCase();
      const facts = I.all().filter((f) => f.me && f.me.toLowerCase() === me);
      r = facts.length ? I.report(facts) : null;
    }
    if (!r) return [];
    const sets = [];
    if (r.worst.length) sets.push({ title: 'Tes pires erreurs', sub: B.tc !== 'all' ? I.tcLabel(B.tc) : 'toutes cadences', items: r.worst });
    r.weaknesses.forEach((w) => {
      if (w.examples.length) sets.push({ title: w.title, sub: 'faiblesse détectée', items: w.examples });
    });
    const byPhase = (p, title) => {
      const it = r.errorList.filter((e) => e.phase === p).sort((a, b) => b.loss - a.loss).slice(0, 8);
      if (it.length >= 2) sets.push({ title, sub: 'tes erreurs', items: it });
    };
    byPhase('opening', 'Erreurs d’ouverture');
    byPhase('middlegame', 'Erreurs de milieu de partie');
    byPhase('endgame', 'Erreurs de finale');
    return sets;
  };
})(window);
