/* Goldutya Telegram Web App Integration */
"use strict";

const TG = (() => {
  const w = window;
  const tg = w.Telegram?.WebApp;

  function init() {
    if (!tg) return false;
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#0B0B0D");
    tg.setBackgroundColor("#0B0B0D");
    if (tg.MainButton) {
      tg.MainButton.hide();
    }
    if (tg.BackButton) {
      tg.BackButton.hide();
    }
    const u = user();
    if (u) localStorage.setItem("goldutya-player-name", u.username || u.firstName);
    return true;
  }

  function haptic(style) {
    if (tg?.HapticFeedback) {
      switch (style) {
        case "light": tg.HapticFeedback.impactOccurred("light"); break;
        case "medium": tg.HapticFeedback.impactOccurred("medium"); break;
        case "heavy": tg.HapticFeedback.impactOccurred("heavy"); break;
        case "success": tg.HapticFeedback.notificationOccurred("success"); break;
        case "error": tg.HapticFeedback.notificationOccurred("error"); break;
        case "warning": tg.HapticFeedback.notificationOccurred("warning"); break;
      }
    }
  }

  function user() {
    if (!tg?.initDataUnsafe?.user) return null;
    const u = tg.initDataUnsafe.user;
    return {
      id: u.id,
      firstName: u.first_name,
      lastName: u.last_name || "",
      username: u.username || "",
      photoUrl: u.photo_url || "",
      isPremium: u.is_premium || false,
    };
  }

  function isTelegram() {
    return !!tg;
  }

  function platform() {
    return tg?.platform || null;
  }

  function showMainButton(text, color) {
    if (!tg?.MainButton) return;
    tg.MainButton.setText(text);
    if (color) tg.MainButton.setParams({ color });
    tg.MainButton.show();
  }

  function hideMainButton() {
    if (tg?.MainButton) tg.MainButton.hide();
  }

  function onMainButton(callback) {
    if (tg?.MainButton) tg.MainButton.onClick(callback);
  }

  function showBackButton() {
    if (tg?.BackButton) tg.BackButton.show();
  }

  function hideBackButton() {
    if (tg?.BackButton) tg.BackButton.hide();
  }

  function onBackButton(callback) {
    if (tg?.BackButton) tg.BackButton.onClick(callback);
  }

  function share(text, url) {
    if (tg?.switchInlineQuery) {
      tg.switchInlineQuery(text, ["users", "groups", "channels"]);
    } else if (navigator.share) {
      navigator.share({ title: "Goldutya", text, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + (url ? "\n" + url : "")).catch(() => {});
    }
  }

  function openLink(url) {
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, "_blank");
  }

  function openTelegramLink(url) {
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, "_blank");
  }

  return {
    init, haptic, user, isTelegram, platform,
    showMainButton, hideMainButton, onMainButton,
    showBackButton, hideBackButton, onBackButton,
    share, openLink, openTelegramLink,
    raw: tg,
  };
})();

TG.init();
