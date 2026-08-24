import { toHiragana } from "wanakana";

/**
 * Live romaji→kana input helper.
 *
 * Only the trailing romaji run is converted, and only when it forms a clean
 * Japanese reading: incomplete romaji (よr) and English words (Lemon → ぇもん)
 * are left alone. When the user switches from English back to Japanese input,
 * the text that was already there is "protected" and never converted — only
 * romaji typed after the switch becomes kana.
 */

const LATIN_SUFFIX_RE = /[A-Za-z ]+$/;
// A converted result starting with a small vowel kana (Lemon -> ぇもん) means
// the source was really an English word, not a Japanese reading. っ (sokuon)
// is allowed — it legitimately starts tails like ssha -> っしゃ.
const SMALL_KANA_START = /^[ぁぃぅぇぉゃゅょ]/;

/**
 * Returns the converted value, or null when nothing should be converted yet
 * (incomplete romaji, English text, or no romaji to convert). `protectedLength`
 * marks a leading prefix that was typed before switching to Japanese input;
 * only romaji after it is considered for conversion.
 */
export function convertImeValue(value: string, protectedLength = 0): string | null {
  const match = value.match(LATIN_SUFFIX_RE);
  if (!match) return null;
  const suffixStart = match.index ?? 0;
  const convertStart = Math.max(suffixStart, protectedLength);
  if (convertStart >= value.length) return null;

  const prefix = value.slice(0, convertStart);
  const tail = value.slice(convertStart);
  const kana = toHiragana(tail, { IMEMode: true });
  if (kana === tail) return null; // nothing convertible yet
  if (/[A-Za-z]/.test(kana)) return null; // incomplete romaji — keep typing
  if (SMALL_KANA_START.test(kana)) return null; // mangled English
  return prefix + kana;
}

type ImeHandlers = {
  onInput: (event: Event) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
};

const handlers = new WeakMap<Element, ImeHandlers>();
const composing = new WeakSet<Element>();
const protectedPrefixes = new WeakMap<Element, string>();

/**
 * Protect the current value of an input so switching to Japanese input never
 * converts text that was typed before the switch.
 */
export function setImeProtectedPrefix(
  el: HTMLInputElement | HTMLTextAreaElement,
  prefix: string,
): void {
  protectedPrefixes.set(el, prefix);
}

export function bindIme(el: HTMLInputElement | HTMLTextAreaElement): void {
  if (handlers.has(el)) return;

  const onInput = (_event: Event) => {
    if (composing.has(el)) return; // let the OS-level IME drive composition
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const oldValue = el.value;

    const guard = protectedPrefixes.get(el) ?? "";
    let protectedLength = 0;
    if (guard) {
      if (oldValue.startsWith(guard)) {
        protectedLength = guard.length;
      } else {
        // The protected text was edited or cleared — start fresh.
        protectedPrefixes.delete(el);
      }
    }

    const next = convertImeValue(oldValue, protectedLength);
    if (next == null || next === oldValue) return;

    el.value = next;
    const delta = next.length - oldValue.length;
    const cursor = Math.min(el.value.length, end + delta);
    el.setSelectionRange(cursor, cursor);
    // Let React's onChange pick up the converted value.
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const onCompositionStart = () => composing.add(el);
  const onCompositionEnd = () => composing.delete(el);

  el.addEventListener("input", onInput);
  el.addEventListener("compositionstart", onCompositionStart);
  el.addEventListener("compositionend", onCompositionEnd);
  handlers.set(el, { onInput, onCompositionStart, onCompositionEnd });
}

export function unbindIme(el: HTMLInputElement | HTMLTextAreaElement): void {
  const bound = handlers.get(el);
  if (!bound) return;
  el.removeEventListener("input", bound.onInput);
  el.removeEventListener("compositionstart", bound.onCompositionStart);
  el.removeEventListener("compositionend", bound.onCompositionEnd);
  handlers.delete(el);
  composing.delete(el);
}
