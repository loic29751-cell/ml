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
    'Explique-moi ma pire erreur du mois',
  ];
  let app = null;
  let busy = false;
  let pendingCtx = null; // contexte de partie à joindre au prochain message

  const load = () => CC.store.get(KEY, null);
  const save = (c) => {
    if (!CC.store.set(KEY, c)) {
      // stockage plein : on garde la conversation mais on retire les plus vieux échanges
      c.messages = c.messages.slice(-12);
      while (c.messages.length && c.messages[0].role !== 'user') c.messages.shift();
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

  function msgHTML(m) {
    if (m.role === 'user') {
      return `<div class="msg user"><div class="msg-bubble">${CC.esc(m.display || '').replace(/\n/g, '<br>')}${m.ctxLabel ? `<div class="msg-ctx">📎 ${CC.esc(m.ctxLabel)}</div>` : ''}</div></div>`;
    }
    return `<div class="msg bot"><div class="msg-av">${Clawd.svg('idle')}</div><div class="msg-bubble">${md(m.display)}</div></div>`;
  }

  function welcome() {
    const ctx = CC.InsightsUI ? CC.InsightsUI.context() : null;
    const name = (app.displayName && app.displayName()) || app.S.username || '';
    let t = `Salut${name ? ' ' + CC.esc(name) : ''} ! C’est notre coin privé : pose-moi toutes tes questions sur ton jeu.`;
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
    if (conv) html += conv.messages.map(msgHTML).join('');
    log.innerHTML = html;
    const ctx = CC.InsightsUI ? CC.InsightsUI.context() : null;
    const stale = conv && ctx && conv.ctxN !== ctx.n;
    $('#chat-stale').hidden = !stale;
    if (stale) $('#chat-stale-n').textContent = String(ctx.n);
    $('#chat-suggest').innerHTML = !conv || conv.messages.length < 2 ? SUGGEST.map((s) => `<button class="chip" data-suggest>${CC.esc(s)}</button>`).join('') : '';
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
    let acc = '';
    let raf = 0;
    try {
      // Claude ou Gemini selon les réglages ; l'historique reste en ajout seul (réponses renvoyées telles quelles)
      const r = await CC.AI.chat(app.S.settings, conv, (d) => {
        acc += d;
        if (!raf) {
          raf = requestAnimationFrame(() => {
            raf = 0;
            $('.msg-bubble', live).innerHTML = md(acc) + '<span class="caret"></span>';
            log.scrollTop = log.scrollHeight;
          });
        }
      });
      conv.messages.push({ role: 'assistant', provider: r.provider, model: r.model, content: r.content || null, gparts: r.gparts || null, display: r.display || acc });
      save(conv);
    } catch (e) {
      // l'échange n'a pas abouti : on retire la question et on la remet dans la zone de saisie
      conv.messages.pop();
      save(conv);
      $('#chat-input').value = text;
      app.toast(CC.esc(CC.AI.errorText(e)));
    } finally {
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
