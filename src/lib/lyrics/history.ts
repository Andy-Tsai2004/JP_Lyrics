import { useCallback, useState } from "react";
import type { LyricsResult } from "./types";

export type SongRecord = {
  sourceUrl: string;
  title: string;
  fetchedAt: number;
};

const HISTORY_KEY = "jplyrics:history";
const MAX_RECORDS = 50;

function readHistory(): SongRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SongRecord =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as SongRecord).sourceUrl === "string" &&
          typeof (item as SongRecord).title === "string" &&
          typeof (item as SongRecord).fetchedAt === "number",
      )
      .slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

function writeHistory(records: SongRecord[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
  } catch {
    // storage unavailable / full — history is best-effort
  }
}

export function useSongHistory() {
  const [records, setRecords] = useState<SongRecord[]>(readHistory);

  const add = useCallback((result: LyricsResult) => {
    setRecords((prev) => {
      const next = [
        {
          sourceUrl: result.sourceUrl,
          title: result.title,
          fetchedAt: Date.now(),
        },
        ...prev.filter((record) => record.sourceUrl !== result.sourceUrl),
      ].slice(0, MAX_RECORDS);
      writeHistory(next);
      return next;
    });
  }, []);

  const remove = useCallback((sourceUrl: string) => {
    setRecords((prev) => {
      const next = prev.filter((record) => record.sourceUrl !== sourceUrl);
      writeHistory(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecords([]);
    writeHistory([]);
  }, []);

  return { records, add, remove, clear };
}
