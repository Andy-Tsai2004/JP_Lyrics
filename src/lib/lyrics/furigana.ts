import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";
import type { LyricLine, RubyToken } from "./types";

type KuroshiroLike = {
  init: (analyzer: unknown) => Promise<void>;
  convert: (
    str: string,
    opts: { to: string; mode: string },
  ) => Promise<string>;
};

let converter: KuroshiroLike | null = null;
let initPromise: Promise<KuroshiroLike> | null = null;

function ctor<T>(mod: T | { default: T }): T {
  return (mod as { default?: T }).default ?? (mod as T);
}

function resolveDictPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const require = createRequire(import.meta.url);
  const candidates = [
    path.join(path.dirname(require.resolve("kuromoji/package.json")), "dict"),
    path.join(process.cwd(), "node_modules/kuromoji/dict"),
    path.join(process.cwd(), "kuromoji-dict"),
    path.join(process.cwd(), "server/kuromoji-dict"),
    path.join(here, "../../../server/kuromoji-dict"),
    path.join(here, "kuromoji-dict"),
  ];
  for (const dir of candidates) {
    try {
      if (existsSync(path.join(dir, "base.dat.gz"))) return dir;
    } catch {
      // ignore
    }
  }
  throw new Error("Japanese dictionary files were not found on the server.");
}

async function getConverter(): Promise<KuroshiroLike> {
  if (converter) return converter;
  if (!initPromise) {
    initPromise = (async () => {
      const dictPath = resolveDictPath();
      const KS = ctor(Kuroshiro) as unknown as new () => KuroshiroLike;
      const Analyzer = ctor(KuromojiAnalyzer) as unknown as new (opts: {
        dictPath: string;
      }) => unknown;
      const instance = new KS();
      await instance.init(new Analyzer({ dictPath }));
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

export async function addFurigana(lines: string[]): Promise<LyricLine[]> {
  const kuroshiro = await getConverter();
  const result: LyricLine[] = [];
  for (const text of lines) {
    const html = await kuroshiro.convert(text, {
      to: "hiragana",
      mode: "furigana",
    });
    result.push({ text, tokens: htmlToTokens(html) });
  }
  return result;
}
