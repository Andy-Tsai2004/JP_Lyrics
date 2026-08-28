/**
 * Shared CORS-proxy helpers for GitHub Pages (static-only hosting).
 *
 * Lyric pages and Uta-Net search results are fetched in the browser through
 * public CORS proxies: the reader proxy (r.jina.ai) returns markdown first,
 * while raw-HTML proxies (allorigins / codetabs) act as a fallback.
 */

export const MARKDOWN_TIMEOUT_MS = 15_000;
export const RAW_HTML_TIMEOUT_MS = 10_000;

export const RAW_HTML_PROXIES = [
  (url: URL) =>
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url.toString())}`,
  (url: URL) =>
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url.toString())}`,
];

export async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs = MARKDOWN_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRawHtml(url: URL): Promise<string | null> {
  // r.jina.ai's HTML mode returns the full page and is fast. Its markdown
  // mode can silently drop parts of a page (e.g. the first, popularity-sorted
  // table of Uta-Net search results), so prefer the raw HTML when available.
  try {
    const res = await fetchWithTimeout(
      `https://r.jina.ai/${url.toString()}`,
      { headers: { "X-Return-Format": "html" } },
      MARKDOWN_TIMEOUT_MS,
    );
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trim().startsWith("{")) {
        if (text.includes("cached snapshot")) {
          // Stale/broken jina snapshot — retry once bypassing its cache.
          try {
            const retry = await fetchWithTimeout(
              `https://r.jina.ai/${url.toString()}`,
              { headers: { "X-Return-Format": "html", "X-No-Cache": "true" } },
              MARKDOWN_TIMEOUT_MS,
            );
            if (retry.ok) {
              const fresh = await retry.text();
              if (fresh && !fresh.trim().startsWith("{")) return fresh;
            }
          } catch {
            // keep the first response below
          }
        }
        return text;
      }
    }
  } catch {
    // transient failure — fall through to the raw-HTML proxies
  }
  for (const makeUrl of RAW_HTML_PROXIES) {
    try {
      const res = await fetchWithTimeout(makeUrl(url), undefined, RAW_HTML_TIMEOUT_MS);
      if (res.ok) {
        const text = await res.text();
        if (text && !text.trim().startsWith("{")) return text;
      }
    } catch {
      // transient proxy failure — try the next one
    }
  }
  return null;
}

export async function fetchMarkdown(url: URL): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`https://r.jina.ai/${url.toString()}`);
    if (res.ok) {
      const text = await res.text();
      if (text.includes("Markdown Content:")) {
        return await retryWithoutJinaCache(url, text);
      }
    }
  } catch {
    // transient network failure — the HTML fallback will run
  }
  return null;
}

/**
 * r.jina.ai sometimes serves a stale or broken snapshot (its warning says
 * "cached snapshot … consider retry with caching opt-out"). When detected,
 * fetch the page once more with `X-No-Cache: true`; fall back to the original
 * response if the retry fails.
 */
async function retryWithoutJinaCache(url: URL, original: string): Promise<string> {
  if (!original.includes("cached snapshot")) return original;
  try {
    const res = await fetchWithTimeout(
      `https://r.jina.ai/${url.toString()}`,
      { headers: { "X-No-Cache": "true" } },
      MARKDOWN_TIMEOUT_MS,
    );
    if (res.ok) {
      const text = await res.text();
      if (text.includes("Markdown Content:")) return text;
    }
  } catch {
    // transient — keep the first response below
  }
  return original;
}
