/**
 * Build the app for GitHub Pages.
 *
 * GitHub Pages serves the site from `https://<user>.github.io/<repo>/`, so
 * the Vite `base` must include the repository sub-path. The default here is
 * this repository's name; override with `BASE_PATH` if needed.
 */
process.env.BASE_PATH = process.env.BASE_PATH ?? "/JP_Lyrics/";

const { build } = await import("vite");
await build();
