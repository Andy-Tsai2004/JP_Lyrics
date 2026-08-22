import * as cheerio from "cheerio";
import { fetchMarkdown, fetchRawHtml } from "./proxy.ts";

export type UtaNetSearchResult = {
  title: string;
  artist: string;
  songUrl: string;
  firstLine?: string;
};

const SEARCH_BASE = "https://www.uta-net.com/search/";
const UTANET_SONG_PATH = /\/song\/(\d+)\/?$/;

/**
 * Build the Uta-Net song-title search URL (Aselect=2 searches 曲名).
 */
export function buildUtaNetSearchUrl(query: string): URL {
  const url = new URL(SEARCH_BASE);
  url.searchParams.set("Aselect", "2");
  url.searchParams.set("Keyword", query);
  return url;
}

function firstLineOf(rowCells: string[]): string | undefined {
  const firstLine = (rowCells[6] ?? "").trim();
  return firstLine || undefined;
}

/**
 * Parse the reader proxy's markdown table of search results.
 * Rows look like:
 * | [曲名 歌手名](https://www.uta-net.com/song/12345/) | [歌手名](…) | … | 歌い出し |
 */
export function extractUtaNetSearchFromMarkdown(
  markdown: string,
): UtaNetSearchResult[] {
  const results: UtaNetSearchResult[] = [];

  for (const line of markdown.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    const titleMatch = cells[1]?.match(
      /\[([^\]]*)\]\((https:\/\/www\.uta-net\.com\/song\/\d+\/?)\)/,
    );
    if (!titleMatch) continue;

    const artist =
      cells[2]?.match(/\[([^\]]*)\]/)?.[1]?.trim() ?? "";
    let title = titleMatch[1].trim();
    if (artist && title.endsWith(artist)) {
      title = title.slice(0, -artist.length).trim();
    }
    if (!title) continue;

    results.push({
      title,
      artist,
      songUrl: titleMatch[2],
      firstLine: firstLineOf(cells),
    });
  }

  return results;
}

/**
 * Parse the raw Uta-Net search page. Rows live in
 * `tbody.songlist-table-body`; the song title sits in a `.songlist-title`
 * span, the artist in the first `.sp-none` cell, and the first lyric line in
 * a `.pc-utaidashi` span.
 */
export function extractUtaNetSearchFromHtml(
  html: string,
): UtaNetSearchResult[] {
  const $ = cheerio.load(html);
  const results: UtaNetSearchResult[] = [];

  $("tbody.songlist-table-body tr").each((_, el) => {
    const $tr = $(el);
    const href = $tr.find('a[href*="/song/"]').first().attr("href");
    if (!href || !UTANET_SONG_PATH.test(href)) return;

    const title = $tr.find(".songlist-title").first().text().trim();
    if (!title) return;

    const artist = $tr.find("td.sp-none a").first().text().trim();
    const firstLine = $tr
      .find(".pc-utaidashi")
      .first()
      .text()
      .replace(/\u00a0/g, " ")
      .trim();

    results.push({
      title,
      artist,
      songUrl: new URL(href, "https://www.uta-net.com").toString(),
      firstLine: firstLine || undefined,
    });
  });

  return results;
}

/**
 * Search Uta-Net for a song by title. GitHub Pages is static-only, so the
 * search page is fetched through the same public CORS proxies the lyric
 * fetcher uses. Returns an empty array when Uta-Net responds but has no
 * matching songs.
 */
export async function searchUtaNet(
  query: string,
): Promise<UtaNetSearchResult[]> {
  const keyword = query.trim();
  if (!keyword) {
    throw new Error("Enter a song title to search Uta-Net.");
  }
  const url = buildUtaNetSearchUrl(keyword);

  let reached = false;

  const markdown = await fetchMarkdown(url);
  if (markdown) {
    reached = true;
    const results = extractUtaNetSearchFromMarkdown(markdown);
    if (results.length > 0) return results;
  }

  const html = await fetchRawHtml(url);
  if (html) {
    reached = true;
    const results = extractUtaNetSearchFromHtml(html);
    if (results.length > 0) return results;
  }

  if (reached) return [];
  throw new Error(
    "Could not reach Uta-Net search right now. The public proxy may be blocked or busy — please try again in a moment.",
  );
}
