/**
 * engine.js — Chess logic + Stockfish integration
 * Regicide Chess
 */

'use strict';

/* ================================================================
   CHESS LOGIC ENGINE
   A complete, self-contained chess rules implementation
   ================================================================ */

const ChessEngine = (() => {

  // Piece codes: uppercase = white, lowercase = black
  // K=king, Q=queen, R=rook, B=bishop, N=knight, P=pawn
  const EMPTY = null;

  // Initial board position
  function initialBoard() {
    return [
      ['r','n','b','q','k','b','n','r'],
      ['p','p','p','p','p','p','p','p'],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ['P','P','P','P','P','P','P','P'],
      ['R','N','B','Q','K','B','N','R'],
    ];
  }

  function deepCopyBoard(board) {
    return board.map(r => [...r]);
  }

  function isWhite(p) { return p && p === p.toUpperCase(); }
  function isBlack(p) { return p && p === p.toLowerCase(); }
  function color(p) { return p ? (isWhite(p) ? 'white' : 'black') : null; }
  function opponent(c) { return c === 'white' ? 'black' : 'white'; }
  function pieceOf(p) { return p ? p.toLowerCase() : null; }

  // All squares attacked by color (without check validation)
  function attackedSquares(board, col) {
    const attacks = new Set();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && color(p) === col) {
          rawMoves(board, r, f, col, null).forEach(([tr, tf]) => attacks.add(`${tr},${tf}`));
        }
      }
    }
    return attacks;
  }

  function inCheck(board, col) {
    // Find king
    let kr = -1, kf = -1;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && color(p) === col && pieceOf(p) === 'k') { kr = r; kf = f; }
      }
    }
    if (kr === -1) return false;
    const opp = opponent(col);
    const attacked = attackedSquares(board, opp);
    return attacked.has(`${kr},${kf}`);
  }

  // Raw moves (ignores check)
  function rawMoves(board, r, f, col, state) {
    const p = board[r][f];
    if (!p) return [];
    const pt = pieceOf(p);
    const moves = [];
    const opp = opponent(col);

    const add = (tr, tf) => {
      if (tr < 0 || tr > 7 || tf < 0 || tf > 7) return;
      const t = board[tr][tf];
      if (t && color(t) === col) return;
      moves.push([tr, tf]);
    };

    const slide = (drs, dfs) => {
      for (let i = 0; i < drs.length; i++) {
        let nr = r + drs[i], nf = f + dfs[i];
        while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
          const t = board[nr][nf];
          if (t) { if (color(t) === opp) moves.push([nr, nf]); break; }
          moves.push([nr, nf]);
          nr += drs[i]; nf += dfs[i];
        }
      }
    };

    if (pt === 'r') { slide([-1,1,0,0],[0,0,-1,1]); }
    else if (pt === 'b') { slide([-1,-1,1,1],[-1,1,-1,1]); }
    else if (pt === 'q') { slide([-1,1,0,0,-1,-1,1,1],[0,0,-1,1,-1,1,-1,1]); }
    else if (pt === 'n') {
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,df]) => add(r+dr, f+df));
    }
    else if (pt === 'k') {
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,df]) => add(r+dr, f+df));
      // Castling (using state.castling)
      if (state) {
        const cs = state.castling;
        if (col === 'white' && r === 7 && f === 4) {
          if (cs.whiteKingSide && !board[7][5] && !board[7][6]) {
            const attacked = attackedSquares(board, opp);
            if (!attacked.has('7,4') && !attacked.has('7,5') && !attacked.has('7,6'))
              moves.push([7, 6, 'castleK']);
          }
          if (cs.whiteQueenSide && !board[7][3] && !board[7][2] && !board[7][1]) {
            const attacked = attackedSquares(board, opp);
            if (!attacked.has('7,4') && !attacked.has('7,3') && !attacked.has('7,2'))
              moves.push([7, 2, 'castleQ']);
          }
        }
        if (col === 'black' && r === 0 && f === 4) {
          if (cs.blackKingSide && !board[0][5] && !board[0][6]) {
            const attacked = attackedSquares(board, opp);
            if (!attacked.has('0,4') && !attacked.has('0,5') && !attacked.has('0,6'))
              moves.push([0, 6, 'castleK']);
          }
          if (cs.blackQueenSide && !board[0][3] && !board[0][2] && !board[0][1]) {
            const attacked = attackedSquares(board, opp);
            if (!attacked.has('0,4') && !attacked.has('0,3') && !attacked.has('0,2'))
              moves.push([0, 2, 'castleQ']);
          }
        }
      }
    }
    else if (pt === 'p') {
      const dir = col === 'white' ? -1 : 1;
      const startRow = col === 'white' ? 6 : 1;
      const nr = r + dir;
      if (nr >= 0 && nr < 8) {
        if (!board[nr][f]) {
          moves.push([nr, f]);
          if (r === startRow && !board[nr + dir] && !board[nr + dir]?.[f]) {
            if (!board[r + 2 * dir]?.[f]) moves.push([r + 2 * dir, f]);
          }
        }
        // Captures
        [f-1, f+1].forEach(cf => {
          if (cf >= 0 && cf < 8) {
            const t = board[nr][cf];
            if (t && color(t) === opp) moves.push([nr, cf]);
            // En passant
            if (state && state.enPassant && state.enPassant[0] === nr && state.enPassant[1] === cf)
              moves.push([nr, cf, 'ep']);
          }
        });
      }
    }

    return moves;
  }

  // Legal moves (filters moves that leave own king in check)
  function legalMoves(board, r, f, state) {
    const p = board[r][f];
    if (!p) return [];
    const col = color(p);
    const raw = rawMoves(board, r, f, col, state);
    return raw.filter(([tr, tf, flag]) => {
      const nb = deepCopyBoard(board);
      applyMoveRaw(nb, r, f, tr, tf, flag, state);
      return !inCheck(nb, col);
    });
  }

  // Apply move to board (in place, no state update)
  function applyMoveRaw(board, fr, ff, tr, tf, flag, state) {
    const p = board[fr][ff];
    board[tr][tf] = p;
    board[fr][ff] = null;
    const col = color(p);
    if (flag === 'ep' && state) {
      const dir = col === 'white' ? 1 : -1;
      board[tr + dir][tf] = null;
    }
    if (flag === 'castleK') {
      if (col === 'white') { board[7][5] = 'R'; board[7][7] = null; }
      else { board[0][5] = 'r'; board[0][7] = null; }
    }
    if (flag === 'castleQ') {
      if (col === 'white') { board[7][3] = 'R'; board[7][0] = null; }
      else { board[0][3] = 'r'; board[0][0] = null; }
    }
  }

  // ---- Game State ----
  function createState() {
    return {
      board: initialBoard(),
      turn: 'white',
      castling: { whiteKingSide: true, whiteQueenSide: true, blackKingSide: true, blackQueenSide: true },
      enPassant: null,
      halfMove: 0,
      fullMove: 1,
      history: [],          // { fr,ff,tr,tf,san,captured,castling,enPassant,promotion,flag,eval,class }
      redoStack: [],
      pgn: [],
    };
  }

  // ---- SAN notation ----
  function toAlg(r, f) {
    return 'abcdefgh'[f] + (8 - r);
  }
  function fromAlg(alg) {
    return [8 - parseInt(alg[1]), 'abcdefgh'.indexOf(alg[0])];
  }

  function buildSAN(board, fr, ff, tr, tf, flag, promotion, state) {
    const p = board[fr][ff];
    const pt = pieceOf(p);
    const col = color(p);
    const captured = board[tr][tf];
    const to = toAlg(tr, tf);

    let san = '';
    if (flag === 'castleK') return 'O-O';
    if (flag === 'castleQ') return 'O-O-O';

    if (pt === 'p') {
      if (captured || flag === 'ep') san = 'abcdefgh'[ff] + 'x' + to;
      else san = to;
      if (promotion) san += '=' + promotion.toUpperCase();
    } else {
      const pieceLetter = pt.toUpperCase();
      // Disambiguation
      let ambigFile = false, ambigRank = false;
      for (let r2 = 0; r2 < 8; r2++) {
        for (let f2 = 0; f2 < 8; f2++) {
          if (r2 === fr && f2 === ff) continue;
          const p2 = board[r2][f2];
          if (p2 && color(p2) === col && pieceOf(p2) === pt) {
            const m2 = legalMoves(board, r2, f2, state);
            if (m2.some(([mr, mf]) => mr === tr && mf === tf)) {
              if (f2 === ff) ambigRank = true;
              else ambigFile = true;
            }
          }
        }
      }
      san = pieceLetter;
      if (ambigFile || ambigRank) {
        if (ambigFile && !ambigRank) san += 'abcdefgh'[ff];
        else if (!ambigFile && ambigRank) san += (8 - fr).toString();
        else san += toAlg(fr, ff);
      }
      if (captured) san += 'x';
      san += to;
    }

    // Check / checkmate
    const nb = deepCopyBoard(board);
    applyMoveRaw(nb, fr, ff, tr, tf, flag, state);
    const opp = opponent(col);
    if (inCheck(nb, opp)) {
      if (hasNoLegalMoves(nb, opp, state)) san += '#';
      else san += '+';
    }
    return san;
  }

  function hasNoLegalMoves(board, col, state) {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && color(p) === col) {
          if (legalMoves(board, r, f, state).length > 0) return false;
        }
      }
    }
    return true;
  }

  // ---- Make move ----
  function makeMove(state, fr, ff, tr, tf, promotion, flag) {
    const board = state.board;
    const p = board[fr][ff];
    const pt = pieceOf(p);
    const col = color(p);
    const captured = board[tr][tf];

    const san = buildSAN(board, fr, ff, tr, tf, flag, promotion, state);

    // Save castling / ep for history
    const prevCastling = { ...state.castling };
    const prevEP = state.enPassant;

    // Apply
    const nb = deepCopyBoard(board);
    applyMoveRaw(nb, fr, ff, tr, tf, flag, state);

    // Promotion
    if (pt === 'p' && (tr === 0 || tr === 7)) {
      const promPiece = promotion || 'q';
      nb[tr][tf] = col === 'white' ? promPiece.toUpperCase() : promPiece.toLowerCase();
    }

    // Update castling rights
    const nc = { ...state.castling };
    if (pt === 'k') {
      if (col === 'white') { nc.whiteKingSide = false; nc.whiteQueenSide = false; }
      else { nc.blackKingSide = false; nc.blackQueenSide = false; }
    }
    if (pt === 'r') {
      if (fr === 7 && ff === 7) nc.whiteKingSide = false;
      if (fr === 7 && ff === 0) nc.whiteQueenSide = false;
      if (fr === 0 && ff === 7) nc.blackKingSide = false;
      if (fr === 0 && ff === 0) nc.blackQueenSide = false;
    }
    // Rook captured
    if (tr === 7 && tf === 7) nc.whiteKingSide = false;
    if (tr === 7 && tf === 0) nc.whiteQueenSide = false;
    if (tr === 0 && tf === 7) nc.blackKingSide = false;
    if (tr === 0 && tf === 0) nc.blackQueenSide = false;

    // Update en passant
    let nep = null;
    if (pt === 'p' && Math.abs(tr - fr) === 2) nep = [(fr + tr) / 2, ff];

    const moveRecord = {
      fr, ff, tr, tf, san, captured,
      castling: prevCastling, enPassant: prevEP,
      promotion, flag,
      halfMove: state.halfMove,
      fullMove: state.fullMove,
      boardSnapshot: deepCopyBoard(nb),
      eval: null, cls: null,
    };

    state.history.push(moveRecord);
    state.redoStack = [];
    state.board = nb;
    state.turn = opponent(col);
    state.castling = nc;
    state.enPassant = nep;
    state.halfMove = (pt === 'p' || captured) ? 0 : state.halfMove + 1;
    if (col === 'black') state.fullMove++;

    return san;
  }

  function undoMove(state) {
    if (state.history.length === 0) return false;
    const mv = state.history.pop();
    state.redoStack.push(mv);

    // Restore
    state.board = mv.boardSnapshot ? deepCopyBoard(
      state.history.length > 0
        ? restoreBoard(state.history[state.history.length - 1])
        : initialBoard()
    ) : initialBoard();

    // Simpler: rebuild from scratch
    const s2 = createState();
    for (const m of state.history) {
      makeMove(s2, m.fr, m.ff, m.tr, m.tf, m.promotion, m.flag);
      s2.history[s2.history.length - 1].eval = m.eval;
      s2.history[s2.history.length - 1].cls = m.cls;
    }
    state.board = s2.board;
    state.turn = s2.turn;
    state.castling = s2.castling;
    state.enPassant = s2.enPassant;
    state.halfMove = s2.halfMove;
    state.fullMove = s2.fullMove;
    return mv;
  }

  function redoMove(state) {
    if (state.redoStack.length === 0) return false;
    const mv = state.redoStack.pop();
    makeMove(state, mv.fr, mv.ff, mv.tr, mv.tf, mv.promotion, mv.flag);
    return mv;
  }

  // ---- Game status ----
  function getStatus(state) {
    const col = state.turn;
    if (hasNoLegalMoves(state.board, col, state)) {
      if (inCheck(state.board, col)) return { result: 'checkmate', winner: opponent(col) };
      return { result: 'stalemate', winner: null };
    }
    if (state.halfMove >= 100) return { result: '50-move', winner: null };
    if (insufficientMaterial(state.board)) return { result: 'insufficient', winner: null };
    return null;
  }

  function insufficientMaterial(board) {
    const pieces = [];
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++)
        if (board[r][f]) pieces.push({ p: board[r][f], r, f });
    if (pieces.length === 2) return true; // K vs K
    if (pieces.length === 3) {
      const minor = pieces.find(x => ['b','n'].includes(x.p.toLowerCase()));
      if (minor) return true;
    }
    return false;
  }

  // ---- PGN ----
  function toPGN(state, meta = {}) {
    let pgn = '';
    const tags = {
      Event: meta.event || 'Regicide Game',
      Site: 'regicide.chess',
      Date: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
      White: meta.white || 'Player',
      Black: meta.black || 'Stockfish',
      Result: meta.result || '*',
      ...meta.extra
    };
    for (const [k, v] of Object.entries(tags)) pgn += `[${k} "${v}"]\n`;
    pgn += '\n';
    state.history.forEach((mv, i) => {
      if (i % 2 === 0) pgn += `${Math.floor(i / 2) + 1}. `;
      pgn += mv.san + ' ';
    });
    pgn += (meta.result || '*');
    return pgn.trim();
  }

  // ---- FEN ----
  function toFEN(state) {
    let fen = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = state.board[r][f];
        if (!p) { empty++; }
        else { if (empty) { fen += empty; empty = 0; } fen += p; }
      }
      if (empty) fen += empty;
      if (r < 7) fen += '/';
    }
    fen += ' ' + (state.turn === 'white' ? 'w' : 'b');
    let cast = '';
    if (state.castling.whiteKingSide) cast += 'K';
    if (state.castling.whiteQueenSide) cast += 'Q';
    if (state.castling.blackKingSide) cast += 'k';
    if (state.castling.blackQueenSide) cast += 'q';
    fen += ' ' + (cast || '-');
    fen += ' ' + (state.enPassant ? toAlg(...state.enPassant) : '-');
    fen += ' ' + state.halfMove + ' ' + state.fullMove;
    return fen;
  }

  // ---- Parse PGN ----
  function parsePGN(pgn) {
    const state = createState();
    // Remove tags
    const moveText = pgn.replace(/\[.*?\]/gs, '').trim();
    const tokens = moveText.split(/\s+/).filter(t => t && !/^\d+\./.test(t) && !['*','1-0','0-1','1/2-1/2'].includes(t));

    for (const token of tokens) {
      // Remove annotations
      const san = token.replace(/[!?+#]/g, '').replace(/=/, '=');
      const move = findMoveFromSAN(state, san);
      if (move) {
        makeMove(state, move.fr, move.ff, move.tr, move.tf, move.promotion, move.flag);
      }
    }
    return state;
  }

  function findMoveFromSAN(state, san) {
    const col = state.turn;
    for (let fr = 0; fr < 8; fr++) {
      for (let ff = 0; ff < 8; ff++) {
        const p = state.board[fr][ff];
        if (!p || color(p) !== col) continue;
        const lm = legalMoves(state.board, fr, ff, state);
        for (const [tr, tf, flag] of lm) {
          // Check promotion
          let prom = undefined;
          if (san.includes('=')) {
            const promChar = san.split('=')[1]?.[0]?.toLowerCase();
            prom = promChar;
          }
          const testSAN = buildSAN(state.board, fr, ff, tr, tf, flag, prom, state);
          const cleanTest = testSAN.replace(/[+#]/g, '');
          const cleanSAN = san.replace(/[+#]/g, '');
          if (cleanTest === cleanSAN) return { fr, ff, tr, tf, flag, promotion: prom };
        }
      }
    }
    return null;
  }

  return {
    createState, makeMove, undoMove, redoMove,
    legalMoves, getStatus, inCheck,
    toPGN, toFEN, parsePGN,
    color, pieceOf, isWhite, isBlack,
    toAlg, fromAlg, deepCopyBoard,
    EMPTY
  };
})();


/* ================================================================
   STOCKFISH INTEGRATION
   ================================================================ */

const StockfishEngine = (() => {
  let worker = null;
  let ready = false;
  let onReadyCallback = null;
  const callbacks = {};
  let evalCallback = null;
  let bestMoveCallback = null;

  // Stockfish CDN (JS version)
  const SF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';

  function init(onReady) {
    onReadyCallback = onReady;
    try {
      worker = new Worker(SF_URL);
      worker.onmessage = handleMessage;
      worker.onerror = (e) => {
        console.warn('Stockfish worker error, using fallback', e);
        ready = true;
        if (onReadyCallback) onReadyCallback(false);
      };
      worker.postMessage('uci');
    } catch (e) {
      console.warn('Stockfish unavailable:', e);
      ready = true;
      if (onReadyCallback) onReadyCallback(false);
    }
  }

  function handleMessage(e) {
    const line = e.data;
    if (line === 'uciok') {
      worker.postMessage('isready');
    } else if (line === 'readyok') {
      ready = true;
      if (onReadyCallback) onReadyCallback(true);
    } else if (line.startsWith('info')) {
      parseInfo(line);
    } else if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      const bm = parts[1];
      if (bestMoveCallback) {
        bestMoveCallback(bm);
        bestMoveCallback = null;
      }
    }
  }

  function parseInfo(line) {
    if (!evalCallback) return;
    const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
    if (scoreMatch) {
      let score = parseFloat(scoreMatch[2]);
      if (scoreMatch[1] === 'cp') score = score / 100;
      else score = score > 0 ? 99 : -99; // Mate
      // Get pv (principal variation)
      const pvMatch = line.match(/pv (.+)/);
      const pv = pvMatch ? pvMatch[1].split(' ').slice(0, 5) : [];
      evalCallback({ score, pv });
    }
  }

  function setLevel(level) {
    if (!worker || !ready) return;
    const elo = Math.round(400 + (level - 1) * (3200 - 400) / 19);
    worker.postMessage(`setoption name Skill Level value ${Math.round((level - 1) * 20 / 19)}`);
    worker.postMessage(`setoption name UCI_LimitStrength value true`);
    worker.postMessage(`setoption name UCI_Elo value ${elo}`);
  }

  function getBestMove(fen, depth, onBestMove, onEval) {
    if (!worker || !ready) {
      // Fallback: random legal move
      if (onBestMove) setTimeout(() => onBestMove(null), 100);
      return;
    }
    evalCallback = onEval || null;
    bestMoveCallback = onBestMove;
    worker.postMessage('stop');
    worker.postMessage('position fen ' + fen);
    worker.postMessage(`go depth ${depth || 15}`);
  }

  function getEvaluation(fen, depth, onEval) {
    if (!worker || !ready) { if (onEval) onEval({ score: 0, pv: [] }); return; }
    let lastEval = null;
    evalCallback = (ev) => { lastEval = ev; onEval && onEval(ev); };
    bestMoveCallback = () => {};
    worker.postMessage('stop');
    worker.postMessage('position fen ' + fen);
    worker.postMessage(`go depth ${depth || 18}`);
  }

  function stop() {
    if (worker) worker.postMessage('stop');
  }

  function isReady() { return ready; }

  // Fallback: pick a random legal move
  function fallbackMove(state) {
    const col = state.turn;
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = state.board[r][f];
        if (p && ChessEngine.color(p) === col) {
          ChessEngine.legalMoves(state.board, r, f, state).forEach(([tr, tf, flag]) => {
            moves.push({ fr: r, ff: f, tr, tf, flag });
          });
        }
      }
    }
    if (!moves.length) return null;
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // Convert UCI move to board coords
  function uciToMove(uci) {
    if (!uci || uci === '(none)') return null;
    const ff = 'abcdefgh'.indexOf(uci[0]);
    const fr = 8 - parseInt(uci[1]);
    const tf = 'abcdefgh'.indexOf(uci[2]);
    const tr = 8 - parseInt(uci[3]);
    const promotion = uci[4] || null;
    return { fr, ff, tr, tf, promotion };
  }

  // Classify move quality based on eval delta
  function classifyMove(evalBefore, evalAfter, isWhiteTurn) {
    const sign = isWhiteTurn ? 1 : -1;
    const delta = sign * (evalAfter - evalBefore);
    if (delta >= 1.5) return 'brilliant';
    if (delta >= 0.2) return 'great';
    if (delta >= -0.1) return 'good';
    if (delta >= -0.5) return 'inaccuracy';
    if (delta >= -1.5) return 'mistake';
    return 'blunder';
  }

  return { init, setLevel, getBestMove, getEvaluation, stop, isReady, fallbackMove, uciToMove, classifyMove };
})();
