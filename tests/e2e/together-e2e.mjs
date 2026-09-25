// Pray Together end-to-end: two people, one room, one call. Starts nothing itself:
//   cd services/together && PB_SUPERUSER_EMAIL=dev@local.test PB_SUPERUSER_PASSWORD=devpass12345 \
//     go run . serve --http 127.0.0.1:8090 --dir /tmp/together-dev
//   NUXT_PUBLIC_TOGETHER_URL=http://127.0.0.1:8090 bun run dev
//   bun run test:e2e:together
// Signs in through the dev-only `?together-token=` hook with users made by the superuser.
// The service rate-limits call creation per IP (10/hour): after a few runs, restart it.
import { chromium } from "playwright";

const app = process.env.WEB_URL ?? "http://localhost:3000";
const pbUrl = process.env.TOGETHER_URL ?? "http://127.0.0.1:8090";
const email = process.env.PB_SUPERUSER_EMAIL ?? "dev@local.test";
const password = process.env.PB_SUPERUSER_PASSWORD ?? "devpass12345";
const T = 15_000;

function check(ok, label) {
  console.log(`${ok ? "✔" : "✘"} ${label}`);
  if (!ok) process.exitCode = 1;
}

async function api(path, body, token) {
  const res = await fetch(`${pbUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function makeUser(admin, name) {
  const tag = `${name.toLowerCase()}-${Date.now()}`;
  const user = await api(
    "/api/collections/users/records",
    { sanad_id: `e2e-${tag}`, email: `${tag}@e2e.test`, password: "e2e-password-1", passwordConfirm: "e2e-password-1", name },
    admin,
  );
  const { token } = await api(`/api/collections/users/impersonate/${user.id}`, {}, admin);
  return token;
}

/** Waits for `fn` to hold; false on timeout instead of throwing, so every check reports. */
async function eventually(fn, timeout = T) {
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(`  ${String(err.message ?? err).split("\n")[0]}`);
    return false;
  }
}

const { token: admin } = await api("/api/collections/_superusers/auth-with-password", { identity: email, password });
const [tokenA, tokenB] = await Promise.all([makeUser(admin, "Amina"), makeUser(admin, "Bilal")]);

const browser = await chromium.launch();
const errors = [];
async function open(token) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${app}/rooms?together-token=${token}`);
  return page;
}

try {
  const a = await open(tokenA);
  const b = await open(tokenB);

  // A creates a room.
  await a.getByRole("button", { name: "Create room" }).first().click();
  const createDialog = a.getByRole("dialog");
  await createDialog.getByLabel("Name").fill("E2E Musalla");
  await createDialog.getByLabel("Default place").fill("Floor 3");
  await createDialog.getByRole("button", { name: "Create room" }).click();
  check(await eventually(() => a.waitForURL(/\/rooms\/[a-z0-9]+$/, { timeout: T })), "A creates a room");
  const code = (await a.getByTestId("room-code").textContent({ timeout: T }))?.trim() ?? "";
  check(/^[A-Z0-9]{8}$/.test(code), `room has an 8-character code (${code})`);

  // B joins with the code, typed sloppily.
  await b.getByRole("button", { name: "Join with code" }).click();
  await b.getByRole("dialog").getByLabel("Room code").fill(`${code.slice(0, 4).toLowerCase()} ${code.slice(4)}`);
  await b.getByRole("dialog").getByRole("button", { name: "Join room" }).click();
  check(await eventually(() => b.waitForURL(a.url(), { timeout: T })), "B joins by code");
  check(await eventually(() => a.getByText("Bilal").waitFor({ timeout: T })), "A sees B in the members list");

  // A starts a call with two place options.
  await a.getByRole("button", { name: "Start a call" }).first().click();
  const startDialog = a.getByRole("dialog");
  for (const place of ["Musalla B2", "Roof terrace"]) {
    await startDialog.getByLabel("Option", { exact: true }).fill(place);
    await startDialog.getByRole("button", { name: "Add option" }).click();
  }
  await startDialog.getByRole("button", { name: /^Start .* call$/ }).click();
  const callA = a.locator("article[data-call]");
  check(await eventually(() => callA.getByText("You started this").waitFor({ timeout: T })), "A starts a call");

  // B sees it live, joins and votes.
  const callB = b.locator("article[data-call]");
  check(await eventually(() => callB.getByText("Started by Amina").waitFor({ timeout: T })), "B sees the call appear live");
  await callB.getByRole("button", { name: "Join" }).click();
  check(await eventually(() => callB.getByText("You and 1 more").waitFor({ timeout: T })), "B joins the call");
  await callB.getByRole("button", { name: /Musalla B2/ }).click();
  check(
    await eventually(() => callB.getByRole("button", { name: /Musalla B2/, pressed: true }).waitFor({ timeout: T })),
    "B's vote is highlighted",
  );
  check(
    await eventually(() => callA.getByRole("button", { name: /Musalla B2\s*1/ }).waitFor({ timeout: T })),
    "A sees B's vote counted",
  );

  // A finalizes the other option; B sees the new place.
  await callA.getByRole("listitem").filter({ hasText: "Roof terrace" }).getByRole("button", { name: "Pick" }).click();
  check(await eventually(() => callB.getByText("Set", { exact: true }).waitFor({ timeout: T })), "B sees the call finalized");
  check(
    await eventually(() => callB.getByText("Roof terrace").first().waitFor({ timeout: T })) &&
      (await callB.getByText("Place changed").isVisible()),
    "B sees the finalized place, marked as changed",
  );

  // B chats; A reads it.
  await callB.getByLabel("Message").fill("On my way, salam");
  await callB.getByRole("button", { name: "Send" }).click();
  check(await eventually(() => callA.getByText("On my way, salam").waitFor({ timeout: T })), "A sees B's message");

  // Starting the same prayer again opens the existing call (409).
  await a.getByRole("button", { name: "Start a call" }).first().click();
  await a.getByRole("dialog").getByRole("button", { name: /^Start .* call$/ }).click();
  check(
    await eventually(() => a.getByText("already has a call today").first().waitFor({ timeout: T })) && (await callA.count()) === 1,
    "a second call for the same prayer shows the existing one",
  );

  // Unsubscribing hides calls.
  await b.getByRole("button", { name: /Subscribed/ }).click();
  check(await eventually(() => b.getByText("Subscribe to see calls").waitFor({ timeout: T })), "unsubscribed member sees no calls");
  check((await callB.count()) === 0, "call card is gone for the unsubscribed member");
} finally {
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await browser.close();
}
