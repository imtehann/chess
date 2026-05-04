/**
 * engine.js — Chess Logic + Stockfish Integration
 * Handles: move generation, validation, Stockfish WASM, evaluation
 */

// ============================================================
// CHESS LOGIC (self-contained, no external deps)
// ============================================================
const Chess = (() => {
  const PIECES = {
    wP:'\u2659',wR:'\u2656',wN:'\u2658',wB:'\u2657',wQ:'\u2655',wK:'\u2654',
    bP:'\u265F',bR:'\u265C',bN:'\u265E',bB:'\u265D',bQ:'\u265B',bK:'\u265A'
  };

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  function createBoard() {
    return Array(8).fill(null).map(() => Array(8).fill(null));
  }

  function fenToBoard(fen) {
    const parts = fen.split(' ');
    const board = createBoard();
    const rows = parts[0].split('/');
    for (let r = 0; r < 8; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') {
          c += parseInt(ch);
        } else {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          const type = ch.toUpperCase();
          board[r][c] = { color, type, id: `${color}${type}` };
          c++;
        }
      }
    }
    return {
      board,
      turn: parts[1],
      castling: parts[2],
      enPassant: parts[3],
      halfMove: parseInt(parts[4] || 0),
      fullMove: parseInt(parts[5] || 1)
    };
  }

  function boardToFen(state) {
    let fen = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = state.board[r][c];
        if (!p) { empty++; continue; }
        if (empty) { fen += empty; empty = 0; }
        const ch = p.color === 'w' ? p.type : p.type.toLowerCase();
        fen += ch;
      }
      if (empty) fen += empty;
      if (r < 7) fen += '/';
    }
    return `${fen} ${state.turn} ${state.castling} ${state.enPassant} ${state.halfMove} ${state.fullMove}`;
  }

  function cloneState(s) {
    return {
      board: s.board.map(row => row.map(cell => cell ? { ...cell } : null)),
      turn: s.turn,
      castling: s.castling,
      enPassant: s.enPassant,
      halfMove: s.halfMove,
      fullMove: s.fullMove
    };
  }

  function rc(algebraic) {
    return [8 - parseInt(algebraic[1]), algebraic.charCodeAt(0) - 97];
  }
  function toAlg(r, c) {
    return String.fromCharCode(97 + c) + (8 - r);
  }

  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  function isAttacked(state, r, c, byColor) {
    const b = state.board;
    // Pawns
    const pd = byColor === 'w' ? 1 : -1;
    for (const dc of [-1, 1]) {
      const nr = r + pd, nc = c + dc;
      if (inBounds(nr, nc) && b[nr][nc]?.color === byColor && b[nr][nc]?.type === 'P') return true;
    }
    // Knights
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && b[nr][nc]?.color === byColor && b[nr][nc]?.type === 'N') return true;
    }
    // Bishops & Queens (diagonals)
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      let nr = r + dr, nc = c + dc;
      while (inBounds(nr, nc)) {
        const p = b[nr][nc];
        if (p) {
          if (p.color === byColor && (p.type === 'B' || p.type === 'Q')) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    // Rooks & Queens (straights)
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let nr = r + dr, nc = c + dc;
      while (inBounds(nr, nc)) {
        const p = b[nr][nc];
        if (p) {
          if (p.color === byColor && (p.type === 'R' || p.type === 'Q')) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    // King
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && b[nr][nc]?.color === byColor && b[nr][nc]?.type === 'K') return true;
    }
    return false;
  }

  function findKing(state, color) {
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (state.board[r][c]?.color === color && state.board[r][c]?.type === 'K') return [r, c];
    return null;
  }

  function isInCheck(state, color) {
    const [kr, kc] = findKing(state, color);
    return isAttacked(state, kr, kc, color === 'w' ? 'b' : 'w');
  }

  function rawMoves(state, r, c) {
    const piece = state.board[r][c];
    if (!piece) return [];
    const { color, type } = piece;
    const moves = [];
    const b = state.board;
    const opp = color === 'w' ? 'b' : 'w';

    const add = (nr, nc, special) => {
      if (inBounds(nr, nc) && b[nr][nc]?.color !== color) {
        moves.push({ from: [r, c], to: [nr, nc], special });
      }
    };
    const slide = (dirs) => {
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
          if (b[nr][nc]) {
            if (b[nr][nc].color === opp) moves.push({ from: [r, c], to: [nr, nc] });
            break;
          }
          moves.push({ from: [r, c], to: [nr, nc] });
          nr += dr; nc += dc;
        }
      }
    };

    if (type === 'P') {
      const dir = color === 'w' ? -1 : 1;
      const start = color === 'w' ? 6 : 1;
      // Forward
      if (inBounds(r + dir, c) && !b[r + dir][c]) {
        moves.push({ from: [r, c], to: [r + dir, c] });
        if (r === start && !b[r + 2 * dir][c])
          moves.push({ from: [r, c], to: [r + 2 * dir, c], special: 'double' });
      }
      // Captures
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (inBounds(nr, nc)) {
          if (b[nr][nc]?.color === opp) moves.push({ from: [r, c], to: [nr, nc] });
          // En passant
          if (state.enPassant !== '-') {
            const [epr, epc] = rc(state.enPassant);
            if (nr === epr && nc === epc)
              moves.push({ from: [r, c], to: [nr, nc], special: 'enpassant' });
          }
        }
      }
    } else if (type === 'N') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
        add(r + dr, c + dc);
    } else if (type === 'B') {
      slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
    } else if (type === 'R') {
      slide([[-1,0],[1,0],[0,-1],[0,1]]);
    } else if (type === 'Q') {
      slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    } else if (type === 'K') {
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
        add(r + dr, c + dc);
      // Castling
      if (color === 'w') {
        if (state.castling.includes('K') && !b[7][5] && !b[7][6] &&
            !isAttacked(state, 7, 4, 'b') && !isAttacked(state, 7, 5, 'b') && !isAttacked(state, 7, 6, 'b'))
          moves.push({ from: [r, c], to: [7, 6], special: 'castle-k' });
        if (state.castling.includes('Q') && !b[7][3] && !b[7][2] && !b[7][1] &&
            !isAttacked(state, 7, 4, 'b') && !isAttacked(state, 7, 3, 'b') && !isAttacked(state, 7, 2, 'b'))
          moves.push({ from: [r, c], to: [7, 2], special: 'castle-q' });
      } else {
        if (state.castling.includes('k') && !b[0][5] && !b[0][6] &&
            !isAttacked(state, 0, 4, 'w') && !isAttacked(state, 0, 5, 'w') && !isAttacked(state, 0, 6, 'w'))
          moves.push({ from: [r, c], to: [0, 6], special: 'castle-k' });
        if (state.castling.includes('q') && !b[0][3] && !b[0][2] && !b[0][1] &&
            !isAttacked(state, 0, 4, 'w') && !isAttacked(state, 0, 3, 'w') && !isAttacked(state, 0, 2, 'w'))
          moves.push({ from: [r, c], to: [0, 2], special: 'castle-q' });
      }
    }
    return moves;
  }

  function legalMoves(state, r, c) {
    return rawMoves(state, r, c).filter(move => {
      const ns = applyMove(cloneState(state), move, null);
      return !isInCheck(ns, state.board[r][c].color);
    });
  }

  function allLegalMoves(state) {
    const moves = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (state.board[r][c]?.color === state.turn)
          legalMoves(state, r, c).forEach(m => moves.push(m));
    return moves;
  }

  function applyMove(state, move, promotion) {
    const ns = cloneState(state);
    const [fr, fc] = move.from;
    const [tr, tc] = move.to;
    const piece = ns.board[fr][fc];

    ns.enPassant = '-';
    ns.halfMove++;

    // Capture
    if (ns.board[tr][tc]) ns.halfMove = 0;
    if (piece.type === 'P') ns.halfMove = 0;

    ns.board[tr][tc] = piece;
    ns.board[fr][fc] = null;

    // Special moves
    if (move.special === 'double') {
      ns.enPassant = toAlg((fr + tr) >> 1, fc);
    }
    if (move.special === 'enpassant') {
      ns.board[fr][tc] = null;
    }
    if (move.special === 'castle-k') {
      const rookR = piece.color === 'w' ? 7 : 0;
      ns.board[rookR][5] = ns.board[rookR][7];
      ns.board[rookR][7] = null;
    }
    if (move.special === 'castle-q') {
      const rookR = piece.color === 'w' ? 7 : 0;
      ns.board[rookR][3] = ns.board[rookR][0];
      ns.board[rookR][0] = null;
    }
    // Promotion
    if (piece.type === 'P' && (tr === 0 || tr === 7)) {
      const pt = (promotion || 'Q').toUpperCase();
      ns.board[tr][tc] = { color: piece.color, type: pt, id: piece.color + pt };
    }

    // Update castling rights
    let cas = ns.castling;
    if (piece.type === 'K') cas = piece.color === 'w' ? cas.replace('K','').replace('Q','') : cas.replace('k','').replace('q','');
    if (piece.type === 'R') {
      if (fr === 7 && fc === 7) cas = cas.replace('K','');
      if (fr === 7 && fc === 0) cas = cas.replace('Q','');
      if (fr === 0 && fc === 7) cas = cas.replace('k','');
      if (fr === 0 && fc === 0) cas = cas.replace('q','');
    }
    ns.castling = cas || '-';

    ns.turn = ns.turn === 'w' ? 'b' : 'w';
    if (ns.turn === 'w') ns.fullMove++;
    return ns;
  }

  function moveToSan(state, move, promotion) {
    const [fr, fc] = move.from;
    const [tr, tc] = move.to;
    const piece = state.board[fr][fc];
    const files = 'abcdefgh';

    if (move.special === 'castle-k') return 'O-O';
    if (move.special === 'castle-q') return 'O-O-O';

    let san = '';
    const isCapture = !!state.board[tr][tc] || move.special === 'enpassant';

    if (piece.type === 'P') {
      if (isCapture) san = files[fc] + 'x';
      san += files[tc] + (8 - tr);
      if (tr === 0 || tr === 7) san += '=' + (promotion || 'Q');
    } else {
      san = piece.type;
      // Disambiguation
      const ambiguous = [];
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
          if (state.board[r][c]?.type === piece.type && state.board[r][c]?.color === piece.color && !(r === fr && c === fc)) {
            const lm = legalMoves(state, r, c);
            if (lm.some(m => m.to[0] === tr && m.to[1] === tc)) ambiguous.push([r, c]);
          }
      if (ambiguous.length) {
        if (ambiguous.every(([,ac]) => ac !== fc)) san += files[fc];
        else if (ambiguous.every(([ar]) => ar !== fr)) san += (8 - fr);
        else san += files[fc] + (8 - fr);
      }
      if (isCapture) san += 'x';
      san += files[tc] + (8 - tr);
    }

    // Check/checkmate
    const ns = applyMove(cloneState(state), move, promotion);
    if (isInCheck(ns, ns.turn)) {
      san += allLegalMoves(ns).length === 0 ? '#' : '+';
    }
    return san;
  }

  function gameStatus(state) {
    const moves = allLegalMoves(state);
    if (moves.length === 0) {
      if (isInCheck(state, state.turn)) return { over: true, result: state.turn === 'w' ? 'black' : 'white', reason: 'checkmate' };
      return { over: true, result: 'draw', reason: 'stalemate' };
    }
    if (state.halfMove >= 100) return { over: true, result: 'draw', reason: 'fifty-move' };
    // Could add insufficient material, 3-fold, but keep lean
    return { over: false };
  }

  function generatePGN(moves, moveTexts, result, headers = {}) {
    const defaultHeaders = {
      Event: 'REGIS Game',
      Site: 'REGIS Chess',
      Date: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
      Round: '?',
      White: headers.white || 'White',
      Black: headers.black || 'Black',
      Result: result || '*'
    };
    let pgn = '';
    for (const [k, v] of Object.entries({ ...defaultHeaders, ...headers }))
      pgn += `[${k} "${v}"]\n`;
    pgn += '\n';
    for (let i = 0; i < moveTexts.length; i++) {
      if (i % 2 === 0) pgn += `${Math.floor(i / 2) + 1}. `;
      pgn += moveTexts[i] + ' ';
    }
    pgn += result || '*';
    return pgn.trim();
  }

  return { fenToBoard, boardToFen, cloneState, legalMoves, allLegalMoves, applyMove, moveToSan, gameStatus, generatePGN, isInCheck, START_FEN, PIECES };
})();

// ============================================================
// STOCKFISH ENGINE
// ============================================================
class StockfishEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.onReady = null;
    this.onInfo = null;
    this.onBestMove = null;
    this._lines = [];
    this._depth = 0;
    this._resolveMove = null;
    this._resolveEval = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      try {
        // Try loading Stockfish from CDN
        const sfUrl = 'https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish.js';
        this.worker = new Worker(sfUrl);
      } catch (e) {
        // Fallback: create a minimal mock engine
        console.warn('Stockfish worker failed, using mock engine');
        this._useMock = true;
        this.ready = true;
        resolve();
        return;
      }

      this.worker.onmessage = (e) => {
        const line = e.data;
        if (typeof line !== 'string') return;

        if (line === 'uciok') {
          this.worker.postMessage('isready');
        } else if (line === 'readyok') {
          this.ready = true;
          resolve();
          if (this.onReady) this.onReady();
        } else if (line.startsWith('info depth')) {
          this._parseInfo(line);
        } else if (line.startsWith('bestmove')) {
          const parts = line.split(' ');
          const bm = parts[1];
          if (this._resolveMove) {
            this._resolveMove(bm);
            this._resolveMove = null;
          }
          if (this.onBestMove) this.onBestMove(bm, this._lines);
        }
      };

      this.worker.onerror = (e) => {
        console.warn('Stockfish error, using mock engine');
        this._useMock = true;
        this.ready = true;
        resolve();
      };

      this.worker.postMessage('uci');

      // Timeout fallback
      setTimeout(() => {
        if (!this.ready) {
          this._useMock = true;
          this.ready = true;
          resolve();
        }
      }, 3000);
    });
  }

  _parseInfo(line) {
    const multipv = line.match(/multipv (\d+)/);
    const depth = line.match(/depth (\d+)/);
    const score = line.match(/score (cp|mate) (-?\d+)/);
    const pv = line.match(/ pv (.+)/);

    if (!score || !pv) return;

    const idx = multipv ? parseInt(multipv[1]) - 1 : 0;
    let ev = 0;
    if (score[1] === 'cp') ev = parseInt(score[2]) / 100;
    else ev = parseInt(score[2]) > 0 ? 999 : -999;

    this._lines[idx] = {
      depth: depth ? parseInt(depth[1]) : 0,
      score: ev,
      moves: pv[1].trim().split(' ').slice(0, 6)
    };

    if (this.onInfo) this.onInfo(this._lines, ev);
  }

  send(msg) {
    if (this._useMock) return;
    if (this.worker) this.worker.postMessage(msg);
  }

  getBestMove(fen, depth = 15, movetime = null) {
    if (this._useMock) return this._mockBestMove(fen);

    return new Promise((resolve) => {
      this._resolveMove = resolve;
      this._lines = [];
      this.send('ucinewgame');
      this.send(`position fen ${fen}`);
      if (movetime) this.send(`go movetime ${movetime}`);
      else this.send(`go depth ${depth}`);
    });
  }

  _mockBestMove(fen) {
    // Simple random legal move picker
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          const state = Chess.fenToBoard(fen);
          const moves = Chess.allLegalMoves(state);
          if (moves.length === 0) { resolve(null); return; }
          const m = moves[Math.floor(Math.random() * moves.length)];
          const files = 'abcdefgh';
          const from = files[m.from[1]] + (8 - m.from[0]);
          const to = files[m.to[1]] + (8 - m.to[0]);
          resolve(from + to);
        } catch (e) {
          resolve(null);
        }
      }, 400 + Math.random() * 600);
    });
  }

  analyze(fen, depth = 18) {
    if (this._useMock) return Promise.resolve({ score: 0, lines: [] });
    return new Promise((resolve) => {
      this._lines = [];
      const timeout = setTimeout(() => resolve({ score: 0, lines: this._lines }), 5000);
      const origInfo = this.onInfo;
      this.onInfo = (lines, ev) => { if (origInfo) origInfo(lines, ev); };
      const origBM = this.onBestMove;
      this.onBestMove = (bm, lines) => {
        clearTimeout(timeout);
        this.onInfo = origInfo;
        this.onBestMove = origBM;
        resolve({ score: lines[0]?.score || 0, lines });
      };
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
    });
  }

  setOption(name, value) {
    this.send(`setoption name ${name} value ${value}`);
  }

  setSkillLevel(level) {
    // level 1-20
    this.setOption('Skill Level', Math.max(0, Math.min(20, level)));
  }

  stop() { this.send('stop'); }
  quit() { this.send('quit'); }
}

// Singleton
window.stockfish = new StockfishEngine();
