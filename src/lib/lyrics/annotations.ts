import { katakanaToHiragana } from "./kana.ts";

export type AnnotationSegment =
  | { text: string; furigana: string }
  | { text: string; furigana?: undefined };

/**
 * Songs routinely override the dictionary reading for a kanji — the singer
 * sings 幻 as ゆめ, 夜明け as よあけ, 美味しい as おいしい. Lyric sources annotate
 * this the standard way, with the intended reading in parentheses right after
 * the word. Kuroshiro/Kuromoji doesn't know the song, so it would stamp the
 * *dictionary* reading (幻 → まぼろし) on top and leave the literal `（ゆめ）`
 * text behind. This splits a line so those annotations become authoritative
 * readings instead:
 *
 *   覚めない 幻（ゆめ）見てた
 *     -> ["覚めない ", { text: "幻", furigana: "ゆめ" }, "見てた"]
 *
 * The parentheses are consumed (so the reading is shown once, as the ruby,
 * and the duplicate text disappears); every other chunk is left for Kuroshiro
 * to read on its own.
 */
const ANNOTATION_RE =
  /([\u4E00-\u9FFF]+[\u3041-\u3096\u30A1-\u30FA]*?)[（(]([\u3041-\u3096\u30A1-\u30FA\u30FC]+)[)）]/g;

export function splitAnnotatedLine(text: string): AnnotationSegment[] {
  const segments: AnnotationSegment[] = [];
  let lastIndex = 0;
  ANNOTATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANNOTATION_RE.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start) });
    }
    const word = match[1];
    if (word) {
      segments.push({ text: word, furigana: katakanaToHiragana(match[2]) });
    }
    lastIndex = end;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }
  return segments;
}
