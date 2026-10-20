// One light end-to-end check of the real sky in the dev app. It opens ONE visible Chromium window
// (so the real GPU draws; headless Chromium would emulate WebGL on the CPU, which is heavy),
// at 1× pixel density, takes two screenshots and closes. Ask before running it on a laptop.
//   terminal 1: bun run dev        (note the port it prints)
//   terminal 2: SKY_URL=http://localhost:3000 node tests/e2e/sky.mjs
import { chromium } from "playwright";

const base = process.env.SKY_URL ?? "http://localhost:3000";
const out = process.env.SKY_OUT ?? "/tmp/meeqat-sky-e2e";
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "✔" : "✘"} ${label}`);
  if (!ok) failures.push(label);
};
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Infinity;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, timezoneId: "Asia/Qatar" });
await context.addInitScript(() => {
  localStorage.setItem("localStore:settings.bin", JSON.stringify({ preferences: { city: "Doha", country: "QA", locationMode: "city" } }));
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.waitForFunction(() => window.__sky?.frames > 0, null, { timeout: 30_000 });
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: `${out}-home.png` });

  // Idle: no frames between minute ticks
  const sec = new Date().getSeconds();
  if (sec > 50) await page.waitForTimeout((62 - sec) * 1_000);
  const f0 = await page.evaluate(() => window.__sky.frames);
  await page.waitForTimeout(3_000);
  check((await page.evaluate(() => window.__sky.frames)) === f0, "no frames drawn while idle");

  // Explore: open, drag, zoom
  await page.getByRole("button", { name: "Explore the sky" }).click();
  await page.waitForTimeout(800);
  check(new URL(page.url()).searchParams.get("sky") === "1", "explore opens with ?sky=1");
  await page.evaluate(() => (window.__sky.ms.length = 0));
  await page.mouse.move(640, 400);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(640 - i * 8, 400 + i * 3);
  await page.mouse.up();
  await page.waitForTimeout(800);
  const dragMs = median(await page.evaluate(() => window.__sky.ms));
  check(dragMs < 2, `drag frame median ${dragMs.toFixed(2)} ms < 2 ms`);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);

  // Search (English), close the card, tap the star it centred on, then search in Arabic
  const search = page.getByRole("textbox", { name: "Search the sky" });
  await search.fill("vega");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  check(await page.getByRole("dialog", { name: "Vega" }).isVisible(), "search finds Vega and opens its card");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const vega = await page.evaluate(() => window.__sky.pointOf("Vega"));
  if (vega && vega.x > 0 && vega.y > 0 && vega.x < 1280 && vega.y < 800) {
    await page.mouse.click(vega.x, vega.y);
    await page.waitForTimeout(300);
    check(await page.getByRole("dialog", { name: "Vega" }).isVisible(), "tapping Vega opens its card");
  } else check(false, "Vega is on screen to tap");
  await search.fill("النسر الطائر");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  check(await page.getByRole("dialog", { name: "Altair" }).isVisible(), "Arabic search finds Altair");
  await page.screenshot({ path: `${out}-explore.png` });

  // Close with Esc
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  check(new URL(page.url()).searchParams.get("sky") === null, "Esc closes explore");
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} finally {
  await browser.close();
}
console.log(`screenshots: ${out}-home.png, ${out}-explore.png`);
process.exitCode = failures.length ? 1 : 0;
