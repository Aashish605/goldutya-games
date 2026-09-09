const GAMES = [
  { name: "Fly", file: "fly.html", cat: "Arcade", icon: "assets/duck-mid.png", bestKey: "goldutya-fly-best" },
  { name: "Jump", file: "jump.html", cat: "Runner", icon: "assets/duck-mid.png", bestKey: "goldutya-jump-best" },
  { name: "Clicker", file: "clicker.html", cat: "Tap-to-Earn", icon: "assets/duck-mid.png", bestKey: "goldutya-clicker-best" },
  { name: "Memory", file: "memory.html", cat: "Puzzle", icon: "assets/duck-mid.png", bestKey: "goldutya-memory-best" },
  { name: "Snake", file: "snake.html", cat: "Classic", icon: "assets/duck-mid.png", bestKey: "goldutya-snake-best" },
  { name: "Breakout", file: "breakout.html", cat: "Action", icon: "assets/duck-mid.png", bestKey: "goldutya-breakout-best" },
];

const grid = document.getElementById("gameGrid");

for (const g of GAMES) {
  const best = Number(localStorage.getItem(g.bestKey) || 0);
  const card = document.createElement("a");
  card.className = "game-card";
  card.href = g.file;
  card.innerHTML =
    '<div class="card-icon"><img src="' + g.icon + '" alt="' + g.name + '" /></div>' +
    '<div class="card-body">' +
      '<div class="card-name">' + g.name.toUpperCase() + '</div>' +
      '<div class="card-cat">' + g.cat + '</div>' +
      '<div class="card-best">BEST<b>' + best + '</b></div>' +
      '<div class="card-play">PLAY</div>' +
    '</div>';
  grid.appendChild(card);
}