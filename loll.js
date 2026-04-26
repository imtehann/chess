function drawAtmosphericSky(ctx, W, H, th) {
  // Main Sky Gradient
  const skyGrd = ctx.createRadialGradient(W * 0.5, H * 0.3, 10, W * 0.5, H * 0.3, W * 0.8);
  skyGrd.addColorStop(0, th.horizon || '#1a1025'); // Deep sky ambient
  skyGrd.addColorStop(0.6, '#09050f'); 
  skyGrd.addColorStop(1, '#020105'); // Absolute deep space at corners
  ctx.fillStyle = skyGrd;
  ctx.fillRect(0, 0, W, H);

  // Distant Space Nebulae / Atmospheric Dust
  const nebulaGrd = ctx.createRadialGradient(W * 0.2, H * 0.2, 50, W * 0.2, H * 0.2, 300);
  nebulaGrd.addColorStop(0, 'rgba(100, 50, 150, 0.08)');
  nebulaGrd.addColorStop(1, 'transparent');
  ctx.fillStyle = nebulaGrd;
  ctx.fillRect(0, 0, W, H);
}