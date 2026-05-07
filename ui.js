/* ui.js — UI updates, eval bar, graph, analysis panel */

const UI = (() => {

  /* ── Eval bar ──────────────────────────────────────────── */
  let evalGraphHistory = [];
  let promotionCallback = null;

  function updateEvalBar(evalCP, mate) {
    const fillWhite = document.getElementById('eval-fill-white');
    const fillBlack = document.getElementById('eval-fill-black');
    const scoreEl   = document.getElementById('eval-score');
    if (!fillWhite) return;

    let whitePct;
    let scoreText;

    if (mate !== null && mate !== undefined) {
      whitePct  = mate > 0 ? 95 : 5;
      scoreText = mate > 0 ? `M${Math.abs(mate)}` : `-M${Math.abs(mate)}`;
    } else {
      const capped = Math.max(-800, Math.min(800, evalCP));
      whitePct  = 50 + (capped / 800) * 45;
      whitePct  = Math.max(5, Math.min(95, whitePct));
      scoreText = evalCP >= 0 ? `+${(evalCP/100).toFixed(1)}` : `${(evalCP/100).toFixed(1)}`;
    }

    fillWhite.style.height = whitePct + '%';
    fillBlack.style.height = (100 - whitePct) + '%';
    if (scoreEl) scoreEl.textContent = scoreText;

    // Push to graph history
    evalGraphHistory.push(evalCP !== undefined ? evalCP : (mate > 0 ? 2000 : -2000));
    drawEvalGraph();
  }

  function resetEvalBar() {
    updateEvalBar(0, null);
    evalGraphHistory = [];
    drawEvalGraph();
  }

  /* ── Eval graph ────────────────────────────────────────── */
  function drawEvalGraph() {
    const canvas = document.getElementById('eval-graph');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, W, H);

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H/2);
    ctx.lineTo(W, H/2);
    ctx.stroke();

    if (evalGraphHistory.length < 2) return;

    const data = evalGraphHistory;
    const n    = data.length;
    const xStep = W / Math.max(n - 1, 1);

    // Get accent color from CSS variable
    const accentColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--theme-accent').trim() || '#4fc3f7';

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   accentColor + '88');
    grad.addColorStop(0.5, accentColor + '44');
    grad.addColorStop(1,   'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.moveTo(0, H/2);

    data.forEach((cp, i) => {
      const capped = Math.max(-600, Math.min(600, cp));
      const y = H/2 - (capped / 600) * (H/2 - 6);
      const x = i * xStep;
      if (i === 0) ctx.moveTo(x, y);
      else         ctx.lineTo(x, y);
    });

    // Close path for fill
    ctx.lineTo((n-1) * xStep, H/2);
    ctx.lineTo(0, H/2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    data.forEach((cp, i) => {
      const capped = Math.max(-600, Math.min(600, cp));
      const y = H/2 - (capped / 600) * (H/2 - 6);
      const x = i * xStep;
      if (i === 0) ctx.moveTo(x, y);
      else         ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Last point dot
    if (data.length > 0) {
      const last = data[data.length - 1];
      const capped = Math.max(-600, Math.min(600, last));
      const y = H/2 - (capped / 600) * (H/2 - 6);
      const x = (data.length - 1) * xStep;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();
    }
  }

  /* ── Best move display ─────────────────────────────────── */
  function updateBestMove(move, pv, depth) {
    const bmEl    = document.getElementById('best-move-value');
    const pvEl    = document.getElementById('pv-line');
    const depthEl = document.getElementById('engine-depth');
    if (bmEl)    bmEl.textContent    = move || '—';
    if (pvEl)    pvEl.textContent    = pv ? pv.slice(0, 6).join(' ') : '';
    if (depthEl) depthEl.textContent = depth || '—';
  }

  /* ── Thinking indicator ────────────────────────────────── */
  function showThinking(visible) {
    const el = document.getElementById('ai-thinking');
    if (!el) return;
    if (visible) el.classList.add('visible');
    else         el.classList.remove('visible');
  }

  /* ── Move table / history ──────────────────────────────── */
  function updateMoveTable(history, annotations) {
    const tbody = document.getElementById('move-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    for (let i = 0; i < history.length; i += 2) {
      const move_num = Math.floor(i/2) + 1;
      const whiteMove = history[i];
      const blackMove = history[i+1];

      const tr = document.createElement('tr');
      const tdNum = document.createElement('td');
      tdNum.textContent = move_num + '.';
      tdNum.style.color = 'var(--text-muted)';
      tdNum.style.fontSize = '11px';

      const tdW = document.createElement('td');
      tdW.textContent = whiteMove ? whiteMove.san : '';
      if (annotations && annotations[i]) {
        const ann = annotations[i];
        const span = document.createElement('span');
        span.className = 'annotation ' + ann.cls;
        span.textContent = ann.label;
        tdW.appendChild(span);
        tdW.classList.add('move-annotated');
      }
      tdW.dataset.moveIndex = i;

      const tdB = document.createElement('td');
      tdB.textContent = blackMove ? blackMove.san : '';
      if (blackMove && annotations && annotations[i+1]) {
        const ann = annotations[i+1];
        const span = document.createElement('span');
        span.className = 'annotation ' + ann.cls;
        span.textContent = ann.label;
        tdB.appendChild(span);
        tdB.classList.add('move-annotated');
      }
      if (blackMove) tdB.dataset.moveIndex = i+1;

      tr.appendChild(tdNum);
      tr.appendChild(tdW);
      tr.appendChild(tdB);
      tbody.appendChild(tr);
    }

    // Scroll to bottom
    const scroll = tbody.closest('.move-history-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  function highlightCurrentMove(index) {
    document.querySelectorAll('.move-table td').forEach(td => {
      td.closest('tr').classList.remove('current-move');
    });
    const tds = document.querySelectorAll(`td[data-move-index="${index}"]`);
    tds.forEach(td => td.closest('tr').classList.add('current-move'));
  }

  /* ── Player bars ─────────────────────────────────────────── */
  function updatePlayerBars(turn, materialBalance) {
    const wBar = document.getElementById('player-white-bar');
    const bBar = document.getElementById('player-black-bar');
    const wCap = document.getElementById('white-captured');
    const bCap = document.getElementById('black-captured');
    const wScore = document.getElementById('white-material-score');
    const bScore = document.getElementById('black-material-score');

    if (wBar) wBar.classList.toggle('active-turn', turn === 'w');
    if (bBar) bBar.classList.toggle('active-turn', turn === 'b');

    if (materialBalance) {
      if (wCap) wCap.textContent = materialBalance.whiteCaptured;
      if (bCap) bCap.textContent = materialBalance.blackCaptured;
      const adv = materialBalance.whiteAdvantage;
      if (wScore) wScore.textContent = adv > 0 ? `+${adv}` : '';
      if (bScore) bScore.textContent = adv < 0 ? `+${-adv}` : '';
    }
  }

  /* ── Promotion dialog ────────────────────────────────────── */
  function showPromotion(color, callback) {
    promotionCallback = callback;
    const dialog  = document.getElementById('promotion-dialog');
    const choices = document.getElementById('promo-choices');
    if (!dialog || !choices) return;

    const PIECES = color === 'w'
      ? [{p:'q',sym:'♕'},{p:'r',sym:'♖'},{p:'b',sym:'♗'},{p:'n',sym:'♘'}]
      : [{p:'q',sym:'♛'},{p:'r',sym:'♜'},{p:'b',sym:'♝'},{p:'n',sym:'♞'}];

    choices.innerHTML = '';
    PIECES.forEach(({ p, sym }) => {
      const btn = document.createElement('div');
      btn.className = 'promo-piece';
      btn.textContent = sym;
      btn.addEventListener('click', () => {
        dialog.classList.add('hidden');
        if (promotionCallback) promotionCallback(p);
      });
      choices.appendChild(btn);
    });

    dialog.classList.remove('hidden');
  }

  /* ── Status overlay ─────────────────────────────────────── */
  function showStatus(icon, title, sub, onNewGame, onMenu) {
    const overlay = document.getElementById('status-overlay');
    const iconEl  = document.getElementById('status-icon');
    const titleEl = document.getElementById('status-title');
    const subEl   = document.getElementById('status-sub');
    if (!overlay) return;

    if (iconEl)  iconEl.textContent  = icon;
    if (titleEl) titleEl.textContent = title;
    if (subEl)   subEl.textContent   = sub || '';

    const btnNew  = document.getElementById('btn-new-game');
    const btnMenu = document.getElementById('btn-back-menu');
    if (btnNew)  btnNew.onclick  = () => { hideStatus(); if (onNewGame) onNewGame(); };
    if (btnMenu) btnMenu.onclick = () => { hideStatus(); if (onMenu) onMenu(); };

    overlay.classList.remove('hidden');
  }

  function hideStatus() {
    const overlay = document.getElementById('status-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /* ── Accuracy section ─────────────────────────────────────── */
  function showAccuracy(whiteAcc, blackAcc) {
    const section = document.getElementById('accuracy-section');
    const wEl     = document.getElementById('white-accuracy');
    const bEl     = document.getElementById('black-accuracy');
    if (!section) return;
    section.style.display = 'block';
    if (wEl) wEl.textContent = whiteAcc + '%';
    if (bEl) bEl.textContent = blackAcc + '%';
  }

  /* ── Theme transition ────────────────────────────────────── */
  function setTheme(themeName) {
    const body = document.body;
    body.classList.remove('theme-winter','theme-summer','theme-rainy','theme-autumn');
    body.classList.add('theme-' + themeName);

    const label = document.getElementById('current-theme-label');
    const names = { winter: 'Winter', summer: 'Summer', rainy: 'Monsoon', autumn: 'Autumn' };
    if (label) label.textContent = names[themeName] || themeName;

    // Redraw eval graph with new accent color
    setTimeout(drawEvalGraph, 100);
  }

  /* ── Toast / notification ────────────────────────────────── */
  function toast(msg, duration = 2500) {
    let t = document.getElementById('toast-bar');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast-bar';
      Object.assign(t.style, {
        position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(10,14,26,0.9)', border: '1px solid var(--glass-border)',
        borderRadius: '20px', padding: '8px 20px',
        fontFamily: 'var(--font-display)', fontSize: '13px', letterSpacing: '0.08em',
        color: 'var(--text-primary)', zIndex: 500,
        backdropFilter: 'blur(12px)', pointerEvents: 'none',
        transition: 'opacity 0.3s ease'
      });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, duration);
  }

  /* ── Screen transitions ────────────────────────────────────── */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
      s.style.opacity = '0';
    });
    const target = document.getElementById(id);
    if (!target) return;
    target.style.display = 'flex';
    requestAnimationFrame(() => {
      target.style.opacity = '1';
      target.classList.add('active');
    });
  }

  /* ── PGN export ──────────────────────────────────────────── */
  function exportPGN(pgn) {
    const blob = new Blob([pgn], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'game.pgn';
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    updateEvalBar,
    resetEvalBar,
    drawEvalGraph,
    updateBestMove,
    showThinking,
    updateMoveTable,
    highlightCurrentMove,
    updatePlayerBars,
    showPromotion,
    showStatus,
    hideStatus,
    showAccuracy,
    setTheme,
    toast,
    showScreen,
    exportPGN
  };

})();
