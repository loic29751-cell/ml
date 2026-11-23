/* Clawd Coach — chat privé avec Clawd (Claude), nourri par le rapport « Mes faiblesses ».
 * La conversation reste dans ce navigateur (localStorage) ; les messages partent seulement vers api.anthropic.com. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const $ = (s, r) => (r || document).querySelector(s);
  const KEY = 'cc.chat';
  const VERBS = ['Cogite', 'Réfléchit', 'Mijote', 'Rumine', 'Gamberge', 'Phosphore', 'Médite', 'Calcule'];
  const SUGGEST = [
    'Quelle est ma plus grosse faiblesse ?',
    'Compare mon jeu en 5 min et en 10 min',
    'Fais-moi un plan d’entraînement sur 2 semaines',
    'Quelle ouverture devrais-je travailler ?',
    'Ajoute à mon répertoire une défense solide contre 1.e4',
    'Explique-moi ma pire erreur du mois',
  ];
  const TOOL_STATUS = {
    get_repertoire: (i) => `Je regarde ton répertoire ${i.color === 'w' ? 'Blancs' : 'Noirs'}…`,
    add_repertoire_line: (i) => `J’ajoute ${Array.isArray(i.moves) ? i.moves.slice(0, 8).join(' ') : 'une ligne'}… (vérification Stockfish)`,
    remove_repertoire_line: () => 'Je retire une ligne du répertoire…',
  };
  let app = null;
  let busy = false;
  let pendingCtx = null; // contexte de partie à joindre au prochain message

  const load = () => CC.store.get(KEY, null);
  const save = (c) => {
    if (!CC.store.set(KEY, c)) {
      // stockage plein : on garde la conversation mais on retire les plus vieux échanges
      c.messages = c.messages.slice(-16);
      while (c.messages.length && (c.messages[0].role !== 'user' || c.messages[0].hidden)) c.messages.shift();
      CC.store.set(KEY, c);
    }
  };

  /* ---------------- Rendu ---------------- */
  function md(text) {
    const lines = CC.esc(String(text || '').trim()).split('\n');
    let html = '';
    let list = null;
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    for (const raw of lines) {
      const l = raw.trim();
      const bullet = /^([-•*]|\d+[.)])\s+(.*)$/.exec(l);
      if (bullet) {
        const kind = /\d/.test(bullet[1]) ? 'ol' : 'ul';
        if (list !== kind) {
          if (list) html += `</${list}>`;
          html += `<${kind}>`;
          list = kind;
        }
        html += `<li>${inline(bullet[2])}</li>`;
        continue;
      }
      if (list) {
        html += `</${list}>`;
        list = null;
      }
      if (!l) continue;
      html += `<p>${inline(l.replace(/^#+\s*/, ''))}</p>`;
    }
    if (list) html += `</${list}>`;
    return html;
  }

  const userHTML = (m) =>
    `<div class="msg user"><div class="msg-bubble">${CC.esc(m.display || '').replace(/\n/g, '<br>')}${m.ctxLabel ? `<div class="msg-ctx">📎 ${CC.esc(m.ctxLabel)}</div>` : ''}</div></div>`;
  const botHTML = (inner, mood) => `<div class="msg bot"><div class="msg-av">${Clawd.svg(mood || 'idle')}</div><div class="msg-bubble">${inner}</div></div>`;
  const lineHTML = (line) =>
    String(line || '')
      .split(' ')
      .map((t) => (/^\d+[.…]+$/.test(t) ? `<span class="mn">${t}</span>` : CC.sanHTML(t)))
      .join(' ');

  /** Carte d'une modification du répertoire faite par l'IA (mi/ai = position dans l'historique, absente pendant la réponse) */
  function actionHTML(a, mi, ai) {
    const add = a.type === 'add';
    const who = a.color === 'w' ? 'Blancs' : 'Noirs';
    const meta = add
      ? `${a.added} coup${a.added > 1 ? 's' : ''} pour toi${a.replaced ? ` · ${a.replaced} remplacé${a.replaced > 1 ? 's' : ''}` : ''}${a.eval ? ` · Stockfish ${CC.esc(a.eval)}` : ''}`
      : `${CC.sanHTML(a.removed)} et la suite · ${a.count || 1} position${(a.count || 1) > 1 ? 's' : ''}`;
    const live = mi == null;
    return `<div class="act-card${a.undone ? ' undone' : ''}${a.bad ? ' warn' : ''}"${live ? '' : ` data-mi="${mi}" data-ai="${ai}"`}>
      <div class="act-ic" aria-hidden="true">${add ? '+' : '−'}</div>
      <div class="act-body">
        <div class="act-title">${add ? 'Ajouté au' : 'Retiré du'} répertoire ${who}${a.undone ? ' <span class="act-tag">annulé</span>' : ''}${a.bad ? ' <span class="act-tag warn">à vérifier</span>' : ''}</div>
        ${a.name ? `<div class="act-name">${CC.esc(a.name)}</div>` : ''}
        <div class="act-line">${lineHTML(a.line)}</div>
        <div class="act-meta">${meta}</div>
      </div>
      <div class="act-btns">
        <button class="btn-mini" data-act="view"${live ? ' disabled' : ''}>Voir</button>
        <button class="btn-mini" data-act="${a.undone ? 'redo' : 'undo'}"${live ? ' disabled' : ''}>${a.undone ? 'Rétablir' : 'Annuler'}</button>
      </div>
    </div>`;
  }

  /** Historique : un message joueur, puis une seule bulle pour tout ce que Clawd a fait (texte + actions) */
  function historyHTML(messages) {
    let html = '';
    let bot = null;
    const flush = () => {
      if (bot !== null && bot !== '') html += botHTML(bot);
      bot = null;
    };
    messages.forEach((m, mi) => {
      if (m.role === 'user') {
        if (m.hidden) return;
        flush();
        html += userHTML(m);
        return;
      }
      bot = (bot || '') + md(m.display) + (m.actions || []).map((a, ai) => actionHTML(a, mi, ai)).join('');
    });
    flush();
    return html;
  }

  function welcome() {
    const ctx = CC.InsightsUI ? CC.InsightsUI.context() : null;
    const name = (app.displayName && app.displayName()) || app.S.username || '';
    let t = `Salut${name ? ' ' + CC.esc(name) : ''} ! C’est notre coin privé : pose-moi toutes tes questions sur ton jeu. Je peux aussi remplir ton répertoire d’ouvertures selon tes besoins (tu pourras tout annuler).`;
    if (ctx) t += ` Je connais tes <b>${ctx.n}</b> parties analysées (${CC.esc(ctx.label)}), séparées par cadence.`;
    else t += ' Pour que je te connaisse vraiment, lance d’abord une analyse dans <button class="linkbtn" data-go="insights">Mes faiblesses</button>.';
    if (!CC.AI.hasKey(app.S.settings)) {
      t +=
        '<br><br>Pour discuter avec moi ici, il faut une clé API Claude ou Gemini (<button class="linkbtn" data-key>l’ajouter</button>). Sinon, copie ton rapport et colle-le dans claude.ai : <button class="linkbtn" data-export>copier pour claude.ai</button>.';
    }
    return `<div class="msg bot"><div class="msg-av">${Clawd.svg('happy')}</div><div class="msg-bubble"><p>${t}</p></div></div>`;
  }

  function render() {
    const conv = load();
    const log = $('#chat-log');
    let html = welcome();
    if (conv) html += historyHTML(conv.messages);
    log.innerHTML = html;
    const ctx = CC.InsightsUI ? CC.InsightsUI.context() : null;
    const stale = conv && ctx && conv.ctxN !== ctx.n;
    $('#chat-stale').hidden = !stale;
    if (stale) $('#chat-stale-n').textContent = String(ctx.n);
    $('#chat-suggest').innerHTML = !conv || conv.messages.filter((m) => m.role === 'user' && !m.hidden).length < 1 ? SUGGEST.map((s) => `<button class="chip" data-suggest>${CC.esc(s)}</button>`).join('') : '';
    $('#chat-model').textContent = CC.AI.modelLabel(CC.AI.model(app.S.settings));
    log.scrollTop = log.scrollHeight;
  }


  /* ---------------- Envoi ---------------- */
  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    if (!CC.AI.hasKey(app.S.settings)) {
      app.openSettings('ai');
      app.toast('Ajoute une clé API (Claude ou Gemini) pour discuter avec Clawd ✻');
      return;
    }
    let conv = load();
    if (!conv) {
      const ctx = CC.InsightsUI ? CC.InsightsUI.context() : null;
      conv = { v: 1, created: Date.now(), ctxN: ctx ? ctx.n : 0, system: CCClaude.chatSystem(ctx ? ctx.text : null), messages: [] };
    }
    const user = { role: 'user', display: text };
    if (pendingCtx) {
      user.content = [
        { type: 'text', text },
        { type: 'text', text: `<partie_ouverte>\n${pendingCtx.text}\n</partie_ouverte>` },
      ];
      user.ctxLabel = pendingCtx.label;
      pendingCtx = null;
    } else user.content = text;
    conv.messages.push(user);
    save(conv);
    render();
    $('#chat-input').value = '';
    autoGrow();

    busy = true;
    $('#chat-send').disabled = true;
    const log = $('#chat-log');
    const live = document.createElement('div');
    live.className = 'msg bot';
    live.innerHTML = `<div class="msg-av">${Clawd.svg('thinking', 'anim-walk')}</div><div class="msg-bubble"><p class="typing"><span class="cc-spin">✻</span> ${VERBS[Math.floor(Math.random() * VERBS.length)]}…</p></div>`;
    log.appendChild(live);
    log.scrollTop = log.scrollHeight;
    // La bulle en direct : morceaux de texte et cartes d'action, dans l'ordre où ils arrivent
    const segs = [{ t: 'text', v: '' }];
    let status = '';
    let raf = 0;
    const paint = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const body = segs.map((s) => (s.t === 'text' ? md(s.v) : actionHTML(s.v))).join('');
        const tail = status ? `<p class="typing tool"><span class="cc-spin">✻</span> ${CC.esc(status)}</p>` : '<span class="caret"></span>';
        $('.msg-bubble', live).innerHTML = body + tail;
        log.scrollTop = log.scrollHeight;
      });
    };
    const lastText = () => {
      if (segs[segs.length - 1].t !== 'text') segs.push({ t: 'text', v: '' });
      return segs[segs.length - 1];
    };
    const base = conv.messages.length;
    let changed = 0;
    try {
      // Claude ou Gemini selon les réglages ; l'historique reste en ajout seul (réponses renvoyées telles quelles)
      await CC.AI.chat(app.S.settings, conv, {
        onText: (d) => {
          status = '';
          lastText().v += d;
          paint();
        },
        onReset: () => {
          lastText().v = '';
          paint();
        },
        onTool: (name, input) => {
          const st = TOOL_STATUS[name];
          status = st ? st(input || {}) : 'Je travaille…';
          lastText().v += '\n\n';
          paint();
        },
        onAction: (a) => {
          changed++;
          segs.push({ t: 'action', v: a });
          paint();
        },
        onStep: () => save(conv),
      });
      save(conv);
    } catch (e) {
      if (conv.messages.length > base) {
        // des outils ont déjà tourné : on garde ce qui a été fait et on le signale
        conv.messages.push({ role: 'assistant', provider: 'local', display: `Je n’ai pas pu terminer ma réponse (${CC.AI.errorText(e)}). Les changements ci-dessus sont bien faits ; tu peux les annuler.` });
        save(conv);
      } else {
        // l'échange n'a pas abouti : on retire la question et on la remet dans la zone de saisie
        conv.messages.pop();
        save(conv);
        $('#chat-input').value = text;
      }
      app.toast(CC.esc(CC.AI.errorText(e)));
    } finally {
      if (changed && CC.RepUI && CC.RepUI.refresh) CC.RepUI.refresh();
      busy = false;
      $('#chat-send').disabled = false;
      render();
    }
  }

  function autoGrow() {
    const t = $('#chat-input');
    t.style.height = 'auto';
    t.style.height = Math.min(160, t.scrollHeight) + 'px';
  }

  async function exportToClaude() {
    const ctx = CC.InsightsUI ? CC.InsightsUI.context() : null;
    if (!ctx) {
      app.toast('Analyse d’abord quelques parties dans « Mes faiblesses ».');
      return;
    }
    const text = CCClaude.exportPrompt(ctx.text);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        ok = false;
      }
      ta.remove();
    }
    if (ok) {
      app.toast('Rapport copié ! Colle-le dans la conversation claude.ai qui vient de s’ouvrir.');
      window.open('https://claude.ai/new', '_blank', 'noopener');
    } else app.toast('Copie impossible dans ce navigateur.');
  }

  /** Voir / Annuler / Rétablir sur une carte d'action */
  function actionClick(btn) {
    const card = btn.closest('.act-card');
    const conv = load();
    const m = conv && conv.messages[+card.dataset.mi];
    const a = m && m.actions && m.actions[+card.dataset.ai];
    if (!a || busy) return;
    const kind = btn.dataset.act;
    if (kind === 'view') {
      CC.RepUI.openAt(a.color, a.path || []);
      return;
    }
    const n = CC.ChatTools.apply(a, kind === 'undo' ? 'undo' : 'redo');
    save(conv);
    render();
    if (CC.RepUI && CC.RepUI.refresh) CC.RepUI.refresh();
    if (kind === 'undo') app.toast(n ? 'Modification annulée ✓' : 'Rien à annuler : ces positions ont changé depuis.');
    else app.toast(n ? 'Modification rétablie ✓' : 'Rien à rétablir : ces positions ont changé depuis.');
  }

  /* ---------------- Initialisation ---------------- */
  const UI = (CC.ChatUI = {});
  UI.init = function (a) {
    app = a;
    Clawd.set($('#chat-clawd'), 'happy', 'bob');
    $('#chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      send($('#chat-input').value);
    });
    $('#chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send($('#chat-input').value);
      }
    });
    $('#chat-input').addEventListener('input', autoGrow);
    if (window.matchMedia && matchMedia('(max-width: 700px)').matches) $('#chat-input').placeholder = 'Pose ta question à Clawd…';
    $('#chat-new').addEventListener('click', () => {
      if (busy) return;
      const conv = load();
      if (conv && conv.messages.length && !confirm('Effacer cette conversation et en commencer une nouvelle ?')) return;
      CC.store.del(KEY);
      pendingCtx = null;
      render();
    });
    $('#chat-export').addEventListener('click', exportToClaude);
    $('#view-chat').addEventListener('click', (e) => {
      const s = e.target.closest('[data-suggest]');
      if (s) send(s.textContent);
      if (e.target.closest('[data-key]')) app.openSettings('ai');
      if (e.target.closest('[data-export]')) exportToClaude();
      const go = e.target.closest('[data-go]');
      if (go) app.showView(go.dataset.go);
      const act = e.target.closest('.act-card[data-mi] [data-act]');
      if (act) actionClick(act);
      if (e.target.closest('[data-refresh]')) {
        CC.store.del(KEY);
        render();
      }
    });
  };
  UI.show = function () {
    render();
    setTimeout(() => $('#chat-input').focus(), 30);
  };
  /** Depuis le bilan d'une partie : ouvre le chat avec la partie en pièce jointe */
  UI.aboutGame = function (ctxText) {
    if (!ctxText) return;
    const g = app.S.game;
    pendingCtx = { text: ctxText, label: g ? `${g.white.name} – ${g.black.name}` : 'Partie ouverte' };
    app.showView('chat');
    const input = $('#chat-input');
    input.value = 'Peux-tu m’expliquer les moments clés de cette partie et ce que je dois en retenir ?';
    autoGrow();
    input.focus();
    app.toast('Partie jointe à ton prochain message 📎');
  };
})(window);
