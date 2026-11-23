/* Clawd — la petite mascotte pixel de Claude Code, version coach d'échecs.
 * Silhouette fidèle au logo du terminal :   ▐▛███▜▌ / ▝▜█████▛▘ /   ▘▘ ▝▝
 * Grille 36 x 20 (chaque "quart de caractère" du terminal = 2 x 4 pixels). */
(function (root) {
  'use strict';
  const BODY = '#D77757';
  const SHADE = '#B9603F';
  const INK = '#1B1A18';
  const EYES = [10, 24]; // x de l'œil gauche / droit

  const r = (x, y, w, h, fill, cls) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${cls ? ` class="${cls}"` : ''}/>`;

  function body() {
    return (
      r(6, 0, 24, 16, BODY) + // corps
      r(2, 8, 32, 4, BODY) + // bras
      r(6, 14, 24, 2, SHADE) + // ombre sous le ventre
      `<g class="legs-a">${r(8, 16, 2, 4, BODY)}${r(22, 16, 2, 4, BODY)}</g>` +
      `<g class="legs-b">${r(12, 16, 2, 4, BODY)}${r(26, 16, 2, 4, BODY)}</g>`
    );
  }

  function face(mood) {
    let s = '';
    const both = (fn) => EYES.forEach((x, k) => (s += fn(x, k)));
    switch (mood) {
      case 'happy':
        both((x) => r(x - 1, 6, 1, 1, INK) + r(x, 5, 2, 1, INK) + r(x + 2, 6, 1, 1, INK));
        break;
      case 'star': // yeux étoilés (coup brillant)
        both((x) => r(x, 3, 2, 6, '#FFF4D6') + r(x - 2, 5, 6, 2, '#FFF4D6') + r(x, 5, 2, 2, '#FFFFFF'));
        break;
      case 'wink':
        s += r(9, 6, 1, 1, INK) + r(10, 5, 2, 1, INK) + r(12, 6, 1, 1, INK);
        s += r(24, 4, 2, 4, INK, 'eye');
        break;
      case 'meh':
        both((x) => r(x - 1, 6, 4, 1, INK));
        break;
      case 'worried':
        both((x) => r(x, 5, 2, 3, INK));
        s += r(8, 3, 2, 1, INK) + r(10, 2, 2, 1, INK); // sourcils inquiets
        s += r(24, 2, 2, 1, INK) + r(26, 3, 2, 1, INK);
        break;
      case 'shocked':
        both((x) => r(x - 1, 3, 4, 5, INK) + r(x, 4, 1, 1, '#FFFFFF'));
        s += r(16, 10, 4, 3, INK); // bouche en O
        break;
      case 'sad':
        both((x) => r(x, 6, 2, 2, INK));
        s += r(10, 9, 1, 2, '#7FB2E5'); // larme
        break;
      case 'thinking':
        both((x) => r(x + 1, 3, 2, 3, INK));
        break;
      case 'cool': // lunettes de soleil (victoire)
        s += r(7, 4, 22, 1, INK) + r(8, 4, 6, 4, INK) + r(22, 4, 6, 4, INK) + r(9, 5, 2, 1, '#5A5955') + r(23, 5, 2, 1, '#5A5955');
        break;
      default: // idle
        both((x) => r(x, 4, 2, 4, INK, 'eye'));
    }
    return s;
  }

  /** Renvoie le SVG de Clawd. mood: idle|happy|star|wink|meh|worried|shocked|sad|thinking|cool */
  function svg(mood, extraClass) {
    return (
      `<svg class="clawd ${extraClass || ''}" viewBox="0 -1 36 21" shape-rendering="crispEdges" aria-hidden="true">` +
      body() +
      face(mood || 'idle') +
      '</svg>'
    );
  }

  /** Met Clawd dans un conteneur, avec une animation optionnelle (bob|jump|shake|walk) */
  function set(el, mood, anim) {
    if (!el) return;
    el.innerHTML = svg(mood, anim ? 'anim-' + anim : '');
    if (anim === 'jump' || mood === 'star') sparkle(el);
  }

  function sparkle(el) {
    const host = el;
    for (let i = 0; i < 4; i++) {
      const sp = document.createElement('span');
      sp.className = 'spark';
      sp.textContent = i % 2 ? '✦' : '✻';
      sp.style.left = [8, 82, 18, 70][i] + '%';
      sp.style.top = [-6, -2, 58, 62][i] + '%';
      sp.style.animationDelay = i * 0.12 + 's';
      host.appendChild(sp);
      setTimeout(() => sp.remove(), 1400);
    }
  }

  root.Clawd = { svg, set };
})(window);
