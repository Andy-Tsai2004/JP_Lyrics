import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/kuromoji/dict");
const dest = join(root, "public/kuromoji-dict");

if (!existsSync(src)) {
  console.warn("[kuromoji-dict] source missing, skip");
  process.exit(0);
}

// Copied before `vite build` / `vite dev` so the dictionary files are served
// from `/kuromoji-dict/` (or `/<repo>/kuromoji-dict/` on GitHub Pages).
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[kuromoji-dict] copied to", dest);
