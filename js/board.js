/* Clawd Coach — échiquier (rendu DOM, animations, flèches, badges, clic & glisser-déposer) */
(function (root) {
  'use strict';
  const CC = root.CC;
  const FILES = 'abcdefgh';

  function parsePlacement(fen) {
    const m = new Map();
    const rows = fen.split(' ')[0].split('/');
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') f += +ch;
        else {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          m.set(FILES[f] + (8 - r), color + ch.toUpperCase());
          f++;
        }
      }
    }
    return m;
  }

  class Board {
    constructor(el, opts) {
      opts = opts || {};
      this.el = el;
      this.orientation = opts.orientation || 'w';
      this.pieceUrl = opts.pieceUrl || ((code) => `assets/pieces/${code}.svg`);
      this.onUserMove = null;
      this.movable = null; // { color, dests: Map<from, to[]> }
      this.selected = null;
      this.pieces = new Map(); // square -> { el, code }
      this.hls = [];
      this.arrows = [];
      this.badge = null;
      this.hint = null;
      this.checkSq = null;
      el.classList.add('cc-board');
      el.innerHTML =
        '<div class="b-squares"></div><div class="b-hl"></div><div class="b-pieces"></div>' +
        '<svg class="b-arrows" viewBox="0 0 800 800" aria-hidden="true"></svg><div class="b-badges"></div>';
      this.$sq = el.querySelector('.b-squares');
      this.$hl = el.querySelector('.b-hl');
      this.$pieces = el.querySelector('.b-pieces');
      this.$arrows = el.querySelector('.b-arrows');
      this.$badges = el.querySelector('.b-badges');
      this._renderSquares();
      this._bindPointer();
    }

    /* ---------- géométrie ---------- */
    _xy(sq) {
      const [f, r] = CC.sqXY(sq);
      return this.orientation === 'w' ? [f, 7 - r] : [7 - f, r];
    }
    _sqAt(col, row) {
      return this.orientation === 'w' ? CC.xySq(col, 7 - row) : CC.xySq(7 - col, row);
    }
    _pos(el, sq) {
      const [c, r] = this._xy(sq);
      el.style.transform = `translate(${c * 100}%, ${r * 100}%)`;
    }

    _renderSquares() {
      let html = '';
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const sq = this._sqAt(col, row);
          const [f, r] = CC.sqXY(sq);
          const light = (f + r) % 2 === 1;
          let coords = '';
          if (col === 0) coords += `<span class="coord rank">${r + 1}</span>`;
          if (row === 7) coords += `<span class="coord file">${FILES[f]}</span>`;
          html += `<div class="sq ${light ? 'l' : 'd'}">${coords}</div>`;
        }
      }
      this.$sq.innerHTML = html;
    }

    setOrientation(color) {
      if (color === this.orientation) return;
      this.orientation = color;
      this._renderSquares();
      this._noAnim(() => {
        for (const [sq, obj] of this.pieces) this._pos(obj.el, sq);
      });
      this._drawHL();
      this._drawArrows();
      this._drawBadge();
    }
    flip() {
      this.setOrientation(this.orientation === 'w' ? 'b' : 'w');
    }

    _noAnim(fn) {
      this.$pieces.classList.add('no-anim');
      fn();
      void this.$pieces.offsetWidth; // force reflow
      this.$pieces.classList.remove('no-anim');
    }

    _makePiece(code, sq) {
      const el = document.createElement('div');
      el.className = 'piece';
      el.style.backgroundImage = `url("${this.pieceUrl(code)}")`;
      this._pos(el, sq);
      this.$pieces.appendChild(el);
      return el;
    }

    /** Affiche une position. animate=true anime les pièces qui bougent. */
    setPosition(fen, animate) {
      if (this._justDropped) {
        animate = false;
        this._justDropped = false;
      }
      const next = parsePlacement(fen);
      const old = this.pieces;
      const keep = new Map();
      const leftovers = [];
      for (const [sq, obj] of old) {
        if (next.get(sq) === obj.code) keep.set(sq, obj);
        else leftovers.push([sq, obj]);
      }
      const placeOps = [];
      for (const [sq, code] of next) {
        if (keep.has(sq)) continue;
        let bi = -1;
        let bd = 99;
        leftovers.forEach(([osq, obj], idx) => {
          if (obj.code !== code) return;
          const [a, b] = CC.sqXY(osq);
          const [c, d] = CC.sqXY(sq);
          const dist = Math.max(Math.abs(a - c), Math.abs(b - d));
          if (dist < bd) {
            bd = dist;
            bi = idx;
          }
        });
        if (bi >= 0) {
          const [, obj] = leftovers.splice(bi, 1)[0];
          keep.set(sq, obj);
          placeOps.push([obj.el, sq]);
        } else {
          keep.set(sq, { el: this._makePiece(code, sq), code });
        }
      }
      for (const [, obj] of leftovers) obj.el.remove();
      if (animate && placeOps.length <= 3) {
        for (const [el, sq] of placeOps) this._pos(el, sq);
      } else {
        this._noAnim(() => placeOps.forEach(([el, sq]) => this._pos(el, sq)));
      }
      this.pieces = keep;
      this.fen = fen;
      this.selected = null;
      this._drawHL();
    }

    /* ---------- surlignages / flèches / badge ---------- */
    setHighlights(list) {
      this.hls = list || [];
      this._drawHL();
    }
    setCheck(sq) {
      this.checkSq = sq || null;
      this._drawHL();
    }
    setHint(sq) {
      this.hint = sq || null;
      this._drawHL();
    }
    _drawHL() {
      let html = '';
      const at = (sq, cls, style) => {
        const [c, r] = this._xy(sq);
        html += `<div class="${cls}" style="transform:translate(${c * 100}%,${r * 100}%);${style || ''}"></div>`;
      };
      for (const h of this.hls) at(h.sq, 'hl', `background:${h.color}`);
      if (this.checkSq) at(this.checkSq, 'hl check');
      if (this.hint) at(this.hint, 'hl hint');
      if (this.selected) {
        at(this.selected, 'hl sel');
        const dests = (this.movable && this.movable.dests.get(this.selected)) || [];
        for (const d of dests) at(d, this.pieces.has(d) ? 'hl dest cap' : 'hl dest');
      }
      this.$hl.innerHTML = html;
    }

    setArrows(list) {
      this.arrows = list || [];
      this._drawArrows();
    }
    _drawArrows() {
      let html = '';
      for (const a of this.arrows) {
        const [c1, r1] = this._xy(a.from);
        const [c2, r2] = this._xy(a.to);
        const x1 = c1 * 100 + 50;
        const y1 = r1 * 100 + 50;
        const x2 = c2 * 100 + 50;
        const y2 = r2 * 100 + 50;
        const dx = Math.abs(c2 - c1);
        const dy = Math.abs(r2 - r1);
        const W = 20;
        const HL = 40;
        const HW = 50;
        let shaft;
        let ux;
        let uy;
        if ((dx === 1 && dy === 2) || (dx === 2 && dy === 1)) {
          // flèche en L pour le cavalier
          const mx = dy > dx ? x1 : x2;
          const my = dy > dx ? y2 : y1;
          ux = Math.sign(x2 - mx);
          uy = Math.sign(y2 - my);
          const ex = x2 + ux * 10 - ux * HL;
          const ey = y2 + uy * 10 - uy * HL;
          shaft = `<path d="M${x1} ${y1} L${mx} ${my} L${ex} ${ey}" fill="none" stroke-width="${W}" stroke-linejoin="round"/>`;
        } else {
          const len = Math.hypot(x2 - x1, y2 - y1) || 1;
          ux = (x2 - x1) / len;
          uy = (y2 - y1) / len;
          const ex = x2 + ux * 10 - ux * HL;
          const ey = y2 + uy * 10 - uy * HL;
          shaft = `<path d="M${x1} ${y1} L${ex} ${ey}" fill="none" stroke-width="${W}"/>`;
        }
        const tx = x2 + ux * 10;
        const ty = y2 + uy * 10;
        const bx = tx - ux * HL;
        const by = ty - uy * HL;
        const nx = -uy;
        const ny = ux;
        const head = `<polygon points="${tx},${ty} ${bx + (nx * HW) / 2},${by + (ny * HW) / 2} ${bx - (nx * HW) / 2},${by - (ny * HW) / 2}"/>`;
        html += `<g opacity="${a.opacity || 0.82}" fill="${a.color}" stroke="${a.color}">${shaft}${head}</g>`;
      }
      this.$arrows.innerHTML = html;
    }

    setBadge(b) {
      this.badge = b || null;
      this._drawBadge(true);
    }
    _drawBadge(pop) {
      if (!this.badge) {
        this.$badges.innerHTML = '';
        return;
      }
      const [c, r] = this._xy(this.badge.sq);
      const left = Math.min((c + 1) * 12.5 - 3.3, 100 - 5.6);
      const top = Math.max(r * 12.5 - 1.8, -1.4);
      this.$badges.innerHTML = `<div class="b-badge${pop ? ' pop' : ''}" style="left:${left}%;top:${top}%">${CC.icon(this.badge.cls)}</div>`;
    }

    /* ---------- interaction ---------- */
    setMovable(cfg) {
      this.movable = cfg || null;
      this.selected = null;
      this.el.classList.toggle('movable', !!cfg);
      this._drawHL();
    }
    _isDest(from, to) {
      const d = this.movable && this.movable.dests.get(from);
      return !!(d && d.includes(to));
    }
    _select(sq) {
      this.selected = sq;
      this._drawHL();
    }
    _eventSquare(e) {
      const r = this.el.getBoundingClientRect();
      const col = Math.floor(((e.clientX - r.left) / r.width) * 8);
      const row = Math.floor(((e.clientY - r.top) / r.height) * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return null;
      return this._sqAt(col, row);
    }
    _bindPointer() {
      this.el.addEventListener('pointerdown', (e) => this._down(e));
      window.addEventListener('pointermove', (e) => this._move(e));
      window.addEventListener('pointerup', (e) => this._up(e));
      window.addEventListener('pointercancel', () => this._cancelDrag());
    }
    _down(e) {
      if (!this.movable || e.button > 0) return;
      const sq = this._eventSquare(e);
      if (!sq) return;
      if (this.selected && sq !== this.selected && this._isDest(this.selected, sq)) {
        e.preventDefault();
        this._commit(this.selected, sq, false);
        return;
      }
      const p = this.pieces.get(sq);
      if (p && p.code[0] === this.movable.color && this.movable.dests.has(sq)) {
        e.preventDefault();
        this._select(sq);
        const r = this.el.getBoundingClientRect();
        this.drag = { sq, el: p.el, x0: e.clientX, y0: e.clientY, moved: false, size: r.width / 8, rect: r };
      } else {
        this._select(null);
      }
    }
    _move(e) {
      const d = this.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      if (!d.moved) {
        d.moved = true;
        d.el.classList.add('dragging');
      }
      const x = e.clientX - d.rect.left - d.size / 2;
      const y = e.clientY - d.rect.top - d.size / 2;
      d.el.style.transform = `translate(${x}px, ${y}px)`;
    }
    _up(e) {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      d.el.classList.remove('dragging');
      if (!d.moved) return; // simple clic : la pièce reste sélectionnée
      const sq = this._eventSquare(e);
      this._noAnim(() => this._pos(d.el, d.sq));
      if (sq && sq !== d.sq && this._isDest(d.sq, sq)) this._commit(d.sq, sq, true);
    }
    _cancelDrag() {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      d.el.classList.remove('dragging');
      this._noAnim(() => this._pos(d.el, d.sq));
    }
    _commit(from, to, dropped) {
      this.selected = null;
      this._drawHL();
      const p = this.pieces.get(from);
      const rank = to[1];
      const promo = p && p.code[1] === 'P' && (rank === '8' || rank === '1') ? 'q' : undefined;
      this._justDropped = !!dropped;
      if (this.onUserMove) this.onUserMove(from, to, promo);
      setTimeout(() => (this._justDropped = false), 60);
    }
  }

  CC.Board = Board;
})(window);
