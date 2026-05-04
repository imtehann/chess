class EnvironmentRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.season = 'autumn';
    this.particles = [];
    this.trees = [];
    this.clouds = [];
    this.lightning = { active: false, timer: 0, x: 0, alpha: 0 };
    this.time = 0;
    this.windX = 0;
    this.windTarget = 0;
    this.fogDensity = 0;
    this.fogTarget = 0.15;
    this._raf = null;
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(this.canvas.parentElement);
    this._resize();
    this._buildScene();
    this._loop();
  }

  _resize() {
    if (!this.canvas) return;
    const p = this.canvas.parentElement;
    this.canvas.width = p.offsetWidth;
    this.canvas.height = p.offsetHeight;
    this.W = this.canvas.width;
    this.H = this.canvas.height;
    this._buildScene();
  }

  setSeason(season) {
    this.season = season;
    this.particles = [];
    this.lightning = { active: false, timer: 0, x: 0, alpha: 0 };
    this._applySeasonCSS();
    this._buildScene();
  }

  _applySeasonCSS() {
    const root = document.documentElement;
    const configs = {
      autumn: { top:'#0d1520', bot:'#1a2a1a', fog:'rgba(180,140,80,0.06)', tint:'rgba(120,80,20,0.04)' },
      winter: { top:'#080e1a', bot:'#101a2e', fog:'rgba(180,200,240,0.1)', tint:'rgba(100,140,200,0.04)' },
      summer: { top:'#1a1000', bot:'#3a1e00', fog:'rgba(255,160,40,0.04)', tint:'rgba(255,120,20,0.06)' },
      rain:   { top:'#050a12', bot:'#0a1020', fog:'rgba(80,100,140,0.15)', tint:'rgba(40,60,100,0.08)' },
    };
    const c = configs[this.season] || configs.autumn;
    root.style.setProperty('--season-sky-top', c.top);
    root.style.setProperty('--season-sky-bot', c.bot);
    root.style.setProperty('--season-fog', c.fog);
    root.style.setProperty('--season-tint', c.tint);
  }

  _buildScene() {
    if (!this.W) return;
    this._buildTrees();
    this._buildClouds();
    if (this.season === 'autumn') this._spawnLeaves(80);
    if (this.season === 'winter') this._spawnSnow(120);
    if (this.season === 'rain') this._spawnRain(220);
  }

  _buildTrees() {
    this.trees = [];
    if (!this.W) return;
    const count = Math.floor(this.W / 90) + 6;
    for (let i = 0; i < count; i++) {
      const x = (i / count) * this.W + (Math.random() - 0.5) * (this.W / count);
      const layer = Math.floor(Math.random() * 3); // 0=far, 1=mid, 2=near
      const scale = 0.5 + layer * 0.22 + Math.random() * 0.15;
      const h = (120 + Math.random() * 80) * scale;
      const shape = Math.random() < 0.5 ? 'pine' : 'round';
      const leafiness = this.season === 'winter' ? Math.random() * 0.2 :
                        this.season === 'autumn' ? 0.5 + Math.random() * 0.5 : 0.8 + Math.random() * 0.2;
      this.trees.push({ x, layer, scale, h, shape, leafiness, swayPhase: Math.random() * Math.PI * 2 });
    }
    this.trees.sort((a, b) => a.layer - b.layer);
  }

  _buildClouds() {
    this.clouds = [];
    const count = this.season === 'rain' ? 8 : 5;
    for (let i = 0; i < count; i++) {
      this.clouds.push({
        x: Math.random() * (this.W + 400) - 200,
        y: 20 + Math.random() * (this.H * 0.28),
        scale: 0.6 + Math.random() * 0.8,
        speed: 0.1 + Math.random() * 0.2,
        alpha: this.season === 'rain' ? 0.5 + Math.random() * 0.4 : 0.15 + Math.random() * 0.15
      });
    }
  }

  _spawnLeaves(n) {
    for (let i = 0; i < n; i++) {
      this.particles.push(this._newLeaf(true));
    }
  }
  _newLeaf(spread = false) {
    return {
      type: 'leaf',
      x: spread ? Math.random() * this.W : -20,
      y: spread ? Math.random() * this.H : -20,
      vx: 0.3 + Math.random() * 1.2,
      vy: 0.5 + Math.random() * 1.5,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.06,
      size: 4 + Math.random() * 6,
      color: ['#c84c0c','#e87a1a','#d4a012','#8b3a0c','#f0b830'][Math.floor(Math.random() * 5)],
      life: 1, alpha: 0.7 + Math.random() * 0.3,
      wobble: Math.random() * Math.PI * 2, wobbleSpeed: 0.03 + Math.random() * 0.02
    };
  }

  _spawnSnow(n) {
    for (let i = 0; i < n; i++) {
      this.particles.push(this._newSnow(true));
    }
  }
  _newSnow(spread = false) {
    return {
      type: 'snow',
      x: spread ? Math.random() * this.W : Math.random() * this.W,
      y: spread ? Math.random() * this.H : -8,
      vx: (Math.random() - 0.5) * 0.4,
      vy: 0.4 + Math.random() * 1.0,
      size: 1.5 + Math.random() * 3,
      alpha: 0.5 + Math.random() * 0.5,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.01 + Math.random() * 0.02
    };
  }

  _spawnRain(n) {
    for (let i = 0; i < n; i++) {
      this.particles.push(this._newRain(true));
    }
  }
  _newRain(spread = false) {
    return {
      type: 'rain',
      x: spread ? Math.random() * this.W : Math.random() * this.W,
      y: spread ? Math.random() * this.H : -20,
      vx: -1.5 - Math.random() * 1.5,
      vy: 12 + Math.random() * 8,
      len: 8 + Math.random() * 12,
      alpha: 0.2 + Math.random() * 0.35
    };
  }

  // ---- MAIN LOOP ----
  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    this.time += 0.016;
    this._update();
    this._draw();
  }

  _update() {
    if (!this.W || !this.H) return;

    // Wind
    if (Math.random() < 0.002) this.windTarget = (Math.random() - 0.5) * 1.5;
    this.windX += (this.windTarget - this.windX) * 0.01;

    // Fog
    if (Math.random() < 0.003) this.fogTarget = 0.05 + Math.random() * 0.2;
    this.fogDensity += (this.fogTarget - this.fogDensity) * 0.005;

    // Particles
    const maxP = this.season === 'rain' ? 300 : this.season === 'snow' ? 160 : 100;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p.type === 'leaf') {
        p.wobble += p.wobbleSpeed;
        p.x += p.vx * (1 + this.windX) + Math.sin(p.wobble) * 0.5;
        p.y += p.vy;
        p.rot += p.rotV;
        if (p.x > this.W + 30 || p.y > this.H + 30) {
          this.particles.splice(i, 1);
          if (this.season === 'autumn') this.particles.push(this._newLeaf());
        }
      } else if (p.type === 'snow') {
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * 0.6 + this.windX * 0.3;
        p.y += p.vy;
        if (p.y > this.H + 10) {
          this.particles.splice(i, 1);
          if (this.season === 'winter') this.particles.push(this._newSnow());
        }
      } else if (p.type === 'rain') {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y > this.H + 30 || p.x < -30) {
          this.particles.splice(i, 1);
          if (this.season === 'rain') this.particles.push(this._newRain());
        }
      }
    }

    // Clouds
    for (const c of this.clouds) {
      c.x += c.speed * (1 + this.windX * 0.1);
      if (c.x > this.W + 300) c.x = -300;
    }

    // Lightning
    if (this.season === 'rain') {
      this.lightning.timer -= 0.016;
      if (this.lightning.timer <= 0 && Math.random() < 0.003) {
        this.lightning = { active: true, timer: 0.1 + Math.random() * 0.15, x: Math.random() * this.W, alpha: 0.6 + Math.random() * 0.3 };
      }
      if (this.lightning.timer <= 0) this.lightning.active = false;
    }
  }

  _draw() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    // Sky gradient
    const skyColors = {
      autumn: ['#0d1520','#1a2a1a','#2a2010'],
      winter: ['#080e1a','#101a2e','#182030'],
      summer: ['#1a0e00','#3a2000','#2a1400'],
      rain:   ['#050810','#0a1020','#080d18'],
    };
    const sc = skyColors[this.season];
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, sc[0]);
    skyGrad.addColorStop(0.5, sc[1]);
    skyGrad.addColorStop(1, sc[2]);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Lightning flash
    if (this.lightning.active) {
      ctx.fillStyle = `rgba(200,220,255,${this.lightning.alpha * 0.3})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Stars (winter/night)
    if (this.season === 'winter' || this.season === 'autumn') {
      this._drawStars(ctx, W, H);
    }

    // Moon
    this._drawMoon(ctx, W, H);

    // Clouds
    for (const c of this.clouds) this._drawCloud(ctx, c);

    // Lightning bolt
    if (this.lightning.active) {
      this._drawLightningBolt(ctx, this.lightning.x, 0, H * 0.6, this.lightning.alpha);
    }

    // Far trees
    for (const t of this.trees.filter(t => t.layer === 0)) this._drawTree(ctx, t, W, H);

    // Fog
    if (this.fogDensity > 0.01) {
      const fogGrad = ctx.createLinearGradient(0, H * 0.5, 0, H);
      const fc = { autumn:'180,140,80', winter:'140,160,200', summer:'220,160,80', rain:'80,100,140' }[this.season];
      fogGrad.addColorStop(0, `rgba(${fc},0)`);
      fogGrad.addColorStop(1, `rgba(${fc},${this.fogDensity})`);
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, H * 0.4, W, H * 0.6);
    }

    // Mid trees
    for (const t of this.trees.filter(t => t.layer === 1)) this._drawTree(ctx, t, W, H);
    // Near trees
    for (const t of this.trees.filter(t => t.layer === 2)) this._drawTree(ctx, t, W, H);

    // Ground
    this._drawGround(ctx, W, H);

    // Particles
    this._drawParticles(ctx);

    // Vignette
    const vig = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.85);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  _drawStars(ctx, W, H) {
    if (!this._stars) {
      this._stars = [];
      for (let i = 0; i < 120; i++) {
        this._stars.push({ x: Math.random(), y: Math.random() * 0.5, r: 0.5 + Math.random() * 1, t: Math.random() * Math.PI * 2 });
      }
    }
    for (const s of this._stars) {
      const tw = 0.5 + 0.5 * Math.sin(this.time * 0.5 + s.t);
      ctx.globalAlpha = tw * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawMoon(ctx, W, H) {
    const mx = W * 0.78, my = H * 0.12;
    const mr = 22;
    // Glow
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4);
    const moonColor = { autumn:'220,180,80', winter:'180,200,240', summer:'255,200,100', rain:'80,100,140' }[this.season];
    glow.addColorStop(0, `rgba(${moonColor},0.12)`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    // Moon disc
    ctx.fillStyle = `rgba(${moonColor},0.85)`;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    // Shadow crescent
    ctx.fillStyle = `rgba(0,0,0,0.4)`;
    ctx.beginPath();
    ctx.arc(mx + 6, my - 2, mr - 2, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawCloud(ctx, c) {
    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = this.season === 'rain' ? '#1a2030' : '#2a3050';
    const blobOffsets = [[0,0,40],[30,10,30],[-30,10,28],[55,5,22],[-55,5,20],[15,-15,22],[-15,-15,20]];
    for (const [ox, oy, r] of blobOffsets) {
      ctx.beginPath();
      ctx.arc(c.x + ox * c.scale, c.y + oy * c.scale, r * c.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawLightningBolt(ctx, x, y0, y1, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#c8d8ff';
    ctx.shadowColor = '#a0c0ff';
    ctx.shadowBlur = 20;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let cx = x, cy = y0;
    ctx.moveTo(cx, cy);
    while (cy < y1) {
      cx += (Math.random() - 0.5) * 40;
      cy += 30 + Math.random() * 40;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawTree(ctx, t, W, H) {
    const sway = Math.sin(this.time * 0.6 + t.swayPhase) * 0.015 * (t.layer + 1);
    const baseX = t.x;
    const baseY = H * (0.65 + t.layer * 0.07);
    const h = t.h;

    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.rotate(sway * (this.windX * 0.3 + 0.05));

    // Layer opacity
    const layerAlpha = [0.45, 0.65, 0.9][t.layer];
    ctx.globalAlpha = layerAlpha;

    // Trunk
    const trunkW = Math.max(3, h * 0.06 * t.scale);
    const trunkH = h * 0.35;
    const trunkColors = { autumn:'#3a2010', winter:'#2a2028', summer:'#2e1a08', rain:'#1a1820' };
    ctx.fillStyle = trunkColors[this.season];
    ctx.fillRect(-trunkW / 2, -trunkH, trunkW, trunkH);

    // Foliage
    if (t.leafiness > 0.1) {
      const leafColors = {
        autumn: ['#c84c0c','#e87a1a','#8b3a0c','#d4a012','#a03010'],
        winter: ['#1a2818','#0e1e12','#162214'],
        summer: ['#1a3a10','#2a4a18','#0e2808','#223812'],
        rain:   ['#0e1e10','#162418','#0a1a0c'],
      };
      const colors = leafColors[this.season];

      if (t.shape === 'pine') {
        // Pine tree layers
        const levels = Math.ceil(3 * t.leafiness);
        for (let l = 0; l < levels; l++) {
          const ly = -trunkH - (l * h * 0.22);
          const lw = (h * 0.45 - l * h * 0.1) * t.leafiness;
          ctx.fillStyle = colors[l % colors.length];
          ctx.beginPath();
          ctx.moveTo(-lw, ly);
          ctx.lineTo(lw, ly);
          ctx.lineTo(0, ly - h * 0.28);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        // Round/bushy tree
        const cr = h * 0.38 * t.leafiness;
        const cy = -trunkH - cr * 0.6;
        // Multiple blob clusters
        const blobs = [[0, 0, 1], [-cr * 0.4, cr * 0.1, 0.7], [cr * 0.4, cr * 0.1, 0.7], [0, -cr * 0.3, 0.7]];
        for (const [bx, by, bs] of blobs) {
          const wobble = Math.sin(this.time * 0.4 + t.swayPhase + bx) * 2;
          ctx.fillStyle = colors[Math.floor(Math.abs(bx)) % colors.length];
          ctx.beginPath();
          ctx.arc(bx + wobble, cy + by, cr * bs, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  _drawGround(ctx, W, H) {
    const groundGrad = ctx.createLinearGradient(0, H * 0.72, 0, H);
    const gc = {
      autumn: ['#1a1008','#100c04'],
      winter: ['#1a1e28','#0e1018'],
      summer: ['#1a1204','#100800'],
      rain:   ['#0a1018','#06080e'],
    }[this.season];
    groundGrad.addColorStop(0, gc[0]);
    groundGrad.addColorStop(1, gc[1]);
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, H * 0.75, W, H * 0.25);

    // Ground line glow
    ctx.strokeStyle = {autumn:'rgba(120,80,20,0.3)',winter:'rgba(140,160,200,0.2)',summer:'rgba(180,100,20,0.2)',rain:'rgba(60,80,120,0.25)'}[this.season];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.75);
    ctx.lineTo(W, H * 0.75);
    ctx.stroke();
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      if (p.type === 'leaf') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        // Vein
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-p.size, 0);
        ctx.lineTo(p.size, 0);
        ctx.stroke();
      } else if (p.type === 'snow') {
        ctx.fillStyle = `rgba(220,235,255,${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        // Sparkle cross
        ctx.strokeStyle = `rgba(255,255,255,${p.alpha * 0.5})`;
        ctx.lineWidth = 0.5;
        const r = p.size * 1.5;
        for (let a = 0; a < Math.PI; a += Math.PI / 3) {
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
          ctx.lineTo(p.x - Math.cos(a) * r, p.y - Math.sin(a) * r);
          ctx.stroke();
        }
      } else if (p.type === 'rain') {
        ctx.strokeStyle = `rgba(140,180,220,${p.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 0.08, p.y + p.len);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Heat haze overlay (summer)
  drawHeatHaze(ctx, W, H, time) {
    // Applied as a post-effect in the main draw if needed
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._resizeObs.disconnect();
  }
}
