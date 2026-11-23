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

  /**
   * Un tour de chat. L'historique est converti pour le fournisseur actif :
   * une réponse produite par l'autre fournisseur est renvoyée comme simple texte.
   */
  AI.chat = async function (s, conv, onText) {
    if (AI.provider(s) === 'gemini') {
      const contents = conv.messages.map((m) =>
        m.role === 'user'
          ? { role: 'user', parts: root.CCGemini.toGeminiText(m.content) }
          : { role: 'model', parts: m.provider === 'gemini' && m.gparts && m.gparts.length ? m.gparts : [{ text: m.display || '' }] }
      );
      const r = await root.CCGemini.generate({
        key: s.geminiKey,
        model: AI.model(s),
        system: conv.system.map((b) => b.text).join('\n\n'),
        contents,
        maxTokens: 8192,
        onText,
      });
      return { provider: 'gemini', model: r.model, display: r.text, gparts: r.parts.filter((p) => !p.thought) };
    }
    const messages = conv.messages.map((m) =>
      m.role === 'user'
        ? { role: 'user', content: m.content }
        : { role: 'assistant', content: m.provider !== 'gemini' && m.content ? root.CCClaude.echoContent(m.content) : [{ type: 'text', text: m.display || '' }] }
    );
    const final = await root.CCClaude.chat({ apiKey: s.apiKey, model: s.model, system: conv.system, messages, onText });
    const shown = final.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return { provider: 'claude', model: final.model, display: shown, content: final.content };
  };

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
