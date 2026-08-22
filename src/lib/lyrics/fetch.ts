import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { extractJapaneseLines } from "./extract";
import { addFurigana } from "./furigana";
import type { LyricsResult } from "./types";

const BAHAMUT_HOST = /(^|\.)gamer\.com\.tw$/i;

function assertBahamutUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Please paste a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  if (!BAHAMUT_HOST.test(url.hostname)) {
    throw new Error("Only Bahamut (gamer.com.tw) artwork links are supported.");
  }
  if (!url.pathname.includes("artwork.php") && !url.searchParams.get("sn")) {
    throw new Error("Use a Bahamut artwork link, e.g. artwork.php?sn=…");
  }
  return url;
}

export const fetchBahamutLyrics = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().min(8) }))
  .handler(async ({ data }): Promise<LyricsResult> => {
    const url = assertBahamutUrl(data.url);
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ja,zh-TW,en;q=0.8",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`Bahamut returned ${response.status}. Try again in a moment.`);
    }
    const html = await response.text();
    const { title, lines } = extractJapaneseLines(html);
    if (lines.length === 0) {
      throw new Error(
        "No Japanese lyric lines were found. This post may not use the usual 日 / 羅 / 中 layout.",
      );
    }
    const withRuby = await addFurigana(lines);
    return {
      sourceUrl: url.toString(),
      title,
      lines: withRuby,
    };
  });
