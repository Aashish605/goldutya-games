// GRAM price → Telegram channel, every 3 min via Cloudflare Cron Trigger.
// Secrets (dashboard → Settings → Variables and Secrets → Secret text):
//   TG_BOT_TOKEN   - BotFather bot token
//   TG_CHANNEL_ID  - @channelusername or numeric chat id (bot = channel admin)
// Manual test: GET /?test=1

const CG_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=gram&vs_currencies=usd&include_24hr_change=true";
const BINANCE_URL = "https://api.binance.com/api/v3/ticker/24hr?symbol=TONUSDT";

async function fetchJson(url, ms = 8000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

async function priceFromCoinGecko() {
  const data = await fetchJson(CG_URL);
  const g = data && data.gram;
  if (!g || typeof g.usd !== "number") throw new Error("coingecko: gram.usd missing");
  return {
    price: g.usd,
    change: typeof g.usd_24h_change === "number" ? g.usd_24h_change : null,
    source: "CoinGecko",
  };
}

async function priceFromBinance() {
  const data = await fetchJson(BINANCE_URL);
  const price = parseFloat(data.price);
  const change = parseFloat(data.priceChangePercent);
  if (!Number.isFinite(price)) throw new Error("binance: price missing");
  return {
    price,
    change: Number.isFinite(change) ? change : null,
    source: "Binance",
  };
}

async function fetchQuote() {
  try {
    return await priceFromCoinGecko();
  } catch (err) {
    console.log(`coingecko failed (${err.message}), trying binance`);
    return priceFromBinance();
  }
}

function formatPrice(n) {
  return n < 1 ? n.toFixed(4) : n.toFixed(4);
}

function formatChange(change) {
  if (change === null) return "";
  const arrow = change >= 0 ? "▲" : "▼";
  return `  ${arrow}${Math.abs(change).toFixed(2)}% (24h)`;
}

function buildMessage(quote) {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  return (
    `💎 GRAM (Toncoin) — $${formatPrice(quote.price)}${formatChange(quote.change)}\n` +
    `Source: ${quote.source} · ${hh}:${mm} UTC`
  );
}

async function postToTelegram(env, text) {
  const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TG_CHANNEL_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true) {
    throw new Error(`telegram HTTP ${res.status}: ${body && body.description ? body.description : res.statusText}`);
  }
}

async function run(env) {
  if (!env.TG_BOT_TOKEN || !env.TG_CHANNEL_ID) {
    throw new Error("missing secrets TG_BOT_TOKEN / TG_CHANNEL_ID");
  }
  const quote = await fetchQuote();
  const text = buildMessage(quote);
  await postToTelegram(env, text);
  return text;
}

export default {
  async scheduled(_controller, env) {
    const text = await run(env);
    console.log(`posted: ${text.replace(/\n/g, " | ")}`);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.has("test")) {
      try {
        const text = await run(env);
        return new Response(`OK\n${text}`, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      } catch (err) {
        return new Response(`FAIL: ${err.message}`, {
          status: 500,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
    }
    return new Response("gram-price-bot", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
