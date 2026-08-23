import test from "node:test";
import assert from "node:assert/strict";
import {
  artistMatches,
  buildUtaNetArtistSearchUrl,
  buildUtaNetLyricsSearchUrl,
  buildUtaNetSearchUrl,
  extractUtaNetArtistSongs,
  extractUtaNetArtistsFromHtml,
  extractUtaNetArtistsFromMarkdown,
  extractUtaNetSearchFromHtml,
  extractUtaNetSearchFromMarkdown,
  extractUtaNetLyricsFromHtml,
  filterArtistSongsByTitle,
  normalizeSearchText,
  pickArtist,
  searchQueryCandidates,
  titleMatches,
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

const twoTableHtml = `<html><body>
<table class="table table-sm table-borderless songlist-table th-col-5" summary="曲一覧1">
  <thead class="sp-none"><tr class="border-bottom"><th>曲名</th><th>歌手名</th><th>作詞者名</th><th>作曲者名</th><th>編曲者名</th><th>歌い出し</th></tr></thead>
  <tbody class="songlist-table-body">
    <tr class="border-bottom"><td class="sp-w-100 pt-0 pt-lg-2"><a href="/song/244127/" class="py-2 py-lg-0"><span class="fw-bold songlist-title">Lemon</span><span class="d-block d-lg-none utaidashi">米津玄師</span></a></td><td class="sp-none fw-bold"><a href="/artist/12795/">米津玄師</a></td><td class="sp-none fw-bold"><a href="/lyricist/36733/">米津玄師</a></td><td class="sp-none fw-bold"><a href="/composer/37297/">米津玄師</a></td><td class="sp-none fw-bold"><a href="/arranger/0/"></a></td><td class="sp-none fw-bold"><span class="d-block pc-utaidashi">夢ならばどれほどよかったでしょう</span></td></tr>
  </tbody>
</table>
<table class="table table-sm table-borderless songlist-table th-col-5" summary="曲一覧2">
  <thead class="sp-none"><tr class="border-bottom"><th>曲名</th><th>歌手名</th><th>作詞者名</th><th>作曲者名</th><th>編曲者名</th><th>歌い出し</th></tr></thead>
  <tbody class="songlist-table-body">
    <tr class="border-bottom"><td class="sp-w-100 pt-0 pt-lg-2"><a href="/song/78101/" class="py-2 py-lg-0"><span class="fw-bold songlist-title">Lemon Moon</span><span class="d-block d-lg-none utaidashi">LEO今井</span></a></td><td class="sp-none fw-bold"><a href="/artist/7305/">LEO今井</a></td><td class="sp-none fw-bold"><a href="/lyricist/9926/">Leo Imai</a></td><td class="sp-none fw-bold"><a href="/composer/11707/">Leo Imai</a></td><td class="sp-none fw-bold"><a href="/arranger/0/"></a></td><td class="sp-none fw-bold"><span class="d-block pc-utaidashi">空き部屋のような心ん中</span></td></tr>
  </tbody>
</table>
</body></html>`;

const singleLineMarkdown = `Markdown Content:
[レモン 川嶋あい](https://www.uta-net.com/song/148710/)[川嶋あい](https://www.uta-net.com/artist/3093/)[川嶋あい](https://www.uta-net.com/lyricist/30310/)[川嶋あい](https://www.uta-net.com/composer/31820/)[Kosuke Oba](https://www.uta-net.com/arranger/10492/)真夏の恋はヒリヒリするね
[lemonade Chilli Beans.](https://www.uta-net.com/song/321409/)[Chilli Beans.](https://www.uta-net.com/artist/30272/)[Chilli Beans.](https://www.uta-net.com/lyricist/46570/)[Chilli Beans.・Vaundy](https://www.uta-net.com/composer/47094/)[](https://www.uta-net.com/arranger/0/)何気ない君のその仕草に
`;

const crownedTitleMarkdown = `Markdown Content:
| 曲名 | 歌手名 | 作詞者名 | 作曲者名 | 編曲者名 | 歌い出し |
| --- | --- | --- | --- | --- | --- |
| [はいよろこんで![Image 30: MILLION LYLIC](https://ures.jp/uta-net.com/img/ranking/crown_million.png)こっちのけんと](https://www.uta-net.com/song/359864/) | [こっちのけんと](https://www.uta-net.com/artist/37194/) | [こっちのけんと](https://www.uta-net.com/lyricist/55478/) | [こっちのけんと・GRP](https://www.uta-net.com/composer/56820/) | [GRP](https://www.uta-net.com/arranger/1837/) | 『はい喜んで』 『あなた方のため』 |
`;

const artistSearchHtml = `<html><body>
<table class="table table-sm table-borderless songlist-table" summary="検索結果">
  <tbody class="songlist-table-body">
    <tr class="border-bottom"><td class="pt-2"><a class="d-block" href="/artist/28756/"><span class="fw-bold">Guiano</span><br><span class="song-count">歌詞：51</span><br></a></td></tr>
    <tr class="border-bottom"><td class="pt-2"><a class="d-block" href="/artist/35063/"><span class="fw-bold">Guiano×理芽</span><br><span class="song-count">歌詞：8</span><br></a></td></tr>
  </tbody>
</table>
</body></html>`;

const lyricsSearchHtml = `<html><body>
<dl id="search_list">
  <dt><span class="font_base_size_L"><a href="/song/244127/">Lemon</a> </span><a href="./search2.html?ss=4&md=Artist&at=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB&kw=%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB&ct=&rc=20">米津玄師</a> （作詞：<a href="#">米津玄師</a>/作曲：<a href="#">米津玄師</a>）</dt>
  <dd><p>夢ならばどれほどよかったでしょう 未だに<span class="keyword">あなた</span>のことを夢にみる 忘れた物を取りに帰るように</p></dd>
</dl>
</body></html>`;

test("builds the Uta-Net song-title search URL", () => {
  const url = buildUtaNetSearchUrl("夜に駆ける");
  assert.equal(url.origin + url.pathname, "https://www.uta-net.com/search/");
  assert.equal(url.searchParams.get("Aselect"), "2");
  assert.equal(url.searchParams.get("Keyword"), "夜に駆ける");
  assert.equal(url.searchParams.get("sort"), "4");
});

test("builds the Uta-Net artist search URL", () => {
  const url = buildUtaNetArtistSearchUrl("guiano");
  assert.equal(url.origin + url.pathname, "https://www.uta-net.com/search/");
  assert.equal(url.searchParams.get("target"), "art");
  assert.equal(url.searchParams.get("type"), "in");
  assert.equal(url.searchParams.get("Keyword"), "guiano");
});

test("builds the Uta-Net full-lyrics search URL", () => {
  const url = buildUtaNetLyricsSearchUrl("あなた");
  assert.equal(
    url.origin + url.pathname,
    "https://www.uta-net.com/user/index_search/search2.html",
  );
  assert.equal(url.searchParams.get("st"), "Popular2");
  assert.equal(url.searchParams.get("rc"), "20");
  assert.equal(url.searchParams.get("kw"), "あなた");
  assert.equal(url.searchParams.get("md"), "Kashi");
});

test("matches titles and artists case/space-insensitively", () => {
  assert.equal(normalizeSearchText(" 夜に駆ける "), "夜に駆ける");
  assert.equal(normalizeSearchText("Yoasobi"), "yoasobi");
  assert.ok(titleMatches("夜に駆ける", "夜に駆ける"));
  assert.ok(titleMatches("Lemon", "lemon"));
  assert.ok(titleMatches("blue bird", "BlueBird"));
  assert.ok(!titleMatches("花火", "Lemon"));
  assert.ok(artistMatches("YOASOBI", "yoasobi"));
  assert.ok(artistMatches("Guiano×理芽", "guiano"));
  assert.ok(!artistMatches("Guiano", "米津玄師"));
});

test("picks the exact artist match first", () => {
  const artists = [
    { name: "Guiano×理芽", artistUrl: "https://www.uta-net.com/artist/35063/", songCount: 8 },
    { name: "Guiano", artistUrl: "https://www.uta-net.com/artist/28756/", songCount: 51 },
  ];
  assert.equal(pickArtist(artists, "guiano")?.artistUrl, "https://www.uta-net.com/artist/28756/");
  assert.equal(pickArtist(artists, "Guiano×理芽")?.artistUrl, "https://www.uta-net.com/artist/35063/");
  assert.equal(pickArtist([], "guiano"), null);
});

test("filters artist songs by reading-aware title matches", () => {
  const artistSongs = [
    { title: "花火", artist: "Guiano", songUrl: "https://www.uta-net.com/song/397348/" },
    { title: "藍空、ミラー", artist: "Guiano", songUrl: "https://www.uta-net.com/song/386798/" },
  ];
  const titleSongs = [
    { title: "HANABI", artist: "Mr.Children", songUrl: "https://www.uta-net.com/song/1/" },
    { title: "花火", artist: "aiko", songUrl: "https://www.uta-net.com/song/2/" },
    { title: "はなびら", artist: "back number", songUrl: "https://www.uta-net.com/song/3/" },
  ];
  const matched = filterArtistSongsByTitle(artistSongs, titleSongs, "はなび");
  assert.equal(matched.length, 1);
  assert.equal(matched[0].title, "花火");
  assert.equal(matched[0].artist, "Guiano");
});

test("converts romaji song queries to hiragana candidates", () => {
  assert.deepEqual(searchQueryCandidates("yorunikakeru"), [
    "よるにかける",
    "yorunikakeru",
  ]);
  assert.deepEqual(searchQueryCandidates("yoru ni kakeru"), [
    "よるにかける",
    "yoru ni kakeru",
  ]);
  assert.deepEqual(searchQueryCandidates("Yoru Ni Kakeru"), [
    "よるにかける",
    "Yoru Ni Kakeru",
  ]);
  assert.deepEqual(searchQueryCandidates("sakura"), ["さくら", "sakura"]);
  assert.deepEqual(searchQueryCandidates("Lemon"), ["Lemon", "ぇもん"]);
  assert.deepEqual(searchQueryCandidates("ghost"), ["ghost", "gほst"]);
});

test("keeps Japanese queries unchanged", () => {
  assert.deepEqual(searchQueryCandidates("夜に駆ける"), ["夜に駆ける"]);
  assert.deepEqual(searchQueryCandidates("レミオロメン 3月9日"), [
    "レミオロメン 3月9日",
  ]);
  assert.deepEqual(searchQueryCandidates("  "), [""]);
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

test("keeps the popularity table first when HTML has two result tables", () => {
  const results = extractUtaNetSearchFromHtml(twoTableHtml);
  assert.equal(results.length, 2);
  assert.equal(results[0].title, "Lemon");
  assert.equal(results[0].artist, "米津玄師");
  assert.equal(results[1].title, "Lemon Moon");
  assert.equal(results[1].artist, "LEO今井");
});

test("parses single-line search results from markdown", () => {
  const results = extractUtaNetSearchFromMarkdown(singleLineMarkdown);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {
    title: "レモン",
    artist: "川嶋あい",
    songUrl: "https://www.uta-net.com/song/148710/",
    firstLine: "真夏の恋はヒリヒリするね",
  });
  assert.deepEqual(results[1], {
    title: "lemonade",
    artist: "Chilli Beans.",
    songUrl: "https://www.uta-net.com/song/321409/",
    firstLine: "何気ない君のその仕草に",
  });
});

test("parses titles with inline images from markdown", () => {
  const results = extractUtaNetSearchFromMarkdown(crownedTitleMarkdown);
  assert.equal(results.length, 1);
  assert.deepEqual(results[0], {
    title: "はいよろこんで",
    artist: "こっちのけんと",
    songUrl: "https://www.uta-net.com/song/359864/",
    firstLine: "『はい喜んで』 『あなた方のため』",
  });
});

test("parses artist results from HTML", () => {
  const results = extractUtaNetArtistsFromHtml(artistSearchHtml);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {
    name: "Guiano",
    artistUrl: "https://www.uta-net.com/artist/28756/",
    songCount: 51,
  });
  assert.deepEqual(results[1], {
    name: "Guiano×理芽",
    artistUrl: "https://www.uta-net.com/artist/35063/",
    songCount: 8,
  });
});

test("parses full-lyrics search results from HTML", () => {
  const results = extractUtaNetLyricsFromHtml(lyricsSearchHtml);
  assert.equal(results.length, 1);
  assert.deepEqual(results[0], {
    title: "Lemon",
    artist: "米津玄師",
    songUrl: "https://www.uta-net.com/song/244127/",
    firstLine:
      "夢ならばどれほどよかったでしょう 未だにあなたのことを夢にみる 忘れた物を取りに帰るように",
  });
});

test("parses artist results from markdown", () => {
  const results = extractUtaNetArtistsFromMarkdown(
    "[Guiano 歌詞：51](https://www.uta-net.com/artist/28756/)\n" +
      "[Guiano×理芽 歌詞：8](https://www.uta-net.com/artist/35063/)",
  );
  assert.equal(results.length, 2);
  assert.equal(results[0].name, "Guiano");
  assert.equal(results[0].songCount, 51);
  assert.equal(results[1].name, "Guiano×理芽");
});

test("parses an artist page's song list from HTML", () => {
  const results = extractUtaNetArtistSongs(searchHtml);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "夜に駆ける");
  assert.equal(results[0].artist, "岩佐美咲");
});

test("returns an empty list for a page with no results", () => {
  const emptyHtml = `<html><body><tbody class="songlist-table-body"></tbody></body></html>`;
  assert.deepEqual(extractUtaNetSearchFromHtml(emptyHtml), []);
  assert.deepEqual(extractUtaNetSearchFromMarkdown("Markdown Content:\n\nNo songs."), []);
});
