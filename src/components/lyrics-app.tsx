import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  History,
  Loader2,
  Minus,
  Music2,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RubyAssistMode } from "@/components/lyrics-display";
import { LibraryDrawer, type LibraryView } from "@/components/song-history";
import { SongPlayer } from "@/components/song-player";
import type { SongPlayerHandle } from "@/components/song-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LyricsDisplay } from "@/components/lyrics-display";
import { fetchLyrics } from "@/lib/lyrics/fetch";
import { useSongFavorites } from "@/lib/lyrics/favorites";
import { useSongHistory } from "@/lib/lyrics/history";
import { fetchTimedLyrics } from "@/lib/lyrics/netease";
import type { TimedLyricLine } from "@/lib/lyrics/netease";
import { splitTitle } from "@/lib/lyrics/lrc";
import {
  searchKaraokeCandidates,
  type KaraokeCandidate,
  youtubeSearchUrl,
} from "@/lib/lyrics/video";
import { bindIme, setImeProtectedPrefix, unbindIme } from "@/lib/ime";
import {
  buildUtaNetLyricsSearchUrl,
  buildUtaNetSearchUrl,
  fetchArtistSongs,
  artistMatches,
  filterArtistSongsByTitle,
  pickArtist,
  searchUtaNetLyrics,
  searchUtaNetArtists,
  searchUtaNet,
  titleMatches,
  type UtaNetArtistResult,
  type UtaNetSearchResponse,
  type UtaNetSearchResult,
} from "@/lib/lyrics/search";
import type { LyricsResult } from "@/lib/lyrics/types";
import { cn } from "@/lib/utils";
import {
  fetchStemTimings,
  getStemStatus,
  isStemsServiceAvailable,
  requestStem,
  utaNetSongId,
  type StemInfo,
  type StemTimings,
} from "@/lib/stems";

const BAHAMUT_SAMPLE_URL = "https://home.gamer.com.tw/artwork.php?sn=6306141";
const UTANET_SAMPLE_URL = "https://www.uta-net.com/song/397348/";
const PAGE_SIZE = 10;

function pageWindow(page: number, total: number): Array<number | "…"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const candidates = new Set([1, total, page - 1, page, page + 1]);
  const sorted = [...candidates].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const pages: Array<number | "…"> = [];
  let previous = 0;
  for (const p of sorted) {
    if (p - previous > 1) pages.push("…");
    pages.push(p);
    previous = p;
  }
  return pages;
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Result pages">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
        className="flex size-8 items-center justify-center rounded-lg border border-border text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
      >
        ‹
      </button>
      {pageWindow(page, totalPages).map((p, index) =>
        p === "…" ? (
          <span key={`ellipsis-${index}`} className="px-1 text-subtle">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === page ? "page" : undefined}
            onClick={() => onChange(p)}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg border text-sm transition-colors",
              p === page
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted hover:text-foreground",
            )}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
        className="flex size-8 items-center justify-center rounded-lg border border-border text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
      >
        ›
      </button>
    </nav>
  );
}

function SongResultRow({
  result,
  favorite,
  onToggleFavorite,
  onOpen,
}: {
  result: UtaNetSearchResult;
  favorite: boolean;
  onToggleFavorite: (result: UtaNetSearchResult) => void;
  onOpen: (result: UtaNetSearchResult) => void;
}) {
  return (
    <li className="flex items-stretch rounded-xl border border-border bg-surface-2 transition-colors hover:border-foreground/20">
      <button
        type="button"
        onClick={() => onOpen(result)}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-l-xl px-3 py-2.5 text-left"
      >
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-foreground">{result.title}</span>
          {result.artist ? <span className="text-xs text-muted">{result.artist}</span> : null}
        </span>
        {result.firstLine ? (
          <span className="truncate text-xs text-muted">{result.firstLine}</span>
        ) : null}
      </button>
      <button
        type="button"
        aria-pressed={favorite}
        aria-label={
          favorite ? `Remove ${result.title} from favorites` : `Add ${result.title} to favorites`
        }
        onClick={() => onToggleFavorite(result)}
        className={cn(
          "flex shrink-0 items-center px-2 text-subtle transition-colors hover:text-foreground",
          favorite && "text-danger hover:text-danger",
        )}
      >
        <Heart className={cn("size-4", favorite && "fill-current")} />
      </button>
      <a
        href={result.songUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${result.title} on Uta-Net`}
        className="flex shrink-0 items-center px-3 text-subtle hover:text-foreground"
      >
        <ExternalLink className="size-4" />
      </a>
    </li>
  );
}

function dedupeResults(results: UtaNetSearchResult[]): UtaNetSearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.songUrl)) return false;
    seen.add(result.songUrl);
    return true;
  });
}

export function LyricsApp() {
  const [mode, setMode] = useState<"search" | "paste">("search");
  const [songQuery, setSongQuery] = useState("");
  const [artistQuery, setArtistQuery] = useState("");
  const [lyricsQuery, setLyricsQuery] = useState("");
  const [imeEnabled, setImeEnabled] = useState(true);
  const [searchKind, setSearchKind] = useState<"song" | "lyrics">("song");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<UtaNetSearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [songPage, setSongPage] = useState(1);
  const [artistPage, setArtistPage] = useState(1);
  const [artistResults, setArtistResults] = useState<UtaNetArtistResult[] | null>(null);
  const [artistSongs, setArtistSongs] = useState<{
    artistUrl: string;
    artist: string;
    songs: UtaNetSearchResult[];
  } | null>(null);
  const [artistLoading, setArtistLoading] = useState(false);
  const [artistError, setArtistError] = useState<string | null>(null);
  const [artistSongPage, setArtistSongPage] = useState(1);
  const songInputRef = useRef<HTMLInputElement>(null);
  const artistInputRef = useRef<HTMLInputElement>(null);
  const lyricsInputRef = useRef<HTMLInputElement>(null);
  const imeEnabledRef = useRef(imeEnabled);
  const [url, setUrl] = useState(UTANET_SAMPLE_URL);
  const [showFurigana, setShowFurigana] = useState(true);
  const [rubyAssistMode, setRubyAssistMode] = useState<RubyAssistMode>("hiragana");
  const [fontSizeRem, setFontSizeRem] = useState(1.35);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [timedLines, setTimedLines] = useState<TimedLyricLine[] | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "loading" | "ok" | "none">("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [lyricOffset, setLyricOffset] = useState(0);
  const [karaoke, setKaraoke] = useState(false);
  const [karaokeGenerating, setKaraokeGenerating] = useState(false);
  const [karaokeError, setKaraokeError] = useState<string | null>(null);
  const [karaokeCandidates, setKaraokeCandidates] = useState<KaraokeCandidate[] | null>(null);
  const [chosenKaraoke, setChosenKaraoke] = useState<KaraokeCandidate | null>(null);
  const [showKaraokePicker, setShowKaraokePicker] = useState(false);
  const timedRequestRef = useRef(0);
  const songPlayerRef = useRef<SongPlayerHandle>(null);
  const history = useSongHistory();
  const favorites = useSongFavorites();
  const [libraryView, setLibraryView] = useState<LibraryView | null>(null);
  // Auto-detected off-vocal stem (from the generator service) for the loaded song.
  const [stems, setStems] = useState<StemInfo | null>(null);
  // Word-level timings computed by the host (null = none yet).
  const [stemTimings, setStemTimings] = useState<StemTimings | null>(null);
  // Whether a stem service is configured (null = still checking).
  const [stemsAvailable, setStemsAvailable] = useState<boolean | null>(null);
  // Incremented on song change / re-trigger to invalidate in-flight polls.
  const stemRequestRef = useRef(0);
  // The lyric lines shown to the user (what the host aligns timestamps to).
  const lyricLinesRef = useRef<string[]>([]);

  const resultSource = result?.sourceUrl ?? null;
  const resultTitle = result?.title ?? "";

  useEffect(() => {
    lyricLinesRef.current = (
      timedLines && timedLines.length > 0 ? timedLines : (result?.lines ?? [])
    ).map((line) => line.text);
  }, [timedLines, result?.lines]);

  /** Check stem status; when `trigger`, POST to start generation if unknown. */
  const pollStem = useCallback(
    async (sourceUrl: string, trigger: boolean) => {
      const id = utaNetSongId(sourceUrl);
      if (!id) return;
      const reqId = ++stemRequestRef.current;
      const lines = lyricLinesRef.current;
      let st = await getStemStatus(id);
      if (trigger && st?.state === "unknown") st = await requestStem(sourceUrl);
      if (reqId !== stemRequestRef.current) return; // song changed / re-triggered
      // Auto-align: once the audio exists, ask the host to compute word
      // timestamps (skip when already aligned / aligning / failed).
      if (
        lines.length > 0 &&
        st &&
        (st.state === "ready" || st.state === "generating") &&
        st.timings !== "ready" &&
        st.timings !== "pending" &&
        st.timings !== "error"
      ) {
        st = await requestStem(sourceUrl, lines);
      }
      if (reqId !== stemRequestRef.current) return;
      if (st?.state === "ready") {
        setStems(st);
        if (lines.length > 0 && st.timings === "ready") {
          const timings = await fetchStemTimings(id);
          if (reqId === stemRequestRef.current && timings) setStemTimings(timings);
          return;
        }
        if (lines.length > 0 && st.timings === "pending") {
          setTimeout(() => {
            if (reqId === stemRequestRef.current) void pollStem(sourceUrl, false);
          }, 4000);
        }
        return;
      }
      if (st?.state === "generating") {
        setStems({ state: "generating" });
        setTimeout(() => {
          if (reqId === stemRequestRef.current) void pollStem(sourceUrl, false);
        }, 4000);
        return;
      }
      setStems(null);
    },
    [],
  );

  /** Manually start word-timestamp alignment for the current song. */
  const startAlignment = useCallback(() => {
    const sourceUrl = result?.sourceUrl ?? "";
    const id = utaNetSongId(sourceUrl);
    if (!id) return;
    const reqId = ++stemRequestRef.current;
    void (async () => {
      const st = await requestStem(sourceUrl, lyricLinesRef.current);
      if (reqId !== stemRequestRef.current) return;
      if (st?.state === "ready") {
        setStems(st);
        setTimeout(() => {
          if (reqId === stemRequestRef.current) void pollStem(sourceUrl, false);
        }, 4000);
      }
    })();
  }, [result?.sourceUrl, pollStem]);

  useEffect(() => {
    setStemsAvailable(null);
    let cancelled = false;
    void isStemsServiceAvailable().then((ok) => {
      if (!cancelled) setStemsAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [result?.sourceUrl]);

  // Check whether an off-vocal already exists / is already generating (e.g.
  // another tab started it). Generation itself only starts on user click.
  useEffect(() => {
    setStems(null);
    setStemTimings(null);
    const sourceUrl = result?.sourceUrl ?? "";
    if (!sourceUrl || !utaNetSongId(sourceUrl)) return;
    void pollStem(sourceUrl, false);
    return () => {
      stemRequestRef.current++; // invalidate any in-flight poll for the old song
    };
  }, [result?.sourceUrl, pollStem]);

  const setIme = useCallback((next: boolean) => {
    imeEnabledRef.current = next;
    if (songInputRef.current) setSongQuery(songInputRef.current.value);
    if (artistInputRef.current) setArtistQuery(artistInputRef.current.value);
    if (lyricsInputRef.current) setLyricsQuery(lyricsInputRef.current.value);
    if (next) {
      // Protect text typed before switching to Japanese input so it never
      // gets converted; only new romaji becomes kana.
      if (songInputRef.current) {
        setImeProtectedPrefix(songInputRef.current, songInputRef.current.value);
      }
      if (artistInputRef.current) {
        setImeProtectedPrefix(artistInputRef.current, artistInputRef.current.value);
      }
      if (lyricsInputRef.current) {
        setImeProtectedPrefix(lyricsInputRef.current, lyricsInputRef.current.value);
      }
    }
    setImeEnabled(next);
  }, []);

  const toggleIme = useCallback(() => {
    setIme(!imeEnabledRef.current);
  }, [setIme]);

  useEffect(() => {
    const els = [songInputRef.current, artistInputRef.current, lyricsInputRef.current].filter(
      (el): el is HTMLInputElement => el !== null,
    );
    if (imeEnabled) els.forEach((el) => bindIme(el));
    return () => els.forEach((el) => unbindIme(el));
  }, [imeEnabled, mode]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Ctrl+; (or Cmd+;) toggles between Japanese and English input.
      if ((event.ctrlKey || event.metaKey) && (event.key === ";" || event.key === ":")) {
        event.preventDefault();
        toggleIme();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleIme]);

  useEffect(() => {
    if (!libraryView) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLibraryView(null);
    }
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [libraryView]);

  const songTotalPages = searchResult
    ? Math.max(1, Math.ceil(searchResult.results.length / PAGE_SIZE))
    : 1;
  const visibleSongs = searchResult
    ? searchResult.results.slice((songPage - 1) * PAGE_SIZE, songPage * PAGE_SIZE)
    : [];
  const artistTotalPages = artistResults
    ? Math.max(1, Math.ceil(artistResults.length / PAGE_SIZE))
    : 1;
  const visibleArtists = artistResults
    ? artistResults.slice((artistPage - 1) * PAGE_SIZE, artistPage * PAGE_SIZE)
    : [];
  const artistSongTotalPages = artistSongs
    ? Math.max(1, Math.ceil(artistSongs.songs.length / PAGE_SIZE))
    : 1;
  const visibleArtistSongs = artistSongs
    ? artistSongs.songs.slice((artistSongPage - 1) * PAGE_SIZE, artistSongPage * PAGE_SIZE)
    : [];

  async function runFetch(target: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLyrics(target);
      setResult(data);
      history.add(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not fetch lyrics.";
      setError(message.replace(/^Error:\s*/, ""));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function runSearch() {
    const song = songInputRef.current?.value ?? songQuery;
    const artist = artistInputRef.current?.value ?? artistQuery;
    const lyrics = lyricsInputRef.current?.value ?? lyricsQuery;
    setSongQuery(song);
    setArtistQuery(artist);
    setLyricsQuery(lyrics);
    setSearching(true);
    setSearchError(null);
    setArtistSongs(null);
    try {
      if (lyrics.trim()) {
        await runLyricsSearch(lyrics, song, artist);
      } else if (artist.trim() && !song.trim()) {
        await runArtistOnlySearch(artist);
      } else if (artist.trim()) {
        await runCombinedSearch(song, artist);
      } else {
        await runSongOnlySearch(song);
      }
    } finally {
      setSearching(false);
    }
  }

  async function runSongOnlySearch(song: string) {
    try {
      const response = await searchUtaNet(song);
      setSearchResult(response);
      setSearchKind("song");
      setSongPage(1);
      setArtistResults(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not search Uta-Net.";
      setSearchError(message.replace(/^Error:\s*/, ""));
      setSearchResult(null);
      setArtistResults(null);
    }
  }

  async function runArtistOnlySearch(artist: string) {
    try {
      const response = await searchUtaNetArtists(artist);
      const chosen = pickArtist(response.results, artist);
      if (!chosen) {
        setSearchResult({ query: artist, results: [] });
        setArtistResults(response.results);
        setArtistPage(1);
        return;
      }
      await openArtistSongs(chosen);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not search Uta-Net.";
      setSearchError(message.replace(/^Error:\s*/, ""));
      setSearchResult(null);
      setArtistResults(null);
    }
  }

  async function runCombinedSearch(song: string, artist: string) {
    const [songsRes, artistsRes] = await Promise.allSettled([
      searchUtaNet(song),
      searchUtaNetArtists(artist),
    ]);
    const titleSongs = songsRes.status === "fulfilled" ? songsRes.value.results : [];
    const artists = artistsRes.status === "fulfilled" ? artistsRes.value.results : [];
    const chosen = pickArtist(artists, artist);
    let combined: UtaNetSearchResult[] = [];
    if (chosen) {
      try {
        const artistSongs = await fetchArtistSongs(chosen.artistUrl);
        combined = filterArtistSongsByTitle(artistSongs, titleSongs, song);
      } catch {
        // artist page unreachable — fall back to filtering the title search
      }
    }
    combined = dedupeResults([
      ...combined,
      ...titleSongs.filter((songResult) => artistMatches(songResult.artist, artist)),
    ]);

    setSearchResult({ query: song, results: combined });
    setSearchKind("song");
    setSongPage(1);
    setArtistResults(null);
    if (songsRes.status === "rejected" && artistsRes.status === "rejected") {
      const message =
        songsRes.reason instanceof Error ? songsRes.reason.message : "Could not search Uta-Net.";
      setSearchError(message.replace(/^Error:\s*/, ""));
    }
  }

  async function runLyricsSearch(lyrics: string, song: string, artist: string) {
    try {
      const response = await searchUtaNetLyrics(lyrics);
      let results = response.results;
      if (song.trim()) {
        results = results.filter((result) => titleMatches(result.title, song));
      }
      if (artist.trim()) {
        results = results.filter((result) => artistMatches(result.artist, artist));
      }
      setSearchResult({ query: response.query, results });
      setSearchKind("lyrics");
      setSongPage(1);
      setArtistResults(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not search Uta-Net.";
      setSearchError(message.replace(/^Error:\s*/, ""));
      setSearchResult(null);
      setArtistResults(null);
    }
  }

  async function openArtistSongs(artist: UtaNetArtistResult) {
    setArtistLoading(true);
    setArtistError(null);
    setArtistSongPage(1);
    setArtistSongs({ artistUrl: artist.artistUrl, artist: artist.name, songs: [] });
    try {
      const songs = await fetchArtistSongs(artist.artistUrl);
      setArtistSongs({ artistUrl: artist.artistUrl, artist: artist.name, songs });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load this artist's songs.";
      setArtistError(message.replace(/^Error:\s*/, ""));
    } finally {
      setArtistLoading(false);
    }
  }

  function openSearchResult(result: UtaNetSearchResult) {
    setUrl(result.songUrl);
    void runFetch(result.songUrl);
  }

  function openRecord(record: { sourceUrl: string }) {
    setUrl(record.sourceUrl);
    void runFetch(record.sourceUrl);
  }

  // When a Uta-Net song loads, try to resolve synced lyrics (LRC) from
  // NetEase. Fallback is the plain Uta-Net text already fetched above.
  useEffect(() => {
    if (!resultSource || !/uta-net\.com\/song\//i.test(resultSource)) {
      setTimedLines(null);
      setSyncStatus("idle");
      setCurrentTime(0);
      setLyricOffset(0);
      return;
    }
    const requestId = ++timedRequestRef.current;
    setTimedLines(null);
    setSyncStatus("loading");
    setCurrentTime(0);
    setLyricOffset(0);
    void fetchTimedLyrics(resultTitle).then((lines) => {
      if (requestId !== timedRequestRef.current) return;
      setTimedLines(lines);
      setSyncStatus(lines.length > 0 ? "ok" : "none");
    });
  }, [resultSource, resultTitle]);

  // A new song starts on the original vocal by default; karaoke is opted in
  // per song so a backing track isn't imposed on tracks that lack one.
  useEffect(() => {
    setKaraoke(false);
    setKaraokeError(null);
    setKaraokeCandidates(null);
    setChosenKaraoke(null);
    setShowKaraokePicker(false);
  }, [resultSource]);

  const handleTimeChange = useCallback((seconds: number) => {
    setCurrentTime(seconds);
  }, []);

  async function generateKaraoke() {
    if (!result || karaokeGenerating) return;
    setKaraokeError(null);
    setKaraokeGenerating(true);
    // Fetch every backing-track candidate ranked by confidence; let the user pick.
    const candidates = await searchKaraokeCandidates(result.title).catch(() => []);
    setKaraokeGenerating(false);
    setKaraokeCandidates(candidates);
    if (candidates.length === 0) {
      setKaraoke(false);
      setKaraokeError("找不到可用的卡拉OK／伴奏影片。");
    }
  }

  function pickKaraoke(candidate: KaraokeCandidate) {
    setKaraoke(true);
    setChosenKaraoke(candidate);
    setShowKaraokePicker(false);
    setKaraokeError(null);
    songPlayerRef.current?.playKaraokeVideo(candidate.videoId);
  }

  function backToVocals() {
    setKaraoke(false);
    // Keep the chosen version so the toggle can switch back seamlessly.
    setShowKaraokePicker(false);
    setKaraokeError(null);
    songPlayerRef.current?.play("vocal");
  }

  function backToKaraoke() {
    if (!chosenKaraoke) return;
    setKaraoke(true);
    setShowKaraokePicker(false);
    setKaraokeError(null);
    songPlayerRef.current?.playKaraokeVideo(chosenKaraoke.videoId);
  }

  // With synced lyrics, clicking a line jumps the song back to that line.
  const handleLyricLineClick = useCallback(
    (index: number) => {
      if (!timedLines || index < 0 || index >= timedLines.length) return;
      songPlayerRef.current?.seekTo(timedLines[index].start);
    },
    [timedLines],
  );

  // Binary-search the timed line that contains the current playback position
  // (with the user-adjustable offset applied).
  const activeIndex = useMemo(() => {
    if (syncStatus !== "ok" || !timedLines || timedLines.length === 0) return null;
    const t = currentTime + lyricOffset;
    if (t < timedLines[0].start) return -1;
    if (t >= timedLines[timedLines.length - 1].start) {
      return timedLines.length - 1;
    }
    let lo = 0;
    let hi = timedLines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (timedLines[mid].start <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }, [syncStatus, timedLines, currentTime, lyricOffset]);

  // Merge the host-computed word timings into the synced lyric tokens so the
  // UI can highlight each word as it is sung.
  const displayLines = useMemo(() => {
    if (!timedLines || timedLines.length === 0 || !stemTimings) {
      return timedLines && timedLines.length > 0 ? timedLines : (result?.lines ?? []);
    }
    const byIndex = new Map(stemTimings.lines.map((line) => [line.index, line]));
    let changed = false;
    const merged = timedLines.map((line, i) => {
      const t = byIndex.get(i);
      if (!t || t.text !== line.text || t.char_times.length !== line.text.length) {
        return line;
      }
      changed = true;
      let offset = 0;
      const tokens = line.tokens.map((token) => {
        const len = token.text.length;
        const start = t.char_times[offset] ?? line.start;
        const end = t.char_times[offset + Math.max(len - 1, 0)] ?? line.end;
        offset += len;
        return { ...token, start, end };
      });
      return { ...line, tokens };
    });
    return changed ? merged : timedLines;
  }, [timedLines, stemTimings, result?.lines]);
  // Before playback starts there is nothing to highlight; only dim lines once
  // the player actually reports a position.
  const displayActiveIndex = currentTime > 0 && activeIndex != null ? activeIndex : undefined;

  return (
    <div className="flex w-full flex-col gap-10">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setLibraryView("favorites")}
          aria-label="Open favorites"
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/20"
        >
          <Heart
            className={cn(
              "size-4",
              favorites.favorites.length > 0 ? "fill-current text-danger" : "text-muted",
            )}
            strokeWidth={1.75}
          />
          Favorites
          {favorites.favorites.length > 0 ? (
            <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">
              {favorites.favorites.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setLibraryView("history")}
          aria-label="Open history"
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/20"
        >
          <History className="size-4 text-muted" strokeWidth={1.75} />
          History
          {history.records.length > 0 ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {history.records.length}
            </span>
          ) : null}
        </button>
      </div>

      <div className="px-4 pb-10 sm:px-6 sm:pb-14 lg:px-8">
        <div className="flex min-w-0 flex-col gap-8 lg:mx-auto lg:w-[75%] lg:max-w-[67.5rem]">
          <header className="space-y-3 lg:text-center">
            <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
              歌詞ビューア
            </p>
            <h1 className="font-serif text-3xl font-medium tracking-tight text-balance text-foreground sm:text-4xl">
              Japanese Lyrics Viewer
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-pretty text-muted lg:mx-auto">
              Search Uta-Net for a song, or paste a Bahamut artwork / Uta-Net song link. The viewer
              keeps only the Japanese lines and places ruby readings above the lyrics.
            </p>
          </header>

          <div className="rounded-2xl border border-border bg-surface p-3 sm:p-3">
            <div
              role="tablist"
              aria-label="Load lyrics"
              className="mb-2 flex gap-1 border-b border-border pb-2"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "search"}
                onClick={() => setMode("search")}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                  mode === "search"
                    ? "bg-surface-2 text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Search className="size-4" strokeWidth={1.75} />
                Search Uta-Net
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "paste"}
                onClick={() => setMode("paste")}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                  mode === "paste"
                    ? "bg-surface-2 text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                Paste link
              </button>
            </div>

            {mode === "search" ? (
              <>
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runSearch();
                  }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                      <label className="sr-only" htmlFor="uta-search">
                        Song name
                      </label>
                      <Input
                        ref={songInputRef}
                        id="uta-search"
                        value={songQuery}
                        onChange={(e) => setSongQuery(e.target.value)}
                        placeholder="Song name"
                        maxLength={100}
                        className="border-0 bg-transparent shadow-none focus-visible:ring-0 sm:flex-1"
                      />
                      <label className="sr-only" htmlFor="uta-artist">
                        Artist name
                      </label>
                      <Input
                        ref={artistInputRef}
                        id="uta-artist"
                        value={artistQuery}
                        onChange={(e) => setArtistQuery(e.target.value)}
                        placeholder="Artist"
                        maxLength={100}
                        className="border-0 bg-transparent shadow-none focus-visible:ring-0 sm:flex-1"
                      />
                    </div>
                    <button
                      type="button"
                      aria-pressed={imeEnabled}
                      onClick={toggleIme}
                      title={
                        imeEnabled
                          ? "Japanese input on — romaji becomes kana as you type (Ctrl+;)"
                          : "Japanese input off — type English directly (Ctrl+;)"
                      }
                      aria-keyshortcuts="Control+;"
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                        imeEnabled
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-transparent text-muted hover:text-foreground",
                      )}
                    >
                      {imeEnabled ? "あ" : "A"}
                    </button>
                    <Button
                      type="submit"
                      disabled={
                        searching ||
                        (!songQuery.trim() && !artistQuery.trim() && !lyricsQuery.trim())
                      }
                      className="shrink-0"
                    >
                      {searching ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Searching
                        </>
                      ) : (
                        "Search"
                      )}
                    </Button>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <label className="sr-only" htmlFor="uta-lyrics">
                      Lyrics
                    </label>
                    <Input
                      ref={lyricsInputRef}
                      id="uta-lyrics"
                      value={lyricsQuery}
                      onChange={(e) => setLyricsQuery(e.target.value)}
                      placeholder="Lyrics"
                      maxLength={100}
                      className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
                    />
                  </div>
                </form>
                {searchError ? (
                  <div
                    role="alert"
                    className="mt-3 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
                  >
                    {searchError}
                  </div>
                ) : null}

                {artistSongs ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setArtistSongs(null)}
                        className="inline-flex min-h-9 items-center gap-1.5 text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
                      >
                        <ArrowLeft className="size-3.5" strokeWidth={1.75} />
                        Back to search results
                      </button>
                      <a
                        href={artistSongs.artistUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center gap-1.5 text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
                      >
                        <ExternalLink className="size-3.5" strokeWidth={1.75} />
                        Open artist page
                      </a>
                    </div>
                    <p className="text-xs tracking-wide text-muted">Songs by artist</p>
                    <h3 className="mb-3 text-sm font-medium text-foreground">
                      {artistSongs.artist}
                    </h3>
                    {artistLoading ? (
                      <p className="flex items-center gap-2 py-4 text-sm text-muted">
                        <Loader2 className="size-4 animate-spin" />
                        Loading songs…
                      </p>
                    ) : artistError ? (
                      <div
                        role="alert"
                        className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
                      >
                        {artistError}
                      </div>
                    ) : (
                      <>
                        <p className="mb-2 text-xs text-muted">{artistSongs.songs.length} songs</p>
                        <ul className="flex flex-col gap-2">
                          {visibleArtistSongs.map((song) => (
                            <SongResultRow
                              key={song.songUrl}
                              result={song}
                              favorite={favorites.isFavorite(song.songUrl)}
                              onToggleFavorite={(songResult) =>
                                favorites.toggle({
                                  sourceUrl: songResult.songUrl,
                                  title: songResult.title,
                                })
                              }
                              onOpen={openSearchResult}
                            />
                          ))}
                        </ul>
                        <Pagination
                          page={artistSongPage}
                          totalPages={artistSongTotalPages}
                          onChange={setArtistSongPage}
                        />
                      </>
                    )}
                  </div>
                ) : searchResult || artistResults ? (
                  <div className="mt-3 border-t border-border pt-3">
                    {searchResult ? (
                      <>
                        {searchResult.results.length === 0 ? (
                          <p className="text-sm leading-relaxed text-muted">
                            No songs found for “
                            {songQuery.trim() || artistQuery.trim() || lyricsQuery.trim()}” on
                            Uta-Net.
                          </p>
                        ) : (
                          <>
                            <p className="mb-2 text-xs text-muted">
                              {searchResult.results.length} songs
                            </p>
                            <ul className="flex flex-col gap-2">
                              {visibleSongs.map((result) => (
                                <SongResultRow
                                  key={result.songUrl}
                                  result={result}
                                  favorite={favorites.isFavorite(result.songUrl)}
                                  onToggleFavorite={(songResult) =>
                                    favorites.toggle({
                                      sourceUrl: songResult.songUrl,
                                      title: songResult.title,
                                    })
                                  }
                                  onOpen={openSearchResult}
                                />
                              ))}
                            </ul>
                            <Pagination
                              page={songPage}
                              totalPages={songTotalPages}
                              onChange={setSongPage}
                            />
                          </>
                        )}

                        {searchResult.results.length > 0 ? (
                          <a
                            href={
                              searchKind === "lyrics"
                                ? buildUtaNetLyricsSearchUrl(searchResult.query).toString()
                                : buildUtaNetSearchUrl(searchResult.query).toString()
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
                          >
                            <ExternalLink className="size-3.5" strokeWidth={1.75} />
                            View all results on Uta-Net
                          </a>
                        ) : null}
                      </>
                    ) : null}

                    {artistResults && artistResults.length > 0 ? (
                      <div className={cn(searchResult && "mt-4 border-t border-border pt-3")}>
                        <p className="text-xs tracking-wide text-muted">Artists</p>
                        <p className="mt-1 text-xs text-muted">{artistResults.length} artists</p>
                        <ul className="mt-2 flex flex-col gap-2">
                          {visibleArtists.map((artist) => (
                            <li
                              key={artist.artistUrl}
                              className="rounded-xl border border-border bg-surface-2 transition-colors hover:border-foreground/20"
                            >
                              <button
                                type="button"
                                onClick={() => void openArtistSongs(artist)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-medium text-foreground">
                                    {artist.name}
                                  </span>
                                  {artist.songCount != null ? (
                                    <span className="block text-xs text-muted">
                                      {artist.songCount} songs on Uta-Net
                                    </span>
                                  ) : null}
                                </span>
                                <ChevronRight className="size-4 shrink-0 text-subtle" />
                              </button>
                            </li>
                          ))}
                        </ul>
                        <Pagination
                          page={artistPage}
                          totalPages={artistTotalPages}
                          onChange={setArtistPage}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-center"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runFetch(url);
                }}
              >
                <label className="sr-only" htmlFor="lyrics-url">
                  Lyrics URL
                </label>
                <Input
                  id="lyrics-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.uta-net.com/song/… or https://home.gamer.com.tw/artwork.php?sn=…"
                  inputMode="url"
                  autoComplete="url"
                  className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <Button type="submit" disabled={loading || !url.trim()} className="shrink-0">
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Fetching
                    </>
                  ) : (
                    "Fetch lyrics"
                  )}
                </Button>
              </form>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-center">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                className="min-h-11 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => {
                  setUrl(UTANET_SAMPLE_URL);
                  void runFetch(UTANET_SAMPLE_URL);
                }}
                disabled={loading}
              >
                Try Uta-Net sample
              </button>
              <button
                type="button"
                className="min-h-11 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => {
                  setUrl(BAHAMUT_SAMPLE_URL);
                  void runFetch(BAHAMUT_SAMPLE_URL);
                }}
                disabled={loading}
              >
                Try Bahamut sample
              </button>
            </div>

            <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
              Lyrics size
              <input
                type="range"
                min={1.0}
                max={3.0}
                step={0.05}
                value={fontSizeRem}
                onChange={(e) => setFontSizeRem(Number(e.target.value))}
                className="w-40 accent-primary"
                aria-label="Lyrics font size"
              />
              <span className="w-12 text-right text-xs text-muted">{fontSizeRem.toFixed(1)}x</span>
            </label>

            <button
              type="button"
              role="switch"
              aria-checked={showFurigana}
              onClick={() => setShowFurigana((v) => !v)}
              className="flex min-h-11 items-center gap-3 text-sm text-foreground"
            >
              <span
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full border border-border transition-colors duration-150",
                  showFurigana ? "border-primary bg-primary" : "bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "block size-5 rounded-full bg-foreground shadow-sm transition-transform duration-150",
                    showFurigana ? "translate-x-[22px] bg-primary-foreground" : "translate-x-0.5",
                  )}
                />
              </span>
              Show ruby
            </button>

            {showFurigana ? (
              <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
                Katakana aid
                <select
                  value={rubyAssistMode}
                  onChange={(e) => setRubyAssistMode(e.target.value as RubyAssistMode)}
                  className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                >
                  <option value="furigana">Off</option>
                  <option value="hiragana">Hiragana</option>
                  <option value="romaji">Romaji</option>
                </select>
              </label>
            ) : null}
          </div>

          {result ? (
            <div className="space-y-2">
              <SongPlayer
                sourceUrl={result.sourceUrl}
                title={result.title}
                onTimeChange={handleTimeChange}
                karaoke={karaoke}
                onBackToVocals={backToVocals}
                onBackToKaraoke={backToKaraoke}
                onFindKaraoke={() => {
                  setShowKaraokePicker(true);
                  void generateKaraoke();
                }}
                karaokePickerOpen={showKaraokePicker}
                onKaraokePickerClose={() => setShowKaraokePicker(false)}
                karaokeCandidates={karaokeCandidates}
                karaokeBusy={karaokeGenerating}
                onPickKaraoke={pickKaraoke}
                chosenKaraokeTitle={chosenKaraoke?.title}
                stems={stems}
                onGenerateKaraoke={
                  utaNetSongId(result.sourceUrl) && stemsAvailable === true
                    ? () => void pollStem(result.sourceUrl, true)
                    : undefined
                }
                ref={songPlayerRef}
              />

              {stems?.state === "ready" && stems.timings === "pending" ? (
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Loader2 className="size-3.5 animate-spin" />
                  Aligning word timestamps…
                </p>
              ) : null}
              {stems?.state === "ready" &&
              stems.timings === "error" &&
              ((timedLines && timedLines.length > 0) || (result?.lines ?? []).length > 0) ? (
                <button
                  type="button"
                  onClick={startAlignment}
                  className="flex h-9 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-foreground transition-colors hover:bg-primary/20"
                  title="Align the lyric lines to the song audio with Whisper — takes about 1-2 minutes"
                >
                  <Sparkles className="size-3.5" />
                  Align word timestamps
                </button>
              ) : null}

              {karaokeError && !karaoke && !showKaraokePicker ? (
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-danger">
                  <span>{karaokeError}</span>
                  <a
                    href={youtubeSearchUrl(
                      `${(splitTitle(result.title).song || result.title).trim()} カラオケ`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    在 YouTube 搜尋 karaoke 版本
                  </a>
                </p>
              ) : null}
              {syncStatus === "loading" ? (
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading synced lyrics from NetEase…
                </p>
              ) : syncStatus === "ok" ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                    {stemTimings ? "Aligned word-by-word" : "Synced with NetEase timestamps"}
                  </span>
                  <div
                    className="flex flex-wrap items-center gap-2"
                    role="group"
                    aria-label="Lyric offset"
                  >
                    <span>Offset</span>
                    <button
                      type="button"
                      onClick={() =>
                        setLyricOffset((v) => Math.max(-5, Math.round((v - 0.25) * 100) / 100))
                      }
                      aria-label="Decrease lyric offset by 0.25 seconds"
                      className="flex size-7 items-center justify-center rounded-md border border-border text-muted transition-colors hover:text-foreground"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <input
                      type="range"
                      min={-5}
                      max={5}
                      step={0.25}
                      value={lyricOffset}
                      onChange={(e) => setLyricOffset(Number(e.target.value))}
                      className="w-32 accent-primary"
                      aria-label="Lyric time offset"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setLyricOffset((v) => Math.min(5, Math.round((v + 0.25) * 100) / 100))
                      }
                      aria-label="Increase lyric offset by 0.25 seconds"
                      className="flex size-7 items-center justify-center rounded-md border border-border text-muted transition-colors hover:text-foreground"
                    >
                      <Plus className="size-3.5" />
                    </button>
                    <span className="w-14 text-right tabular-nums">
                      {lyricOffset > 0 ? "+" : ""}
                      {lyricOffset.toFixed(2)}s
                    </span>
                  </div>
                </div>
              ) : syncStatus === "none" ? (
                <p className="text-xs text-muted">
                  No NetEase timestamps found — showing plain lyrics.
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              {error}
            </div>
          ) : null}

          <section className="min-h-72 rounded-[28px] border border-border bg-paper px-5 py-8 sm:px-10 sm:py-12">
            {loading ? (
              <div className="space-y-5" aria-busy="true" aria-live="polite">
                <p className="text-sm text-muted">Reading the page and adding readings…</p>
                {["w-5/6", "w-2/3", "w-4/5", "w-3/5", "w-3/4", "w-2/3", "w-5/6", "w-1/2"].map(
                  (width, i) => (
                    <div
                      key={i}
                      className={cn("h-5 animate-pulse rounded-md bg-surface-2", width)}
                    />
                  ),
                )}
              </div>
            ) : result ? (
              <div className="space-y-8">
                <div className="flex items-start justify-between gap-3 border-b border-border pb-5">
                  <div className="space-y-1">
                    <p className="text-xs tracking-wide text-muted">Japanese only</p>
                    <h2 className="font-serif text-lg leading-snug text-pretty text-foreground">
                      {result.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    aria-pressed={favorites.isFavorite(result.sourceUrl)}
                    aria-label={
                      favorites.isFavorite(result.sourceUrl)
                        ? `Remove ${result.title} from favorites`
                        : `Add ${result.title} to favorites`
                    }
                    onClick={() =>
                      favorites.toggle({ sourceUrl: result.sourceUrl, title: result.title })
                    }
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-subtle transition-colors hover:border-foreground/30 hover:text-foreground",
                      favorites.isFavorite(result.sourceUrl) &&
                        "border-danger/40 text-danger hover:text-danger",
                    )}
                  >
                    <Heart
                      className={cn(
                        "size-5",
                        favorites.isFavorite(result.sourceUrl) && "fill-current",
                      )}
                    />
                  </button>
                </div>
                <LyricsDisplay
                  lines={displayLines}
                  activeIndex={displayActiveIndex}
                  activeTime={
                    displayActiveIndex != null ? currentTime + lyricOffset : undefined
                  }
                  onLineClick={
                    syncStatus === "ok" && timedLines && timedLines.length > 0
                      ? handleLyricLineClick
                      : undefined
                  }
                  showFurigana={showFurigana}
                  rubyAssistMode={rubyAssistMode}
                  fontSizeRem={fontSizeRem}
                />
              </div>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                <Music2 className="size-8 text-subtle" strokeWidth={1.5} />
                <p className="max-w-sm text-sm leading-relaxed text-muted">
                  Lyrics will appear here with furigana over kanji and optional katakana aid in
                  hiragana or romaji.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {libraryView ? (
        <LibraryDrawer
          view={libraryView}
          favorites={favorites.favorites}
          records={history.records}
          activeUrl={result?.sourceUrl ?? null}
          onOpen={openRecord}
          onRemoveFavorite={favorites.remove}
          onRemove={history.remove}
          onClear={history.clear}
          onClose={() => setLibraryView(null)}
        />
      ) : null}
    </div>
  );
}
