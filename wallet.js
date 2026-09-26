/* Goldutya TON Connect wallet (hub) */
"use strict";

const Wallet = (() => {
  const STORAGE_KEY = "goldutya-wallet";
  const CHANGE = [];
  let tc = null;
  let sawWallet = false;
  let address = "";

  try { address = localStorage.getItem(STORAGE_KEY) || ""; } catch (e) { address = ""; }

  function isConnected() { return !!address; }
  function getAddress() { return address; }
  function shortAddress() {
    return address ? address.slice(0, 4) + "\u2026" + address.slice(-4) : "";
  }
  function onChange(cb) { if (typeof cb === "function") CHANGE.push(cb); }
  function emit() { CHANGE.forEach((cb) => { try { cb(address); } catch (e) {} }); }

  function haptic(style) {
    if (typeof TG !== "undefined" && TG.haptic) TG.haptic(style);
  }

  function set(addr) {
    address = addr || "";
    try {
      if (address) localStorage.setItem(STORAGE_KEY, address);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    render();
    emit();
  }

  function render() {
    const btn = document.getElementById("walletBtn");
    const label = document.getElementById("walletBtnLabel");
    if (!btn) return;
    if (address) {
      btn.classList.add("connected");
      if (label) label.textContent = shortAddress();
      btn.setAttribute("aria-label", "Wallet connected: " + address);
    } else {
      btn.classList.remove("connected");
      if (label) label.textContent = "CONNECT WALLET";
      btn.setAttribute("aria-label", "Connect wallet");
    }
  }

  function hideMenu() {
    const m = document.getElementById("walletMenu");
    if (m) m.hidden = true;
  }

  function wire() {
    const btn = document.getElementById("walletBtn");
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = "1";
      btn.addEventListener("click", onButton);
    }
    const copy = document.getElementById("walletCopy");
    if (copy && !copy.dataset.wired) {
      copy.dataset.wired = "1";
      copy.addEventListener("click", onCopy);
    }
    const disc = document.getElementById("walletDisconnect");
    if (disc && !disc.dataset.wired) {
      disc.dataset.wired = "1";
      disc.addEventListener("click", onDisconnect);
    }
    document.addEventListener("click", (e) => {
      const wrap = document.getElementById("walletWrap");
      if (wrap && !wrap.contains(e.target)) hideMenu();
    });
  }

  function onButton() {
    if (!tc) {
      const label = document.getElementById("walletBtnLabel");
      if (label && !address) {
        label.textContent = "WALLET UNAVAILABLE";
        setTimeout(() => render(), 1500);
      }
      haptic("error");
      return;
    }
    if (address) {
      const m = document.getElementById("walletMenu");
      if (m) m.hidden = !m.hidden;
      haptic("light");
      return;
    }
    connect();
  }

  async function connect() {
    if (!tc) return;
    try {
      await tc.connectWallet();
    } catch (e) {
      console.warn("[wallet] connect failed:", e);
      const label = document.getElementById("walletBtnLabel");
      if (label) label.textContent = "TRY AGAIN";
      setTimeout(() => render(), 1600);
      haptic("error");
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); resolve(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  function onCopy(e) {
    e.stopPropagation();
    if (!address) return;
    const label = document.getElementById("walletBtnLabel");
    copyText(address).then(() => {
      hideMenu();
      haptic("success");
      if (label) {
        label.textContent = "COPIED";
        setTimeout(() => { if (address) label.textContent = shortAddress(); }, 1200);
      }
    }).catch((err) => {
      console.warn("[wallet] copy failed:", err);
      haptic("error");
    });
  }

  async function onDisconnect() {
    hideMenu();
    if (tc) {
      try { await tc.disconnect(); } catch (e) { console.warn("[wallet] disconnect failed:", e); }
    }
    set("");
    sawWallet = false;
    haptic("light");
  }

  function readCurrent() {
    if (!tc) return;
    const acct = tc.account || (tc.wallet && tc.wallet.account);
    const addr = (acct && acct.address) || "";
    if (addr) {
      sawWallet = true;
      if (addr !== address) set(addr);
      else render();
    }
  }

  function onWallet(wallet) {
    const addr = (wallet && wallet.account && wallet.account.address) || "";
    if (addr) {
      const isNew = addr !== address;
      sawWallet = true;
      if (isNew) {
        set(addr);
        haptic("success");
      } else {
        render();
      }
    } else if (sawWallet) {
      set("");
      sawWallet = false;
    }
  }

  function init() {
    wire();
    render();
    const lib = window.TON_CONNECT_UI;
    if (!lib || typeof lib.TonConnectUI !== "function") {
      console.warn("[wallet] @tonconnect/ui not loaded");
      return false;
    }
    try {
      tc = new lib.TonConnectUI({
        manifestUrl: "https://goldutya-games.vercel.app/tonconnect-manifest.json?v=2",
      });
    } catch (e) {
      console.warn("[wallet] init failed:", e);
      return false;
    }
    tc.onStatusChange(onWallet);
    readCurrent();
    setTimeout(readCurrent, 600);
    return true;
  }

  return { init, isConnected, getAddress, onChange, connect, shortAddress };
})();

Wallet.init();
