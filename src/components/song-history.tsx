import { Heart, History, X } from "lucide-react";
import type { SongFavorite } from "@/lib/lyrics/favorites";
import type { SongRecord } from "@/lib/lyrics/history";
import { useI18n, type Locale, type Translate } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type LibraryView = "favorites" | "history";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function relativeTime(timestamp: number, t: Translate, locale: Locale): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("time.daysAgo", { n: days });
  return new Date(timestamp).toLocaleDateString(locale === "zh-Hant" ? "zh-Hant" : "en");
}

function FavoriteItem({
  favorite,
  active,
  onOpen,
  onRemove,
}: {
  favorite: SongFavorite;
  active: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <li className="flex items-stretch rounded-xl border border-border bg-surface transition-colors hover:border-foreground/20">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-0.5 rounded-l-xl px-3 py-2.5 text-left",
          active && "border-l-2 border-l-danger pl-2.5",
        )}
      >
        <span className="truncate text-sm font-medium text-foreground">{favorite.title}</span>
        <span className="truncate text-xs text-muted">{hostOf(favorite.sourceUrl)}</span>
      </button>
      <button
        type="button"
        aria-label={t("library.removeFavAria", { title: favorite.title })}
        onClick={onRemove}
        className="shrink-0 self-center px-2.5 py-2 text-danger transition-colors hover:text-foreground"
      >
        <Heart className="size-4 fill-current" />
      </button>
    </li>
  );
}

function HistoryItem({
  record,
  active,
  onOpen,
  onRemove,
}: {
  record: SongRecord;
  active: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <li className="flex items-stretch rounded-xl border border-border bg-surface transition-colors hover:border-foreground/20">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-0.5 rounded-l-xl px-3 py-2.5 text-left",
          active && "border-l-2 border-l-primary pl-2.5",
        )}
      >
        <span className="truncate text-sm font-medium text-foreground">{record.title}</span>
        <span className="truncate text-xs text-muted">
          {hostOf(record.sourceUrl)} · {relativeTime(record.fetchedAt, t, locale)}
        </span>
      </button>
      <button
        type="button"
        aria-label={t("library.removeHistoryAria", { title: record.title })}
        onClick={onRemove}
        className="shrink-0 self-center px-2.5 py-2 text-subtle transition-colors hover:text-danger"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}

/**
 * A single-library side drawer. Favorites and History are two separate
 * concepts with their own entry point in the toolbar; this panel renders
 * exactly one of them at a time.
 */
export function LibraryDrawer({
  view,
  favorites,
  records,
  activeUrl,
  onOpen,
  onRemoveFavorite,
  onRemove,
  onClear,
  onClose,
}: {
  view: LibraryView;
  favorites: SongFavorite[];
  records: SongRecord[];
  activeUrl: string | null;
  onOpen: (record: { sourceUrl: string }) => void;
  onRemoveFavorite: (sourceUrl: string) => void;
  onRemove: (sourceUrl: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const isFavorites = view === "favorites";
  const heading = isFavorites ? t("toolbar.favorites") : t("toolbar.history");

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="absolute inset-y-0 left-0 flex w-[min(30rem,92vw)] flex-col border-r border-border bg-bg p-4 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex min-h-9 items-center gap-2 text-sm font-medium tracking-wide text-foreground">
            {isFavorites ? (
              <Heart className="size-4 text-danger" strokeWidth={1.75} />
            ) : (
              <History className="size-4 text-muted" strokeWidth={1.75} />
            )}
            {heading}
            {isFavorites ? (
              favorites.length > 0 ? (
                <span className="text-xs text-muted">{favorites.length}</span>
              ) : null
            ) : records.length > 0 ? (
              <span className="text-xs text-muted">{records.length}</span>
            ) : null}
          </h2>
          <div className="flex items-center gap-1">
            {!isFavorites && records.length > 0 ? (
              <button
                type="button"
                onClick={onClear}
                className="min-h-8 px-1.5 text-xs text-muted underline-offset-4 transition-colors hover:text-danger hover:underline"
              >
                {t("library.clearAll")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("library.close", { heading })}
              className="flex size-9 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {isFavorites ? (
          favorites.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
              {t("library.emptyFavorites")}
            </p>
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
              {favorites.map((favorite) => (
                <FavoriteItem
                  key={favorite.sourceUrl}
                  favorite={favorite}
                  active={activeUrl === favorite.sourceUrl}
                  onOpen={() => onOpen(favorite)}
                  onRemove={() => onRemoveFavorite(favorite.sourceUrl)}
                />
              ))}
            </ul>
          )
        ) : records.length === 0 ? (
          <div className="whitespace-pre-line rounded-2xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm leading-relaxed text-muted">
            {t("library.emptyHistory")}
          </div>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {records.map((record) => (
              <HistoryItem
                key={record.sourceUrl}
                record={record}
                active={activeUrl === record.sourceUrl}
                onOpen={() => onOpen(record)}
                onRemove={() => onRemove(record.sourceUrl)}
              />
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
