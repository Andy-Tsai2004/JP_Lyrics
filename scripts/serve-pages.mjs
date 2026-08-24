/**
 * Serve the GitHub Pages build (`dist/`) locally, mimicking how GitHub Pages
 * mounts the repository at `https://<user>.github.io/<repo>/`.
 *
 * Usage: npm run preview:pages
 * URL:   http://127.0.0.1:8081/JP_Lyrics/
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const distRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const base = process.env.BASE_PATH ?? "/JP_Lyrics/";
const port = Number(process.env.PORT ?? 8081);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".gz": "application/gzip",
};

function basePath(pathname) {
  if (pathname === base.slice(0, -1) || pathname === base) return "/";
  if (pathname.startsWith(base)) return pathname.slice(base.length - 1);
  return null;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const mapped = basePath(decodeURIComponent(url.pathname));
    console.log("[serve-pages]", req.method, req.url, "->", mapped);
    if (mapped === null) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not Found");
      return;
    }
    let filePath = normalize(join(distRoot, mapped));
    if (!filePath.startsWith(distRoot)) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("Forbidden");
      return;
    }
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, "index.html");
    } catch {
      // fall through to SPA fallback
    }
    let body;
    try {
      body = await readFile(filePath);
    } catch {
      body = await readFile(join(distRoot, "index.html"));
    }
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(err));
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`GitHub Pages build served at http://127.0.0.1:${port}${base}`);
});
