import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { containsKatakana, katakanaToHiragana, katakanaToRomaji } from "@/lib/lyrics/kana";
import type { LyricLine } from "@/lib/lyrics/types";
import { cn } from "@/lib/utils";

export type RubyAssistMode = "furigana" | "hiragana" | "romaji";

function splitKatakanaRuns(text: string): Array<{ text: string; isKatakana: boolean }> {
  const chunks: Array<{ text: string; isKatakana: boolean }> = [];
  const re = /[\u30A1-\u30FF]+/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text))) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      chunks.push({ text: text.slice(lastIndex, start), isKatakana: false });
    }
    chunks.push({ text: match[0], isKatakana: true });
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    chunks.push({ text: text.slice(lastIndex), isKatakana: false });
  }

  return chunks;
}

function katakanaReading(text: string, mode: Exclude<RubyAssistMode, "furigana">): string {
  if (mode === "hiragana") return katakanaToHiragana(text);
  return katakanaToRomaji(text);
}

function renderTokenWithAssist(
  tokenText: string,
  mode: Exclude<RubyAssistMode, "furigana">,
): ReactNode[] {
  return splitKatakanaRuns(tokenText).map((chunk, idx) => {
    if (!chunk.isKatakana) return <span key={idx}>{chunk.text}</span>;
    const reading = katakanaReading(chunk.text, mode);
    return (
      <ruby key={idx} className="ruby-token">
        {chunk.text}
        <rt>{reading}</rt>
      </ruby>
    );
  });
}

export function LyricsDisplay({
  lines,
  activeIndex,
  activeTime,
  onLineClick,
  showFurigana,
  rubyAssistMode,
  fontSizeRem,
}: {
  lines: LyricLine[];
  /** When provided, the line at this index is highlighted and auto-scrolled. */
  activeIndex?: number;
  /** Playback position (seconds) used to highlight words within the active line. */
  activeTime?: number;
  /** When provided, clicking a line calls back with its index (seek target). */
  onLineClick?: (index: number) => void;
  showFurigana: boolean;
  rubyAssistMode: RubyAssistMode;
  fontSizeRem: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const syncing = activeIndex != null;

  useEffect(() => {
    if (!syncing || activeIndex == null || activeIndex < 0 || !scrollRef.current) return;
    const container = scrollRef.current;
    const el = container.children[activeIndex] as HTMLElement | undefined;
    if (!el) return;
    const target = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeIndex, syncing]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "space-y-1",
        syncing && "relative max-h-[55vh] overflow-y-auto pr-1 scroll-smooth",
      )}
    >
      {lines.map((line, i) => (
        <WordLine
          key={`${i}-${line.text}`}
          line={line}
          syncing={syncing}
          isActiveLine={syncing && i === activeIndex}
          activeTime={activeTime}
          onLineClick={onLineClick ? () => onLineClick(i) : undefined}
          showFurigana={showFurigana}
          rubyAssistMode={rubyAssistMode}
          fontSizeRem={fontSizeRem}
        />
      ))}
    </div>
  );
}

function WordLine({
  line,
  syncing,
  isActiveLine,
  activeTime,
  onLineClick,
  showFurigana,
  rubyAssistMode,
  fontSizeRem,
}: {
  line: LyricLine;
  syncing: boolean;
  isActiveLine: boolean;
  activeTime?: number;
  onLineClick?: () => void;
  showFurigana: boolean;
  rubyAssistMode: RubyAssistMode;
  fontSizeRem: number;
}) {
  const timedLine = isActiveLine && line.tokens.some((token) => token.start != null);
  const renderTokens = showFurigana || timedLine;
  return (
    <p
      aria-current={isActiveLine ? "true" : undefined}
      role={onLineClick ? "button" : undefined}
      tabIndex={onLineClick ? 0 : undefined}
      onClick={onLineClick}
      onKeyDown={
        onLineClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onLineClick();
              }
            }
          : undefined
      }
      className={cn(
        "font-serif text-foreground transition-colors duration-300",
        showFurigana && "pt-1",
        syncing && (isActiveLine ? "font-medium text-foreground" : "text-subtle"),
        onLineClick &&
          "cursor-pointer outline-none hover:text-foreground focus-visible:text-foreground",
      )}
      style={{
        fontSize: `${fontSizeRem}rem`,
        lineHeight: showFurigana ? 1.74 : 1.62,
      }}
    >
      {renderTokens
        ? line.tokens.map((token, j) => {
            const timed = timedLine && activeTime != null && token.start != null;
            const sung = timed && activeTime >= token.start!;
            return (
              <span
                key={j}
                className={timed ? (sung ? "text-foreground" : "text-subtle") : undefined}
              >
                {showFurigana && token.furigana ? (
                  <ruby className="ruby-token">
                    {token.text}
                    <rt>{token.furigana}</rt>
                  </ruby>
                ) : showFurigana && rubyAssistMode !== "furigana" && containsKatakana(token.text) ? (
                  renderTokenWithAssist(token.text, rubyAssistMode)
                ) : (
                  token.text
                )}
              </span>
            );
          })
        : line.text}
    </p>
  );
}
