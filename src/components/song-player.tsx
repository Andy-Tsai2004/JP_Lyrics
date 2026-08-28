import {
  Loader2,
  Mic,
  Music2,
  Pause,
  Play,
  Sparkles,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { splitTitle } from "@/lib/lyrics/lrc";
import {
  karaokeConfidence,
  resolveKaraokeVideoId,
  resolveVideoId,
  youtubeSearchUrl,
  type KaraokeCandidate,
} from "@/lib/lyrics/video";
import type { StemInfo } from "@/lib/stems";
import { useI18n } from "@/lib/i18n";

const PLAYER_ELEMENT_ID = "jplyrics-youtube-player";

type PlayerStatus = "idle" | "resolving" | "loading" | "playing" | "paused" | "ended" | "error";

export type SongPlayerHandle = {
  /**
   * Seek to an absolute position in seconds. With a loaded player it also
   * resumes playback; before the player exists it only remembers the
   * position, which is applied when the user presses Play.
   */
  seekTo: (seconds: number) => void;
  /**
   * Resolve and play the song, optionally forcing the karaoke / off-vocal
   * variant. Used by the "Generate karaoke" control so it can swap the
   * backing track on demand (and back to the original vocals).
   */
  play: (variant: "vocal" | "karaoke") => void;
  /** Play a specific backing-track video id the user chose from the picker. */
  playKaraokeVideo: (videoId: string) => void;
};

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (videoId: string) => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
};

type YTPlayerOptions = {
  videoId?: string;
  host?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: () => void;
  };
};

declare global {
  interface Window {
    YT?: { Player: new (elementId: string, options: YTPlayerOptions) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<NonNullable<Window["YT"]>> | null = null;

function loadYouTubeApi(): Promise<NonNullable<Window["YT"]>> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("YouTube script failed to load."));
    };
    document.head.appendChild(script);
    window.setTimeout(() => {
      apiPromise = null;
      reject(new Error("YouTube player load timed out."));
    }, 20_000);
  });
  return apiPromise;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const KARAOKE_KIND_LABEL: Record<KaraokeCandidate["kind"], string> = {
  karaoke: "カラオケ",
  "off-vocal": "オフボーカル",
  instrumental: "インスト",
  backing: "伴奏",
  piano: "ピアノ",
};

/** Format a duration in seconds as "m:ss" (or "h:mm:ss" for >= 1 hour). */
function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SongPlayer({
  sourceUrl,
  title,
  onTimeChange,
  karaoke = false,
  onBackToVocals,
  onBackToKaraoke,
  onFindKaraoke,
  karaokePickerOpen = false,
  onKaraokePickerClose,
  karaokeCandidates = null,
  karaokeBusy = false,
  onPickKaraoke,
  chosenKaraokeTitle,
  stems = null,
  onGenerateKaraoke,
  ref,
}: {
  sourceUrl: string;
  title: string;
  /** Reports the current playback position in seconds as it changes. */
  onTimeChange?: (seconds: number) => void;
  /** When true, resolve and play a karaoke / off-vocal video instead of the official one. */
  karaoke?: boolean;
  /** Switch from karaoke back to the original vocal. */
  onBackToVocals?: () => void;
  /** Switch from the original vocal back to the chosen karaoke version. */
  onBackToKaraoke?: () => void;
  /** Open the karaoke-version picker to browse / change versions. */
  onFindKaraoke?: () => void;
  /** Whether the karaoke-version dropdown is open. */
  karaokePickerOpen?: boolean;
  /** Close the karaoke-version dropdown. */
  onKaraokePickerClose?: () => void;
  /** Ranked backing-track candidates to show in the dropdown. */
  karaokeCandidates?: KaraokeCandidate[] | null;
  /** True while karaoke candidates are being searched. */
  karaokeBusy?: boolean;
  /** Pick a candidate as the active backing track. */
  onPickKaraoke?: (candidate: KaraokeCandidate) => void;
  /** Title of the currently-selected backing track. */
  chosenKaraokeTitle?: string;
  /** An auto-generated off-vocal stem served by the generator service. */
  stems?: StemInfo | null;
  /** When provided (and no stem is ready), the user can start generation. */
  onGenerateKaraoke?: () => void;
  ref?: Ref<SongPlayerHandle>;
}) {
  const { t } = useI18n();
  const playerRef = useRef<YTPlayer | null>(null);
  const sourceRef = useRef(sourceUrl);
  const karaokeRef = useRef(karaoke);
  const statusRef = useRef<PlayerStatus>("idle");
  const creatingRef = useRef(false);
  // Cached resolved video ids so switching between vocal / karaoke is instant.
  const videoIdRef = useRef<{ vocal?: string; karaoke?: string }>({});
  // Always-fresh reference to playCurrent for the imperative handle.
  const playCurrentRef = useRef<() => void>(() => {});
  const tickTimer = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const onTimeChangeRef = useRef(onTimeChange);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);

  // The generated off-vocal stem plays from a page-owned <audio> element (the
  // YouTube embed's audio is unreachable by the page).
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // Auto-generated stem: the full mix + off-vocal files we swap between at
  // the same timestamp (karaoke plays off-vocal by default, vocals optional).
  const [stemFiles, setStemFiles] = useState<{ full: string; vocals: string } | null>(null);
  const [stemActive, setStemActive] = useState(false);
  const [vocalOn, setVocalOn] = useState(false);
  const audioMode = stemActive;
  const audioModeRef = useRef(audioMode);
  audioModeRef.current = audioMode;

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const stopTick = useCallback(() => {
    if (tickTimer.current !== null) {
      window.clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    tickTimer.current = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const time = player.getCurrentTime() || 0;
      setCurrent(time);
      onTimeChangeRef.current?.(time);
      const total = player.getDuration();
      if (total > 0) setDuration(total);
    }, 250);
  }, [stopTick]);

  const reset = useCallback(() => {
    stopTick();
    playerRef.current?.destroy();
    playerRef.current = null;
    videoIdRef.current = { vocal: undefined, karaoke: undefined };
    pendingSeekRef.current = null;
    statusRef.current = "idle";
    setStatus("idle");
    setCurrent(0);
    setDuration(0);
    setError(null);
    // Stop any page-owned <audio> (auto stem or manual upload) too — the
    // previous song must not keep playing while the next one loads/generates.
    const a = audioElRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    setStemFiles(null);
    setStemActive(false);
    setVocalOn(false);
  }, [stopTick]);

  useEffect(() => {
    karaokeRef.current = karaoke;
  }, [karaoke]);

  useEffect(() => {
    sourceRef.current = sourceUrl;
    reset();
    return () => {
      stopTick();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [sourceUrl, reset, stopTick]);

  // Pre-resolve the official vocal video so switching back from karaoke to
  // vocals is instant even if the vocal was never played first.
  useEffect(() => {
    let cancelled = false;
    void resolveVideoId(sourceRef.current).then((id) => {
      if (!cancelled) videoIdRef.current.vocal = id ?? undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  /** Resolve (or reuse) the cached video id for the current vocal/karaoke variant. */
  async function resolveIdFor(mode: boolean): Promise<string | null> {
    if (mode) {
      if (!videoIdRef.current.karaoke) {
        videoIdRef.current.karaoke =
          (await resolveKaraokeVideoId(title).catch(() => null)) ?? undefined;
      }
      return videoIdRef.current.karaoke ?? null;
    }
    if (!videoIdRef.current.vocal) {
      videoIdRef.current.vocal =
        (await resolveVideoId(sourceRef.current).catch(() => null)) ?? undefined;
    }
    return videoIdRef.current.vocal ?? null;
  }

  /**
   * Switch the active video instantly by reusing the same iframe: loading a new
   * video id on a live player is a single in-place swap, so vocal ↔ karaoke
   * toggles feel immediate (no re-fetch, no spinner, no player rebuild).
   */
  function switchVideo(videoId: string) {
    setError(null);
    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
      return;
    }
    setStatus("loading");
    void startWithVideoId(videoId);
  }

  async function handlePlay() {
    if (audioMode) {
      audioElRef.current?.play();
      return;
    }
    if (playerRef.current) {
      playerRef.current.playVideo();
      return;
    }
    setStatus("resolving");
    setError(null);
    const target = sourceRef.current;
    const mode = karaokeRef.current;
    const videoId = await resolveIdFor(mode);
    if (target !== sourceRef.current || mode !== karaokeRef.current) return; // song/variant changed while resolving
    if (!videoId) {
      setStatus("error");
      setError(mode ? t("player.error.noKaraoke") : t("player.error.noEmbed"));
      return;
    }
    switchVideo(videoId);
  }

  /** Create the YouTube player for a video id (only on first playback). */
  function startWithVideoId(videoId: string) {
    if (creatingRef.current || playerRef.current) return;
    creatingRef.current = true;
    const target = sourceRef.current;
    setStatus("loading");
    void (async () => {
      try {
        const YT = await loadYouTubeApi();
        if (target !== sourceRef.current) return;
        const player = new YT.Player(PLAYER_ELEMENT_ID, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            controls: 0,
            disablekb: 1,
          },
          events: {
            onReady: (event) => {
              playerRef.current = event.target;
              event.target.setVolume(volumeRef.current);
              if (mutedRef.current) event.target.mute();
              // If the stem audio already took over while the player was
              // loading, don't start the video over it (double playback).
              if (!audioModeRef.current) event.target.playVideo();
              if (pendingSeekRef.current != null) {
                event.target.seekTo(pendingSeekRef.current, true);
                pendingSeekRef.current = null;
              }
            },
            onStateChange: (event) => {
              switch (event.data) {
                case 1: // playing
                  setStatus("playing");
                  startTick();
                  break;
                case 2: // paused
                  // Stop polling the (now paused) video for time — the audio
                  // element drives the transport once the stem takes over.
                  stopTick();
                  if (audioModeRef.current) break;
                  setStatus("paused");
                  break;
                case 0: // ended
                  setStatus("ended");
                  stopTick();
                  setCurrent(0);
                  onTimeChangeRef.current?.(0);
                  break;
              }
            },
            onError: () => {
              stopTick();
              setStatus("error");
              setError(t("player.error.playback"));
            },
          },
        });
        playerRef.current = player;
      } catch {
        setStatus("error");
        setError(t("player.error.load"));
      } finally {
        creatingRef.current = false;
      }
    })();
  }

  /** Resolve (or reuse) the id for the current variant and switch to it. */
  async function playCurrent() {
    // Picking a YouTube version (karaoke picker / back-to-vocals) takes over
    // from any page-owned stem audio — stop it first so the two never overlap.
    if (audioModeRef.current) {
      const a = audioElRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
      setStemActive(false);
      setStemFiles(null);
    }
    const target = sourceRef.current;
    const mode = karaokeRef.current;
    // A cached id means the switch can happen instantly — skip the spinner.
    const cached = (mode ? videoIdRef.current.karaoke : videoIdRef.current.vocal) ?? null;
    let videoId = cached;
    if (!videoId) {
      setStatus("resolving");
      setError(null);
      videoId = await resolveIdFor(mode);
    }
    if (target !== sourceRef.current || mode !== karaokeRef.current) return;
    if (!videoId) {
      setStatus("error");
      setError(
        mode ? "找不到可直接嵌入的卡拉OK／伴奏影片。" : "這個來源沒有可直接嵌入的官方影片。",
      );
      return;
    }
    switchVideo(videoId);
  }
  playCurrentRef.current = () => {
    void playCurrent();
  };

  // Keep the shared transport in sync with the <audio> element in audio mode.
  useEffect(() => {
    const a = audioElRef.current;
    if (!a) return;
    const onTime = () => {
      setCurrent(a.currentTime || 0);
      onTimeChangeRef.current?.(a.currentTime || 0);
    };
    const onDur = () => {
      if (a.duration && Number.isFinite(a.duration)) setDuration(a.duration);
    };
    const onPlay = () => setStatus("playing");
    const onPause = () => setStatus("paused");
    const onEnded = () => {
      setStatus("ended");
      setCurrent(0);
      onTimeChangeRef.current?.(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("durationchange", onDur);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("durationchange", onDur);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
  }, []);

  // ---- Auto-detected off-vocal stem: adopt it when the service reports ready ----
  useEffect(() => {
    if (stems?.state === "ready") {
      setStemFiles({ full: stems.full, vocals: stems.vocals });
    } else {
      setStemFiles(null);
      setStemActive(false);
    }
  }, [stems?.state, stems?.full, stems?.vocals]);

  // Play the stem as soon as it's ready — the off-vocal (karaoke) by default,
  // or the full mix once the user has switched vocals on.
  useEffect(() => {
    if (!stemFiles || stemActive) return;
    const a = audioElRef.current;
    if (a) {
      // Never overlap the YouTube player: pause it, and if it was playing,
      // resume the stem at the same position (both are the same recording).
      const videoTime = playerRef.current?.getCurrentTime?.() ?? 0;
      const resumeAt = Number.isFinite(videoTime) && videoTime > 0 ? videoTime : 0;
      playerRef.current?.pauseVideo();
      a.src = vocalOn ? stemFiles.full : stemFiles.vocals;
      a.load();
      a.play().catch(() => {});
      a.currentTime = resumeAt;
    }
    setStemActive(true);
  }, [stemFiles, stemActive, vocalOn]);

  function toggleVocal() {
    const a = audioElRef.current;
    if (!stemFiles || !a) return;
    // Swap between the full mix (vocals on) and the off-vocal stem at the
    // same timestamp — both are the same recording, so alignment holds.
    playerRef.current?.pauseVideo();
    const t = a.currentTime;
    a.src = vocalOn ? stemFiles.vocals : stemFiles.full;
    a.load();
    a.play().catch(() => {});
    a.currentTime = t;
    setVocalOn(!vocalOn);
  }

  function handlePause() {
    if (audioMode) {
      audioElRef.current?.pause();
      return;
    }
    playerRef.current?.pauseVideo();
  }

  function handleSeek(value: number) {
    setCurrent(value);
    onTimeChangeRef.current?.(value);
    if (audioMode) {
      if (audioElRef.current) audioElRef.current.currentTime = value;
      return;
    }
    playerRef.current?.seekTo(value, true);
  }

  function handleVolumeChange(value: number) {
    setVolume(value);
    playerRef.current?.setVolume(value);
    // The off-vocal stem plays from the page-owned <audio> element — keep its
    // volume in sync too.
    const a = audioElRef.current;
    if (a) a.volume = value / 100;
    // Dragging the slider always restores audible output.
    if (muted) {
      setMuted(false);
      playerRef.current?.unMute();
      if (a) a.muted = false;
    }
  }

  function handleMuteToggle() {
    const next = !muted;
    setMuted(next);
    if (next) playerRef.current?.mute();
    else playerRef.current?.unMute();
    const a = audioElRef.current;
    if (a) a.muted = next;
  }

  // Expose an external seek so lyric lines can jump the song back to a line's
  // start time. Before the user has pressed Play, only the position is
  // remembered — starting the whole YouTube load just because a lyric line
  // was clicked would leave the player stuck on "loading" if the network is
  // slow, so playback is left to the Play button.
  useImperativeHandle(
    ref,
    () => ({
      seekTo: (seconds) => {
        pendingSeekRef.current = seconds;
        setCurrent(seconds);
        onTimeChangeRef.current?.(seconds);
        if (audioModeRef.current) {
          const a = audioElRef.current;
          if (a) {
            a.currentTime = seconds;
            if (a.paused) a.play().catch(() => {});
          }
          return;
        }
        const player = playerRef.current;
        if (player) {
          player.seekTo(seconds, true);
          if (statusRef.current !== "playing") player.playVideo();
        }
      },
      // Switch vocal ↔ karaoke instantly, reusing the existing player.
      play: (variant) => {
        karaokeRef.current = variant === "karaoke";
        playCurrentRef.current();
      },
      // Play a specific backing video the user picked from the ranked list.
      playKaraokeVideo: (videoId) => {
        karaokeRef.current = true;
        videoIdRef.current.karaoke = videoId;
        playCurrentRef.current();
      },
    }),
    [],
  );

  const isBusy = status === "resolving" || status === "loading";
  const isPlaying = status === "playing";
  const max = duration > 0 ? duration : 0;
  const karaokeQuery = `${(splitTitle(title).song || title).trim()} カラオケ`;

  return (
    <div className="space-y-2">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
      >
        <div id={PLAYER_ELEMENT_ID} />
      </div>

      <audio ref={audioElRef} className="hidden" />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 rounded-full"
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={isBusy}
          aria-label={isPlaying ? t("player.pause") : t("player.play")}
        >
          {isBusy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="size-5" />
          ) : (
            <Play className="size-5 translate-x-px" />
          )}
        </Button>

        <input
          type="range"
          min={0}
          max={max || 100}
          step={0.5}
          value={Math.min(current, max || 100)}
          onChange={(e) => handleSeek(Number(e.target.value))}
          disabled={(!playerRef.current && !audioMode) || max === 0}
          className="h-1.5 w-full min-w-0 accent-primary disabled:cursor-default disabled:opacity-40"
          aria-label={t("player.position")}
        />

        <span className="shrink-0 text-xs tabular-nums text-muted">
          {formatTime(current)} / {formatTime(max)}
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleMuteToggle}
            aria-label={muted ? t("player.unmute") : t("player.mute")}
            aria-pressed={muted}
            className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
          >
            {muted || volume === 0 ? (
              <VolumeX className="size-4" />
            ) : volume < 50 ? (
              <Volume1 className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={muted ? 0 : volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            disabled={!playerRef.current && !audioMode}
            className="h-1.5 w-16 accent-primary sm:w-20 disabled:cursor-default disabled:opacity-40"
            aria-label={t("player.volume")}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {stems?.state === "generating" ? (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" /> Generating off-vocal…
            </span>
          ) : null}
          {stems == null && onGenerateKaraoke ? (
            <button
              type="button"
              onClick={onGenerateKaraoke}
              className="flex h-9 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-foreground transition-colors hover:bg-primary/20"
              title="Generate the off-vocal (karaoke) version with Demucs — takes about 1-2 minutes"
            >
              <Sparkles className="size-3.5" />
              Generate karaoke
            </button>
          ) : null}
          {stemActive ? (
            <>
              <button
                type="button"
                onClick={toggleVocal}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  vocalOn
                    ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/20"
                    : "border-border text-muted hover:text-foreground",
                )}
                title={
                  vocalOn
                    ? "Switch to the off-vocal (karaoke) version"
                    : "Switch back to the version with vocals"
                }
              >
                <Mic className="size-3.5" />
                {vocalOn ? "Vocals off" : "Vocals on"}
              </button>
            </>
          ) : null}
        </div>

        <div className="relative flex shrink-0 items-center gap-2">
          {chosenKaraokeTitle && !audioMode ? (
            <button
              type="button"
              onClick={karaoke ? onBackToVocals : onBackToKaraoke}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                karaoke
                  ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/20"
                  : "border-border text-muted hover:text-foreground",
              )}
              title={
                karaoke
                  ? "Switch back to the original vocal video"
                  : "Switch back to the chosen karaoke version"
              }
            >
                <Music2 className="size-3.5" />
                {karaoke ? t("player.backToVocals") : "Back to karaoke"}
              </button>
          ) : null}

            <button
              type="button"
              onClick={onFindKaraoke}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted transition-colors hover:text-foreground"
              title={t("player.findKaraokeTitle")}
            >
              <Sparkles className="size-3.5" />
              {t("player.findKaraoke")}
            </button>

            {karaokePickerOpen ? (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={onKaraokePickerClose}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-bg shadow-2xl">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                    <p className="text-sm font-medium text-foreground">
                      Karaoke versions{" "}
                      <span className="font-normal text-muted">— by confidence</span>
                    </p>
                    <button
                      type="button"
                      onClick={onKaraokePickerClose}
                      aria-label="Close karaoke options"
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {karaokeBusy || !karaokeCandidates ? (
                      <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted">
                        <Loader2 className="size-3.5 animate-spin" />
                        Searching karaoke…
                      </p>
                    ) : karaokeCandidates.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-muted">
                        No backing track found for this song.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {karaokeCandidates.map((candidate) => {
                          const confidence = karaokeConfidence(candidate.score);
                          return (
                            <li key={candidate.videoId}>
                              <button
                                type="button"
                                onClick={() => onPickKaraoke?.(candidate)}
                                className="flex w-full items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:border-foreground/25"
                              >
                                <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                                  {KARAOKE_KIND_LABEL[candidate.kind]}
                                </span>
                                {candidate.official ? (
                                  <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                    公式
                                  </span>
                                ) : null}
                                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                                  {candidate.title}
                                </span>
                                {formatDuration(candidate.duration) ? (
                                  <span className="shrink-0 text-[10px] tabular-nums text-subtle">
                                    {formatDuration(candidate.duration)}
                                  </span>
                                ) : null}
                                <span
                                  className={cn(
                                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                    confidence === "High"
                                      ? "bg-primary/15 text-primary"
                                      : confidence === "Medium"
                                        ? "bg-surface-2 text-foreground"
                                        : "bg-border text-muted",
                                  )}
                                >
                                  {confidence}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            ) : null}
        </div>

        {!audioMode && chosenKaraokeTitle ? (
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <Music2 className="size-3.5 shrink-0 text-primary" />
            <span className="max-w-48 truncate">{chosenKaraokeTitle}</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-danger">
          <span>{error}</span>
          <a
            href={youtubeSearchUrl(karaoke ? karaokeQuery : title)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {t("player.searchYoutube", { query: karaoke ? karaokeQuery : title })}
          </a>
        </p>
      ) : null}
    </div>
  );
}
