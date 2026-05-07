/* effects.js — Seasonal environment, particles, and visual effects */

const Effects = (() => {

  /* ── State ─────────────────────────────────────────────── */
  let canvas      = null;
  let ctx         = null;
  let menuCanvas  = null;
  let menuCtx     = null;
  let currentTheme = 'winter';
  let particles   = [];
  let clouds      = [];
  let trees       = [];
  let frameId     = null;
  let menuFrameId = null;
  let time        = 0;
  let lightning   = { active: false, timer: 0, nextFlash: 0 };
  let windX       = 0.2;
  let soundEnabled = true;
  let ambientPlaying = false;

  const W = () => canvas.width;
  const H = () => canvas.height;

  /* ── Particle definitions ────────────────────────────────── */
  class Particle {
    constructor(type, w, h) {
      this.type = type;
      this.reset(w, h, true);
    }

    reset(w, h, initial = false) {
      const type = this.type;
      if (type === 'snow') {
        this.x    = Math.random() * w;
        this.y    = initial ? Math.random() * h : -10;
        this.size = Math.random() * 3 + 1;
        this.vx   = (Math.random() - 0.5) * 0.5;
        this.vy   = Math.random() * 1.2 + 0.4;
        this.alpha = Math.random() * 0.6 + 0.4;
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = Math.random() * 0.02 + 0.01;
      } else if (type === 'rain') {
        this.x    = Math.random() * w;
        this.y    = initial ? Math.random() * h : -20;
        this.size = Math.random() * 1 + 0.5;
        this.length = Math.random() * 20 + 10;
        this.vx   = windX * 3 + (Math.random() - 0.5);
        this.vy   = Math.random() * 12 + 16;
        this.alpha = Math.random() * 0.3 + 0.2;
      } else if (type === 'leaf') {
        this.x    = Math.random() * w;
        this.y    = initial ? Math.random() * h : -20;
        this.size = Math.random() * 12 + 6;
        this.vx   = (Math.random() - 0.5) * 1.5 + windX * 2;
        this.vy   = Math.random() * 1.5 + 0.5;
        this.rotation    = Math.random() * Math.PI * 2;
        this.rotSpeed    = (Math.random() - 0.5) * 0.08;
        this.swing       = Math.random() * Math.PI * 2;
        this.swingSpeed  = Math.random() * 0.03 + 0.01;
        const hues = [20, 30, 15, 10, 35]; // autumn hues
        this.hue  = hues[Math.floor(Math.random() * hues.length)];
        this.sat  = Math.random() * 30 + 60;
        this.lum  = Math.random() * 20 + 35;
        this.alpha = Math.random() * 0.5 + 0.5;
      }
    }

    update(w, h) {
      if (this.type === 'snow') {
        this.wobble += this.wobbleSpeed;
        this.x += this.vx + Math.sin(this.wobble) * 0.4 + windX * 0.3;
        this.y += this.vy;
        if (this.y > h + 10 || this.x < -20 || this.x > w + 20) this.reset(w, h);
      } else if (this.type === 'rain') {
        this.x += this.vx;
        this.y += this.vy;
        if (this.y > h + 20 || this.x > w + 20) this.reset(w, h);
      } else if (this.type === 'leaf') {
        this.swing += this.swingSpeed;
        this.x += this.vx + Math.sin(this.swing) * 0.8 + windX;
        this.y += this.vy;
        this.rotation += this.rotSpeed;
        if (this.y > h + 20 || this.x < -40 || this.x > w + 40) this.reset(w, h);
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = this.alpha;

      if (this.type === 'snow') {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,220,255,0.9)';
        ctx.fill();
      } else if (this.type === 'rain') {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.vx * 0.5, this.y + this.length);
        ctx.strokeStyle = 'rgba(140,180,200,0.6)';
        ctx.lineWidth = this.size;
        ctx.stroke();
      } else if (this.type === 'leaf') {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size * 0.5, this.size, 0, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${this.hue},${this.sat}%,${this.lum}%,1)`;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -this.size);
        ctx.lineTo(0, this.size);
        ctx.strokeStyle = `hsla(${this.hue},${this.sat - 10}%,${this.lum - 10}%,0.5)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /* ── Cloud ────────────────────────────────────────────────── */
  class Cloud {
    constructor(w, h) {
      this.reset(w, h, true);
    }
    reset(w, h, initial = false) {
      this.x     = initial ? Math.random() * w : -300;
      this.y     = Math.random() * (h * 0.35) + 20;
      this.speed = Math.random() * 0.3 + 0.1;
      this.scale = Math.random() * 0.8 + 0.4;
      this.alpha = Math.random() * 0.3 + 0.05;
      this.width = Math.random() * 180 + 120;
    }
    update(w, h) {
      this.x += this.speed + windX * 0.5;
      if (this.x > w + 350) this.reset(w, h);
    }
    draw(ctx, theme) {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.translate(this.x, this.y);
      ctx.scale(this.scale, this.scale * 0.5);

      const colors = {
        winter: 'rgba(180,200,230,1)',
        summer: 'rgba(255,240,200,1)',
        rainy:  'rgba(80,100,130,1)',
        autumn: 'rgba(180,150,120,1)'
      };
      const color = colors[theme] || 'rgba(180,200,230,1)';

      // Fluffy cloud shape
      const segs = 5;
      for (let i = 0; i < segs; i++) {
        const bx = (i / (segs-1) - 0.5) * this.width;
        const by = Math.sin(i / (segs-1) * Math.PI) * -30;
        const r  = 25 + Math.sin(i * 1.4) * 10;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /* ── Procedural tree ─────────────────────────────────────── */
  class Tree {
    constructor(x, h, variant) {
      this.x       = x;
      this.baseY   = h;
      this.height  = Math.random() * 120 + 80;
      this.spread  = Math.random() * 30 + 20;
      this.variant = variant || Math.floor(Math.random() * 3);
      this.depth   = Math.random() * 0.5 + 0.3; // parallax layer
      this.alpha   = 0.3 + this.depth * 0.4;
    }

    draw(ctx, theme, t) {
      ctx.save();
      ctx.globalAlpha = this.alpha;

      const colors = {
        winter: { trunk: '#2a3040', foliage: '#1a2535' },
        summer: { trunk: '#3a2010', foliage: '#1a3510' },
        rainy:  { trunk: '#1a2028', foliage: '#0a1520' },
        autumn: { trunk: '#2a1505', foliage: '#3a1500' }
      };
      const c = colors[theme] || colors.winter;

      const sway = Math.sin(t * 0.8 + this.x * 0.01) * windX * 4 * this.depth;

      // Trunk
      ctx.beginPath();
      ctx.moveTo(this.x, this.baseY);
      ctx.quadraticCurveTo(this.x + sway * 0.5, this.baseY - this.height * 0.4, this.x + sway, this.baseY - this.height);
      ctx.strokeStyle = c.trunk;
      ctx.lineWidth = 4 * this.depth + 2;
      ctx.stroke();

      // Foliage (vary by variant)
      ctx.translate(this.x + sway, this.baseY - this.height);
      ctx.fillStyle = c.foliage;

      if (this.variant === 0) {
        // Conifer / triangle
        for (let i = 0; i < 3; i++) {
          const level = i / 3;
          ctx.beginPath();
          ctx.moveTo(0, -this.spread * (1 - level));
          ctx.lineTo(-this.spread * (1 - level * 0.5), this.spread * 0.4 * (1 - level) + i * 12);
          ctx.lineTo( this.spread * (1 - level * 0.5), this.spread * 0.4 * (1 - level) + i * 12);
          ctx.closePath();
          ctx.fill();
        }
      } else if (this.variant === 1) {
        // Round deciduous
        ctx.beginPath();
        ctx.arc(0, 0, this.spread * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-this.spread * 0.4, this.spread * 0.2, this.spread * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc( this.spread * 0.4, this.spread * 0.2, this.spread * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Sparse dead tree (autumn/winter)
        const branches = 4;
        for (let b = 0; b < branches; b++) {
          const angle = (b / branches) * Math.PI - Math.PI / 2;
          const len   = this.spread * 0.7;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(angle) * len + sway * 0.3, Math.sin(angle) * len);
          ctx.strokeStyle = c.trunk;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init(gameCanvasId, menuCanvasId) {
    canvas = document.getElementById(gameCanvasId);
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    if (menuCanvasId) {
      menuCanvas = document.getElementById(menuCanvasId);
      if (menuCanvas) menuCtx = menuCanvas.getContext('2d');
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Wind simulation: slowly fluctuate
    setInterval(() => {
      windX += (Math.random() - 0.5) * 0.05;
      windX = Math.max(-0.8, Math.min(0.8, windX));
    }, 2000);
  }

  function resizeCanvas() {
    if (canvas) {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    if (menuCanvas) {
      menuCanvas.width  = window.innerWidth;
      menuCanvas.height = window.innerHeight;
    }
    buildScene(currentTheme);
  }

  /* ── Scene builder ─────────────────────────────────────────── */
  function buildScene(theme) {
    particles = [];
    trees     = [];
    clouds    = [];

    const w = W(), h = H();
    const COUNTS = { snow: 200, rain: 350, leaf: 80 };

    if (theme === 'winter') {
      for (let i = 0; i < COUNTS.snow; i++) particles.push(new Particle('snow', w, h));
    } else if (theme === 'rainy') {
      for (let i = 0; i < COUNTS.rain; i++) particles.push(new Particle('rain', w, h));
      lightning.nextFlash = Date.now() + 3000 + Math.random() * 8000;
    } else if (theme === 'autumn') {
      for (let i = 0; i < COUNTS.leaf; i++) particles.push(new Particle('leaf', w, h));
    }

    // Clouds (all themes)
    for (let i = 0; i < 8; i++) clouds.push(new Cloud(w, h));

    // Trees (all themes)
    const treeCount = 12;
    for (let i = 0; i < treeCount; i++) {
      const x = (i / treeCount) * w * 1.2 - w * 0.1;
      trees.push(new Tree(x, h, i % 3));
    }
  }

  /* ── Theme switcher ─────────────────────────────────────────── */
  function setTheme(theme) {
    currentTheme = theme;
    buildScene(theme);
  }

  /* ── Main loop ─────────────────────────────────────────────── */
  function startGameLoop() {
    if (frameId) cancelAnimationFrame(frameId);
    loop();
  }

  function stopGameLoop() {
    if (frameId) { cancelAnimationFrame(frameId); frameId = null; }
  }

  function loop() {
    frameId = requestAnimationFrame(loop);
    time += 0.016;

    if (!canvas || !ctx) return;
    const w = W(), h = H();
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx, w, h);
    drawParallaxLayers(ctx, w, h);
    updateAndDrawParticles(ctx, w, h);
    drawThemeEffects(ctx, w, h);
  }

  /* ── Menu loop ──────────────────────────────────────────────── */
  function startMenuLoop() {
    if (menuFrameId) cancelAnimationFrame(menuFrameId);
    menuLoop();
  }

  function stopMenuLoop() {
    if (menuFrameId) { cancelAnimationFrame(menuFrameId); menuFrameId = null; }
  }

  function menuLoop() {
    menuFrameId = requestAnimationFrame(menuLoop);
    if (!menuCanvas || !menuCtx) return;
    const w = menuCanvas.width, h = menuCanvas.height;
    menuCtx.clearRect(0, 0, w, h);

    // Subtle starfield for menu
    drawStarfield(menuCtx, w, h);

    // Draw a few theme particles on menu too
    particles.forEach(p => { p.update(w, h); p.draw(menuCtx); });
    clouds.forEach(c => { c.update(w, h); c.draw(menuCtx, currentTheme); });
  }

  /* ── Background gradient ────────────────────────────────────── */
  function drawBackground(ctx, w, h) {
    const gradients = {
      winter: ['#06101f', '#0a1528', '#0d1e34'],
      summer: ['#1a0800', '#2a1200', '#3a1a00'],
      rainy:  ['#030810', '#05101c', '#081520'],
      autumn: ['#0e0600', '#1a0c00', '#241200']
    };
    const stops = gradients[currentTheme] || gradients.winter;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0,   stops[0]);
    grad.addColorStop(0.5, stops[1]);
    grad.addColorStop(1,   stops[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Ground fog layer
    const fogColor = {
      winter: 'rgba(140,160,200,',
      summer: 'rgba(255,200,100,',
      rainy:  'rgba(80,110,150,',
      autumn: 'rgba(160,100,60,'
    }[currentTheme];

    const fog = ctx.createLinearGradient(0, h * 0.7, 0, h);
    fog.addColorStop(0, fogColor + '0)');
    fog.addColorStop(1, fogColor + '0.12)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, h * 0.7, w, h * 0.3);
  }

  /* ── Starfield (menu + winter) ──────────────────────────────── */
  function drawStarfield(ctx, w, h) {
    if (!drawStarfield._stars) {
      drawStarfield._stars = Array.from({ length: 120 }, () => ({
        x: Math.random(), y: Math.random() * 0.6,
        r: Math.random() * 1.2, twinkle: Math.random() * Math.PI * 2
      }));
    }
    drawStarfield._stars.forEach(s => {
      s.twinkle += 0.02;
      const alpha = 0.3 + Math.sin(s.twinkle) * 0.3;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,220,255,${alpha})`;
      ctx.fill();
    });
  }

  /* ── Parallax depth layers ──────────────────────────────────── */
  function drawParallaxLayers(ctx, w, h) {
    // Stars for winter
    if (currentTheme === 'winter' || currentTheme === 'rainy') {
      drawStarfield(ctx, w, h);
    }

    // Clouds (behind trees)
    clouds.forEach(c => { c.update(w, h); c.draw(ctx, currentTheme); });

    // Trees (sorted by depth for parallax)
    const sorted = [...trees].sort((a, b) => a.depth - b.depth);
    sorted.forEach(t => t.draw(ctx, currentTheme, time));
  }

  /* ── Particles ──────────────────────────────────────────────── */
  function updateAndDrawParticles(ctx, w, h) {
    particles.forEach(p => { p.update(w, h); p.draw(ctx); });
  }

  /* ── Per-theme special effects ──────────────────────────────── */
  function drawThemeEffects(ctx, w, h) {
    if (currentTheme === 'winter') {
      // Cold blue vignette
      const vig = ctx.createRadialGradient(w/2, h/2, h * 0.3, w/2, h/2, h * 0.8);
      vig.addColorStop(0, 'transparent');
      vig.addColorStop(1, 'rgba(20,40,80,0.25)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

    } else if (currentTheme === 'summer') {
      // Heat haze: subtle wavy distortion simulation via partial transparency strips
      for (let y = 0; y < h; y += 60) {
        const offset = Math.sin(time * 1.5 + y * 0.05) * 2;
        const alpha  = 0.008 + Math.sin(time + y * 0.02) * 0.005;
        ctx.fillStyle = `rgba(255,160,30,${Math.max(0, alpha)})`;
        ctx.fillRect(0 + offset, y, w, 30);
      }
      // Warm vignette
      const vig = ctx.createRadialGradient(w/2, h*0.8, h * 0.1, w/2, h*0.8, h * 0.9);
      vig.addColorStop(0, 'transparent');
      vig.addColorStop(1, 'rgba(100,50,0,0.15)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

    } else if (currentTheme === 'rainy') {
      // Screen darkening
      ctx.fillStyle = 'rgba(0,10,20,0.15)';
      ctx.fillRect(0, 0, w, h);

      // Lightning
      const now = Date.now();
      if (now > lightning.nextFlash) {
        triggerLightning(now);
      }
      if (lightning.active) {
        const age   = now - lightning.startTime;
        const alpha = Math.max(0, 0.6 - age / 150);
        ctx.fillStyle = `rgba(180,200,255,${alpha})`;
        ctx.fillRect(0, 0, w, h);
        if (alpha <= 0) lightning.active = false;
      }

    } else if (currentTheme === 'autumn') {
      // Warm vignette
      const vig = ctx.createRadialGradient(w/2, h/2, h * 0.2, w/2, h/2, h * 0.9);
      vig.addColorStop(0, 'transparent');
      vig.addColorStop(1, 'rgba(80,30,5,0.2)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function triggerLightning(now) {
    lightning.active    = true;
    lightning.startTime = now;
    lightning.nextFlash = now + 4000 + Math.random() * 12000;
    // Optional: play thunder SFX
    playSound('thunder');
  }

  /* ── Sound ──────────────────────────────────────────────────── */
  const audioCtx = (() => {
    try { return new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return null; }
  })();

  function playSound(type) {
    if (!soundEnabled || !audioCtx) return;
    try {
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const sounds = {
        move:    { freq: 420, type: 'sine',    dur: 0.08, vol: 0.1 },
        capture: { freq: 280, type: 'triangle',dur: 0.15, vol: 0.15 },
        check:   { freq: 600, type: 'square',  dur: 0.2,  vol: 0.12 },
        castle:  { freq: 360, type: 'sine',    dur: 0.12, vol: 0.1 },
        thunder: { freq: 60,  type: 'sawtooth',dur: 0.6,  vol: 0.04 }
      };

      const s = sounds[type] || sounds.move;
      osc.frequency.setValueAtTime(s.freq, audioCtx.currentTime);
      osc.type = s.type;
      gain.gain.setValueAtTime(s.vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + s.dur);

      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + s.dur + 0.05);

      // Add harmonic for richer sound
      if (type === 'capture' || type === 'check') {
        const osc2 = audioCtx.createOscillator();
        osc2.connect(gain);
        osc2.frequency.setValueAtTime(s.freq * 1.5, audioCtx.currentTime);
        osc2.type = 'sine';
        gain.gain.setValueAtTime(s.vol * 0.5, audioCtx.currentTime);
        osc2.start(audioCtx.currentTime);
        osc2.stop(audioCtx.currentTime + s.dur);
      }
    } catch(e) {}
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    return soundEnabled;
  }

  /* ── Public ──────────────────────────────────────────────────── */
  return {
    init,
    setTheme,
    startGameLoop,
    stopGameLoop,
    startMenuLoop,
    stopMenuLoop,
    playSound,
    toggleSound,
    isSound: () => soundEnabled
  };

})();
