import { Loader2, Music2 } from "lucide-react";
import { useState } from "react";
import type { RubyAssistMode } from "@/components/lyrics-display";
import { SongHistorySidebar } from "@/components/song-history";
import { SongPlayer } from "@/components/song-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LyricsDisplay } from "@/components/lyrics-display";
import { fetchLyrics } from "@/lib/lyrics/fetch";
import { useSongHistory } from "@/lib/lyrics/history";
import type { LyricsResult } from "@/lib/lyrics/types";
import { cn } from "@/lib/utils";

const BAHAMUT_SAMPLE_URL = "https://home.gamer.com.tw/artwork.php?sn=6306141";
const UTANET_SAMPLE_URL = "https://www.uta-net.com/song/397348/";

export function LyricsApp() {
  const [url, setUrl] = useState(UTANET_SAMPLE_URL);
  const [showFurigana, setShowFurigana] = useState(true);
  const [rubyAssistMode, setRubyAssistMode] = useState<RubyAssistMode>("hiragana");
  const [fontSizeRem, setFontSizeRem] = useState(1.35);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LyricsResult | null>(null);
  const history = useSongHistory();

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

  function openRecord(record: { sourceUrl: string }) {
    setUrl(record.sourceUrl);
    void runFetch(record.sourceUrl);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:flex-row lg:items-start">
      <SongHistorySidebar
        records={history.records}
        activeUrl={result?.sourceUrl ?? null}
        onOpen={openRecord}
        onRemove={history.remove}
        onClear={history.clear}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <header className="space-y-3">
          <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">歌詞ビューア</p>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-balance text-foreground sm:text-4xl">
            Japanese Lyrics Viewer
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-pretty text-muted">
            Paste a Bahamut artwork or Uta-Net song link. The viewer keeps only the Japanese lines
            and places ruby readings above the lyrics.
          </p>
        </header>

        <form
          className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:p-3"
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

        <div className="flex flex-wrap items-center justify-between gap-3">
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
          <SongPlayer sourceUrl={result.sourceUrl} title={result.title} />
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
                  <div key={i} className={cn("h-5 animate-pulse rounded-md bg-surface-2", width)} />
                ),
              )}
            </div>
          ) : result ? (
            <div className="space-y-8">
              <div className="space-y-1 border-b border-border pb-5">
                <p className="text-xs tracking-wide text-muted">Japanese only</p>
                <h2 className="font-serif text-lg leading-snug text-pretty text-foreground">
                  {result.title}
                </h2>
              </div>
              <LyricsDisplay
                lines={result.lines}
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
  );
}
