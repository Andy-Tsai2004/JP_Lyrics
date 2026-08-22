import { createServerFn } from "@tanstack/react-start";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { extractJapaneseLines, extractUtaNetLyrics } from "./extract";
import { addFurigana } from "./furigana";
import type { LyricsResult } from "./types";

const BAHAMUT_HOST = /(^|\.)gamer\.com\.tw$/i;
const UTANET_HOST = /(^|\.)uta-net\.com$/i;
const execFileAsync = promisify(execFile);

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ja,zh-TW,en;q=0.8",
} as const;

async function fetchWithCurl(url: URL): Promise<string> {
  const args = [
    "-sSL",
    "--compressed",
    "--max-time",
    "20",
    ...Object.entries(REQUEST_HEADERS).flatMap(([key, value]) => ["-H", `${key}: ${value}`]),
    "-w",
    "\n%{http_code}",
    url.toString(),
  ];
  const candidates = ["curl", "curl.exe", "/usr/bin/curl", "/usr/local/bin/curl"];
  let lastError: unknown = null;
  for (const bin of candidates) {
    try {
      const { stdout } = await execFileAsync(bin, args, {
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      });
      const match = stdout.match(/\n(\d{3})\s*$/);
      const httpCode = match ? Number(match[1]) : 200;
      const html = match ? stdout.slice(0, match.index) : stdout;
      if (httpCode >= 400) {
        throw new Error(`The lyric page returned ${httpCode}. Try again in a moment.`);
      }
      return html;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "ENOENT") {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw (
    lastError ??
    new Error("The lyric site blocked the request (403). Please try again in a moment.")
  );
}

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

export const fetchLyrics = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().min(8) }))
  .handler(async ({ data }): Promise<LyricsResult> => {
    const url = assertSupportedUrl(data.url);
    const response = await fetch(url.toString(), {
      headers: REQUEST_HEADERS,
      redirect: "follow",
    });
    const blockedStatus = response.status === 403 || response.status === 429 || response.status === 503;
    if (!response.ok && !(blockedStatus && isUtaNetUrl(url))) {
      throw new Error(`The lyric page returned ${response.status}. Try again in a moment.`);
    }
    const html =
      blockedStatus && isUtaNetUrl(url)
        ? await fetchWithCurl(url)
        : await response.text();
    const utaNet = isUtaNetUrl(url);
    const { title, lines } = utaNet
      ? extractUtaNetLyrics(html)
      : extractJapaneseLines(html);
    if (lines.length === 0) {
      throw new Error(
        utaNet
          ? "No lyric lines were found on this Uta-Net page."
          : "No Japanese lyric lines were found. This post may not use the usual 日 / 羅 / 中 layout.",
      );
    }
    const withRuby = await addFurigana(lines);
    return {
      sourceUrl: url.toString(),
      title,
      lines: withRuby,
    };
  });
