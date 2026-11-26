/* Claude Coach — coach IA avec Gemini (API Google AI Studio), appelé directement depuis le navigateur.
 * La clé reste dans ce navigateur (localStorage) et n'est envoyée qu'à generativelanguage.googleapis.com. */
(function (root) {
  'use strict';
  const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
  // Si le modèle choisi est saturé ou indisponible, on bascule sur ces modèles
  const FALLBACK = ['gemini-3.5-flash', 'gemini-3.5-flash-lite'];
  const MODELS = [
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash : fiable (par défaut)' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash : le plus récent (parfois saturé)' },
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite : le plus rapide' },
  ];

  class GeminiError extends Error {
    constructor(status, message, code) {
      super(message);
      this.status = status;
      this.code = code || '';
      this.gemini = true;
    }
  }

  async function errorFrom(res) {
    let j = null;
    try {
      j = await res.json();
    } catch (e) {
      /* corps illisible */
    }
    const err = ((Array.isArray(j) ? j[0] : j) || {}).error || {};
    return new GeminiError(res.status, err.message || 'HTTP ' + res.status, err.status);
  }

  /** Un appel en streaming (SSE). Renvoie { text, parts, model, finish } */
  async function streamOnce(key, model, body, onText) {
    const ctrl = new AbortController();
    let timer = setTimeout(() => ctrl.abort(), 40000); // pas de réponse en 40 s : on abandonne (puis modèle de repli)
    let res;
    try {
      res = await fetch(`${BASE}${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      throw new GeminiError(0, ctrl.signal.aborted ? 'Gemini ne répond pas (délai dépassé).' : 'Connexion impossible à l’API Gemini.', 'NETWORK');
    }
    if (!res.ok) {
      clearTimeout(timer);
      throw await errorFrom(res);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let text = '';
    let finish = null;
    const parts = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        clearTimeout(timer);
        timer = setTimeout(() => ctrl.abort(), 60000);
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, k).trim();
          buf = buf.slice(k + 1);
          if (!line.startsWith('data:')) continue;
          let j;
          try {
            j = JSON.parse(line.slice(5).trim());
          } catch (e) {
            continue;
          }
          if (j.promptFeedback && j.promptFeedback.blockReason) throw new GeminiError(200, `Demande bloquée par Gemini (${j.promptFeedback.blockReason}).`, 'BLOCKED');
          const c = j.candidates && j.candidates[0];
          if (c && c.content && Array.isArray(c.content.parts)) {
            for (const p of c.content.parts) {
              parts.push(p);
              if (p.text && !p.thought) {
                text += p.text;
                onText(p.text);
              }
            }
          }
          if (c && c.finishReason) finish = c.finishReason;
        }
      }
    } catch (e) {
      if (e instanceof GeminiError) throw e;
      throw new GeminiError(0, ctrl.signal.aborted ? 'Gemini s’est interrompu (délai dépassé).' : 'La réponse de Gemini a été coupée.', 'NETWORK');
    } finally {
      clearTimeout(timer);
    }
    if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') throw new GeminiError(200, 'Gemini a refusé de répondre (filtre de sécurité).', 'BLOCKED');
    return { text, parts, model, finish };
  }

  /** Regroupe les morceaux de texte du flux (sans toucher aux parties signées ni aux appels de fonction) */
  function mergeParts(parts) {
    const out = [];
    for (const p of parts) {
      if (p.thought) continue;
      const prev = out[out.length - 1];
      const plain = (x) => x && typeof x.text === 'string' && Object.keys(x).length === 1;
      if (plain(p) && plain(prev)) prev.text += p.text;
      else out.push(Object.assign({}, p));
    }
    return out;
  }

  /** Génération avec repli automatique si le modèle est saturé ou indisponible */
  async function generate(opts) {
    const body = {
      contents: opts.contents,
      generationConfig: { maxOutputTokens: opts.maxTokens || 8192 },
    };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    if (opts.tools) body.tools = opts.tools;
    const chain = [opts.model].concat(FALLBACK).filter((m, i, a) => m && a.indexOf(m) === i);
    let last = null;
    for (const model of chain) {
      let emitted = false;
      try {
        const r = await streamOnce(opts.key, model, body, (d) => {
          emitted = true;
          opts.onText(d);
        });
        r.calls = r.parts.filter((p) => p.functionCall).map((p) => p.functionCall);
        r.parts = mergeParts(r.parts);
        if (!r.text && !r.calls.length) throw new GeminiError(200, 'Réponse vide de Gemini.', 'EMPTY');
        return r;
      } catch (e) {
        last = e;
        // on ne réessaie que les erreurs « temporaires » et seulement si rien n'a encore été affiché
        if (emitted || !(e.status === 503 || e.status === 429 || e.status === 404 || e.status === 500 || e.code === 'EMPTY' || e.code === 'NETWORK')) throw e;
      }
    }
    throw last;
  }

  function toGeminiText(content) {
    if (typeof content === 'string') return [{ text: content }];
    return (content || []).filter((b) => b && b.text).map((b) => ({ text: b.text }));
  }

  /** Vérifie la clé (liste des modèles, ne consomme rien) */
  async function testKey(key, model) {
    let res;
    try {
      res = await fetch(`${BASE}${encodeURIComponent(model)}?key=${encodeURIComponent(key)}`);
    } catch (e) {
      throw new GeminiError(0, 'Connexion impossible à l’API Gemini.', 'NETWORK');
    }
    if (!res.ok) throw await errorFrom(res);
    return res.json();
  }

  function errorText(err) {
    if (!err) return 'Erreur inconnue.';
    const s = err.status;
    if (err.code === 'BLOCKED' || err.code === 'NETWORK') return err.message;
    if (s === 400 && /API key|API_KEY/i.test(err.message)) return 'Clé Gemini invalide. Vérifie-la dans les réglages.';
    if (s === 401 || s === 403) return 'Cette clé Gemini n’est pas autorisée (vérifie qu’elle vient de Google AI Studio).';
    if (s === 404) return 'Modèle Gemini indisponible pour ta clé : choisis-en un autre dans les réglages.';
    if (s === 429) return 'Quota Gemini atteint (429) : réessaie dans un moment.';
    if (s === 503) return 'Gemini est saturé en ce moment (503) : réessaie dans un instant.';
    return 'Erreur Gemini' + (s ? ` (${s})` : '') + ' : ' + err.message;
  }

  root.CCGemini = { MODELS, generate, testKey, errorText, toGeminiText, GeminiError };
})(window);
