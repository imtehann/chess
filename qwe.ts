export const useStockfish = (depth = 12) => {
  const evaluatePosition = (fen: string) => {
    // 1. Send FEN to Stockfish Worker
    // 2. Get Centipawn score
    // 3. Classify Move:
    //    If score drops > 200: "Blunder"
    //    If score stays same + sacrifice detected: "Brilliant"
    return { score: 0, classification: 'Good' };
  };

  const parsePGN = (pgnString: string) => {
    const game = new Chess();
    game.loadPgn(pgnString);
    return game.history({ verbose: true });
  };

  return { evaluatePosition, parsePGN };
};