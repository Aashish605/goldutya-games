import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3000";
mkdirSync("tests", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(BASE + "/eggjump.html", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: "tests/ej-1-menu.png" });

const menuVisible = await page.isVisible("#overlay");
console.log("menu overlay visible:", menuVisible);

await page.click("#startBtn");
await page.waitForTimeout(600);

let state = await page.evaluate(() => state);
console.log("state after start:", state);
await page.screenshot({ path: "tests/ej-2-play.png" });

// autoplay: tap whenever egg rests
let taps = 0;
for (let i = 0; i < 40; i++) {
  const info = await page.evaluate(() => ({
    state,
    phase: egg && egg.phase,
    dropping: egg && egg.dropping,
    score,
    lives,
    deadT,
  }));
  if (info.state !== "play") break;
  if (info.phase === "rest" && !info.dropping && info.deadT <= 0) {
    await page.mouse.click(215, 500);
    taps++;
    await page.waitForTimeout(120);
  } else {
    await page.waitForTimeout(80);
  }
}

const final = await page.evaluate(() => ({ state, score, lives }));
console.log("autoplay result:", final, "taps:", taps);
await page.screenshot({ path: "tests/ej-3-auto.png" });

// keep missing intentionally to drain lives if still playing
for (let i = 0; i < 60 && (await page.evaluate(() => state)) === "play"; i++) {
  await page.waitForTimeout(250);
  const info = await page.evaluate(() => ({ phase: egg && egg.phase, dropping: egg && egg.dropping, deadT, lives }));
  if (info.phase === "rest" && !info.dropping && info.deadT <= 0 && info.lives > 0) {
    // jump at wrong time: tap repeatedly fast to force misses
    await page.mouse.click(215, 500);
  }
}
const end = await page.evaluate(() => ({ state, score, lives }));
console.log("end:", end);
await page.screenshot({ path: "tests/ej-4-end.png" });

const overlayShown = await page.isVisible("#overlay");
console.log("gameover overlay visible:", overlayShown);

// force game over: drop last life
await page.evaluate(() => {
  lives = 1;
  deadT = 0;
  egg.phase = "fly";
  egg.dropping = false;
  egg.vy = -1;
  egg.y = lastBasket.y - H * 0.4;
});
await page.waitForTimeout(500);
const go = await page.evaluate(() => ({ state, lives }));
console.log("forced gameover:", go, "overlay:", await page.isVisible("#overlay"));
await page.screenshot({ path: "tests/ej-5-gameover.png" });

// restart from game over
if (go.state === "gameover") {
  await page.click("#startBtn");
  await page.waitForTimeout(400);
  console.log("after restart:", await page.evaluate(() => ({ state, score, lives })));
}

console.log("console errors:", errors.length ? errors : "none");

await browser.close();
if (errors.length) process.exit(2);
