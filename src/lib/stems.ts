/**
 * Client for the on-demand off-vocal stem generator (see stems-service/).
 *
 * The static github.io site can't run Demucs, so a separate service generates
 * and caches a song's off-vocal stem. This module asks that service whether a
 * stem is ready, and triggers generation on first request.
 *
 * The service base URL is resolved at runtime instead of being baked in at
 * build time, because the free Cloudflare quick tunnel used to expose a PC-
 * hosted service gets a NEW random URL every run. The deployed site first
 * reads `stems-config.json` (same origin — updated by
 * `stems-service/run-tunnel.ps1` whenever the tunnel restarts), then falls
 * back to the build-time `VITE_STEMS_API_URL` (local dev convenience). When
 * neither is configured, every call resolves to null and the app falls back
 * to the manual upload path.
 */

const BUILT_IN_API = (
  import.meta.env.VITE_STEMS_API_URL as string | undefined
)?.trim();

/**
 * Same-origin runtime config the tunnel script updates with the live URL.
 * Only read in production builds: in dev `public/` is served at the root, so
 * an empty committed config would shadow the `VITE_STEMS_API_URL` in
 * `.env.local` and silently disable local stem testing.
 */
const CONFIG_URL = import.meta.env.PROD
  ? `${import.meta.env.BASE_URL}stems-config.json`
  : "";

/** Re-check the config file at most this often (ms). */
const CONFIG_TTL_MS = 30_000;

let lastResolved: { base: string; at: number } | null = null;

/**
 * Resolve the current stem service base URL ("" = disabled).
 *
 * Order of preference:
 *   1. `stems-config.json` on the same origin (runtime, tunnel script writes it)
 *   2. the build-time `VITE_STEMS_API_URL` (local dev / manual builds)
 *
 * If the config file is unreachable we keep the last known value, so a
 * transient network hiccup doesn't silently disable the feature mid-session.
 */
async function resolveApiBase(): Promise<string> {
  const now = Date.now();
  const cached = lastResolved;
  if (cached && now - cached.at < CONFIG_TTL_MS) return cached.base;

  let base = "";
  let configRead = false;
  if (CONFIG_URL) {
    try {
      const res = await fetch(`${CONFIG_URL}?t=${now}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { apiUrl?: unknown } | null;
        if (typeof data?.apiUrl === "string") base = data.apiUrl.trim();
        configRead = true;
      }
    } catch {
      // Config file missing/unreachable — fall through to the fallbacks below.
    }
  }

  if (!configRead && cached) base = cached.base;
  if (!base && BUILT_IN_API) base = BUILT_IN_API;
  base = base.replace(/\/+$/, "");
  lastResolved = { base, at: now };
  return base;
}

/** Whether a stem service is currently configured ("" = feature off). */
export async function isStemsServiceAvailable(): Promise<boolean> {
  return (await resolveApiBase()) !== "";
}

export type StemInfo =
  | { state: "ready"; full: string; vocals: string; error?: never }
  | { state: "generating"; full?: never; vocals?: never; error?: never }
  | { state: "error"; full?: never; vocals?: never; error: string }
  | { state: "unknown"; full?: never; vocals?: never; error?: never };

/** Extract the Uta-Net song id from a song URL, e.g. /song/397348/ -> "397348". */
export function utaNetSongId(url: string): string | null {
  return /\/song\/(\d+)/.exec(url)?.[1] ?? null;
}

function join(base: string, p?: string): string | undefined {
  if (!p) return undefined;
  return base ? `${base}${p}` : p;
}

function normalize(data: unknown, base: string): StemInfo | null {
  const d = data as { state?: string; full?: string; vocals?: string; error?: string } | null;
  if (!d || typeof d.state !== "string") return null;
  switch (d.state) {
    case "ready":
      return d.full && d.vocals
        ? { state: "ready", full: join(base, d.full)!, vocals: join(base, d.vocals)! }
        : null;
    case "generating":
    case "queued":
      return { state: "generating" };
    case "error":
      return { state: "error", error: d.error ?? "Stem generation failed." };
    default:
      return { state: "unknown" };
  }
}

/** Ask the service for a song's stem state. Returns null if not configured/unreachable. */
export async function getStemStatus(songId: string): Promise<StemInfo | null> {
  const base = await resolveApiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/stem/${songId}`);
    if (!res.ok) return null;
    return normalize(await res.json(), base);
  } catch {
    return null;
  }
}

/** Ask the service to (re)generate a song's stem. Returns the current state. */
export async function requestStem(url: string): Promise<StemInfo | null> {
  const base = await resolveApiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/stem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    return normalize(await res.json(), base);
  } catch {
    return null;
  }
}
