/* Goldutya Leaderboard System */
"use strict";

const Leaderboard = (() => {
  const STORAGE_KEY = "goldutya-leaderboard";

  function getAll() {
    if (!localStorage.getItem("goldutya-lb-wiped")) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem("goldutya-lb-wiped", "1");
    }
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch { return {}; }
  }

  function getGame(gameId) {
    const all = getAll();
    return all[gameId] || [];
  }

  function resolveName() {
    const user = TG.user();
    const stored = localStorage.getItem("goldutya-player-name");
    if (user) return user.username || user.firstName || "Anonymous";
    if (stored) return stored;
    return "Anonymous";
  }

  function addScore(gameId, score, meta) {
    const all = getAll();
    if (!all[gameId]) all[gameId] = [];

    const user = TG.user();
    const entry = {
      score,
      name: resolveName(),
      userId: user ? user.id : 0,
      avatar: user ? user.photoUrl : "",
      date: Date.now(),
      ...meta,
    };

    all[gameId].push(entry);
    all[gameId].sort((a, b) => b.score - a.score);
    all[gameId] = all[gameId].slice(0, 100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return all[gameId];
  }

  function getTop(gameId, n) {
    return getGame(gameId).slice(0, n || 10);
  }

  function getMyRank(gameId) {
    const user = TG.user();
    if (!user) return -1;
    const list = getGame(gameId);
    return list.findIndex(e => e.userId === user.id);
  }

  function getMyBest(gameId) {
    const user = TG.user();
    if (!user) return 0;
    const list = getGame(gameId);
    const my = list.find(e => e.userId === user.id);
    return my ? my.score : 0;
  }

  function clearGame(gameId) {
    const all = getAll();
    delete all[gameId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  function promptName() {
    if (TG.user()) return;
    if (localStorage.getItem("goldutya-player-name")) return;
    const name = prompt("Enter your name for the leaderboard:");
    if (name && name.trim()) {
      localStorage.setItem("goldutya-player-name", name.trim().slice(0, 20));
    }
  }

  function renderBoard(container, gameId, myScore) {
    const top = getTop(gameId, 10);
    let html = '<div class="lb-header">LEADERBOARD</div>';

    if (top.length === 0) {
      html += '<div class="lb-empty">No scores yet. Be the first!</div>';
    } else {
      html += '<div class="lb-list">';
      top.forEach((e, i) => {
        const user = TG.user();
        const isMe = user && e.userId === user.id;
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
        html += '<div class="lb-row' + (isMe ? ' lb-me' : '') + '">';
        html += '<span class="lb-rank">' + medal + '</span>';
        html += '<span class="lb-name">' + (e.name || "Anonymous") + '</span>';
        html += '<span class="lb-score">' + e.score + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (myScore > 0) {
      html += '<div class="lb-your-score">YOUR SCORE: ' + myScore + '</div>';
    }

    container.innerHTML = html;
  }

  return { getGame, addScore, getTop, getMyRank, getMyBest, clearGame, promptName, renderBoard };
})();
