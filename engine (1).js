let worker;

export function initEngine() {
  worker = new Worker("assets/stockfish.js");

  worker.onmessage = (e) => {
    const msg = e.data;

    if (msg.includes("score cp")) {
      updateEval(parseInt(msg.split(" ")[9]));
    }
  };
}

export function sendPosition(fen) {
  worker.postMessage("position fen " + fen);
  worker.postMessage("go depth 12");
}

function updateEval(score) {
  const fill = document.getElementById("evalFill");
  let percent = 50 + score / 20;
  percent = Math.max(0, Math.min(100, percent));
  fill.style.height = percent + "%";
}
