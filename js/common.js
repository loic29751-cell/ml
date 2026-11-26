/* Claude Coach — utilitaires partagés (window.CC) */
(function (root) {
  'use strict';
  const CC = (root.CC = root.CC || {});

  CC.START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  CC.VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  CC.NAME = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };
  const FEM = { r: 1, q: 1 };
  CC.ton = (t) => (FEM[t] ? 'ta ' : 'ton ') + CC.NAME[t];
  CC.son = (t) => (FEM[t] ? 'sa ' : 'son ') + CC.NAME[t];
  CC.un = (t) => (FEM[t] ? 'une ' : 'un ') + CC.NAME[t];
  CC.le = (t) => (FEM[t] ? 'la ' : 'le ') + CC.NAME[t];

  CC.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  CC.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  CC.sqXY = (sq) => [sq.charCodeAt(0) - 97, sq.charCodeAt(1) - 49];
  CC.xySq = (x, y) => String.fromCharCode(97 + x) + (y + 1);
  CC.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  CC.hash = (str) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  };
  CC.pick = (arr, seed) => arr[((seed % arr.length) + arr.length) % arr.length];
  CC.hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  /* ---------- Évaluations : { cp, mate } toujours du point de vue des Blancs ---------- */
  CC.cpWin = (cp) => {
    const c = CC.clamp(cp, -1000, 1000);
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
  };
  CC.winWhite = (s) => (s.mate != null ? (s.cp > 0 ? 100 : 0) : CC.cpWin(s.cp));
  CC.winFor = (s, color) => (color === 'w' ? CC.winWhite(s) : 100 - CC.winWhite(s));
  /** Score UCI (point de vue du camp au trait) -> score Blancs */
  CC.fromEngine = (sc, turn) => {
    const k = turn === 'w' ? 1 : -1;
    if (sc.mate != null) {
      const m = sc.mate * k;
      return { mate: m, cp: (m > 0 ? 1 : -1) * (100000 - Math.abs(m)) };
    }
    return { cp: sc.cp * k, mate: null };
  };
  /** Mat du point de vue de `color` : > 0 = color mate en n, < 0 = color se fait mater */
  CC.mateFor = (s, color) => (s.mate == null || s.mate === 0 ? null : color === 'w' ? s.mate : -s.mate);
  CC.fmtEval = (s, short) => {
    if (!s) return '';
    if (s.mate != null) {
      if (s.mate === 0) return s.cp > 0 ? '1-0' : '0-1';
      return (short ? '' : s.mate > 0 ? '' : '−') + 'M' + Math.abs(s.mate);
    }
    const v = s.cp / 100;
    if (short) {
      const a = Math.abs(v);
      return a >= 10 ? a.toFixed(0) : a.toFixed(1);
    }
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  };

  /* ---------- Notation : figurines ---------- */
  const FIG = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' };
  CC.sanHTML = (san) =>
    san ? CC.esc(san).replace(/[KQRBN]/g, (c) => `<span class="fig">${FIG[c]}</span>`) : '';
  CC.moveLabel = (fen, color) => {
    const fm = parseInt(fen.split(' ')[5], 10) || 1;
    return color === 'w' ? `${fm}.` : `${fm}…`;
  };

  /* ---------- Stockage local (tolérant aux erreurs) ---------- */
  CC.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch (e) {
        /* ignore */
      }
    },
    keys(prefix) {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) out.push(k);
        }
      } catch (e) {
        /* ignore */
      }
      return out;
    },
  };

  /* ---------- Classifications (palette Claude Code) ---------- */
  CC.CLS = {
    brilliant: { label: 'Brillant', phrase: 'est brillant !!', color: '#2FB3A3', ink: '#1A8F81', glyph: '!!' },
    great: { label: 'Très bon coup', phrase: 'est un très bon coup !', color: '#4F8FDB', ink: '#2F6DB8', glyph: '!' },
    best: { label: 'Meilleur', phrase: 'est le meilleur coup', color: '#4EBA65', ink: '#2F8C45', glyph: 'star' },
    excellent: { label: 'Excellent', phrase: 'est excellent', color: '#4EBA65', ink: '#2F8C45', glyph: 'thumb' },
    good: { label: 'Bon', phrase: 'est un bon coup', color: '#8DAE7E', ink: '#5E7F50', glyph: 'check' },
    book: { label: 'Théorique', phrase: 'est un coup théorique', color: '#A8835F', ink: '#87643F', glyph: 'book' },
    inaccuracy: { label: 'Imprécision', phrase: 'est une imprécision', color: '#F2C14E', ink: '#B98A0C', glyph: '?!' },
    mistake: { label: 'Erreur', phrase: 'est une erreur', color: '#F0913A', ink: '#CF6A16', glyph: '?' },
    miss: { label: 'Occasion manquée', phrase: 'rate une occasion', color: '#FF6B80', ink: '#DB4560', glyph: 'x' },
    blunder: { label: 'Gaffe', phrase: 'est une gaffe', color: '#E5484D', ink: '#C9302F', glyph: '??' },
    forced: { label: 'Forcé', phrase: 'est forcé', color: '#8E8C84', ink: '#6A6862', glyph: 'arrow' },
  };
  CC.CLS_ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
  CC.SEVERE = { inaccuracy: 1, mistake: 1, miss: 1, blunder: 1 };

  const STAR = (() => {
    let d = '';
    for (let k = 0; k < 10; k++) {
      const a = ((-90 + k * 36) * Math.PI) / 180;
      const r = k % 2 ? 3.3 : 7.4;
      d += (k ? 'L' : 'M') + (12 + r * Math.cos(a)).toFixed(2) + ' ' + (12.5 + r * Math.sin(a)).toFixed(2);
    }
    return d + 'Z';
  })();

  /** Pastille SVG d'une classification (cercle coloré + symbole blanc) */
  CC.icon = (cls) => {
    const m = CC.CLS[cls];
    if (!m) return '';
    let g;
    switch (m.glyph) {
      case 'star':
        g = `<path d="${STAR}" fill="#fff"/>`;
        break;
      case 'thumb':
        g =
          '<rect x="6.2" y="11" width="2.7" height="7.2" rx=".6" fill="#fff"/>' +
          '<path d="M10.1 18.2V11.2l2.7-4.4c.5-.8 1.7-.6 1.9.3.1.5.1.9 0 1.3l-.6 1.8h3.4c1 0 1.7.9 1.5 1.8l-1.2 5c-.2.8-.9 1.2-1.7 1.2z" fill="#fff"/>';
        break;
      case 'check':
        g = '<path d="M7 12.6l3.4 3.3 6.8-7" fill="none" stroke="#fff" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/>';
        break;
      case 'book':
        g =
          '<path d="M5.4 7.7c2.3-1 4.6-.8 6.6.6 2-1.4 4.3-1.6 6.6-.6v9.4c-2.3-1-4.6-.8-6.6.6-2-1.4-4.3-1.6-6.6-.6z" fill="#fff"/>' +
          `<path d="M12 8.6v9" stroke="${m.color}" stroke-width="1.3"/>`;
        break;
      case 'x':
        g = '<path d="M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2" stroke="#fff" stroke-width="2.9" stroke-linecap="round"/>';
        break;
      case 'arrow':
        g = '<path d="M6.5 12h10M13 8l4 4-4 4" fill="none" stroke="#fff" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>';
        break;
      default:
        g = `<text x="12" y="${m.glyph.length > 1 ? 16.9 : 17.4}" text-anchor="middle" font-size="${m.glyph.length > 1 ? 13 : 15.5}" font-weight="900" fill="#fff" font-family="Arial Black, Nunito Sans, Segoe UI, Arial, sans-serif" letter-spacing="${m.glyph.length > 1 ? -1.2 : 0}">${m.glyph}</text>`;
    }
    return `<svg class="cls-icon" viewBox="0 0 24 24" role="img" aria-label="${m.label}"><circle cx="12" cy="12" r="11.6" fill="${m.color}"/>${g}</svg>`;
  };
})(window);
