/**
 * main.js — Application Controller
 * Regicide Chess
 */

'use strict';

/* ================================================================
   APP STATE
   ================================================================ */
const App = {
  mode: 'menu',       // 'menu' | 'game' | 'analysis'
  gameMode: 'pvai',   // 'pvai' | 'pvp'
  season: localStorage.getItem('season') || 'winter',
  difficulty: parseInt(localStorage.getItem('difficulty') || '10'),
  playerColor: 'white',
  timeControl: 0,     // seconds per side, 0 = unlimited
  flipped: false,

  // Game state
  chess: null,
  aiThinking: false,
  pendingPromotion: null,

  // Clocks
  clocks: { white: 0, black: 0 },
  clockInterval: null,
  clockActive: false,

  // Captures tracking
  captures: { white: [], black: [] },

  // Eval tracking
  currentEval: 0,
  prevEval: 0,
  evalHistory: [],

  // Analysis
  analysisChess: null,
  analysisMoveIdx: -1,

  // RAF handle
  rafHandle: null,
};

/* ================================================================
   INIT
   ================================================================ */
function init() {
  updateLoadingBar(10, 'Initialising board…');

  // Init environment canvases
  MenuEnvironment.init(document.getElementById('menu-canvas'), App.season);
  EnvironmentRenderer.init(document.getElementById('env-canvas'), App.season);
  EnvironmentRenderer.init(document.getElementById('analysis-env-canvas'), App.season);

  updateLoadingBar(30, 'Loading chess engine…');

  // Init board renderers
  BoardRenderer.init(document.getElementById('board-canvas'), {
    season: App.season,
    onSquareClick: handleBoardClick,
    onDrop: handleDrop,
    onDragStart: handleDragStart,
  });

  // Analysis board (share same renderer API but separate canvas)
  AnalysisBoardRenderer.init(document.getElementById('analysis-board-canvas'));

  updateLoadingBar(50, 'Loading Stockfish 14…');

  // Init Stockfish
  StockfishEngine.init((ok) => {
    updateLoadingBar(80, ok ? 'Engine ready.' : 'Engine (fallback mode).');
    StockfishEngine.setLevel(App.difficulty);
    setTimeout(() => {
      updateLoadingBar(100, 'Welcome.');
      setTimeout(() => {
        document.getElementById('loading-screen').style.opacity = '0';
        document.getElementById('loading-screen').style.transition = 'opacity 0.6s';
        setTimeout(() => {
          document.getElementById('loading-screen').classList.add('hidden');
          UI.showScreen('main-menu');
          UI.setActiveSeason(App.season);
          startRenderLoop();
        }, 600);
      }, 400);
    }, 500);
  });

  attachAllEvents();
}

function updateLoadingBar(pct, msg) {
  const bar = document.getElementById('loading-bar');
  const status = document.getElementById('loading-status');
  if (bar) bar.style.width = pct + '%';
  if (status) status.textContent = msg;
}

/* ================================================================
   RENDER LOOP
   ================================================================ */
function startRenderLoop() {
  if (App.rafHandle) cancelAnimationFrame(App.rafHandle);

  function loop(ts) {
    // Menu
    if (App.mode === 'menu') {
      MenuEnvironment.render(ts);
    }

    // Game
    if (App.mode === 'game') {
      EnvironmentRenderer.render(ts);
      const needsAnim = BoardRenderer.tickAnimations(App.chess, ts);
      BoardRenderer.draw(App.chess);
    }

    // Analysis
    if (App.mode === 'analysis') {
      EnvironmentRenderer.render(ts);
      AnalysisBoardRenderer.draw(App.analysisChess);
    }

    App.rafHandle = requestAnimationFrame(loop);
  }

  App.rafHandle = requestAnimationFrame(loop);
}

/* ================================================================
   EVENTS
   ================================================================ */
function attachAllEvents() {
  // Menu
  document.getElementById('btn-pvai').addEventListener('click', () => openConfigModal('pvai'));
  document.getElementById('btn-pvp').addEventListener('click', () => openConfigModal('pvp'));
  document.getElementById('btn-analysis').addEventListener('click', enterAnalysis);
  document.getElementById('modal-cancel').addEventListener('click', () => UI.hideModal('modal-config'));
  document.getElementById('modal-start').addEventListener('click', startGame);

  // Difficulty slider
  const slider = document.getElementById('difficulty-slider');
  slider.addEventListener('input', () => {
    document.getElementById('diff-val').textContent = slider.value;
    App.difficulty = parseInt(slider.value);
  });

  // Color pick
  document.querySelectorAll('.color-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-pick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      App.playerColor = btn.dataset.color;
    });
  });

  // Time control
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      App.timeControl = parseInt(btn.dataset.time);
    });
  });

  // Season buttons (all pages)
  document.querySelectorAll('.season-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      App.season = btn.dataset.season;
      localStorage.setItem('season', App.season);
      UI.setActiveSeason(App.season);
      EnvironmentRenderer.setSeason(App.season);
      MenuEnvironment.setSeason(App.season);
      BoardRenderer.setSeason(App.season);
    });
  });

  // Game HUD buttons
  document.getElementById('btn-menu')?.addEventListener('click', returnToMenu);
  document.getElementById('btn-undo')?.addEventListener('click', handleUndo);
  document.getElementById('btn-redo')?.addEventListener('click', handleRedo);
  document.getElementById('btn-flip')?.addEventListener('click', () => {
    App.flipped = !App.flipped;
    BoardRenderer.setFlipped(App.flipped);
  });

  // Game over
  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    UI.hideGameOver();
    openConfigModal(App.gameMode);
  });
  document.getElementById('btn-analysis-mode')?.addEventListener('click', () => {
    UI.hideGameOver();
    enterAnalysisFromGame();
  });
  document.getElementById('btn-back-menu')?.addEventListener('click', returnToMenu);

  // Analysis
  document.getElementById('btn-analysis-back')?.addEventListener('click', returnToMenu);
  document.getElementById('btn-load-pgn')?.addEventListener('click', loadPGN);

  // PGN toggle
  document.getElementById('pgn-toggle')?.addEventListener('click', () => {
    const form = document.getElementById('pgn-form');
    const tog  = document.getElementById('pgn-toggle');
    if (!form) return;
    const hidden = form.classList.toggle('hidden');
    if (tog) tog.textContent = hidden ? '⬇ Load PGN' : '⬆ Hide PGN';
  });
  document.getElementById('ana-first')?.addEventListener('click', () => navigateAnalysis(0));
  document.getElementById('ana-last')?.addEventListener('click', () => navigateAnalysis(Infinity));
  document.getElementById('ana-prev')?.addEventListener('click', () => navigateAnalysis(App.analysisMoveIdx - 1));
  document.getElementById('ana-next')?.addEventListener('click', () => navigateAnalysis(App.analysisMoveIdx + 1));

  // Keyboard arrows
  document.addEventListener('keydown', e => {
    if (App.mode === 'analysis') {
      if (e.key === 'ArrowLeft') navigateAnalysis(App.analysisMoveIdx - 1);
      if (e.key === 'ArrowRight') navigateAnalysis(App.analysisMoveIdx + 1);
      if (e.key === 'ArrowUp') navigateAnalysis(0);
      if (e.key === 'ArrowDown') navigateAnalysis(Infinity);
    }
  });
}

/* ================================================================
   GAME CONFIG MODAL
   ================================================================ */
function openConfigModal(mode) {
  App.gameMode = mode;
  document.getElementById('modal-config-title').textContent =
    mode === 'pvai' ? 'Player vs AI' : 'Player vs Player';
  document.getElementById('ai-section').style.display = mode === 'pvai' ? '' : 'none';
  UI.showModal('modal-config');
}

/* ================================================================
   START GAME
   ================================================================ */
function startGame() {
  UI.hideModal('modal-config');
  App.chess = ChessEngine.createState();
  App.captures = { white: [], black: [] };
  App.evalHistory = [];
  App.currentEval = 0;
  App.prevEval = 0;
  App.aiThinking = false;

  // Determine player colour
  if (App.playerColor === 'random') {
    App.playerColor = Math.random() < 0.5 ? 'white' : 'black';
  }

  const isAI = App.gameMode === 'pvai';
  const whiteName = isAI
    ? (App.playerColor === 'white' ? 'You' : `Stockfish Lv${App.difficulty}`)
    : 'Player 1';
  const blackName = isAI
    ? (App.playerColor === 'black' ? 'You' : `Stockfish Lv${App.difficulty}`)
    : 'Player 2';

  UI.setPlayerNames(whiteName, blackName);

  // Clocks
  if (App.timeControl > 0) {
    App.clocks = { white: App.timeControl, black: App.timeControl };
    UI.updateClock('white', App.clocks.white);
    UI.updateClock('black', App.clocks.black);
    startClock(App.chess.turn);
  } else {
    UI.updateClock('white', null);
    UI.updateClock('black', null);
  }

  // Board
  App.flipped = isAI && App.playerColor === 'black';
  BoardRenderer.setFlipped(App.flipped);
  BoardRenderer.setLastMove(null);
  BoardRenderer.setSelected(null, null);
  BoardRenderer.setLegalTargets([]);
  BoardRenderer.setCheckSquare(null);

  App.mode = 'game';
  UI.showScreen('game-screen');
  UI.setActiveTurn('white');
  UI.updateEval(0);
  UI.buildMoveList([], 'moves-list', -1, null);
  UI.hideGameOver();

  // If AI plays white, make first move
  if (isAI && App.playerColor === 'black') {
    setTimeout(makeAIMove, 600);
  }

  // Get initial eval
  requestEval();
}

/* ================================================================
   BOARD INTERACTION
   ================================================================ */
let selectedFrom = null;

function handleDragStart(r, f) {
  const piece = App.chess?.board[r][f];
  if (!piece) return null;
  if (App.mode !== 'game') return null;
  if (!isPlayerTurn()) return null;
  if (ChessEngine.color(piece) !== App.chess.turn) return null;

  selectedFrom = { r, f };
  const moves = ChessEngine.legalMoves(App.chess.board, r, f, App.chess);
  BoardRenderer.setSelected(r, f);
  BoardRenderer.setLegalTargets(moves);
  return piece;
}

function handleDrop(fr, ff, tr, tf) {
  if (!selectedFrom || fr !== selectedFrom.r || ff !== selectedFrom.f) {
    selectedFrom = null;
    BoardRenderer.setSelected(null, null);
    BoardRenderer.setLegalTargets([]);
    return;
  }
  tryMove(fr, ff, tr, tf);
  selectedFrom = null;
}

function handleBoardClick(r, f) {
  if (App.mode !== 'game') return;
  if (!isPlayerTurn()) return;

  const chess = App.chess;
  const piece = chess.board[r][f];

  if (selectedFrom) {
    // Try to move
    if (r === selectedFrom.r && f === selectedFrom.f) {
      // Deselect
      selectedFrom = null;
      BoardRenderer.setSelected(null, null);
      BoardRenderer.setLegalTargets([]);
      return;
    }
    // Check if target is a legal move
    const moves = ChessEngine.legalMoves(chess.board, selectedFrom.r, selectedFrom.f, chess);
    const isLegal = moves.some(([tr, tf]) => tr === r && tf === f);
    if (isLegal) {
      tryMove(selectedFrom.r, selectedFrom.f, r, f);
      selectedFrom = null;
      return;
    }
    // Select new piece of same color
    if (piece && ChessEngine.color(piece) === chess.turn) {
      selectedFrom = { r, f };
      const newMoves = ChessEngine.legalMoves(chess.board, r, f, chess);
      BoardRenderer.setSelected(r, f);
      BoardRenderer.setLegalTargets(newMoves);
      return;
    }
    selectedFrom = null;
    BoardRenderer.setSelected(null, null);
    BoardRenderer.setLegalTargets([]);
    return;
  }

  if (piece && ChessEngine.color(piece) === chess.turn) {
    selectedFrom = { r, f };
    const moves = ChessEngine.legalMoves(chess.board, r, f, chess);
    BoardRenderer.setSelected(r, f);
    BoardRenderer.setLegalTargets(moves);
  }
}

function isPlayerTurn() {
  if (App.gameMode === 'pvp') return true;
  if (App.aiThinking) return false;
  return App.chess.turn === App.playerColor;
}

function tryMove(fr, ff, tr, tf) {
  const chess = App.chess;
  const piece = chess.board[fr][ff];
  const pt = ChessEngine.pieceOf(piece);
  const col = ChessEngine.color(piece);

  // Check legal
  const moves = ChessEngine.legalMoves(chess.board, fr, ff, chess);
  const legalMove = moves.find(([mr, mf]) => mr === tr && mf === tf);
  if (!legalMove) {
    BoardRenderer.setSelected(null, null);
    BoardRenderer.setLegalTargets([]);
    return;
  }

  const flag = legalMove[2];
  const isPromotion = pt === 'p' && (tr === 0 || tr === 7);

  if (isPromotion) {
    App.pendingPromotion = { fr, ff, tr, tf, flag };
    UI.showPromotion(col, (promPiece) => {
      App.pendingPromotion = null;
      executeMove(fr, ff, tr, tf, promPiece, flag);
    });
  } else {
    executeMove(fr, ff, tr, tf, null, flag);
  }
}

function executeMove(fr, ff, tr, tf, promotion, flag) {
  const chess = App.chess;
  const capturedPiece = chess.board[tr][tf];

  // Animate piece movement
  const movingPiece = chess.board[fr][ff];
  BoardRenderer.animateMove(movingPiece, fr, ff, tr, tf, () => {});

  // Store eval before move
  App.prevEval = App.currentEval;

  // Make move
  const san = ChessEngine.makeMove(chess, fr, ff, tr, tf, promotion, flag);

  // Track captures
  if (capturedPiece) {
    const capturingColor = ChessEngine.isWhite(movingPiece) ? 'white' : 'black';
    App.captures[capturingColor].push(capturedPiece);
    UI.updateCaptures(
      UI.buildCaptureString(App.captures.white),
      UI.buildCaptureString(App.captures.black)
    );
  }

  // Update board visual state
  BoardRenderer.setLastMove({ fr, ff, tr, tf });
  BoardRenderer.setSelected(null, null);
  BoardRenderer.setLegalTargets([]);

  // Check state
  const inCheck = ChessEngine.inCheck(chess.board, chess.turn);
  if (inCheck) {
    // Find king
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = chess.board[r][f];
        if (p && ChessEngine.color(p) === chess.turn && ChessEngine.pieceOf(p) === 'k') {
          BoardRenderer.setCheckSquare({ r, f });
        }
      }
    }
  } else {
    BoardRenderer.setCheckSquare(null);
  }

  // Clocks
  if (App.timeControl > 0) {
    const prevTurn = chess.turn === 'white' ? 'black' : 'white';
    stopClock();
    startClock(chess.turn);
  }

  // Update turn indicator
  UI.setActiveTurn(chess.turn);

  // Update move list
  UI.buildMoveList(chess.history, 'moves-list', chess.history.length - 1, null);

  // Check game status
  const status = ChessEngine.getStatus(chess);
  if (status) {
    stopClock();
    const pgn = ChessEngine.toPGN(chess, {
      white: App.gameMode === 'pvai' ? (App.playerColor === 'white' ? 'You' : `Stockfish`) : 'Player 1',
      black: App.gameMode === 'pvai' ? (App.playerColor === 'black' ? 'You' : `Stockfish`) : 'Player 2',
      result: status.winner === 'white' ? '1-0' : status.winner === 'black' ? '0-1' : '1/2-1/2',
    });
    saveGame(pgn);
    setTimeout(() => UI.showGameOver(status.result, status.winner, pgn), 400);
    return;
  }

  // Get eval + classify move
  requestEval();

  // AI move
  if (App.gameMode === 'pvai' && chess.turn !== App.playerColor) {
    setTimeout(makeAIMove, 400 + Math.random() * 300);
  }
}

/* ================================================================
   AI MOVE
   ================================================================ */
function makeAIMove() {
  if (App.mode !== 'game' || App.aiThinking) return;
  const status = ChessEngine.getStatus(App.chess);
  if (status) return;

  App.aiThinking = true;
  const fen = ChessEngine.toFEN(App.chess);
  const depth = Math.max(8, App.difficulty);

  StockfishEngine.getBestMove(fen, depth, (uci) => {
    App.aiThinking = false;
    if (App.mode !== 'game') return;

    let move = StockfishEngine.uciToMove(uci);
    if (!move) move = StockfishEngine.fallbackMove(App.chess);
    if (!move) return;

    // Verify legal
    const moves = ChessEngine.legalMoves(App.chess.board, move.fr, move.ff, App.chess);
    const legalMove = moves.find(([tr, tf]) => tr === move.tr && tf === move.tf);
    if (!legalMove) {
      const fallback = StockfishEngine.fallbackMove(App.chess);
      if (fallback) executeMove(fallback.fr, fallback.ff, fallback.tr, fallback.tf, null, fallback.flag);
      return;
    }

    executeMove(move.fr, move.ff, move.tr, move.tf, move.promotion, legalMove[2]);
  }, null);
}

/* ================================================================
   EVAL
   ================================================================ */
function requestEval() {
  const fen = ChessEngine.toFEN(App.chess);
  StockfishEngine.getEvaluation(fen, 14, (ev) => {
    if (ev && App.mode === 'game') {
      const score = App.chess.turn === 'white' ? ev.score : -ev.score;
      App.currentEval = score;
      App.evalHistory.push(score);
      UI.updateEval(score);

      // Classify last move
      if (App.chess.history.length > 0) {
        const wasWhiteTurn = App.chess.history.length % 2 === 1; // last move was white's
        const cls = StockfishEngine.classifyMove(App.prevEval, score, !wasWhiteTurn);
        const lastMv = App.chess.history[App.chess.history.length - 1];
        lastMv.cls = cls;
        UI.showMoveBadge(cls);
        UI.buildMoveList(App.chess.history, 'moves-list', App.chess.history.length - 1, null);
      }

      // Best move display
      if (ev.pv && ev.pv.length > 0) UI.updateBestMove(ev.pv[0]);
    }
  });
}

/* ================================================================
   UNDO / REDO
   ================================================================ */
function handleUndo() {
  if (!App.chess || App.aiThinking) return;
  // If vs AI, undo two moves (player + AI)
  const undoCount = App.gameMode === 'pvai' ? 2 : 1;
  for (let i = 0; i < undoCount; i++) {
    if (App.chess.history.length === 0) break;
    ChessEngine.undoMove(App.chess);
  }
  afterUndoRedo();
}

function handleRedo() {
  if (!App.chess || App.aiThinking) return;
  const redoCount = App.gameMode === 'pvai' ? 2 : 1;
  for (let i = 0; i < redoCount; i++) {
    if (App.chess.redoStack.length === 0) break;
    ChessEngine.redoMove(App.chess);
  }
  afterUndoRedo();
}

function afterUndoRedo() {
  const chess = App.chess;
  const last = chess.history[chess.history.length - 1];
  if (last) {
    BoardRenderer.setLastMove({ fr: last.fr, ff: last.ff, tr: last.tr, tf: last.tf });
  } else {
    BoardRenderer.setLastMove(null);
  }
  BoardRenderer.setSelected(null, null);
  BoardRenderer.setLegalTargets([]);
  BoardRenderer.setCheckSquare(null);
  UI.setActiveTurn(chess.turn);
  UI.updateEval(0);
  UI.buildMoveList(chess.history, 'moves-list', chess.history.length - 1, null);
  UI.hideGameOver();
  stopClock();
  if (App.timeControl > 0) startClock(chess.turn);
}

/* ================================================================
   CLOCKS
   ================================================================ */
function startClock(color) {
  if (App.timeControl === 0) return;
  App.clockActive = true;
  App.clockInterval = setInterval(() => {
    if (!App.clockActive) return;
    App.clocks[color]--;
    UI.updateClock(color, App.clocks[color]);
    if (App.clocks[color] <= 0) {
      stopClock();
      const winner = color === 'white' ? 'black' : 'white';
      UI.showGameOver('timeout', winner, ChessEngine.toPGN(App.chess));
    }
  }, 1000);
}

function stopClock() {
  App.clockActive = false;
  clearInterval(App.clockInterval);
}

/* ================================================================
   ANALYSIS MODE  — powered by AnalysisSystem (WintrChess algorithm)
   ================================================================ */

// Make enterAnalysisFromGame globally accessible
window.enterAnalysisFromGame = function() {
  if (!App.chess) { enterAnalysis(); return; }
  App.analysisChess = App.chess;
  App.analysisMoveIdx = App.chess.history.length - 1;
  _openAnalysisScreen();
  _startAnalysis(App.chess);
};

function enterAnalysis() {
  App.analysisChess = ChessEngine.createState();
  App.analysisMoveIdx = -1;
  _openAnalysisScreen();
}

function _openAnalysisScreen() {
  App.mode = 'analysis';
  UI.showScreen('analysis-screen');
  AnalysisSystem.setNavigateCallback((ply) => {
    App.analysisMoveIdx = ply;
    _renderAnalysisBoardAt(ply);
  });
  _renderAnalysisBoardAt(App.analysisMoveIdx);
  if (App.chess && App.chess.history.length) {
    const pgnEl = document.getElementById('pgn-input');
    if (pgnEl) pgnEl.value = ChessEngine.toPGN(App.chess);
  }
}

function enterAnalysisFromGame() { window.enterAnalysisFromGame(); }

function _startAnalysis(chessState) {
  if (!chessState || !chessState.history.length) return;
  const badge = document.getElementById('analysis-status-badge');
  if (badge) badge.textContent = 'Analysing…';
  AnalysisSystem.renderMoveList(-1);

  AnalysisSystem.analyse(chessState, {
    onProgress: (ply, total) => {
      AnalysisSystem.renderProgress(ply, total);
      if (ply % 4 === 0) AnalysisSystem.renderMoveList(App.analysisMoveIdx);
    },
    onComplete: (results) => {
      AnalysisSystem.hideProgress();
      if (badge) badge.textContent = '✓ Done';
      AnalysisSystem.renderAll(results);
      App.analysisMoveIdx = chessState.history.length - 1;
      AnalysisSystem.setCurrentPly(App.analysisMoveIdx, results);
      _renderAnalysisBoardAt(App.analysisMoveIdx);
      const whiteName = App.gameMode === 'pvai'
        ? (App.playerColor === 'white' ? 'You' : `Stockfish Lv${App.difficulty}`) : 'White';
      const blackName = App.gameMode === 'pvai'
        ? (App.playerColor === 'black' ? 'You' : `Stockfish Lv${App.difficulty}`) : 'Black';
      AnalysisSystem.showGameSummary(results, { whiteName, blackName });
    },
    onError: (e) => {
      console.error('Analysis error:', e);
      if (badge) badge.textContent = '⚠ Error';
    },
  });
}

function loadPGN() {
  const pgn = document.getElementById('pgn-input')?.value?.trim();
  if (!pgn) return;
  try {
    const state = ChessEngine.parsePGN(pgn);
    App.analysisChess = state;
    App.analysisMoveIdx = -1;
    AnalysisSystem.abort();
    _renderAnalysisBoardAt(-1);
    _startAnalysis(state);
  } catch (e) {
    console.error('PGN parse error:', e);
    alert('Could not parse PGN.');
  }
}

function navigateAnalysis(idx) {
  if (!App.analysisChess) return;
  const hist = AnalysisSystem.state.history.length
    ? AnalysisSystem.state.history : (App.analysisChess.history || []);
  const maxIdx = hist.length - 1;
  const newIdx = idx === Infinity ? maxIdx : Math.max(-1, Math.min(maxIdx, idx));
  App.analysisMoveIdx = newIdx;
  AnalysisSystem.navigateTo(newIdx);
  _renderAnalysisBoardAt(newIdx);
}

function _renderAnalysisBoardAt(ply) {
  const hist = AnalysisSystem.state.history.length
    ? AnalysisSystem.state.history
    : (App.analysisChess ? App.analysisChess.history : []);
  const state = ChessEngine.createState();
  for (let i = 0; i <= ply && i < hist.length; i++) {
    const mv = hist[i];
    ChessEngine.makeMove(state, mv.fr, mv.ff, mv.tr, mv.tf, mv.promotion, mv.flag);
  }
  const lastMv = ply >= 0 && ply < hist.length ? hist[ply] : null;
  AnalysisBoardRenderer.drawState(state, lastMv, App.season);
  if (lastMv && lastMv.evalAfter != null) UI.updateEval(lastMv.evalAfter);
}

/* ================================================================
   NAVIGATION
   ================================================================ */
function returnToMenu() {
  stopClock();
  App.aiThinking = false;
  StockfishEngine.stop();
  App.mode = 'menu';
  UI.showScreen('main-menu');
}

/* ================================================================
   SAVE / LOAD
   ================================================================ */
function saveGame(pgn) {
  try {
    const games = JSON.parse(localStorage.getItem('saved_games') || '[]');
    games.unshift({ date: new Date().toISOString(), pgn });
    if (games.length > 10) games.pop();
    localStorage.setItem('saved_games', JSON.stringify(games));
  } catch (e) {}
}

/* ================================================================
   ANALYSIS BOARD RENDERER
   A thin wrapper for the analysis board canvas
   ================================================================ */
const AnalysisBoardRenderer = (() => {
  let canvas, ctx, size = 580, squareSize;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    size = rect.width || 580;
    squareSize = size / 8;
    canvas.width = size * window.devicePixelRatio;
    canvas.height = size * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  function drawState(state, lastMoveRecord) {
    if (!ctx) return;
    // Reuse BoardRenderer internals
    BoardRenderer.setFlipped(false);
    if (lastMoveRecord) {
      BoardRenderer.setLastMove({ fr: lastMoveRecord.fr, ff: lastMoveRecord.ff, tr: lastMoveRecord.tr, tf: lastMoveRecord.tf });
    } else {
      BoardRenderer.setLastMove(null);
    }
    BoardRenderer.setSelected(null, null);
    BoardRenderer.setLegalTargets([]);
    // Draw on analysis canvas directly
    drawOnCanvas(state);
  }

  function drawOnCanvas(state) {
    if (!ctx) return;
    // Simple draw — shares piece rendering logic
    ctx.clearRect(0, 0, size, size);

    // Draw to main board canvas temporarily not ideal; instead draw directly
    drawBoard(ctx, size, squareSize, BoardRenderer._season || 'winter');
    if (state) drawPieces(ctx, state, size, squareSize);
    drawCoords(ctx, size, squareSize);
  }

  function draw(state) {
    if (!canvas || !ctx) return;
    drawOnCanvas(state);
  }

  const PIECE_SYMBOLS = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
  };

  const SEASON_COLORS = {
    winter: { light: '#c8d8f0', dark: '#2a3a5a', border: '#4a6a9a' },
    summer: { light: '#e8d8b0', dark: '#5a3a1a', border: '#9a7040' },
    rainy:  { light: '#b0b8c8', dark: '#2a2e38', border: '#4a5060' },
    autumn: { light: '#d8c090', dark: '#4a2810', border: '#8a5820' },
  };

  function drawBoard(ctx, size, sq, season) {
    const cols = SEASON_COLORS[season] || SEASON_COLORS.winter;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const isLight = (r + f) % 2 === 0;
        ctx.fillStyle = isLight ? cols.light : cols.dark;
        ctx.fillRect(f * sq, r * sq, sq, sq);
      }
    }
    ctx.strokeStyle = (cols.border || '#666') + '55';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }

  function drawPieces(ctx, state, size, sq) {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = state.board[r][f];
        if (!piece) continue;
        const col = ChessEngine.isWhite(piece) ? 'white' : 'black';
        const symbol = PIECE_SYMBOLS[piece];
        const cx = f * sq + sq / 2;
        const cy = r * sq + sq / 2;
        const fontSize = sq * 0.72;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = sq * 0.1;
        ctx.font = `${fontSize}px "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = col === 'white' ? '#fff8f0' : '#1a1008';
        ctx.fillText(symbol, cx, cy);
        ctx.restore();
      }
    }
  }

  function drawCoords(ctx, size, sq) {
    const files = 'abcdefgh';
    ctx.font = `500 ${sq * 0.18}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = 'rgba(150,150,180,0.5)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    for (let i = 0; i < 8; i++) ctx.fillText(files[i], (i+1)*sq - 2, 8*sq - 2);
  }

  // Draw best-move arrow on overlay canvas
  function highlightBestMove(uci) {
    const arrowCanvas = document.getElementById('ana-arrow-canvas');
    if (!arrowCanvas || !uci || uci.length < 4) return;
    const files = 'abcdefgh';
    const ff = files.indexOf(uci[0]);
    const fr = 8 - parseInt(uci[1]);
    const tf = files.indexOf(uci[2]);
    const tr = 8 - parseInt(uci[3]);
    const rect = canvas.getBoundingClientRect();
    const sz = rect.width || 580;
    const sq = sz / 8;
    arrowCanvas.width  = sz * window.devicePixelRatio;
    arrowCanvas.height = sz * window.devicePixelRatio;
    arrowCanvas.style.width  = sz + 'px';
    arrowCanvas.style.height = sz + 'px';
    const ac = arrowCanvas.getContext('2d');
    ac.scale(window.devicePixelRatio, window.devicePixelRatio);
    ac.clearRect(0, 0, sz, sz);
    // Draw arrow
    const x1 = ff * sq + sq / 2, y1 = fr * sq + sq / 2;
    const x2 = tf * sq + sq / 2, y2 = tr * sq + sq / 2;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.hypot(x2 - x1, y2 - y1);
    ac.save();
    ac.globalAlpha = 0.72;
    ac.strokeStyle = '#1baca6'; ac.lineWidth = sq * 0.14;
    ac.lineCap = 'round';
    ac.beginPath();
    ac.moveTo(x1, y1);
    ac.lineTo(x2 - Math.cos(angle) * sq * 0.28, y2 - Math.sin(angle) * sq * 0.28);
    ac.stroke();
    // Arrowhead
    ac.fillStyle = '#1baca6';
    ac.beginPath();
    ac.translate(x2, y2);
    ac.rotate(angle);
    ac.moveTo(0, 0);
    ac.lineTo(-sq * 0.28, -sq * 0.14);
    ac.lineTo(-sq * 0.28,  sq * 0.14);
    ac.closePath(); ac.fill();
    ac.restore();
  }

  return { init, draw, drawState, highlightBestMove };
})();

/* ================================================================
   BOOT
   ================================================================ */
document.addEventListener('DOMContentLoaded', init);
