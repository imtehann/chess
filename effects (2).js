/**
 * effects.js — Environmental Effects Engine
 * Handles: particles (snow/rain/leaves), procedural trees, clouds, lightning,
 * heat haze, menu background animation, depth layering.
 */

const Effects = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  let envCanvas = null;
  let envCtx = null;
  let menuCanvas = null;
  let menuCtx = null;
  let animId = null;
  let menuAnimId = null;
  let currentSeason = 'winter';
  let frameCount = 0;
  let lastLightning = 0;
  let lightningScheduled = false;
  let W = 0, H = 0;

  // ── Particle Systems ───────────────────────────────────────────────────────
  let particles = [];
  let leaves = [];
  let clouds = [];
  let trees = [];

  // ── Season Config ──────────────────────────────────────────────────────────
  const SEASON_CONFIG = {
    winter: {
      bgTop: '#0a0d18', bgBottom: '#111830',
      fogColor: 'rgba(180,210,255,0.06)',
      ambientLight: 'rgba(100,140,220,0.03)',
      particleCount: 180,
      particleColor: () => `rgba(${200+Math.random()*55|0},${220+Math.random()*35|0},${240+Math.random()*15|0},${0.5+Math.random()*0.4})`,
      particleSize: () => 1.5 + Math.random() * 3,
      particleSpeed: () => ({ x: (Math.random()-0.5)*0.8, y: 0.6 + Math.random() * 1.2 }),
      treeLeafColor: null,
      treeStyle: 'pine',
    },
    summer: {
      bgTop: '#120c08', bgBottom: '#1a1008',
      fogColor: 'rgba(255,180,60,0.03)',
      ambientLight: 'rgba(255,160,40,0.04)',
      particleCount: 0,
      treeLeafColor: '#1a4a18',
      treeStyle: 'round',
    },
    rain: {
      bgTop: '#06080e', bgBottom: '#0a0c16',
      fogColor: 'rgba(80,100,160,0.08)',
      ambientLight: 'rgba(60,80,160,0.04)',
      particleCount: 300,
      particleColor: () => `rgba(120,150,210,${0.3+Math.random()*0.4})`,
      particleSize: () => 0.8,
      particleSpeed: () => ({ x: -0.3 + Math.random()*0.2, y: 8 + Math.random() * 6 }),
      treeLeafColor: '#1a3520',
      treeStyle: 'round',
    },
    autumn: {
      bgTop: '#0e0906', bgBottom: '#180d06',
      fogColor: 'rgba(200,120,40,0.04)',
      ambientLight: 'rgba(200,100,30,0.04)',
      particleCount: 40,
      particleColor: () => {
        const colors = ['#c8621a','#d4820a','#e09010','#b84010','#d45010','#e8a020'];
        return colors[Math.floor(Math.random()*colors.length)];
      },
      particleSize: () => 4 + Math.random() * 6,
      particleSpeed: () => ({ x: (Math.random()-0.5)*1.5, y: 0.4 + Math.random() * 0.8 }),
      treeLeafColor: '#c87010',
      treeStyle: 'mixed',
    }
  };

  // ── Tree Generation ────────────────────────────────────────────────────────
  function generateTrees(w, h) {
    trees = [];
    const count = Math.floor(w / 80) + 6;
    for (let i = 0; i < count; i++) {
      const x = (i / count) * w + (Math.random() - 0.5) * (w / count * 0.8);
      const layer = Math.random(); // 0=back, 1=front
      const cfg = SEASON_CONFIG[currentSeason];
      trees.push({
        x: x + w * 0.02,
        layer,
        height: 80 + Math.random() * 140 * (1 - layer * 0.3),
        trunkW: 6 + Math.random() * 10,
        style: cfg.treeStyle === 'mixed'
          ? (['pine','round','bare'])[Math.floor(Math.random()*3)]
          : (cfg.treeStyle || 'pine'),
        hasLeaves: Math.random() > (currentSeason === 'autumn' ? 0.3 : 0.1),
        leafDensity: 0.4 + Math.random() * 0.6,
        swayOffset: Math.random() * Math.PI * 2,
        swaySpeed: 0.3 + Math.random() * 0.5,
        swayAmp: 0.02 + Math.random() * 0.04,
      });
    }
    trees.sort((a, b) => a.layer - b.layer);
  }

  function drawTree(ctx, tree, t, h, w) {
    const baseY = h * 0.82;
    const sway = Math.sin(t * tree.swaySpeed + tree.swayOffset) * tree.swayAmp * tree.height;
    const x = tree.x;
    const trunkH = tree.height * 0.3;
    const alpha = 0.3 + tree.layer * 0.5;
    const scale = 0.6 + tree.layer * 0.4;
    const treeH = tree.height * scale;
    const cfg = SEASON_CONFIG[currentSeason];

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, baseY);

    // Trunk
    ctx.fillStyle = `hsl(25,30%,${10+tree.layer*8}%)`;
    ctx.beginPath();
    ctx.moveTo(-tree.trunkW/2*scale, 0);
    ctx.lineTo(tree.trunkW/2*scale, 0);
    ctx.lineTo(tree.trunkW/3*scale + sway*0.3, -trunkH*scale);
    ctx.lineTo(-tree.trunkW/3*scale + sway*0.3, -trunkH*scale);
    ctx.fill();

    if (tree.style === 'pine') {
      if (currentSeason === 'winter') {
        // Snow-capped pine
        const layers = 4;
        for (let l = 0; l < layers; l++) {
          const ly = -trunkH*scale - (l / layers) * (treeH - trunkH*scale);
          const lw = treeH * (1 - l/layers) * 0.4 * tree.leafDensity;
          const swayL = sway * (l/layers);
          ctx.fillStyle = `hsl(130,${30+tree.leafDensity*20}%,${12+tree.layer*5}%)`;
          ctx.beginPath();
          ctx.moveTo(swayL - lw, ly + treeH/layers*0.6);
          ctx.lineTo(swayL + lw, ly + treeH/layers*0.6);
          ctx.lineTo(swayL, ly - treeH/(layers*1.2));
          ctx.fill();
          // Snow on branches (winter)
          ctx.fillStyle = `rgba(230,240,255,${0.5*tree.leafDensity})`;
          ctx.beginPath();
          ctx.moveTo(swayL - lw, ly + treeH/layers*0.6);
          ctx.lineTo(swayL + lw, ly + treeH/layers*0.6);
          ctx.lineTo(swayL + lw*0.8, ly + treeH/layers*0.5);
          ctx.lineTo(swayL - lw*0.8, ly + treeH/layers*0.5);
          ctx.fill();
        }
      } else {
        // Normal pine
        const layers = 4;
        for (let l = 0; l < layers; l++) {
          const ly = -trunkH*scale - (l / layers) * (treeH - trunkH*scale);
          const lw = treeH * (1 - l/layers) * 0.4 * tree.leafDensity;
          const swayL = sway * (l/layers);
          const leafColor = cfg.treeLeafColor || '#1a4a18';
          ctx.fillStyle = leafColor;
          ctx.globalAlpha = alpha * (0.6 + 0.4 * (1-l/layers));
          ctx.beginPath();
          ctx.moveTo(swayL - lw, ly + treeH/layers*0.6);
          ctx.lineTo(swayL + lw, ly + treeH/layers*0.6);
          ctx.lineTo(swayL, ly - treeH/(layers*1.2));
          ctx.fill();
        }
      }
    } else if (tree.style === 'round') {
      if (tree.hasLeaves) {
        const leafColor = cfg.treeLeafColor || '#1a4a18';
        ctx.globalAlpha = alpha * tree.leafDensity;
        const cx = sway, cy = -trunkH*scale - treeH*0.4;
        const rad = treeH * 0.35;
        // Multi-blob foliage
        for (let b = 0; b < 5; b++) {
          const bx = cx + Math.cos(b * 1.26 + tree.swayOffset) * rad * 0.4;
          const by = cy + Math.sin(b * 1.26 + tree.swayOffset) * rad * 0.3;
          ctx.fillStyle = leafColor;
          ctx.beginPath();
          ctx.arc(bx, by, rad * (0.5 + Math.sin(b)*0.15), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = leafColor;
        ctx.beginPath();
        ctx.arc(cx, cy, rad * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (tree.style === 'bare') {
      // Bare tree branches
      ctx.strokeStyle = `hsl(25,25%,${15+tree.layer*8}%)`;
      ctx.lineWidth = tree.trunkW * 0.3 * scale;
      function branch(bx, by, len, angle, depth) {
        if (depth <= 0 || len < 2) return;
        const ex = bx + Math.cos(angle + sway*0.5) * len;
        const ey = by + Math.sin(angle + sway*0.3) * len;
        ctx.globalAlpha = alpha * (0.5 + depth * 0.1);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.lineWidth *= 0.65;
        branch(ex, ey, len*0.65, angle - 0.5 + Math.random()*0.3, depth-1);
        branch(ex, ey, len*0.65, angle + 0.5 + Math.random()*0.3, depth-1);
      }
      branch(sway*0.2, -trunkH*scale, treeH*0.22*scale, -Math.PI/2, 4);
    }

    ctx.restore();
  }

  // ── Clouds ─────────────────────────────────────────────────────────────────
  function generateClouds(w) {
    clouds = [];
    const count = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      clouds.push({
        x: Math.random() * w * 1.5,
        y: 20 + Math.random() * 180,
        speed: 0.08 + Math.random() * 0.15,
        width: 80 + Math.random() * 200,
        height: 30 + Math.random() * 60,
        alpha: 0.05 + Math.random() * 0.12,
        layer: Math.random(),
        blobs: Array.from({length:4+Math.floor(Math.random()*4)}, () => ({
          dx: (Math.random()-0.5) * 1.2,
          dy: (Math.random()-0.2) * 0.5,
          r: 0.3 + Math.random() * 0.5,
        }))
      });
    }
  }

  function drawClouds(ctx, t, w) {
    clouds.forEach(cloud => {
      cloud.x += cloud.speed;
      if (cloud.x > w + cloud.width) cloud.x = -cloud.width - 20;

      const alpha = cloud.alpha * (currentSeason === 'rain' ? 3 : 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cloud.x, cloud.y);

      cloud.blobs.forEach(blob => {
        const grad = ctx.createRadialGradient(
          blob.dx * cloud.width, blob.dy * cloud.height, 0,
          blob.dx * cloud.width, blob.dy * cloud.height, blob.r * cloud.width
        );
        const cloudColor = currentSeason === 'rain' ? '70,80,120' : '200,210,230';
        grad.addColorStop(0, `rgba(${cloudColor},${alpha*3})`);
        grad.addColorStop(1, `rgba(${cloudColor},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(blob.dx * cloud.width, blob.dy * cloud.height, blob.r * cloud.width, 0, Math.PI*2);
        ctx.fill();
      });
      ctx.restore();
    });
  }

  // ── Particle Init ──────────────────────────────────────────────────────────
  function initParticles(w, h) {
    particles = [];
    const cfg = SEASON_CONFIG[currentSeason];
    if (!cfg.particleCount) return;
    for (let i = 0; i < cfg.particleCount; i++) {
      spawnParticle(w, h, true);
    }
  }

  function spawnParticle(w, h, random = false) {
    const cfg = SEASON_CONFIG[currentSeason];
    if (!cfg.particleCount) return;
    const vel = cfg.particleSpeed();
    const p = {
      x: random ? Math.random() * w : Math.random() * w,
      y: random ? Math.random() * h : -10,
      vx: vel.x,
      vy: vel.y,
      size: cfg.particleSize(),
      color: cfg.particleColor(),
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random()-0.5) * 0.08,
      opacity: 0.4 + Math.random() * 0.6,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.04,
    };
    particles.push(p);
  }

  function updateParticles(w, h) {
    const cfg = SEASON_CONFIG[currentSeason];
    const windX = currentSeason === 'winter' ? Math.sin(frameCount * 0.003) * 0.3 : 0;

    particles = particles.filter(p => {
      p.wobble += p.wobbleSpeed;
      p.x += p.vx + windX + Math.sin(p.wobble) * 0.3;
      p.y += p.vy;
      p.rot += p.rotSpeed;
      return p.y < h + 20 && p.x > -20 && p.x < w + 20;
    });

    while (particles.length < cfg.particleCount) {
      spawnParticle(w, h, false);
    }
  }

  function drawParticles(ctx) {
    if (currentSeason === 'rain') {
      // Draw rain as lines
      particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.opacity * 0.6;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 2, p.y + p.vy * 0.5);
        ctx.stroke();
        ctx.restore();
      });
    } else if (currentSeason === 'autumn') {
      // Draw leaves as small shapes
      particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.opacity * 0.8;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      });
    } else {
      // Snow
      particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI*2);
        ctx.fill();
        // Snowflake sparkle
        if (p.size > 3) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.5;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + Math.cos(a) * p.size, p.y + Math.sin(a) * p.size);
            ctx.stroke();
          }
        }
        ctx.restore();
      });
    }
  }

  // ── Heat Haze (summer) ────────────────────────────────────────────────────
  let hazeCanvas = null;
  function applyHeatHaze(ctx, w, h, t) {
    if (currentSeason !== 'summer') return;
    // Subtle wavy distortion at bottom
    const intensity = 0.4;
    for (let y = h * 0.6; y < h; y += 4) {
      const wave = Math.sin(y * 0.1 + t * 0.5) * intensity;
      const alpha = ((y - h*0.6) / (h*0.4)) * 0.03;
      ctx.fillStyle = `rgba(255,160,40,${alpha})`;
      ctx.fillRect(0 + wave, y, w, 2);
    }
  }

  // ── Lightning ─────────────────────────────────────────────────────────────
  function triggerLightning() {
    const flash = document.getElementById('lightning-flash');
    if (!flash) return;
    flash.classList.add('flash');
    setTimeout(() => flash.classList.remove('flash'), 200);

    // Draw lightning bolt on canvas
    if (envCtx && currentSeason === 'rain') {
      const x = W * 0.2 + Math.random() * W * 0.6;
      drawLightningBolt(envCtx, x, 0, x + (Math.random()-0.5)*60, H*0.5, 8);
      setTimeout(() => { /* bolt fades naturally */ }, 100);
    }
  }

  function drawLightningBolt(ctx, x1, y1, x2, y2, splits) {
    if (splits <= 0) return;
    ctx.save();
    ctx.strokeStyle = `rgba(200,220,255,${0.8*(splits/8)})`;
    ctx.lineWidth = splits * 0.5;
    ctx.shadowColor = 'rgba(150,180,255,0.8)';
    ctx.shadowBlur = 10;

    const mx = (x1+x2)/2 + (Math.random()-0.5)*40;
    const my = (y1+y2)/2 + (Math.random()-0.5)*20;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(mx, my);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (splits > 2 && Math.random() > 0.5) {
      drawLightningBolt(ctx, mx, my, mx+(Math.random()-0.5)*80, my+60, splits-2);
    }
    ctx.restore();
  }

  // ── Fog Layer ─────────────────────────────────────────────────────────────
  function drawFog(ctx, t, w, h) {
    if (currentSeason !== 'winter' && currentSeason !== 'rain') return;
    const intensity = currentSeason === 'winter'
      ? 0.04 + Math.sin(t * 0.001) * 0.02
      : 0.06 + Math.sin(t * 0.002) * 0.03;
    const grad = ctx.createLinearGradient(0, h*0.4, 0, h);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, currentSeason === 'winter'
      ? `rgba(160,190,240,${intensity})`
      : `rgba(60,70,120,${intensity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, h*0.4, w, h*0.6);
  }

  // ── Ground ────────────────────────────────────────────────────────────────
  function drawGround(ctx, w, h) {
    const baseY = h * 0.82;
    const grad = ctx.createLinearGradient(0, baseY, 0, h);

    if (currentSeason === 'winter') {
      grad.addColorStop(0, '#c8d8f0');
      grad.addColorStop(0.1, '#b0c4e8');
      grad.addColorStop(1, '#8090b8');
    } else if (currentSeason === 'summer') {
      grad.addColorStop(0, '#3a4820');
      grad.addColorStop(0.1, '#303c18');
      grad.addColorStop(1, '#1e2810');
    } else if (currentSeason === 'rain') {
      grad.addColorStop(0, '#1a2230');
      grad.addColorStop(0.1, '#141c26');
      grad.addColorStop(1, '#0c1018');
    } else {
      grad.addColorStop(0, '#3a2810');
      grad.addColorStop(0.1, '#2e2008');
      grad.addColorStop(1, '#1e1408');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, baseY, w, h - baseY);

    // Ground line glow
    ctx.strokeStyle = currentSeason === 'winter'
      ? 'rgba(200,220,255,0.3)'
      : 'rgba(200,169,110,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(w, baseY);
    ctx.stroke();

    // Snow on ground
    if (currentSeason === 'winter') {
      ctx.fillStyle = 'rgba(220,235,255,0.6)';
      ctx.fillRect(0, baseY, w, 6);
    }
    // Rain puddles
    if (currentSeason === 'rain') {
      ctx.fillStyle = 'rgba(80,100,160,0.15)';
      for (let i = 0; i < 8; i++) {
        const px = (i/8)*w + w*0.06;
        ctx.beginPath();
        ctx.ellipse(px, baseY+2, 20+Math.random()*40, 3+Math.random()*3, 0, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }

  // ── Sky Gradient ──────────────────────────────────────────────────────────
  function drawSky(ctx, w, h) {
    const cfg = SEASON_CONFIG[currentSeason];
    const grad = ctx.createLinearGradient(0, 0, 0, h * 0.85);
    grad.addColorStop(0, cfg.bgTop);
    grad.addColorStop(1, cfg.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Stars (winter/autumn)
    if (currentSeason === 'winter' || currentSeason === 'autumn') {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 0; i < 60; i++) {
        const sx = ((i * 137.5) % 1) * w;
        const sy = ((i * 73.1 + 13.7) % 0.4) * h;
        const brightness = 0.2 + (Math.sin(frameCount*0.02 + i) * 0.5 + 0.5) * 0.5;
        ctx.globalAlpha = brightness;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.5 + (i%3)*0.3, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Moon (winter)
    if (currentSeason === 'winter') {
      ctx.save();
      const moonX = w * 0.75, moonY = h * 0.12;
      const moonGrad = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 28);
      moonGrad.addColorStop(0, 'rgba(220,235,255,0.9)');
      moonGrad.addColorStop(0.5, 'rgba(180,205,240,0.5)');
      moonGrad.addColorStop(1, 'rgba(120,160,220,0)');
      ctx.fillStyle = moonGrad;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 28, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // Sun (summer)
    if (currentSeason === 'summer') {
      ctx.save();
      const sx = w * 0.7, sy = h * 0.08;
      const sunGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 60);
      sunGrad.addColorStop(0, 'rgba(255,240,180,0.9)');
      sunGrad.addColorStop(0.3, 'rgba(255,180,60,0.4)');
      sunGrad.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, 60, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Ambient Overlay ────────────────────────────────────────────────────────
  function drawAmbient(ctx, t, w, h) {
    const cfg = SEASON_CONFIG[currentSeason];
    if (cfg.ambientLight) {
      ctx.fillStyle = cfg.ambientLight;
      ctx.fillRect(0, 0, w, h);
    }
    // Rain screen darkening (power flicker)
    if (currentSeason === 'rain') {
      const flicker = Math.sin(t * 0.007) > 0.98 ? 0.08 : 0;
      if (flicker > 0) {
        ctx.fillStyle = `rgba(0,0,10,${flicker})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  // ── Main Render Loop ──────────────────────────────────────────────────────
  function renderEnv() {
    if (!envCanvas || !envCtx) return;
    W = envCanvas.width = envCanvas.offsetWidth;
    H = envCanvas.height = envCanvas.offsetHeight;
    if (W === 0 || H === 0) return;

    const t = frameCount;
    envCtx.clearRect(0, 0, W, H);

    drawSky(envCtx, W, H);
    drawClouds(envCtx, t, W);
    drawTrees(envCtx, t, W, H);
    drawGround(envCtx, W, H);
    drawFog(envCtx, t, W, H);
    updateParticles(W, H);
    drawParticles(envCtx);
    applyHeatHaze(envCtx, W, H, t);
    drawAmbient(envCtx, t, W, H);

    // Lightning
    if (currentSeason === 'rain') {
      const now = Date.now();
      if (now - lastLightning > 4000 + Math.random() * 8000 && !lightningScheduled) {
        lightningScheduled = true;
        setTimeout(() => {
          triggerLightning();
          lastLightning = Date.now();
          lightningScheduled = false;
        }, Math.random() * 2000);
      }
    }

    frameCount++;
    animId = requestAnimationFrame(renderEnv);
  }

  function drawTrees(ctx, t, w, h) {
    const time = t * 0.016; // seconds approx
    trees.forEach(tree => drawTree(ctx, tree, time, h, w));
  }

  // ── Menu Background ────────────────────────────────────────────────────────
  function renderMenuBg() {
    if (!menuCanvas || !menuCtx) return;
    const w = menuCanvas.width = menuCanvas.offsetWidth;
    const h = menuCanvas.height = menuCanvas.offsetHeight;

    menuCtx.clearRect(0, 0, w, h);

    // Dark gradient background
    const bg = menuCtx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#04050e');
    bg.addColorStop(0.5, '#080810');
    bg.addColorStop(1, '#050408');
    menuCtx.fillStyle = bg;
    menuCtx.fillRect(0, 0, w, h);

    const time = Date.now() * 0.001;

    // Nebula-like glow orbs
    const orbs = [
      { x: 0.2, y: 0.3, r: 0.4, color: '80,60,160' },
      { x: 0.8, y: 0.7, r: 0.35, color: '160,100,40' },
      { x: 0.5, y: 0.5, r: 0.25, color: '60,80,160' },
    ];
    orbs.forEach((orb, i) => {
      const ox = orb.x + Math.sin(time*0.3+i) * 0.05;
      const oy = orb.y + Math.cos(time*0.2+i*1.3) * 0.04;
      const grad = menuCtx.createRadialGradient(ox*w, oy*h, 0, ox*w, oy*h, orb.r*Math.max(w,h));
      grad.addColorStop(0, `rgba(${orb.color},0.06)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      menuCtx.fillStyle = grad;
      menuCtx.fillRect(0, 0, w, h);
    });

    // Floating chess pieces (decorative)
    const chessPieces = ['♙','♗','♘','♖','♕','♛','♞','♝','♜','♟'];
    menuCtx.font = '28px serif';
    for (let i = 0; i < 12; i++) {
      const px = ((i * 0.08 + time * 0.03 + i * 0.009) % 1.1 - 0.05) * w;
      const py = ((i * 0.137 + Math.sin(time * 0.15 + i * 0.8) * 0.06 + 0.1) % 0.9) * h;
      const alpha = 0.04 + Math.sin(time * 0.4 + i) * 0.02;
      menuCtx.globalAlpha = alpha;
      menuCtx.fillStyle = i % 2 === 0 ? '#c8a96e' : '#8080a0';
      menuCtx.fillText(chessPieces[i % chessPieces.length], px, py);
    }
    menuCtx.globalAlpha = 1;

    // Grid lines
    menuCtx.strokeStyle = 'rgba(200,169,110,0.025)';
    menuCtx.lineWidth = 1;
    const gridSize = 80;
    for (let x = 0; x < w; x += gridSize) {
      menuCtx.beginPath();
      menuCtx.moveTo(x, 0);
      menuCtx.lineTo(x, h);
      menuCtx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      menuCtx.beginPath();
      menuCtx.moveTo(0, y);
      menuCtx.lineTo(w, y);
      menuCtx.stroke();
    }

    menuAnimId = requestAnimationFrame(renderMenuBg);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function initMenu() {
    menuCanvas = document.getElementById('menu-canvas');
    if (!menuCanvas) return;
    menuCtx = menuCanvas.getContext('2d');
    if (menuAnimId) cancelAnimationFrame(menuAnimId);
    renderMenuBg();
  }

  function initEnv(season = 'winter') {
    currentSeason = season;
    envCanvas = document.getElementById('env-canvas');
    if (!envCanvas) return;
    envCtx = envCanvas.getContext('2d');
    if (animId) cancelAnimationFrame(animId);
    frameCount = 0;

    W = envCanvas.offsetWidth;
    H = envCanvas.offsetHeight;
    generateTrees(W, H);
    generateClouds(W);
    initParticles(W, H);

    renderEnv();
  }

  function setSeason(season) {
    currentSeason = season;
    document.body.className = season;
    if (envCanvas) {
      W = envCanvas.offsetWidth;
      H = envCanvas.offsetHeight;
      generateTrees(W, H);
      generateClouds(W);
      initParticles(W, H);
    }
    // Update HUD buttons
    document.querySelectorAll('.shud-btn, .sdot').forEach(b => {
      b.classList.toggle('active', b.dataset.season === season);
    });
  }

  function stopEnv() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }
  function stopMenu() {
    if (menuAnimId) { cancelAnimationFrame(menuAnimId); menuAnimId = null; }
  }

  return { initMenu, initEnv, setSeason, stopEnv, stopMenu, getSeason: () => currentSeason };

})();

window.Effects = Effects;
