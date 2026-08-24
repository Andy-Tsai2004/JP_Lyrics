import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeForMatch,
  parseLrc,
  pickNeteaseSong,
  splitTitle,
} from "../src/lib/lyrics/lrc.ts";

test("parseLrc keeps timed lyric lines and skips metadata/blank lines", () => {
  const lrc = `[00:00.000] 作词 : Ayase
[00:00.357] 作曲 : Ayase
[00:01.430]沈むように溶けてゆくように
[00:08.831]二人だけの空が広がる夜に
[00:21.295]
[00:31.481]「さよなら」だけだった`;

  const lines = parseLrc(lrc);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0], {
    text: "沈むように溶けてゆくように",
    tokens: [{ text: "沈むように溶けてゆくように" }],
    start: 1.43,
    end: 8.831,
  });
  assert.equal(lines[1].start, 8.831);
  assert.equal(lines[2].start, 31.481);
  // The last line gets a short default tail.
  assert.equal(lines[2].end, 35.481);
});

test("parseLrc expands repeated timestamps on one line", () => {
  const lines = parseLrc("[00:10.000][00:42.000]夜に駆け出していく");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].start, 10);
  assert.equal(lines[1].start, 42);
});

test("parseLrc sorts out-of-order lines by start time", () => {
  const lines = parseLrc("[00:30.000]B\n[00:10.000]A");
  assert.deepEqual(
    lines.map((line) => line.text),
    ["A", "B"],
  );
});

test("pickNeteaseSong prefers the exact title + artist match", () => {
  const songs = [
    { id: 1, name: "夜に駆ける", artist: "ALKALOID" },
    { id: 2, name: "夜に駆ける", artist: "YOASOBI" },
  ];
  assert.equal(pickNeteaseSong(songs, "夜に駆ける", "YOASOBI")?.id, 2);
  assert.equal(pickNeteaseSong(songs, "夜に駆ける")?.id, 1);
  assert.equal(pickNeteaseSong([], "夜に駆ける"), null);
});

test("splitTitle handles the Uta-Net 'song - artist' title format", () => {
  assert.deepEqual(splitTitle("花火 - Guiano"), { song: "花火", artist: "Guiano" });
  assert.deepEqual(splitTitle("Not Enough (feat. Olivia Marsh) - ALAN SHIRAHAMA"), {
    song: "Not Enough (feat. Olivia Marsh)",
    artist: "ALAN SHIRAHAMA",
  });
  assert.deepEqual(splitTitle("花火"), { song: "花火", artist: undefined });
});

test("normalizeForMatch ignores spacing and common punctuation", () => {
  assert.equal(normalizeForMatch("夜に駆ける"), normalizeForMatch("夜 に 駆ける"));
  assert.equal(normalizeForMatch("『アイドル』"), normalizeForMatch("アイドル"));
  assert.equal(normalizeForMatch("YOASOBI"), normalizeForMatch("yoasobi"));
});
