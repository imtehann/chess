/* board.js — Chess board rendering, interaction, and game logic */

const Board = (() => {

  /* ── Internal state ──────────────────────────────────────── */
  let chess        = null;
  let selectedSq   = null;
  let legalMoves   = [];
  let lastMove     = { from: null, to: null };
  let flipped      = false;
  let dragging     = null;
  let onMoveCallback   = null;
  let onSelectCallback = null;

  const PIECE_UNICODE = {
    wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
    bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟'
  };

  const FILES = ['a','b','c','d','e','f','g','h'];
  const RANKS = ['8','7','6','5','4','3','2','1'];

  /* ── Init ────────────────────────────────────────────────── */
  function init(moveCallback, selectCallback) {
    chess = new Chess();
    onMoveCallback   = moveCallback;
    onSelectCallback = selectCallback;
    buildBoardDOM();
    buildCoords();
    render();
    return chess;
  }

  function reset() {
    chess.reset();
    selectedSq = null;
    legalMoves = [];
    lastMove   = { from: null, to: null };
    render();
  }

  /* ── DOM construction ─────────────────────────────────────── */
  function buildBoardDOM() {
    const board = document.getElementById('chessboard');
    board.innerHTML = '';

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = document.createElement('div');
        const file = f;
        const rank = r;

        const squareName = FILES[flipped ? 7-file : file] + RANKS[flipped ? 7-rank : rank];
        sq.className = 'square ' + ((r + f) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.square = squareName;
        sq.dataset.row = r;
        sq.dataset.col = f;

        sq.addEventListener('click', () => handleSquareClick(squareName));
        sq.addEventListener('dragover', e => { e.preventDefault(); });
        sq.addEventListener('drop', e => { e.preventDefault(); handleDrop(squareName); });

        board.appendChild(sq);
      }
    }

    // Drag ghost element
    if (!document.getElementById('drag-ghost')) {
      const ghost = document.createElement('div');
      ghost.id = 'drag-ghost';
      document.body.appendChild(ghost);
    }
  }

  function buildCoords() {
    const top    = document.getElementById('coord-top');
    const bottom = document.getElementById('coord-bottom');
    const left   = document.getElementById('coord-left');
    const right  = document.getElementById('coord-right');
    if (!top) return;

    [top, bottom].forEach(row => {
      row.innerHTML = '';
      const files = flipped ? [...FILES].reverse() : FILES;
      files.forEach(f => {
        const c = document.createElement('div');
        c.className = 'coord-cell';
        c.textContent = f;
        row.appendChild(c);
      });
    });

    [left, right].forEach(col => {
      col.innerHTML = '';
      const ranks = flipped ? [...RANKS].reverse() : RANKS;
      ranks.forEach(rank => {
        const c = document.createElement('div');
        c.className = 'coord-cell rank-coord';
        c.textContent = rank;
        col.appendChild(c);
      });
    });
  }

  /* ── Render ───────────────────────────────────────────────── */
  function render() {
    const board = document.getElementById('chessboard');
    if (!board) return;

    const squares = board.querySelectorAll('.square');
    const checkSq = getCheckSquare();

    squares.forEach(sq => {
      const name = sq.dataset.square;
      const piece = chess.get(name);

      // Clear
      sq.innerHTML = '';
      sq.classList.remove('selected', 'last-move', 'in-check');

      // Last move highlight
      if (name === lastMove.from || name === lastMove.to) {
        sq.classList.add('last-move');
      }

      // Check highlight
      if (name === checkSq) {
        sq.classList.add('in-check');
      }

      // Selection highlight
      if (name === selectedSq) {
        sq.classList.add('selected');
      }

      // Piece
      if (piece) {
        const el = document.createElement('div');
        const key = piece.color + piece.type.toUpperCase();
        el.className = 'piece ' + (piece.color === 'w' ? 'white-piece' : 'black-piece');
        el.textContent = PIECE_UNICODE[key] || '?';
        el.dataset.piece = key;
        el.dataset.square = name;
        el.setAttribute('draggable', true);

        el.addEventListener('dragstart', e => handleDragStart(e, name));
        el.addEventListener('dragend',   () => handleDragEnd());
        el.addEventListener('mousedown', e => handleMouseDown(e, name));

        sq.appendChild(el);
      }

      // Legal move hints
      const isLegal = legalMoves.find(m => m.to === name);
      if (isLegal) {
        const hint = document.createElement('div');
        hint.className = 'move-hint';
        const dot = document.createElement('div');
        dot.className = piece ? 'move-hint-capture' : 'move-hint-dot';
        hint.appendChild(dot);
        sq.appendChild(hint);
      }
    });
  }

  /* ── Click to move ────────────────────────────────────────── */
  function handleSquareClick(squareName) {
    if (chess.game_over()) return;

    const piece = chess.get(squareName);
    const turn  = chess.turn();

    // If a legal destination is clicked
    if (selectedSq && legalMoves.find(m => m.to === squareName)) {
      attemptMove(selectedSq, squareName);
      return;
    }

    // Select a piece of the current player
    if (piece && piece.color === turn) {
      selectedSq = squareName;
      legalMoves = chess.moves({ square: squareName, verbose: true });
      render();
      if (onSelectCallback) onSelectCallback(squareName, legalMoves);
      return;
    }

    // Deselect
    selectedSq = null;
    legalMoves = [];
    render();
  }

  /* ── Attempt Move ─────────────────────────────────────────── */
  function attemptMove(from, to, promotion) {
    const moves = chess.moves({ square: from, verbose: true });
    const move  = moves.find(m => m.to === to);
    if (!move) return false;

    // Handle promotion
    if (move.flags.includes('p') && !promotion) {
      UI.showPromotion(chess.turn(), (promo) => {
        attemptMove(from, to, promo);
      });
      return false;
    }

    const result = chess.move({ from, to, promotion: promotion || 'q' });
    if (!result) return false;

    lastMove   = { from, to };
    selectedSq = null;
    legalMoves = [];

    render();

    if (onMoveCallback) onMoveCallback(result, chess);
    return true;
  }

  /* ── Drag and drop ────────────────────────────────────────── */
  function handleDragStart(e, squareName) {
    const piece = chess.get(squareName);
    if (!piece || piece.color !== chess.turn()) { e.preventDefault(); return; }

    dragging = squareName;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(new Image(), 0, 0);

    const ghost = document.getElementById('drag-ghost');
    const key   = piece.color + piece.type.toUpperCase();
    ghost.textContent = PIECE_UNICODE[key] || '?';
    ghost.className   = 'piece ' + (piece.color === 'w' ? 'white-piece' : 'black-piece');
    ghost.style.display = 'block';
    ghost.style.left = e.clientX + 'px';
    ghost.style.top  = e.clientY + 'px';

    // Select the square
    selectedSq = squareName;
    legalMoves = chess.moves({ square: squareName, verbose: true });
    render();

    // Track mouse for ghost
    document.addEventListener('dragover', updateGhost, { passive: true });
  }

  function updateGhost(e) {
    const ghost = document.getElementById('drag-ghost');
    ghost.style.left = e.clientX + 'px';
    ghost.style.top  = e.clientY + 'px';
  }

  function handleDragEnd() {
    const ghost = document.getElementById('drag-ghost');
    ghost.style.display = 'none';
    document.removeEventListener('dragover', updateGhost);
    dragging = null;
  }

  function handleDrop(toSquare) {
    if (!dragging) return;
    attemptMove(dragging, toSquare);
    dragging = null;
  }

  function handleMouseDown(e, squareName) {
    // Touch device fallback click
    if (e.button !== 0) return;
  }

  /* ── Helpers ──────────────────────────────────────────────── */
  function getCheckSquare() {
    if (!chess.in_check()) return null;
    const turn = chess.turn();
    // Find king position
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === 'k' && p.color === turn) {
          return FILES[f] + (8 - r);
        }
      }
    }
    return null;
  }

  function getMaterialBalance() {
    const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const captured = { w: [], b: [] };
    const initial  = { p:8, n:2, b:2, r:2, q:1 };
    const counts   = { w:{p:0,n:0,b:0,r:0,q:0}, b:{p:0,n:0,b:0,r:0,q:0} };

    chess.board().flat().filter(Boolean).forEach(p => {
      if (counts[p.color][p.type] !== undefined) counts[p.color][p.type]++;
    });

    let wScore = 0, bScore = 0;
    const PIECE_SYM = { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛' };
    const PIECE_SYM_W = { p:'♙', n:'♘', b:'♗', r:'♖', q:'♕' };

    ['p','n','b','r','q'].forEach(type => {
      const lost_w = initial[type] - counts['w'][type];
      const lost_b = initial[type] - counts['b'][type];
      for (let i = 0; i < lost_w; i++) captured['b'].push(PIECE_SYM_W[type]);
      for (let i = 0; i < lost_b; i++) captured['w'].push(PIECE_SYM[type]);
      wScore += lost_b * VALUES[type];
      bScore += lost_w * VALUES[type];
    });

    return {
      whiteCaptured: captured['w'].join(''),
      blackCaptured: captured['b'].join(''),
      whiteAdvantage: wScore - bScore
    };
  }

  /* ── Public API ───────────────────────────────────────────── */
  function flipBoard() {
    flipped = !flipped;
    buildBoardDOM();
    buildCoords();
    render();
  }

  function getChess()    { return chess; }
  function getFen()      { return chess.fen(); }
  function getPgn()      { return chess.pgn(); }
  function isFlipped()   { return flipped; }
  function getTurn()     { return chess.turn(); }
  function isGameOver()  { return chess.game_over(); }

  function loadFen(fen) {
    chess.load(fen);
    selectedSq = null;
    legalMoves = [];
    render();
  }

  function loadPgn(pgn) {
    chess.load_pgn(pgn);
    selectedSq = null;
    legalMoves = [];
    // Recover last move
    const history = chess.history({ verbose: true });
    if (history.length) {
      const last = history[history.length - 1];
      lastMove = { from: last.from, to: last.to };
    }
    render();
  }

  function highlightLastMove(from, to) {
    lastMove = { from, to };
    render();
  }

  function animatePieceMove(fromSq, toSq, callback) {
    const fromEl = document.querySelector(`[data-square="${fromSq}"] .piece`);
    if (fromEl) fromEl.classList.add('bloom-flash');
    if (callback) setTimeout(callback, 250);
  }

  return {
    init,
    reset,
    render,
    flipBoard,
    getChess,
    getFen,
    getPgn,
    getTurn,
    isGameOver,
    isFlipped,
    loadFen,
    loadPgn,
    attemptMove,
    highlightLastMove,
    getMaterialBalance,
    animatePieceMove,
    PIECE_UNICODE,
    get lastMove() { return lastMove; }
  };

})();
