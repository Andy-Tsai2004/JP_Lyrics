import { useCallback, useState } from "react";
export type SongFavorite = {
  sourceUrl: string;
  title: string;
  favoritedAt: number;
};

const FAVORITES_KEY = "jplyrics:favorites";
const MAX_FAVORITES = 100;

function readFavorites(): SongFavorite[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SongFavorite =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as SongFavorite).sourceUrl === "string" &&
          typeof (item as SongFavorite).title === "string" &&
          typeof (item as SongFavorite).favoritedAt === "number",
      )
      .slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

function writeFavorites(favorites: SongFavorite[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // storage unavailable / full — favorites are best-effort
  }
}

export function useSongFavorites() {
  const [favorites, setFavorites] = useState<SongFavorite[]>(readFavorites);

  const isFavorite = useCallback(
    (sourceUrl: string) => favorites.some((favorite) => favorite.sourceUrl === sourceUrl),
    [favorites],
  );

  const toggle = useCallback((song: { sourceUrl: string; title: string }) => {
    setFavorites((prev) => {
      if (prev.some((favorite) => favorite.sourceUrl === song.sourceUrl)) {
        const next = prev.filter((favorite) => favorite.sourceUrl !== song.sourceUrl);
        writeFavorites(next);
        return next;
      }
      const next = [
        { sourceUrl: song.sourceUrl, title: song.title, favoritedAt: Date.now() },
        ...prev,
      ].slice(0, MAX_FAVORITES);
      writeFavorites(next);
      return next;
    });
  }, []);

  const remove = useCallback((sourceUrl: string) => {
    setFavorites((prev) => {
      const next = prev.filter((favorite) => favorite.sourceUrl !== sourceUrl);
      writeFavorites(next);
      return next;
    });
  }, []);
  return { favorites, isFavorite, toggle, remove };
}
