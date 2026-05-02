/**
 * effects.js — Seasonal environments + particle systems
 * Regicide Chess
 */

'use strict';

const EnvironmentRenderer = (() => {

  let canvas, ctx;
  let W, H;
  let season = 'winter';
  let time = 0;
  let particles = [];
  let trees = [];
  let clouds = [];
  let lightning = { active: false, x: 0, y: 0, timer: 0, nextFlash: 0 };
  let thunder = { timer: 0 };

  // ---- Init ----
  function init(canvasEl, initialSeason) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    season = initialSeason || 'winter';
    resize();
    buildEnvironment();
    window.addEventListener('resize', () => { resize(); buildEnvironment(); });
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function setSeason(s) {
    season = s;
    buildEnvironment();
  }

  // ---- Environment building ----
  function buildEnvironment() {
    particles = [];
    trees = buildTrees();
    clouds = buildClouds();
    lightning = { active: false, x: 0, y: 0, timer: 0, nextFlash: Math.random() * 8000 + 3000 };

    const count = season === 'rainy' ? 300
      : season === 'winter' ? 200
      : season === 'autumn' ? 80 : 0;

    for (let i = 0; i < count; i++) spawnParticle(true);
  }

  function buildTrees() {
    const result = [];
    const treeCount = 18;
    // Left side trees
    for (let i = 0; i < treeCount; i++) {
      const side = i < treeCount / 2 ? 'left' : 'right';
      const t = i < treeCount / 2 ? i : i - treeCount / 2;
      const xFrac = t / (treeCount / 2 - 1);
      const x = side === 'left'
        ? xFrac * W * 0.22 + W * 0.01
        : W - xFrac * W * 0.22 - W * 0.01;
      const h = 0.35 + Math.random() * 0.3; // fraction of H
      const type = Math.floor(Math.random() * 4); // 0=pine, 1=oak, 2=bare, 3=sparse
      const leafDensity = season === 'autumn' ? (0.3 + Math.random() * 0.7) : season === 'winter' ? 0.15 : 1;
      result.push({ x, h, type, phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.5, leafDensity, layer: i % 3 });
    }
    return result;
  }

  function buildClouds() {
    const result = [];
    for (let i = 0; i < 6; i++) {
      result.push({
        x: Math.random() * W * 1.5 - W * 0.25,
        y: H * (0.05 + Math.random() * 0.18),
        w: 120 + Math.random() * 200,
        h: 40 + Math.random() * 60,
        speed: 0.1 + Math.random() * 0.2,
        opacity: season === 'rainy' ? 0.6 + Math.random() * 0.3 : 0.2 + Math.random() * 0.25,
        dark: season === 'rainy',
      });
    }
    return result;
  }

  // ---- Particles ----
  function spawnParticle(random) {
    const y = random ? Math.random() * H : -10;
    if (season === 'winter') {
      particles.push({
        x: Math.random() * W, y,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.5 + Math.random() * 1.2,
        size: 1.5 + Math.random() * 3.5,
        opacity: 0.4 + Math.random() * 0.5,
        twinkle: Math.random() * Math.PI * 2,
        type: 'snow',
      });
    } else if (season === 'rainy') {
      particles.push({
        x: Math.random() * W, y,
        vx: -0.5 + Math.random() * 0.2,
        vy: 8 + Math.random() * 6,
        len: 10 + Math.random() * 15,
        opacity: 0.2 + Math.random() * 0.35,
        type: 'rain',
      });
    } else if (season === 'autumn') {
      particles.push({
        x: Math.random() * W, y,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 0.8 + Math.random() * 1.5,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.1,
        size: 6 + Math.random() * 10,
        opacity: 0.5 + Math.random() * 0.5,
        color: ['#d4641a','#e8a020','#c83c0a','#f0c848','#b84820'][Math.floor(Math.random() * 5)],
        swing: Math.random() * Math.PI * 2,
        swingSpeed: 0.02 + Math.random() * 0.03,
        type: 'leaf',
      });
    }
  }

  // ---- Main render ----
  function render(timestamp) {
    time = timestamp || 0;
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawFog();
    drawClouds();
    drawTrees('back');
    drawParticles();
    drawTrees('front');
    if (season === 'rainy') drawLightning();
    drawGroundFog();
    drawVignette();
  }

  // ---- Background ----
  function drawBackground() {
    const gradients = {
      winter: ['#0a0e1a','#1a2844','#2a4060'],
      summer: ['#0a0810','#3a1a08','#6a3010'],
      rainy:  ['#06080e','#101422','#181e2e'],
      autumn: ['#080608','#2a140a','#4a2010'],
    };
    const stops = gradients[season];
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(0.5, stops[1]);
    grad.addColorStop(1, stops[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Stars (winter/autumn)
    if (season === 'winter' || season === 'autumn') drawStars();

    // Sun glow (summer)
    if (season === 'summer') {
      const g = ctx.createRadialGradient(W * 0.7, H * 0.15, 0, W * 0.7, H * 0.15, H * 0.6);
      g.addColorStop(0, 'rgba(255,160,40,0.18)');
      g.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Moon (winter)
    if (season === 'winter') {
      const mx = W * 0.78, my = H * 0.12;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 50);
      mg.addColorStop(0, 'rgba(200,220,255,0.9)');
      mg.addColorStop(0.3, 'rgba(180,200,240,0.5)');
      mg.addColorStop(1, 'rgba(180,200,240,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, my, 50, 0, Math.PI * 2); ctx.fill();
      // Halo
      const hg = ctx.createRadialGradient(mx, my, 40, mx, my, 120);
      hg.addColorStop(0, 'rgba(140,160,220,0.12)');
      hg.addColorStop(1, 'rgba(140,160,220,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(mx, my, 120, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawStars() {
    ctx.save();
    for (let i = 0; i < 120; i++) {
      // Deterministic but varied
      const seed = i * 2654435761;
      const sx = ((seed & 0xFFFF) / 65535) * W;
      const sy = (((seed >> 16) & 0xFFFF) / 65535) * H * 0.6;
      const sz = 0.5 + ((seed & 0x7) / 7) * 1.5;
      const twinkle = Math.sin(time * 0.001 + i * 0.7) * 0.3 + 0.7;
      ctx.globalAlpha = twinkle * (season === 'winter' ? 0.7 : 0.35);
      ctx.fillStyle = season === 'winter' ? '#d0e0ff' : '#ffe0a0';
      ctx.beginPath();
      ctx.arc(sx, sy, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- Fog ----
  function drawFog() {
    if (season !== 'winter' && season !== 'rainy') return;
    const fogTime = time * 0.00015;
    const fogOpacity = season === 'winter'
      ? 0.05 + Math.sin(fogTime) * 0.04
      : 0.06 + Math.sin(fogTime * 1.3) * 0.05;

    for (let layer = 0; layer < 3; layer++) {
      const grad = ctx.createLinearGradient(0, H * (0.5 + layer * 0.1), 0, H * (0.65 + layer * 0.1));
      const col = season === 'winter' ? `rgba(160,180,220,${fogOpacity})` : `rgba(100,110,130,${fogOpacity})`;
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, H * (0.4 + layer * 0.08), W, H * 0.35);
    }
  }

  // ---- Clouds ----
  function drawClouds() {
    clouds.forEach(cloud => {
      cloud.x += cloud.speed * 0.4;
      if (cloud.x > W + cloud.w) cloud.x = -cloud.w - 50;

      ctx.save();
      ctx.globalAlpha = cloud.opacity;
      const baseCol = cloud.dark ? '#1a2030' : '#c0cce0';
      drawCloudShape(cloud.x, cloud.y, cloud.w, cloud.h, baseCol);
      ctx.restore();
    });
  }

  function drawCloudShape(x, y, w, h, color) {
    ctx.fillStyle = color;
    const bubbles = 5;
    for (let i = 0; i < bubbles; i++) {
      const bx = x + (i / (bubbles - 1)) * w;
      const by = y + Math.sin(i * 1.2) * h * 0.2;
      const br = h * (0.4 + Math.sin(i * 0.8) * 0.2);
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fill bottom
    ctx.fillRect(x, y, w, h * 0.5);
  }

  // ---- Trees ----
  function drawTrees(pass) {
    trees.forEach(tree => {
      const isBack = tree.layer === 0;
      if (pass === 'back' && !isBack) return;
      if (pass === 'front' && isBack) return;

      const sway = Math.sin(time * 0.001 * tree.speed + tree.phase) * (season === 'rainy' ? 4 : 2);
      const treeH = tree.h * H;
      const baseY = H * 0.88;
      const trunkW = treeH * 0.07;
      const trunkColor = season === 'winter' ? '#2a2030' : season === 'summer' ? '#3a2010' : season === 'autumn' ? '#3a1808' : '#1a1420';

      ctx.save();
      ctx.translate(tree.x, baseY);

      // Trunk
      ctx.fillStyle = trunkColor;
      ctx.beginPath();
      ctx.moveTo(-trunkW / 2, 0);
      ctx.quadraticCurveTo(sway * 0.3, -treeH * 0.5, sway, -treeH);
      ctx.quadraticCurveTo(0, -treeH * 0.5, trunkW / 2, 0);
      ctx.fill();

      // Crown based on type
      if (tree.type === 0) drawPineTree(sway, treeH, tree, tree.leafDensity);
      else if (tree.type === 1) drawOakTree(sway, treeH, tree, tree.leafDensity);
      else if (tree.type === 2) drawBareTree(sway, treeH, tree);
      else drawSparseTree(sway, treeH, tree, tree.leafDensity);

      ctx.restore();
    });
  }

  function drawPineTree(sway, treeH, tree, density) {
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const ly = -treeH * (0.35 + i * 0.2);
      const lw = treeH * (0.25 - i * 0.04);
      const lh = treeH * 0.2;
      const col = getLeafColor(tree, density, i);
      ctx.globalAlpha = density * 0.9;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(sway * 0.8, ly);
      ctx.lineTo(sway * 0.4 - lw, ly + lh);
      ctx.lineTo(sway * 0.4 + lw, ly + lh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawOakTree(sway, treeH, tree, density) {
    const cx = sway * 0.85, cy = -treeH * 0.75;
    const r = treeH * 0.28;
    if (density > 0.2) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const col = getLeafColor(tree, density, 0);
      g.addColorStop(0, col);
      g.addColorStop(1, col + '88');
      ctx.globalAlpha = density * 0.85;
      ctx.fillStyle = g;
      // Blob shape
      for (let a = 0; a < 7; a++) {
        const angle = (a / 7) * Math.PI * 2;
        const vr = r * (0.8 + Math.random() * 0.3);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * r * 0.4, cy + Math.sin(angle) * r * 0.3, vr * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBareTree(sway, treeH, tree) {
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 1.5;
    drawBranches(sway, 0, -treeH, 5, 4);
  }

  function drawBranches(sway, bx, by, depth, maxDepth) {
    if (depth <= 0) return;
    const branchCount = 2 + (depth % 2);
    for (let i = 0; i < branchCount; i++) {
      const angle = -Math.PI / 2 + ((i / (branchCount - 1)) - 0.5) * 1.4;
      const len = Math.abs(by) * 0.35;
      const ex = bx + Math.cos(angle) * len;
      const ey = by + Math.sin(angle) * len;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (depth > 1) drawBranches(sway, ex, ey, depth - 1, maxDepth);
    }
  }

  function drawSparseTree(sway, treeH, tree, density) {
    drawBareTree(sway, treeH, tree);
    if (density > 0.1) {
      for (let i = 0; i < 8; i++) {
        const lx = sway + (Math.random() - 0.5) * treeH * 0.4;
        const ly = -treeH * (0.4 + Math.random() * 0.5);
        ctx.fillStyle = getLeafColor(tree, density, i);
        ctx.globalAlpha = density * 0.7;
        ctx.beginPath();
        ctx.arc(lx, ly, treeH * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function getLeafColor(tree, density, i) {
    const colors = {
      winter: ['#1a2430', '#222c3a', '#1e2832'],
      summer: ['#1a3a10', '#2a4a18', '#142e0a'],
      rainy:  ['#162410', '#1e2e16', '#0e1c08'],
      autumn: ['#c84820', '#e07818', '#d4560e', '#f0a020', '#a83010'],
    };
    const arr = colors[season];
    return arr[i % arr.length];
  }

  // ---- Particles ----
  function drawParticles() {
    particles = particles.filter(p => p.y < H + 20);

    // Spawn new particles
    const rate = season === 'rainy' ? 8 : season === 'winter' ? 2 : 1;
    for (let i = 0; i < rate; i++) spawnParticle(false);

    particles.forEach(p => {
      if (p.type === 'snow') drawSnowflake(p);
      else if (p.type === 'rain') drawRaindrop(p);
      else if (p.type === 'leaf') drawLeaf(p);
      updateParticle(p);
    });
  }

  function updateParticle(p) {
    if (p.type === 'snow') {
      p.x += p.vx + Math.sin(time * 0.001 + p.twinkle) * 0.3;
      p.y += p.vy;
      p.twinkle += 0.02;
    } else if (p.type === 'rain') {
      p.x += p.vx;
      p.y += p.vy;
    } else if (p.type === 'leaf') {
      p.swing += p.swingSpeed;
      p.x += p.vx + Math.sin(p.swing) * 1.2;
      p.y += p.vy;
      p.rot += p.rotSpeed;
      p.vx += (Math.random() - 0.5) * 0.04;
      p.vx *= 0.98;
    }
  }

  function drawSnowflake(p) {
    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = '#d8e8ff';
    ctx.shadowColor = '#a0c0ff';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRaindrop(p) {
    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.strokeStyle = '#88aad0';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.vx * 1.5, p.y + p.len);
    ctx.stroke();
    ctx.restore();
  }

  function drawLeaf(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size * 0.4, p.size * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- Lightning ----
  function drawLightning() {
    if (season !== 'rainy') return;
    lightning.timer -= 16.67;
    lightning.nextFlash -= 16.67;

    if (lightning.nextFlash <= 0 && !lightning.active) {
      lightning.active = true;
      lightning.x = W * 0.2 + Math.random() * W * 0.6;
      lightning.y = 0;
      lightning.timer = 100 + Math.random() * 80;
      lightning.nextFlash = 4000 + Math.random() * 8000;
      // Screen flash
      ctx.fillStyle = 'rgba(200,220,255,0.08)';
      ctx.fillRect(0, 0, W, H);
    }

    if (lightning.active) {
      ctx.save();
      ctx.globalAlpha = (lightning.timer / 180) * 0.9;
      ctx.strokeStyle = '#c8e0ff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#8ab0ff';
      ctx.shadowBlur = 20;
      drawLightningBolt(lightning.x, 0, lightning.x + (Math.random() - 0.5) * 80, H * 0.55);
      ctx.restore();
      if (lightning.timer <= 0) lightning.active = false;
    }
  }

  function drawLightningBolt(x1, y1, x2, y2) {
    if (Math.abs(y2 - y1) < 15) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      return;
    }
    const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * 40;
    const my = (y1 + y2) / 2;
    drawLightningBolt(x1, y1, mx, my);
    drawLightningBolt(mx, my, x2, y2);
  }

  // ---- Ground fog ----
  function drawGroundFog() {
    const cols = {
      winter: 'rgba(100,130,180,0.15)',
      summer: 'rgba(200,140,60,0.05)',
      rainy:  'rgba(70,80,100,0.2)',
      autumn: 'rgba(120,60,20,0.1)',
    };
    const grad = ctx.createLinearGradient(0, H * 0.78, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, cols[season]);
    grad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, H * 0.7, W, H * 0.3);
  }

  // ---- Vignette ----
  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ---- Heat haze (summer) ----
  function drawHeatHaze() {
    if (season !== 'summer') return;
    // Subtle: done via CSS filter on game screen
  }

  return { init, render, setSeason };
})();


/* ================================================================
   MENU ENVIRONMENT (separate canvas)
   ================================================================ */
const MenuEnvironment = (() => {
  let canvas, ctx, W, H, season = 'winter', time = 0;
  const ORBS = [];

  function init(canvasEl, s) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    season = s || 'winter';
    resize();
    buildOrbs();
    window.addEventListener('resize', resize);
  }

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  function setSeason(s) { season = s; buildOrbs(); }

  function buildOrbs() {
    ORBS.length = 0;
    const colors = {
      winter: ['#1a3060', '#0a1840', '#3050a0'],
      summer: ['#602010', '#401008', '#a04820'],
      rainy:  ['#101828', '#080e18', '#202838'],
      autumn: ['#602010', '#401008', '#904020'],
    };
    const cs = colors[season];
    for (let i = 0; i < 5; i++) {
      ORBS.push({
        x: Math.random() * 1.2 - 0.1, y: Math.random() * 1.2 - 0.1,
        r: 0.2 + Math.random() * 0.35,
        color: cs[i % cs.length],
        speed: 0.0002 + Math.random() * 0.0003,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  function render(timestamp) {
    time = timestamp || 0;
    ctx.clearRect(0, 0, W, H);

    // Background
    const bgColors = {
      winter: '#06090f', summer: '#0a0608', rainy: '#050608', autumn: '#080404',
    };
    ctx.fillStyle = bgColors[season];
    ctx.fillRect(0, 0, W, H);

    // Animated orbs
    ORBS.forEach(orb => {
      const x = (orb.x + Math.sin(time * orb.speed + orb.phase) * 0.12) * W;
      const y = (orb.y + Math.cos(time * orb.speed * 1.3 + orb.phase) * 0.09) * H;
      const r = orb.r * Math.min(W, H);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, orb.color + 'cc');
      g.addColorStop(0.5, orb.color + '44');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });

    // Fine noise overlay (fake grain)
    for (let i = 0; i < 300; i++) {
      const nx = Math.random() * W;
      const ny = Math.random() * H;
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.012})`;
      ctx.fillRect(nx, ny, 1, 1);
    }

    // Bottom gradient
    const bg = ctx.createLinearGradient(0, H * 0.6, 0, H);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  return { init, render, setSeason };
})();
