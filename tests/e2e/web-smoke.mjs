// Smoke test for the web build. Run the image first (Task 9, Step 4), then:
//   WEB_URL=http://localhost:8088 bun run test:e2e
import { chromium } from "playwright";

const base = process.env.WEB_URL ?? "http://localhost:8088";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && /tauri/i.test(m.text()) && errors.push(m.text()));

function check(ok, label) {
  console.log(`${ok ? "✔" : "✘"} ${label}`);
  if (!ok) process.exitCode = 1;
}

await page.goto(base);
await page.waitForTimeout(3000);
check(await page.getByRole("button", { name: "Open settings" }).isVisible(), "home renders");

await page.getByRole("button", { name: "Open settings" }).click();
await page.waitForTimeout(1000);
check(await page.getByText("Sanad account").isVisible(), "Account section shown on the web");
check(!(await page.getByText("Check for updates").isVisible()), "no in-app updater on the web");
await page.keyboard.press("Escape");

await page.goto(`${base}/tray`);
await page.waitForTimeout(1500);
check(new URL(page.url()).pathname === "/", "/tray redirects home on the web");

await page.goto(`${base}/privacy`);
check(await page.getByRole("heading", { name: "What Meeqat stores and sends" }).isVisible(), "privacy page renders");

check(errors.length === 0, `no Tauri/page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
