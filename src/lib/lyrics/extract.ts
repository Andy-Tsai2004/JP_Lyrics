import * as cheerio from "cheerio";

const HIRAGANA = /[\u3041-\u3096]/;
const KATAKANA = /[\u30A1-\u30FA]/;

const METADATA =
  /作詞|作曲|編曲|歌唱|翻譯|翻好玩|Version|cv\.|CV[:：]|巴哈姆特|人氣|巴幣/;

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
