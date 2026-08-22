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
      if (text.includes("Markdown Content:")) return text;
    }
  } catch {
    // transient network failure — the HTML fallback will run
  }
  return null;
}
