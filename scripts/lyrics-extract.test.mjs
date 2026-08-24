import test from "node:test";
import assert from "node:assert/strict";
import { extractUtaNetLyricsFromMarkdown } from "../src/lib/lyrics/extract.ts";

const englishMarkdown = `Title: 「Not Enough (feat. Olivia Marsh)/ALAN SHIRAHAMA」の歌詞 って「イイネ！」
URL Source: https://www.uta-net.com/song/397128/

Markdown Content:
# [![Image 1: ...](https://www.uta-net.com/)](https://www.uta-net.com/)

## Not Enough (feat. Olivia Marsh)

### [ALAN SHIRAHAMA](https://www.uta-net.com/artist/35628/)

作詞：[CJ Baran・Jamil Kazmi・Olivia Marsh](https://www.uta-net.com/lyricist/61397/)

[購入]

[シェア]

Play "Not Enough (feat.…" 

 on Amazon Music Unlimited (ad)

Silhouette

Of you and me, there's nothing left

We're burnt out, baby, cigarettes

I gave you all my love, but it's not enough

You got me going, mm, but it's not enough

It's not enough

[この歌詞をマイ歌ネットに登録>](https://www.uta-net.com/renew/myutanet/song_book.php?mode=add&ID=397128)

[このアーティストをマイ歌ネットに登録>](https://www.uta-net.com/renew/myutanet/artist.php?mode=add&aID=35628&ID=397128)
`;

const japaneseMarkdown = `Title: 「となりのトトロ/井上あずみ」の歌詞 って「イイネ！」
URL Source: https://www.uta-net.com/song/5064/

Markdown Content:
# [![Image 1: ...](https://www.uta-net.com/)](https://www.uta-net.com/)

## となりのトトロ

### [井上あずみ](https://www.uta-net.com/artist/1864/)

作詞：[宮崎駿](https://www.uta-net.com/lyricist/28368/)

[購入]

[シェア]

Play "となりのトトロ" 

 on Amazon Music Unlimited (ad)

トトロ トトロ トトロ トトロ

だれかが こっそり

小路に 木の実 うずめて

森へのパスポート

[この歌詞をマイ歌ネットに登録>](https://www.uta-net.com/renew/myutanet/song_book.php?mode=add&ID=5064)
`;

test("extracts English lyrics from Uta-Net markdown", () => {
  const { title, lines } = extractUtaNetLyricsFromMarkdown(englishMarkdown);
  assert.equal(title, "Not Enough (feat. Olivia Marsh) - ALAN SHIRAHAMA");
  assert.ok(lines.length >= 6, "expected the English lyric lines");
  assert.ok(lines.includes("Silhouette"));
  assert.ok(lines.includes("I gave you all my love, but it's not enough"));
  assert.ok(lines.every((line) => !/^Play /.test(line)));
  assert.ok(lines.every((line) => !/Amazon Music/.test(line)));
  assert.ok(!lines.includes("購入"));
  assert.ok(!lines.includes("シェア"));
});

test("extracts Japanese lyrics from Uta-Net markdown", () => {
  const { title, lines } = extractUtaNetLyricsFromMarkdown(japaneseMarkdown);
  assert.equal(title, "となりのトトロ - 井上あずみ");
  assert.ok(lines.includes("トトロ トトロ トトロ トトロ"));
  assert.ok(lines.includes("森へのパスポート"));
  assert.ok(lines.every((line) => !/^Play /.test(line)));
});
