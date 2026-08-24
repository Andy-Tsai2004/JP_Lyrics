import { useState } from "react";
import { ChevronDown, Heart, History, X } from "lucide-react";
import type { SongFavorite } from "@/lib/lyrics/favorites";
import type { SongRecord } from "@/lib/lyrics/history";
import { cn } from "@/lib/utils";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function relativeTime(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function SongHistorySidebar({
  records,
  favorites,
  activeUrl,
  onOpen,
  onRemove,
  onClear,
  onRemoveFavorite,
}: {
  records: SongRecord[];
  favorites: SongFavorite[];
  activeUrl: string | null;
  onOpen: (record: { sourceUrl: string }) => void;
  onRemove: (sourceUrl: string) => void;
  onClear: () => void;
  onRemoveFavorite: (sourceUrl: string) => void;
}) {
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <aside className="flex w-full flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
      <section className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={favoritesOpen}
            onClick={() => setFavoritesOpen((open) => !open)}
            className="flex min-h-9 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm font-medium tracking-wide text-foreground transition-colors hover:text-primary"
          >
            <Heart className="size-4 text-muted" strokeWidth={1.75} />
            Favorites
            {favorites.length > 0 ? (
              <span className="text-xs text-muted">{favorites.length}</span>
            ) : null}
            <ChevronDown
              className={cn(
                "ml-auto size-4 text-muted transition-transform duration-150",
                favoritesOpen && "rotate-180",
              )}
            />
          </button>
        </div>

        {favoritesOpen ? (
          favorites.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
              No favorites yet — tap the heart on a song to save it here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {favorites.map((favorite) => (
                <li
                  key={favorite.sourceUrl}
                  className="flex items-stretch rounded-xl border border-border bg-surface transition-colors hover:border-foreground/20"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(favorite)}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col gap-0.5 rounded-l-xl px-3 py-2.5 text-left",
                      activeUrl === favorite.sourceUrl && "border-l-2 border-l-primary pl-2.5",
                    )}
                  >
                    <span className="truncate text-sm font-medium text-foreground">
                      {favorite.title}
                    </span>
                    <span className="truncate text-xs text-muted">
                      {hostOf(favorite.sourceUrl)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${favorite.title} from favorites`}
                    onClick={() => onRemoveFavorite(favorite.sourceUrl)}
                    className="shrink-0 self-center px-2 py-2 text-subtle hover:text-danger"
                  >
                    <Heart className="size-4 fill-current" />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>

      <section className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
            className="flex min-h-9 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm font-medium tracking-wide text-foreground transition-colors hover:text-primary"
          >
            <History className="size-4 text-muted" strokeWidth={1.75} />
            History
            {records.length > 0 ? (
              <span className="text-xs text-muted">{records.length}</span>
            ) : null}
            <ChevronDown
              className={cn(
                "ml-auto size-4 text-muted transition-transform duration-150",
                historyOpen && "rotate-180",
              )}
            />
          </button>
          {records.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="min-h-8 px-1 text-xs text-muted underline-offset-4 hover:text-danger hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>

        {historyOpen ? (
          records.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface px-4 py-6 text-center text-sm leading-relaxed text-muted">
              No songs fetched yet.
              <br />
              Fetched songs appear here.
            </div>
          ) : (
            <ul className="flex flex-col gap-2 lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto lg:pr-1">
              {records.map((record) => (
                <li
                  key={record.sourceUrl}
                  className="flex items-stretch rounded-xl border border-border bg-surface transition-colors hover:border-foreground/20"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(record)}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col gap-0.5 rounded-l-xl px-3 py-2.5 text-left",
                      activeUrl === record.sourceUrl && "border-l-2 border-l-primary pl-2.5",
                    )}
                  >
                    <span className="truncate text-sm font-medium text-foreground">
                      {record.title}
                    </span>
                    <span className="truncate text-xs text-muted">
                      {hostOf(record.sourceUrl)} · {relativeTime(record.fetchedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${record.title}`}
                    onClick={() => onRemove(record.sourceUrl)}
                    className="shrink-0 self-center px-2 py-2 text-subtle hover:text-danger"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>
    </aside>
  );
}
