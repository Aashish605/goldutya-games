/* Goldutya Leaderboard System */
"use strict";

const Leaderboard = (() => {
  const STORAGE_KEY = "goldutya-leaderboard";

  function getAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch { return {}; }
  }

  function getGame(gameId) {
    const all = getAll();
    return all[gameId] || [];
  }

  function addScore(gameId, score, meta) {
    const all = getAll();
    if (!all[gameId]) all[gameId] = [];

    const user = TG.user();
    const entry = {
      score,
      name: user ? user.firstName : "Anonymous",
      userId: user ? user.id : 0,
      avatar: user ? user.photoUrl : "",
      date: Date.now(),
      ...meta,
    };

    all[gameId].push(entry);
    all[gameId].sort((a, b) => b.score - a.score);
    all[gameId] = all[gameId].slice(0, 100); // keep top 100
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

  function renderBoard(container, gameId, myScore) {
    const top = getTop(gameId, 10);
    const user = TG.user();
    let html = '<div class="lb-header">LEADERBOARD</div>';

    if (top.length === 0) {
      html += '<div class="lb-empty">No scores yet. Be the first!</div>';
    } else {
      html += '<div class="lb-list">';
      top.forEach((e, i) => {
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

  return { getGame, addScore, getTop, getMyRank, getMyBest, clearGame, renderBoard };
})();
