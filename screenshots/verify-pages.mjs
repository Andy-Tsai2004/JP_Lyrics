import { chromium as chromiumPlaywright } from "playwright";
import { mkdirSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shotDir = join(root, "screenshots");
mkdirSync(shotDir, { recursive: true });

const baseUrl = process.env.TARGET_URL ?? "http://127.0.0.1:8080";
const tag = process.env.TAG ?? "dev";

const chromium = chromiumPlaywright;

// Prefer the full Chromium build (the headless shell may not be downloaded).
const candidates = [
  "C:\\Users\\lusze\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
];
const executablePath = candidates.find((p) => existsSync(p));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const consoleErrors = [];
const pageErrors = [];

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));
  return page;
}

async function capture(page, name) {
  await page.screenshot({ path: join(shotDir, `${tag}-${name}.png`), fullPage: false });
}

const result = {};

// Desktop load
{
  const page = await newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("h1:text('Japanese Lyrics Viewer')", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const bodyText = (await page.textContent("body")) ?? "";
  result.desktopVisible = bodyText.includes("Japanese Lyrics Viewer");
  await capture(page, "desktop");
  await page.close();
}

// Mobile load + overflow check
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("h1:text('Japanese Lyrics Viewer')", { timeout: 30_000 });
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  result.mobileOverflow = overflow;
  await capture(page, "mobile");
  await page.close();
}

// Fetch a Bahamut sample and wait for lyrics + ruby
{
  const page = await newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("h1:text('Japanese Lyrics Viewer')", { timeout: 30_000 });
  await page.getByRole("button", { name: "Try Bahamut sample" }).click();
  try {
    await page.waitForSelector("section ruby rt", { timeout: 120_000 });
    result.bahamutLyrics = true;
    const title = await page.locator("section h2").textContent();
    result.bahamutTitle = title?.trim();
    const rubyCount = await page.locator("section ruby rt").count();
    result.bahamutRubyCount = rubyCount;
    await capture(page, "bahamut-lyrics");
  } catch {
    result.bahamutLyrics = false;
    result.bahamutError = (await page.locator("[role='alert']").textContent()) ?? null;
    await capture(page, "bahamut-error");
  }
  await page.close();
}

// Fetch a Uta-Net sample (often takes the markdown fallback path)
{
  const page = await newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("h1:text('Japanese Lyrics Viewer')", { timeout: 30_000 });
  await page.getByRole("button", { name: "Try Uta-Net sample" }).click();
  try {
    await page.waitForSelector("section ruby rt", { timeout: 150_000 });
    result.utaNetLyrics = true;
    result.utaNetTitle = (await page.locator("section h2").textContent())?.trim();
    result.utaNetRubyCount = await page.locator("section ruby rt").count();
    await capture(page, "utanet-lyrics");
  } catch {
    result.utaNetLyrics = false;
    result.utaNetError =
      (await page.locator("[role='alert']").textContent().catch(() => null)) ?? null;
    await capture(page, "utanet-error");
  }
  await page.close();
}

await browser.close();

result.consoleErrors = consoleErrors;
result.pageErrors = pageErrors;

// Proxy fetches can fail (CORS / connection refused) while a later fallback
// succeeds; the browser logs those as console errors even though the app
// recovers. Only treat real application errors as failures.
const significantConsoleErrors = consoleErrors.filter(
  (msg) =>
    !msg.includes("net::ERR_FAILED") &&
    !msg.includes("blocked by CORS policy") &&
    !msg.includes("ERR_CONNECTION_REFUSED") &&
    !msg.includes("the server responded with a status of"),
);

result.pass =
  result.desktopVisible === true &&
  result.mobileOverflow === false &&
  result.bahamutLyrics === true &&
  result.utaNetLyrics === true &&
  significantConsoleErrors.length === 0 &&
  pageErrors.length === 0;

console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 1);
