import { fetchWithTimeout } from "./fetch";

const UTANET_SONG_PATH = /^\/song\/(\d+)/;
const VIDEO_FETCH_TIMEOUT_MS = 15_000;
const VIDEO_CACHE_PREFIX = "jplyrics:video:";
const VIDEO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type VideoCacheEntry = {
  videoId: string | null;
  fetchedAt: number;
};

function isSupportedUrl(url: URL): boolean {
  const utaNet =
    /(^|\.)uta-net\.com$/i.test(url.hostname) && UTANET_SONG_PATH.test(url.pathname);
  const bahamut =
    /(^|\.)gamer\.com\.tw$/i.test(url.hostname) &&
    (url.pathname.includes("artwork.php") || Boolean(url.searchParams.get("sn")));
  return utaNet || bahamut;
}

/**
 * Uta-Net song pages link to a /movie/{id}/ page that embeds the official
 * YouTube video; Bahamut artwork posts often embed YouTube videos in the
 * article body. r.jina.ai's HTML mode keeps those iframes intact (its
 * markdown mode strips them), and it is the same fast proxy the lyric fetch
 * already relies on, so video resolution needs no API key.
 */
export function extractVideoId(html: string): string | null {
  const match = html.match(
    /(?:youtube(?:-nocookie)?\.com\/embed\/|youtube\.com\/watch\?[^"'\s]*v=|youtu\.be\/)([\w-]{11})/i,
  );
  return match?.[1] ?? null;
}

function cacheKey(url: URL): string {
  return `${VIDEO_CACHE_PREFIX}${url.toString()}`;
}

function readCachedVideoId(url: URL): string | null | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(url));
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as VideoCacheEntry;
    if (entry.videoId !== null && typeof entry.videoId !== "string") return undefined;
    if (typeof entry.fetchedAt !== "number") return undefined;
    if (Date.now() - entry.fetchedAt > VIDEO_CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(url));
      return undefined;
    }
    return entry.videoId;
  } catch {
    return undefined;
  }
}

function writeVideoCache(url: URL, videoId: string | null): void {
  try {
    const entry: VideoCacheEntry = { videoId, fetchedAt: Date.now() };
    localStorage.setItem(cacheKey(url), JSON.stringify(entry));
  } catch {
    // storage unavailable / full — caching is best-effort
  }
}

async function fetchPageHtml(url: URL): Promise<string | null> {
  const utaNetId = UTANET_SONG_PATH.exec(url.pathname)?.[1];
  const target = utaNetId
    ? `https://www.uta-net.com/movie/${utaNetId}/`
    : url.toString();
  try {
    const res = await fetchWithTimeout(
      `https://r.jina.ai/${target}`,
      { headers: { "X-Return-Format": "html" } },
      VIDEO_FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim().startsWith("{")) return null;
    return text;
  } catch {
    return null;
  }
}

export async function resolveVideoId(sourceUrl: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (!isSupportedUrl(url)) return null;

  const cached = readCachedVideoId(url);
  if (cached !== undefined) return cached;

  const html = await fetchPageHtml(url);
  const videoId = html ? extractVideoId(html) : null;
  writeVideoCache(url, videoId);
  return videoId;
}

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
