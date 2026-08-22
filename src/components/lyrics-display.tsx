import type { ReactNode } from "react";
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
  showFurigana,
  rubyAssistMode,
  fontSizeRem,
}: {
  lines: LyricLine[];
  showFurigana: boolean;
  rubyAssistMode: RubyAssistMode;
  fontSizeRem: number;
}) {
  return (
    <div className="space-y-1">
      {lines.map((line, i) => (
        <p
          key={`${i}-${line.text}`}
          className={cn(
            "font-serif text-foreground",
            showFurigana && "pt-1",
          )}
          style={{
            fontSize: `${fontSizeRem}rem`,
            lineHeight: showFurigana ? 1.74 : 1.62,
          }}
        >
          {showFurigana
            ? line.tokens.map((token, j) =>
                token.furigana ? (
                  <ruby key={j} className="ruby-token">
                    {token.text}
                    <rt>{token.furigana}</rt>
                  </ruby>
                ) : rubyAssistMode !== "furigana" && containsKatakana(token.text) ? (
                  <span key={j}>{renderTokenWithAssist(token.text, rubyAssistMode)}</span>
                ) : (
                  <span key={j}>{token.text}</span>
                ),
              )
            : line.text}
        </p>
      ))}
    </div>
  );
}
