import { Board } from './chess_app_board.js';
import { UI } from './chess_app_ui.js';
import { Engine } from './chess_app_engine.js';
import { Effects } from './chess_app_effects.js';

document.addEventListener('DOMContentLoaded', () => {
    const game = new Chess();
    const ui = new UI();
    const effects = new Effects();
    const engine = new Engine();

    let moveClassifications = [];
    let evalHistory = [0];

    // Load Persistence[cite: 11]
    const saved = localStorage.getItem('gm_cinematic_save');
    if (saved) game.load(saved);

    const board = new Board('board', {
        game: game,
        onMove: (move) => handleMove(move)
    });

    async function handleMove(move) {
        effects.playMoveSound(move.captured);
        localStorage.setItem('gm_cinematic_save', game.fen());
        ui.updateTurn(game.turn());

        // Trigger Stockfish analysis
        engine.evaluatePosition(game.fen());
        
        engine.onEvalUpdate = (score) => {
            const currentEval = score.type === 'cp' ? score.value / 100 : (score.value > 0 ? 10 : -10);
            const prevEval = evalHistory[evalHistory.length - 1];
            
            const classification = engine.classifyMove(prevEval, currentEval, move.color === 'w');
            moveClassifications.push(classification);
            evalHistory.push(currentEval);

            ui.updateEval(score);
            ui.renderAnalysisList(game.history(), moveClassifications);
            
            // Trigger AI if it's Black's turn
            if (game.turn() === 'b' && !game.game_over()) {
                ui.setThinking(true);
            }
        };
    }

    engine.onBestMove = (bestMove) => {
        if (game.turn() === 'b') {
            ui.setThinking(false);
            game.move({ from: bestMove.slice(0, 2), to: bestMove.slice(2, 4), promotion: 'q' });
            board.render();
            handleMove(game.history({verbose: true}).pop());
        }
    };

    // Menu Controls
    document.getElementById('pve-btn').addEventListener('click', () => {
        document.getElementById('menu-overlay').style.display = 'none';
        effects.switchAmbient('winter');
    });

    document.querySelectorAll('[data-theme]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            effects.setTheme(e.target.dataset.theme);
            effects.switchAmbient(e.target.dataset.theme);
        });
    });

    board.render();
});