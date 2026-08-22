import { History, X } from "lucide-react";
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
  activeUrl,
  onOpen,
  onRemove,
  onClear,
}: {
  records: SongRecord[];
  activeUrl: string | null;
  onOpen: (record: SongRecord) => void;
  onRemove: (sourceUrl: string) => void;
  onClear: () => void;
}) {
  return (
    <aside className="flex w-full flex-col gap-3 lg:sticky lg:top-10 lg:w-72 lg:shrink-0">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium tracking-wide text-foreground">
          <History className="size-4 text-muted" strokeWidth={1.75} />
          History
        </h2>
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

      {records.length === 0 ? (
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
                <span className="truncate text-sm font-medium text-foreground">{record.title}</span>
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
      )}
    </aside>
  );
}
