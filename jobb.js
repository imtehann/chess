_draw(ctx, piece, S) {
  const w = piece.col === 'w';
  // Enriched color palettes
  const L0 = w ? '#ffffff' : '#5a341a', // Brighter white, warmer dark piece rim
        L1 = w ? '#f4eada' : '#331b0c', 
        L2 = w ? '#ded0b6' : '#1a0d04';
  const G = '#d4af37', G2 = '#fff1c5', SH = 'rgba(255,255,255,0.75)';
  
  ctx.save();
  // Physical drop shadow for the 3D game pieces
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = S * 0.08;
  ctx.shadowOffsetY = S * 0.05;
  ctx.shadowOffsetX = S * 0.02;

  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath();
  ctx.ellipse(S*.5, S*.88, S*.28, S*.07, 0, 0, Math.PI*2);
  ctx.fill();

  ({K:this._king,Q:this._queen,R:this._rook,B:this._bishop,N:this._knight,P:this._pawn}[piece.typ]||this._pawn).call(this,ctx,S,L0,L1,L2,G,G2,SH);
  ctx.restore();
}