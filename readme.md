# JP_Lyris

## Quick Start

```bash
cd JP_Lyris
npm install
npm run dev
```

Then open:

```text
http://localhost:8080
```

JP_Lyris is a small Japanese lyrics viewer that fetches lyrics from Bahamut artwork pages, strips them down to the Japanese lines, and adds reading support with furigana, hiragana, or romaji overlays.

It is built as a Vite + React app with TanStack Router / Start, styled with Tailwind, and uses Kuroshiro for Japanese text processing.

## Features

- Paste a Bahamut artwork URL and load the lyrics automatically
- Keep only the Japanese lyric lines from the original page
- Add ruby-style furigana above kanji for easier reading
- Toggle optional kana or romaji assist mode
- Resize the lyric display for comfort reading
- Includes a sample post so the app can be tested immediately

## What the app does

The app accepts a Bahamut post URL, fetches the content server-side, extracts the relevant Japanese lyric text, and then renders it in a clean reading interface. The output keeps the title and lyric lines while applying Japanese reading assistance on top of the text.

## Tech stack

- React 19
- Vite
- TanStack Router and Start
- TypeScript
- Tailwind CSS
- Kuroshiro / Kuromoji
- Better Auth (optional app auth layer)
- PGLite for embedded local storage

## Project structure

```text
JP_Lyris/
├── README.md
├── package.json
├── JP_lyris/               # Application source and runtime files
│   ├── src/
│   ├── scripts/
│   ├── server/
│   ├── public/
│   ├── migrations/
│   └── ...
└── package-lock.json
```

## Getting started

From the repository root:

```bash
cd JP_Lyris
npm install
npm run dev
```

Then open the app in a browser at:

```text
http://localhost:8080
```

## Available scripts

```bash
npm run dev          # start the Vite dev server
npm run build        # production build and DB migration
npm run preview      # preview the built app
npm run typecheck    # TypeScript validation
npm run test         # run Node-based project tests
npm run lint         # ESLint validation
npm run format       # format the codebase with Prettier
```

## Notes

- The app is configured to run on port 8080 for the local preview environment.
- The lyrics parser is tuned for Bahamut Japanese artwork pages.
- The project includes optional auth and persistence scaffolding, but the current app behavior is centered around the Japanese lyrics reader experience.

## License

This project is provided for local development and demo use unless a separate license is added by the repository owner.
