export class Engine {
    constructor() {
        this.stockfish = new Worker('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
        this.stockfish.onmessage = (e) => this.handleMessage(e.data);
        this.sendMessage('uci');
    }

    sendMessage(msg) { this.stockfish.postMessage(msg); }

    handleMessage(msg) {
        if (msg.includes('score')) {
            const cp = msg.match(/score cp (-?\d+)/);
            const mate = msg.match(/score mate (-?\d+)/);
            if (this.onEvalUpdate) this.onEvalUpdate(cp ? {type:'cp', value:parseInt(cp[1])} : {type:'mate', value:parseInt(mate[1])});
        }
        if (msg.startsWith('bestmove')) {
            if (this.onBestMove) this.onBestMove(msg.split(' ')[1]);
        }
    }

    evaluatePosition(fen) {
        this.sendMessage(`position fen ${fen}`);
        this.sendMessage('go depth 12');
    }

    classifyMove(prev, curr, isWhite) {
        const diff = isWhite ? (curr - prev) : (prev - curr);
        if (diff < -2.0) return 'Blunder';
        if (diff < -1.0) return 'Mistake';
        if (diff < -0.5) return 'Inaccuracy';
        if (diff > 0.8) return 'Brilliant';
        return 'Book';
    }
}