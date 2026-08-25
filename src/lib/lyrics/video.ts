import { fetchWithTimeout } from "./proxy.ts";
import { splitTitle } from "./lrc.ts";

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

/**
 * Labels that reliably point at a backing-track (vocal-free) upload on
 * YouTube, tried in order until one returns an embeddable video id. Piano
 * versions are included — they are one of the karaoke / backing-track variants.
 */
const KARAOKE_SUFFIXES = [
  "カラオケ",
  "off vocal",
  "オフボーカル",
  "instrumental",
  "伴奏",
  "ピアノ",
  "piano",
];

/** Lowercase + strip spaces/hyphens so "off vocal"/"off-vocal" match one marker. */
function normalizeSearch(text: string): string {
  return text.toLowerCase().replace(/[\s\-_]/g, "");
}

/** Convert "m:ss" or "h:mm:ss" (e.g. "4:41", "1:02:11") to seconds. */
function durationToSeconds(text: string): number | undefined {
  const parts = text.split(":").map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return undefined;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return seconds > 0 ? seconds : undefined;
}

/** Pull the video's duration out of a single videoRenderer chunk, in seconds. */
function parseDurationSeconds(chunk: string): number | undefined {
  const secs = chunk.match(/"lengthSeconds":"(\d+)"/)?.[1];
  if (secs !== undefined) {
    const n = Number(secs);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  const text = chunk.match(/"lengthText":\{.*?"simpleText":"([\d:]+)"/)?.[1];
  return text ? durationToSeconds(text) : undefined;
}

/**
 * YouTube search results render the initial result list as ytInitialData, so
 * every embeddable video id AND its title appear in the HTML (the title as
 * "title":{"runs":[{"text":"…"). Fetch the results page through the same reader
 * proxy the lyric/video fetches already use and pair each video id with its
 * title + duration — so we can pick a backing upload by name without extra
 * requests.
 */
async function fetchKaraokeResults(
  query: string,
): Promise<Array<{ videoId: string; title: string; duration?: number; owner?: string }>> {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(
      `https://r.jina.ai/${url}`,
      { headers: { "X-Return-Format": "html" } },
      VIDEO_FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return [];
    const text = await res.text();
    if (!text) return [];
    // YouTube renders each result as a "videoRenderer" object that contains its
    // own videoId AND title. Anchoring on that keeps id+title together — the raw
    // page repeats videoId far more often than title, so naive adjacency pairing
    // is unreliable.
    const results: Array<{ videoId: string; title: string; duration?: number; owner?: string }> = [];
    for (const chunk of text.split('"videoRenderer":{').slice(1)) {
      const videoId = chunk.match(/"videoId":"([A-Za-z0-9_-]{11})"/)?.[1];
      const title = chunk.match(/"title":\{"runs":\[\{"text":"([^"]*)"/)?.[1];
      const owner = chunk.match(/"ownerText":\{"runs":\[\{"text":"([^"]*)"/)?.[1];
      if (videoId && title)
        results.push({ videoId, title, duration: parseDurationSeconds(chunk), owner });
    }
    return results;
  } catch {
    return [];
  }
}

/** The kind of backing track a candidate is. */
export type KaraokeKind = "karaoke" | "off-vocal" | "instrumental" | "backing" | "piano";

/** A backing-track candidate found on YouTube, scored by confidence. */
export type KaraokeCandidate = {
  videoId: string;
  title: string;
  kind: KaraokeKind;
  /** Confidence that this is the right song's vocals-free version, 0–100. */
  score: number;
  /** Audio length in seconds (from the search result), if the page exposed it. */
  duration?: number;
  /** Uploader channel display name, e.g. "YOASOBI Official". */
  owner?: string;
  /** True when the uploader is the artist's own channel (official off-vocal). */
  official?: boolean;
};

/**
 * A backing upload counts as "official" when it is on the artist's own channel.
 * We detect that by requiring the (normalized) channel name to contain the
 * artist name — e.g. "YOASOBI Official" contains "yoasobi", "Ado" is exactly
 * the artist. A fan channel that merely borrows the artist's name is rejected
 * (e.g. "YOASOBIカラオケ部"). Official off-vocals often omit the artist from the
 * TITLE, relying on the channel, so this is also how we admit them.
 */
const OFFICIAL_BOOST = 35;
const OFFICIAL_EXCLUDE = [
  "カラオケ",
  "ニコカラ",
  "オフボーカル",
  "offvocal",
  "歌ってみた",
  "ハモリ",
  "cover",
];

function officialOwner(owner: string | undefined, artistNorm: string): boolean {
  if (!owner || !artistNorm) return false;
  const ownerNorm = normalizeSearch(owner);
  if (!ownerNorm.includes(artistNorm)) return false;
  return !OFFICIAL_EXCLUDE.some((marker) => ownerNorm.includes(marker));
}

const KARAOKE_CAND_CACHE_PREFIX = "jplyrics:karaoke-cands:v5:";
const KARAOKE_CAND_MAX = 8;

function readKaraokeCandidates(title: string): KaraokeCandidate[] | undefined {
  try {
    const key = `${KARAOKE_CAND_CACHE_PREFIX}${title}`;
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as { candidates?: KaraokeCandidate[]; fetchedAt?: number };
    if (!Array.isArray(entry.candidates)) return undefined;
    if (typeof entry.fetchedAt !== "number") return undefined;
    if (Date.now() - entry.fetchedAt > VIDEO_CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return undefined;
    }
    return entry.candidates;
  } catch {
    return undefined;
  }
}

function writeKaraokeCandidates(title: string, candidates: KaraokeCandidate[]): void {
  try {
    localStorage.setItem(
      `${KARAOKE_CAND_CACHE_PREFIX}${title}`,
      JSON.stringify({ candidates, fetchedAt: Date.now() }),
    );
  } catch {
    // storage unavailable / full — caching is best-effort
  }
}

function scoreKaraokeCandidate(
  title: string,
  songNorm: string,
  artistNorm: string,
): { kind: KaraokeKind; score: number } {
  const t = normalizeSearch(title);
  let score = 0;
  let kind: KaraokeKind;
  // A backing marker is the strongest signal that this is a vocals-free upload.
  if (t.includes("カラオケ")) {
    score += 45;
    kind = "karaoke";
  } else if (t.includes("オフボーカル") || t.includes("offvocal")) {
    score += 45;
    kind = "off-vocal";
  } else if (t.includes("instrumental") || t.includes("inst")) {
    score += 40;
    kind = "instrumental";
  } else if (t.includes("伴奏")) {
    score += 40;
    kind = "backing";
  } else if (t.includes("ピアノ") || t.includes("piano")) {
    score += 30;
    kind = "piano";
  } else {
    return { kind: "backing", score: 0 }; // not a backing track — exclude
  }
  if (songNorm && t.includes(songNorm)) score += 20; // right song → more confident
  if (artistNorm && t.includes(artistNorm)) score += 20; // right artist → more confident
  if (t.includes("歌ってみた")) score -= 45; // sung cover — has vocals
  if (t.includes("ハモリ")) score -= 30; // harmony track — has vocals
  if (t.includes("short") || t.includes("ショート")) score -= 8; // fragment only
  score = Math.max(0, Math.min(100, score));
  return { kind, score };
}

/** A human label for a confidence score. */
export function karaokeConfidence(score: number): "High" | "Medium" | "Low" {
  if (score >= 70) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

/**
 * Search YouTube for backing-track (karaoke / off-vocal / instrumental / piano)
 * uploads for a song, score each by confidence, and return them sorted (highest
 * confidence first). The song + artist are used together so a common title
 * isn't matched to another artist's version; candidates that aren't actually
 * backing tracks are dropped. The best of them is what the player auto-picks;
 * the full list is what the karaoke picker shows the user.
 */
export async function searchKaraokeCandidates(title: string): Promise<KaraokeCandidate[]> {
  const cached = readKaraokeCandidates(title);
  if (cached !== undefined) return cached;

  const { song, artist } = splitTitle(title);
  const songNorm = song ? normalizeSearch(song) : "";
  const artistNorm = artist ? normalizeSearch(artist) : "";
  const base = [song, artist].filter(Boolean).join(" ");

  // Query each suffix in sequence (parallel requests trip the reader proxy's
  // rate limit), collecting candidates until we have enough for the picker.
  const seen = new Set<string>();
  const candidates: KaraokeCandidate[] = [];
  for (const suffix of KARAOKE_SUFFIXES) {
    const results = await fetchKaraokeResults(`${base} ${suffix}`);
    for (const res of results) {
      if (seen.has(res.videoId)) continue;
      seen.add(res.videoId);
      const t = normalizeSearch(res.title);
      // Admission gate: it must be a real backing track (score > 0) AND be the
      // right song by the right artist. A common title like 花火 must not surface
      // another artist's version; a matching-but-vocal upload must not slip in.
      if (songNorm && !t.includes(songNorm)) continue; // wrong song
      // The artist may be named in the TITLE (fan uploads) or be the uploader's
      // CHANNEL (official off-vocals often omit it from the title). Either counts.
      const official = officialOwner(res.owner, artistNorm);
      const artistInTitle = !!(artistNorm && t.includes(artistNorm));
      if (artistNorm && !artistInTitle && !official) continue; // wrong artist
      const { kind, score: base } = scoreKaraokeCandidate(res.title, songNorm, artistNorm);
      if (base <= 0) continue; // no backing marker — original vocals
      // Official uploads (the artist's own channel) rank above fan/karaoke
      // channels, since they are the artist's released off-vocal.
      const score = Math.min(100, base + (official ? OFFICIAL_BOOST : 0));
      candidates.push({
        videoId: res.videoId,
        title: res.title,
        kind,
        score,
        duration: res.duration,
        owner: res.owner,
        official,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, KARAOKE_CAND_MAX);
  writeKaraokeCandidates(title, top);
  return top;
}

/**
 * Best-effort resolve of the single most-confident backing-track YouTube id for
 * a song title. Used by the player's Play button in karaoke mode and by the
 * "auto" path; the picker lets the user pick any of the ranked candidates
 * instead.
 */
export async function resolveKaraokeVideoId(title: string): Promise<string | null> {
  const candidates = await searchKaraokeCandidates(title);
  return candidates[0]?.videoId ?? null;
}
