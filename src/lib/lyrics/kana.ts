import { toRomaji } from "wanakana";

const KATAKANA_RE = /[\u30A1-\u30FF]/;

export function containsKatakana(text: string): boolean {
  return KATAKANA_RE.test(text);
}

export function katakanaToHiragana(text: string): string {
  return text.replace(/[\u30A1-\u30F6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

export function katakanaToRomaji(text: string): string {
  return toRomaji(text, {
    passRomaji: true,
    upcaseKatakana: false,
  });
}
