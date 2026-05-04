import { initBoard, resetGame } from "./board.js";
import { initUI } from "./ui.js";
import { initEffects, setTheme } from "./effects.js";
import { initEngine } from "./engine.js";

const menu = document.getElementById("menu");
const gameUI = document.getElementById("gameUI");

document.getElementById("pvpBtn").onclick = startPvP;
document.getElementById("aiBtn").onclick = startAI;

function startPvP() {
  startGame(false);
}

function startAI() {
  startGame(true);
}

function startGame(vsAI) {
  menu.classList.add("hidden");
  gameUI.classList.remove("hidden");

  initBoard(vsAI);
  initUI();
  initEffects();
  initEngine();

  const theme = document.getElementById("themeSelect").value;
  setTheme(theme);
}
