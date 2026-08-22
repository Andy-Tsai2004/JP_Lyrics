import {
  extractJapaneseLines,
  extractJapaneseLinesFromMarkdown,
  extractUtaNetLyrics,
  extractUtaNetLyricsFromMarkdown,
} from "./extract";
import { addFurigana } from "./furigana";
import type { LyricsResult } from "./types";

const BAHAMUT_HOST = /(^|\.)gamer\.com\.tw$/i;
const UTANET_HOST = /(^|\.)uta-net\.com$/i;

const REQUEST_TIMEOUT_MS = 25_000;

const RAW_HTML_PROXIES = [
  (url: URL) =>
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url.toString())}`,
  (url: URL) =>
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url.toString())}`,
];

function isBahamutUrl(url: URL): boolean {
  return (
    BAHAMUT_HOST.test(url.hostname) &&
    (url.pathname.includes("artwork.php") || Boolean(url.searchParams.get("sn")))
  );
}

function isUtaNetUrl(url: URL): boolean {
  return UTANET_HOST.test(url.hostname) && /^\/song\/\d+/.test(url.pathname);
}

function assertSupportedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Please paste a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  if (!isBahamutUrl(url) && !isUtaNetUrl(url)) {
    throw new Error(
      "Only Bahamut (gamer.com.tw) artwork links and Uta-Net (uta-net.com/song/…) links are supported.",
    );
  }
  return url;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GitHub Pages is static-only, so lyric pages are fetched in the browser
 * through public CORS proxies. The first strategy asks a raw-HTML proxy
 * (allorigins) for the original page and reuses the DOM extractors; if that
 * fails or yields no lyrics, a reader proxy (r.jina.ai) returns markdown that
 * the markdown extractors know how to parse.
 */
async function fetchRawHtml(url: URL): Promise<string | null> {
  for (let round = 0; round < 2; round += 1) {
    for (const makeUrl of RAW_HTML_PROXIES) {
      try {
        const res = await fetchWithTimeout(makeUrl(url));
        if (res.ok) {
          const text = await res.text();
          if (text && !text.trim().startsWith("{")) return text;
        }
      } catch {
        // transient proxy failure — try the next one
      }
    }
    if (round === 0) await delay(900);
  }
  return null;
}

async function fetchMarkdown(url: URL): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchWithTimeout(`https://r.jina.ai/${url.toString()}`);
      if (res.ok) {
        const text = await res.text();
        if (text.includes("Markdown Content:")) return text;
      }
    } catch {
      // transient network failure — retry once
    }
    if (attempt === 0) await delay(900);
  }
  return null;
}

export async function fetchLyrics(target: string): Promise<LyricsResult> {
  const url = assertSupportedUrl(target);
  const utaNet = isUtaNetUrl(url);
  let fetchedAny = false;

  const html = await fetchRawHtml(url);
  if (html) {
    fetchedAny = true;
    const { title, lines } = utaNet
      ? extractUtaNetLyrics(html)
      : extractJapaneseLines(html);
    if (lines.length > 0) {
      return complete(url, title, lines);
    }
  }

  const markdown = await fetchMarkdown(url);
  if (markdown) {
    fetchedAny = true;
    const { title, lines } = utaNet
      ? extractUtaNetLyricsFromMarkdown(markdown)
      : extractJapaneseLinesFromMarkdown(markdown);
    if (lines.length > 0) {
      return complete(url, title, lines);
    }
  }

  throw new Error(
    fetchedAny
      ? utaNet
        ? "No lyric lines were found on this Uta-Net page. The site may be blocking the request — try again in a moment."
        : "No Japanese lyric lines were found. This post may not use the usual 日 / 羅 / 中 layout."
      : utaNet
        ? "Could not reach Uta-Net right now. The public proxy may be blocked or busy — please try again in a moment."
        : "Could not reach Bahamut right now. The public proxy may be blocked or busy — please try again in a moment.",
  );
}

async function complete(
  url: URL,
  title: string,
  lines: string[],
): Promise<LyricsResult> {
  const withRuby = await addFurigana(lines);
  return {
    sourceUrl: url.toString(),
    title,
    lines: withRuby,
  };
}
