import { addFurigana } from "./furigana.ts";
import {
  normalizeForMatch,
  parseLrc,
  pickNeteaseSong,
  splitTitle,
} from "./lrc.ts";
import type { NeteaseSong, TimedLyricLine } from "./lrc.ts";
import { fetchWithTimeout } from "./proxy.ts";

export type { NeteaseSong, TimedLyricLine } from "./lrc.ts";

const NETEASE_TIMEOUT_MS = 15_000;
// v3: word-level timestamps were added; bump so stale v2 caches re-fetch.
const CACHE_PREFIX = "jplyrics:netease:v3:";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // keep synced lyrics for a week

type CacheEntry = {
  lines: TimedLyricLine[];
  fetchedAt: number;
};

const JINA_PREFIX = "https://r.jina.ai/";
const NETEASE_SEARCH_URL = "https://music.163.com/api/search/get";
const NETEASE_LYRIC_URL = "https://music.163.com/api/song/lyric";

/**
 * r.jina.ai wraps the raw response in a small markdown preamble
 * (Title / URL Source / Markdown Content). Slice from the first `{` after
 * that header so the remaining text parses as JSON.
 */
function extractJsonFromJina(text: string): unknown {
  const marker = "Markdown Content:";
  const markerIndex = text.indexOf(marker);
  const start = markerIndex >= 0 ? markerIndex + marker.length : 0;
  const braceIndex = text.indexOf("{", start);
  if (braceIndex < 0) throw new Error("Unexpected NetEase proxy response.");
  return JSON.parse(text.slice(braceIndex)) as unknown;
}

async function fetchNeteaseJson(path: string): Promise<unknown> {
  const res = await fetchWithTimeout(
    `${JINA_PREFIX}${path}`,
    undefined,
    NETEASE_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`NetEase proxy returned ${res.status}.`);
  return extractJsonFromJina(await res.text());
}

/**
 * Search NetEase for songs by title (+ artist). The legacy `/api/search/get`
 * endpoint still returns plain JSON (the `/web` variant is encrypted now);
 * it is reachable from GitHub Pages through the same reader proxy the lyric
 * fetch already uses.
 */
export async function searchNeteaseSongs(query: string): Promise<NeteaseSong[]> {
  const params = new URLSearchParams({ s: query, type: "1", limit: "8" });
  const data = (await fetchNeteaseJson(
    `${NETEASE_SEARCH_URL}?${params.toString()}`,
  )) as {
    code?: number;
    result?: {
      songs?: Array<{
        id: number;
        name: string;
        artists?: Array<{ name: string }>;
      }>;
    };
  };
  if (data.code !== 200 || !Array.isArray(data.result?.songs)) return [];
  return data.result.songs
    .filter((song) => typeof song.id === "number")
    .map((song) => ({
      id: song.id,
      name: song.name,
      artist: song.artists?.[0]?.name ?? "",
    }));
}

/** Fetch the LRC text for a NetEase song id (null when the track has none). */
export async function fetchNeteaseLrc(songId: number): Promise<string | null> {
  const params = new URLSearchParams({
    id: String(songId),
    lv: "1",
    kv: "1",
    tv: "-1",
  });
  const data = (await fetchNeteaseJson(
    `${NETEASE_LYRIC_URL}?${params.toString()}`,
  )) as { code?: number; lrc?: { lyric?: string } };
  if (data.code !== 200) return null;
  const lyric = data.lrc?.lyric?.trim();
  return lyric || null;
}

function cacheKey(title: string): string {
  return `${CACHE_PREFIX}${normalizeForMatch(title)}`;
}

function readCache(key: string): TimedLyricLine[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(entry.lines) || typeof entry.fetchedAt !== "number") {
      return null;
    }
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.lines;
  } catch {
    return null;
  }
}

function writeCache(key: string, lines: TimedLyricLine[]): void {
  try {
    const entry: CacheEntry = { lines, fetchedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // storage unavailable / full — caching is best-effort
  }
}

/**
 * Resolve synced lyrics for a Uta-Net result title: split song + artist,
 * search NetEase, fetch the LRC, then add ruby readings. Never throws —
 * callers treat an empty array as "no synced lyrics available".
 */
export async function fetchTimedLyrics(title: string): Promise<TimedLyricLine[]> {
  const { song, artist } = splitTitle(title);
  if (!song) return [];
  const key = cacheKey(title);
  const cached = readCache(key);
  if (cached) return cached;

  let lines: TimedLyricLine[] = [];
  try {
    const query = artist ? `${song} ${artist}` : song;
    const songs = await searchNeteaseSongs(query);
    const picked = pickNeteaseSong(songs, song, artist);
    if (picked) {
      const lrc = await fetchNeteaseLrc(picked.id);
      if (lrc) {
        const parsed = parseLrc(lrc);
        if (parsed.length > 0) {
          lines = await withFurigana(parsed);
        }
      }
    }
  } catch {
    lines = [];
  }
  writeCache(key, lines);
  return lines;
}

/** Add ruby readings, preserving NetEase word-level timestamps when present. */
async function withFurigana(parsed: TimedLyricLine[]): Promise<TimedLyricLine[]> {
  const hasWordTimes = parsed.some((line) =>
    line.tokens.some((token) => token.start != null),
  );
  if (!hasWordTimes) {
    const withRuby = await addFurigana(parsed.map((line) => line.text)).catch(
      () => parsed.map((line) => ({ text: line.text, tokens: [{ text: line.text }] })),
    );
    return parsed.map((line, index) => ({
      ...withRuby[index],
      start: line.start,
      end: line.end,
    }));
  }
  // Word-level lyrics: annotate each timed word and carry its start/end onto
  // the furigana sub-tokens so playback can highlight word by word.
  const words = parsed.flatMap((line) => line.tokens.map((token) => token.text));
  const ruby = await addFurigana(words).catch(() => null);
  let wordIndex = 0;
  return parsed.map((line) => ({
    ...line,
    tokens: line.tokens.flatMap((token) => {
      const sub = ruby?.[wordIndex++]?.tokens ?? [{ text: token.text }];
      return sub.map((piece) => ({ ...piece, start: token.start, end: token.end }));
    }),
  }));
}
