import test from "node:test";
import assert from "node:assert/strict";
import { convertImeValue } from "../src/lib/ime.ts";

test("converts clean romaji readings to hiragana", () => {
  assert.equal(convertImeValue("yorunikakeru"), "よるにかける");
  assert.equal(convertImeValue("yoru ni kakeru"), "よる に かける");
  assert.equal(convertImeValue("sakura"), "さくら");
  assert.equal(convertImeValue("guiano"), "ぐいあの");
  assert.equal(convertImeValue("よるni"), "よるに");
  assert.equal(convertImeValue("nn"), "ん");
});

test("leaves English words and incomplete romaji untouched", () => {
  assert.equal(convertImeValue("Lemon"), null);
  assert.equal(convertImeValue("lemonade"), null);
  assert.equal(convertImeValue("ghost"), null);
  assert.equal(convertImeValue("yor"), null);
  assert.equal(convertImeValue("n"), null);
  assert.equal(convertImeValue("ch"), null);
});

test("never converts text typed before switching to Japanese input", () => {
  // "Lemon" was typed in English mode (protected); only "na" after the switch
  // becomes kana.
  assert.equal(convertImeValue("Lemonna", 5), "Lemonな");
  assert.equal(convertImeValue("lemon no", 5), "lemon の");
  // A protected kana prefix also stays untouched.
  assert.equal(convertImeValue("よるにかけるni", 6), "よるにかけるに");
});

test("handles sokuon (っ) tails like suiseiressha", () => {
  assert.equal(convertImeValue("suiseiressha"), "すいせいれっしゃ");
  assert.equal(convertImeValue("すいせいれssha"), "すいせいれっしゃ");
  assert.equal(convertImeValue("katta"), "かった");
  assert.equal(convertImeValue("gakkou"), "がっこう");
});

test("leaves kana and mixed text without a trailing romaji run alone", () => {
  assert.equal(convertImeValue("よるにかける"), null);
  assert.equal(convertImeValue("花火"), null);
  assert.equal(convertImeValue(""), null);
});
