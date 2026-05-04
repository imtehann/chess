/**
 * ui.js — UI Management: Panels, Dialogs, Analysis, Timers
 */

const UI = (() => {
  // ---- MOVE QUALITY ----
  const QUALITIES = {
    brilliant: { label: 'Brilliant!!', icon: '💎', cls: 'mq-brilliant', threshold: null },
    great:     { label: 'Great Move!', icon: '✨', cls: 'mq-great',     threshold: null },
    good:      { label: 'Good Move',   icon: '✓',  cls: 'mq-good',      threshold: -0.3 },
    inaccuracy:{ label: 'Inaccuracy',  icon: '?!', cls: 'mq-inaccuracy',threshold: -0.8 },
    mistake:   { label: 'Mistake',     icon: '?',  cls: 'mq-mistake',   threshold: -1.5 },
    blunder:   { label: 'Blunder!',    icon: '??', cls: 'mq-blunder',   threshold: -3.0 },
  };

  function classifyMove(prevEval, currEval, color) {
    // delta is from mover's perspective
    const sign = color === 'w' ? 1 : -1;
    const delta = (currEval - prevEval) * sign;
    if (delta >= 0.2) return 'brilliant';
    if (delta >= 0) return 'great';
    if (delta >= -0.3) return 'good';
    if (delta >= -0.8) return 'inaccuracy';
    if (delta >= -1.5) return 'mistake';
    return 'blunder';
  }

  let _mqpTimeout = null;
  function showMoveQuality(quality) {
    const popup = document.getElementById('move-quality-popup');
    const icon = document.getElementById('mqp-icon');
    const label = document.getElementById('mqp-label');
    const q = QUALITIES[quality];
    if (!q || !popup) return;

    // Remove old classes
    popup.className = 'move-quality-popup';
    popup.classList.add(q.cls);
    popup.classList.remove('hidden');
    icon.textContent = q.icon;
    label.textContent = q.label;

    // Trigger animation
    requestAnimationFrame(() => popup.classList.add('show'));

    clearTimeout(_mqpTimeout);
    _mqpTimeout = setTimeout(() => {
      popup.classList.remove('show');
      setTimeout(() => popup.classList.add('hidden'), 350);
    }, 1600);
  }

  // ---- MOVE LIST ----
  function renderMoveList(containerId, moveHistory, activeIdx, onClickMove) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < moveHistory.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'move-row';

      const num = document.createElement('span');
      num.className = 'move-num';
      num.textContent = `${Math.floor(i / 2) + 1}.`;
      row.appendChild(num);

      for (let j = 0; j < 2 && i + j < moveHistory.length; j++) {
        const m = moveHistory[i + j];
        const cell = document.createElement('span');
        cell.className = 'move-cell' + (i + j === activeIdx ? ' active' : '');
        cell.dataset.idx = i + j;

        const badge = m.quality ? `<span class="move-quality-badge ${QUALITIES[m.quality]?.cls || ''}">${QUALITIES[m.quality]?.icon || ''}</span>` : '';
        cell.innerHTML = `${m.san || m.uci}${badge}`;

        if (onClickMove) cell.addEventListener('click', () => onClickMove(i + j));
        row.appendChild(cell);
      }
      container.appendChild(row);
    }
    // Scroll to active
    const activeEl = container.querySelector('.move-cell.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ---- EVAL BAR ----
  function updateEvalBar(evalScore) {
    const fillWhite = document.getElementById('eval-fill-white');
    const fillBlack = document.getElementById('eval-fill-black');
    const labelTop = document.getElementById('eval-label-top');
    const labelBot = document.getElementById('eval-label-bot');
    if (!fillWhite) return;

    const clamped = Math.max(-10, Math.min(10, evalScore));
    // White's percentage (50% at 0, 100% at +inf)
    const whitePct = 50 + (clamped / 10) * 45;
    fillWhite.style.height = `${Math.max(5, Math.min(95, whitePct))}%`;
    fillBlack.style.height = `${100 - Math.max(5, Math.min(95, whitePct))}%`;

    const fmt = v => {
      if (Math.abs(v) >= 999) return v > 0 ? 'M' : '-M';
      const s = Math.abs(v).toFixed(1);
      return v > 0 ? `+${s}` : v < 0 ? `-${s}` : '0.0';
    };
    const display = fmt(evalScore);
    labelTop.textContent = evalScore < 0 ? display : '0.0';
    labelBot.textContent = evalScore >= 0 ? display : '0.0';
  }

  // ---- ENGINE LINES ----
  function updateEngineLines(lines) {
    const container = document.getElementById('engine-lines');
    const bestMove = document.getElementById('best-move-text');
    if (!container) return;
    container.innerHTML = '';
    if (!lines || lines.length === 0) return;

    const topLine = lines[0];
    if (topLine && bestMove) {
      bestMove.textContent = topLine.moves?.[0] || '—';
    }

    lines.slice(0, 3).forEach((line, i) => {
      if (!line) return;
      const el = document.createElement('div');
      el.className = 'engine-line';
      const score = Math.abs(line.score) >= 999 ?
        (line.score > 0 ? '#M' : '-M') :
        (line.score >= 0 ? `+${line.score.toFixed(1)}` : line.score.toFixed(1));
      el.innerHTML = `<span class="el-score">${score}</span><span class="el-moves">${line.moves?.join(' ') || ''}</span>`;
      container.appendChild(el);
    });
  }

  function setEngineStatus(state) {
    const dot = document.querySelector('.status-dot');
    const text = document.getElementById('engine-status-text');
    if (!dot || !text) return;
    const states = {
      loading: { cls: '', label: 'Loading…' },
      ready:   { cls: 'ready', label: 'Ready' },
      thinking:{ cls: 'thinking', label: 'Thinking…' },
      mock:    { cls: 'ready', label: 'Ready (local)' },
    };
    const s = states[state] || states.loading;
    dot.className = 'status-dot ' + s.cls;
    text.textContent = s.label;
  }

  // ---- TIMERS ----
  class TimerSystem {
    constructor() {
      this.times = { w: null, b: null };
      this.active = null;
      this._interval = null;
      this.onTimeout = null;
    }
    init(minutes) {
      const secs = minutes ? minutes * 60 : null;
      this.times = { w: secs, b: secs };
      this.active = null;
      this._render();
    }
    start(color) {
      this.active = color;
      if (this.times.w === null) return; // No clock
      clearInterval(this._interval);
      this._interval = setInterval(() => {
        if (this.active && this.times[this.active] !== null) {
          this.times[this.active]--;
          this._render();
          if (this.times[this.active] <= 0) {
            this.stop();
            if (this.onTimeout) this.onTimeout(this.active);
          }
        }
      }, 1000);
    }
    switch(toColor) { this.start(toColor); }
    stop() { clearInterval(this._interval); this.active = null; }
    _render() {
      this._renderTimer('white-timer', this.times.w);
      this._renderTimer('black-timer', this.times.b);
      // Highlight active player card
      document.getElementById('player-white-card')?.classList.toggle('active-turn', this.active === 'w');
      document.getElementById('player-black-card')?.classList.toggle('active-turn', this.active === 'b');
    }
    _renderTimer(id, secs) {
      const el = document.getElementById(id);
      if (!el) return;
      if (secs === null) { el.textContent = '—'; return; }
      const m = Math.floor(secs / 60).toString().padStart(2, '0');
      const s = Math.max(0, secs % 60).toString().padStart(2, '0');
      el.textContent = `${m}:${s}`;
      el.classList.toggle('urgent', secs < 30);
    }
  }

  // ---- CAPTURED PIECES ----
  function updateCaptured(whiteCaptures, blackCaptures) {
    const byWhite = document.getElementById('captured-by-white');
    const byBlack = document.getElementById('captured-by-black');
    if (byWhite) byWhite.textContent = whiteCaptures.map(p => Chess.PIECES['b' + p]).join('');
    if (byBlack) byBlack.textContent = blackCaptures.map(p => Chess.PIECES['w' + p]).join('');
  }

  // ---- PROMOTION DIALOG ----
  function showPromoDialog(color, onSelect) {
    const dialog = document.getElementById('promotion-dialog');
    const pieces = document.getElementById('promo-pieces');
    if (!dialog || !pieces) return;
    pieces.innerHTML = '';
    const types = ['Q', 'R', 'B', 'N'];
    types.forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'promo-piece-btn';
      btn.textContent = Chess.PIECES[color + type];
      btn.addEventListener('click', () => {
        dialog.classList.add('hidden');
        onSelect(type);
      });
      pieces.appendChild(btn);
    });
    dialog.classList.remove('hidden');
  }

  // ---- GAME OVER DIALOG ----
  function showGameOver(result, reason, pgn, onAnalyze, onRematch) {
    const dialog = document.getElementById('gameover-dialog');
    const icon = document.getElementById('go-icon');
    const title = document.getElementById('go-title');
    const subtitle = document.getElementById('go-subtitle');
    if (!dialog) return;

    const msgs = {
      white:  { title: 'White Wins', icon: '♔', sub: reason === 'checkmate' ? 'Checkmate!' : 'Black resigned' },
      black:  { title: 'Black Wins', icon: '♚', sub: reason === 'checkmate' ? 'Checkmate!' : 'White resigned' },
      draw:   { title: 'Draw',       icon: '⚖', sub: { stalemate: 'Stalemate', 'fifty-move': '50 Move Rule', repetition: 'Threefold Repetition', agreement: 'Draw by Agreement' }[reason] || 'Draw' },
    };
    const m = msgs[result] || msgs.draw;
    icon.textContent = m.icon;
    title.textContent = m.title;
    subtitle.textContent = m.sub;

    const analyzeBtn = document.getElementById('go-analyze');
    const rematchBtn = document.getElementById('go-rematch');
    if (analyzeBtn) { analyzeBtn.onclick = () => { dialog.classList.add('hidden'); onAnalyze?.(); }; }
    if (rematchBtn) { rematchBtn.onclick = () => { dialog.classList.add('hidden'); onRematch?.(); }; }

    dialog.classList.remove('hidden');
  }

  // ---- ANALYSIS GRAPH ----
  function drawEvalGraph(canvasId, evalHistory) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (evalHistory.length < 2) return;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, W, H);

    // Center line
    ctx.strokeStyle = 'rgba(201,168,76,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Eval curve
    const toY = v => H / 2 - (Math.max(-8, Math.min(8, v)) / 8) * (H / 2 - 8);
    const toX = i => (i / (evalHistory.length - 1)) * W;

    // Fill areas
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    for (let i = 0; i < evalHistory.length; i++) {
      ctx.lineTo(toX(i), toY(evalHistory[i]));
    }
    ctx.lineTo(W, H / 2);
    ctx.closePath();
    const wGrad = ctx.createLinearGradient(0, 0, 0, H);
    wGrad.addColorStop(0, 'rgba(240,232,208,0.5)');
    wGrad.addColorStop(0.5, 'rgba(240,232,208,0.1)');
    ctx.fillStyle = wGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    for (let i = 0; i < evalHistory.length; i++) {
      ctx.lineTo(toX(i), toY(evalHistory[i]));
    }
    ctx.lineTo(W, H / 2);
    ctx.closePath();
    const bGrad = ctx.createLinearGradient(0, 0, 0, H);
    bGrad.addColorStop(0.5, 'rgba(20,12,4,0.1)');
    bGrad.addColorStop(1, 'rgba(20,12,4,0.5)');
    ctx.fillStyle = bGrad;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < evalHistory.length; i++) {
      if (i === 0) ctx.moveTo(toX(i), toY(evalHistory[i]));
      else ctx.lineTo(toX(i), toY(evalHistory[i]));
    }
    ctx.strokeStyle = 'rgba(201,168,76,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Blunder markers
    for (let i = 1; i < evalHistory.length; i++) {
      const delta = evalHistory[i] - evalHistory[i - 1];
      const isBlunder = Math.abs(delta) > 2;
      if (isBlunder) {
        const color = delta < 0 ? '#ff4a4a' : '#4aff8a';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(toX(i), toY(evalHistory[i]), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- ACCURACY ----
  function computeAccuracy(moveHistory) {
    const scores = { w: [], b: [] };
    for (let i = 0; i < moveHistory.length; i++) {
      const m = moveHistory[i];
      const color = i % 2 === 0 ? 'w' : 'b';
      const qualScore = { brilliant: 100, great: 95, good: 85, inaccuracy: 65, mistake: 40, blunder: 10 };
      scores[color].push(qualScore[m.quality] ?? 80);
    }
    const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    return { white: avg(scores.w), black: avg(scores.b) };
  }

  return {
    classifyMove,
    showMoveQuality,
    renderMoveList,
    updateEvalBar,
    updateEngineLines,
    setEngineStatus,
    TimerSystem,
    updateCaptured,
    showPromoDialog,
    showGameOver,
    drawEvalGraph,
    computeAccuracy,
    QUALITIES
  };
})();
