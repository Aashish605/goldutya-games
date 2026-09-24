const GAMES = [
  { id: "fly", name: "Goldutya Fly", file: "fly.html", cat: "arcade", catLabel: "Arcade", image: "assets/card-fly.png", bestKey: "goldutya-fly-best", badge: "HOT" },
  { id: "jump", name: "Goldutya Jump", file: "jump.html", cat: "runner", catLabel: "Runner", image: "assets/card-jump.png", bestKey: "goldutya-jump-best", badge: "POPULAR" },
  { id: "clicker", name: "Goldutya Clicker", file: "clicker.html", cat: "tap-to-earn", catLabel: "Tap-to-Earn", image: "assets/card-clicker.png", bestKey: "goldutya-clicker-best", badge: "NEW" },
  { id: "memory", name: "Goldutya Memory", file: "memory.html", cat: "puzzle", catLabel: "Puzzle", image: "assets/card-memory.png", bestKey: "goldutya-memory-best", badge: "POPULAR" },
  { id: "snake", name: "Goldutya Snake", file: "snake.html", cat: "classic", catLabel: "Classic", image: "assets/card-snake.png", bestKey: "goldutya-snake-best", badge: "CLASSIC" },
  { id: "breakout", name: "Goldutya Breakout", file: "breakout.html", cat: "action", catLabel: "Action", image: "assets/card-breakout.png", bestKey: "goldutya-breakout-best", badge: "HOT" },
  { id: "lumberjack", name: "Goldutya LumberJack", file: "lumberjack.html", cat: "arcade", catLabel: "Arcade", image: "assets/lumberjack-body.jpg", bestKey: "goldutya-lumberjack-best", badge: "NEW" },
];

const grid = document.getElementById("gameGrid");
const filterBar = document.getElementById("filterBar");

function renderCards(filterCat = "all") {
  grid.innerHTML = "";
  for (const g of GAMES) {
    if (filterCat !== "all" && g.cat !== filterCat) continue;

    const best = Number(localStorage.getItem(g.bestKey) || 0);
    const diff = typeof Difficulty !== "undefined" ? Difficulty.getDiff(g.id).toUpperCase() : "MED";
    const card = document.createElement("a");
    card.className = "game-card";
    card.href = g.file;
    card.dataset.cat = g.cat;

    card.innerHTML =
      '<div class="card-thumb">' +
        '<img class="card-img" src="' + g.image + '" alt="' + g.name + '" loading="lazy" />' +
        '<div class="card-badge">' + g.badge + '</div>' +
        '<div class="card-overlay-btn">PLAY NOW</div>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-header">' +
          '<h3 class="card-name">' + g.name.toUpperCase() + '</h3>' +
          '<span class="card-cat cat-' + g.cat + '">' + g.catLabel + '</span>' +
        '</div>' +
        '<div class="card-footer">' +
          '<div class="card-best"><svg class="icon" viewBox="0 0 24 24"><use href="assets/icons.svg#trophy"/></svg> BEST <b>' + (best > 0 ? best : '--') + '</b> <span class="card-diff-chip">' + diff + '</span></div>' +
          '<span class="card-arrow"><svg class="icon" viewBox="0 0 24 24"><use href="assets/icons.svg#arrow-right"/></svg></span>' +
        '</div>' +
      '</div>';
    grid.appendChild(card);
  }
}

document.addEventListener("click", () => {
  if (typeof TG !== "undefined") TG.haptic("light");
});

if (filterBar) {
  filterBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    filterBar.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderCards(btn.dataset.cat);
  });
}

renderCards();