/**
 * board.js — 2.5D Canvas Chess Board Renderer
 * Regicide Chess
 */

'use strict';

const BoardRenderer = (() => {

  // ---- Config ----
  const PIECE_SYMBOLS = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
  };

  const PIECE_COLORS = {
    white: { fill: '#f5f0e8', stroke: '#8a7a60', shadow: 'rgba(200,168,75,0.4)' },
    black: { fill: '#1a1410', stroke: '#6a5040', shadow: 'rgba(0,0,0,0.6)' },
  };

  let canvas, ctx;
  let size = 580;
  let squareSize = size / 8;
  let flipped = false;
  let season = 'winter';

  // Interaction state
  let selectedSq = null;   // {r,f}
  let legalTargets = [];   // [[r,f,flag], ...]
  let lastMove = null;     // {fr,ff,tr,tf}
  let checkSq = null;      // {r,f}
  let dragPiece = null;    // {r,f,x,y,piece}
  let hoveredSq = null;

  // Animation
  let animations = [];     // [{piece,fr,ff,tr,tf,progress,duration}]
  let animFrame = null;

  // Callbacks
  let onSquareClick = null;
  let onDrop = null;
  let onDragStart = null;

  // Season colors
  const SEASON_COLORS = {
    winter: { light: '#c8d8f0', dark: '#2a3a5a', border: '#4a6a9a' },
    summer: { light: '#e8d8b0', dark: '#5a3a1a', border: '#9a7040' },
    rainy:  { light: '#b0b8c8', dark: '#2a2e38', border: '#4a5060' },
    autumn: { light: '#d8c090', dark: '#4a2810', border: '#8a5820' },
  };

  function init(canvasEl, options = {}) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    flipped = options.flipped || false;
    season = options.season || 'winter';
    onSquareClick = options.onSquareClick || null;
    onDrop = options.onDrop || null;
    onDragStart = options.onDragStart || null;

    resize();
    attachEvents();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    size = rect.width || 580;
    squareSize = size / 8;
    canvas.width = size * window.devicePixelRatio;
    canvas.height = size * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  // ---- Drawing ----

  function draw(state) {
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);

    // Perspective tilt (2.5D effect)
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.transform(1, 0, 0, 0.97, 0, 0);  // slight vertical squish
    ctx.translate(-size / 2, -size / 2 + size * 0.015);

    drawBoard();
    drawHighlights(state);
    if (state) drawPieces(state);
    if (dragPiece) drawDragPiece();
    drawCoordinates();
    drawBoardEdge();

    ctx.restore();
  }

  function drawBoard() {
    const cols = SEASON_COLORS[season];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const x = f * squareSize, y = r * squareSize;
        const isLight = (r + f) % 2 === 0;

        // Square gradient
        const grad = ctx.createLinearGradient(x, y, x + squareSize, y + squareSize);
        if (isLight) {
          grad.addColorStop(0, cols.light);
          grad.addColorStop(1, shadeColor(cols.light, -8));
        } else {
          grad.addColorStop(0, cols.dark);
          grad.addColorStop(1, shadeColor(cols.dark, 8));
        }
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, squareSize, squareSize);

        // Subtle inner shadow/bevel
        if (!isLight) {
          ctx.fillStyle = 'rgba(0,0,0,0.1)';
          ctx.fillRect(x, y, 1, squareSize);
          ctx.fillRect(x, y, squareSize, 1);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(x + squareSize - 1, y, 1, squareSize);
          ctx.fillRect(x, y + squareSize - 1, squareSize, 1);
        }

        // Hovered square
        if (hoveredSq && hoveredSq.r === r && hoveredSq.f === f && !selectedSq) {
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(x, y, squareSize, squareSize);
        }
      }
    }
  }

  function drawHighlights(state) {
    // Last move
    if (lastMove) {
      const { fr, ff, tr, tf } = lastMove;
      const [dr, df] = flipped ? [7-fr, 7-ff] : [fr, ff];
      const [dr2, df2] = flipped ? [7-tr, 7-tf] : [tr, tf];
      ctx.fillStyle = 'rgba(200,168,75,0.32)';
      ctx.fillRect(df * squareSize, dr * squareSize, squareSize, squareSize);
      ctx.fillRect(df2 * squareSize, dr2 * squareSize, squareSize, squareSize);
    }

    // Check
    if (checkSq) {
      const [dr, df] = flipped ? [7-checkSq.r, 7-checkSq.f] : [checkSq.r, checkSq.f];
      const x = df * squareSize + squareSize / 2;
      const y = dr * squareSize + squareSize / 2;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, squareSize * 0.7);
      grad.addColorStop(0, 'rgba(255,60,60,0.6)');
      grad.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(df * squareSize, dr * squareSize, squareSize, squareSize);
    }

    // Selected
    if (selectedSq) {
      const [dr, df] = flipped ? [7-selectedSq.r, 7-selectedSq.f] : [selectedSq.r, selectedSq.f];
      ctx.fillStyle = 'rgba(74,122,255,0.38)';
      ctx.fillRect(df * squareSize, dr * squareSize, squareSize, squareSize);
      // Glow border
      ctx.strokeStyle = 'rgba(74,122,255,0.7)';
      ctx.lineWidth = 2;
      ctx.strokeRect(df * squareSize + 1, dr * squareSize + 1, squareSize - 2, squareSize - 2);
    }

    // Legal move dots
    if (legalTargets.length) {
      legalTargets.forEach(([tr, tf]) => {
        const [dr, df] = flipped ? [7-tr, 7-tf] : [tr, tf];
        const x = df * squareSize + squareSize / 2;
        const y = dr * squareSize + squareSize / 2;
        const occupied = state && state.board[tr][tf];
        if (occupied) {
          // Ring
          ctx.strokeStyle = 'rgba(74,122,255,0.5)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, squareSize * 0.46, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Dot
          ctx.fillStyle = 'rgba(74,122,255,0.4)';
          ctx.beginPath();
          ctx.arc(x, y, squareSize * 0.15, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }

  function drawPieces(state) {
    const animatingSquares = new Set(animations.map(a => `${a.fr},${a.ff}`));

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = state.board[r][f];
        if (!piece) continue;
        if (dragPiece && dragPiece.r === r && dragPiece.f === f) continue;
        if (animatingSquares.has(`${r},${f}`)) continue;

        const [dr, df] = flipped ? [7-r, 7-f] : [r, f];
        drawPiece(piece, df * squareSize, dr * squareSize, squareSize);
      }
    }

    // Draw animations
    animations.forEach(anim => {
      const [sr, sf] = flipped ? [7-anim.fr, 7-anim.ff] : [anim.fr, anim.ff];
      const [er, ef] = flipped ? [7-anim.tr, 7-anim.tf] : [anim.tr, anim.tf];
      const t = easeInOut(anim.progress);
      const x = (sf + (ef - sf) * t) * squareSize;
      const y = (sr + (er - sr) * t) * squareSize;
      // Slight arc
      const arcY = y - Math.sin(anim.progress * Math.PI) * squareSize * 0.25;
      drawPiece(anim.piece, x, arcY, squareSize, anim.progress);
    });
  }

  function drawPiece(piece, x, y, sz, alpha = 1) {
    const col = ChessEngine.isWhite(piece) ? 'white' : 'black';
    const cols = PIECE_COLORS[col];
    const symbol = PIECE_SYMBOLS[piece];
    const cx = x + sz / 2;
    const cy = y + sz / 2;
    const fontSize = sz * 0.72;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Drop shadow
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = sz * 0.12;
    ctx.shadowOffsetX = sz * 0.03;
    ctx.shadowOffsetY = sz * 0.05;

    // Piece text
    ctx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Outline for white pieces
    if (col === 'white') {
      ctx.strokeStyle = 'rgba(100,80,40,0.5)';
      ctx.lineWidth = sz * 0.035;
      ctx.lineJoin = 'round';
      ctx.strokeText(symbol, cx, cy);
    }

    ctx.fillStyle = col === 'white' ? '#fff8f0' : '#1a1008';
    ctx.fillText(symbol, cx, cy);

    // Subtle glow for white pieces
    if (col === 'white') {
      ctx.shadowColor = 'rgba(255,240,200,0.3)';
      ctx.shadowBlur = sz * 0.08;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillText(symbol, cx, cy);
    }

    ctx.restore();
  }

  function drawDragPiece() {
    if (!dragPiece) return;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = 'rgba(74,122,255,0.4)';
    ctx.shadowBlur = 20;
    drawPiece(dragPiece.piece, dragPiece.x - squareSize / 2, dragPiece.y - squareSize / 2, squareSize * 1.1);
    ctx.restore();
  }

  function drawCoordinates() {
    const files = 'abcdefgh';
    const ranks = '87654321';
    ctx.font = `500 ${squareSize * 0.18}px 'JetBrains Mono', monospace`;
    ctx.textBaseline = 'bottom';

    for (let i = 0; i < 8; i++) {
      const fi = flipped ? 7 - i : i;
      const ri = flipped ? 7 - i : i;
      const isLight = (7 + i) % 2 === 0;
      const cols = SEASON_COLORS[season];
      const c = isLight ? cols.dark : cols.light;

      // File labels (bottom row)
      ctx.fillStyle = c + 'aa';
      ctx.textAlign = 'right';
      ctx.fillText(files[fi], (i + 1) * squareSize - 2, 8 * squareSize - 2);

      // Rank labels (left column)
      const isRankLight = (ri + 0) % 2 === 0;
      const rc = isRankLight ? cols.dark : cols.light;
      ctx.fillStyle = rc + 'aa';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(ranks[ri], 2, i * squareSize + 2);
    }
  }

  function drawBoardEdge() {
    const cols = SEASON_COLORS[season];
    ctx.strokeStyle = cols.border + '55';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }

  // ---- Animation ----

  function animateMove(piece, fr, ff, tr, tf, onDone) {
    const duration = 220; // ms
    const anim = { piece, fr, ff, tr, tf, progress: 0, duration, start: performance.now(), onDone };
    animations.push(anim);
  }

  function tickAnimations(state, timestamp) {
    let needsRedraw = false;
    animations = animations.filter(anim => {
      anim.progress = Math.min(1, (timestamp - anim.start) / anim.duration);
      if (anim.progress >= 1) {
        if (anim.onDone) anim.onDone();
        return false;
      }
      return true;
    });
    if (animations.length > 0) needsRedraw = true;
    return needsRedraw;
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // ---- Events ----

  function attachEvents() {
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', () => { hoveredSq = null; dragPiece = null; });
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('resize', resize);
  }

  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = size / rect.width;
    const scaleY = size / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function posToSquare(x, y) {
    const f = Math.floor(x / squareSize);
    const r = Math.floor(y / squareSize);
    if (r < 0 || r > 7 || f < 0 || f > 7) return null;
    return flipped ? { r: 7 - r, f: 7 - f } : { r, f };
  }

  function onMouseDown(e) {
    const pos = canvasPos(e);
    const sq = posToSquare(pos.x, pos.y);
    if (!sq) return;
    if (onDragStart) {
      const piece = onDragStart(sq.r, sq.f);
      if (piece) {
        dragPiece = { r: sq.r, f: sq.f, piece, x: pos.x, y: pos.y };
      }
    }
  }

  function onMouseMove(e) {
    const pos = canvasPos(e);
    hoveredSq = posToSquare(pos.x, pos.y);
    if (dragPiece) {
      dragPiece.x = pos.x;
      dragPiece.y = pos.y;
    }
  }

  function onMouseUp(e) {
    const pos = canvasPos(e);
    const sq = posToSquare(pos.x, pos.y);
    if (dragPiece) {
      const from = { r: dragPiece.r, f: dragPiece.f };
      dragPiece = null;
      if (sq && onDrop) onDrop(from.r, from.f, sq.r, sq.f);
    } else if (sq && onSquareClick) {
      onSquareClick(sq.r, sq.f);
    }
  }

  // Touch events
  function onTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    const pos = canvasPos(t);
    const sq = posToSquare(pos.x, pos.y);
    if (!sq) return;
    if (onDragStart) {
      const piece = onDragStart(sq.r, sq.f);
      if (piece) dragPiece = { r: sq.r, f: sq.f, piece, x: pos.x, y: pos.y };
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    const t = e.touches[0];
    const pos = canvasPos(t);
    if (dragPiece) { dragPiece.x = pos.x; dragPiece.y = pos.y; }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    const pos = canvasPos(t);
    const sq = posToSquare(pos.x, pos.y);
    if (dragPiece) {
      const from = { r: dragPiece.r, f: dragPiece.f };
      dragPiece = null;
      if (sq && onDrop) onDrop(from.r, from.f, sq.r, sq.f);
    } else if (sq && onSquareClick) {
      onSquareClick(sq.r, sq.f);
    }
  }

  // ---- Public API ----

  function setSelected(r, f) { selectedSq = (r !== null) ? { r, f } : null; }
  function setLegalTargets(moves) { legalTargets = moves || []; }
  function setLastMove(mv) { lastMove = mv; }
  function setCheckSquare(sq) { checkSq = sq; }
  function setFlipped(f) { flipped = f; }
  function setSeason(s) { season = s; }

  // Colour helpers
  function shadeColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + percent));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + percent));
    const b = Math.min(255, Math.max(0, (num & 0xFF) + percent));
    return `rgb(${r},${g},${b})`;
  }

  return {
    init, draw, resize,
    animateMove, tickAnimations,
    setSelected, setLegalTargets, setLastMove, setCheckSquare,
    setFlipped, setSeason,
    // expose for external render loop
    get canvas() { return canvas; },
  };
})();
