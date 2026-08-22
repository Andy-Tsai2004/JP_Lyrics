import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUtaNetSearchUrl,
  extractUtaNetSearchFromHtml,
  extractUtaNetSearchFromMarkdown,
} from "../src/lib/lyrics/search.ts";

const IDEOGRAPHIC_SPACE = "\u3000";

const searchMarkdown = `Title: 夜に駆ける${IDEOGRAPHIC_SPACE}歌詞リスト - 歌ネット

URL Source: https://www.uta-net.com/search/?Aselect=2&Keyword=%E5%A4%9C%E3%81%AB%E9%A7%86%E3%81%91%E3%82%8B

Markdown Content:

| 曲名 | 歌手名 | 作詞者名 | 作曲者名 | 編曲者名 | 歌い出し |
| --- | --- | --- | --- | --- | --- |
| [夜に駆ける 岩佐美咲](https://www.uta-net.com/song/319082/) | [岩佐美咲](https://www.uta-net.com/artist/12586/) | [Ayase](https://www.uta-net.com/lyricist/43927/) | [Ayase](https://www.uta-net.com/composer/44366/) | [](https://www.uta-net.com/arranger/0/) | 沈むように溶けてゆくように${IDEOGRAPHIC_SPACE}二人だけの空が広がる夜に |
| [夜に駆ける 奏みつき from Chase×Chase](https://www.uta-net.com/song/335169/) | [奏みつき from Chase×Chase](https://www.uta-net.com/artist/34274/) | [Ayase](https://www.uta-net.com/lyricist/43927/) | [Ayase](https://www.uta-net.com/composer/44366/) | [いぬみぎ](https://www.uta-net.com/arranger/24467/) | 沈むように溶けてゆくように |
`;

const searchHtml = `<html><body>
<table class="table table-sm table-borderless songlist-table th-col-5" summary="曲一覧1">
  <thead class="sp-none">
    <tr class="border-bottom"><th>曲名</th><th>歌手名</th><th>作詞者名</th><th>作曲者名</th><th>編曲者名</th><th>歌い出し</th></tr>
  </thead>
  <tbody class="songlist-table-body">
    <tr class="border-bottom">
      <td class="sp-w-100 pt-0 pt-lg-2"><a href="/song/319082/" class="py-2 py-lg-0"><span class="fw-bold songlist-title">夜に駆ける</span><span class="d-block d-lg-none utaidashi">岩佐美咲</span></a></td>
      <td class="sp-none fw-bold"><a href="/artist/12586/">岩佐美咲</a></td>
      <td class="sp-none fw-bold"><a href="/lyricist/43927/">Ayase</a></td>
      <td class="sp-none fw-bold"><a href="/composer/44366/">Ayase</a></td>
      <td class="sp-none fw-bold"><a href="/arranger/0/"></a></td>
      <td class="sp-none fw-bold"><span class="d-block pc-utaidashi">沈むように溶けてゆくように${IDEOGRAPHIC_SPACE}二人だけの空が広がる夜に</span></td>
    </tr>
  </tbody>
</table>
</body></html>`;

test("builds the Uta-Net song-title search URL", () => {
  const url = buildUtaNetSearchUrl("夜に駆ける");
  assert.equal(url.origin + url.pathname, "https://www.uta-net.com/search/");
  assert.equal(url.searchParams.get("Aselect"), "2");
  assert.equal(url.searchParams.get("Keyword"), "夜に駆ける");
});

test("parses search results from markdown", () => {
  const results = extractUtaNetSearchFromMarkdown(searchMarkdown);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {
    title: "夜に駆ける",
    artist: "岩佐美咲",
    songUrl: "https://www.uta-net.com/song/319082/",
    firstLine: `沈むように溶けてゆくように${IDEOGRAPHIC_SPACE}二人だけの空が広がる夜に`,
  });
  assert.deepEqual(results[1], {
    title: "夜に駆ける",
    artist: "奏みつき from Chase×Chase",
    songUrl: "https://www.uta-net.com/song/335169/",
    firstLine: "沈むように溶けてゆくように",
  });
});

test("parses search results from raw HTML", () => {
  const results = extractUtaNetSearchFromHtml(searchHtml);
  assert.equal(results.length, 1);
  assert.deepEqual(results[0], {
    title: "夜に駆ける",
    artist: "岩佐美咲",
    songUrl: "https://www.uta-net.com/song/319082/",
    firstLine: `沈むように溶けてゆくように${IDEOGRAPHIC_SPACE}二人だけの空が広がる夜に`,
  });
});

test("returns an empty list for a page with no results", () => {
  const emptyHtml = `<html><body><tbody class="songlist-table-body"></tbody></body></html>`;
  assert.deepEqual(extractUtaNetSearchFromHtml(emptyHtml), []);
  assert.deepEqual(extractUtaNetSearchFromMarkdown("Markdown Content:\n\nNo songs."), []);
});
