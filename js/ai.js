/* Clawd Coach — moteur d'IA du coach : Claude (Anthropic) ou Gemini (Google), au choix dans les réglages */
(function (root) {
  'use strict';
  const CC = root.CC;
  const AI = (CC.AI = {});

  /** Fournisseur choisi (par défaut : celui dont la clé est renseignée) */
  AI.provider = (s) =>
    s.aiProvider === 'gemini' || s.aiProvider === 'claude' ? s.aiProvider : s.geminiKey && !s.apiKey ? 'gemini' : 'claude';
  AI.key = (s) => (AI.provider(s) === 'gemini' ? s.geminiKey : s.apiKey);
  AI.hasKey = (s) => !!AI.key(s);
  AI.model = (s) => (AI.provider(s) === 'gemini' ? s.geminiModel || 'gemini-3.5-flash' : s.model);
  AI.name = (s) => (AI.provider(s) === 'gemini' ? 'Gemini' : 'Claude');
  AI.icon = (p) => (p === 'gemini' ? '✦' : '✻');
  AI.modelLabel = (id) => {
    if (!id) return '';
    if (id.startsWith('claude-')) {
      return id
        .replace('claude-', 'Claude ')
        .replace(/-(\d+)-(\d+)$/, ' $1.$2')
        .replace(/\b(opus|sonnet|haiku|fable)\b/g, (w) => w[0].toUpperCase() + w.slice(1));
    }
    return id
      .replace(/^gemini-/, 'Gemini ')
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  /** Une explication (coup ou partie) en streaming */
  AI.ask = async function (s, opts) {
    if (AI.provider(s) === 'gemini') {
      const r = await root.CCGemini.generate({
        key: s.geminiKey,
        model: AI.model(s),
        system: root.CCClaude.SYSTEM,
        contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
        maxTokens: opts.maxTokens,
        onText: opts.onText,
      });
      return { provider: 'gemini', model: r.model };
    }
    const final = await root.CCClaude.ask({ apiKey: s.apiKey, model: s.model, prompt: opts.prompt, maxTokens: opts.maxTokens, onText: opts.onText });
    return { provider: 'claude', model: final.model || s.model };
  };

  /* ---------------- Chat avec outils (répertoire) ---------------- */
  const MAX_STEPS = 8; // appels au modèle par message, au plus
  const side = (c) => (c === 'w' ? 'Blancs' : 'Noirs');
  /** Résumé texte des actions (pour l'autre fournisseur, qui ne voit pas les appels d'outils) */
  const actionsNote = (acts) =>
    (acts || [])
      .map((a) => `[Répertoire ${side(a.color)} : ${a.type === 'add' ? 'ajouté' : 'retiré'} ${a.line}${a.undone ? ' (annulé ensuite par le joueur)' : ''}]`)
      .join('\n');
  const textOf = (m) => [m.display || '', actionsNote(m.actions)].filter(Boolean).join('\n');
  const asBlocks = (c) => (typeof c === 'string' ? [{ type: 'text', text: c }] : c || []);

  /** Historique au format de chaque fournisseur ; les tours voisins de même rôle sont fusionnés */
  function build(messages, prov) {
    const out = [];
    const key = prov === 'gemini' ? 'parts' : 'content';
    const push = (role, items) => {
      if (!items || !items.length) return;
      const last = out[out.length - 1];
      if (last && last.role === role) last[key] = last[key].concat(items);
      else out.push({ role, [key]: items.slice() });
    };
    for (const m of messages) {
      if (prov === 'gemini') {
        if (m.role === 'user') {
          if (m.hidden) {
            if (m.provider === 'gemini') push('user', m.gparts);
          } else push('user', root.CCGemini.toGeminiText(m.content));
        } else if (m.provider === 'gemini' && m.gparts && m.gparts.length) push('model', m.gparts);
        else if (textOf(m)) push('model', [{ text: textOf(m) }]);
      } else if (m.role === 'user') {
        if (m.hidden) {
          if (m.provider === 'claude') push('user', m.content);
        } else push('user', asBlocks(m.content));
      } else if (m.provider === 'claude' && m.content && m.content.length) push('assistant', root.CCClaude.echoContent(m.content));
      else if (textOf(m)) push('assistant', [{ type: 'text', text: textOf(m) }]);
    }
    return out;
  }

  /**
   * Un tour de chat : le modèle peut appeler les outils du répertoire, puis répond.
   * Les messages produits (réponses, appels d'outils, résultats masqués) sont ajoutés à conv.messages au fil de l'eau.
   * hooks : { onText(delta), onReset(), onTool(name, input), onAction(action), onStep() }
   */
  AI.chat = async function (s, conv, hooks) {
    const prov = AI.provider(s);
    const Tools = CC.ChatTools;
    const toolCtx = { engine: CC.App && CC.App.engine };
    let gModel = null; // dans un même tour, on garde le modèle Gemini qui a répondu (repli compris)
    for (let step = 0; step < MAX_STEPS; step++) {
      let msg;
      let calls = [];
      if (prov === 'gemini') {
        const r = await root.CCGemini.generate({
          key: s.geminiKey,
          model: gModel || AI.model(s),
          system: conv.system.map((b) => b.text).join('\n\n'),
          contents: build(conv.messages, 'gemini'),
          tools: Tools ? Tools.gemini() : null,
          maxTokens: 8192,
          onText: hooks.onText,
        });
        gModel = r.model;
        msg = { role: 'assistant', provider: 'gemini', model: r.model, gparts: r.parts, display: r.text };
        calls = r.calls.map((c) => ({ id: c.id || null, name: c.name, input: c.args || {} }));
      } else {
        const final = await root.CCClaude.chat({
          apiKey: s.apiKey,
          model: s.model,
          system: conv.system,
          messages: build(conv.messages, 'claude'),
          tools: Tools ? Tools.claude() : null,
          onText: hooks.onText,
          onReset: hooks.onReset,
        });
        const display = final.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('');
        msg = { role: 'assistant', provider: 'claude', model: final.model, content: final.content, display };
        const uses = final.content.filter((b) => b.type === 'tool_use');
        if (final.stop_reason === 'max_tokens' && uses.length) throw new Error('Réponse coupée pendant un appel d’outil (limite de longueur).');
        if (final.stop_reason === 'pause_turn') {
          conv.messages.push(msg); // le serveur a mis le tour en pause : on le relance tel quel
          continue;
        }
        if (final.stop_reason === 'tool_use') calls = uses.map((b) => ({ id: b.id, name: b.name, input: b.input }));
      }
      conv.messages.push(msg);
      if (!calls.length || !Tools) return;

      const results = [];
      const actions = [];
      for (const c of calls) {
        if (hooks.onTool) hooks.onTool(c.name, c.input);
        const out = await Tools.run(c.name, c.input, toolCtx);
        if (out.action) {
          actions.push(out.action);
          if (hooks.onAction) hooks.onAction(out.action);
        }
        results.push({ c, out });
      }
      if (actions.length) msg.actions = actions;
      conv.messages.push(
        prov === 'gemini'
          ? {
              role: 'user',
              hidden: true,
              provider: 'gemini',
              gparts: results.map(({ c, out }) => ({ functionResponse: Object.assign({ name: c.name, response: out.result }, c.id ? { id: c.id } : {}) })),
            }
          : {
              role: 'user',
              hidden: true,
              provider: 'claude',
              content: results.map(({ c, out }) => Object.assign({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out.result) }, out.isError ? { is_error: true } : {})),
            }
      );
      if (hooks.onStep) hooks.onStep();
    }
    conv.messages.push({ role: 'assistant', provider: 'local', display: 'J’ai fait beaucoup de modifications d’un coup, je m’arrête là. Dis-moi si je continue.' });
  };
  AI.actionsNote = actionsNote;

  AI.errorText = (e) => (e && e.gemini ? root.CCGemini.errorText(e) : root.CCClaude.errorText(e));

  /** Vérifie la clé du fournisseur choisi sans consommer de jetons */
  AI.testKey = async function (s) {
    if (AI.provider(s) === 'gemini') {
      const m = await root.CCGemini.testKey(s.geminiKey, AI.model(s));
      return m.displayName || m.name;
    }
    const m = await root.CCClaude.testKey(s.apiKey, s.model);
    return m.display_name || m.id;
  };
})(window);
