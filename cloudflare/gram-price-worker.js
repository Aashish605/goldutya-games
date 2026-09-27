// GRAM price → Telegram channel, every 3 min via Cloudflare Cron Trigger.
// Secrets (dashboard → Settings → Variables and Secrets → Secret text):
//   TG_BOT_TOKEN   - BotFather bot token
//   TG_CHANNEL_ID  - @channelusername or numeric chat id (bot = channel admin)
// Manual test: GET /?test=1

const CG_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=gram&vs_currencies=usd&include_24hr_change=true";
const BINANCE_URL = "https://api.binance.com/api/v3/ticker/24hr?symbol=TONUSDT";

const UA_HEADERS = {
  "user-agent": "gram-price-bot/1.0 (+https://t.me/grampriceusdc)",
  accept: "application/json",
};

async function fetchJson(url, ms = 8000) {
  const res = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

const GATE_URL = "https://api.gateio.ws/api/v4/spot/tickers?currency_pair=GRAM_USDT";
const MEXC_URL = "https://api.mexc.com/api/v3/ticker/24hr?symbol=GRAMUSDT";
const BYBIT_URL = "https://api.bybit.com/v5/market/tickers?category=spot&symbol=GRAMUSDT";

async function priceFromGate() {
  const data = await fetchJson(GATE_URL);
  const t = Array.isArray(data) ? data[0] : null;
  const price = parseFloat(t && t.last);
  if (!Number.isFinite(price)) throw new Error("gate: last missing");
  const change = parseFloat(t.change_percentage);
  return { price, change: Number.isFinite(change) ? change : null, source: "Gate.io" };
}

async function priceFromMexc() {
  const d = await fetchJson(MEXC_URL);
  const price = parseFloat(d.lastPrice);
  if (!Number.isFinite(price)) throw new Error("mexc: lastPrice missing");
  const prev = parseFloat(d.prevClosePrice);
  const change = Number.isFinite(prev) && prev > 0 ? ((price - prev) / prev) * 100 : null;
  return { price, change, source: "MEXC" };
}

async function priceFromBybit() {
  const d = await fetchJson(BYBIT_URL);
  const t = d && d.result && d.result.list && d.result.list[0];
  const price = parseFloat(t && t.lastPrice);
  if (!Number.isFinite(price)) throw new Error("bybit: lastPrice missing");
  const pct = parseFloat(t.price24hPcnt);
  return { price, change: Number.isFinite(pct) ? pct * 100 : null, source: "Bybit" };
}

async function fetchQuote() {
  const sources = [priceFromGate, priceFromMexc, priceFromBybit];
  const errors = [];
  for (const source of sources) {
    try {
      return await source();
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(`all sources failed: ${errors.join("; ")}`);
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
    `${hh}:${mm} UTC`
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

const PROBE_SOURCES = {
  coingecko: CG_URL,
  binance_ton: BINANCE_URL,
  binance_gram: "https://api.binance.com/api/v3/ticker/24hr?symbol=GRAMUSDT",
  okx_gram: "https://www.okx.com/api/v5/market/ticker?instId=GRAM-USDT",
  bybit_gram: "https://api.bybit.com/v5/market/tickers?category=spot&symbol=GRAMUSDT",
  mexc_gram: "https://api.mexc.com/api/v3/ticker/24hr?symbol=GRAMUSDT",
  kucoin_gram: "https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=GRAM-USDT",
  gate_gram: "https://api.gateio.ws/api/v4/spot/tickers?currency_pair=GRAM_USDT",
  gate_ton: "https://api.gateio.ws/api/v4/spot/tickers?currency_pair=TON_USDT",
};

async function probe(url) {
  try {
    const res = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(6000) });
    const body = await res.text();
    return { status: res.status, sample: body.slice(0, 160) };
  } catch (err) {
    return { status: 0, sample: err.message };
  }
}

export default {
  async scheduled(_controller, env) {
    const text = await run(env);
    console.log(`posted: ${text.replace(/\n/g, " | ")}`);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.has("probe")) {
      const results = {};
      for (const [name, src] of Object.entries(PROBE_SOURCES)) {
        results[name] = await probe(src);
      }
      results.telegram = env.TG_BOT_TOKEN
        ? await probe(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getMe`)
        : { status: 0, sample: "no TG_BOT_TOKEN secret" };
      return new Response(JSON.stringify(results, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
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
