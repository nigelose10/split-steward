/**
 * Record the Split Steward walkthrough.
 *
 * Sandbox take (submission): PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET set,
 * and PAYPAL_MODE is not "mock".
 * Rehearsal take: otherwise. The captions say PayPal was not called.
 *
 *   npm run build
 *   xvfb-run -a npm run demo:record
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { aiMode, bannerCopy, paypalMode } from "../lib/config";

const port = Number(process.env.DEMO_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const outDir = path.resolve("demo-output");

const narration = [
  "Split Steward reads a shared bill and proposes who pays whom.",
  "The amounts come from a deterministic splitter, and the reason is on the page.",
  "Noah approves his own charge. Elena has not, so her charge cannot reach PayPal.",
  "After checkout, only Noah’s row is settled.",
].join(" ");

async function main() {
  const paypal = paypalMode();
  const ai = aiMode();
  const modeLine =
    paypal === "sandbox"
      ? "SANDBOX. PayPal sandbox orders are real sandbox API objects, not live charges."
      : "MOCK MODE. PayPal was not called. This is not a PayPal result.";
  console.log(bannerCopy(paypal, ai, ai === "gateway" ? process.env.AI_MODEL ?? "openai/gpt-5.4-mini" : null));
  console.log(modeLine);

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "narration.txt"), `${narration}\n\n${modeLine}\n`, "utf8");

  const server = await startServer();
  const browser = await chromium.launch({
    headless: !process.env.DISPLAY,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  try {
    await page.goto(baseURL);
    await page.getByTestId("mode-banner").waitFor();
    const banner = await page.getByTestId("mode-banner").innerText();
    if (paypal === "mock" && !banner.includes("PayPal was not called")) {
      throw new Error("Mock banner does not disclose that PayPal was not called.");
    }
    if (paypal === "sandbox" && banner.includes("PayPal was not called")) {
      throw new Error("Sandbox run is showing the mock banner.");
    }
    await page.waitForTimeout(1500);
    await page.getByTestId("sample-cabin").click();
    await page.waitForTimeout(800);
    await page.getByTestId("propose").click();
    await page.getByTestId("math-reasoning").waitFor();
    await page.getByTestId("math-reasoning").scrollIntoViewIfNeeded();
    await page.waitForTimeout(4500);
    await page.getByTestId("ledger-grid").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    await page.getByTestId("actor").selectOption("Noah");
    await page.getByTestId("approve-Noah-to-Priya").scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.getByTestId("approve-Noah-to-Priya").click();
    await page.waitForTimeout(1500);
    await page.getByTestId("create-order-Noah-to-Priya").click();
    await page.waitForTimeout(1200);
    const checkout = page.getByTestId("checkout-Noah-to-Priya");
    const href = await checkout.getAttribute("href");
    if (!href) throw new Error("Checkout link missing.");
    if (paypal === "mock" && href.includes("paypal.com")) {
      throw new Error("Mock mode produced a PayPal URL.");
    }
    if (paypal === "sandbox" && !href.includes("sandbox.paypal.com")) {
      throw new Error(`Sandbox approve URL was ${href}`);
    }

    if (paypal === "mock") {
      await checkout.click();
      await page.getByTestId("mock-checkout").waitFor();
      await page.waitForTimeout(2000);
      await page.getByTestId("simulate-pay").click();
      await page.getByTestId("sim-result").waitFor();
      await page.waitForTimeout(1500);
      await page.getByRole("link", { name: "Back to the settlement" }).click();
    } else {
      const popupPromise = context.waitForEvent("page", { timeout: 15_000 }).catch(() => null);
      await checkout.click();
      const checkoutPage = (await popupPromise) ?? page;
      await checkoutPage.waitForLoadState("domcontentloaded");
      await fillSandboxBuyer(checkoutPage);
      await waitForSettled(page);
    }

    await page.getByTestId("status-Noah-to-Priya").waitFor();
    const noah = await page.getByTestId("status-Noah-to-Priya").innerText();
    const elena = await page.getByTestId("status-Elena-to-Priya").innerText();
    if (paypal === "mock" && !noah.includes("Settled in simulation")) {
      throw new Error(`Expected a simulated settlement, saw: ${noah}`);
    }
    if (paypal === "sandbox" && !noah.includes("Settled in PayPal sandbox")) {
      throw new Error(`Sandbox charge did not settle: ${noah}`);
    }
    if (!elena.includes("waiting for approval")) {
      throw new Error("Elena’s unapproved charge changed.");
    }
    await page.getByTestId("status-Elena-to-Priya").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    stopServer(server);
    const webm = video ? await video.path() : "";
    if (webm) await finishVideo(webm, modeLine);
  }
}

async function fillSandboxBuyer(page: import("playwright").Page) {
  const email = process.env.PAYPAL_SANDBOX_BUYER_EMAIL?.trim();
  const password = process.env.PAYPAL_SANDBOX_BUYER_PASSWORD?.trim();
  if (!email || !password) {
    console.log("No sandbox buyer credentials. Finish the PayPal window by hand. Waiting 90s.");
    return;
  }
  const emailBox = page.locator("input#email, input[name='login_email']").first();
  if (await emailBox.isVisible().catch(() => false)) {
    await emailBox.fill(email);
    const next = page.getByRole("button", { name: /next|log in/i }).first();
    if (await next.isVisible().catch(() => false)) await next.click();
  }
  const passwordBox = page.locator("input#password, input[name='login_password']").first();
  if (await passwordBox.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await passwordBox.fill(password);
    await page.getByRole("button", { name: /log in/i }).first().click();
  }
  const pay = page.getByRole("button", { name: /pay|agree|continue/i }).first();
  if (await pay.isVisible({ timeout: 10_000 }).catch(() => false)) await pay.click();
}

async function waitForSettled(page: import("playwright").Page) {
  await page.getByTestId("status-Noah-to-Priya").waitFor({ state: "visible" });
  await expectEventually(async () => {
    const text = await page.getByTestId("status-Noah-to-Priya").innerText();
    if (!text.includes("Settled in PayPal sandbox")) {
      throw new Error(text);
    }
  }, 90_000);
}

async function expectEventually(check: () => Promise<void>, timeoutMs: number) {
  const start = Date.now();
  let last = "not settled";
  while (Date.now() - start < timeoutMs) {
    try {
      await check();
      return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error(`Timed out waiting for sandbox settlement (${last}).`);
}

async function startServer(): Promise<import("node:child_process").ChildProcess> {
  const alreadyUp = await fetch(`${baseURL}/api/health`)
    .then((response) => response.ok)
    .catch(() => false);
  if (alreadyUp) {
    throw new Error(`Something is already serving ${baseURL}. Stop it before recording so this script does not film the wrong process.`);
  }
  const server = spawn("npm", ["run", "start", "--", "--port", String(port), "--hostname", "127.0.0.1"], {
    detached: true,
    stdio: "inherit",
    env: { ...process.env, APP_URL: process.env.APP_URL || baseURL },
  });
  let exited = false;
  server.on("exit", () => {
    exited = true;
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited) break;
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok && !exited) return server;
    } catch {
      // server still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stopServer(server);
  throw new Error(
    `The app did not stay up on ${baseURL}. Run npm run build first, and free port ${port} if something else is bound there.`,
  );
}

function stopServer(server: import("node:child_process").ChildProcess) {
  if (!server.pid) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

async function prependTitleCard(
  captioned: string,
  mp4: string,
  font: string | undefined,
  escaped: string,
): Promise<boolean> {
  if (!font) return false;
  const title = path.join(outDir, "title.mp4");
  const vf = [
    `drawtext=fontfile=${font}:text='Split Steward':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h/2)-80`,
    `drawtext=fontfile=${font}:text='${escaped}':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=(h/2)+12`,
  ].join(",");
  const card = spawnSync(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", "color=c=0x143528:s=1280x720:d=3:r=25", "-vf", vf, "-pix_fmt", "yuv420p", title],
    { stdio: "inherit" },
  );
  if (card.status !== 0) return false;
  const concat = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      title,
      "-i",
      captioned,
      "-filter_complex",
      "[0:v][1:v]concat=n=2:v=1:a=0[v]",
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4,
    ],
    { stdio: "inherit" },
  );
  return concat.status === 0;
}

async function finishVideo(webm: string, modeLine: string) {
  const mp4 = path.join(outDir, "split-steward-demo.mp4");
  const ffmpeg = spawnSync("ffmpeg", ["-version"]);
  if (ffmpeg.status !== 0) {
    console.error(`ffmpeg is not available. Raw recording: ${webm}`);
    process.exitCode = 1;
    return;
  }
  const font = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ].find((candidate) => spawnSync("test", ["-f", candidate]).status === 0);
  const escaped = modeLine.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const captioned = path.join(outDir, "captioned.mp4");
  const args = ["-y", "-i", webm, "-r", "25", "-c:v", "libx264", "-pix_fmt", "yuv420p", captioned];
  const encoded = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (encoded.status !== 0) {
    console.error(`ffmpeg failed. Raw recording: ${webm}`);
    process.exitCode = 1;
    return;
  }
  const titled = await prependTitleCard(captioned, mp4, font, escaped);
  if (!titled) {
    const { renameSync } = await import("node:fs");
    renameSync(captioned, mp4);
  }
  const espeak = spawnSync("espeak-ng", ["--version"]);
  if (espeak.status === 0) {
    const wav = path.join(outDir, "narration.wav");
    const mixed = path.join(outDir, "split-steward-demo-narrated.mp4");
    spawnSync("espeak-ng", ["-w", wav, narration], { stdio: "inherit" });
    const mix = spawnSync(
      "ffmpeg",
      ["-y", "-i", mp4, "-i", wav, "-c:v", "copy", "-c:a", "aac", "-shortest", mixed],
      { stdio: "inherit" },
    );
    if (mix.status === 0) console.log(`Narrated video: ${mixed}`);
  } else {
    console.log("espeak-ng not installed. Video has captions only, no voiceover.");
  }
  console.log(`Video: ${mp4}`);
  console.log(`Title card mode line: ${modeLine}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
