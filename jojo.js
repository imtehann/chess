_drawTree(ctx, tr, H, th, swayX) {
  const { x, y, sz, variant, leafColors, layer } = tr;
  const alpha = layer === 2 ? 0.65 : layer === 1 ? 0.82 : 1.0;
  ctx.save();
  ctx.globalAlpha = alpha;

  const trunkW = sz * 0.1;
  const trunkH = sz * 0.65;
  const tx = x + swayX * 0.3;

  // 1. Detailed Trunk
  const tg = ctx.createLinearGradient(tx - trunkW, 0, tx + trunkW, 0);
  tg.addColorStop(0, th.trunk);
  tg.addColorStop(0.5, th.trunkHi);
  tg.addColorStop(1, th.trunk);
  ctx.fillStyle = tg;
  
  ctx.beginPath();
  ctx.moveTo(tx - trunkW, y);
  ctx.bezierCurveTo(tx - trunkW, y - trunkH * 0.4, tx - trunkW * 0.7 + swayX * 0.5, y - trunkH * 0.7, tx + swayX, y - trunkH);
  ctx.bezierCurveTo(tx + trunkW * 0.7 + swayX * 0.5, y - trunkH * 0.7, tx + trunkW, y - trunkH * 0.4, tx + trunkW, y);
  ctx.closePath();
  ctx.fill();

  // 2. Canopy Improvements (Adding Depth with darker under-leaves)
  const cx2 = tx + swayX;
  const cy = y - trunkH;
  
  // Backing shadow canopy
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx2, cy + 5, sz * 0.45, sz * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw clusters
  leafColors.forEach((color, index) => {
    ctx.fillStyle = color;
    const offsetX = (index - 1) * (sz * 0.15);
    const offsetY = Math.sin(index) * (sz * 0.1);
    
    ctx.beginPath();
    ctx.arc(cx2 + offsetX, cy + offsetY, sz * 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Add specular highlights on top of the leaves
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(cx2 + offsetX - 5, cy + offsetY - 5, sz * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });

  // 3. Perfecting the Seasons (Environmental Effects on Trees)
  if (th.name === 'spring') {
    // Add glowing pink cherry blossoms falling or scattered
    ctx.fillStyle = '#ffb7c5';
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(cx2 + (Math.random() - 0.5) * sz, cy + sz * 0.3 + (Math.random() * 20), 4, 2, Math.random(), 0, Math.PI * 2);
        ctx.fill();
    }
  } else if (th.name === 'winter') {
    // Add snow caps on top of the tree clusters
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx2, cy - sz * 0.2, sz * 0.15, Math.PI, 0);
    ctx.fill();
  }

  ctx.restore();
}