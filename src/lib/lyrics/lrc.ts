import type { LyricLine } from "./types.ts";

/** A parsed LRC line: lyric text plus its start/end seconds. */
export type TimedLyricLine = LyricLine & { start: number; end: number };

export type NeteaseSong = {
  id: number;
  name: string;
  artist: string;
};

export const LRC_TIME_RE = /\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;

// NetEase LRC files start with Chinese metadata rows (作词/作曲/编曲/…)
// which are credits, not lyrics — drop them so they never show or sync.
export const LRC_METADATA_RE =
  /^(?:作词|作曲|编曲|制作人|制作|录音|混音|监制|作詞|作曲|編曲|プロデューサー|プロデュース)\s*[:：]?/i;

// NetEase word-level ("逐字") LRC marks each word with an inline timestamp:
//   [00:12.340]<00:12.340>言葉<00:13.110>に<00:13.440>できない
const LRC_WORD_TIME_RE = /<(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;

/** Case/space/punctuation-insensitive key used to match songs and cache. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[「」『』（）()【】[\]・.。,，、\-–—:：'"“”!！?？]/g, "");
}

/**
 * Split a Uta-Net result title ("花火 - Guiano") back into song + artist so
 * the two can be sent to NetEase separately.
 */
export function splitTitle(title: string): { song: string; artist?: string } {
  const idx = title.lastIndexOf(" - ");
  if (idx > 0 && idx < title.length - 3) {
    return {
      song: title.slice(0, idx).trim(),
      artist: title.slice(idx + 3).trim(),
    };
  }
  return { song: title.trim(), artist: undefined };
}

/** Pick the NetEase result closest to the Uta-Net title/artist. */
export function pickNeteaseSong(
  songs: NeteaseSong[],
  title: string,
  artist?: string,
): NeteaseSong | null {
  if (songs.length === 0) return null;
  const songKey = normalizeForMatch(title);
  const artistKey = artist ? normalizeForMatch(artist) : "";
  let best: NeteaseSong = songs[0];
  let bestScore = -1;
  for (const song of songs) {
    const nameKey = normalizeForMatch(song.name);
    const songArtistKey = normalizeForMatch(song.artist);
    let score = 0;
    if (songKey && nameKey === songKey) score += 2;
    else if (songKey && (nameKey.includes(songKey) || songKey.includes(nameKey))) {
      score += 1;
    }
    if (artistKey && songArtistKey === artistKey) score += 2;
    else if (
      artistKey &&
      (songArtistKey.includes(artistKey) || artistKey.includes(songArtistKey))
    ) {
      score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = song;
    }
  }
  return best;
}

/**
 * Parse an LRC document into sorted, non-empty timed lines. Each line's
 * `end` defaults to the next line's start (the last line gets a short tail).
 * When the line carries NetEase word-level tags (`<mm:ss.xx>word`), each word
 * becomes its own token with a `start`/`end`, so the UI can highlight lyrics
 * word by word; plain lines stay a single untimed token.
 */
export function parseLrc(lrcText: string): TimedLyricLine[] {
  const lines: TimedLyricLine[] = [];
  for (const rawLine of lrcText.split(/\r?\n/)) {
    LRC_TIME_RE.lastIndex = 0;
    const matches = [...rawLine.matchAll(LRC_TIME_RE)];
    if (matches.length === 0) continue;
    const last = matches[matches.length - 1];
    const text = rawLine.slice((last.index ?? 0) + last[0].length).trim();
    if (!text || LRC_METADATA_RE.test(text)) continue;
    const words = parseWordTimings(text);
    const cleanText = words ? words.map((word) => word.text).join("") : text;
    for (const match of matches) {
      const start = Number(match[1]) * 60 + Number(match[2].replace(":", "."));
      lines.push(
        words
          ? {
              text: cleanText,
              tokens: words.map((word) => ({ text: word.text, start: word.start })),
              start,
              end: start,
            }
          : { text, tokens: [{ text }], start, end: start },
      );
    }
  }
  lines.sort((a, b) => a.start - b.start || a.text.localeCompare(b.text));
  for (let i = 0; i < lines.length; i++) {
    lines[i].end = lines[i + 1]?.start ?? lines[i].start + 4;
    if (lines[i].tokens.some((token) => token.start != null)) {
      // Close each word at the next word's start (the last word at line end).
      for (let j = 0; j < lines[i].tokens.length; j++) {
        const token = lines[i].tokens[j];
        if (token.start != null) {
          token.end = lines[i].tokens[j + 1]?.start ?? lines[i].end;
        }
      }
    }
  }
  return lines;
}

type WordTiming = { text: string; start: number };

/** Split NetEase word-level tags into (word, start) pairs, or null when the
 * line has no such tags. */
function parseWordTimings(text: string): WordTiming[] | null {
  LRC_WORD_TIME_RE.lastIndex = 0;
  const matches = [...text.matchAll(LRC_WORD_TIME_RE)];
  if (matches.length === 0) return null;
  const words: WordTiming[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const wordStart = (match.index ?? 0) + match[0].length;
    const wordEnd = matches[i + 1]?.index ?? text.length;
    const wordText = text.slice(wordStart, wordEnd).trim();
    if (!wordText) continue;
    words.push({
      text: wordText,
      start: Number(match[1]) * 60 + Number(match[2].replace(":", ".")),
    });
  }
  return words.length > 0 ? words : null;
}
