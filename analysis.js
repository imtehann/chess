/**
 * analysis.js — Chess.com-style Game Analysis System
 * Regicide Chess
 *
 * Features:
 *  - Full game review with move classifications (Brilliant → Blunder)
 *  - Accuracy scores per player
 *  - Eval graph with move highlighting
 *  - Move-by-move engine line display
 *  - Phase breakdown (opening / middlegame / endgame)
 *  - Summary modal overlay
 */

'use strict';

const AnalysisSystem = (() => {

  /* ================================================================
     CONSTANTS
  ================================================================ */
  const CLASS = {
    BRILLIANT:  { id: 'brilliant',  symbol: '!!',  label: 'Brilliant',  color: '#00c896', weight: 100, cpLoss: -Infinity },
    GREAT:      { id: 'great',      symbol: '!',   label: 'Great',      color: '#5b8df5', weight: 90,  cpLoss: 0 },
    BEST:       { id: 'best',       symbol: '✓',   label: 'Best',       color: '#78c060', weight: 88,  cpLoss: 0 },
    GOOD:       { id: 'good',       symbol: '⊕',   label: 'Good',       color: '#a8c858', weight: 80,  cpLoss: 30 },
    BOOK:       { id: 'book',       symbol: '📖',  label: 'Book',       color: '#9060d0', weight: 85,  cpLoss: 0 },
    INACCURACY: { id: 'inaccuracy', symbol: '?!',  label: 'Inaccuracy', color: '#e8c040', weight: 60,  cpLoss: 50 },
    MISTAKE:    { id: 'mistake',    symbol: '?',   label: 'Mistake',    color: '#e08028', weight: 35,  cpLoss: 150 },
    MISS:       { id: 'miss',       symbol: '⊖',   label: 'Miss',       color: '#c05020', weight: 25,  cpLoss: 250 },
    BLUNDER:    { id: 'blunder',    symbol: '??',  label: 'Blunder',    color: '#e03030', weight: 10,  cpLoss: 300 },
  };

  /* ================================================================
     STATE
  ================================================================ */
  let _history = [];          // Full game history with eval/class attached
  let _evalHistory = [];      // Raw eval scores per ply
  let _analysisComplete = false;
  let _currentPly = -1;
  let _onNavigate = null;
  let _onComplete = null;
  let _engineWorking = false;

  /* ================================================================
     PUBLIC API
  ================================================================ */

  /**
   * Run full analysis on a completed game.
   * @param {object} chessState   - Final ChessEngine state (with full history)
   * @param {function} onProgress - Called each ply: (ply, total, classification)
   * @param {function} onComplete - Called when done: (results)
   */
  function analyse(chessState, onProgress, onComplete) {
    if (_engineWorking) { StockfishEngine.stop(); }
    _analysisComplete = false;
    _engineWorking = true;
    _history = chessState.history.map(m => ({ ...m }));
    _evalHistory = [];
    _onComplete = onComplete;

    const total = _history.length;
    if (total === 0) {
      _engineWorking = false;
      if (onComplete) onComplete(buildResults());
      return;
    }

    // Evaluate position BEFORE each move (to compute loss)
    // We evaluate ply-1 state and ply state for each move
    let ply = 0;

    function runNext() {
      if (ply > total) {
        finishAnalysis();
        return;
      }

      // Rebuild state at ply
      const state = ChessEngine.createState();
      for (let i = 0; i < ply; i++) {
        const mv = _history[i];
        ChessEngine.makeMove(state, mv.fr, mv.ff, mv.tr, mv.tf, mv.promotion, mv.flag);
      }

      const fen = ChessEngine.toFEN(state);
      StockfishEngine.getEvaluation(fen, 16, (ev) => {
        const rawScore = ev ? ev.score : 0;
        // Store from white's POV
        const score = state.turn === 'white' ? rawScore : -rawScore;
        _evalHistory[ply] = { score, pv: ev ? ev.pv : [] };

        if (ply > 0) {
          // Classify move at ply-1
          classifyPly(ply - 1, state.turn === 'white' ? 'black' : 'white');
          if (onProgress) onProgress(ply, total, _history[ply - 1].cls);
        }

        ply++;
        // Small delay to avoid freezing UI
        setTimeout(runNext, 20);
      });
    }

    runNext();
  }

  function classifyPly(plyIndex, movedColor) {
    if (plyIndex < 0 || plyIndex >= _history.length) return;
    const evalBefore = _evalHistory[plyIndex];
    const evalAfter  = _evalHistory[plyIndex + 1];
    if (!evalBefore || !evalAfter) return;

    // Flip sign so we measure from the mover's perspective
    const sign = movedColor === 'white' ? 1 : -1;
    const scoreBefore = sign * evalBefore.score;   // + = good for mover
    const scoreAfter  = sign * evalAfter.score;    // + = good for mover
    const cpLoss = Math.max(0, (scoreBefore - scoreAfter) * 100); // centipawns

    let cls;
    if (cpLoss < 5)   cls = CLASS.BEST;
    else if (cpLoss < 20)  cls = CLASS.GREAT;
    else if (cpLoss < 50)  cls = CLASS.GOOD;
    else if (cpLoss < 100) cls = CLASS.INACCURACY;
    else if (cpLoss < 200) cls = CLASS.MISTAKE;
    else if (cpLoss < 400) cls = CLASS.MISS;
    else                   cls = CLASS.BLUNDER;

    // Brilliant: mover's evaluation IMPROVED (found refutation / sacrifice)
    if (scoreAfter > scoreBefore + 0.3 && cpLoss <= 0) cls = CLASS.BRILLIANT;

    _history[plyIndex].cls       = cls.id;
    _history[plyIndex].eval      = evalAfter.score;
    _history[plyIndex].evalBefore = evalBefore.score;
    _history[plyIndex].cpLoss    = cpLoss;
    _history[plyIndex].pv        = evalBefore.pv;
  }

  function finishAnalysis() {
    _analysisComplete = true;
    _engineWorking = false;
    const results = buildResults();
    if (_onComplete) _onComplete(results);
    renderFullUI(results);
  }

  function buildResults() {
    const whiteMoves = _history.filter((_, i) => i % 2 === 0);
    const blackMoves = _history.filter((_, i) => i % 2 === 1);

    function accuracy(moves) {
      if (!moves.length) return 0;
      const weights = { brilliant:100, great:95, best:90, good:80, book:85, inaccuracy:60, mistake:35, miss:25, blunder:10 };
      const sum = moves.reduce((s, m) => s + (weights[m.cls] ?? 80), 0);
      return Math.round((sum / moves.length) * 10) / 10;
    }

    function counts(moves) {
      const c = {};
      Object.values(CLASS).forEach(cl => c[cl.id] = 0);
      moves.forEach(m => { if (m.cls) c[m.cls]++; });
      return c;
    }

    return {
      white: { accuracy: accuracy(whiteMoves), counts: counts(whiteMoves) },
      black: { accuracy: accuracy(blackMoves), counts: counts(blackMoves) },
      evalHistory: _evalHistory.map(e => e ? e.score : 0),
      history: _history,
    };
  }

  /* ================================================================
     UI RENDERING
  ================================================================ */

  function renderFullUI(results) {
    renderAccuracyBars(results);
    renderClassificationSummary(results);
    renderEvalGraph(results.evalHistory);
    renderMoveList();
  }

  /* ---- Accuracy bars ---- */
  function renderAccuracyBars(results) {
    const wBar = document.getElementById('acc-bar-white');
    const bBar = document.getElementById('acc-bar-black');
    const wVal = document.getElementById('acc-val-white');
    const bVal = document.getElementById('acc-val-black');
    const wAcc = results.white.accuracy, bAcc = results.black.accuracy;
    if (wBar) { wBar.style.width = wAcc + '%'; wBar.style.background = accColor(wAcc); }
    if (bBar) { bBar.style.width = bAcc + '%'; bBar.style.background = accColor(bAcc); }
    if (wVal) wVal.textContent = wAcc.toFixed(1) + '%';
    if (bVal) bVal.textContent = bAcc.toFixed(1) + '%';
  }

  function accColor(acc) {
    if (acc >= 90) return 'linear-gradient(90deg,#00c896,#40d0a0)';
    if (acc >= 75) return 'linear-gradient(90deg,#5b8df5,#80aaff)';
    if (acc >= 60) return 'linear-gradient(90deg,#e8c040,#f0d060)';
    return 'linear-gradient(90deg,#e03030,#f06060)';
  }

  /* ---- Classification summary (like chess.com's coloured counts) ---- */
  function renderClassificationSummary(results) {
    const container = document.getElementById('classification-summary');
    if (!container) return;
    container.innerHTML = '';

    const classOrder = ['brilliant','great','best','good','inaccuracy','mistake','miss','blunder'];
    const info = { brilliant:CLASS.BRILLIANT, great:CLASS.GREAT, best:CLASS.BEST, good:CLASS.GOOD, inaccuracy:CLASS.INACCURACY, mistake:CLASS.MISTAKE, miss:CLASS.MISS, blunder:CLASS.BLUNDER };

    classOrder.forEach(id => {
      const cl = info[id];
      const wc = results.white.counts[id] || 0;
      const bc = results.black.counts[id] || 0;
      if (wc + bc === 0) return;

      const row = document.createElement('div');
      row.className = 'cls-summary-row';
      row.innerHTML = `
        <span class="cls-count wc" style="color:${cl.color}">${wc}</span>
        <span class="cls-dot-large" style="background:${cl.color}"></span>
        <span class="cls-label-text">${cl.label}</span>
        <span class="cls-sym" style="color:${cl.color}">${cl.symbol}</span>
        <span class="cls-count bc" style="color:${cl.color}">${bc}</span>
      `;
      container.appendChild(row);
    });
  }

  /* ---- Eval graph ---- */
  function renderEvalGraph(evals) {
    const canvas = document.getElementById('eval-graph-canvas');
    if (!canvas || evals.length < 2) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 260;
    const H = canvas.offsetHeight || 120;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = 'rgba(8,12,22,0.9)';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (i / 4) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const maxScore = 8;
    const toY = s => H / 2 - (Math.max(-maxScore, Math.min(maxScore, s)) / maxScore) * (H / 2 - 6);
    const toX = i => (i / (evals.length - 1)) * W;

    // White area (above centre)
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    evals.forEach((e, i) => ctx.lineTo(toX(i), toY(e)));
    ctx.lineTo(W, H / 2);
    ctx.closePath();
    const wGrad = ctx.createLinearGradient(0, 0, 0, H / 2);
    wGrad.addColorStop(0, 'rgba(220,228,248,0.55)');
    wGrad.addColorStop(1, 'rgba(180,200,240,0.15)');
    ctx.fillStyle = wGrad; ctx.fill();

    // Black area (below centre)
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    evals.forEach((e, i) => ctx.lineTo(toX(i), toY(e)));
    ctx.lineTo(W, H / 2);
    ctx.closePath();
    const bGrad = ctx.createLinearGradient(0, H / 2, 0, H);
    bGrad.addColorStop(0, 'rgba(20,24,38,0.15)');
    bGrad.addColorStop(1, 'rgba(10,12,20,0.65)');
    ctx.fillStyle = bGrad; ctx.fill();

    // Centre line
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

    // Main eval line
    ctx.beginPath();
    evals.forEach((e, i) => {
      const x = toX(i), y = toY(e);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(140,170,255,0.75)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Classification dots on graph
    _history.forEach((mv, i) => {
      if (!mv.cls) return;
      const cl = Object.values(CLASS).find(c => c.id === mv.cls);
      if (!cl || mv.cls === 'best' || mv.cls === 'good') return;
      const x = toX(i + 1);
      const y = toY(_evalHistory[i + 1]?.score ?? 0);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = cl.color;
      ctx.fill();
    });

    // Current ply indicator
    if (_currentPly >= 0) {
      const cx = toX(_currentPly);
      ctx.strokeStyle = 'rgba(74,122,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Click handler for graph navigation
    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const plyTarget = Math.round(x * (evals.length - 1)) - 1;
      if (_onNavigate) _onNavigate(Math.max(-1, Math.min(_history.length - 1, plyTarget)));
    };
  }

  /* ---- Move list ---- */
  function renderMoveList(currentPly) {
    const container = document.getElementById('analysis-moves-list');
    if (!container) return;
    container.innerHTML = '';

    if (!_history.length) return;

    for (let i = 0; i < _history.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-row';

      const num = document.createElement('span');
      num.className = 'move-num';
      num.textContent = (i / 2 + 1) + '.';
      row.appendChild(num);

      [0, 1].forEach(j => {
        const mv = _history[i + j];
        if (!mv) return;
        const cl = mv.cls ? Object.values(CLASS).find(c => c.id === mv.cls) : null;
        const span = document.createElement('span');
        span.className = 'move-san ana-move' + (mv.cls ? ' ' + mv.cls : '') + (i + j === currentPly ? ' current' : '');
        span.dataset.ply = i + j;

        // Build content: SAN + classification symbol
        const sanText = document.createElement('span');
        sanText.className = 'move-san-text';
        sanText.textContent = mv.san;
        span.appendChild(sanText);

        if (cl && cl.symbol && mv.cls !== 'best' && mv.cls !== 'good') {
          const sym = document.createElement('span');
          sym.className = 'move-cls-sym';
          sym.style.color = cl.color;
          sym.textContent = cl.symbol;
          span.appendChild(sym);
        }

        span.addEventListener('click', () => {
          if (_onNavigate) _onNavigate(i + j);
        });
        row.appendChild(span);
      });

      container.appendChild(row);
    }

    // Scroll current into view
    if (currentPly !== undefined) {
      const current = container.querySelector('.current');
      if (current) current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /* ---- Move detail tooltip ---- */
  function renderMoveDetail(ply) {
    if (ply < 0 || ply >= _history.length) return;
    const mv = _history[ply];
    const cl = mv.cls ? Object.values(CLASS).find(c => c.id === mv.cls) : null;
    const evalAfter = _evalHistory[ply + 1];
    const pv = mv.pv || [];

    const evalEl = document.getElementById('move-detail-eval');
    const lineEl = document.getElementById('engine-line-display');
    const bestEl = document.getElementById('best-move-display');
    const clsEl  = document.getElementById('move-detail-cls');

    if (evalEl && evalAfter) {
      const score = evalAfter.score;
      const display = Math.abs(score) >= 99 ? (score > 0 ? '#+' : '#-') : (score >= 0 ? '+' + score.toFixed(2) : score.toFixed(2));
      evalEl.textContent = display;
      evalEl.style.color = score > 0.3 ? '#c0d0f0' : score < -0.3 ? '#8090b8' : '#a0a8c8';
    }

    if (lineEl && pv.length) lineEl.textContent = pv.slice(0, 6).join(' ');
    if (bestEl && pv.length) bestEl.textContent = pv[0] || '—';

    if (clsEl && cl) {
      clsEl.textContent = cl.symbol + ' ' + cl.label;
      clsEl.style.color = cl.color;
    }
  }

  /* ---- Navigation ---- */
  function setCurrentPly(ply, results) {
    _currentPly = ply;
    renderMoveList(ply);
    renderMoveDetail(ply);
    if (results) renderEvalGraph(results.evalHistory);

    // Update ply counter display
    const numEl = document.getElementById('ana-move-num');
    if (numEl) {
      if (ply < 0) { numEl.textContent = 'Start'; return; }
      const mv = _history[ply];
      const moveNum = Math.floor(ply / 2) + 1;
      const dot = ply % 2 === 0 ? '.' : '…';
      numEl.textContent = `${moveNum}${dot} ${mv?.san || ''}`;
    }
  }

  function setNavigateCallback(fn) { _onNavigate = fn; }

  /* ================================================================
     SUMMARY OVERLAY (chess.com-style end-of-game panel)
  ================================================================ */

  function showSummaryOverlay(results, gameResult, whiteLabel, blackLabel) {
    let overlay = document.getElementById('analysis-summary-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'analysis-summary-overlay';
      overlay.className = 'analysis-summary-overlay';
      document.getElementById('game-screen').appendChild(overlay);
    }

    const wAcc = results.white.accuracy, bAcc = results.black.accuracy;
    const wCounts = results.white.counts, bCounts = results.black.counts;
    const resultLabel = gameResult === '1-0' ? whiteLabel + ' wins' : gameResult === '0-1' ? blackLabel + ' wins' : 'Draw';

    const classOrder = ['brilliant','great','best','good','inaccuracy','mistake','miss','blunder'];
    const clInfo = { brilliant:CLASS.BRILLIANT, great:CLASS.GREAT, best:CLASS.BEST, good:CLASS.GOOD, inaccuracy:CLASS.INACCURACY, mistake:CLASS.MISTAKE, miss:CLASS.MISS, blunder:CLASS.BLUNDER };

    const rows = classOrder.map(id => {
      const cl = clInfo[id];
      const wc = wCounts[id] || 0, bc = bCounts[id] || 0;
      if (wc + bc === 0) return '';
      return `
        <div class="sum-row">
          <span class="sum-count" style="color:${cl.color}">${wc}</span>
          <div class="sum-mid">
            <span class="sum-dot" style="background:${cl.color}"></span>
            <span class="sum-lbl">${cl.label}</span>
          </div>
          <span class="sum-count" style="color:${cl.color}">${bc}</span>
        </div>`;
    }).join('');

    overlay.innerHTML = `
      <div class="sum-box">
        <div class="sum-header">
          <div class="sum-result">${resultLabel}</div>
          <div class="sum-subtitle">Game Review Complete</div>
        </div>
        <div class="sum-players">
          <div class="sum-player">
            <div class="sum-pname">${whiteLabel}</div>
            <div class="sum-acc" style="color:${accColor(wAcc).includes('00c8')>'':'#00c896':'#5b8df5'}">${wAcc.toFixed(1)}%</div>
            <div class="sum-acc-label">Accuracy</div>
          </div>
          <div class="sum-vs">VS</div>
          <div class="sum-player">
            <div class="sum-pname">${blackLabel}</div>
            <div class="sum-acc">${bAcc.toFixed(1)}%</div>
            <div class="sum-acc-label">Accuracy</div>
          </div>
        </div>
        <div class="sum-table-head">
          <span>${whiteLabel}</span><span></span><span>${blackLabel}</span>
        </div>
        <div class="sum-rows">${rows}</div>
        <div class="sum-actions">
          <button class="sum-btn primary" id="sum-review-btn">Review Game</button>
          <button class="sum-btn" id="sum-close-btn">Close</button>
        </div>
      </div>`;

    overlay.classList.remove('hidden');
    document.getElementById('sum-close-btn').onclick = () => overlay.classList.add('hidden');
    document.getElementById('sum-review-btn').onclick = () => {
      overlay.classList.add('hidden');
      // Navigate to analysis screen
      if (window.App) App.mode = 'analysis';
    };
  }

  /* ================================================================
     CSS INJECTION for analysis-specific styles
  ================================================================ */

  function injectStyles() {
    const id = 'analysis-injected-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      /* ---- Move list ---- */
      .ana-move { position:relative; }
      .move-san-text { }
      .move-cls-sym {
        font-size:0.55em; margin-left:1px; vertical-align:super;
        font-weight:700; line-height:1;
      }
      .ana-move.brilliant .move-san-text { color:#00c896; }
      .ana-move.great     .move-san-text { color:#5b8df5; }
      .ana-move.best      .move-san-text { color:#a0c870; }
      .ana-move.good      .move-san-text { color:#c0d090; }
      .ana-move.inaccuracy .move-san-text { color:#e8c040; }
      .ana-move.mistake   .move-san-text { color:#e08028; }
      .ana-move.miss      .move-san-text { color:#c05020; }
      .ana-move.blunder   .move-san-text { color:#e03030; }
      .ana-move.current   { background:rgba(74,122,255,0.22) !important; border-radius:4px; }

      /* ---- Classification summary ---- */
      .cls-summary-row {
        display:flex; align-items:center; gap:0.55rem;
        padding:0.28rem 0.2rem; font-size:0.7rem;
        border-radius:4px; transition:background 0.15s;
      }
      .cls-summary-row:hover { background:rgba(255,255,255,0.04); }
      .cls-dot-large { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
      .cls-label-text { flex:1; color:#9098b8; font-size:0.68rem; }
      .cls-sym { font-size:0.62rem; min-width:18px; text-align:center; font-weight:700; }
      .cls-count { min-width:20px; text-align:center; font-family:'JetBrains Mono',monospace; font-size:0.72rem; font-weight:600; }
      .cls-count.wc { text-align:right; }
      .cls-count.bc { text-align:left; }

      /* ---- Move detail ---- */
      #move-detail-eval {
        font-family:'JetBrains Mono',monospace; font-size:0.85rem;
        font-weight:600; transition:color 0.3s;
      }
      #move-detail-cls { font-size:0.72rem; letter-spacing:0.05em; }

      /* ---- Analysis summary overlay ---- */
      .analysis-summary-overlay {
        position:absolute; inset:0; z-index:300;
        display:flex; align-items:center; justify-content:center;
        background:rgba(4,6,14,0.82); backdrop-filter:blur(8px);
      }
      .analysis-summary-overlay.hidden { display:none; }
      .sum-box {
        background:rgba(10,14,26,0.98);
        border:1px solid rgba(100,140,255,0.14);
        border-radius:14px; padding:1.8rem;
        min-width:320px; max-width:440px; width:100%;
        box-shadow:0 24px 80px rgba(0,0,0,0.7), 0 0 50px rgba(74,122,255,0.1);
        animation:fade-in 0.35s ease;
      }
      .sum-header { text-align:center; margin-bottom:1.4rem; }
      .sum-result {
        font-family:'Cinzel',serif; font-size:1.55rem; font-weight:700;
        letter-spacing:0.08em; color:#f0f4ff;
        text-shadow:0 0 20px rgba(74,122,255,0.3);
      }
      .sum-subtitle { font-size:0.7rem; color:#6070a0; letter-spacing:0.15em; margin-top:0.3rem; text-transform:uppercase; }
      .sum-players {
        display:flex; align-items:center; gap:1rem;
        background:rgba(255,255,255,0.03); border-radius:8px;
        padding:0.9rem 1rem; margin-bottom:1.2rem;
        border:1px solid rgba(100,140,255,0.08);
      }
      .sum-player { flex:1; text-align:center; }
      .sum-pname { font-size:0.72rem; color:#8090b8; margin-bottom:0.3rem; }
      .sum-acc { font-family:'JetBrains Mono',monospace; font-size:1.4rem; font-weight:700; color:#78c8a8; }
      .sum-acc-label { font-size:0.62rem; color:#5060a0; margin-top:0.1rem; text-transform:uppercase; letter-spacing:0.1em; }
      .sum-vs { color:#3040a0; font-size:0.7rem; font-weight:600; letter-spacing:0.1em; }
      .sum-table-head {
        display:flex; justify-content:space-between; align-items:center;
        font-size:0.6rem; color:#4050a0; letter-spacing:0.15em; text-transform:uppercase;
        padding:0 0.2rem; margin-bottom:0.4rem;
      }
      .sum-rows { display:flex; flex-direction:column; gap:0.1rem; margin-bottom:1.4rem; }
      .sum-row {
        display:flex; align-items:center; gap:0.6rem;
        padding:0.3rem 0.2rem; border-radius:4px;
      }
      .sum-count { min-width:22px; text-align:center; font-family:'JetBrains Mono',monospace; font-size:0.75rem; font-weight:600; }
      .sum-mid { flex:1; display:flex; align-items:center; justify-content:center; gap:0.5rem; }
      .sum-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .sum-lbl { font-size:0.7rem; color:#8090b8; }
      .sum-actions { display:flex; gap:0.7rem; }
      .sum-btn {
        flex:1; padding:0.65rem 0.5rem; border-radius:7px;
        font-size:0.78rem; font-family:'Raleway',sans-serif;
        border:1px solid rgba(100,140,255,0.18); color:#8090b8;
        background:rgba(255,255,255,0.03); cursor:pointer; transition:all 0.2s;
      }
      .sum-btn:hover { border-color:rgba(100,140,255,0.35); color:#c0cce8; background:rgba(74,122,255,0.08); }
      .sum-btn.primary {
        background:linear-gradient(135deg,#3a6aff,#2050dd);
        border-color:transparent; color:#fff;
        box-shadow:0 4px 18px rgba(74,122,255,0.28);
        font-family:'Cinzel',serif; letter-spacing:0.06em;
      }
      .sum-btn.primary:hover { transform:translateY(-1px); box-shadow:0 6px 24px rgba(74,122,255,0.4); }

      /* ---- Eval graph canvas ---- */
      #eval-graph-canvas { cursor:pointer; }

      /* ---- Phase indicator ---- */
      .phase-bar {
        display:flex; height:4px; border-radius:2px; overflow:hidden;
        margin:0.5rem 0; gap:1px;
      }
      .phase-opening  { background:#5b8df5; }
      .phase-middle   { background:#e8c040; }
      .phase-endgame  { background:#e03030; }
    `;
    document.head.appendChild(style);
  }

  /* ================================================================
     INIT
  ================================================================ */
  injectStyles();

  return {
    analyse,
    setCurrentPly,
    setNavigateCallback,
    renderEvalGraph,
    renderMoveList,
    renderMoveDetail,
    showSummaryOverlay,
    buildResults,
    get history() { return _history; },
    get evalHistory() { return _evalHistory; },
    get complete() { return _analysisComplete; },
    CLASS,
  };

})();
