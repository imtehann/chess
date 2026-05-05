export class Board {
    constructor(elementId, config) {
        this.boardEl = document.getElementById(elementId);
        this.game = config.game;
        this.onMove = config.onMove;
        this.lastMove = null;
    }

    render() {
        this.boardEl.innerHTML = '';
        const state = this.game.board();

        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const sqName = this.getSq(i, j);
                const square = document.createElement('div');
                square.className = `square ${(i + j) % 2 === 0 ? 'light' : 'dark'}`;
                
                if (this.lastMove && (sqName === this.lastMove.from || sqName === this.lastMove.to)) {
                    square.classList.add('highlight-last-move');
                }

                const piece = state[i][j];
                if (piece) {
                    const pEl = document.createElement('div');
                    pEl.className = `piece ${piece.color}${piece.type}`;
                    pEl.style.backgroundImage = `url('https://upload.wikimedia.org/wikipedia/commons/${this.getIcon(piece.color, piece.type)}')`;
                    pEl.draggable = true;
                    pEl.addEventListener('dragstart', (e) => { this.draggedSq = sqName; });
                    square.appendChild(pEl);
                }

                square.addEventListener('dragover', (e) => e.preventDefault());
                square.addEventListener('drop', () => this.execute(this.draggedSq, sqName));
                this.boardEl.appendChild(square);
            }
        }
    }

    getSq(i, j) { return 'abcdefgh'[j] + '87654321'[i]; }
    
    getIcon(c, t) {
        const map = { wk:'4/42/Chess_klt45.svg', wq:'4/47/Chess_qlt45.svg', wr:'7/72/Chess_rlt45.svg', wb:'b/b1/Chess_blt45.svg', wn:'7/70/Chess_nlt45.svg', wp:'4/45/Chess_plt45.svg', bk:'f/f0/Chess_kdt45.svg', bq:'4/4a/Chess_qdt45.svg', br:'f/ff/Chess_rdt45.svg', bb:'9/98/Chess_bdt45.svg', bn:'e/ef/Chess_ndt45.svg', bp:'c/c7/Chess_pdt45.svg' };
        return map[c+t];
    }

    execute(from, to) {
        const move = this.game.move({ from, to, promotion: 'q' });
        if (move) {
            this.lastMove = move;
            this.render();
            this.onMove(move);
        }
    }
}