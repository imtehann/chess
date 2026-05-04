/**
 * main.js — Application Controller
 * Orchestrates: screens, game state, interactions, AI, analysis
 */

// ============================================================
// APP STATE
// ============================================================
const App = {
  // Config
  mode: null,       // 'pvai' | 'pvp'
  playerColor: 'w',
  aiDifficulty: 10,
  timeControl: null,
  currentSeason: 'autumn',

  // Game
  gameState: null,
  history: [],      // [{state, move, san, quality, eval}]
  historyIdx: -1,
  redoStack: [],
  moveEvals: [],
  prevEval: 0,

  // Captured pieces
  whiteCaptured: [],
  blackCaptured: [],

  // UI
  selectedSq: null,
  legalMovesCache: [],
  flippedView: false,

  // Renderers
  envMain: null,
  boardRenderer: null,
  analysisEnv: null,
  analysisBoardRenderer: null,

  // Engine
  engineReady: false,
  isAiThinking: false,

  // Timers
  timer: null,

  // Analysis state
  analysisHistory: [],
  analysisIdx: 0,
  analysisFlipped: false,
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  App.timer = new UI.TimerSystem();

  await initEngine();
  setupMenuScreen();
  setupGameScreen();
  setupAnalysisScreen();
  loadSavedSeason();

  // Show menu
  showScreen('menu');
});

async function initEngine() {
  UI.setEngineStatus('loading');
  try {
    await window.stockfish.init();
    UI.setEngineStatus(window.stockfish._useMock ? 'mock' : 'ready');
    App.engineReady = true;
    window.stockfish.onInfo = (lines, ev) => {
      if (getCurrentScreen() !== 'game') return;
      UI.updateEngineLines(lines);
      UI.updateEvalBar(ev);
    };
  } catch (e) {
    console.error('Engine init failed:', e);
    UI.setEngineStatus('mock');
    App.engineReady = true;
  }
}

// ============================================================
// SCREEN MANAGEMENT
// ============================================================
function getCurrentScreen() {
  const screens = ['menu', 'setup', 'game', 'analysis'];
  for (const id of screens)
    if (document.getElementById(`${id}-screen`)?.classList.contains('active')) return id;
  return null;
}

function showScreen(name) {
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => { s.classList.remove('active'); s.style.opacity = '0'; });
  const target = document.getElementById(`${name}-screen`);
  if (!target) return;
  target.style.display = 'flex';
  requestAnimationFrame(() => {
    target.classList.add('active');
    target.style.opacity = '1';
  });

  // Init environment renderers for each screen
  if (name === 'menu' || name === 'setup') {
    setTimeout(() => {
      const cid = name === 'menu' ? 'menu-canvas' : 'setup-canvas';
      if (!App[`${name}Env`]) App[`${name}Env`] = new EnvironmentRenderer(cid);
      App[`${name}Env`].setSeason(App.currentSeason);
    }, 100);
  }
  if (name === 'game' && App.envMain) {
    App.envMain.setSeason(App.currentSeason);
  }
  if (name === 'analysis' && App.analysisEnv) {
    App.analysisEnv.setSeason(App.currentSeason);
  }
}

// ============================================================
// SEASON MANAGEMENT
// ============================================================
function setSeason(season) {
  App.currentSeason = season;
  localStorage.setItem('regis_season', season);

  // Update all active env renderers
  ['menuEnv', 'setupEnv', 'envMain', 'analysisEnv'].forEach(key => {
    App[key]?.setSeason(season);
  });

  // Sync all season UI elements
  document.querySelectorAll('[data-season]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.season === season);
  });
}

function loadSavedSeason() {
  const saved = localStorage.getItem('regis_season');
  if (saved) setSeason(saved);
}

// ============================================================
// MENU SCREEN
// ============================================================
function setupMenuScreen() {
  document.getElementById('btn-pvai').addEventListener('click', () => {
    App.mode = 'pvai';
    document.getElementById('diff-row').style.display = 'flex';
    document.getElementById('color-row').style.display = 'flex';
    showScreen('setup');
    App.setupEnv = new EnvironmentRenderer('setup-canvas');
    App.setupEnv.setSeason(App.currentSeason);
  });

  document.getElementById('btn-pvp').addEventListener('click', () => {
    App.mode = 'pvp';
    document.getElementById('diff-row').style.display = 'none';
    document.getElementById('color-row').style.display = 'none';
    showScreen('setup');
    App.setupEnv = new EnvironmentRenderer('setup-canvas');
    App.setupEnv.setSeason(App.currentSeason);
  });

  document.getElementById('btn-analysis').addEventListener('click', () => {
    startAnalysisMode();
  });

  // Season pills on menu
  document.querySelectorAll('.season-pill').forEach(btn => {
    btn.addEventListener('click', () => setSeason(btn.dataset.season));
  });
}

// ============================================================
// SETUP SCREEN
// ============================================================
function setupGameScreen() {
  // Color toggle
  let selectedColor = 'white';
  document.querySelectorAll('#color-row .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#color-row .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedColor = btn.dataset.val;
    });
  });

  // Difficulty
  const diffSlider = document.getElementById('diff-slider');
  const diffVal = document.getElementById('diff-val');
  diffSlider?.addEventListener('input', () => { diffVal.textContent = diffSlider.value; });

  // Time control
  let selectedTime = 'none';
  document.querySelectorAll('[data-val]').forEach(btn => {
    if (btn.closest('.setup-row:last-of-type')) {
      btn.addEventListener('click', () => {
        btn.closest('.toggle-group').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedTime = btn.dataset.val;
      });
    }
  });

  document.getElementById('btn-back-menu')?.addEventListener('click', () => showScreen('menu'));

  document.getElementById('btn-start-game')?.addEventListener('click', () => {
    const diff = parseInt(diffSlider?.value || 10);
    App.aiDifficulty = diff;
    App.timeControl = selectedTime === 'none' ? null : parseInt(selectedTime);

    if (App.mode === 'pvai') {
      if (selectedColor === 'random') {
        App.playerColor = Math.random() < 0.5 ? 'w' : 'b';
      } else {
        App.playerColor = selectedColor === 'white' ? 'w' : 'b';
      }
    } else {
      App.playerColor = 'w';
    }
    startNewGame();
  });

  // Season switcher in game
  document.querySelectorAll('.ss-btn').forEach(btn => {
    btn.addEventListener('click', () => setSeason(btn.dataset.season));
  });

  // Board controls
  document.getElementById('btn-flip')?.addEventListener('click', () => {
    if (App.boardRenderer) App.boardRenderer.flipBoard();
  });
  document.getElementById('btn-undo')?.addEventListener('click', undoMove);
  document.getElementById('btn-redo')?.addEventListener('click', redoMove);
  document.getElementById('btn-restart')?.addEventListener('click', () => {
    if (App.gameState) startNewGame();
  });
  document.getElementById('btn-menu')?.addEventListener('click', () => {
    App.timer?.stop();
    showScreen('menu');
  });
  document.getElementById('btn-pgn-export')?.addEventListener('click', exportPGN);
}

// ============================================================
// GAME INITIALIZATION
// ============================================================
function startNewGame() {
  // Clean up old renderer
  App.boardRenderer?.destroy();

  // Init game state
  App.gameState = Chess.fenToBoard(Chess.START_FEN);
  App.history = [];
  App.historyIdx = -1;
  App.redoStack = [];
  App.moveEvals = [0];
  App.prevEval = 0;
  App.selectedSq = null;
  App.legalMovesCache = [];
  App.whiteCaptured = [];
  App.blackCaptured = [];
  App.isAiThinking = false;

  showScreen('game');

  setTimeout(() => {
    // Init environment
    if (App.envMain) App.envMain.destroy();
    App.envMain = new EnvironmentRenderer('env-canvas');
    App.envMain.setSeason(App.currentSeason);

    // Init board
    App.boardRenderer = new BoardRenderer('board-canvas', 'piece-layer', 'overlay-layer');
    App.boardRenderer.state = App.gameState;
    App.boardRenderer.resize();

    // If player is black, flip board
    if (App.mode === 'pvai' && App.playerColor === 'b') {
      App.boardRenderer.flipped = true;
    }

    App.boardRenderer.drawBoard();
    App.boardRenderer.renderPieces();

    // Hook interactions
    App.boardRenderer.onSquareClick = handleSquareClick;
    App.boardRenderer.onDragStart = (r, c) => canInteract(r, c);
    App.boardRenderer.onDrop = (fromR, fromC, toR, toC) => handleDrop(fromR, fromC, toR, toC);

    // Timers
    App.timer.onTimeout = (color) => {
      const winner = color === 'w' ? 'black' : 'white';
      endGame(winner, 'timeout');
    };
    App.timer.init(App.timeControl);

    // Player names
    document.getElementById('white-name').textContent = App.mode === 'pvp' ? 'Player 1' : (App.playerColor === 'w' ? 'You' : `AI (${App.aiDifficulty})`);
    document.getElementById('black-name').textContent = App.mode === 'pvp' ? 'Player 2' : (App.playerColor === 'b' ? 'You' : `AI (${App.aiDifficulty})`);

    // Set engine difficulty
    if (App.engineReady && !window.stockfish._useMock) {
      window.stockfish.setSkillLevel(App.aiDifficulty);
    }

    // Start clock if white goes first
    App.timer.start('w');

    // If AI plays white, trigger AI move
    if (App.mode === 'pvai' && App.playerColor === 'b') {
      triggerAIMove();
    }

    // Initial eval
    requestEval();

    UI.updateEvalBar(0);
    UI.updateEngineLines([]);
    UI.renderMoveList('move-list', [], -1, null);
    UI.updateCaptured([], []);
  }, 300);
}

// ============================================================
// PIECE INTERACTION
// ============================================================
function canInteract(r, c) {
  if (!App.gameState) return false;
  if (App.isAiThinking) return false;
  const piece = App.gameState.board[r][c];
  if (!piece) return false;
  if (App.mode === 'pvai' && piece.color !== App.playerColor) return false;
  if (App.mode === 'pvp' && piece.color !== App.gameState.turn) return false;
  if (piece.color !== App.gameState.turn) return false;
  return true;
}

function handleSquareClick(r, c) {
  if (!App.gameState) return;

  if (App.selectedSq) {
    const { r: sr, c: sc } = App.selectedSq;

    // Check if clicking a legal move target
    const isLegal = App.legalMovesCache.some(m => m.to[0] === r && m.to[1] === c);
    if (isLegal) {
      const move = App.legalMovesCache.find(m => m.to[0] === r && m.to[1] === c);
      executeMove(move);
      return;
    }

    // Deselect or re-select
    clearSelection();
    if (canInteract(r, c)) selectSquare(r, c);
  } else {
    if (canInteract(r, c)) selectSquare(r, c);
  }
}

function handleDrop(fromR, fromC, toR, toC) {
  if (!App.gameState) return;
  if (!canInteract(fromR, fromC)) return;

  // Get legal moves from this square
  const legals = Chess.legalMoves(App.gameState, fromR, fromC);
  const move = legals.find(m => m.to[0] === toR && m.to[1] === toC);
  if (move) {
    clearSelection();
    executeMove(move);
  }
}

function selectSquare(r, c) {
  App.selectedSq = { r, c };
  App.legalMovesCache = Chess.legalMoves(App.gameState, r, c);

  App.boardRenderer.clearHighlights(['legal', 'selected']);
  App.boardRenderer.highlight(r, c, 'selected');
  App.legalMovesCache.forEach(m => App.boardRenderer.highlight(m.to[0], m.to[1], 'legal'));
  App.boardRenderer.drawBoard();
}

function clearSelection() {
  App.selectedSq = null;
  App.legalMovesCache = [];
  App.boardRenderer.clearHighlights(['legal', 'selected']);
  App.boardRenderer.drawBoard();
}

// ============================================================
// MOVE EXECUTION
// ============================================================
function executeMove(move, promotion = null) {
  const piece = App.gameState.board[move.from[0]][move.from[1]];

  // Check promotion
  if (piece.type === 'P' && (move.to[0] === 0 || move.to[0] === 7) && !promotion) {
    UI.showPromoDialog(piece.color, (pt) => executeMove(move, pt));
    return;
  }

  const san = Chess.moveToSan(App.gameState, move, promotion);
  const prevState = Chess.cloneState(App.gameState);

  // Animate
  App.boardRenderer.animateMove(move.from[0], move.from[1], move.to[0], move.to[1], () => {
    App.gameState = Chess.applyMove(App.gameState, move, promotion);
    App.boardRenderer.state = App.gameState;

    // Track captures
    const captured = prevState.board[move.to[0]][move.to[1]];
    if (captured) {
      if (captured.color === 'b') App.whiteCaptured.push(captured.type);
      else App.blackCaptured.push(captured.type);
      UI.updateCaptured(App.whiteCaptured, App.blackCaptured);
    }
    if (move.special === 'enpassant') {
      const ep = prevState.turn === 'w' ? 'P' : 'P';
      if (prevState.turn === 'w') App.whiteCaptured.push(ep);
      else App.blackCaptured.push(ep);
    }

    clearSelection();
    App.boardRenderer.setLastMove(move.from[0], move.from[1], move.to[0], move.to[1]);
    App.boardRenderer.drawBoard();
    App.boardRenderer.renderPieces();

    // Check highlight
    if (Chess.isInCheck(App.gameState, App.gameState.turn)) {
      const [kr, kc] = Chess.allLegalMoves(App.gameState).length === 0 ? findKingSquare(App.gameState) : findKingSquare(App.gameState);
      if (kr != null) App.boardRenderer.highlight(kr, kc, 'check');
      App.boardRenderer.drawBoard();
    }

    // Save to history
    App.history.push({ state: prevState, move, san, quality: null, eval: null, uci: moveToUCI(move, promotion) });
    App.historyIdx = App.history.length - 1;
    App.redoStack = [];

    // Timer switch
    App.timer.switch(App.gameState.turn);

    // Request eval and classify
    requestEvalAndClassify(prevState, App.history.length - 1, piece.color);

    // Update move list
    UI.renderMoveList('move-list', App.history, App.historyIdx, jumpToMove);

    // Save game state
    saveGameState();

    // Check game end
    const status = Chess.gameStatus(App.gameState);
    if (status.over) {
      setTimeout(() => endGame(status.result, status.reason), 300);
      return;
    }

    // AI turn
    if (App.mode === 'pvai' && App.gameState.turn !== App.playerColor) {
      triggerAIMove();
    }
  });
}

function findKingSquare(state) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (state.board[r][c]?.type === 'K' && state.board[r][c]?.color === state.turn) return [r, c];
  return [null, null];
}

function moveToUCI(move, promotion) {
  const files = 'abcdefgh';
  const from = files[move.from[1]] + (8 - move.from[0]);
  const to = files[move.to[1]] + (8 - move.to[0]);
  return from + to + (promotion ? promotion.toLowerCase() : '');
}

// ============================================================
// AI MOVE
// ============================================================
async function triggerAIMove() {
  if (App.isAiThinking || !App.engineReady) return;
  App.isAiThinking = true;
  UI.setEngineStatus('thinking');

  const fen = Chess.boardToFen(App.gameState);
  const depth = Math.max(5, Math.min(20, App.aiDifficulty));
  const movetime = App.timeControl ? Math.min(3000, (App.timer.times[App.gameState.turn] || 30) * 100) : null;

  const uci = await window.stockfish.getBestMove(fen, depth, movetime);
  App.isAiThinking = false;
  UI.setEngineStatus('ready');

  if (!uci || !App.gameState) return;

  // Parse UCI move
  const files = 'abcdefgh';
  const fc = files.indexOf(uci[0]);
  const fr = 8 - parseInt(uci[1]);
  const tc = files.indexOf(uci[2]);
  const tr = 8 - parseInt(uci[3]);
  const promo = uci[4] ? uci[4].toUpperCase() : null;

  const legals = Chess.legalMoves(App.gameState, fr, fc);
  const move = legals.find(m => m.to[0] === tr && m.to[1] === tc);
  if (move) executeMove(move, promo);
}

// ============================================================
// EVAL & CLASSIFICATION
// ============================================================
async function requestEval() {
  if (!App.engineReady || !App.gameState) return;
  const fen = Chess.boardToFen(App.gameState);
  window.stockfish.send('ucinewgame');
  window.stockfish.send(`position fen ${fen}`);
  window.stockfish.send('go depth 15');
}

async function requestEvalAndClassify(prevState, histIdx, movedColor) {
  if (!App.engineReady) return;
  const fen = Chess.boardToFen(App.gameState);

  // Get eval after move
  const result = await window.stockfish.analyze(fen, 14);
  const currentEval = result.score;

  App.moveEvals.push(currentEval);

  // Classify
  const quality = UI.classifyMove(App.prevEval, currentEval, movedColor);
  if (App.history[histIdx]) App.history[histIdx].quality = quality;
  if (App.history[histIdx]) App.history[histIdx].eval = currentEval;
  App.prevEval = currentEval;

  UI.updateEvalBar(currentEval);
  UI.showMoveQuality(quality);
  UI.renderMoveList('move-list', App.history, App.historyIdx, jumpToMove);
}

// ============================================================
// UNDO / REDO
// ============================================================
function undoMove() {
  if (App.historyIdx < 0) return;
  if (App.isAiThinking) { window.stockfish.stop(); App.isAiThinking = false; }

  const entry = App.history[App.historyIdx];
  App.redoStack.push(App.history.pop());
  App.historyIdx--;

  App.gameState = entry.state;
  App.boardRenderer.state = App.gameState;

  // Restore last move highlight
  const prev = App.history[App.historyIdx];
  if (prev) App.boardRenderer.setLastMove(prev.move.from[0], prev.move.from[1], prev.move.to[0], prev.move.to[1]);
  else App.boardRenderer.setLastMove(null);

  App.boardRenderer.drawBoard();
  App.boardRenderer.renderPieces();
  App.timer.switch(App.gameState.turn);
  UI.renderMoveList('move-list', App.history, App.historyIdx, jumpToMove);
  saveGameState();

  // If AI just moved, skip another AI turn
}

function redoMove() {
  if (App.redoStack.length === 0) return;
  const entry = App.redoStack.pop();
  App.gameState = Chess.applyMove(Chess.cloneState(entry.state), entry.move, null);
  App.boardRenderer.state = App.gameState;
  App.history.push(entry);
  App.historyIdx++;

  App.boardRenderer.setLastMove(entry.move.from[0], entry.move.from[1], entry.move.to[0], entry.move.to[1]);
  App.boardRenderer.drawBoard();
  App.boardRenderer.renderPieces();
  App.timer.switch(App.gameState.turn);
  UI.renderMoveList('move-list', App.history, App.historyIdx, jumpToMove);
  saveGameState();
}

// ============================================================
// GAME END
// ============================================================
function endGame(result, reason) {
  App.timer.stop();
  App.isAiThinking = false;
  window.stockfish.stop?.();

  const pgn = generateCurrentPGN(result);

  UI.showGameOver(result, reason, pgn,
    () => startAnalysisMode(App.history, App.moveEvals),
    () => startNewGame()
  );

  // Save analysis data
  localStorage.setItem('regis_last_pgn', pgn);
  localStorage.setItem('regis_last_history', JSON.stringify(App.history.map(h => ({ san: h.san, uci: h.uci, quality: h.quality, eval: h.eval }))));
}

// ============================================================
// ANALYSIS MODE
// ============================================================
function setupAnalysisScreen() {
  // Will be set up in startAnalysisMode
  document.getElementById('btn-back-from-analysis')?.addEventListener('click', () => showScreen('menu'));
  document.getElementById('btn-pgn-copy')?.addEventListener('click', () => {
    const ta = document.getElementById('pgn-textarea');
    if (ta) { navigator.clipboard.writeText(ta.value).catch(() => {}); }
  });
  document.getElementById('btn-analyze-run')?.addEventListener('click', runFullAnalysis);
}

function startAnalysisMode(history, evalHistory) {
  App.analysisHistory = history || (JSON.parse(localStorage.getItem('regis_last_history') || '[]'));
  App.analysisEvals = evalHistory || [0];
  App.analysisIdx = App.analysisHistory.length;

  showScreen('analysis');

  setTimeout(() => {
    if (App.analysisEnv) App.analysisEnv.destroy();
    App.analysisEnv = new EnvironmentRenderer('analysis-env-canvas');
    App.analysisEnv.setSeason(App.currentSeason);

    // Init board for analysis
    App.analysisBoardRenderer?.destroy();
    App.analysisBoardRenderer = new BoardRenderer('analysis-board-canvas', 'analysis-piece-layer', 'analysis-overlay-layer');

    // Build board state at analysis idx
    let state = Chess.fenToBoard(Chess.START_FEN);
    for (let i = 0; i < App.analysisIdx; i++) {
      const h = App.analysisHistory[i];
      if (h?.move) state = Chess.applyMove(state, h.move, null);
    }
    App.analysisBoardRenderer.state = state;
    App.analysisBoardRenderer.resize();
    App.analysisBoardRenderer.drawBoard();
    App.analysisBoardRenderer.renderPieces();

    // Nav buttons
    document.getElementById('a-first').onclick = () => gotoAnalysisMove(0);
    document.getElementById('a-prev').onclick = () => gotoAnalysisMove(App.analysisIdx - 1);
    document.getElementById('a-next').onclick = () => gotoAnalysisMove(App.analysisIdx + 1);
    document.getElementById('a-last').onclick = () => gotoAnalysisMove(App.analysisHistory.length);
    document.getElementById('a-flip').onclick = () => App.analysisBoardRenderer?.flipBoard();

    keyboard moves
    document.onkeydown = (e) => {
      if (getCurrentScreen() !== 'analysis') return;
      if (e.key === 'ArrowLeft') gotoAnalysisMove(App.analysisIdx - 1);
      if (e.key === 'ArrowRight') gotoAnalysisMove(App.analysisIdx + 1);
    };

    // Render move list
    UI.renderMoveList('analysis-move-list', App.analysisHistory, App.analysisIdx - 1, (idx) => gotoAnalysisMove(idx + 1));

    // PGN
    const pgn = generateCurrentPGN('*');
    document.getElementById('pgn-textarea').value = pgn;

    // Eval graph
    UI.drawEvalGraph('eval-graph-canvas', App.analysisEvals);

    // Accuracy
    const acc = UI.computeAccuracy(App.analysisHistory);
    document.getElementById('white-accuracy').textContent = acc.white ?? '—';
    document.getElementById('black-accuracy').textContent = acc.black ?? '—';

  }, 300);
}

function gotoAnalysisMove(idx) {
  idx = Math.max(0, Math.min(App.analysisHistory.length, idx));
  App.analysisIdx = idx;

  let state = Chess.fenToBoard(Chess.START_FEN);
  let lastMove = null;
  for (let i = 0; i < idx; i++) {
    const h = App.analysisHistory[i];
    if (h?.move) {
      lastMove = h.move;
      state = Chess.applyMove(state, h.move, null);
    }
  }

  App.analysisBoardRenderer.state = state;
  App.analysisBoardRenderer.clearHighlights();
  if (lastMove) App.analysisBoardRenderer.setLastMove(lastMove.from[0], lastMove.from[1], lastMove.to[0], lastMove.to[1]);
  App.analysisBoardRenderer.drawBoard();
  App.analysisBoardRenderer.renderPieces();

  UI.renderMoveList('analysis-move-list', App.analysisHistory, idx - 1, (i) => gotoAnalysisMove(i + 1));

  // Eval bar from stored eval
  if (App.analysisEvals[idx] !== undefined) UI.updateEvalBar(App.analysisEvals[idx]);
}

async function runFullAnalysis() {
  const btn = document.getElementById('btn-analyze-run');
  if (btn) btn.textContent = 'Analyzing…';

  let state = Chess.fenToBoard(Chess.START_FEN);
  const evals = [0];
  const newHistory = [...App.analysisHistory];

  for (let i = 0; i < newHistory.length; i++) {
    const h = newHistory[i];
    if (!h?.move) continue;
    const prevEv = evals[evals.length - 1] || 0;
    state = Chess.applyMove(state, h.move, null);
    const fen = Chess.boardToFen(state);
    const res = await window.stockfish.analyze(fen, 12);
    evals.push(res.score);
    const color = i % 2 === 0 ? 'w' : 'b';
    h.quality = UI.classifyMove(prevEv, res.score, color);
    h.eval = res.score;
  }

  App.analysisEvals = evals;
  App.analysisHistory = newHistory;

  UI.drawEvalGraph('eval-graph-canvas', evals);
  const acc = UI.computeAccuracy(newHistory);
  document.getElementById('white-accuracy').textContent = acc.white ?? '—';
  document.getElementById('black-accuracy').textContent = acc.black ?? '—';
  UI.renderMoveList('analysis-move-list', newHistory, App.analysisIdx - 1, (i) => gotoAnalysisMove(i + 1));

  if (btn) btn.textContent = 'Analysis Complete ✓';
}

// ============================================================
// PGN
// ============================================================
function generateCurrentPGN(result) {
  const headers = {
    white: document.getElementById('white-name')?.textContent || 'White',
    black: document.getElementById('black-name')?.textContent || 'Black'
  };
  const moveTexts = App.history.map(h => h.san);
  return Chess.generatePGN(App.history, moveTexts, result === 'draw' ? '1/2-1/2' : result === 'white' ? '1-0' : result === 'black' ? '0-1' : '*', headers);
}

function exportPGN() {
  const pgn = generateCurrentPGN('*');
  const blob = new Blob([pgn], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'regis_game.pgn';
  a.click();
}

function jumpToMove(idx) {
  // Navigate history in game mode (view only, don't change actual game)
  // For simplicity, just highlight the move in the list
  App.historyIdx = idx;
  UI.renderMoveList('move-list', App.history, idx, jumpToMove);
}

// ============================================================
// SAVE / LOAD
// ============================================================
function saveGameState() {
  try {
    const saveData = {
      fen: Chess.boardToFen(App.gameState),
      history: App.history.map(h => ({ san: h.san, uci: h.uci, quality: h.quality, eval: h.eval })),
      mode: App.mode,
      playerColor: App.playerColor,
      aiDifficulty: App.aiDifficulty,
      timeControl: App.timeControl,
      season: App.currentSeason,
    };
    localStorage.setItem('regis_save', JSON.stringify(saveData));
  } catch (e) {}
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', (e) => {
  if (getCurrentScreen() === 'game') {
    if (e.key === 'ArrowLeft' || (e.ctrlKey && e.key === 'z')) undoMove();
    if (e.key === 'ArrowRight' || (e.ctrlKey && e.key === 'y')) redoMove();
    if (e.key === 'f') App.boardRenderer?.flipBoard();
    if (e.key === 'Escape') clearSelection();
  }
});

// Fix the syntax error (comment in code)
// Remove invalid JS comment from keyboard moves block
