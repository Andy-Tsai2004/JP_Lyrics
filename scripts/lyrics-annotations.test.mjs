import assert from "node:assert/strict";
import { test } from "node:test";
import { splitAnnotatedLine } from "../src/lib/lyrics/annotations.ts";

test("lifts a parenthesized reading into a furigana segment (the reported bug)", () => {
  assert.deepEqual(splitAnnotatedLine("覚めない　幻（ゆめ）見てた"), [
    { text: "覚めない　" },
    { text: "幻", furigana: "ゆめ" },
    { text: "見てた" },
  ]);
});

test("handles common kanji words with okurigana", () => {
  assert.deepEqual(splitAnnotatedLine("夜明け（よあけ）の空へ"), [
    { text: "夜明け", furigana: "よあけ" },
    { text: "の空へ" },
  ]);
  assert.deepEqual(splitAnnotatedLine("美味しい（おいしい）ご飯"), [
    { text: "美味しい", furigana: "おいしい" },
    { text: "ご飯" },
  ]);
});

test("normalizes katakana annotations to hiragana", () => {
  assert.deepEqual(splitAnnotatedLine("幻（ユメ）を見てた"), [
    { text: "幻", furigana: "ゆめ" },
    { text: "を見てた" },
  ]);
});

test("handles multiple annotations in one line", () => {
  assert.deepEqual(splitAnnotatedLine("幻（ゆめ）見てた 夜空（よぞら）"), [
    { text: "幻", furigana: "ゆめ" },
    { text: "見てた " },
    { text: "夜空", furigana: "よぞら" },
  ]);
});

test("accepts half-width parentheses", () => {
  assert.deepEqual(splitAnnotatedLine("幻(ゆめ)を見てた"), [
    { text: "幻", furigana: "ゆめ" },
    { text: "を見てた" },
  ]);
});

test("leaves lines with no annotation untouched (whole line passes through)", () => {
  assert.deepEqual(splitAnnotatedLine("覚めない幻見てた"), [
    { text: "覚めない幻見てた" },
  ]);
  assert.deepEqual(splitAnnotatedLine("ただそれだけ"), [{ text: "ただそれだけ" }]);
});

test("does not mistake a bare parenthetical or kana-before-paren for a reading", () => {
  // kana before the paren => the preceding kanji isn't annotated; pass through.
  assert.deepEqual(splitAnnotatedLine("純粋な気持ち（きもち）"), [
    { text: "純粋な" },
    { text: "気持ち", furigana: "きもち" },
  ]);
  // A parenthetical that is not a pure kana run (e.g. a note) is not a reading.
  assert.deepEqual(splitAnnotatedLine("覚めない（笑）幻見てた"), [
    { text: "覚めない（笑）幻見てた" },
  ]);
  // Reading text containing a separator is not a pure kana run, so it passes through.
  assert.deepEqual(splitAnnotatedLine("幻（まぼろし・ゆめ）を見てた"), [
    { text: "幻（まぼろし・ゆめ）を見てた" },
  ]);
});
