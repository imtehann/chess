/**
 * board.js — Chess Game Logic, Board Rendering, and Game State
 * Handles FEN, moves, legal validation, PGN generation, piece rendering.
 */

const Board = (() => {

  // ── Piece Unicode map ──────────────────────────────────────────────────────
  const PIECE_UNICODE = {
    K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙',
    k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟'
  };

  const PIECE_NAMES = {
    K:'King', Q:'Queen', R:'Rook', B:'Bishop', N:'Knight', P:'Pawn',
    k:'king', q:'queen', r:'rook', b:'bishop', n:'knight', p:'pawn'
  };

  const CAPTURE_SYMBOLS = {
    P:'♟', p:'♙', N:'♞', n:'♘', B:'♝', b:'♗', R:'♜', r:'♖', Q:'♛', q:'♕'
  };

  const FILES = 'abcdefgh';
  const RANKS = '12345678';

  // ── Game State ─────────────────────────────────────────────────────────────
  let state = {
    squares: new Array(64).fill(null),
    turn: 'w',
    castling: { K: true, Q: true, k: true, q: true },
    ep: null,
    halfmove: 0,
    fullmove: 1,
    selected: null,
    legalMoves: [],
    lastMove: null,
    inCheck: false,
    gameOver: null,
    moveHistory: [],       // {from, to, piece, captured, san, fen, classification}
    undoStack: [],
    redoStack: [],
    captures: { w: [], b: [] },
    pgn: [],
    flipped: false,
    boardSize: 480,
    gameMode: 'pvai',      // 'pvai' | 'pvp'
    aiColor: 'b',
    currentHistoryIdx: -1,
    analysisMode: false,
  };

  // ── Canvas and DOM ─────────────────────────────────────────────────────────
  let canvas, piecesLayer, highlightsLayer;
  let squareSize = 60;
  let dragState = { active: false, piece: null, el: null, fromSq: -1, startX: 0, startY: 0 };

  // ── Callbacks ──────────────────────────────────────────────────────────────
  let onMove = null;
  let onGameOver = null;
  let onTurnChange = null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function sq(f, r) { return r * 8 + f; }
  function fileOf(i) { return i % 8; }
  function rankOf(i) { return (i / 8) | 0; }
  function notate(i) { return FILES[fileOf(i)] + RANKS[rankOf(i)]; }
  function parseSquare(s) { return sq(FILES.indexOf(s[0]), RANKS.indexOf(s[1])); }
  function isWhitePiece(p) { return p && p === p.toUpperCase(); }
  function isBlackPiece(p) { return p && p === p.toLowerCase(); }
  function isOwn(p, turn) { return turn === 'w' ? isWhitePiece(p) : isBlackPiece(p); }
  function isEnemy(p, turn) { return p && !isOwn(p, turn); }

  // ── FEN ───────────────────────────────────────────────────────────────────
  function parseFEN(fen) {
    const s = { squares: new Array(64).fill(null), turn: 'w',
                castling: { K:true,Q:true,k:true,q:true }, ep: null,
                halfmove:0, fullmove:1 };
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[7 - r]) {
        if (ch >= '1' && ch <= '8') f += parseInt(ch);
        else { s.squares[sq(f, r)] = ch; f++; }
      }
    }
    s.turn = parts[1] || 'w';
    const c = parts[2] || '-';
    s.castling = { K: c.includes('K'), Q: c.includes('Q'), k: c.includes('k'), q: c.includes('q') };
    s.ep = parts[3] && parts[3] !== '-' ? parseSquare(parts[3]) : null;
    s.halfmove = parseInt(parts[4] || 0);
    s.fullmove = parseInt(parts[5] || 1);
    return s;
  }

  function toFEN(s = state) {
    let fen = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = s.squares[sq(f, r)];
        if (p) { if (empty) { fen += empty; empty = 0; } fen += p; }
        else empty++;
      }
      if (empty) fen += empty;
      if (r > 0) fen += '/';
    }
    const c = ['K','Q','k','q'].filter(x => s.castling[x]).join('') || '-';
    const ep = s.ep !== null ? notate(s.ep) : '-';
    return `${fen} ${s.turn} ${c} ${ep} ${s.halfmove} ${s.fullmove}`;
  }

  const STARTFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // ── Move Generation ────────────────────────────────────────────────────────
  function genPseudoMoves(s) {
    const moves = [];
    const t = s.turn;

    function addMove(from, to, promo = null, flags = {}) {
      moves.push({ from, to, promo, flags: flags || {} });
    }
    function slide(from, df, dr) {
      let f = fileOf(from) + df, r = rankOf(from) + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const to = sq(f, r);
        if (isOwn(s.squares[to], t)) break;
        addMove(from, to);
        if (isEnemy(s.squares[to], t)) break;
        f += df; r += dr;
      }
    }

    for (let i = 0; i < 64; i++) {
      const p = s.squares[i];
      if (!isOwn(p, t)) continue;
      const pt = p.toLowerCase();
      const f = fileOf(i), r = rankOf(i);

      if (pt === 'p') {
        const dir = t === 'w' ? 1 : -1;
        const startR = t === 'w' ? 1 : 6;
        const promoR = t === 'w' ? 7 : 0;
        const nr = r + dir;
        if (nr >= 0 && nr < 8) {
          if (!s.squares[sq(f, nr)]) {
            if (nr === promoR) {
              ['Q','R','B','N'].forEach(pp => addMove(i, sq(f, nr), t === 'w' ? pp : pp.toLowerCase(), {promo:true}));
            } else {
              addMove(i, sq(f, nr));
              if (r === startR && !s.squares[sq(f, r + dir * 2)])
                addMove(i, sq(f, r + dir * 2), null, {doublePush: true});
            }
          }
          for (const df of [-1, 1]) {
            const nf = f + df;
            if (nf < 0 || nf >= 8) continue;
            const ts = sq(nf, nr);
            if (isEnemy(s.squares[ts], t) || ts === s.ep) {
              if (nr === promoR) {
                ['Q','R','B','N'].forEach(pp => addMove(i, ts, t === 'w' ? pp : pp.toLowerCase(), {capture:true, promo:true}));
              } else {
                addMove(i, ts, null, { capture: true, ep: ts === s.ep });
              }
            }
          }
        }
      } else if (pt === 'n') {
        for (const [df2,dr2] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
          const nf=f+df2, nr=r+dr2;
          if (nf>=0&&nf<8&&nr>=0&&nr<8) {
            const to=sq(nf,nr);
            if (!isOwn(s.squares[to],t)) addMove(i,to,null,{capture:!!s.squares[to]});
          }
        }
      } else if (pt === 'b') {
        [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([df2,dr2])=>slide(i,df2,dr2));
      } else if (pt === 'r') {
        [[-1,0],[1,0],[0,-1],[0,1]].forEach(([df2,dr2])=>slide(i,df2,dr2));
      } else if (pt === 'q') {
        [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([df2,dr2])=>slide(i,df2,dr2));
      } else if (pt === 'k') {
        for (const [df2,dr2] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
          const nf=f+df2, nr=r+dr2;
          if (nf>=0&&nf<8&&nr>=0&&nr<8) {
            const to=sq(nf,nr);
            if (!isOwn(s.squares[to],t)) addMove(i,to);
          }
        }
        // Castling
        if (t==='w'&&r===0&&f===4) {
          if (s.castling.K && !s.squares[sq(5,0)] && !s.squares[sq(6,0)])
            addMove(i,sq(6,0),null,{castle:'K'});
          if (s.castling.Q && !s.squares[sq(3,0)] && !s.squares[sq(2,0)] && !s.squares[sq(1,0)])
            addMove(i,sq(2,0),null,{castle:'Q'});
        } else if (t==='b'&&r===7&&f===4) {
          if (s.castling.k && !s.squares[sq(5,7)] && !s.squares[sq(6,7)])
            addMove(i,sq(6,7),null,{castle:'k'});
          if (s.castling.q && !s.squares[sq(3,7)] && !s.squares[sq(2,7)] && !s.squares[sq(1,7)])
            addMove(i,sq(2,7),null,{castle:'q'});
        }
      }
    }
    return moves;
  }

  function applyMoveToState(s, move) {
    const ns = {
      squares: [...s.squares],
      turn: s.turn,
      castling: { ...s.castling },
      ep: null,
      halfmove: s.halfmove,
      fullmove: s.fullmove
    };
    const p = ns.squares[move.from];
    const captured = ns.squares[move.to];
    ns.squares[move.to] = move.promo ? move.promo : p;
    ns.squares[move.from] = null;
    // En-passant capture
    if (p && p.toLowerCase() === 'p' && move.to === s.ep) {
      const dir = s.turn === 'w' ? -1 : 1;
      ns.squares[sq(fileOf(move.to), rankOf(move.to) + dir)] = null;
    }
    // Double pawn push → set ep
    if (move.flags && move.flags.doublePush)
      ns.ep = sq(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) / 2);
    // Castling rook
    if (p === 'K') {
      ns.castling.K = ns.castling.Q = false;
      if (move.to === sq(6,0)) { ns.squares[sq(5,0)]=ns.squares[sq(7,0)]; ns.squares[sq(7,0)]=null; }
      if (move.to === sq(2,0)) { ns.squares[sq(3,0)]=ns.squares[sq(0,0)]; ns.squares[sq(0,0)]=null; }
    } else if (p === 'k') {
      ns.castling.k = ns.castling.q = false;
      if (move.to === sq(6,7)) { ns.squares[sq(5,7)]=ns.squares[sq(7,7)]; ns.squares[sq(7,7)]=null; }
      if (move.to === sq(2,7)) { ns.squares[sq(3,7)]=ns.squares[sq(0,7)]; ns.squares[sq(0,7)]=null; }
    }
    if (p==='R'){ if(move.from===sq(7,0))ns.castling.K=false; if(move.from===sq(0,0))ns.castling.Q=false; }
    if (p==='r'){ if(move.from===sq(7,7))ns.castling.k=false; if(move.from===sq(0,7))ns.castling.q=false; }
    ns.halfmove = (p&&p.toLowerCase()==='p') || captured ? 0 : ns.halfmove + 1;
    if (ns.turn === 'b') ns.fullmove++;
    ns.turn = ns.turn === 'w' ? 'b' : 'w';
    return { newState: ns, captured };
  }

  function isSquareAttacked(squares, sqIdx, byColor) {
    // Check if sqIdx is attacked by byColor
    for (let i = 0; i < 64; i++) {
      const p = squares[i];
      if (!p) continue;
      const isW = p === p.toUpperCase();
      if (byColor === 'w' && !isW) continue;
      if (byColor === 'b' && isW) continue;
      const pt = p.toLowerCase();
      const f = fileOf(i), r = rankOf(i);
      const tf = fileOf(sqIdx), tr = rankOf(sqIdx);
      const df = tf - f, dr = tr - r;

      if (pt === 'p') {
        const dir = isW ? 1 : -1;
        if (dr === dir && Math.abs(df) === 1) return true;
      } else if (pt === 'n') {
        if ((Math.abs(df)===2&&Math.abs(dr)===1)||(Math.abs(df)===1&&Math.abs(dr)===2)) return true;
      } else if (pt === 'b') {
        if (Math.abs(df)===Math.abs(dr)&&df!==0) {
          let clear=true;
          const sf=df>0?1:-1,sr=dr>0?1:-1;
          for(let s=1;s<Math.abs(df);s++)
            if(squares[sq(f+s*sf,r+s*sr)]){clear=false;break;}
          if(clear) return true;
        }
      } else if (pt === 'r') {
        if ((df===0||dr===0)&&!(df===0&&dr===0)) {
          let clear=true;
          const sf=df===0?0:(df>0?1:-1),sr=dr===0?0:(dr>0?1:-1);
          const steps=Math.abs(df||dr);
          for(let s=1;s<steps;s++)
            if(squares[sq(f+s*sf,r+s*sr)]){clear=false;break;}
          if(clear) return true;
        }
      } else if (pt === 'q') {
        const straight=(df===0||dr===0)&&!(df===0&&dr===0);
        const diag=Math.abs(df)===Math.abs(dr)&&df!==0;
        if(straight||diag){
          let clear=true;
          const sf=df===0?0:(df>0?1:-1),sr=dr===0?0:(dr>0?1:-1);
          const steps=straight?Math.abs(df||dr):Math.abs(df);
          for(let s=1;s<steps;s++)
            if(squares[sq(f+s*sf,r+s*sr)]){clear=false;break;}
          if(clear) return true;
        }
      } else if (pt === 'k') {
        if (Math.abs(df)<=1&&Math.abs(dr)<=1) return true;
      }
    }
    return false;
  }

  function isInCheck(s, color) {
    let kingPos = -1;
    for (let i = 0; i < 64; i++) {
      if (s.squares[i] === (color==='w'?'K':'k')) { kingPos = i; break; }
    }
    if (kingPos < 0) return true;
    return isSquareAttacked(s.squares, kingPos, color==='w'?'b':'w');
  }

  function getLegalMoves(s) {
    return genPseudoMoves(s).filter(m => {
      // Castling: ensure king not in check and doesn't pass through check
      if (m.flags && m.flags.castle) {
        const castle = m.flags.castle;
        if (isInCheck(s, s.turn)) return false;
        const passThrough = castle==='K'?sq(5,0):castle==='Q'?sq(3,0):castle==='k'?sq(5,7):sq(3,7);
        const tmpS = { ...s, squares: [...s.squares] };
        if (isSquareAttacked(tmpS.squares, passThrough, s.turn==='w'?'b':'w')) return false;
      }
      const { newState } = applyMoveToState(s, m);
      return !isInCheck(newState, s.turn);
    });
  }

  // ── SAN Notation ──────────────────────────────────────────────────────────
  function toSAN(s, move, allLegal) {
    const p = s.squares[move.from];
    const pt = p.toLowerCase();
    const captured = s.squares[move.to] || (move.flags && move.flags.ep ? 'x' : null);
    let san = '';

    if (move.flags && move.flags.castle) {
      san = move.flags.castle === 'K' || move.flags.castle === 'k' ? 'O-O' : 'O-O-O';
    } else {
      if (pt !== 'p') san += p.toUpperCase();
      // Disambiguation
      if (pt !== 'p') {
        const ambiguous = allLegal.filter(m => m !== move && s.squares[m.from] === p && m.to === move.to);
        if (ambiguous.length) {
          const sameFile = ambiguous.some(m => fileOf(m.from) === fileOf(move.from));
          const sameRank = ambiguous.some(m => rankOf(m.from) === rankOf(move.from));
          if (!sameFile) san += FILES[fileOf(move.from)];
          else if (!sameRank) san += RANKS[rankOf(move.from)];
          else san += notate(move.from);
        }
      }
      if (captured) {
        if (pt === 'p') san += FILES[fileOf(move.from)];
        san += 'x';
      }
      san += notate(move.to);
      if (move.promo) san += '=' + (move.promo.toUpperCase());
    }

    // Check/checkmate
    const { newState } = applyMoveToState(s, move);
    const nextTurn = newState.turn;
    const nextLegal = getLegalMoves(newState);
    if (isInCheck(newState, nextTurn)) {
      san += nextLegal.length === 0 ? '#' : '+';
    }
    return san;
  }

  // ── Execute Move ──────────────────────────────────────────────────────────
  function executeMove(fromSq, toSq, promotion = null) {
    if (state.gameOver) return false;

    const legalMoves = getLegalMoves(state);
    const move = legalMoves.find(m =>
      m.from === fromSq && m.to === toSq &&
      (!m.promo || m.promo === promotion || !promotion)
    );
    if (!move) return false;

    // Promotion check
    const piece = state.squares[fromSq];
    const promoRank = state.turn === 'w' ? 7 : 0;
    if (piece && piece.toLowerCase() === 'p' && rankOf(toSq) === promoRank && !move.promo) {
      return 'needs_promo';
    }

    const actualMove = promotion ? { ...move, promo: state.turn === 'w' ? promotion.toUpperCase() : promotion.toLowerCase() } : move;

    // Save FEN before move for analysis
    const fenBefore = toFEN(state);
    const san = toSAN(state, actualMove, legalMoves);
    const capturedPiece = state.squares[toSq];

    // Save for undo
    state.undoStack.push({
      squares: [...state.squares],
      turn: state.turn,
      castling: { ...state.castling },
      ep: state.ep,
      halfmove: state.halfmove,
      fullmove: state.fullmove,
      captures: { w: [...state.captures.w], b: [...state.captures.b] },
      lastMove: state.lastMove,
    });
    state.redoStack = [];

    const { newState, captured } = applyMoveToState(state, actualMove);
    Object.assign(state, newState);

    state.lastMove = { from: fromSq, to: toSq };
    state.selected = null;
    state.legalMoves = [];

    if (captured) {
      state.captures[state.turn === 'w' ? 'b' : 'w'].push(captured);
    }

    // Check status
    const nextLegal = getLegalMoves(state);
    state.inCheck = isInCheck(state, state.turn);

    const histEntry = {
      from: fromSq, to: toSq,
      piece: piece,
      captured: capturedPiece,
      san,
      fen: fenBefore,
      promo: actualMove.promo || null,
      classification: null
    };
    state.moveHistory.push(histEntry);
    state.currentHistoryIdx = state.moveHistory.length - 1;

    // Game over check
    if (nextLegal.length === 0) {
      if (state.inCheck) {
        state.gameOver = { type: 'checkmate', winner: state.turn === 'w' ? 'b' : 'w' };
      } else {
        state.gameOver = { type: 'stalemate' };
      }
    } else if (state.halfmove >= 100) {
      state.gameOver = { type: 'draw', reason: '50-move rule' };
    }

    renderBoard();
    if (onMove) onMove({ move: actualMove, san, histEntry, state });
    if (state.gameOver && onGameOver) onGameOver(state.gameOver);

    return true;
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  function undo() {
    if (!state.undoStack.length) return false;
    const prev = state.undoStack.pop();
    state.redoStack.push({
      squares: [...state.squares],
      turn: state.turn,
      castling: { ...state.castling },
      ep: state.ep,
      halfmove: state.halfmove,
      fullmove: state.fullmove,
      captures: { w: [...state.captures.w], b: [...state.captures.b] },
      lastMove: state.lastMove,
    });
    Object.assign(state, prev);
    state.moveHistory.pop();
    state.currentHistoryIdx = state.moveHistory.length - 1;
    state.selected = null;
    state.legalMoves = [];
    state.gameOver = null;
    renderBoard();
    if (onTurnChange) onTurnChange(state.turn);
    return true;
  }

  function redo() {
    if (!state.redoStack.length) return false;
    const next = state.redoStack.pop();
    state.undoStack.push({
      squares: [...state.squares],
      turn: state.turn,
      castling: { ...state.castling },
      ep: state.ep,
      halfmove: state.halfmove,
      fullmove: state.fullmove,
      captures: { w: [...state.captures.w], b: [...state.captures.b] },
      lastMove: state.lastMove,
    });
    Object.assign(state, next);
    renderBoard();
    if (onTurnChange) onTurnChange(state.turn);
    return true;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function initDOM() {
    canvas = document.getElementById('board-canvas');
    piecesLayer = document.getElementById('pieces-layer');
    highlightsLayer = document.getElementById('highlights-layer');

    resizeBoard();
    window.addEventListener('resize', () => {
      resizeBoard();
      renderBoard();
    });

    piecesLayer.addEventListener('mousedown', onPieceMouseDown);
    piecesLayer.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }

  function resizeBoard() {
    const container = document.getElementById('board-wrap');
    if (!container) return;
    const playerCards = document.querySelectorAll('.player-card');
    const leftPanel = document.getElementById('left-panel');
    if (!leftPanel) return;

    const panelH = leftPanel.clientHeight;
    const cardsH = Array.from(playerCards).reduce((a, c) => a + c.offsetHeight, 0);
    const evalH = 30;
    const gap = 32;
    const avail = Math.min(panelH - cardsH - evalH - gap, leftPanel.clientWidth);
    squareSize = Math.max(40, Math.floor((avail > 0 ? avail : 480) / 8));
    const total = squareSize * 8;
    state.boardSize = total;

    canvas.width = total;
    canvas.height = total;
    canvas.style.width = total + 'px';
    canvas.style.height = total + 'px';

    const boardContainer = document.getElementById('board-container');
    boardContainer.style.width = total + 'px';
    boardContainer.style.height = total + 'px';
  }

  function drawBoard() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const sz = squareSize;

    for (let r = 7; r >= 0; r--) {
      for (let f = 0; f < 8; f++) {
        const dr = state.flipped ? 7 - r : r;
        const df = state.flipped ? 7 - f : f;
        const x = df * sz;
        const y = (7 - dr) * sz;
        const isLight = (f + r) % 2 === 0;

        // Base square
        if (isLight) {
          ctx.fillStyle = '#d4bfaa';
        } else {
          ctx.fillStyle = '#5c4a3a';
        }
        ctx.fillRect(x, y, sz, sz);

        // Inner shadow (depth effect)
        if (!isLight) {
          const grad = ctx.createLinearGradient(x, y, x + sz, y + sz);
          grad.addColorStop(0, 'rgba(0,0,0,0.1)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, sz, sz);
        } else {
          const grad = ctx.createLinearGradient(x, y, x + sz, y + sz);
          grad.addColorStop(0, 'rgba(255,255,255,0.08)');
          grad.addColorStop(1, 'rgba(0,0,0,0.05)');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, sz, sz);
        }
      }
    }

    // Border glow
    ctx.strokeStyle = 'rgba(200,169,110,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, sz * 8, sz * 8);
  }

  function renderHighlights() {
    highlightsLayer.innerHTML = '';
    const sz = squareSize;

    function addHL(sqIdx, cls) {
      const f = fileOf(sqIdx);
      const r = rankOf(sqIdx);
      const df = state.flipped ? 7 - f : f;
      const dr = state.flipped ? r : 7 - r;
      const el = document.createElement('div');
      el.className = `sq-highlight ${cls}`;
      el.style.cssText = `left:${df*sz}px;top:${dr*sz}px;width:${sz}px;height:${sz}px;`;
      highlightsLayer.appendChild(el);
    }

    // Last move
    if (state.lastMove) {
      addHL(state.lastMove.from, 'last-move');
      addHL(state.lastMove.to, 'last-move');
    }

    // Selected
    if (state.selected !== null) addHL(state.selected, 'selected');

    // Legal moves
    state.legalMoves.forEach(m => {
      const hasEnemy = state.squares[m.to] || m.to === state.ep;
      addHL(m.to, hasEnemy ? 'legal-capture' : 'legal');
    });

    // Check
    if (state.inCheck) {
      const kingPiece = state.turn === 'w' ? 'K' : 'k';
      for (let i = 0; i < 64; i++) {
        if (state.squares[i] === kingPiece) { addHL(i, 'check'); break; }
      }
    }
  }

  function renderPieces() {
    piecesLayer.innerHTML = '';
    const sz = squareSize;

    for (let i = 0; i < 64; i++) {
      const p = state.squares[i];
      if (!p) continue;
      const f = fileOf(i);
      const r = rankOf(i);
      const df = state.flipped ? 7 - f : f;
      const dr = state.flipped ? r : 7 - r;
      const x = df * sz;
      const y = (7 - dr) * sz - Math.floor(sz * 0.1);

      const el = document.createElement('div');
      el.className = `piece ${isWhitePiece(p) ? 'white-piece' : 'black-piece'}`;
      el.dataset.sq = i;
      el.dataset.piece = p;
      el.style.cssText = `
        left:${x}px;
        top:${y + Math.floor(sz * 0.05)}px;
        width:${sz}px;
        height:${sz}px;
        font-size:${Math.floor(sz * 0.78)}px;
        line-height:${sz}px;
        text-align:center;
      `;

      // Piece shadow and coloring
      const isW = isWhitePiece(p);
      el.style.textShadow = isW
        ? `0 1px 3px rgba(0,0,0,0.6), 0 0 8px rgba(255,255,255,0.1)`
        : `0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.4)`;
      el.style.filter = isW
        ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))'
        : 'drop-shadow(0 2px 4px rgba(0,0,0,0.6)) brightness(0.9)';

      if (state.inCheck && p === (state.turn === 'w' ? 'K' : 'k')) {
        el.classList.add('in-check');
      }

      el.textContent = PIECE_UNICODE[p] || p;
      piecesLayer.appendChild(el);
    }

    renderCoords();
  }

  function renderCoords() {
    const filesEl = document.getElementById('board-coords-files');
    const ranksEl = document.getElementById('board-coords-ranks');
    if (!filesEl || !ranksEl) return;
    filesEl.innerHTML = '';
    ranksEl.innerHTML = '';
    const fileLabels = state.flipped ? 'hgfedcba' : 'abcdefgh';
    const rankLabels = state.flipped ? '12345678' : '87654321';
    fileLabels.split('').forEach(l => {
      const s = document.createElement('span');
      s.textContent = l;
      filesEl.appendChild(s);
    });
    rankLabels.split('').forEach(l => {
      const s = document.createElement('span');
      s.textContent = l;
      ranksEl.appendChild(s);
    });
  }

  function renderBoard() {
    drawBoard();
    renderHighlights();
    renderPieces();
  }

  // ── Mouse / Touch Interaction ──────────────────────────────────────────────
  function getSquareFromPos(clientX, clientY) {
    const container = document.getElementById('board-container');
    if (!container) return -1;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x >= squareSize * 8 || y >= squareSize * 8) return -1;
    const f = Math.floor(x / squareSize);
    const r = 7 - Math.floor(y / squareSize);
    const af = state.flipped ? 7 - f : f;
    const ar = state.flipped ? 7 - r : r;
    return sq(af, ar);
  }

  function handleSquareClick(sqIdx) {
    if (state.gameOver || state.analysisMode) return;
    const piece = state.squares[sqIdx];
    const isOwnPiece = isOwn(piece, state.turn);

    if (state.selected !== null) {
      // Try to move
      if (sqIdx === state.selected) {
        state.selected = null;
        state.legalMoves = [];
        renderHighlights();
        return;
      }
      const lm = state.legalMoves.find(m => m.to === sqIdx);
      if (lm) {
        // Check promo
        const p = state.squares[state.selected];
        if (p && p.toLowerCase() === 'p' && rankOf(sqIdx) === (state.turn === 'w' ? 7 : 0)) {
          showPromoModal(state.selected, sqIdx, state.turn);
          return;
        }
        executeMove(state.selected, sqIdx);
        return;
      }
      // Re-select another own piece
      if (isOwnPiece) {
        state.selected = sqIdx;
        state.legalMoves = getLegalMoves(state).filter(m => m.from === sqIdx);
        renderHighlights();
        return;
      }
      state.selected = null;
      state.legalMoves = [];
      renderHighlights();
      return;
    }

    if (isOwnPiece) {
      state.selected = sqIdx;
      state.legalMoves = getLegalMoves(state).filter(m => m.from === sqIdx);
      renderHighlights();
    }
  }

  function onPieceMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const sqIdx = getSquareFromPos(e.clientX, e.clientY);
    if (sqIdx < 0) return;
    const piece = state.squares[sqIdx];
    if (!piece) { handleSquareClick(sqIdx); return; }
    if (!isOwn(piece, state.turn) || state.gameOver) {
      handleSquareClick(sqIdx);
      return;
    }
    // Start drag
    state.selected = sqIdx;
    state.legalMoves = getLegalMoves(state).filter(m => m.from === sqIdx);
    renderHighlights();

    const el = [...piecesLayer.children].find(el => parseInt(el.dataset.sq) === sqIdx);
    if (!el) return;
    dragState = { active: true, piece: piece, el, fromSq: sqIdx, startX: e.clientX, startY: e.clientY };
    el.classList.add('dragging');
    el.style.zIndex = 100;
    moveDragPiece(e.clientX, e.clientY);
  }

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    onPieceMouseDown({ button: 0, clientX: t.clientX, clientY: t.clientY, preventDefault: () => {} });
  }

  function moveDragPiece(clientX, clientY) {
    if (!dragState.active || !dragState.el) return;
    const container = document.getElementById('board-container');
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left - squareSize / 2;
    const y = clientY - rect.top - squareSize / 2;
    dragState.el.style.left = x + 'px';
    dragState.el.style.top = y + 'px';
  }

  function onMouseMove(e) {
    if (!dragState.active) return;
    moveDragPiece(e.clientX, e.clientY);
  }

  function onTouchMove(e) {
    if (!dragState.active) return;
    e.preventDefault();
    moveDragPiece(e.touches[0].clientX, e.touches[0].clientY);
  }

  function onMouseUp(e) {
    if (!dragState.active) return;
    const sqIdx = getSquareFromPos(e.clientX, e.clientY);
    endDrag(sqIdx);
  }

  function onTouchEnd(e) {
    if (!dragState.active) return;
    const t = e.changedTouches[0];
    const sqIdx = getSquareFromPos(t.clientX, t.clientY);
    endDrag(sqIdx);
  }

  function endDrag(sqIdx) {
    if (!dragState.active) return;
    dragState.active = false;
    if (dragState.el) {
      dragState.el.classList.remove('dragging');
      dragState.el.style.zIndex = '';
    }
    if (sqIdx >= 0 && sqIdx !== dragState.fromSq) {
      const p = state.squares[dragState.fromSq];
      if (p && p.toLowerCase() === 'p' && rankOf(sqIdx) === (state.turn === 'w' ? 7 : 0)) {
        showPromoModal(dragState.fromSq, sqIdx, state.turn);
      } else {
        executeMove(dragState.fromSq, sqIdx);
      }
    } else {
      renderPieces();
    }
    dragState = { active: false };
  }

  // ── Promotion Modal ────────────────────────────────────────────────────────
  let pendingPromo = null;
  function showPromoModal(fromSq, toSq, color) {
    pendingPromo = { fromSq, toSq, color };
    const modal = document.getElementById('promo-modal');
    const container = document.getElementById('promo-pieces');
    container.innerHTML = '';
    const pieces = color === 'w' ? ['Q','R','B','N'] : ['q','r','b','n'];
    pieces.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'promo-piece-btn';
      btn.textContent = PIECE_UNICODE[p];
      btn.addEventListener('click', () => {
        modal.classList.add('hidden');
        executeMove(pendingPromo.fromSq, pendingPromo.toSq, p.toUpperCase());
        pendingPromo = null;
      });
      container.appendChild(btn);
    });
    modal.classList.remove('hidden');
  }

  // ── PGN ───────────────────────────────────────────────────────────────────
  function generatePGN(gameInfo = {}) {
    const date = new Date().toISOString().split('T')[0].replace(/-/g,'.');
    let pgn = '';
    pgn += `[Event "${gameInfo.event || 'Regis Chess'}"]\n`;
    pgn += `[Site "Regis Chess Engine"]\n`;
    pgn += `[Date "${date}"]\n`;
    pgn += `[White "${gameInfo.white || 'Player'}"]\n`;
    pgn += `[Black "${gameInfo.black || (state.gameMode === 'pvai' ? 'Stockfish' : 'Player 2')}"]\n`;
    pgn += `[Result "${getResult()}"]\n\n`;

    state.moveHistory.forEach((h, idx) => {
      if (idx % 2 === 0) pgn += `${Math.floor(idx/2)+1}. `;
      pgn += h.san + ' ';
    });
    pgn += getResult();
    return pgn;
  }

  function getResult() {
    if (!state.gameOver) return '*';
    if (state.gameOver.type === 'checkmate') return state.gameOver.winner === 'w' ? '1-0' : '0-1';
    return '1/2-1/2';
  }

  // ── New Game ──────────────────────────────────────────────────────────────
  function newGame(options = {}) {
    const startState = parseFEN(STARTFEN);
    Object.assign(state, startState, {
      selected: null, legalMoves: [], lastMove: null,
      inCheck: false, gameOver: null,
      moveHistory: [], undoStack: [], redoStack: [],
      captures: { w: [], b: [] }, pgn: [],
      flipped: options.flipped || false,
      gameMode: options.mode || 'pvai',
      aiColor: options.aiColor || 'b',
      analysisMode: false,
      currentHistoryIdx: -1,
    });
    renderBoard();
  }

  function flipBoard() {
    state.flipped = !state.flipped;
    renderBoard();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    init(callbacks = {}) {
      initDOM();
      onMove = callbacks.onMove;
      onGameOver = callbacks.onGameOver;
      onTurnChange = callbacks.onTurnChange;
      newGame();
    },
    newGame,
    flipBoard,
    executeMove,
    undo, redo,
    getLegalMoves: () => getLegalMoves(state),
    getState: () => state,
    getFEN: () => toFEN(state),
    generatePGN,
    parseFEN,
    isInCheck: (color) => isInCheck(state, color),
    setAnalysisMode(on) { state.analysisMode = on; },
    PIECE_UNICODE,
    renderBoard,
    resizeBoard,
    setClassification(idx, cls) {
      if (state.moveHistory[idx]) state.moveHistory[idx].classification = cls;
    }
  };

})();

window.Board = Board;
