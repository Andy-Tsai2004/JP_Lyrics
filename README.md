# JP_Lyrics

A Japanese lyrics viewer: search Uta-Net by song name, artist, or full lyrics
(歌詞) with a live romaji→kana input (`yorunikakeru` becomes よるにかける as you
type; English typed before switching to Japanese input is never converted;
toggle あ/A or press Ctrl+; to switch), with songs sorted by Uta-Net popularity
and artist results opening that artist's full song list, or paste a Bahamut
artwork link / Uta-Net song link, and it keeps only the Japanese lines and
places ruby readings (振り仮名) above the kanji. Katakana aid can be shown in
hiragana or romaji, and the font size is adjustable.

## Live demo

The app is a static site and is deployed to GitHub Pages:

<https://luszechai.github.io/JP_Lyrics/>

## Run locally

```bash
npm install
npm run dev
```

Then open <http://localhost:8080>.

## Deploy to GitHub Pages

1. Push to the `main` branch. The included workflow
   (`.github/workflows/deploy-pages.yml`) runs `npm ci` + `npm run build:pages`,
   uploads `dist/` as an artifact and deploys it with the official
   `actions/deploy-pages` action.
2. One-time setup: in the repository **Settings → Pages**, set **Source** to
   **GitHub Actions** (Build and deployment). No branch needs to be selected.

After the workflow finishes, the site will be live at
`https://<user>.github.io/<repo>/`. You can also re-run the deployment manually
from the **Actions** tab (the workflow supports `workflow_dispatch`).

The repository must be public or on a GitHub Pro plan for GitHub Pages to be
enabled.

### Manual build for GitHub Pages

```bash
npm run build:pages    # outputs ./dist with base /JP_Lyrics/
npm run preview:pages  # serve the built site locally (http://127.0.0.1:8081/JP_Lyrics/)
```

### Note about fetching lyrics

GitHub Pages only hosts static files, so the app fetches both Uta-Net search
results and lyric pages from the browser through public CORS proxies (r.jina.ai
for markdown first, allorigins / codetabs for raw HTML as a fallback). Fetched
lyrics are cached in `localStorage` for a week, so revisiting the same song is
instant.

## Scripts

- `npm run dev` — Vite dev server on port 8080
- `npm run build` — production build (base `/`)
- `npm run build:pages` — production build for GitHub Pages (base `/JP_Lyrics/`)
- `npm run preview` — preview a production build (base `/`)
- `npm run preview:pages` — preview the GitHub Pages build at `/JP_Lyrics/`
- `npm run typecheck` — TypeScript check
- `npm run test` / `npm run lint` / `npm run format`
