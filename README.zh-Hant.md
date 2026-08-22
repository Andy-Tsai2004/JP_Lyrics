# JP_Lyris

## 快速開始

```bash
cd JP_Lyris
npm install
npm run dev
```

之後開啟：

```text
http://localhost:8080
```

JP_Lyris 是一個日文歌詞閱讀器，能從 Bahamut 的作品頁面抓取歌詞，將內容整理為純日文歌詞，並加入振り仮名、平假名或羅馬拼音等輔助閱讀功能。

這個專案使用 Vite + React 建立，搭配 TanStack Router / Start、Tailwind 樣式設計，並使用 Kuroshiro 進行日文處理。

## 功能特色

- 直接貼上 Bahamut 作品連結並自動載入歌詞
- 保留原始頁面中的日文歌詞內容
- 在漢字上方加入 ruby 風格的振り仮名
- 可切換顯示平假名或羅馬拼音輔助
- 可調整歌詞字體大小以提升閱讀舒適度
- 內建範例文章，可立即測試功能

## 專案概述

此應用程式會接收 Bahamut 的貼文網址，伺服器端抓取內容，提取相關的日文歌詞，最後在乾淨的閱讀介面中呈現。輸出內容會保留標題與歌詞行，並在文字之上加入日文讀音輔助。

## 技術棧

- React 19
- Vite
- TanStack Router / Start
- TypeScript
- Tailwind CSS
- Kuroshiro / Kuromoji
- Better Auth（可選的應用程式驗證層）
- PGLite（嵌入式本地資料儲存）

## 專案結構

```text
JP_Lyris/
├── README.md
├── README.zh-Hant.md
├── package.json
├── JP_lyris/               # 應用程式原始碼與執行檔
│   ├── src/
│   ├── scripts/
│   ├── server/
│   ├── public/
│   ├── migrations/
│   └── ...
└── package-lock.json
```

## 開始使用

在專案根目錄執行：

```bash
cd JP_Lyris
npm install
npm run dev
```

接著在瀏覽器中開啟：

```text
http://localhost:8080
```

## 可用指令

```bash
npm run dev          # 啟動 Vite 開發伺服器
npm run build        # 生產環境建置與資料庫遷移
npm run preview      # 預覽已建置的應用
npm run typecheck    # TypeScript 檢查
npm run test         # 執行專案測試
npm run lint         # ESLint 檢查
npm run format       # 使用 Prettier 格式化程式碼
```

## 備註

- 此專案設計為在本機預覽環境中使用 8080 連接埠。
- 歌詞解析器主要針對 Bahamut 的日文作品頁面進行調整。
- 專案包含可選的驗證與資料持久化基礎架構，但目前的核心功能仍聚焦在日文歌詞閱讀體驗。

## 授權

除非儲存庫擁有者另行指定授權條款，否則此專案僅供本機開發與展示用途。
