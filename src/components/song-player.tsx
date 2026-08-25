import { Loader2, Music2, Pause, Play, Sparkles, Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { splitTitle } from "@/lib/lyrics/lrc";
import { resolveKaraokeVideoId, resolveVideoId, youtubeSearchUrl } from "@/lib/lyrics/video";

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

export function SongPlayer({
  sourceUrl,
  title,
  onTimeChange,
  karaoke = false,
  onKaraokeAction,
  ref,
}: {
  sourceUrl: string;
  title: string;
  /** Reports the current playback position in seconds as it changes. */
  onTimeChange?: (seconds: number) => void;
  /** When true, resolve and play a karaoke / off-vocal video instead of the official one. */
  karaoke?: boolean;
  /** Fired when the karaoke variant button is clicked (find / back-to-vocals). */
  onKaraokeAction?: () => void;
  ref?: Ref<SongPlayerHandle>;
}) {
  const playerRef = useRef<YTPlayer | null>(null);
  const sourceRef = useRef(sourceUrl);
  const karaokeRef = useRef(karaoke);
  const statusRef = useRef<PlayerStatus>("idle");
  const handlePlayRef = useRef<() => void>(() => {});
  const startWithVideoIdRef = useRef<(videoId: string) => void>(() => {});
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
    pendingSeekRef.current = null;
    statusRef.current = "idle";
    setStatus("idle");
    setCurrent(0);
    setDuration(0);
    setError(null);
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

  async function handlePlay() {
    if (statusRef.current === "resolving" || statusRef.current === "loading") return;
    if (playerRef.current) {
      playerRef.current.playVideo();
      return;
    }

    setStatus("resolving");
    setError(null);
    const target = sourceUrl;
    const mode = karaokeRef.current;

    const videoId = mode ? await resolveKaraokeVideoId(title) : await resolveVideoId(target);
    if (target !== sourceRef.current || mode !== karaokeRef.current) return; // song/variant changed while resolving
    if (!videoId) {
      setStatus("error");
      setError(
        mode ? "找不到可直接嵌入的卡拉OK／伴奏影片。" : "這個來源沒有可直接嵌入的官方影片。",
      );
      return;
    }

    startWithVideoId(videoId);
  }
  handlePlayRef.current = handlePlay;

  /** Load and play a specific YouTube video id (skips resolve; used by the picker). */
  function startWithVideoId(videoId: string) {
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
              event.target.playVideo();
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
                  setStatus("paused");
                  stopTick();
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
              setError("YouTube 無法播放這個影片（可能受地區或版權限制）。");
            },
          },
        });
        playerRef.current = player;
      } catch {
        setStatus("error");
        setError("無法載入 YouTube 播放器，請稍後再試。");
      }
    })();
  }
  startWithVideoIdRef.current = startWithVideoId;

  function handlePause() {
    playerRef.current?.pauseVideo();
  }

  function handleSeek(value: number) {
    setCurrent(value);
    onTimeChangeRef.current?.(value);
    playerRef.current?.seekTo(value, true);
  }

  function handleVolumeChange(value: number) {
    setVolume(value);
    playerRef.current?.setVolume(value);
    // Dragging the slider always restores audible output.
    if (muted) {
      setMuted(false);
      playerRef.current?.unMute();
    }
  }

  function handleMuteToggle() {
    const next = !muted;
    setMuted(next);
    if (next) playerRef.current?.mute();
    else playerRef.current?.unMute();
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
        const player = playerRef.current;
        if (player) {
          player.seekTo(seconds, true);
          if (statusRef.current !== "playing") player.playVideo();
        }
      },
      // Swap the source on demand: reset the current video, pick the requested
      // variant, and load+play it. The "Generate karaoke" control uses this so
      // the backing track starts the moment the button is clicked.
      play: (variant) => {
        reset();
        karaokeRef.current = variant === "karaoke";
        void handlePlayRef.current();
      },
      // Play a specific backing video the user picked from the ranked list.
      playKaraokeVideo: (videoId) => {
        reset();
        karaokeRef.current = true;
        startWithVideoIdRef.current(videoId);
      },
    }),
    [reset],
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

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 rounded-full"
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={isBusy}
          aria-label={isPlaying ? "Pause" : "Play"}
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
          disabled={!playerRef.current || max === 0}
          className="h-1.5 w-full min-w-0 accent-primary disabled:cursor-default disabled:opacity-40"
          aria-label="Playback position"
        />

        <span className="shrink-0 text-xs tabular-nums text-muted">
          {formatTime(current)} / {formatTime(max)}
        </span>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleMuteToggle}
            aria-label={muted ? "Unmute" : "Mute"}
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
            disabled={!playerRef.current}
            className="h-1.5 w-16 accent-primary sm:w-20 disabled:cursor-default disabled:opacity-40"
            aria-label="Volume"
          />
        </div>

        <button
          type="button"
          onClick={onKaraokeAction}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
            karaoke
              ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/20"
              : "border-border text-muted hover:text-foreground",
          )}
          title={
            karaoke
              ? "Switch back to the original vocal video"
              : "Find backing-track (karaoke / off-vocal / piano) versions of this song"
          }
        >
          {karaoke ? <Music2 className="size-3.5" /> : <Sparkles className="size-3.5" />}
          {karaoke ? "Back to vocals" : "Find karaoke"}
        </button>
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
            在 YouTube 搜尋「{karaoke ? karaokeQuery : title}」
          </a>
        </p>
      ) : null}
    </div>
  );
}
