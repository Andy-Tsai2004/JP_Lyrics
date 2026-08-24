import * as cheerio from "cheerio";

const HIRAGANA = /[\u3041-\u3096]/;
const KATAKANA = /[\u30A1-\u30FA]/;

const METADATA =
  /作詞|作曲|編曲|歌唱|翻譯|翻好玩|Version|cv\.|CV[:：]|巴哈姆特|人氣|巴幣/;

const UTANET_FURNITURE =
  /^(?:Play\s+"|.*Amazon Music.*|購入$|シェア$|発売日：|この曲の表示回数：)/;

/**
 * Uta-Net hosts Japanese, English and mixed-language lyrics, so unlike the
 * Bahamut extractor this does not require kana. We only drop the reader
 * proxy's page furniture (play button, purchase/share rows, metadata) and
 * markdown artifacts (links, images, headings) around the lyric block.
 */
function isUtaNetLyricLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 2) return false;
  if (METADATA.test(t) || UTANET_FURNITURE.test(t)) return false;
  if (/^#{1,6}\s/.test(t)) return false;
  if (/^\s*[*+-]\s+/.test(t)) return false;
  if (/^!\[/.test(t)) return false;
  if (/^\[[^\]]*\]\([^)]*\)$/.test(t)) return false;
  return true;
}

export function isJapaneseLyricLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 2) return false;
  if (METADATA.test(t)) return false;
  if (/^【/.test(t)) return false;
  const hasKana = HIRAGANA.test(t) || KATAKANA.test(t);
  if (!hasKana) return false;
  const jpChars = (t.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) ?? []).length;
  return jpChars / t.length >= 0.35;
}

export function extractJapaneseLines(html: string): { title: string; lines: string[] } {
  const $ = cheerio.load(html);
  const title =
    $("h1.article-title").first().text().trim() ||
    $("title").first().text().trim() ||
    "Japanese lyrics";

  const article = $("#article_content").length
    ? $("#article_content")
    : $("#article").length
      ? $("#article")
      : $("body");

  const hasHr = article.find("hr").length > 0;
  let stage = hasHr ? 0 : 1;
  const collected: string[] = [];

  article.find("div").each((_, el) => {
    const $el = $(el);
    if ($el.children("hr").length > 0) {
      stage += 1;
      return;
    }
    if (stage !== 1) return;
    if ($el.find("div").length > 0) return;
    const text = $el.text().replace(/\u00a0/g, " ").trim();
    if (text) collected.push(text);
  });

  if (collected.length === 0) {
    article.find("div, p, font").each((_, el) => {
      const $el = $(el);
      if ($el.find("div, p, font").length > 0) return;
      const text = $el.text().replace(/\u00a0/g, " ").trim();
      if (text) collected.push(text);
    });
  }

  const lines = collected.filter(isJapaneseLyricLine);
  return { title, lines };
}

export function extractUtaNetLyrics(html: string): { title: string; lines: string[] } {
  const $ = cheerio.load(html);
  const songTitle =
    $("h2.kashi-title").first().text().trim() ||
    $('meta[property="og:title"]').first().attr("content")?.trim() ||
    $("title").first().text().replace(/歌詞.*$/u, "").trim() ||
    "Japanese lyrics";
  const artist = $('h3[itemprop="recordedAs"]').first().text().trim();
  const title = artist ? `${songTitle} - ${artist}` : songTitle;

  const kashi = $("#kashi_area").first();
  if (!kashi.length) {
    return { title, lines: [] };
  }
  const raw = kashi.html() ?? "";
  const lines = raw
    .split(/<br\s*\/?>/i)
    .map((chunk) => cheerio.load(chunk).text().replace(/\u00a0/g, " ").trim())
    .filter(Boolean);
  return { title, lines };
}

/**
 * Markdown fallbacks. When the static site cannot get the raw HTML through a
 * CORS proxy, the reader proxy (r.jina.ai) returns a markdown rendering of the
 * page; these extractors know the structure of that markdown.
 */

const MARKDOWN_HR = /^\s*(?:\* \* \*|\*\*\*|---)\s*$/m;

function utaNetMarkdownTitle(markdown: string): string {
  const song = markdown.match(/^##\s+(.+)$/m)?.[1]?.trim();
  const artist = markdown.match(/^###\s+\[([^\]]+)\]\(/m)?.[1]?.trim();
  if (song && artist) return `${song} - ${artist}`;
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.replace(/\s*歌詞\s*$/, "").trim();
  return heading || song || "Japanese lyrics";
}

export function extractUtaNetLyricsFromMarkdown(
  markdown: string,
): { title: string; lines: string[] } {
  const title = utaNetMarkdownTitle(markdown);
  const body = markdown
    .replace(/^Title:.*$/m, "")
    .replace(/^URL Source:.*$/m, "");
  const startMatch = body.match(/^Play ".*$/m);
  const start = startMatch ? (startMatch.index ?? 0) : 0;
  const slice = body.slice(start);
  const endMatch = slice.match(/^\[この歌詞をマイ歌ネットに登録>\]/m);
  const end = endMatch ? (endMatch.index ?? slice.length) : slice.length;
  const block = slice.slice(0, end);
  const lines = block
    .split("\n")
    .map((raw) => raw.replace(/\u00a0/g, " ").trim())
    .filter((line) => line && isUtaNetLyricLine(line));
  return { title, lines };
}

export function extractJapaneseLinesFromMarkdown(
  markdown: string,
): { title: string; lines: string[] } {
  const title =
    markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || "Japanese lyrics";
  const segments = markdown.split(MARKDOWN_HR);
  let best: string[] = [];
  for (const segment of segments) {
    const lines = segment
      .split("\n")
      .map((raw) => raw.replace(/\u00a0/g, " ").trim())
      .filter((line) => line && isJapaneseLyricLine(line));
    if (lines.length > best.length) best = lines;
  }
  return { title, lines: best };
}
