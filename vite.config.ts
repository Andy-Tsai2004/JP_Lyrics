import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath } from "node:url";

/**
 * Static site for GitHub Pages.
 *
 * The site is served from a sub-path (`https://<user>.github.io/<repo>/`),
 * so the build needs a base path. It is resolved in this order:
 *
 *   1. `BASE_PATH` env var (used by `npm run build:pages` / CI)
 *   2. The GitHub repository name when building on GitHub Actions
 *   3. `/` (local development)
 */
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = process.env.BASE_PATH ?? (repoName ? `/${repoName}/` : "/");

export default defineConfig({
  // On Windows, antivirus/indexers can lock node_modules/.vite during the
  // temp -> deps rename step. Keep Vite cache outside node_modules to avoid it.
  cacheDir: process.platform === "win32" ? ".vite-cache" : "node_modules/.vite",
  base,
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      // kuromoji's DictionaryLoader calls `path.join` to build dictionary
      // URLs; in the browser we need the POSIX-style path helper.
      path: "path-browserify",
      // kuromoji's browser loader imports zlibjs, whose UMD assumes a
      // CommonJS `this` binding that breaks in an ESM bundle. Swap it for a
      // browser-safe gunzip shim.
      "zlibjs/bin/gunzip.min.js": fileURLToPath(
        new URL("./src/lib/lyrics/zlib-gunzip.ts", import.meta.url),
      ),
    },
  },
  plugins: [tailwindcss(), tanstackRouter({ target: "react" }), viteReact()],
});
