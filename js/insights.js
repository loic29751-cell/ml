/* Clawd Coach — « Mes faiblesses » : faits extraits de chaque partie analysée,
 * agrégation sur une période, faiblesses principales et rapport texte pour Claude. */
(function (root) {
  'use strict';
  const CC = root.CC;
  const A = CC.Analysis;
  const I = (CC.Insights = {});
  const PH = ['opening', 'middlegame', 'endgame'];
  const PH_FR = { opening: 'Ouverture', middlegame: 'Milieu de partie', endgame: 'Finale' };
  I.PH = PH;
  I.PH_FR = PH_FR;

  I.MOTIFS = {
    hanging: 'Pièce laissée en prise',
    tactic: 'Tactique adverse non vue',
    'mate-allowed': 'Mat adverse non vu',
    'mate-missed': 'Mat raté',
    'missed-punish': 'Erreur adverse non punie',
    'missed-win': 'Gain de matériel raté',
    positional: 'Erreur positionnelle',
  };

  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const avg = (a) => (a.length ? sum(a) / a.length : null);
  const f1 = (x) => (x == null ? '—' : x.toFixed(1).replace('.', ','));
  const f0 = (x) => (x == null ? '—' : String(Math.round(x)));
  const pct = (x) => Math.round(x * 100) + ' %';
  const plural = (n, s, p) => (n > 1 ? p || s + 's' : s);

  /** Type d'une erreur (pour les statistiques) : { k, piece? } */
  I.motif = function (game, evals, review, i) {
    const m = review.moves[i];
    const mv = game.moves[i];
    const E0 = evals[i];
    const E1 = evals[i + 1];
    const mateAfter = CC.mateFor(E1.lines[0].score, m.color);
    if (mateAfter != null && mateAfter < 0) return { k: 'mate-allowed' };
    if (m.mateBest != null && m.mateBest > 0) return { k: 'mate-missed' };
    const reply = E1.lines[0].pv[0];
    const h = A.hanging(mv.fenAfter, m.color)[0];
    if (h && reply && reply.slice(2, 4) === h.square) return { k: 'hanging', piece: h.piece };
    if (A.materialSwing(mv.fenAfter, E1.lines[0].pv, m.color).delta <= -2) return { k: 'tactic' };
    if (m.cls === 'miss' || (i > 0 && review.moves[i - 1].loss >= 10)) return { k: 'missed-punish' };
    if (A.materialSwing(mv.fenBefore, E0.lines[0].pv, m.color).delta >= 2) return { k: 'missed-win' };
    return { k: 'positional' };
  };

  function tcRaw(game) {
    return String(game.timeControl || (game.headers && game.headers.TimeControl) || '');
  }
  function tcInfo(game) {
    const tc = tcRaw(game);
    if (!tc || tc === '-' || tc.includes('/')) return null;
    const [b, inc] = tc.split('+').map((x) => parseInt(x, 10));
    return isFinite(b) && b > 0 ? { base: b, inc: isFinite(inc) ? inc : 0 } : null;
  }

  /** Libellé d'une cadence chess.com : "300" -> "5 min", "300+5" -> "5 | 5", "1/86400" -> "Daily" */
  I.tcLabel = function (k) {
    if (!k || k === '-') return 'Autre';
    if (k.includes('/')) return 'Daily';
    const [b, inc] = k.split('+').map((x) => parseInt(x, 10));
    if (!isFinite(b)) return k;
    const min = b / 60;
    const m = Number.isInteger(min) ? String(min) : min.toFixed(1).replace('.', ',');
    if (inc) return `${m} | ${inc}`;
    return b < 60 ? `${b} s` : `${m} min`;
  };

  /** Résumé compact d'une partie analysée, du point de vue du joueur `color` */
  I.facts = function (game, review, evals, color, preset) {
    const opp = color === 'w' ? 'b' : 'w';
    const me = color === 'w' ? game.white : game.black;
    const them = color === 'w' ? game.black : game.white;
    const tc = tcInfo(game);
    const hasClock = !!tc && game.moves.some((x) => x.clock != null);
    const lowLimit = hasClock ? Math.max(15, tc.base * 0.1) : null;
    let clock = hasClock ? tc.base : null;
    const errors = [];
    let lowN = 0;
    let lowAcc = 0;
    let normN = 0;
    let normAcc = 0;
    let lowErr = 0;
    let err = 0;
    let maxWp = null;
    let minWp = null;
    let mine = 0;
    for (const m of review.moves) {
      if (m.color !== color) continue;
      mine++;
      const mv = game.moves[m.i];
      const before = clock;
      if (hasClock && mv.clock != null) clock = mv.clock;
      if (!m.inBook) {
        maxWp = maxWp == null ? m.wpBest : Math.max(maxWp, m.wpBest);
        minWp = minWp == null ? m.wpBest : Math.min(minWp, m.wpBest);
      }
      const low = lowLimit != null && before != null && before < lowLimit;
      if (low) {
        lowN++;
        lowAcc += m.acc;
      } else {
        normN++;
        normAcc += m.acc;
      }
      if (m.cls === 'mistake' || m.cls === 'blunder' || m.cls === 'miss') {
        err++;
        if (low) lowErr++;
        const mo = I.motif(game, evals, review, m.i);
        errors.push({
          i: m.i,
          cls: m.cls,
          loss: Math.round(m.loss * 10) / 10,
          phase: m.phase,
          low,
          clock: before != null ? Math.round(before) : null,
          motif: mo.k,
          piece: mo.piece || null,
          san: mv.san,
          best: A.sanOf(mv.fenBefore, m.bestUci),
          fen: mv.fenBefore,
          label: CC.moveLabel(mv.fenBefore, mv.color),
          evBefore: CC.fmtEval(m.scoreBefore),
          evAfter: CC.fmtEval(m.scoreAfter),
        });
      }
    }
    const ph = {};
    for (const p of PH) {
      const x = review.phases[p][color];
      ph[p] = x ? { acc: Math.round(x.acc * 10) / 10, n: x.n } : null;
    }
    return {
      v: 1,
      key: game.key,
      id: game.id,
      src: game.source,
      url: game.url || null,
      t: game.endTime || null,
      tc: game.timeClass || null,
      tcKey: tcRaw(game) || null,
      color,
      result: me.result ? CC.ChessCom.resultCode(me.result) : null,
      me: me.name,
      opp: them.name,
      myElo: me.rating || null,
      oppElo: them.rating || null,
      opening: review.opening ? { eco: review.opening.eco, name: review.opening.name } : null,
      n: mine,
      acc: review.accuracy[color],
      accOpp: review.accuracy[opp],
      counts: review.counts[color],
      phases: ph,
      maxWp: maxWp == null ? 50 : maxWp,
      minWp: minWp == null ? 50 : minWp,
      time: hasClock ? { base: tc.base, lowN, lowAcc: lowN ? lowAcc / lowN : null, normAcc: normN ? normAcc / normN : null, lowErr, err } : null,
      errors,
      preset: preset || null,
      pgn: game.pgn || null,
      at: Date.now(),
    };
  };

  /* ---------------- Stockage local ---------------- */
  function makeRoom() {
    const keys = CC.store.keys('cc.an.').filter((k) => k !== 'cc.an.index');
    const items = keys.map((k) => [k, (CC.store.get(k, {}) || {}).t || 0]).sort((a, b) => a[1] - b[1]);
    for (const [k] of items.slice(0, Math.max(5, Math.ceil(items.length / 3)))) CC.store.del(k);
  }
  I.save = (f) => {
    if (!CC.store.set('cc.facts.' + f.key, f)) {
      makeRoom();
      CC.store.set('cc.facts.' + f.key, f);
    }
  };
  I.get = (key) => CC.store.get('cc.facts.' + key, null);
  I.all = () =>
    CC.store
      .keys('cc.facts.')
      .map((k) => CC.store.get(k, null))
      .filter((f) => f && f.v === 1);
  I.clear = () => CC.store.keys('cc.facts.').forEach((k) => CC.store.del(k));

  /* ---------------- Agrégation ---------------- */
  function colorStats(list) {
    const n = list.length;
    if (!n) return { n: 0, score: null, acc: null };
    const pts = sum(list.map((f) => (f.result === 'win' ? 1 : f.result === 'draw' ? 0.5 : 0)));
    return { n, score: (pts / n) * 100, acc: avg(list.filter((f) => f.acc != null).map((f) => f.acc)) };
  }

  /** Rapport sur une liste de parties (faits) */
  I.report = function (list) {
    const n = list.length;
    if (!n) return null;
    const res = { win: 0, draw: 0, loss: 0 };
    list.forEach((f) => {
      if (f.result) res[f.result]++;
    });
    const per = (k) => sum(list.map((f) => (f.counts && f.counts[k]) || 0)) / n;
    const phase = {};
    for (const p of PH) {
      let s = 0;
      let c = 0;
      for (const f of list) {
        const x = f.phases && f.phases[p];
        if (x) {
          s += x.acc * x.n;
          c += x.n;
        }
      }
      phase[p] = c ? { acc: s / c, n: c } : null;
    }
    const errorList = [];
    for (const f of list) {
      for (const e of f.errors || []) {
        errorList.push(Object.assign({ gameKey: f.key, opp: f.opp, t: f.t, color: f.color, tc: f.tc, tcKey: f.tcKey, result: f.result, opening: f.opening }, e));
      }
    }
    const motifCount = {};
    const hung = {};
    for (const e of errorList) {
      motifCount[e.motif] = (motifCount[e.motif] || 0) + 1;
      if (e.motif === 'hanging' && e.piece) hung[e.piece] = (hung[e.piece] || 0) + 1;
    }
    const motifs = Object.keys(motifCount)
      .map((k) => ({ key: k, label: I.MOTIFS[k] || k, n: motifCount[k], share: motifCount[k] / errorList.length }))
      .sort((a, b) => b.n - a.n);
    const topHung = Object.keys(hung).sort((a, b) => hung[b] - hung[a])[0] || null;
    const phaseErr = {};
    for (const p of PH) phaseErr[p] = errorList.filter((e) => e.phase === p).length;

    const timed = list.filter((f) => f.time);
    let time = null;
    if (timed.length) {
      const lowN = sum(timed.map((f) => f.time.lowN));
      const lowErr = sum(timed.map((f) => f.time.lowErr));
      const err = sum(timed.map((f) => f.time.err));
      const wAvg = (key, nKey) => {
        let s = 0;
        let c = 0;
        for (const f of timed) {
          const v = f.time[key];
          const k = nKey === 'low' ? f.time.lowN : f.n - f.time.lowN;
          if (v != null && k) {
            s += v * k;
            c += k;
          }
        }
        return c ? s / c : null;
      };
      time = {
        games: timed.length,
        gamesLow: timed.filter((f) => f.time.lowN > 0).length,
        lowN,
        lowErr,
        err,
        lowShare: err ? lowErr / err : 0,
        accLow: wAvg('lowAcc', 'low'),
        accNorm: wAvg('normAcc', 'norm'),
      };
    }

    const winning = list.filter((f) => f.maxWp >= 80);
    const thrown = winning.filter((f) => f.result !== 'win');
    const comebacks = list.filter((f) => f.minWp <= 20 && f.result === 'win');

    const fam = new Map();
    for (const f of list) {
      const name = f.opening ? f.opening.name.split(':')[0].trim() : 'Hors théorie';
      const k = f.color + '|' + name;
      if (!fam.has(k)) fam.set(k, { name, color: f.color, games: [] });
      fam.get(k).games.push(f);
    }
    const openings = Array.from(fam.values())
      .map((o) => Object.assign({ name: o.name, color: o.color }, colorStats(o.games)))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

    const trend = list
      .filter((f) => f.acc != null)
      .sort((a, b) => (a.t || 0) - (b.t || 0))
      .map((f) => ({ key: f.key, t: f.t, acc: f.acc, result: f.result, opp: f.opp, color: f.color, tc: f.tc }));

    const r = {
      n,
      res,
      score: ((res.win + res.draw / 2) / n) * 100,
      accAvg: avg(list.filter((f) => f.acc != null).map((f) => f.acc)),
      blundersPG: per('blunder'),
      mistakesPG: per('mistake'),
      missesPG: per('miss'),
      // « Occasions manquées » au sens large (même définition partout) : erreur adverse non punie, gain raté, mat raté
      missedPG: errorList.filter((e) => e.motif === 'missed-punish' || e.motif === 'missed-win' || e.motif === 'mate-missed').length / n,
      inaccPG: per('inaccuracy'),
      brilliant: sum(list.map((f) => (f.counts && f.counts.brilliant) || 0)),
      great: sum(list.map((f) => (f.counts && f.counts.great) || 0)),
      phase,
      phaseErr,
      errorsTotal: errorList.length,
      errorList,
      motifs,
      topHung,
      time,
      conversion: { winning: winning.length, thrown, comebacks },
      byColor: { w: colorStats(list.filter((f) => f.color === 'w')), b: colorStats(list.filter((f) => f.color === 'b')) },
      openings,
      worst: errorList.slice().sort((a, b) => b.loss - a.loss).slice(0, 10),
      trend,
    };
    r.weaknesses = weaknesses(r);
    r.strengths = strengths(r);
    return r;
  };

  function weaknesses(r) {
    const out = [];
    const nErr = r.errorsTotal;
    const mn = (k) => (r.motifs.find((m) => m.key === k) || { n: 0 }).n;
    const ex = (pred) => r.errorList.filter(pred).sort((a, b) => b.loss - a.loss).slice(0, 5);

    if (r.time && r.time.err >= 4 && r.time.lowShare >= 0.3) {
      out.push({
        key: 'time',
        score: r.time.lowShare * 100 + 10,
        title: 'La gestion du temps',
        stat: pct(r.time.lowShare),
        statSub: 'de tes erreurs arrivent avec moins de 10 % de ton temps',
        text:
          r.time.accLow != null && r.time.accNorm != null
            ? `Quand la pendule descend, ta précision tombe à ${f1(r.time.accLow)} % (contre ${f1(r.time.accNorm)} % le reste du temps).`
            : 'Tes erreurs se concentrent quand il te reste peu de temps.',
        advice: 'Joue plus vite les coups simples (ouverture connue, reprises évidentes) pour garder une réserve pour le milieu de partie. En blitz, vise au moins 30 secondes en finale.',
        examples: ex((e) => e.low),
      });
    }
    const hang = mn('hanging');
    if (nErr >= 4 && hang >= 3 && hang / nErr >= 0.2) {
      out.push({
        key: 'hanging',
        score: (hang / nErr) * 100 + 8,
        title: 'Les pièces laissées en prise',
        stat: String(hang),
        statSub: `${plural(hang, 'pièce laissée', 'pièces laissées')} sans défense sur ${r.n} parties`,
        text: `${pct(hang / nErr)} de tes erreurs viennent d’une pièce attaquée et pas assez défendue.${r.topHung ? ` Celle que tu perds le plus souvent : ${CC.ton(r.topHung)}.` : ''}`,
        advice: 'Avant de valider ton coup, fais le « blunder check » : quelles pièces sont attaquées ? Lesquelles ne sont défendues par personne ? Mon coup en laisse-t-il une sans protection ?',
        examples: ex((e) => e.motif === 'hanging'),
      });
    }
    const tac = mn('tactic') + mn('mate-allowed');
    if (nErr >= 4 && tac >= 3 && tac / nErr >= 0.2) {
      out.push({
        key: 'tactics',
        score: (tac / nErr) * 100 + 5,
        title: 'Les coups tactiques de l’adversaire',
        stat: String(tac),
        statSub: `${plural(tac, 'combinaison adverse', 'combinaisons adverses')} non ${plural(tac, 'vue', 'vues')}`,
        text: 'Ton adversaire gagne du matériel, ou mate, grâce à une combinaison : fourchette, clouage, attaque double, échec à la découverte…',
        advice: 'Après chaque coup adverse, passe en revue ses échecs, captures et menaces (méthode ECM) avant de penser à ton propre plan. Dix minutes de problèmes tactiques par jour font une vraie différence.',
        examples: ex((e) => e.motif === 'tactic' || e.motif === 'mate-allowed'),
      });
    }
    const miss = mn('missed-punish') + mn('missed-win') + mn('mate-missed');
    const missPG = miss / r.n;
    if (miss >= 3 && missPG >= 0.4) {
      const mates = mn('mate-missed');
      out.push({
        key: 'missed',
        score: Math.min(100, missPG * 70) + 4,
        title: 'Les occasions manquées',
        stat: f1(missPG),
        statSub: 'occasion manquée par partie en moyenne',
        text: `Ton adversaire se trompe, mais tu ne le punis pas toujours${mates ? ` (dont ${mates} ${plural(mates, 'mat raté', 'mats ratés')})` : ''}.`,
        advice: 'Quand ton adversaire joue un coup inattendu, demande-toi d’abord : « Qu’est-ce qu’il laisse sans défense ? Ai-je un échec, une capture ou une menace forte ? »',
        examples: ex((e) => ['missed-punish', 'missed-win', 'mate-missed'].includes(e.motif)),
      });
    }
    const pe = r.phase.endgame;
    const pm = r.phase.middlegame;
    const po = r.phase.opening;
    if (pe && pm && pe.n >= 20 && pe.acc < pm.acc - 5) {
      out.push({
        key: 'endgame',
        score: (pm.acc - pe.acc) * 3,
        title: 'Les finales',
        stat: f1(pe.acc) + ' %',
        statSub: `de précision en finale, contre ${f1(pm.acc)} % en milieu de partie`,
        text: `${r.phaseErr.endgame} de tes erreurs graves arrivent en finale.`,
        advice: 'Révise les finales de base : roi actif, pion passé, opposition, finales de tours (positions de Lucena et de Philidor). En finale, le roi devient une pièce d’attaque.',
        examples: ex((e) => e.phase === 'endgame'),
      });
    }
    const badOpen = r.openings.filter((o) => o.n >= 3 && o.score <= 35 && o.name !== 'Hors théorie').sort((a, b) => a.score - b.score)[0];
    if (badOpen) {
      out.push({
        key: 'opening',
        score: 50 - badOpen.score + badOpen.n * 2,
        title: `${badOpen.name} avec les ${badOpen.color === 'w' ? 'Blancs' : 'Noirs'}`,
        stat: f0(badOpen.score) + ' %',
        statSub: `des points sur ${badOpen.n} parties`,
        text: `Cette ouverture te réussit mal ce mois-ci (précision moyenne ${f1(badOpen.acc)} %).`,
        advice: 'Revois les idées principales de cette ouverture (plans, structures de pions, cases clés) plutôt que de longues variantes, ou choisis une ligne plus simple à jouer.',
        examples: ex((e) => e.color === badOpen.color && e.opening && e.opening.name.split(':')[0].trim() === badOpen.name),
      });
    } else if (po && pm && po.n >= 20 && po.acc < pm.acc - 6) {
      out.push({
        key: 'opening',
        score: (pm.acc - po.acc) * 2.5,
        title: 'Tes débuts de partie',
        stat: f1(po.acc) + ' %',
        statSub: `de précision en ouverture, contre ${f1(pm.acc)} % ensuite`,
        text: 'Tu perds souvent du terrain dès les premiers coups.',
        advice: 'Fixe-toi un petit répertoire (une ouverture avec les Blancs, une défense contre 1.e4 et une contre 1.d4) et apprends-en les idées : développement, roque, contrôle du centre.',
        examples: ex((e) => e.phase === 'opening'),
      });
    }
    const thrown = r.conversion.thrown.length;
    if (thrown >= 2 && thrown / Math.max(1, r.conversion.winning) >= 0.3) {
      const keys = new Set(r.conversion.thrown.map((f) => f.key));
      out.push({
        key: 'conversion',
        score: (thrown / r.conversion.winning) * 60 + thrown * 3,
        title: 'Convertir un avantage',
        stat: `${thrown}/${r.conversion.winning}`,
        statSub: 'positions gagnantes qui ne se sont pas terminées en victoire',
        text: 'Tu obtiens de bonnes positions, mais ton adversaire revient dans la partie.',
        advice: 'Quand tu es nettement mieux : échange les pièces (pas les pions), coupe le contre-jeu adverse et vérifie ses menaces à chaque coup avant d’attaquer.',
        examples: ex((e) => keys.has(e.gameKey)),
      });
    }
    const W = r.byColor.w;
    const B = r.byColor.b;
    if (W.n >= 4 && B.n >= 4 && Math.abs(W.score - B.score) >= 25) {
      const weak = W.score < B.score ? 'w' : 'b';
      out.push({
        key: 'color',
        score: Math.abs(W.score - B.score),
        title: weak === 'w' ? 'Avec les Blancs' : 'Avec les Noirs',
        stat: f0((weak === 'w' ? W : B).score) + ' %',
        statSub: `des points avec les ${weak === 'w' ? 'Blancs' : 'Noirs'}, contre ${f0((weak === 'w' ? B : W).score)} % avec les ${weak === 'w' ? 'Noirs' : 'Blancs'}`,
        text: 'Tes résultats dépendent beaucoup de ta couleur.',
        advice: weak === 'w' ? 'Avec les Blancs, cherche des positions où tu prends l’initiative : choisis une ouverture active que tu comprends.' : 'Avec les Noirs, vise d’abord une position solide : une défense que tu maîtrises vaut mieux qu’une ligne à la mode.',
        examples: ex((e) => e.color === weak),
      });
    }
    if (!out.length && r.blundersPG >= 0.5) {
      out.push({
        key: 'blunders',
        score: r.blundersPG * 40,
        title: 'Les gaffes',
        stat: f1(r.blundersPG),
        statSub: 'gaffe par partie en moyenne',
        text: 'Une gaffe par partie suffit souvent à perdre, même après un bon début.',
        advice: 'Ralentis sur les coups critiques (captures, échecs, positions tendues) et fais un dernier contrôle avant de lâcher la pièce.',
        examples: ex((e) => e.cls === 'blunder'),
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 3);
  }

  function strengths(r) {
    const out = [];
    const phases = PH.filter((p) => r.phase[p] && r.phase[p].n >= 15).sort((a, b) => r.phase[b].acc - r.phase[a].acc);
    if (phases.length >= 2) out.push(`ta meilleure phase est ${{ opening: 'l’ouverture', middlegame: 'le milieu de partie', endgame: 'la finale' }[phases[0]]} (${f1(r.phase[phases[0]].acc)} %)`);
    const good = r.openings.filter((o) => o.n >= 3 && o.score >= 60 && o.name !== 'Hors théorie').sort((a, b) => b.score - a.score)[0];
    if (good) out.push(`${good.name} te réussit bien avec les ${good.color === 'w' ? 'Blancs' : 'Noirs'} (${f0(good.score)} % des points)`);
    if (r.conversion.comebacks.length >= 2) out.push(`tu as renversé ${r.conversion.comebacks.length} parties mal embarquées`);
    if (r.brilliant) out.push(`${r.brilliant} ${plural(r.brilliant, 'coup brillant', 'coups brillants')}`);
    return out;
  }

  /** Regroupe des faits par cadence exacte (5 min, 10 min, 3 | 2…), les plus jouées d'abord */
  I.byTc = function (list) {
    const m = new Map();
    for (const f of list) {
      const k = f.tcKey || 'autre';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(f);
    }
    return Array.from(m.entries())
      .map(([key, facts]) => ({ key, label: I.tcLabel(key), facts }))
      .sort((a, b) => b.facts.length - a.facts.length);
  };

  /** Résumé compact d'un rapport (une section par cadence dans le contexte du chat) */
  I.summaryText = function (r, label) {
    const L = [`=== Cadence ${label} : ${r.n} parties (${r.res.win} V, ${r.res.draw} N, ${r.res.loss} D ; score ${f0(r.score)} %) ===`];
    L.push(`Précision ${f1(r.accAvg)} % ; par partie : ${f1(r.blundersPG)} gaffes, ${f1(r.mistakesPG)} erreurs, ${f1(r.missedPG)} occasions manquées.`);
    L.push('Par phase : ' + PH.map((p) => `${PH_FR[p].toLowerCase()} ${r.phase[p] ? f1(r.phase[p].acc) + ' %' : 'n/a'}`).join(', ') + '.');
    if (r.motifs.length) L.push('Erreurs graves : ' + r.motifs.map((m) => `${m.label.toLowerCase()} ${m.n}`).join(', ') + '.');
    if (r.time) L.push(`Zeitnot : ${pct(r.time.lowShare)} des erreurs graves ; précision ${f1(r.time.accLow)} % en zeitnot contre ${f1(r.time.accNorm)} %.`);
    if (r.weaknesses.length) L.push('Faiblesses : ' + r.weaknesses.map((w) => `${w.title} (${w.stat} ${w.statSub})`).join(' ; ') + '.');
    if (r.strengths.length) L.push('Points forts : ' + r.strengths.join(' ; ') + '.');
    return L.join('\n');
  };

  /** Rapport en texte (contexte du chat Claude / export vers claude.ai) */
  I.reportText = function (r, meta) {
    const L = [];
    const color = (c) => (c === 'w' ? 'Blancs' : 'Noirs');
    L.push(`Joueur : ${meta.name}${meta.ratings ? ` (${meta.ratings})` : ''}. Période : ${meta.period}${meta.cadence ? `, cadence : ${meta.cadence}` : ''}.`);
    L.push(`Parties analysées par Stockfish : ${r.n} (${r.res.win} victoires, ${r.res.draw} nulles, ${r.res.loss} défaites ; score ${f0(r.score)} %).`);
    L.push(`Précision moyenne : ${f1(r.accAvg)} %. Avec les Blancs : ${f1(r.byColor.w.acc)} % (${r.byColor.w.n} parties, score ${f0(r.byColor.w.score)} %). Avec les Noirs : ${f1(r.byColor.b.acc)} % (${r.byColor.b.n} parties, score ${f0(r.byColor.b.score)} %).`);
    L.push(`Par partie : ${f1(r.blundersPG)} gaffes, ${f1(r.mistakesPG)} erreurs, ${f1(r.missedPG)} occasions manquées (erreur adverse non punie, gain ou mat raté), ${f1(r.inaccPG)} imprécisions. Coups brillants : ${r.brilliant}, très bons coups : ${r.great}.`);
    L.push(
      'Précision par phase : ' +
        PH.map((p) => `${PH_FR[p].toLowerCase()} ${r.phase[p] ? f1(r.phase[p].acc) + ' %' : 'n/a'} (${r.phaseErr[p]} erreurs graves)`).join(', ') +
        '.'
    );
    if (r.motifs.length) L.push('Origine des erreurs graves : ' + r.motifs.map((m) => `${m.label.toLowerCase()} ${m.n}`).join(', ') + '.');
    if (r.time) {
      L.push(
        `Temps : ${pct(r.time.lowShare)} des erreurs graves commises avec moins de 10 % du temps ; précision en zeitnot ${f1(r.time.accLow)} % contre ${f1(r.time.accNorm)} % sinon ; ${r.time.gamesLow} parties sur ${r.time.games} avec un passage en zeitnot.`
      );
    }
    L.push(`Conversion : ${r.conversion.winning} parties avec une position gagnante, dont ${r.conversion.thrown.length} non gagnées. Remontées gagnées : ${r.conversion.comebacks.length}.`);
    if (r.openings.length) {
      L.push('Ouvertures (couleur, parties, score, précision) :');
      for (const o of r.openings.slice(0, 10)) L.push(`- ${o.name} (${color(o.color)}) : ${o.n} parties, ${f0(o.score)} %, précision ${f1(o.acc)} %`);
    }
    if (r.weaknesses.length) {
      L.push('Faiblesses détectées automatiquement :');
      for (const w of r.weaknesses) L.push(`- ${w.title} : ${w.stat} ${w.statSub}. ${w.text}`);
    }
    if (r.strengths.length) L.push('Points forts : ' + r.strengths.join(' ; ') + '.');
    if (r.worst.length) {
      L.push('Pires erreurs (coup joué -> meilleur coup Stockfish, position FEN avant le coup) :');
      for (const e of r.worst) {
        L.push(
          `- [${I.tcLabel(e.tcKey)}] ${e.label} ${e.san} -> ${e.best || '?'} (${CC.CLS[e.cls].label}, perte ${f1(e.loss)} pts, ${I.MOTIFS[e.motif] || e.motif}, ${PH_FR[e.phase] || e.phase}${e.low ? ', en zeitnot' : ''}) contre ${e.opp}, ${color(e.color)} ; éval ${e.evBefore} -> ${e.evAfter} ; FEN ${e.fen}`
        );
      }
    }
    return L.join('\n');
  };
})(window);
