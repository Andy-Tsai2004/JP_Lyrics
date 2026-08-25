import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import { splitAnnotatedLine } from "./annotations";
import type { LyricLine, RubyToken } from "./types";

type KuroshiroLike = {
  init: (analyzer: unknown) => Promise<void>;
  convert: (str: string, opts: { to: string; mode: string }) => Promise<string>;
};

let converter: KuroshiroLike | null = null;
let initPromise: Promise<KuroshiroLike> | null = null;

function ctor<T>(mod: T | { default: T }): T {
  return (mod as { default?: T }).default ?? (mod as T);
}

/**
 * The kuromoji dictionary files are copied into `public/kuromoji-dict/`
 * before dev/build (see `scripts/copy-kuromoji-dict.mjs`) and resolved
 * relative to the app base path, so this works both locally and on GitHub
 * Pages (`/<repo>/kuromoji-dict/…`).
 */
const DICT_PATH = `${import.meta.env.BASE_URL}kuromoji-dict`;

async function getConverter(): Promise<KuroshiroLike> {
  if (converter) return converter;
  if (!initPromise) {
    initPromise = (async () => {
      const KS = ctor(Kuroshiro) as unknown as new () => KuroshiroLike;
      const Analyzer = ctor(KuromojiAnalyzer) as unknown as new (opts: {
        dictPath: string;
      }) => unknown;
      const instance = new KS();
      await instance.init(new Analyzer({ dictPath: DICT_PATH }));
      converter = instance;
      return instance;
    })();
  }
  return initPromise;
}

function decodeEntities(s: string): string {
  return s
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'");
}

export function htmlToTokens(html: string): RubyToken[] {
  const tokens: RubyToken[] = [];
  const re = /<ruby>([\s\S]*?)<\/ruby>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match[2]) {
      tokens.push({ text: decodeEntities(match[2]) });
      continue;
    }
    const inner = match[1] ?? "";
    const rt = /<rt>([\s\S]*?)<\/rt>/.exec(inner)?.[1] ?? "";
    const surface = inner.replace(/<rt>[\s\S]*?<\/rt>|<rp>[\s\S]*?<\/rp>/g, "");
    const text = decodeEntities(surface);
    const furigana = decodeEntities(rt).trim();
    if (text) {
      tokens.push(furigana ? { text, furigana } : { text });
    }
  }
  return tokens;
}

async function appendKuroshiroTokens(
  kuroshiro: KuroshiroLike,
  text: string,
  tokens: RubyToken[],
): Promise<void> {
  if (!text) return;
  const html = await kuroshiro.convert(text, {
    to: "hiragana",
    mode: "furigana",
  });
  tokens.push(...htmlToTokens(html));
}

async function annotateLine(
  kuroshiro: KuroshiroLike,
  text: string,
): Promise<RubyToken[]> {
  const tokens: RubyToken[] = [];
  for (const segment of splitAnnotatedLine(text)) {
    if (segment.furigana) {
      // The song's own reading (幻（ゆめ） → 幻/ゆめ); the parentheses were
      // consumed so the reading is shown once, as the ruby.
      tokens.push({ text: segment.text, furigana: segment.furigana });
    } else {
      // Un-annotated text is read by Kuroshiro's dictionary as before.
      await appendKuroshiroTokens(kuroshiro, segment.text, tokens);
    }
  }
  return tokens;
}

export async function addFurigana(lines: string[]): Promise<LyricLine[]> {
  const kuroshiro = await getConverter();
  const result: LyricLine[] = [];
  for (const text of lines) {
    result.push({ text, tokens: await annotateLine(kuroshiro, text) });
  }
  return result;
}
