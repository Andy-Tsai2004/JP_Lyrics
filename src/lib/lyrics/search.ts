import * as cheerio from "cheerio";
import { toHiragana, toRomaji } from "wanakana";
import { fetchMarkdown, fetchRawHtml } from "./proxy.ts";

export type UtaNetSearchResult = {
  title: string;
  artist: string;
  songUrl: string;
  firstLine?: string;
};

export type UtaNetSearchResponse = {
  query: string;
  results: UtaNetSearchResult[];
};

export type UtaNetArtistResult = {
  name: string;
  artistUrl: string;
  songCount?: number;
};

export type UtaNetArtistResponse = {
  query: string;
  results: UtaNetArtistResult[];
};

export type UtaNetLyricsResponse = {
  query: string;
  results: UtaNetSearchResult[];
};

const SEARCH_BASE = "https://www.uta-net.com/search/";
const UTANET_SONG_PATH = /\/song\/(\d+)\/?$/;
const LATIN_LETTERS = /[A-Za-z]/;
const IMAGE_MARKDOWN_RE = /!\[[^\]]*\]\([^)]*\)/g;
// Small kana at the start (or leftover latin) signals a romaji-to-kana
// conversion that was really an English word (e.g. "Lemon" -> ぇもん).
const SUSPICIOUS_KANA = /^[ぁぃぅぇぉゃゅょっ]|[A-Za-z]/;

/**
 * Candidate queries for a Uta-Net search. When the user types romaji (e.g.
 * "yoru ni kakeru"), it is converted to hiragana (よるにかける) so Uta-Net's
 * Japanese title search can match the reading. The original text is kept as
 * a fallback for English titles typed as-is (e.g. "Lemon"). When the
 * conversion looks like mangled English, the original text is tried first.
 */
export function searchQueryCandidates(query: string): string[] {
  const trimmed = query.trim();
  if (!LATIN_LETTERS.test(trimmed)) return [trimmed];
  const kana = toHiragana(trimmed.replace(/\s+/g, ""));
  const suspicious = SUSPICIOUS_KANA.test(kana);
  return suspicious
    ? [...new Set([trimmed, kana])]
    : [...new Set([kana, trimmed])];
}

/**
 * Build the Uta-Net song-title search URL (Aselect=2 searches 曲名,
 * sort=4 orders the results by 人気 / popularity).
 */
export function buildUtaNetSearchUrl(query: string): URL {
  const url = new URL(SEARCH_BASE);
  url.searchParams.set("Aselect", "2");
  url.searchParams.set("Keyword", query);
  url.searchParams.set("sort", "4");
  return url;
}

/**
 * Build the Uta-Net artist search URL (target=art searches 歌手名,
 * type=in does a partial match).
 */
export function buildUtaNetArtistSearchUrl(query: string): URL {
  const url = new URL(SEARCH_BASE);
  url.searchParams.set("target", "art");
  url.searchParams.set("type", "in");
  url.searchParams.set("Keyword", query);
  return url;
}

/**
 * Build the Uta-Net full-lyrics search URL (md=Kashi searches 歌詞全文,
 * st=Popular2 sorts the results by popularity, rc=20 results per page).
 */
export function buildUtaNetLyricsSearchUrl(query: string): URL {
  const url = new URL("https://www.uta-net.com/user/index_search/search2.html");
  url.searchParams.set("st", "Popular2");
  url.searchParams.set("ct", "");
  url.searchParams.set("rc", "20");
  url.searchParams.set("kw", query);
  url.searchParams.set("md", "Kashi");
  return url;
}

/** Case/space-insensitive comparison helper for title/artist filters. */
export function normalizeSearchText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "");
}

export function titleMatches(songTitle: string, query: string): boolean {
  const q = normalizeSearchText(query);
  return q.length > 0 && normalizeSearchText(songTitle).includes(q);
}

export function artistMatches(songArtist: string, query: string): boolean {
  const q = normalizeSearchText(query);
  return q.length > 0 && normalizeSearchText(songArtist).includes(q);
}

/**
 * Keep songs from an artist page that match the song query. Uta-Net's song
 * search matches readings (はなび -> 花火), so any title present in the song
 * search results is treated as a match in addition to a literal title match.
 */
export function filterArtistSongsByTitle(
  artistSongs: UtaNetSearchResult[],
  titleSongs: UtaNetSearchResult[],
  songQuery: string,
): UtaNetSearchResult[] {
  const titleSet = new Set(titleSongs.map((song) => normalizeSearchText(song.title)));
  return artistSongs.filter(
    (song) =>
      titleSet.has(normalizeSearchText(song.title)) ||
      titleMatches(song.title, songQuery),
  );
}

/** Pick the best artist result for a query: exact name first, else the first. */
export function pickArtist(
  artists: UtaNetArtistResult[],
  query: string,
): UtaNetArtistResult | null {
  if (artists.length === 0) return null;
  const q = normalizeSearchText(query);
  return artists.find((artist) => normalizeSearchText(artist.name) === q) ?? artists[0];
}

function firstLineOf(rowCells: string[]): string | undefined {
  const firstLine = (rowCells[6] ?? "").trim();
  return firstLine || undefined;
}

const SONG_LINK_RE =
  /\[([^\]]+)\]\((https:\/\/www\.uta-net\.com\/song\/\d+\/?)\)/;

function makeResult(
  titleText: string,
  artist: string,
  songUrl: string,
  firstLine?: string,
): UtaNetSearchResult | null {
  let title = titleText.trim();
  const artistName = artist.trim();
  if (artistName && title.endsWith(artistName)) {
    title = title.slice(0, -artistName.length).trim();
  }
  if (!title) return null;
  return { title, artist: artistName, songUrl, firstLine: firstLine || undefined };
}

/**
 * Parse the reader proxy's markdown table of search results.
 * Rows look like:
 * | [曲名 歌手名](https://www.uta-net.com/song/12345/) | [歌手名](…) | … | 歌い出し |
 *
 * Some pages render without the table: each result is one line of
 * concatenated links followed by the first lyric line, e.g.
 * [曲名 歌手名](…song…) [歌手名](…artist…) …歌い出し
 */
export function extractUtaNetSearchFromMarkdown(
  markdown: string,
): UtaNetSearchResult[] {
  const results: UtaNetSearchResult[] = [];
  // Uta-Net decorates popular songs with an inline crown image inside the
  // title link (e.g. はいよろこんで![Image: MILLION LYLIC](…)). Strip image
  // markdown first so the link text parses as a plain song title.
  const clean = markdown.replace(IMAGE_MARKDOWN_RE, "");

  for (const line of clean.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    const titleMatch = cells[1]?.match(SONG_LINK_RE);
    if (!titleMatch) continue;

    const artist = cells[2]?.match(/\[([^\]]*)\]/)?.[1]?.trim() ?? "";
    const result = makeResult(titleMatch[1], artist, titleMatch[2], firstLineOf(cells));
    if (result) results.push(result);
  }

  // Single-line format: repeated `[title artist](song) [artist](artist) …`
  // with the first lyric line after the links on the same line.
  const singleRe =
    /\[([^\]]+)\]\((https:\/\/www\.uta-net\.com\/song\/\d+\/?)\)\[([^\]]*)\]\(https:\/\/www\.uta-net\.com\/artist\/\d+\/?\)\[[^\]]*\]\(https:\/\/www\.uta-net\.com\/lyricist\/\d+\/?\)\[[^\]]*\]\(https:\/\/www\.uta-net\.com\/composer\/\d+\/?\)\[[^\]]*\]\(https:\/\/www\.uta-net\.com\/arranger\/\d+\/?\)/g;
  for (const line of clean.split("\n")) {
    if (line.trim().startsWith("|")) continue;
    singleRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = singleRe.exec(line)) !== null) {
      const tail = line.slice(match.index + match[0].length);
      const nextSong = tail.search(/\[[^\]]*\]\(https:\/\/www\.uta-net\.com\/song\/\d+/);
      const firstLine = (nextSong >= 0 ? tail.slice(0, nextSong) : tail).trim();
      const result = makeResult(match[1], match[3], match[2], firstLine || undefined);
      if (result) results.push(result);
    }
  }

  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.songUrl)) return false;
    seen.add(result.songUrl);
    return true;
  });
}

/**
 * Parse song rows from a raw Uta-Net page. Rows live in
 * `tbody.songlist-table-body`; the song title sits in a `.songlist-title`
 * span, the artist in the first `.sp-none` cell, and the first lyric line in
 * a `.pc-utaidashi` span. This works for both search pages and artist pages.
 */
function extractSongRowsFromHtml(html: string): UtaNetSearchResult[] {
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

export function extractUtaNetSearchFromHtml(html: string): UtaNetSearchResult[] {
  return extractSongRowsFromHtml(html);
}

/** An artist page's song list uses the same row structure as search results. */
export function extractUtaNetArtistSongs(html: string): UtaNetSearchResult[] {
  return extractSongRowsFromHtml(html);
}

/**
 * Parse artist results from a raw Uta-Net artist search page. Each row has
 * the artist name in a `.fw-bold` span and the song count in a
 * `.song-count` span.
 */
export function extractUtaNetArtistsFromHtml(
  html: string,
): UtaNetArtistResult[] {
  const $ = cheerio.load(html);
  const results: UtaNetArtistResult[] = [];

  $("tbody.songlist-table-body tr").each((_, el) => {
    const $tr = $(el);
    const href = $tr.find('a[href*="/artist/"]').first().attr("href");
    if (!href || !/\/artist\/\d+\/?$/.test(href)) return;

    const countText = $tr.find("span.song-count").first().text();
    if (!countText) return; // ranking rows share the same table class
    const name = $tr.find("span.fw-bold").first().text().trim();
    if (!name) return;

    const countMatch = countText.match(/(\d+)/);
    results.push({
      name,
      artistUrl: new URL(href, "https://www.uta-net.com").toString(),
      songCount: countMatch ? Number(countMatch[1]) : undefined,
    });
  });

  return results;
}

/**
 * Parse artist results from markdown, e.g.
 * [Guiano 歌詞：51](https://www.uta-net.com/artist/28756/)
 */
export function extractUtaNetArtistsFromMarkdown(
  markdown: string,
): UtaNetArtistResult[] {
  const results: UtaNetArtistResult[] = [];
  const clean = markdown.replace(IMAGE_MARKDOWN_RE, "");
  const artistRe =
    /\[([^\]]+?)\s*歌詞：(\d+)\]\((https:\/\/www\.uta-net\.com\/artist\/\d+\/?)\)/g;
  for (const match of clean.matchAll(artistRe)) {
    results.push({
      name: match[1].trim(),
      songCount: Number(match[2]),
      artistUrl: match[3],
    });
  }
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.artistUrl)) return false;
    seen.add(result.artistUrl);
    return true;
  });
}

/**
 * Parse full-lyrics search results. Uta-Net renders them as a definition
 * list: each `<dt>` holds the song title + artist, and the following `<dd>`
 * holds a lyric fragment with the keyword highlighted.
 */
export function extractUtaNetLyricsFromHtml(html: string): UtaNetSearchResult[] {
  const $ = cheerio.load(html);
  const results: UtaNetSearchResult[] = [];

  $("dl#search_list > dt").each((_, el) => {
    const $dt = $(el);
    const $titleLink = $dt.find('a[href*="/song/"]').first();
    const href = $titleLink.attr("href");
    if (!href || !UTANET_SONG_PATH.test(href)) return;

    const title = $titleLink.text().trim();
    if (!title) return;

    const artist = $dt.find('a[href*="md=Artist"]').first().text().trim();
    const firstLine = $dt
      .next("dd")
      .find("p")
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
 * fetcher uses. Raw HTML is preferred because Uta-Net renders popularity-sorted
 * results across two tables and the reader proxy's markdown drops the first
 * one. Returns an empty result list when Uta-Net responds but has no matches.
 */
export async function searchUtaNet(
  query: string,
): Promise<UtaNetSearchResponse> {
  const candidates = searchQueryCandidates(query);
  if (candidates.length === 0 || !candidates[0]) {
    throw new Error("Enter a song title to search Uta-Net.");
  }

  let reached = false;

  for (const [index, keyword] of candidates.entries()) {
    const url = buildUtaNetSearchUrl(keyword);
    const last = index === candidates.length - 1;

    const html = await fetchRawHtml(url);
    if (html) {
      reached = true;
      const results = extractUtaNetSearchFromHtml(html);
      if (results.length > 0) return { query: keyword, results };
      if (!last) continue; // no matches — try the next query form
    }

    const markdown = await fetchMarkdown(url);
    if (markdown) {
      reached = true;
      const results = extractUtaNetSearchFromMarkdown(markdown);
      if (results.length > 0) return { query: keyword, results };
    }
  }

  if (reached) return { query: candidates[0], results: [] };
  throw new Error(
    "Could not reach Uta-Net search right now. The public proxy may be blocked or busy — please try again in a moment.",
  );
}

/**
 * Search Uta-Net for artists by name. The live IME may have already converted
 * a romaji artist name to kana (ぐいあの), so both the original text and its
 * romaji reading are tried (guiano); kanji names stay as-is.
 */
export async function searchUtaNetArtists(
  query: string,
): Promise<UtaNetArtistResponse> {
  const keyword = query.trim();
  if (!keyword) throw new Error("Enter an artist name to search Uta-Net.");
  const candidates = [...new Set([keyword, toRomaji(keyword)])];

  for (const [index, candidate] of candidates.entries()) {
    const url = buildUtaNetArtistSearchUrl(candidate);
    const last = index === candidates.length - 1;

    const html = await fetchRawHtml(url);
    if (html) {
      const results = extractUtaNetArtistsFromHtml(html);
      if (results.length > 0) return { query: candidate, results };
      if (!last) continue;
    }

    const markdown = await fetchMarkdown(url);
    if (markdown) {
      const results = extractUtaNetArtistsFromMarkdown(markdown);
      if (results.length > 0) return { query: candidate, results };
    }
  }

  return { query: keyword, results: [] };
}

/**
 * Search Uta-Net's full lyrics (歌詞) index for a phrase, sorted by
 * popularity.
 */
export async function searchUtaNetLyrics(
  query: string,
): Promise<UtaNetLyricsResponse> {
  const keyword = query.trim();
  if (!keyword) throw new Error("Enter lyrics to search Uta-Net.");
  const url = buildUtaNetLyricsSearchUrl(keyword);

  const html = await fetchRawHtml(url);
  if (html) {
    const results = extractUtaNetLyricsFromHtml(html);
    if (results.length > 0) return { query: keyword, results };
  }

  const markdown = await fetchMarkdown(url);
  if (markdown) {
    const results = extractUtaNetSearchFromMarkdown(markdown);
    if (results.length > 0) return { query: keyword, results };
  }

  return { query: keyword, results: [] };
}

/**
 * Load an artist's song list from their Uta-Net artist page, ordered by
 * popularity (/artist/{id}/4/).
 */
export async function fetchArtistSongs(
  artistUrl: string,
): Promise<UtaNetSearchResult[]> {
  let url: URL;
  try {
    url = new URL(artistUrl);
  } catch {
    throw new Error("Invalid artist link.");
  }
  if (!/^\/artist\/\d+\/?$/.test(url.pathname)) {
    throw new Error("Only Uta-Net artist pages are supported.");
  }
  url = new URL(`${url.origin}/artist/${/\/artist\/(\d+)/.exec(url.pathname)?.[1]}/4/`);

  const html = await fetchRawHtml(url);
  if (html) {
    const results = extractUtaNetArtistSongs(html);
    if (results.length > 0) return results;
  }

  const markdown = await fetchMarkdown(url);
  if (markdown) {
    const results = extractUtaNetSearchFromMarkdown(markdown);
    if (results.length > 0) return results;
  }

  throw new Error(
    "Could not load this artist's songs right now. The public proxy may be blocked or busy — please try again in a moment.",
  );
}
