/* Clawd Coach — explications optionnelles par Claude (SDK officiel @anthropic-ai/sdk, chargé à la demande).
 * La clé API reste dans le navigateur (localStorage) et n'est envoyée qu'à api.anthropic.com. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const A = CC.Analysis;
  const SDK_URLS = [
    'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.11.0/+esm',
    'https://esm.sh/@anthropic-ai/sdk@1.11.0',
  ];
  let sdkPromise = null;
  let SDK = null;

  function loadSDK() {
    if (!sdkPromise) {
      sdkPromise = (async () => {
        let err = null;
        for (const url of SDK_URLS) {
          try {
            const mod = await import(url);
            SDK = mod.default || mod.Anthropic;
            if (SDK) return SDK;
          } catch (e) {
            err = e;
          }
        }
        sdkPromise = null;
        throw err || new Error('SDK Anthropic introuvable');
      })();
    }
    return sdkPromise;
  }

  const SYSTEM = [
    'Tu es Clawd, la petite mascotte pixel orange de Claude Code, reconvertie en coach d’échecs.',
    'Tu coaches un joueur amateur, en français, en le tutoyant. Ton ton : chaleureux, direct et concret, avec parfois une petite touche d’humour de développeur, sans en abuser.',
    'Règles : appuie-toi uniquement sur les évaluations et variantes Stockfish fournies ; n’invente jamais de coup ni de variante absents des données ;',
    'écris les coups en notation algébrique anglaise telle que fournie (Nf3, Bxe5, O-O…) ;',
    'pas de Markdown (ni titres, ni gras, ni listes numérotées) ; réponds directement, sans préambule.',
  ].join(' ');

  const side = (c) => (c === 'w' ? 'Blancs' : 'Noirs');
  const pl = (p) => `${p.name}${p.rating ? ` (${p.rating})` : ''}`;

  function header(game, review, userColor) {
    return [
      `Partie : ${pl(game.white)} avec les Blancs contre ${pl(game.black)} avec les Noirs${game.timeClass ? `, cadence ${game.timeClass}` : ''}.`,
      review.opening ? `Ouverture : ${review.opening.name} (${review.opening.eco}).` : '',
      `Le joueur que tu coaches joue les ${side(userColor)}.`,
    ];
  }

  /** Prompt pour expliquer un coup précis */
  function movePrompt(ctx) {
    const { game, review, evals, i, userColor } = ctx;
    const m = review.moves[i];
    const mv = game.moves[i];
    const E0 = evals[i];
    const E1 = evals[i + 1];
    const best = A.pvToSan(mv.fenBefore, E0.lines[0].pv, 8).join(' ');
    const second = E0.lines[1]
      ? `${A.pvToSan(mv.fenBefore, E0.lines[1].pv, 6).join(' ')} (évaluation ${CC.fmtEval(E0.lines[1].score)})`
      : 'aucune';
    const reply = E1.terminal ? '(partie terminée)' : A.pvToSan(mv.fenAfter, E1.lines[0].pv, 8).join(' ');
    const hints = [];
    const hang = A.hanging(mv.fenAfter, m.color)[0];
    if (hang) hints.push(`après le coup, le ${CC.NAME[hang.piece]} des ${side(m.color)} en ${hang.square} peut être gagné`);
    if (m.sacrifice) hints.push(`sacrifice de ${CC.NAME[m.sacrifice.piece]} en ${m.sacrifice.square}`);
    if (m.mateBest != null && m.mateBest > 0) hints.push(`les ${side(m.color)} avaient un mat en ${m.mateBest}`);
    const mateAfter = CC.mateFor(E1.lines[0].score, m.color);
    if (mateAfter != null && mateAfter < 0) hints.push(`après le coup, les ${side(m.color)} se font mater en ${-mateAfter}`);
    return header(game, review, userColor)
      .concat([
        `Coup analysé : ${CC.moveLabel(mv.fenBefore, mv.color)} ${mv.san}, joué par ${m.color === userColor ? 'le joueur que tu coaches' : 'son adversaire'} (${side(m.color)}).`,
        `Position avant le coup (FEN) : ${mv.fenBefore}`,
        `Classification : ${CC.CLS[m.cls].label} (perte de chances de gain : ${m.loss.toFixed(1)} points de pourcentage).`,
        `Évaluation avant le coup (meilleur jeu) : ${CC.fmtEval(m.scoreBefore)} ; après le coup : ${CC.fmtEval(m.scoreAfter)} (en pions, point de vue des Blancs ; M = mat).`,
        `Meilleur coup selon Stockfish : ${A.sanOf(mv.fenBefore, m.bestUci) || '?'} ; suite principale : ${best}.`,
        `Deuxième option : ${second}.`,
        `Meilleure suite après le coup joué : ${reply}.`,
        hints.length ? `Indices détectés automatiquement : ${hints.join(' ; ')}.` : '',
        '',
        `Explique en 2 à 4 phrases (70 mots maximum) pourquoi ${mv.san} mérite cette classification et quelle idée concrète retenir. S’il existe un meilleur coup, explique son idée.`,
      ])
      .filter(Boolean)
      .join('\n');
  }

  /** Prompt pour le bilan complet de la partie */
  function gamePrompt(ctx) {
    const { game, review, userColor } = ctx;
    const opp = userColor === 'w' ? 'b' : 'w';
    const me = userColor === 'w' ? game.white : game.black;
    const moments = review.keyMoments.slice(0, 14).map((i) => {
      const m = review.moves[i];
      const mv = game.moves[i];
      return `- ${CC.moveLabel(mv.fenBefore, mv.color)} ${mv.san} (${m.color === userColor ? 'toi' : 'adversaire'}) : ${CC.CLS[m.cls].label}, éval ${CC.fmtEval(m.scoreBefore)} → ${CC.fmtEval(m.scoreAfter)}, meilleur coup ${A.sanOf(mv.fenBefore, m.bestUci) || '?'}`;
    });
    const c = review.counts[userColor];
    const counts = CC.CLS_ORDER.filter((k) => c[k]).map((k) => `${CC.CLS[k].label} ${c[k]}`).join(', ');
    const phases = ['opening', 'middlegame', 'endgame']
      .filter((p) => review.phases[p][userColor])
      .map((p) => `${{ opening: 'ouverture', middlegame: 'milieu de partie', endgame: 'finale' }[p]} ${review.phases[p][userColor].acc.toFixed(0)} %`)
      .join(', ');
    return header(game, review, userColor)
      .concat([
        `Résultat pour le joueur coaché : ${me.result ? CC.ChessCom.resultLabel(me.result) : 'inconnu'}${game.headers.Termination ? ` (${game.headers.Termination})` : ''}.`,
        `Précision : joueur coaché ${review.accuracy[userColor] != null ? review.accuracy[userColor].toFixed(1) : '?'} %, adversaire ${review.accuracy[opp] != null ? review.accuracy[opp].toFixed(1) : '?'} %.`,
        `Bilan des coups du joueur coaché : ${counts || 'n/a'}.`,
        phases ? `Précision par phase : ${phases}.` : '',
        `Nombre de demi-coups : ${game.moves.length}.`,
        'Moments clés (analyse Stockfish) :',
        moments.length ? moments.join('\n') : '- aucun moment critique détecté',
        '',
        'Fais un bilan en trois paragraphes courts, chacun commençant par « • » : ce qui a bien marché, le tournant de la partie, puis deux conseils concrets pour progresser. 150 mots maximum au total.',
      ])
      .filter(Boolean)
      .join('\n');
  }

  /** Envoie la requête en streaming ; onText reçoit chaque morceau de texte. */
  async function ask(opts) {
    const Anthropic = await loadSDK();
    const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
    const params = {
      model: opts.model,
      max_tokens: opts.maxTokens || 6000,
      system: SYSTEM,
      messages: [{ role: 'user', content: opts.prompt }],
      output_config: { effort: 'medium' },
    };
    // Repli automatique côté serveur si le modèle décline (pas disponible pour Haiku)
    const stream = opts.model.startsWith('claude-haiku')
      ? client.messages.stream(params)
      : client.beta.messages.stream(Object.assign({}, params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }));
    stream.on('text', (delta) => opts.onText(delta));
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      const e = new Error('refusal');
      e.refusal = true;
      throw e;
    }
    return final;
  }

  /* ---------------- Chat privé ---------------- */
  const CHAT_SYSTEM = [
    'Tu es Clawd, la petite mascotte pixel orange de Claude Code, devenue le coach d’échecs personnel du joueur.',
    'Tu discutes en privé avec lui, en français, en le tutoyant. Ton ton : chaleureux, direct et concret, avec parfois une touche d’humour de développeur, sans en abuser.',
    'Tu disposes plus bas du rapport d’analyse Stockfish de ses parties chess.com. Appuie-toi sur ces chiffres et sur ces positions, ne les invente jamais ; si une information manque, dis-le et propose comment l’obtenir (par exemple analyser plus de parties).',
    'Le rapport est aussi découpé par cadence (par exemple blitz 5 min et 10 min) : sépare tes constats et tes conseils selon la cadence dès que c’est pertinent, car on ne joue pas pareil en 5 et en 10 minutes.',
    'Donne des conseils actionnables : exercices précis, méthode de réflexion (échecs, captures, menaces), plan d’entraînement sur une ou deux semaines si on te le demande, idées d’ouvertures concrètes.',
    'Format : réponses courtes (200 mots au plus, sauf demande explicite), pas de titres Markdown, listes courtes autorisées, coups en notation algébrique anglaise (Nf3, Bxe5, O-O).',
  ].join(' ');

  /** Prompt système d'une conversation (figé au début de la conversation) */
  function chatSystem(reportText) {
    return [
      { type: 'text', text: CHAT_SYSTEM },
      { type: 'text', text: reportText ? `<rapport_joueur>\n${reportText}\n</rapport_joueur>` : '<rapport_joueur>Aucune partie analysée pour l’instant.</rapport_joueur>' },
    ];
  }

  /** Contenu d'une réponse à renvoyer tel quel au tour suivant (règle du bloc « fallback ») */
  function echoContent(content) {
    const blocks = Array.isArray(content) ? content : [];
    const last = blocks.map((b) => b.type).lastIndexOf('fallback');
    if (last < 0) return blocks;
    return blocks.filter((b, idx) => idx >= last || b.type === 'text');
  }

  /**
   * Un tour de conversation, en streaming.
   * opts : { apiKey, model, system (blocs, figés), messages (format API, historique en ajout seul), onText }
   */
  async function chat(opts) {
    const Anthropic = await loadSDK();
    const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
    const haiku = opts.model.startsWith('claude-haiku');
    const betas = ['thinking-binding-controls-2026-08-01'];
    if (!haiku) betas.push('server-side-fallback-2026-07-01');
    const params = {
      model: opts.model,
      max_tokens: 16000,
      system: opts.system,
      messages: opts.messages,
      // Historique en ajout seul : si un bloc de réflexion ne correspond plus, on le laisse tomber au lieu d'échouer
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' }, // le rapport et l'historique sont mis en cache d'un tour à l'autre
      betas,
    };
    if (!haiku) params.fallbacks = 'default';
    const run = async (p) => {
      const s = client.beta.messages.stream(p);
      s.on('text', (d) => opts.onText(d));
      return s.finalMessage();
    };
    let final;
    try {
      final = await run(params);
    } catch (err) {
      // Compatibilité : si l'option de liaison des blocs de réflexion est refusée, on réessaie sans
      if (SDK && err instanceof SDK.BadRequestError && /block_binding|thinking-binding|beta/i.test(String(err.message))) {
        final = await run(Object.assign({}, params, { thinking: { type: 'adaptive' }, betas: betas.filter((b) => !b.startsWith('thinking-binding')) }));
      } else throw err;
    }
    if (final.stop_reason === 'refusal') {
      const e = new Error('refusal');
      e.refusal = true;
      throw e;
    }
    return final;
  }

  /** Vérifie la clé sans consommer de tokens (Models API) */
  async function testKey(apiKey, model) {
    const Anthropic = await loadSDK();
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 });
    return client.models.retrieve(model);
  }

  function errorText(err) {
    if (err && err.refusal) return 'Claude a décliné cette demande.';
    if (SDK) {
      if (err instanceof SDK.AuthenticationError) return 'Clé API invalide (401). Vérifie-la dans les réglages.';
      if (err instanceof SDK.PermissionDeniedError) return 'Cette clé n’a pas accès à ce modèle (403).';
      if (err instanceof SDK.NotFoundError) return 'Modèle introuvable (404). Choisis-en un autre dans les réglages.';
      if (err instanceof SDK.RateLimitError) return 'Trop de requêtes (429) : réessaie dans un instant.';
      if (err instanceof SDK.APIConnectionError) return 'Connexion impossible à l’API Anthropic.';
      if (err instanceof SDK.APIError) return `Erreur de l’API Anthropic (${err.status || '?'}) : ${err.message}`;
    }
    return 'Erreur : ' + (err && err.message ? err.message : String(err));
  }

  /** Texte à coller dans claude.ai (alternative sans clé API) */
  function exportPrompt(reportText) {
    return `${CHAT_SYSTEM}\n\nVoici mon rapport d’analyse :\n\n${reportText}\n\nCommence par me résumer en quelques lignes mes trois priorités de travail, puis propose-moi un plan d’entraînement pour les deux prochaines semaines.`;
  }

  root.CCClaude = { SYSTEM, CHAT_SYSTEM, loadSDK, ask, chat, chatSystem, echoContent, exportPrompt, testKey, errorText, movePrompt, gamePrompt };
})(window);
