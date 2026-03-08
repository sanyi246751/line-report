# 💡 LINE 路燈通報機器人 (GAS)

這是一個結合 **Google Apps Script (GAS)**、**LINE Messaging API** 與 **Gemini AI** 的智慧化路燈維修通報系統。

**[🚀 點此查看 線上教學網頁](https://sanyi246751.github.io/line-report/)** | **[🛠️ AI Studio 專案連結](https://ai.studio/apps/7a12bbde-f57e-4a1a-9d86-1a4b85d72661)**

---

## ✨ 核心功能

### 📌 一般民眾功能
1. **圖片自動辨識**：直接傳送路燈編號照片，機器人會透過 Gemini AI 自動提取編號並完成表單通報。
2. **文字快速通報**：傳送「路燈編號 + 故障狀況」（例如：`01001 不亮`），系統自動解析並填寫表單。
3. **連續通報模式**：
   - 先傳送故障原因（例如：`不亮`）。
   - 在 3 分鐘內連續傳送多組編號（例如：`05125`、`06112`）。
   - 系統會自動套用先前的原因完成多筆通報。
4. **無編號通報**：若號碼磨損看不清，可傳送「沒有號碼 不亮」，系統會以 `99999` 代號進行紀錄。

### 🛠️ 管理員專屬指令 (僅限管理員群組或私訊)
- `幫助` / `help`：顯示完整功能說明。
- `查詢群組ID`：取得當前 LINE 群組的唯一識別碼。
- `查詢所有群組`：列出機器人目前加入的所有群組名稱與連結。
- `查詢關鍵字`：列出目前可觸發通報的語音關鍵字清單。
- `新增關鍵字 [詞]`：動態增加辨識關鍵字（例如：`新增關鍵字 黑漆漆`）。
- `刪除關鍵字 [詞]`：移除現有的關鍵字。

---

## 🚀 快速建置指南

### 步驟一：準備工作
1. **LINE 機器人**：前往 [LINE Developers Console](https://developers.line.biz/) 建立 Messaging API Channel，取得 `Channel Access Token`。
2. **Google 表單**：
   - 建立一個收集通報資料的表單。
   - 取得 `formResponse` 網址。
   - 取得各欄位（編號、通報人、原因）的 `entry.ID`。
3. **Gemini API Key**：前往 [Google AI Studio](https://aistudio.google.com/) 申請免費的 API Key。

### 步驟二：部署 GAS
1. 開啟 [Google Apps Script](https://script.google.com/)，建立新專案。
2. 將 `src/App.tsx` 中的 `gasCode` 內容複製到 GAS 編輯器中。
3. 在程式碼上方填入你的 Token、API Key 與表單 ID。
4. 點擊「部署」 > 「新部署」，對象選擇「所有人」。
5. 將產生的 `Web App URL` 複製回 LINE Developers 的 Webhook URL 欄位。

### 步驟三：本地開發 (教學網頁)
如果你想修改教學網頁：
1. `npm install`
2. 在 `.env.local` 設定 `GEMINI_API_KEY`
3. 執行 `npm run dev`

---

## 🛠️ 技術棧
- **前端**：React + Vite + Tailwind CSS (部署於 GitHub Pages)
- **後端**：Google Apps Script (GAS)
- **人工智慧**：Google Gemini 1.5 Flash (用於圖片與語意解析)
- **資料儲存**：Google Forms + Properties Service

---

## 📜 授權說明
本專案採用 MIT 授權。
