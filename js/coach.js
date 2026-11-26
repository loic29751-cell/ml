/* Claude Coach — les commentaires du coach (français, tutoiement).
 * Tout est déduit des données Stockfish + quelques détecteurs de motifs (pièce en prise, fourchette, mat…). */
(function (root) {
  'use strict';
  const CC = root.CC;
  const A = CC.Analysis;
  const Coach = (CC.Coach = {});

  const QUIPS = {
    blunderMe: [
      'Ctrl+Z n’existe pas aux échecs… 😅',
      'Même les meilleurs devs poussent des bugs en prod.',
      'On dira que c’était un test.',
      'Respire. On débugge ça ensemble.',
    ],
    mistakeMe: ['Rien d’irréparable : on refactore.', 'Petit bug, gros apprentissage.'],
    brilliantMe: ['Je n’aurais pas mieux compilé ça. ✻', 'Ça mérite un commit en majuscules.', 'Stockfish applaudit.'],
    greatMe: ['Bien vu !', 'Tu as trouvé la faille.'],
    blunderThem: ['Cadeau ! 🎁', 'Ton adversaire t’ouvre la porte.'],
    mateMe: ['Build réussi ✅', 'GG !'],
  };

  const san = (s) => `<b class="san">${CC.sanHTML(s)}</b>`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const list = (items) => (items.length <= 1 ? items.join('') : items.slice(0, -1).join(', ') + ' et ' + items[items.length - 1]);
  const fmtPct = (a) => a.toFixed(1).replace('.', ',') + ' %';
  Coach.fmtPct = fmtPct;

  function lostPhrase(swing, me) {
    const d = -swing.delta;
    const top = swing.lost.slice().sort((a, b) => CC.VAL[b] - CC.VAL[a])[0];
    if (top && CC.VAL[top] >= 3 && CC.VAL[top] >= d - 1) return me ? CC.ton(top) : CC.son(top);
    if (d >= 2) return `${d} points de matériel`;
    return 'un pion';
  }
  function gainPhrase(swing) {
    const d = swing.delta;
    const top = swing.won.slice().sort((a, b) => CC.VAL[b] - CC.VAL[a])[0];
    if (top && CC.VAL[top] >= 3 && CC.VAL[top] >= d - 1) return CC.un(top);
    if (d >= 2) return `${d} points de matériel`;
    return 'un pion';
  }

  const MOODS_ME = {
    brilliant: ['star', 'jump'],
    great: ['happy', 'jump'],
    best: ['happy', 'bob'],
    excellent: ['happy', 'bob'],
    good: ['idle', 'bob'],
    book: ['idle', 'bob'],
    forced: ['idle', 'bob'],
    inaccuracy: ['meh', null],
    mistake: ['worried', null],
    miss: ['meh', 'shake'],
    blunder: ['shocked', 'shake'],
  };
  const MOODS_THEM = {
    brilliant: ['shocked', null],
    great: ['worried', null],
    best: ['idle', 'bob'],
    excellent: ['idle', 'bob'],
    good: ['idle', 'bob'],
    book: ['idle', 'bob'],
    forced: ['idle', 'bob'],
    inaccuracy: ['wink', 'bob'],
    mistake: ['happy', 'bob'],
    miss: ['happy', 'bob'],
    blunder: ['star', 'jump'],
  };

  /** Commentaire d'un coup : { title, html, mood, anim } */
  Coach.move = function (ctx) {
    const { game, evals, review, i, userColor } = ctx;
    const m = review.moves[i];
    const mv = game.moves[i];
    const me = m.color === userColor;
    const meta = CC.CLS[m.cls];
    const E0 = evals[i];
    const E1 = evals[i + 1];
    const seed = i * 7 + 3;
    const bestSan = A.sanOf(mv.fenBefore, m.bestUci);
    const replyLine = E1.terminal ? [] : A.pvToSan(mv.fenAfter, E1.lines[0].pv, 6);
    const mateAfter = CC.mateFor(E1.lines[0].score, m.color);
    const s = [];
    let bestMentioned = false;
    let [mood, anim] = (me ? MOODS_ME : MOODS_THEM)[m.cls] || ['idle', 'bob'];

    const title = `${san(mv.san)} <span class="cls-txt" style="color:${meta.ink}">${meta.phrase}</span>`;

    if (mv.san.includes('#')) {
      s.push(me ? 'Échec et mat ! ' + CC.pick(QUIPS.mateMe, seed) : 'Échec et mat… ton adversaire conclut la partie.');
      mood = me ? 'cool' : 'sad';
      anim = me ? 'jump' : null;
    } else if (m.cls === 'book') {
      const o = review.opening;
      s.push(o ? `On est encore dans la théorie : <i>${CC.esc(o.name)}</i>.` : 'On est encore dans la théorie.');
    } else if (m.cls === 'forced') {
      s.push('Seul coup légal : pas le choix !');
    } else if (!CC.SEVERE[m.cls]) {
      /* ---------- bons coups ---------- */
      let mateSaid = false;
      if (m.cls === 'brilliant' && m.sacrifice) {
        const piece = me ? CC.ton(m.sacrifice.piece) : CC.son(m.sacrifice.piece);
        const who = me ? 'Tu sacrifies' : 'Ton adversaire sacrifie';
        if (mateAfter != null && mateAfter > 0) {
          s.push(`${who} ${piece} en ${m.sacrifice.square} pour forcer ${mateAfter === 1 ? 'le mat au coup suivant' : `un mat en ${mateAfter}`} !`);
          mateSaid = true;
        } else s.push(`${who} ${piece} en ${m.sacrifice.square}, et c’est la bonne idée : le prendre serait une erreur.`);
      } else if (m.cls === 'great') {
        const keep = m.wpAfter >= 65 ? 'garder l’avantage' : m.wpAfter >= 35 ? 'maintenir l’équilibre' : 'rester dans la partie';
        s.push(`C’était le seul coup pour ${keep}.`);
        if (i > 0 && review.moves[i - 1].loss >= 10) {
          s.push(me ? 'L’erreur adverse est punie immédiatement.' : 'Ton adversaire punit ton erreur immédiatement.');
        }
      }
      let motif = null;
      const fork = A.forkInfo(mv.fenAfter, mv.to);
      if (mateSaid) {
        motif = null;
      } else if (mateAfter != null && mateAfter > 0 && mateAfter <= 6) {
        motif = me ? `Tu tiens un mat en ${mateAfter} !` : `Attention : ton adversaire menace un mat en ${mateAfter}.`;
      } else if (fork) {
        motif = me
          ? `Fourchette ! ${cap(CC.ton(fork.piece))} attaque ${list(fork.targets.map(CC.le))}.`
          : `Fourchette : ${CC.son(fork.piece)} attaque ${list(fork.targets.map(CC.ton))}.`;
      } else if (mv.captured) {
        motif = me ? `Tu prends ${CC.un(mv.captured)}.` : `Ton adversaire prend ${CC.ton(mv.captured)}.`;
      } else if (mv.flags.includes('k') || mv.flags.includes('q')) {
        motif = me ? 'Tu mets ton roi à l’abri.' : 'Ton adversaire met son roi à l’abri.';
      } else if (mv.promotion) {
        motif = me ? 'Promotion !' : 'Ton adversaire obtient une nouvelle pièce.';
      } else if (m.phase === 'opening' && (mv.piece === 'n' || mv.piece === 'b') && (mv.from[1] === '1' || mv.from[1] === '8')) {
        motif = me ? 'Tu développes une pièce : bon réflexe en ouverture.' : 'Ton adversaire développe ses pièces.';
      } else if (mv.piece === 'p' && i < 14 && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5'].includes(mv.to)) {
        motif = me ? 'Tu prends de l’espace au centre.' : 'Ton adversaire occupe le centre.';
      }
      if (motif) s.push(motif);
      if (!s.length) {
        if (m.cls === 'best') {
          s.push(me ? CC.pick(['C’est exactement le coup du moteur.', 'Coup parfait, rien à redire.', 'Pile le coup de Stockfish.'], seed) : 'Ton adversaire joue le coup du moteur.');
        } else if (m.cls === 'excellent') s.push('Presque aussi fort que le meilleur coup.');
        else if (m.cls === 'good') s.push('Coup correct.');
      }
      if ((m.cls === 'excellent' || m.cls === 'good') && bestSan && !m.isBest) {
        s.push(`Le meilleur était ${san(bestSan)}.`);
        bestMentioned = true;
      }
      if (me && m.cls === 'brilliant') s.push(CC.pick(QUIPS.brilliantMe, seed));
      else if (me && m.cls === 'great' && seed % 2) s.push(CC.pick(QUIPS.greatMe, seed));
    } else {
      /* ---------- imprécisions, erreurs, gaffes, occasions manquées ---------- */
      const replyUci = E1.lines[0].pv[0];
      if (mateAfter != null && mateAfter < 0) {
        s.push(
          me
            ? `Ça permet un mat en ${-mateAfter}${replyLine[0] ? ` qui commence par ${san(replyLine[0])}` : ''}.`
            : `Ton adversaire te laisse un mat en ${-mateAfter}${replyLine[0] ? ` : trouve ${san(replyLine[0])} !` : ' !'}`
        );
      } else if (m.cls === 'miss' && m.mateBest != null && m.mateBest > 0) {
        s.push(
          me
            ? `Tu avais un mat en ${m.mateBest} avec ${san(bestSan)} !`
            : `Ton adversaire avait un mat en ${m.mateBest} avec ${san(bestSan)}… ouf !`
        );
        bestMentioned = true;
      } else {
        const h = A.hanging(mv.fenAfter, m.color)[0];
        const loss = A.materialSwing(mv.fenAfter, E1.lines[0].pv, m.color);
        const gain = A.materialSwing(mv.fenBefore, E0.lines[0].pv, m.color);
        if (h && replyUci && replyUci.slice(2, 4) === h.square) {
          s.push(
            me
              ? `Tu laisses ${CC.ton(h.piece)} en prise en ${h.square}.`
              : `Ton adversaire laisse ${CC.son(h.piece)} en prise en ${h.square} : à toi de jouer !`
          );
        } else if (loss.delta <= -2 && replyLine[0]) {
          s.push(
            me
              ? `Après ${san(replyLine[0])}, tu perds ${lostPhrase(loss, true)}.`
              : `Après ${san(replyLine[0])}, ton adversaire perd ${lostPhrase(loss, false)}.`
          );
        } else if (gain.delta >= 2 && bestSan) {
          s.push(me ? `${san(bestSan)} gagnait ${gainPhrase(gain)}.` : `Ton adversaire pouvait gagner ${gainPhrase(gain)} avec ${san(bestSan)}.`);
          bestMentioned = true;
        } else if (m.cls === 'miss' && bestSan) {
          s.push(
            me
              ? `Ton adversaire venait de se tromper : ${san(bestSan)} en profitait.`
              : `Ton adversaire ne profite pas de ton erreur : ${san(bestSan)} était bien plus fort.`
          );
          bestMentioned = true;
        } else if (m.phase === 'opening' && mv.piece === 'q' && !mv.captured) {
          s.push(me ? 'Sortir la dame si tôt l’expose aux attaques adverses.' : 'Ton adversaire sort sa dame tôt : vise-la avec tes pièces !');
        } else if (m.phase === 'opening' && mv.piece === 'k' && !(mv.flags.includes('k') || mv.flags.includes('q'))) {
          s.push(me ? 'Ton roi perd le droit de roquer.' : 'Ton adversaire perd le droit de roquer.');
        } else {
          const ev = `(${CC.fmtEval(m.scoreBefore)} → ${CC.fmtEval(m.scoreAfter)})`;
          s.push(me ? `Ta position se dégrade ${ev}.` : `Ton adversaire relâche la pression ${ev}.`);
        }
      }
      if (!bestMentioned && bestSan) s.push(`Le meilleur coup était ${san(bestSan)}.`);
      if (me && m.cls === 'blunder' && seed % 2) s.push(CC.pick(QUIPS.blunderMe, seed));
      else if (me && m.cls === 'mistake' && seed % 3 === 0) s.push(CC.pick(QUIPS.mistakeMe, seed));
      else if (!me && m.cls === 'blunder' && seed % 2) s.push(CC.pick(QUIPS.blunderThem, seed));
    }

    return { title, html: s.join(' '), mood, anim };
  };

  function label(game, m) {
    return `${CC.moveLabel(game.moves[m.i].fenBefore, m.color)} ${san(m.san)}`;
  }
  Coach.label = label;

  /** Bulle de synthèse en fin d'analyse */
  Coach.summary = function (ctx) {
    const { game, review, userColor } = ctx;
    const opp = userColor === 'w' ? 'b' : 'w';
    const me = userColor === 'w' ? game.white : game.black;
    const code = me.result ? CC.ChessCom.resultCode(me.result) : null;
    const accMe = review.accuracy[userColor];
    const accOpp = review.accuracy[opp];
    const seed = game.moves.length;
    const parts = [];
    let mood = 'happy';
    let anim = 'bob';
    if (code === 'win') {
      parts.push(CC.pick(['Belle victoire ! 🎉', 'Victoire ! Bien joué.', 'GG, la partie est à toi !'], seed));
      mood = 'cool';
      anim = 'jump';
    } else if (code === 'loss') {
      parts.push(CC.pick(['Défaite… mais chaque partie perdue est une leçon.', 'Partie perdue : on regarde ce qui a coincé ?'], seed));
      mood = 'sad';
      anim = null;
    } else if (code === 'draw') parts.push('Partie nulle.');
    if (accMe != null) {
      parts.push(`Ta précision : <b>${fmtPct(accMe)}</b>${accOpp != null ? `, contre ${fmtPct(accOpp)} pour ton adversaire` : ''}.`);
    }
    const c = review.counts[userColor];
    if (c.brilliant) parts.push(`Tu as trouvé <b>${c.brilliant}</b> coup${c.brilliant > 1 ? 's' : ''} brillant${c.brilliant > 1 ? 's' : ''} !!`);
    else if (c.great) parts.push(`Tu as trouvé ${c.great} très bon${c.great > 1 ? 's' : ''} coup${c.great > 1 ? 's' : ''}.`);
    const mine = review.moves.filter((x) => x.color === userColor && CC.SEVERE[x.cls]).sort((a, b) => b.loss - a.loss)[0];
    const theirs = review.moves.filter((x) => x.color === opp && CC.SEVERE[x.cls]).sort((a, b) => b.loss - a.loss)[0];
    if (mine && mine.loss >= 10) parts.push(`Le tournant : ${label(game, mine)} (${CC.CLS[mine.cls].label.toLowerCase()}).`);
    else if (!c.blunder && !c.mistake && !c.miss) parts.push('Aucune grosse erreur de ta part : solide !');
    if (code === 'win' && theirs && theirs.loss >= 20) parts.push(`Ton adversaire a craqué sur ${label(game, theirs)}.`);
    parts.push('On repasse les moments clés ensemble ?');
    return { html: parts.join(' '), mood, anim };
  };

  /** Bulle de départ (position initiale) */
  Coach.intro = function (ctx) {
    const o = ctx.review.opening;
    return o
      ? `Ouverture : <i>${CC.esc(o.name)}</i> <span class="muted">(${CC.esc(o.eco)})</span>. Avance avec ▶ ou les flèches du clavier, et joue toi-même sur l’échiquier pour explorer une idée.`
      : 'Avance avec ▶ ou les flèches du clavier, et joue toi-même sur l’échiquier pour explorer une idée.';
  };
})(window);
