export class Effects {
    constructor() {
        this.canvas = document.getElementById('env-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.theme = 'winter';
        this.resize();
        window.onresize = () => this.resize();
        this.render();
    }

    resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }

    setTheme(t) { 
        this.theme = t; 
        document.body.className = `theme-${t}`;
        this.particles = Array.from({length: 100}, () => ({ x: Math.random()*this.canvas.width, y: Math.random()*this.canvas.height, s: Math.random()*3+1 }));
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.theme === 'winter' ? 'white' : 'rgba(100,100,255,0.3)';
        
        this.particles.forEach(p => {
            p.y += (this.theme === 'rainy' ? 10 : 1);
            if (p.y > this.canvas.height) p.y = -10;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.s, 0, 7);
            this.ctx.fill();
        });
        requestAnimationFrame(() => this.render());
    }

    playMoveSound(isCapture) {
        const audio = new Audio(isCapture ? 'https://assets.mixkit.co/sfx/preview/mixkit-wood-hit-2158.mp3' : 'https://assets.mixkit.co/sfx/preview/mixkit-chess-piece-slide-2095.mp3');
        audio.play().catch(() => {});
    }

    switchAmbient(t) { console.log(`Ambient switched to ${t}`); }
}