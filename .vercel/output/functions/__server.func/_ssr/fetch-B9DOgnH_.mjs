import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { i as string, r as object } from "../_libs/zod.mjs";
import { t as load } from "../_libs/cheerio+[...].mjs";
import { t as src_default } from "../_libs/kuroshiro.mjs";
import { t as Analyzer } from "../_libs/kuroshiro-analyzer-kuromoji.mjs";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
//#region node_modules/.nitro/vite/services/ssr/assets/fetch-B9DOgnH_.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var HIRAGANA = /[\u3041-\u3096]/;
var KATAKANA = /[\u30A1-\u30FA]/;
var METADATA = /作詞|作曲|編曲|歌唱|翻譯|翻好玩|Version|cv\.|CV[:：]|巴哈姆特|人氣|巴幣/;
function isJapaneseLyricLine(line) {
	const t = line.trim();
	if (t.length < 2) return false;
	if (METADATA.test(t)) return false;
	if (/^【/.test(t)) return false;
	if (!(HIRAGANA.test(t) || KATAKANA.test(t))) return false;
	return (t.match(/[\u3040-\u30FF\u4E00-\u9FFF]/g) ?? []).length / t.length >= .35;
}
function extractJapaneseLines(html) {
	const $ = load(html);
	const title = $("h1.article-title").first().text().trim() || $("title").first().text().trim() || "Japanese lyrics";
	const article = $("#article_content").length ? $("#article_content") : $("#article").length ? $("#article") : $("body");
	let stage = article.find("hr").length > 0 ? 0 : 1;
	const collected = [];
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
	if (collected.length === 0) article.find("div, p, font").each((_, el) => {
		const $el = $(el);
		if ($el.find("div, p, font").length > 0) return;
		const text = $el.text().replace(/\u00a0/g, " ").trim();
		if (text) collected.push(text);
	});
	return {
		title,
		lines: collected.filter(isJapaneseLyricLine)
	};
}
var converter = null;
var initPromise = null;
function ctor(mod) {
	return mod.default ?? mod;
}
function resolveDictPath() {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const require = createRequire(import.meta.url);
	const candidates = [
		path.join(path.dirname(require.resolve("kuromoji/package.json")), "dict"),
		path.join(process.cwd(), "node_modules/kuromoji/dict"),
		path.join(process.cwd(), "kuromoji-dict"),
		path.join(process.cwd(), "server/kuromoji-dict"),
		path.join(here, "../../../server/kuromoji-dict"),
		path.join(here, "kuromoji-dict")
	];
	for (const dir of candidates) try {
		if (existsSync(path.join(dir, "base.dat.gz"))) return dir;
	} catch {}
	throw new Error("Japanese dictionary files were not found on the server.");
}
async function getConverter() {
	if (converter) return converter;
	if (!initPromise) initPromise = (async () => {
		const dictPath = resolveDictPath();
		const KS = ctor(src_default);
		const Analyzer$1 = ctor(Analyzer);
		const instance = new KS();
		await instance.init(new Analyzer$1({ dictPath }));
		converter = instance;
		return instance;
	})();
	return initPromise;
}
function decodeEntities(s) {
	return s.replace(/</g, "<").replace(/>/g, ">").replace(/&/g, "&").replace(/"/g, "\"").replace(/&#39;/g, "'");
}
function htmlToTokens(html) {
	const tokens = [];
	const re = /<ruby>([\s\S]*?)<\/ruby>|([^<]+)/g;
	let match;
	while (match = re.exec(html)) {
		if (match[2]) {
			tokens.push({ text: decodeEntities(match[2]) });
			continue;
		}
		const inner = match[1] ?? "";
		const rt = /<rt>([\s\S]*?)<\/rt>/.exec(inner)?.[1] ?? "";
		const text = decodeEntities(inner.replace(/<rt>[\s\S]*?<\/rt>|<rp>[\s\S]*?<\/rp>/g, ""));
		const furigana = decodeEntities(rt).trim();
		if (text) tokens.push(furigana ? {
			text,
			furigana
		} : { text });
	}
	return tokens;
}
async function addFurigana(lines) {
	const kuroshiro = await getConverter();
	const result = [];
	for (const text of lines) {
		const html = await kuroshiro.convert(text, {
			to: "hiragana",
			mode: "furigana"
		});
		result.push({
			text,
			tokens: htmlToTokens(html)
		});
	}
	return result;
}
var BAHAMUT_HOST = /(^|\.)gamer\.com\.tw$/i;
function assertBahamutUrl(raw) {
	let url;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new Error("Please paste a valid URL.");
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http(s) URLs are allowed.");
	if (!BAHAMUT_HOST.test(url.hostname)) throw new Error("Only Bahamut (gamer.com.tw) artwork links are supported.");
	if (!url.pathname.includes("artwork.php") && !url.searchParams.get("sn")) throw new Error("Use a Bahamut artwork link, e.g. artwork.php?sn=…");
	return url;
}
var fetchBahamutLyrics_createServerFn_handler = createServerRpc({
	id: "9f2bc4f468457a5ece8cfdf7a7dc28ee0bfbff709086b2588d2fbda778f1eb15",
	name: "fetchBahamutLyrics",
	filename: "src/lib/lyrics/fetch.ts"
}, (opts) => fetchBahamutLyrics.__executeServer(opts));
var fetchBahamutLyrics = createServerFn({ method: "POST" }).validator(object({ url: string().min(8) })).handler(fetchBahamutLyrics_createServerFn_handler, async ({ data }) => {
	const url = assertBahamutUrl(data.url);
	const response = await fetch(url.toString(), {
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			Accept: "text/html,application/xhtml+xml",
			"Accept-Language": "ja,zh-TW,en;q=0.8"
		},
		redirect: "follow"
	});
	if (!response.ok) throw new Error(`Bahamut returned ${response.status}. Try again in a moment.`);
	const { title, lines } = extractJapaneseLines(await response.text());
	if (lines.length === 0) throw new Error("No Japanese lyric lines were found. This post may not use the usual 日 / 羅 / 中 layout.");
	const withRuby = await addFurigana(lines);
	return {
		sourceUrl: url.toString(),
		title,
		lines: withRuby
	};
});
//#endregion
export { fetchBahamutLyrics_createServerFn_handler };
