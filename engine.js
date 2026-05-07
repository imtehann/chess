/* engine.js — Stockfish integration via Web Worker */

const Engine = (() => {

  let worker     = null;
  let ready      = false;
  let thinking   = false;
  let depth      = 3;
  let skillLevel = 3;
  let onEval     = null;
  let onBestMove = null;
  let onReady    = null;
  let resolveCurrentSearch = null;
  let evalHistory = [];

  const STOCKFISH_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';

  /* ── Stockfish worker inline fallback ──────────────────── */
  /* We use the CDN version loaded in a blob worker             */
  function createWorker() {
    try {
      // Try blob worker to avoid CORS issues
      const workerCode = `
        importScripts('${STOCKFISH_CDN}');
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const url  = URL.createObjectURL(blob);
      return new Worker(url);
    } catch(e) {
      // Direct worker fallback
      try { return new Worker(STOCKFISH_CDN); } catch(e2) { return null; }
    }
  }

  /* ── Init ─────────────────────────────────────────────── */
  function init(callbacks = {}) {
    onEval     = callbacks.onEval     || null;
    onBestMove = callbacks.onBestMove || null;
    onReady    = callbacks.onReady    || null;

    worker = createWorker();
    if (!worker) {
      console.warn('[Engine] Stockfish unavailable — engine features disabled');
      if (onReady) onReady(false);
      return;
    }

    worker.onmessage = handleMessage;
    worker.onerror   = (e) => { console.error('[Engine] Worker error:', e); };

    send('uci');
    send('setoption name Ponder value false');
    send('ucinewgame');
    send('isready');
  }

  function send(cmd) {
    if (worker) worker.postMessage(cmd);
  }

  /* ── Message handler ──────────────────────────────────── */
  function handleMessage(e) {
    const msg = e.data;

    if (msg === 'uciok')   { applyOptions(); return; }
    if (msg === 'readyok') { ready = true; if (onReady) onReady(true); return; }

    // Parse info lines
    if (msg.startsWith('info')) {
      parseInfo(msg);
      return;
    }

    // Best move
    if (msg.startsWith('bestmove')) {
      thinking = false;
      const parts = msg.split(' ');
      const move  = parts[1];
      if (move && move !== '(none)') {
        if (resolveCurrentSearch) { resolveCurrentSearch(move); resolveCurrentSearch = null; }
        if (onBestMove) onBestMove(move);
      }
    }
  }

  function applyOptions() {
    send(`setoption name Skill Level value ${skillLevel}`);
    send(`setoption name Threads value 1`);
    send(`setoption name Hash value 32`);
    send('isready');
  }

  /* ── Info parser ──────────────────────────────────────── */
  function parseInfo(msg) {
    const depthMatch = msg.match(/depth (\d+)/);
    const scoreMatch = msg.match(/score (cp|mate) (-?\d+)/);
    const pvMatch    = msg.match(/ pv (.+?)(?:\s+(?:bmc|currmove|tbhits)|$)/);
    const d          = depthMatch ? parseInt(depthMatch[1]) : null;

    if (!scoreMatch) return;

    let evalCP = null;
    let mate   = null;

    if (scoreMatch[1] === 'cp') {
      evalCP = parseInt(scoreMatch[2]);
    } else {
      mate   = parseInt(scoreMatch[2]);
      evalCP = mate > 0 ? 10000 : -10000;
    }

    const pv = pvMatch ? pvMatch[1].trim().split(' ') : [];

    if (onEval) {
      onEval({ evalCP, mate, depth: d, pv });
    }
  }

  /* ── Evaluate position ────────────────────────────────── */
  function evaluate(fen, moveDepth) {
    if (!ready) return;
    const d = moveDepth || depth;
    thinking = true;
    send(`position fen ${fen}`);
    send(`go depth ${d}`);
  }

  /* ── Get best move (promise) ──────────────────────────── */
  function getBestMove(fen, moveDepth) {
    return new Promise((resolve) => {
      if (!ready || !worker) { resolve(null); return; }

      resolveCurrentSearch = resolve;
      thinking = true;
      send(`setoption name Skill Level value ${skillLevel}`);
      send(`position fen ${fen}`);
      send(`go depth ${moveDepth || depth}`);
    });
  }

  /* ── Stop current search ──────────────────────────────── */
  function stop() {
    if (worker && thinking) {
      send('stop');
      thinking = false;
    }
  }

  /* ── New game ──────────────────────────────────────────── */
  function newGame() {
    stop();
    send('ucinewgame');
    evalHistory = [];
  }

  /* ── Settings ─────────────────────────────────────────── */
  function setDifficulty(d, skill) {
    depth      = d;
    skillLevel = skill;
    if (ready) send(`setoption name Skill Level value ${skillLevel}`);
  }

  /* ── Eval history ─────────────────────────────────────── */
  function pushEval(cp) {
    evalHistory.push(cp);
  }

  function getEvalHistory() {
    return [...evalHistory];
  }

  function clearEvalHistory() {
    evalHistory = [];
  }

  /* ── Classify move ────────────────────────────────────── */
  /* Returns {label, class} based on eval delta and position */
  function classifyMove(prevEvalCP, newEvalCP, isWhite) {
    // Eval is always from white's perspective
    const prevScore = isWhite ? prevEvalCP : -prevEvalCP;
    const newScore  = isWhite ? newEvalCP  : -newEvalCP;
    const delta     = newScore - prevScore; // negative = worse for the moving player

    if (delta >= 50)   return { label: '!!', cls: 'brilliant' };
    if (delta >= 10)   return { label: '!',  cls: 'great' };
    if (delta >= -10)  return { label: '',   cls: 'good' };
    if (delta >= -50)  return { label: '?',  cls: 'inaccuracy' };
    if (delta >= -150) return { label: '?!', cls: 'mistake' };
    return               { label: '??', cls: 'blunder' };
  }

  /* ── Calculate accuracy ───────────────────────────────── */
  /* Uses Win% model based on eval in centipawns */
  function cpToWinPct(cp) {
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  }

  function calculateAccuracy(evalsBefore, evalsAfter, color) {
    // color: 'w' or 'b'
    // evalsAfter[i] is eval after move i
    if (!evalsBefore.length) return 100;
    let totalLoss = 0;
    let count = 0;
    for (let i = 0; i < Math.min(evalsBefore.length, evalsAfter.length); i++) {
      const before = evalsBefore[i];
      const after  = evalsAfter[i];
      // Win% before and after
      const wpBefore = color === 'w' ? cpToWinPct(before) : cpToWinPct(-before);
      const wpAfter  = color === 'w' ? cpToWinPct(after)  : cpToWinPct(-after);
      totalLoss += Math.max(0, wpBefore - wpAfter);
      count++;
    }
    if (!count) return 100;
    const avgLoss = totalLoss / count;
    // Convert to accuracy: accuracy = 103.1668 * exp(-0.04354 * avgLoss) - 3.1669
    const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * avgLoss) - 3.1669));
    return Math.round(acc);
  }

  /* ── Full game analysis ───────────────────────────────── */
  async function analyzeGame(fenHistory) {
    if (!ready || !worker) return null;
    const evals = [];
    for (const fen of fenHistory) {
      const cp = await new Promise(resolve => {
        let got = false;
        const originalOnEval = onEval;
        onEval = (info) => {
          if (info.depth && info.depth >= Math.min(depth, 12) && !got) {
            got = true;
            onEval = originalOnEval;
            resolve(info.evalCP);
          }
        };
        send(`position fen ${fen}`);
        send(`go depth ${Math.min(depth, 12)}`);
      });
      evals.push(cp);
    }
    return evals;
  }

  return {
    init,
    evaluate,
    getBestMove,
    stop,
    newGame,
    setDifficulty,
    pushEval,
    getEvalHistory,
    clearEvalHistory,
    classifyMove,
    calculateAccuracy,
    analyzeGame,
    isReady: () => ready,
    isThinking: () => thinking
  };

})();
