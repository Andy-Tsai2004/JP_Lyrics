import {
  extractJapaneseLines,
  extractJapaneseLinesFromMarkdown,
  extractUtaNetLyrics,
  extractUtaNetLyricsFromMarkdown,
} from "./extract";
import { addFurigana } from "./furigana";
import { fetchMarkdown, fetchRawHtml } from "./proxy";
import type { LyricsResult } from "./types";

const BAHAMUT_HOST = /(^|\.)gamer\.com\.tw$/i;
const UTANET_HOST = /(^|\.)uta-net\.com$/i;

// v3: jina now renders Uta-Net titles in its "Title:" header instead of page
// headings; bump so stale cached titles ("Japanese lyrics") re-fetch.
const CACHE_PREFIX = "jplyrics:cache:v3:";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // keep lyrics for a week

type CacheEntry = {
  title: string;
  lines: LyricsResult["lines"];
  fetchedAt: number;
};

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

function cacheKey(url: URL): string {
  return `${CACHE_PREFIX}${url.toString()}`;
}

function readCache(url: URL): LyricsResult | null {
  try {
    const raw = localStorage.getItem(cacheKey(url));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (
      !entry ||
      typeof entry.title !== "string" ||
      !Array.isArray(entry.lines) ||
      typeof entry.fetchedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(url));
      return null;
    }
    return {
      sourceUrl: url.toString(),
      title: entry.title,
      lines: entry.lines,
    };
  } catch {
    return null;
  }
}

function writeCache(url: URL, result: LyricsResult): void {
  try {
    const entry: CacheEntry = {
      title: result.title,
      lines: result.lines,
      fetchedAt: Date.now(),
    };
    localStorage.setItem(cacheKey(url), JSON.stringify(entry));
  } catch {
    // storage unavailable / full — caching is best-effort
  }
}

export async function fetchLyrics(target: string): Promise<LyricsResult> {
  const url = assertSupportedUrl(target);
  const utaNet = isUtaNetUrl(url);

  const cached = readCache(url);
  if (cached) return cached;

  let fetchedAny = false;

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

  throw new Error(
    fetchedAny
      ? utaNet
        ? "No lyric lines were found on this Uta-Net page. It may be an instrumental track, or the page layout may have changed."
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
  const result: LyricsResult = {
    sourceUrl: url.toString(),
    title,
    lines: withRuby,
  };
  writeCache(url, result);
  return result;
}
