import { chromium as chromiumPlaywright } from "playwright";
import { existsSync } from "node:fs";

const baseUrl = process.env.TARGET_URL ?? "http://127.0.0.1:8080";

const chromium = chromiumPlaywright;
const candidates = [
  "C:\\Users\\lusze\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
];
const executablePath = candidates.find((p) => existsSync(p));
const browser = await chromium.launch(executablePath ? { executablePath } : {});

async function measureSample(page, buttonName, label) {
  const proxyRequests = [];
  page.on("request", (req) => {
    const u = req.url();
    if (
      u.includes("r.jina.ai") ||
      u.includes("allorigins") ||
      u.includes("codetabs")
    ) {
      proxyRequests.push(u);
    }
  });

  const started = Date.now();
  await page.getByRole("button", { name: buttonName }).click();
  await page.waitForSelector("section ruby rt", { timeout: 90_000 });
  const firstMs = Date.now() - started;
  await page.waitForTimeout(300);

  const rubyCount = await page.locator("section ruby rt").count();
  const title = (await page.locator("section h2").textContent())?.trim();
  const cacheKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("jplyrics:cache:")),
  );

  // Second fetch of the same URL should hit localStorage: no new proxy
  // request should leave the page, and lyrics should reappear quickly.
  proxyRequests.length = 0;
  const secondStart = Date.now();
  await page.getByRole("button", { name: buttonName }).click();
  await page.waitForTimeout(1200);
  const secondMs = Date.now() - secondStart;
  const secondRubyCount = await page.locator("section ruby rt").count();
  const secondProxyRequests = [...proxyRequests];

  console.log(
    JSON.stringify({
      sample: label,
      firstFetchMs: firstMs,
      rubyCount,
      title,
      cacheKeys,
      secondFetchMs: secondMs,
      secondRubyCount,
      secondProxyRequests,
    }),
  );
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("h1:text('Japanese Lyrics Viewer')", {
    timeout: 30_000,
  });
  await measureSample(page, "Try Bahamut sample", "Bahamut");
  await measureSample(page, "Try Uta-Net sample", "Uta-Net");
  await page.close();
}

await browser.close();
