# JP_Lyrics

JP_Lyrics 是一個日文歌詞閱讀器，能從 Bahamut 的作品頁面與 Uta-Net 的歌詞頁面
抓取歌詞，將內容整理為純日文歌詞，並在漢字上方加入 ruby 風格的振り仮名，
也可切換平假名或羅馬拼音輔助、調整字體大小。

## 線上版本

本專案已改為靜態網站，部署於 GitHub Pages：

<https://luszechai.github.io/JP_Lyrics/>

## 本機開發

```bash
npm install
npm run dev
```

接著在瀏覽器中開啟：

```text
http://localhost:8080
```

## 部署到 GitHub Pages

1. 推送 `main` 分支。專案內建的 GitHub Actions
   （`.github/workflows/deploy-pages.yml`）會執行 `npm ci` 與
   `npm run build:pages`，將 `dist/` 上傳為 artifact，並使用官方
   `actions/deploy-pages` action 部署。
2. 只需設定一次：在儲存庫的 **Settings → Pages** 中，將 **Source** 設為
   **GitHub Actions**（Build and deployment），不需要另外選分支。

流程跑完後，網站會發佈到 `https://<使用者>.github.io/<儲存庫>/`。也可以到
**Actions** 分頁手動重新觸發部署（workflow 支援 `workflow_dispatch`）。

儲存庫必須是公開專案（或 GitHub Pro 方案），才能啟用 GitHub Pages。

### 手動建置 GitHub Pages 版本

```bash
npm run build:pages    # 輸出 ./dist，base 為 /JP_Lyrics/
npm run preview:pages  # 在本機預覽建置結果（http://127.0.0.1:8081/JP_Lyrics/）
```

### 關於歌詞抓取

GitHub Pages 只能託管靜態檔案，因此應用程式會在瀏覽器端透過公開的 CORS 代理
抓取歌詞頁面（allorigins 抓原始 HTML，r.jina.ai 作為 Markdown 備援）。這可能比
伺服器端抓取稍慢或不穩定，通常重試即可成功。

## 可用指令

```bash
npm run dev           # 啟動 Vite 開發伺服器（port 8080）
npm run build         # 生產建置（base 為 /）
npm run build:pages   # GitHub Pages 生產建置（base 為 /JP_Lyrics/）
npm run preview       # 預覽已建置的應用（base 為 /）
npm run preview:pages # 預覽 GitHub Pages 版本（/JP_Lyrics/）
npm run typecheck     # TypeScript 檢查
npm run test          # 執行專案測試
npm run lint          # ESLint 檢查
npm run format        # 使用 Prettier 格式化程式碼
```

## 技術棧

- React 19
- Vite
- TanStack Router
- TypeScript
- Tailwind CSS
- Kuroshiro / Kuromoji（瀏覽器端振假名）

## 備註

- 歌詞解析器針對 Bahamut 的日文作品頁面與 Uta-Net 歌詞頁面進行調整。
- 振假名使用 Kuromoji 字典（約 18 MB），首次抓取歌詞時需下載，之後會快取在記憶體中。
