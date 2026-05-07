/* main.js — Application orchestrator */

const App = (() => {

  /* ── State ─────────────────────────────────────────────── */
  let gameMode     = 'vs-ai';   // 'vs-ai' | 'vs-human' | 'analysis'
  let aiColor      = 'b';       // AI plays black by default
  let currentTheme = 'winter';
  let engineReady  = false;
  let engineDepth  = 3;
  let engineSkill  = 3;

  // Move analysis state
  let fenHistory      = [];       // FEN after each half-move
  let moveHistory     = [];       // verbose move objects
  let annotations     = {};       // index → {label, cls}
  let evalsBefore     = [];       // eval before each move
  let evalsAfter      = [];       // eval after each move
  let lastEvalCP      = 0;

  // Undo/redo stacks
  let undoStack  = [];
  let redoStack  = [];

  // Analysis mode
  let analysisMode = false;
  let analysisFenIndex = -1;

  /* ── Boot ──────────────────────────────────────────────── */
  function boot() {
    // Init effects
    Effects.init('env-canvas', 'menu-bg-canvas');
    Effects.startMenuLoop();

    // Load saved state
    loadState();

    // Init engine
    Engine.init({
      onReady: (ok) => {
        engineReady = ok;
        if (ok) {
          console.log('[App] Stockfish ready');
          Engine.setDifficulty(engineDepth, engineSkill);
        }
      },
      onEval: (info) => {
        if (!info || info.evalCP === undefined) return;
        lastEvalCP = info.evalCP;
        UI.updateEvalBar(info.evalCP, info.mate);
        UI.updateBestMove(
          info.pv && info.pv[0] ? formatMove(info.pv[0]) : null,
          info.pv,
          info.depth
        );
        Engine.pushEval(info.evalCP);
      },
      onBestMove: (move) => {
        handleAIMove(move);
      }
    });

    // Wire up all UI events
    bindMenuEvents();
    bindGameEvents();

    UI.showScreen('menu-screen');
  }

  /* ── Menu events ────────────────────────────────────────── */
  function bindMenuEvents() {
    document.getElementById('btn-vs-ai')?.addEventListener('click', () => startGame('vs-ai'));
    document.getElementById('btn-vs-human')?.addEventListener('click', () => startGame('vs-human'));
    document.getElementById('btn-analysis')?.addEventListener('click', () => startGame('analysis'));

    // Difficulty selector
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        engineDepth = parseInt(this.dataset.depth);
        engineSkill = parseInt(this.dataset.skill);
        Engine.setDifficulty(engineDepth, engineSkill);
      });
    });

    // Theme selector
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        setTheme(this.dataset.theme);
      });
    });
  }

  /* ── Game events ─────────────────────────────────────────── */
  function bindGameEvents() {
    document.getElementById('btn-menu-back')?.addEventListener('click', goToMenu);
    document.getElementById('btn-undo')?.addEventListener('click', undoMove);
    document.getElementById('btn-redo')?.addEventListener('click', redoMove);
    document.getElementById('btn-restart')?.addEventListener('click', restartGame);
    document.getElementById('btn-theme-cycle')?.addEventListener('click', cycleTheme);
    document.getElementById('btn-export-pgn')?.addEventListener('click', () => UI.exportPGN(Board.getPgn()));
    document.getElementById('btn-analyze')?.addEventListener('click', runFullAnalysis);
    document.getElementById('btn-sound-toggle')?.addEventListener('click', function() {
      const on = Effects.toggleSound();
      this.textContent = on ? '🔊' : '🔇';
    });
  }

  /* ── Start game ─────────────────────────────────────────── */
  function startGame(mode) {
    gameMode = mode;
    resetGameState();

    // Init board
    Board.init(onMove, onSelect);

    UI.showScreen('game-screen');
    Effects.stopMenuLoop();
    Effects.startGameLoop();
    Effects.setTheme(currentTheme);
    UI.setTheme(currentTheme);

    // Set player names
    const wName = document.getElementById('white-player-name');
    const bName = document.getElementById('black-player-name');
    if (mode === 'vs-ai') {
      if (wName) wName.textContent = 'You';
      if (bName) bName.textContent = 'Stockfish';
    } else {
      if (wName) wName.textContent = 'White';
      if (bName) bName.textContent = 'Black';
    }

    document.getElementById('game-mode-label').textContent =
      mode === 'vs-ai' ? 'Player vs AI' :
      mode === 'vs-human' ? 'Player vs Player' : 'Analysis Mode';

    UI.updatePlayerBars('w', null);
    UI.resetEvalBar();

    // Initial evaluation
    if (engineReady) {
      Engine.newGame();
      Engine.evaluate(Board.getFen(), engineDepth);
    }

    // If analysis mode start with engine on
    if (mode === 'analysis') {
      analysisMode = true;
    }
  }

  function resetGameState() {
    fenHistory   = [];
    moveHistory  = [];
    annotations  = {};
    evalsBefore  = [];
    evalsAfter   = [];
    lastEvalCP   = 0;
    undoStack    = [];
    redoStack    = [];
    analysisMode = false;
    analysisFenIndex = -1;
    Engine.clearEvalHistory();
    UI.updateMoveTable([], {});
    document.getElementById('accuracy-section').style.display = 'none';
  }

  /* ── Move handler (from Board) ──────────────────────────── */
  function onMove(result, chess) {
    const turn = chess.turn(); // turn AFTER move

    // Push undo state
    undoStack.push({
      fen: fenHistory[fenHistory.length - 1] || new Chess().fen(),
      move: result
    });
    redoStack = [];

    // Record FEN & move
    fenHistory.push(chess.fen());
    moveHistory.push(result);

    // Store eval before (we'll get after from engine)
    evalsBefore.push(lastEvalCP);

    // Sound
    playSoundForMove(result);

    // Animate bloom flash on last move square
    Board.animatePieceMove(result.from, result.to);

    // Update UI
    UI.updateMoveTable(moveHistory, annotations);
    UI.updatePlayerBars(turn, Board.getMaterialBalance());
    saveState();

    // Check game over
    if (chess.game_over()) {
      handleGameOver(chess);
      return;
    }

    // Re-evaluate position
    if (engineReady) {
      Engine.stop();
      Engine.evaluate(chess.fen(), engineDepth);
    }

    // AI move if in vs-ai mode and it's AI's turn
    if (gameMode === 'vs-ai' && turn === aiColor) {
      scheduleAIMove(chess.fen());
    }
  }

  function onSelect(sq, moves) {
    // Visual feedback handled by Board
  }

  /* ── AI ─────────────────────────────────────────────────── */
  function scheduleAIMove(fen) {
    if (!engineReady) return;
    UI.showThinking(true);
    Engine.getBestMove(fen, engineDepth).then(move => {
      UI.showThinking(false);
      if (move) {
        const from = move.substring(0, 2);
        const to   = move.substring(2, 4);
        const promo = move.length === 5 ? move[4] : undefined;
        Board.attemptMove(from, to, promo);
      }
    });
  }

  function handleAIMove(move) {
    // Already handled via getBestMove promise
  }

  /* ── Game over ───────────────────────────────────────────── */
  function handleGameOver(chess) {
    let icon, title, sub;

    if (chess.in_checkmate()) {
      const winner = chess.turn() === 'b' ? 'White' : 'Black';
      icon  = winner === 'White' ? '♔' : '♚';
      title = `${winner} Wins!`;
      sub   = 'by Checkmate';
    } else if (chess.in_stalemate()) {
      icon = '⚖'; title = 'Stalemate'; sub = 'The game is a draw';
    } else if (chess.in_threefold_repetition()) {
      icon = '⚖'; title = 'Draw'; sub = 'Threefold repetition';
    } else if (chess.insufficient_material()) {
      icon = '⚖'; title = 'Draw'; sub = 'Insufficient material';
    } else {
      icon = '⚖'; title = 'Draw'; sub = '';
    }

    Effects.playSound('check');
    UI.showStatus(icon, title, sub, () => restartGame(), () => goToMenu());

    // Run accuracy analysis after game
    setTimeout(runFullAnalysis, 500);
  }

  /* ── Full analysis ───────────────────────────────────────── */
  async function runFullAnalysis() {
    if (!engineReady || fenHistory.length < 2) return;
    UI.toast('Analyzing game…');

    const evals = await Engine.analyzeGame(['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ...fenHistory]);

    if (!evals) return;

    // Classify each move
    const newAnnotations = {};
    for (let i = 0; i < moveHistory.length; i++) {
      const isWhite   = moveHistory[i].color === 'w';
      const evalBefore = evals[i];
      const evalAfter  = evals[i + 1];
      if (evalBefore !== undefined && evalAfter !== undefined) {
        newAnnotations[i] = Engine.classifyMove(evalBefore, evalAfter, isWhite);
        evalsAfter[i] = evalAfter;
      }
    }
    annotations = newAnnotations;
    UI.updateMoveTable(moveHistory, annotations);

    // Accuracy
    const whiteMoveIndices = moveHistory.map((m,i) => m.color === 'w' ? i : -1).filter(i => i >= 0);
    const blackMoveIndices = moveHistory.map((m,i) => m.color === 'b' ? i : -1).filter(i => i >= 0);

    const wEvBefore = whiteMoveIndices.map(i => evals[i]);
    const wEvAfter  = whiteMoveIndices.map(i => evals[i+1]);
    const bEvBefore = blackMoveIndices.map(i => evals[i]);
    const bEvAfter  = blackMoveIndices.map(i => evals[i+1]);

    const wAcc = Engine.calculateAccuracy(wEvBefore, wEvAfter, 'w');
    const bAcc = Engine.calculateAccuracy(bEvBefore, bEvAfter, 'b');

    UI.showAccuracy(wAcc, bAcc);
    UI.toast('Analysis complete');
  }

  /* ── Undo / Redo ─────────────────────────────────────────── */
  function undoMove() {
    const chess = Board.getChess();

    // If vs AI, undo 2 moves (player + AI)
    const stepsBack = gameMode === 'vs-ai' ? 2 : 1;

    for (let i = 0; i < stepsBack; i++) {
      if (chess.history().length === 0) break;
      chess.undo();
      fenHistory.pop();
      moveHistory.pop();
      const last = undoStack.pop();
      if (last) redoStack.push(last);
    }

    // Restore last-move highlight to the new tail of moveHistory (or clear it)
    const prevMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
    Board.highlightLastMove(prevMove ? prevMove.from : null, prevMove ? prevMove.to : null);

    Engine.clearEvalHistory();
    Board.render();
    UI.updateMoveTable(moveHistory, annotations);
    UI.updatePlayerBars(chess.turn(), Board.getMaterialBalance());

    if (engineReady) {
      Engine.stop();
      Engine.evaluate(chess.fen(), engineDepth);
    }
    saveState();
    UI.toast('Move undone');
  }

  function redoMove() {
    const entry = redoStack.pop();
    if (!entry) return;
    const { move } = entry;
    Board.attemptMove(move.from, move.to, move.promotion);
    UI.toast('Move redone');
  }

  /* ── Restart ─────────────────────────────────────────────── */
  function restartGame() {
    UI.hideStatus();
    resetGameState();
    Board.reset();
    UI.resetEvalBar();
    UI.updatePlayerBars('w', null);
    Engine.newGame();
    if (engineReady) Engine.evaluate(Board.getFen(), engineDepth);
    saveState();
  }

  /* ── Menu ────────────────────────────────────────────────── */
  function goToMenu() {
    Effects.stopGameLoop();
    Effects.startMenuLoop();
    UI.showScreen('menu-screen');
    Engine.stop();
  }

  /* ── Theme ────────────────────────────────────────────────── */
  function setTheme(theme) {
    currentTheme = theme;
    Effects.setTheme(theme);
    UI.setTheme(theme);
    // Sync both selectors
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    saveState();
  }

  function cycleTheme() {
    const order = ['winter','summer','rainy','autumn'];
    const idx   = order.indexOf(currentTheme);
    setTheme(order[(idx + 1) % order.length]);
    UI.toast(`Season: ${currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1)}`);
  }

  /* ── Sound ────────────────────────────────────────────────── */
  function playSoundForMove(result) {
    if (result.flags.includes('c') || result.flags.includes('e')) {
      Effects.playSound('capture');
    } else if (result.flags.includes('k') || result.flags.includes('q')) {
      Effects.playSound('castle');
    } else {
      Effects.playSound('move');
    }

    const chess = Board.getChess();
    if (chess.in_check()) Effects.playSound('check');
  }

  /* ── Persistence ─────────────────────────────────────────── */
  function saveState() {
    try {
      localStorage.setItem('cc_theme',  currentTheme);
      localStorage.setItem('cc_mode',   gameMode);
      localStorage.setItem('cc_pgn',    Board.getPgn());
      localStorage.setItem('cc_depth',  engineDepth);
      localStorage.setItem('cc_skill',  engineSkill);
    } catch(e) {}
  }

  function loadState() {
    try {
      const theme = localStorage.getItem('cc_theme');
      if (theme) { currentTheme = theme; }

      const depth = localStorage.getItem('cc_depth');
      const skill = localStorage.getItem('cc_skill');
      if (depth) engineDepth = parseInt(depth);
      if (skill) engineSkill = parseInt(skill);

      // Apply saved theme to selectors
      if (theme) {
        document.querySelectorAll('.theme-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.theme === theme);
        });
      }

      // Apply saved difficulty to selectors
      if (depth) {
        document.querySelectorAll('.diff-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.depth === depth);
        });
      }
    } catch(e) {}
  }

  /* ── Utilities ───────────────────────────────────────────── */
  function formatMove(uci) {
    if (!uci || uci.length < 4) return uci;
    return uci.substring(0, 2).toUpperCase() + '-' + uci.substring(2, 4).toUpperCase();
  }

  /* ── Public API ──────────────────────────────────────────── */
  return { boot };

})();

/* ── Entry point ─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => App.boot());
