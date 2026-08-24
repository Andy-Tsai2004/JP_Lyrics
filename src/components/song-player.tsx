import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { resolveVideoId, youtubeSearchUrl } from "@/lib/lyrics/video";

const PLAYER_ELEMENT_ID = "jplyrics-youtube-player";

type PlayerStatus =
  | "idle"
  | "resolving"
  | "loading"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export type SongPlayerHandle = {
  /**
   * Seek to an absolute position in seconds. With a loaded player it also
   * resumes playback; before the player exists it only remembers the
   * position, which is applied when the user presses Play.
   */
  seekTo: (seconds: number) => void;
};

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
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
  ref,
}: {
  sourceUrl: string;
  title: string;
  /** Reports the current playback position in seconds as it changes. */
  onTimeChange?: (seconds: number) => void;
  ref?: Ref<SongPlayerHandle>;
}) {
  const playerRef = useRef<YTPlayer | null>(null);
  const sourceRef = useRef(sourceUrl);
  const tickTimer = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const onTimeChangeRef = useRef(onTimeChange);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);

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
    setStatus("idle");
    setCurrent(0);
    setDuration(0);
    setError(null);
  }, [stopTick]);

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
    if (status === "resolving" || status === "loading") return;
    if (playerRef.current) {
      playerRef.current.playVideo();
      return;
    }

    setStatus("resolving");
    setError(null);
    const target = sourceUrl;

    const videoId = await resolveVideoId(target);
    if (target !== sourceRef.current) return; // song changed while resolving
    if (!videoId) {
      setStatus("error");
      setError("這個來源沒有可直接嵌入的官方影片。");
      return;
    }

    setStatus("loading");
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
  }

  function handlePause() {
    playerRef.current?.pauseVideo();
  }

  function handleSeek(value: number) {
    setCurrent(value);
    onTimeChangeRef.current?.(value);
    playerRef.current?.seekTo(value, true);
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
          if (status !== "playing") player.playVideo();
        }
      },
    }),
    [status],
  );

  const isBusy = status === "resolving" || status === "loading";
  const isPlaying = status === "playing";
  const max = duration > 0 ? duration : 0;

  return (
    <div className="space-y-2">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0"
      >
        <div id={PLAYER_ELEMENT_ID} />
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
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
      </div>

      {error ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-danger">
          <span>{error}</span>
          <a
            href={youtubeSearchUrl(title)}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            在 YouTube 搜尋「{title}」
          </a>
        </p>
      ) : null}
    </div>
  );
}
