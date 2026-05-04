/**
 * board.js — Board Rendering & Piece Interaction
 */

class BoardRenderer {
  constructor(canvasId, pieceDivId, overlayDivId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.pieceLayer = document.getElementById(pieceDivId);
    this.overlayLayer = document.getElementById(overlayDivId);

    this.flipped = false;
    this.sqSize = 0;
    this.state = null;
    this.highlights = new Map(); // key="r,c" value=type
    this.animating = new Map();  // key="r,c" value=animData
    this.dragging = null;
    this.dragGhost = null;
    this.lastMove = null;

    this.onSquareClick = null;
    this.onDragStart = null;
    this.onDrop = null;

    this._pieceElems = new Map();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.canvas.parentElement);

    this._setupInteractions();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const size = parent.getBoundingClientRect();
    const s = Math.min(size.width, size.height);
    this.canvas.width = s;
    this.canvas.height = s;
    this.sqSize = s / 8;
    this.drawBoard();
    this.renderPieces();
  }

  // ---- DRAWING ----
  drawBoard() {
    const ctx = this.ctx;
    const sq = this.sqSize;
    if (!sq) return;

    // Board squares
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const light = (r + c) % 2 === 0;
        const x = c * sq, y = r * sq;

        // Base color
        ctx.fillStyle = light ? '#e8d5b0' : '#7a4a1e';
        ctx.fillRect(x, y, sq, sq);

        // Highlight overlay
        const key = `${r},${c}`;
        const hl = this.highlights.get(key);
        if (hl) {
          const colors = {
            'move': 'rgba(201,168,76,0.45)',
            'legal': 'rgba(74,158,255,0.28)',
            'check': 'rgba(255,60,60,0.55)',
            'last': light ? 'rgba(201,168,76,0.3)' : 'rgba(201,168,76,0.22)',
            'selected': 'rgba(201,168,76,0.5)',
          };
          ctx.fillStyle = colors[hl] || 'rgba(255,255,255,0.15)';
          ctx.fillRect(x, y, sq, sq);

          // Dot for legal moves (if no piece there)
          if (hl === 'legal' && (!this.state || !this.state.board[r][c])) {
            ctx.fillStyle = 'rgba(74,158,255,0.5)';
            ctx.beginPath();
            ctx.arc(x + sq / 2, y + sq / 2, sq * 0.15, 0, Math.PI * 2);
            ctx.fill();
          }
          // Ring for legal captures
          if (hl === 'legal' && this.state?.board[r][c]) {
            ctx.strokeStyle = 'rgba(74,158,255,0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x + sq / 2, y + sq / 2, sq * 0.45, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    }

    // Coordinates
    ctx.font = `${sq * 0.13}px "Cinzel", serif`;
    for (let i = 0; i < 8; i++) {
      const file = this.flipped ? String.fromCharCode(104 - i) : String.fromCharCode(97 + i);
      const rank = this.flipped ? (i + 1).toString() : (8 - i).toString();
      ctx.fillStyle = i % 2 === 0 ? '#7a4a1e' : '#e8d5b0';
      ctx.fillText(file, i * sq + sq * 0.03, sq * 8 - sq * 0.05);
      ctx.fillStyle = i % 2 === 0 ? '#e8d5b0' : '#7a4a1e';
      ctx.fillText(rank, sq * 0.03, i * sq + sq * 0.16);
    }

    // Subtle inner shadow / border
    const grad = ctx.createLinearGradient(0, 0, 0, sq * 8);
    grad.addColorStop(0, 'rgba(0,0,0,0.15)');
    grad.addColorStop(0.5, 'transparent');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, sq * 8, sq * 8);
  }

  // ---- PIECE RENDERING ----
  renderPieces() {
    if (!this.state) return;
    const sq = this.sqSize;
    if (!sq) return;

    // Update or create piece elements
    const seen = new Set();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.state.board[r][c];
        if (!piece) continue;

        // Skip dragged piece
        if (this.dragging?.fromR === r && this.dragging?.fromC === c) continue;

        const dr = this.flipped ? 7 - r : r;
        const dc = this.flipped ? 7 - c : c;
        const key = `${r},${c}`;
        seen.add(key);

        let el = this._pieceElems.get(key);
        if (!el) {
          el = document.createElement('div');
          el.className = 'piece-elem';
          el.style.cssText = `
            position: absolute;
            font-size: ${sq * 0.78}px;
            width: ${sq}px;
            height: ${sq}px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
            transition: left 0.12s cubic-bezier(0.25,0.8,0.25,1), top 0.12s cubic-bezier(0.25,0.8,0.25,1);
            user-select: none;
            pointer-events: all;
            z-index: 10;
            text-shadow: 0 2px 6px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.8);
            filter: drop-shadow(0 3px 8px rgba(0,0,0,0.5));
          `;
          this.pieceLayer.appendChild(el);
          this._pieceElems.set(key, el);
        }

        el.style.left = `${dc * sq}px`;
        el.style.top = `${dr * sq}px`;
        el.style.fontSize = `${sq * 0.78}px`;
        el.style.width = `${sq}px`;
        el.style.height = `${sq}px`;
        el.dataset.piece = piece.color + piece.type;
        el.dataset.r = r;
        el.dataset.c = c;
        el.textContent = Chess.PIECES[piece.color + piece.type] || '?';
      }
    }

    // Remove stale pieces
    for (const [key, el] of this._pieceElems) {
      if (!seen.has(key)) {
        el.remove();
        this._pieceElems.delete(key);
      }
    }
  }

  animateMove(fromR, fromC, toR, toC, afterCb) {
    const sq = this.sqSize;
    const fdr = this.flipped ? 7 - fromR : fromR;
    const fdc = this.flipped ? 7 - fromC : fromC;
    const tdr = this.flipped ? 7 - toR : toR;
    const tdc = this.flipped ? 7 - toC : toC;

    const key = `${fromR},${fromC}`;
    const el = this._pieceElems.get(key);
    if (!el) { afterCb?.(); return; }

    el.style.transition = 'left 0.22s cubic-bezier(0.25,0.8,0.25,1), top 0.22s cubic-bezier(0.25,0.8,0.25,1)';
    el.style.left = `${tdc * sq}px`;
    el.style.top = `${tdr * sq}px`;
    el.style.zIndex = '20';

    setTimeout(() => {
      el.style.transition = '';
      el.style.zIndex = '10';
      afterCb?.();
    }, 240);
  }

  clearPieces() {
    for (const el of this._pieceElems.values()) el.remove();
    this._pieceElems.clear();
  }

  highlight(r, c, type) { this.highlights.set(`${r},${c}`, type); }
  clearHighlights(types) {
    if (!types) { this.highlights.clear(); return; }
    for (const [k, v] of this.highlights)
      if (types.includes(v)) this.highlights.delete(k);
  }

  setLastMove(fromR, fromC, toR, toC) {
    this.clearHighlights(['last']);
    if (fromR != null) {
      this.highlight(fromR, fromC, 'last');
      this.highlight(toR, toC, 'last');
    }
    this.lastMove = fromR != null ? { fromR, fromC, toR, toC } : null;
  }

  flipBoard() {
    this.flipped = !this.flipped;
    this.drawBoard();
    this.renderPieces();
  }

  // ---- INTERACTIONS ----
  _setupInteractions() {
    const overlay = this.overlayLayer;

    const getSquare = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sq = this.sqSize;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      let dc = Math.floor((clientX - rect.left) / sq);
      let dr = Math.floor((clientY - rect.top) / sq);
      dc = Math.max(0, Math.min(7, dc));
      dr = Math.max(0, Math.min(7, dr));
      const r = this.flipped ? 7 - dr : dr;
      const c = this.flipped ? 7 - dc : dc;
      return { r, c, x: clientX - rect.left, y: clientY - rect.top };
    };

    let mouseDown = false;
    let mouseDownSq = null;
    let moved = false;

    const onPointerDown = (e) => {
      const sq = getSquare(e);
      mouseDown = true;
      mouseDownSq = sq;
      moved = false;

      const piece = this.state?.board[sq.r]?.[sq.c];
      if (piece && this.onDragStart) {
        const allowed = this.onDragStart(sq.r, sq.c);
        if (allowed) {
          this.dragging = { fromR: sq.r, fromC: sq.c };
          this._createGhost(piece, e);
          this.renderPieces();
        }
      }
    };

    const onPointerMove = (e) => {
      if (!mouseDown) return;
      moved = true;
      if (this.dragging && this.dragGhost) {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        this.dragGhost.style.left = `${clientX}px`;
        this.dragGhost.style.top = `${clientY}px`;
      }
    };

    const onPointerUp = (e) => {
      if (!mouseDown) return;
      mouseDown = false;
      const sq = getSquare(e);

      if (this.dragging) {
        this._destroyGhost();
        const { fromR, fromC } = this.dragging;
        this.dragging = null;
        this.renderPieces();
        if (this.onDrop) this.onDrop(fromR, fromC, sq.r, sq.c);
      } else if (!moved && this.onSquareClick) {
        this.onSquareClick(sq.r, sq.c);
      }
    };

    overlay.addEventListener('mousedown', onPointerDown);
    overlay.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);
  }

  _createGhost(piece, e) {
    if (this.dragGhost) this._destroyGhost();
    const ghost = document.createElement('div');
    ghost.className = 'piece-drag-ghost';
    ghost.style.fontSize = `${this.sqSize * 0.85}px`;
    ghost.textContent = Chess.PIECES[piece.color + piece.type] || '?';
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ghost.style.left = `${clientX}px`;
    ghost.style.top = `${clientY}px`;
    document.body.appendChild(ghost);
    this.dragGhost = ghost;
  }

  _destroyGhost() {
    if (this.dragGhost) { this.dragGhost.remove(); this.dragGhost = null; }
  }

  destroy() {
    this._resizeObserver.disconnect();
    this._destroyGhost();
    this.clearPieces();
  }
}
