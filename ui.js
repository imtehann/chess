/**
 * ui.js — HUD, panels, modals, analysis UI
 * Regicide Chess
 */

'use strict';

const UI = (() => {

  // ---- Eval bar ----
  function updateEval(score) {
    const fill = document.getElementById('eval-bar-fill');
    const label = document.getElementById('eval-score');
    if (!fill || !label) return;

    // Clamp score to [-10, 10] then map to percentage
    const clamped = Math.max(-10, Math.min(10, score));
    const pct = ((clamped + 10) / 20) * 100;
    fill.style.width = pct + '%';

    const display = Math.abs(score) >= 99
      ? (score > 0 ? 'M' : '-M')
      : (score >= 0 ? '+' + score.toFixed(1) : score.toFixed(1));
    label.textContent = display;
    label.style.color = score >= 0 ? '#d0d8f0' : '#8090c0';
  }

  // ---- Move list ----
  function buildMoveList(history, containerId, currentIdx, onMoveClick) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < history.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-row';

      const num = document.createElement('span');
      num.className = 'move-num';
      num.textContent = (i / 2 + 1) + '.';
      row.appendChild(num);

      // White move
      const wm = history[i];
      if (wm) {
        const ws = document.createElement('span');
        ws.className = 'move-san' + (wm.cls ? ' ' + wm.cls : '') + (i === currentIdx ? ' current' : '');
        ws.textContent = wm.san;
        ws.title = wm.cls ? capitalize(wm.cls) : '';
        if (onMoveClick) ws.addEventListener('click', () => onMoveClick(i));
        row.appendChild(ws);
      }

      // Black move
      const bm = history[i + 1];
      if (bm) {
        const bs = document.createElement('span');
        bs.className = 'move-san' + (bm.cls ? ' ' + bm.cls : '') + (i + 1 === currentIdx ? ' current' : '');
        bs.textContent = bm.san;
        bs.title = bm.cls ? capitalize(bm.cls) : '';
        if (onMoveClick) bs.addEventListener('click', () => onMoveClick(i + 1));
        row.appendChild(bs);
      }

      container.appendChild(row);
    }

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  // ---- Player cards ----
  function setActiveTurn(turn) {
    document.getElementById('card-white')?.classList.toggle('active-turn', turn === 'white');
    document.getElementById('card-black')?.classList.toggle('active-turn', turn === 'black');
  }

  function updateCaptures(white, black) {
    // white = pieces captured by white (black pieces)
    const wCaptures = document.getElementById('white-captures');
    const bCaptures = document.getElementById('black-captures');
    if (wCaptures) wCaptures.textContent = white || '';
    if (bCaptures) bCaptures.textContent = black || '';
  }

  // ---- Clock ----
  function updateClock(color, seconds) {
    const el = document.getElementById('clock-' + color);
    if (!el) return;
    if (seconds === null || seconds === undefined) { el.textContent = '—'; return; }
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    el.classList.toggle('low', seconds < 30);
  }

  // ---- Best move ----
  function updateBestMove(uci) {
    const el = document.getElementById('best-move-display');
    if (el) el.textContent = uci || '—';
  }

  function updateEngineLine(line) {
    const el = document.getElementById('engine-line-display');
    if (el) el.textContent = line || '—';
  }

  // ---- Move badge ----
  let badgeTimeout = null;
  function showMoveBadge(cls) {
    const el = document.getElementById('move-badge');
    if (!el) return;
    clearTimeout(badgeTimeout);
    const labels = {
      brilliant: '!! Brilliant', great: '! Great', good: '✓ Good',
      inaccuracy: '?! Inaccuracy', mistake: '? Mistake', blunder: '?? Blunder'
    };
    if (!cls || !labels[cls]) { el.classList.add('hidden'); return; }
    el.className = 'move-badge ' + cls;
    el.textContent = labels[cls];
    el.style.animation = 'none';
    requestAnimationFrame(() => { el.style.animation = ''; });
    badgeTimeout = setTimeout(() => el.classList.add('hidden'), 2400);
  }

  // ---- Game over ----
  function showGameOver(result, winner, pgn) {
    const overlay = document.getElementById('game-over-overlay');
    if (!overlay) return;
    const resultLabels = {
      checkmate: 'Checkmate', stalemate: 'Stalemate',
      '50-move': '50-Move Rule', insufficient: 'Insufficient Material',
      timeout: 'Time Out', resign: 'Resignation',
    };
    document.getElementById('go-result').textContent = resultLabels[result] || result;
    document.getElementById('go-winner').textContent = winner ? (capitalize(winner) + ' wins!') : 'Draw';
    document.getElementById('go-pgn').textContent = pgn || '';
    overlay.classList.remove('hidden');
  }

  function hideGameOver() {
    document.getElementById('game-over-overlay')?.classList.add('hidden');
  }

  // ---- Promotion modal ----
  function showPromotion(color, onSelect) {
    const modal = document.getElementById('promotion-modal');
    const container = document.getElementById('promo-pieces');
    if (!modal || !container) return;

    const pieces = ['q', 'r', 'b', 'n'];
    const symbols = {
      white: { q: '♕', r: '♖', b: '♗', n: '♘' },
      black: { q: '♛', r: '♜', b: '♝', n: '♞' },
    };

    container.innerHTML = '';
    pieces.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'promo-piece-btn';
      btn.textContent = symbols[color][p];
      btn.addEventListener('click', () => {
        modal.classList.add('hidden');
        onSelect(p);
      });
      container.appendChild(btn);
    });

    modal.classList.remove('hidden');
  }

  // ---- Analysis accuracy ----
  function updateAccuracy(whiteAcc, blackAcc) {
    const wBar = document.getElementById('acc-bar-white');
    const bBar = document.getElementById('acc-bar-black');
    const wVal = document.getElementById('acc-val-white');
    const bVal = document.getElementById('acc-val-black');
    if (wBar) wBar.style.width = (whiteAcc || 0) + '%';
    if (bBar) bBar.style.width = (blackAcc || 0) + '%';
    if (wVal) wVal.textContent = whiteAcc !== null ? whiteAcc.toFixed(1) + '%' : '—';
    if (bVal) bVal.textContent = blackAcc !== null ? blackAcc.toFixed(1) + '%' : '—';
  }

  // ---- Eval graph ----
  function drawEvalGraph(canvasEl, evals) {
    if (!canvasEl || !evals || evals.length === 0) return;
    const ctx = canvasEl.getContext('2d');
    const W = canvasEl.width, H = canvasEl.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, W, H);

    // Centre line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

    if (evals.length < 2) return;

    const maxScore = 10;
    const toY = s => H / 2 - (Math.max(-maxScore, Math.min(maxScore, s)) / maxScore) * (H / 2 - 4);

    // Fill white/black area
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    evals.forEach((e, i) => {
      const x = (i / (evals.length - 1)) * W;
      ctx.lineTo(x, toY(e));
    });
    ctx.lineTo(W, H / 2);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(200,210,255,0.4)');
    grad.addColorStop(0.5, 'rgba(200,210,255,0.1)');
    grad.addColorStop(0.5, 'rgba(20,20,30,0.2)');
    grad.addColorStop(1, 'rgba(20,20,30,0.4)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Eval line
    ctx.beginPath();
    evals.forEach((e, i) => {
      const x = (i / (evals.length - 1)) * W;
      const y = toY(e);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(74,122,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ---- Screen transitions ----
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function showModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
  function hideModal(id) { document.getElementById(id)?.classList.add('hidden'); }

  // ---- Util ----
  function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

  function buildCaptureString(captured) {
    if (!captured || captured.length === 0) return '';
    const symbols = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
    return captured.map(p => symbols[p.toLowerCase()] || p).join('');
  }

  // ---- Analysis move list ----
  function buildAnalysisMoveList(history, currentIdx, onMoveClick) {
    buildMoveList(history, 'analysis-moves-list', currentIdx, onMoveClick);
    // Update move number display
    const el = document.getElementById('ana-move-num');
    if (el) {
      if (currentIdx < 0) el.textContent = 'Start';
      else {
        const mv = history[currentIdx];
        el.textContent = `${Math.floor(currentIdx / 2) + 1}${currentIdx % 2 === 0 ? '.' : '…'} ${mv?.san || ''}`;
      }
    }
  }

  // Season switcher active state
  function setActiveSeason(season) {
    document.querySelectorAll('.season-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.season === season);
    });
    document.body.className = 'season-' + season;
  }

  // Names
  function setPlayerNames(whiteName, blackName) {
    const wn = document.getElementById('white-name');
    const bn = document.getElementById('black-name');
    if (wn) wn.textContent = whiteName || 'White';
    if (bn) bn.textContent = blackName || 'Black';
  }

  return {
    updateEval, buildMoveList, setActiveTurn,
    updateCaptures, updateClock, updateBestMove, updateEngineLine,
    showMoveBadge, showGameOver, hideGameOver,
    showPromotion, updateAccuracy, drawEvalGraph,
    showScreen, showModal, hideModal,
    buildCaptureString, buildAnalysisMoveList,
    setActiveSeason, setPlayerNames,
  };
})();
