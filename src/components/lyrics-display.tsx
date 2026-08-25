import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import {
  containsKatakana,
  katakanaToHiragana,
  katakanaToRomaji,
  kanaToRomaji,
} from "@/lib/lyrics/kana";
import type { LyricLine } from "@/lib/lyrics/types";
import { cn } from "@/lib/utils";

export type KatakanaAidMode = "off" | "hiragana" | "romaji";

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

function katakanaReading(text: string, mode: Exclude<KatakanaAidMode, "off">): string {
  if (mode === "hiragana") return katakanaToHiragana(text);
  return katakanaToRomaji(text);
}

function renderTokenWithAssist(
  tokenText: string,
  mode: Exclude<KatakanaAidMode, "off">,
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

/**
 * Full-line romaji for the transliteration view. Kanji tokens use their
 * (authoritative) furigana reading, kana tokens are converted directly, and
 * Latin / digits / punctuation pass through; tokens are joined with a single
 * space for a readable, left-aligned line.
 */
function romajiOfLine(line: LyricLine): string {
  return line.tokens
    .map((token) => (token.furigana ? kanaToRomaji(token.furigana) : kanaToRomaji(token.text)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function LyricsDisplay({
  lines,
  activeIndex,
  onLineClick,
  showFurigana,
  katakanaAid,
  romaji,
  fontSizeRem,
}: {
  lines: LyricLine[];
  /** When provided, the line at this index is highlighted and auto-scrolled. */
  activeIndex?: number;
  /** When provided, clicking a line calls back with its index (seek target). */
  onLineClick?: (index: number) => void;
  showFurigana: boolean;
  katakanaAid: KatakanaAidMode;
  /** When true, render a romanized reading above each line (left-aligned). */
  romaji: boolean;
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
        <div key={`${i}-${line.text}`}>
          {romaji ? (
            <div className="text-left text-[0.72em] leading-tight tracking-wide text-muted">
              {romajiOfLine(line)}
            </div>
          ) : null}
          <p
            aria-current={syncing && i === activeIndex ? "true" : undefined}
            role={onLineClick ? "button" : undefined}
            tabIndex={onLineClick ? 0 : undefined}
            onClick={onLineClick ? () => onLineClick(i) : undefined}
            onKeyDown={
              onLineClick
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onLineClick(i);
                    }
                  }
                : undefined
            }
            className={cn(
              "font-serif text-foreground transition-colors duration-300",
              (showFurigana || katakanaAid !== "off") && "pt-1",
              syncing && (i === activeIndex ? "font-medium text-foreground" : "text-subtle"),
              onLineClick &&
                "cursor-pointer outline-none hover:text-foreground focus-visible:text-foreground",
            )}
            style={{
              fontSize: `${fontSizeRem}rem`,
              lineHeight: showFurigana || katakanaAid !== "off" ? 1.74 : 1.62,
            }}
          >
            {romaji
              ? line.text
              : !showFurigana && katakanaAid === "off"
                ? line.text
                : line.tokens.map((token, j) => {
                    if (token.furigana && showFurigana) {
                      return (
                        <ruby key={j} className="ruby-token">
                          {token.text}
                          <rt>{token.furigana}</rt>
                        </ruby>
                      );
                    }
                    if (katakanaAid !== "off" && containsKatakana(token.text)) {
                      return <span key={j}>{renderTokenWithAssist(token.text, katakanaAid)}</span>;
                    }
                    return <span key={j}>{token.text}</span>;
                  })}
          </p>
        </div>
      ))}
    </div>
  );
}
