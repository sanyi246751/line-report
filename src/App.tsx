import React, { useState } from 'react';
import { Copy, Check, ExternalLink, AlertCircle, Code2, Settings, Rocket, MessageSquare } from 'lucide-react';
import gasCode from '../gas/Code.gs?raw';

export default function App() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(gasCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-200">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-lg">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">LINE 路燈通報機器人 (GAS)</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        
        {/* Intro Section */}
        <section className="space-y-4">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">建置教學與程式碼</h2>
          <p className="text-slate-600 leading-relaxed text-lg">
            這份指南將協助您建立一個 LINE 機器人。當群組成員傳送路燈圖片時，機器人會自動使用 Gemini AI 辨識路燈編號，並填寫 Google 表單進行通報，最後在群組內回覆確認訊息。
          </p>
        </section>

        {/* Step 1 */}
        <section className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
              <Settings className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-semibold">步驟一：準備工作</h3>
          </div>
          
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h4 className="font-medium text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold">1</span>
                LINE 機器人
              </h4>
              <p className="text-sm text-slate-600">前往 LINE Developers 建立 Messaging API channel，並取得 <code>Channel access token</code>。</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold">2</span>
                Google 表單
              </h4>
              <p className="text-sm text-slate-600">建立一個包含「路燈編號」的表單。取得表單的 <code>formResponse</code> 網址與該欄位的 <code>entry.ID</code>。</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold">3</span>
                Gemini API
              </h4>
              <p className="text-sm text-slate-600">前往 Google AI Studio 取得免費的 <code>API Key</code>，用於影像辨識。</p>
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 text-blue-800 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-3">
              <p className="font-semibold text-base">如何取得 LINE 的 Token 與 Group ID？</p>
              
              <div className="space-y-2">
                <p className="font-medium text-blue-900">1. 取得 LINE_CHANNEL_ACCESS_TOKEN</p>
                <ul className="list-disc list-inside pl-2 space-y-1 text-blue-700">
                  <li>登入 <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer" className="underline hover:text-blue-900">LINE Developers Console</a>。</li>
                  <li>選擇您的 Provider 與 Messaging API Channel。</li>
                  <li>上方頁籤選擇 <strong>Messaging API</strong>。</li>
                  <li>滑到最下方找到 <strong>Channel access token (long-lived)</strong>，點擊 <strong>Issue</strong> 即可產生並複製。</li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="font-medium text-blue-900">2. 取得 LINE_GROUP_ID (群組 ID)</p>
                <ul className="list-disc list-inside pl-2 space-y-1 text-blue-700">
                  <li><strong>注意：</strong>目前的程式碼是使用 <code>replyToken</code> 直接回覆，<strong>不需要</strong>填寫 Group ID 也能在群組內正常運作！</li>
                  <li>如果您未來有「主動推播 (Push Message)」的需求才需要 Group ID。</li>
                  <li><strong>獲取方式：</strong>將機器人邀請至群組，並在群組內隨便傳送一則訊息。接著回到 GAS 編輯頁面，點擊左側的<strong>「執行項目 (Executions)」</strong>，找到最新的一筆紀錄，裡面就會印出 <code>Group ID: Cxxxxxxxx...</code>。</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-3">
              <p className="font-semibold text-base">如何取得 Google 表單網址與 entry ID？</p>
              
              <div className="space-y-2">
                <p className="font-medium text-amber-900">1. 取得表單提交網址 (GOOGLE_FORM_URL)</p>
                <ul className="list-disc list-inside pl-2 space-y-1 text-amber-700">
                  <li>打開您建立好的 Google 表單編輯頁面。</li>
                  <li>點擊右上角的「預覽」按鈕（眼睛圖示），開啟填寫表單的頁面。</li>
                  <li>複製網址列的網址，它看起來會像這樣：<br/>
                    <code className="bg-amber-100 px-1 py-0.5 rounded text-xs break-all">https://docs.google.com/forms/d/e/1FAIpQLSc.../viewform</code>
                  </li>
                  <li>將網址最後面的 <code>viewform</code> 改成 <code>formResponse</code>，這就是您的 <code>GOOGLE_FORM_URL</code>。<br/>
                    <code className="bg-amber-100 px-1 py-0.5 rounded text-xs break-all">https://docs.google.com/forms/d/e/1FAIpQLSc.../formResponse</code>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="font-medium text-amber-900">2. 取得欄位 ID (GOOGLE_FORM_ENTRY_ID)</p>
                <ul className="list-disc list-inside pl-2 space-y-1 text-amber-700">
                  <li>在剛剛開啟的「預覽」填寫頁面上，按下鍵盤的 <code>F12</code> 或點擊右鍵選擇「檢查 (Inspect)」開啟開發者工具。</li>
                  <li>按下 <code>Ctrl + F</code> (Windows) 或 <code>Cmd + F</code> (Mac) 開啟搜尋框。</li>
                  <li>搜尋 <code>entry.</code> (包含小數點)。</li>
                  <li>您會找到類似 <code>name="entry.123456789"</code> 的程式碼，其中 <code>entry.123456789</code> 就是您要填入的 <code>GOOGLE_FORM_ENTRY_ID</code>。</li>
                  <li>請確認這個 entry ID 對應的是您要填寫「路燈編號」的那個輸入框。</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Step 2 */}
        <section className="bg-slate-900 rounded-2xl shadow-lg overflow-hidden border border-slate-800">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="bg-slate-800 text-slate-300 p-2 rounded-lg">
                <Code2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">步驟二：Google Apps Script 程式碼</h3>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-sm font-medium cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? '已複製' : '複製程式碼'}
            </button>
          </div>
          
          <div className="p-6 overflow-x-auto bg-[#0d1117]">
            <pre className="text-sm text-slate-300 font-mono leading-relaxed">
              <code>{gasCode}</code>
            </pre>
          </div>
        </section>

        {/* Step 3 */}
        <section className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="bg-emerald-100 text-emerald-700 p-2 rounded-lg">
              <Rocket className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-semibold">步驟三：部署與設定 Webhook</h3>
          </div>
          
          <ol className="space-y-4 list-decimal list-inside text-slate-700">
            <li className="pl-2">前往 <a href="https://script.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">Google Apps Script <ExternalLink className="w-3 h-3"/></a> 建立新專案。</li>
            <li className="pl-2">將上方複製的程式碼貼上，並<strong>替換前四行的設定值</strong>。</li>
            <li className="pl-2">點擊右上角「部署」 {'>'} 「新增部署作業」。</li>
            <li className="pl-2">選取類型為「網頁應用程式 (Web App)」。</li>
            <li className="pl-2">「誰可以存取」請選擇<strong>「所有人 (Anyone)」</strong>，然後點擊部署。</li>
            <li className="pl-2">複製部署後產生的「網頁應用程式網址 (Web App URL)」。</li>
            <li className="pl-2">回到 LINE Developers Console，將該網址貼到 <code>Webhook URL</code> 並啟用 <code>Use webhook</code>。</li>
          </ol>
        </section>

        {/* Troubleshooting */}
        <section className="bg-rose-50 rounded-2xl p-6 sm:p-8 shadow-sm border border-rose-100 space-y-6">
          <div className="flex items-center gap-3 border-b border-rose-200 pb-4">
            <div className="bg-rose-100 text-rose-700 p-2 rounded-lg">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-semibold text-rose-900">常見問題排解：機器人沒反應？</h3>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-2">
              <h4 className="font-semibold text-rose-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-200 flex items-center justify-center text-xs">1</span>
                確認 Webhook 是否成功開啟
              </h4>
              <p className="text-sm text-rose-800 ml-7">
                在 LINE Developers Console (Messaging API 設定頁面)，請確認 <strong>Use webhook</strong> 的開關已經打開。您可以點擊 Webhook URL 旁邊 of <strong>Verify</strong> 按鈕，如果顯示 Success，代表連線正常。
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-rose-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-200 flex items-center justify-center text-xs">2</span>
                每次修改程式碼，都必須「重新部署」
              </h4>
              <p className="text-sm text-rose-800 ml-7">
                在 GAS 中修改程式碼後，直接按「儲存」是不會生效的！您必須點擊右上角「部署」 {'>'} 「管理部署作業」 {'>'} 點擊右上角鉛筆圖示編輯 {'>'} <strong>版本選擇「建立新版本」</strong> {'>'} 點擊部署。
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-rose-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-200 flex items-center justify-center text-xs">3</span>
                出現「302 Found」錯誤？
              </h4>
              <div className="text-sm text-rose-800 ml-7 space-y-2">
                <p>如果 LINE Developers 測試 Webhook 時出現 <code>The webhook returned an HTTP status code other than 200.(302 Found)</code>，請檢查以下三點最常見的原因：</p>
                <ul className="list-decimal list-inside pl-2 space-y-2">
                  <li>
                    <strong>網址結尾錯誤：</strong>請檢查您貼到 LINE 的 Webhook URL，最後面必須是 <strong><code>/exec</code></strong>。如果是 <code>/dev</code> 或 <code>/edit</code>，LINE 伺服器會被要求登入 Google 帳號，從而產生 302 錯誤。
                  </li>
                  <li>
                    <strong>未授權應用程式：</strong>程式碼中使用了外部連線 (UrlFetchApp)，第一次執行必須手動授權。請在 GAS 編輯器上方選擇 <code>doPost</code> 函式，點擊「執行」。Google 會跳出「需要授權」的視窗，請點擊「審查權限」 {'>'} 選擇您的帳號 {'>'} 點擊左下角「進階」 {'>'} 「前往...(不安全)」 {'>'} 點擊「允許」。
                  </li>
                  <li>
                    <strong>權限設定錯誤：</strong>部署時「誰可以存取」沒有設定為<strong>「所有人 (Anyone)」</strong>。
                  </li>
                  <li>
                    <strong>多重 Google 帳號衝突：</strong>如果您瀏覽器同時登入了多個 Google 帳號，GAS 可能會錯亂。建議開啟「無痕視窗」，只登入一個帳號再重新部署一次。
                  </li>
                </ul>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-rose-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-200 flex items-center justify-center text-xs">4</span>
                關閉 LINE 官方的自動回覆訊息
              </h4>
              <p className="text-sm text-rose-800 ml-7">
                在 LINE Official Account Manager (LINE 官方帳號管理後台) 中，進入「設定」 {'>'} 「回應設定」，請將「回應模式」設為 <strong>聊天機器人</strong>，並將「Webhook」設為 <strong>啟用</strong>。
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-rose-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-200 flex items-center justify-center text-xs">5</span>
                表單如果是選擇題（單選/多選/下拉），該怎麼設定？
              </h4>
              <div className="text-sm text-rose-800 ml-7 space-y-2">
                <p>對於選擇題，您只需要將值設定為<strong>「與表單選項完全一模一樣的文字」</strong>即可：</p>
                <pre className="bg-rose-100 p-2 rounded text-xs overflow-x-auto">
{`const formData = {
  // 假設選項有「路燈不亮」、「路燈閃爍」
  [ENTRY_ID_ISSUE]: '路燈不亮', 
};`}
                </pre>
                <p className="mt-2">如果您要勾選<strong>「其他：」</strong>並自己填寫內容，需要傳送兩個參數：</p>
                <pre className="bg-rose-100 p-2 rounded text-xs overflow-x-auto">
{`const formData = {
  [ENTRY_ID_ISSUE]: '__other_option__', // 固定寫法，代表勾選其他
  [ENTRY_ID_ISSUE + '.other_option_response']: '這裡是您要填寫的內容'
};`}
                </pre>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-rose-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-200 flex items-center justify-center text-xs">6</span>
                機器人無法加入群組？
              </h4>
              <p className="text-sm text-rose-800 ml-7">
                如果您想將機器人邀請至群組，但發現無法邀請，這是因為 LINE 預設關閉了這項功能。請到 LINE Official Account Manager 的「設定」 {'>'} 「帳號設定」 {'>'} 「聊天設定」，將 <strong>「加入群組或多人聊天室」</strong> 設為 <strong>接受邀請</strong>。
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-rose-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-200 flex items-center justify-center text-xs">6</span>
                檢查 GAS 執行錯誤紀錄 (Log)
              </h4>
              <p className="text-sm text-rose-800 ml-7">
                如果以上都確認沒問題，請回到 Google Apps Script 頁面，點擊左側選單的 <strong>「執行項目 (Executions)」</strong>。這裡會記錄每一次 LINE 傳送訊息過來時，程式碼執行的狀況。如果狀態顯示「失敗 (Failed)」，點開它就能看到具體的錯誤訊息（例如：API Key 錯誤、表單欄位 ID 填錯等）。
              </p>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
