/* Goldutya Universal Difficulty System */
"use strict";

const Difficulty = (() => {
  const DEFAULT_DIFF = "medium";
  const VALID = ["easy", "medium", "hard"];

  function getKey(gameId) {
    return `goldutya-${gameId}-diff`;
  }

  function getDiff(gameId) {
    const val = localStorage.getItem(getKey(gameId));
    return VALID.includes(val) ? val : DEFAULT_DIFF;
  }

  function setDiff(gameId, diff) {
    if (!VALID.includes(diff)) return;
    try {
      localStorage.setItem(getKey(gameId), diff);
    } catch (e) {}
  }

  function renderPicker(container, gameId, onChange) {
    if (!container) return;
    const current = getDiff(gameId);
    container.innerHTML = `
      <div class="difficulty-picker">
        <span class="diff-label">MODE</span>
        <div class="difficulty-btns">
          <button class="difficulty-btn ${current === 'easy' ? 'active' : ''}" data-diff="easy">EASY</button>
          <button class="difficulty-btn ${current === 'medium' ? 'active' : ''}" data-diff="medium">MED</button>
          <button class="difficulty-btn ${current === 'hard' ? 'active' : ''}" data-diff="hard">HARD</button>
        </div>
      </div>
    `;

    container.querySelectorAll(".difficulty-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const diff = btn.dataset.diff;
        setDiff(gameId, diff);
        container.querySelectorAll(".difficulty-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        if (typeof TG !== "undefined") TG.haptic("light");
        if (typeof onChange === "function") onChange(diff);
      });
    });
  }

  return { getDiff, setDiff, renderPicker };
})();
