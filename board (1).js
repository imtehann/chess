let boardEl = document.getElementById("board");

let gameState = {
  turn: "w",
  board: [],
  history: [],
};

export function initBoard(vsAI) {
  createBoard();
  setupPieces();
}

function createBoard() {
  boardEl.innerHTML = "";

  for (let i = 0; i < 64; i++) {
    const sq = document.createElement("div");
    sq.className = "square " + ((i + Math.floor(i / 8)) % 2 ? "dark" : "light");
    boardEl.appendChild(sq);
  }
}

function setupPieces() {
  // basic setup (extend later)
}

export function resetGame() {
  gameState.history = [];
}
