import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Minimal client-side i18n: an English default plus a Traditional-Chinese
 * (繁體中文) locale, driven by a language switcher in the app toolbar. The
 * selected locale is persisted to localStorage so the choice survives reloads.
 *
 * Lyric / song content is intentionally NOT translated — only the UI chrome.
 */

export type Locale = "en" | "zh-Hant";

export const LOCALES: Locale[] = ["en", "zh-Hant"];

const en = {
  // Header
  "app.label": "歌詞ビューア",
  "app.title": "Japanese Lyrics Viewer",
  "app.subtitle":
    "Search Uta-Net for a song, or paste a Bahamut artwork / Uta-Net song link. The viewer keeps " +
    "only the Japanese lines and places ruby readings above the lyrics.",
  // Toolbar
  "toolbar.openFavorites": "Open favorites",
  "toolbar.openHistory": "Open history",
  "toolbar.favorites": "Favorites",
  "toolbar.history": "History",
  "lang.choose": "Choose language",
  // Tabs
  "tabs.loadLyrics": "Load lyrics",
  "tab.search": "Search Uta-Net",
  "tab.paste": "Paste link",
  // Search form
  "search.songName": "Song name",
  "search.artist": "Artist",
  "search.lyrics": "Lyrics",
  "search.lyricsUrl": "Lyrics URL",
  "search.search": "Search",
  "search.searching": "Searching",
  "search.fetching": "Fetching",
  "search.fetchLyrics": "Fetch lyrics",
  "search.clear": "Clear",
  "search.imeOn": "Japanese input on — romaji becomes kana as you type (Ctrl+;)",
  "search.imeOff": "Japanese input off — type English directly (Ctrl+;)",
  // Artist panel
  "artist.backToSearch": "Back to search results",
  "artist.openPage": "Open artist page",
  "artist.songsBy": "Songs by artist",
  "artist.loading": "Loading songs…",
  "artist.songsCount": "{n} songs",
  "artist.noResults": "No songs found for “{query}” on Uta-Net.",
  "artist.viewAll": "View all results on Uta-Net",
  "artist.artists": "Artists",
  "artist.artistsCount": "{n} artists",
  "artist.songsOnUtaNet": "{n} songs on Uta-Net",
  // Sample links
  "sample.utaNet": "Try Uta-Net sample",
  "sample.bahamut": "Try Bahamut sample",
  // Lyrics controls
  "lyrics.size": "Lyrics size",
  "lyrics.showRuby": "Show ruby",
  "lyrics.katakanaAid": "Katakana aid",
  "lyrics.romajiMode": "Romaji mode",
  "aid.off": "Off",
  "aid.hiragana": "Hiragana",
  "aid.romaji": "Romaji",
  // Empty / helper states
  "cta.reading": "Reading the page and adding readings…",
  "lyrics.fileLabel": "Japanese only",
  "lyrics.empty":
    "Lyrics will appear here with furigana over kanji and optional katakana aid in hiragana or romaji.",
  // Sync status
  "sync.loading": "Loading synced lyrics from NetEase…",
  "sync.synced": "Synced with NetEase timestamps",
  "sync.offset": "Offset",
  "sync.none": "No NetEase timestamps found — showing plain lyrics.",
  // Karaoke
  "karaoke.versions": "Karaoke versions",
  "karaoke.byConfidence": "— by confidence",
  "karaoke.changeVersion": "Change version",
  "karaoke.searching": "Searching karaoke…",
  "karaoke.none": "No backing track found for this song.",
  "karaoke.close": "Close karaoke options",
  "karaoke.error": "No usable karaoke / backing-track video was found.",
  "karaoke.searchYoutube": "Search on YouTube",
  // Song player
  "player.play": "Play",
  "player.pause": "Pause",
  "player.mute": "Mute",
  "player.unmute": "Unmute",
  "player.position": "Playback position",
  "player.volume": "Volume",
  "player.findKaraoke": "Find karaoke",
  "player.backToVocals": "Back to vocals",
  "player.findKaraokeTitle":
    "Find backing-track (karaoke / off-vocal / piano) versions of this song",
  "player.backToVocalsTitle": "Switch back to the original vocal video",
  "player.error.noEmbed": "This source has no embeddable official video.",
  "player.error.noKaraoke": "No embeddable karaoke / backing-track video was found.",
  "player.error.playback": "YouTube couldn’t play this video (region or licensing restrictions).",
  "player.error.load": "Couldn’t load the YouTube player, please try again later.",
  "player.searchYoutube": "Search YouTube for “{query}”",
  // Library drawer
  "library.clearAll": "Clear all",
  "library.close": "Close {heading}",
  "library.emptyFavorites": "No favorites yet — tap the heart on a song to save it here.",
  "library.emptyHistory": "No songs fetched yet.\nSongs you open will appear here.",
  "library.removeFavAria": "Remove {title} from favorites",
  "library.removeHistoryAria": "Remove {title} from history",
  // Relative time
  "time.justNow": "just now",
  "time.minutesAgo": "{n}m ago",
  "time.hoursAgo": "{n}h ago",
  "time.daysAgo": "{n}d ago",
  // Song result rows
  "song.openAria": "Open {title} on Uta-Net",
  "song.favAria": "Add {title} to favorites",
  "song.unfavAria": "Remove {title} from favorites",
  // Pagination
  "pagination.pages": "Result pages",
  "pagination.prev": "Previous page",
  "pagination.next": "Next page",
  // Error boundary
  "error.title": "Something went wrong",
  "error.message": "An unexpected error occurred. Try reloading the page.",
} as const;

type MessageKey = keyof typeof en;

export type Translate = (key: MessageKey, params?: Params) => string;

const zhHant: Record<MessageKey, string> = {
  "app.label": "歌詞檢視器",
  "app.title": "日文歌詞檢視器",
  "app.subtitle":
    "搜尋 Uta-Net 的歌曲，或貼上 Bahamut 文章 / Uta-Net 歌曲連結。檢視器只保留日文歌詞，" +
    "並在漢字上方加註讀音。",
  "toolbar.openFavorites": "開啟我的最愛",
  "toolbar.openHistory": "開啟歷史記錄",
  "toolbar.favorites": "我的最愛",
  "toolbar.history": "歷史記錄",
  "lang.choose": "選擇語言",
  "tabs.loadLyrics": "載入歌詞",
  "tab.search": "搜尋 Uta-Net",
  "tab.paste": "貼上連結",
  "search.songName": "歌曲名稱",
  "search.artist": "歌手",
  "search.lyrics": "歌詞",
  "search.lyricsUrl": "歌詞網址",
  "search.search": "搜尋",
  "search.searching": "搜尋中",
  "search.fetching": "擷取中",
  "search.fetchLyrics": "擷取歌詞",
  "search.clear": "清除",
  "search.imeOn": "日文輸入已開啟——輸入羅馬拼音時自動轉為假名 (Ctrl+;)",
  "search.imeOff": "日文輸入已關閉——直接輸入英文 (Ctrl+;)",
  "artist.backToSearch": "返回搜尋結果",
  "artist.openPage": "開啟歌手頁面",
  "artist.songsBy": "歌手歌曲",
  "artist.loading": "正在載入歌曲…",
  "artist.songsCount": "{n} 首歌",
  "artist.noResults": "在 Uta-Net 找不到「{query}」相關歌曲。",
  "artist.viewAll": "在 Uta-Net 檢視所有結果",
  "artist.artists": "歌手",
  "artist.artistsCount": "{n} 位歌手",
  "artist.songsOnUtaNet": "Uta-Net 上有 {n} 首歌",
  "sample.utaNet": "試用 Uta-Net 範例",
  "sample.bahamut": "試用 Bahamut 範例",
  "lyrics.size": "歌詞大小",
  "lyrics.showRuby": "漢字轉換",
  "lyrics.katakanaAid": "片假名轉換",
  "lyrics.romajiMode": "羅馬拼音模式",
  "aid.off": "關閉",
  "aid.hiragana": "平假名",
  "aid.romaji": "羅馬拼音",
  "cta.reading": "正在讀取頁面並加上讀音…",
  "lyrics.fileLabel": "僅日文",
  "lyrics.empty": "歌詞會顯示在這裡，漢字上方標註平假名，並可選用片假名輔助（平假名或羅馬拼音）。",
  "sync.loading": "正在從 NetEase 載入同步歌詞…",
  "sync.synced": "已與 NetEase 時間戳同步",
  "sync.offset": "偏移",
  "sync.none": "找不到 NetEase 時間戳——顯示純文字歌詞。",
  "karaoke.versions": "卡拉OK版本",
  "karaoke.byConfidence": "— 依信賴度",
  "karaoke.changeVersion": "更換版本",
  "karaoke.searching": "正在搜尋卡拉OK…",
  "karaoke.none": "找不到這首歌的伴唱／伴奏。",
  "karaoke.close": "關閉卡拉OK選項",
  "karaoke.error": "找不到可用的卡拉OK／伴奏影片。",
  "karaoke.searchYoutube": "在 YouTube 搜尋",
  "player.play": "播放",
  "player.pause": "暫停",
  "player.mute": "靜音",
  "player.unmute": "取消靜音",
  "player.position": "播放位置",
  "player.volume": "音量",
  "player.findKaraoke": "尋找卡拉OK",
  "player.backToVocals": "返回原唱",
  "player.findKaraokeTitle": "尋找這首歌的伴唱版（卡拉OK／純音樂／鋼琴版）",
  "player.backToVocalsTitle": "切換回原唱音樂影片",
  "player.error.noEmbed": "這個來源沒有可直接嵌入的官方影片。",
  "player.error.noKaraoke": "找不到可直接嵌入的卡拉OK／伴奏影片。",
  "player.error.playback": "YouTube 無法播放這個影片（可能受地區或版權限制）。",
  "player.error.load": "無法載入 YouTube 播放器，請稍後再試。",
  "player.searchYoutube": "在 YouTube 搜尋「{query}」",
  "library.clearAll": "全部清除",
  "library.close": "關閉{heading}",
  "library.emptyFavorites": "還沒有我的最愛——點擊歌曲上的愛心即可收藏。",
  "library.emptyHistory": "尚未擷取任何歌曲。\n開啟的歌曲會顯示在這裡。",
  "library.removeFavAria": "將「{title}」從我的最愛移除",
  "library.removeHistoryAria": "將「{title}」從歷史記錄中移除",
  "time.justNow": "剛剛",
  "time.minutesAgo": "{n} 分鐘前",
  "time.hoursAgo": "{n} 小時前",
  "time.daysAgo": "{n} 天前",
  "song.openAria": "在 Uta-Net 開啟「{title}」",
  "song.favAria": "將「{title}」加入我的最愛",
  "song.unfavAria": "將「{title}」從我的最愛移除",
  "pagination.pages": "結果頁面",
  "pagination.prev": "上一頁",
  "pagination.next": "下一頁",
  "error.title": "發生了一點問題",
  "error.message": "發生未預期的錯誤，請重新載入頁面。",
};

type Messages = { en: typeof en; "zh-Hant": Record<MessageKey, string> };

const messages: Messages = { en, "zh-Hant": zhHant };

type Params = Record<string, string | number>;

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export const localeName: Record<Locale, string> = {
  en: "English",
  "zh-Hant": "繁體中文",
};

const STORAGE_KEY = "jp-lyrics.locale";

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh-Hant") return stored;
  } catch {
    // localStorage unavailable — fall through to the default.
  }
  return "en";
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Params) => string;
};

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => messages.en[key],
});

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Ignore persistence failures — the in-memory locale still works.
    }
    document.documentElement.lang = locale;
    document.title = messages[locale]["app.title"];
  }, [locale]);

  const t = useCallback(
    (key: MessageKey, params?: Params) => interpolate(messages[locale][key], params),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
