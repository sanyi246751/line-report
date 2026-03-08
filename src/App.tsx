import React, { useState } from 'react';
import { Copy, Check, ExternalLink, AlertCircle, Code2, Settings, Rocket, MessageSquare } from 'lucide-react';

const gasCode = `// 1. 請填入您的設定值
const LINE_CHANNEL_ACCESS_TOKEN = 'YOUR_LINE_CHANNEL_ACCESS_TOKEN';
// 支援多組 Gemini API Key，請用逗號分隔。當第一組額度滿時，系統會自動切換到下一組。
const GEMINI_API_KEYS = 'YOUR_GEMINI_API_KEY_1,YOUR_GEMINI_API_KEY_2';
const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLS.../formResponse'; // 請替換為您的 formResponse 網址

// 2. 請填入表單各欄位的 entry ID
// 您可以根據表單的實際欄位增減以下設定
const ENTRY_ID_LIGHT_NUMBER = 'entry.123456789'; // 路燈編號欄位
const ENTRY_ID_REPORTER = 'entry.987654321';     // 通報人欄位 (選填)
const ENTRY_ID_ISSUE = 'entry.111111111';        // 故障情形欄位 (必填)

// 3. 管理員群組設定
// 請填入您專屬的「後台管理群組 ID」(Group ID)
// 若不知道 ID，請先在該群組發言，然後到 GAS 的「執行項目」查看 Log
const ADMIN_GROUP_ID = 'YOUR_ADMIN_GROUP_ID';

// 測試用：如果您在瀏覽器打開網址，會看到這行字，代表部署成功
function doGet(e) {
  return ContentService.createTextOutput("Webhook is running! 機器人運作中！");
}

function doPost(e) {
  try {
    // 處理 LINE 傳來的空資料或驗證請求
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('OK');
    }
    
    const contents = JSON.parse(e.postData.contents);
    if (!contents.events || contents.events.length === 0) {
      return ContentService.createTextOutput('OK');
    }
    
    const event = contents.events[0];
    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const groupId = event.source.groupId || "DIRECT";
    
    // 紀錄 Log
    console.log('User ID:', userId, 'Group ID:', groupId);
    
    // --- 紀錄加入的群組 ---
    if (groupId !== "DIRECT") {
      const groupName = getGroupName(groupId);
      recordGroup(groupId, groupName);
    }
    
    if (event.type === 'message') {
      let analysisResult = null;
      let hasNumber = false;
      let hasKeyword = false;
      
      if (event.message.type === 'image') {
        const messageId = event.message.id;
        const imageBlob = getLineImage(messageId);
        analysisResult = analyzeStreetLightImage(imageBlob);
      } else if (event.message.type === 'text') {
        const userText = event.message.text.trim();
        
        // --- 關鍵字管理指令 (僅限管理員群組或私訊) ---
        if (userText.toLowerCase() === 'help' || userText === '幫助' || userText === '說明') {
          let helpMsg = '💡 【路燈通報機器人功能說明】\\n\\n';
          helpMsg += '📌 一般民眾功能：\\n';
          helpMsg += '1. 傳送「路燈照片」，機器人會自動辨識編號並通報。\\n';
          helpMsg += '2. 傳送「路燈編號」+「故障狀況」(如: 01001 不亮)，機器人會自動通報。\\n';
          helpMsg += '3. 支援「連續通報」：先傳送故障狀況(如: 不亮)，3分鐘內連續傳送多組路燈編號(如: 05125)，系統會自動套用該狀況並通報。\\n';
          helpMsg += '4. 支援「無編號通報」：若不知道號碼，請傳送「沒有號碼 不亮」，系統會以 99999 代替編號通報。\\n\\n';
          
          if (groupId === ADMIN_GROUP_ID || groupId === "DIRECT") {
            helpMsg += '🛠️ 管理員專屬指令：\\n';
            helpMsg += '🔹 查詢群組ID：取得目前群組的 ID\\n';
            helpMsg += '🔹 查詢所有群組：列出機器人加入的所有群組名稱與 ID\\n';
            helpMsg += '🔹 查詢關鍵字：列出目前觸發通報的關鍵字\\n';
            helpMsg += '🔹 新增關鍵字 [詞]：例如「新增關鍵字 黑漆漆」\\n';
            helpMsg += '🔹 刪除關鍵字 [詞]：例如「刪除關鍵字 沒亮」';
          } else {
            helpMsg += '※ 管理員指令僅限於專屬後台群組使用。';
          }
          
          replyLineMessage(replyToken, helpMsg);
          return ContentService.createTextOutput('OK');
        }
        
        if (userText === '查詢群組ID') {
          replyLineMessage(replyToken, \`此群組的 ID 為：\\n\${groupId}\`);
          return ContentService.createTextOutput('OK');
        }
        
        if (userText === '查詢所有群組') {
          if (groupId === ADMIN_GROUP_ID || groupId === "DIRECT") {
            const groups = getRecordedGroups();
            if (Object.keys(groups).length === 0) {
              replyLineMessage(replyToken, '目前沒有記錄到任何群組。');
            } else {
              let msg = '機器人目前記錄到的群組列表：\\n';
              for (const id in groups) {
                msg += \`- \${groups[id]} (ID: \${id})\\n\`;
              }
              replyLineMessage(replyToken, msg);
            }
          }
          return ContentService.createTextOutput('OK');
        }
        
        if (userText.startsWith('新增關鍵字 ') || userText.startsWith('刪除關鍵字 ') || userText === '查詢關鍵字') {
          // 檢查是否在管理員群組，或是直接私訊機器人 (DIRECT)
          if (groupId === ADMIN_GROUP_ID || groupId === "DIRECT") {
            if (userText.startsWith('新增關鍵字 ')) {
              const newKw = userText.replace('新增關鍵字 ', '').trim();
              if (newKw) {
                const added = addKeyword(newKw);
                replyLineMessage(replyToken, added ? \`已新增關鍵字：「\${newKw}」\` : \`關鍵字「\${newKw}」已存在。\`);
              }
            } else if (userText.startsWith('刪除關鍵字 ')) {
              const rmKw = userText.replace('刪除關鍵字 ', '').trim();
              if (rmKw) {
                const removed = removeKeyword(rmKw);
                replyLineMessage(replyToken, removed ? \`已刪除關鍵字：「\${rmKw}」\` : \`找不到關鍵字「\${rmKw}」。\`);
              }
            } else if (userText === '查詢關鍵字') {
              const currentKws = getKeywords();
              replyLineMessage(replyToken, \`目前的觸發關鍵字有：\\n\${currentKws.join('、')}\`);
            }
          } else {
            // 若在一般群組輸入管理指令，則不予理會 (或可回覆無權限)
            // replyLineMessage(replyToken, '您沒有權限執行此指令。');
          }
          return ContentService.createTextOutput('OK');
        }
        
        // --- 智慧暫存邏輯 (針對「個別使用者」在「個別群組」的緩存) ---
        const cache = CacheService.getScriptCache();
        const cacheKey = 'buffer_' + groupId + '_' + userId;
        const issueKey = 'issue_' + groupId + '_' + userId;
        let buffer = cache.get(cacheKey) || "";
        
        // 將新訊息加入暫存
        buffer += " " + userText;
        cache.put(cacheKey, buffer, 300); // 暫存 5 分鐘
        
        // 取得動態關鍵字列表
        const currentKeywords = getKeywords();
        
        // 檢查是否包含路燈編號 (至少 4 位數字) 與 故障關鍵字
        hasNumber = /\d{4}/.test(buffer);
        const keywordRegex = new RegExp('(' + currentKeywords.join('|') + ')');
        hasKeyword = keywordRegex.test(buffer);
        
        // 檢查是否有「短期記憶」中的故障原因
        const rememberedIssue = cache.get(issueKey);
        
        // 如果暫存過長 (超過 500 字)，可能包含太多無關內容，強制清除
        if (buffer.length > 500) {
          cache.remove(cacheKey);
          buffer = userText;
          cache.put(cacheKey, buffer, 300);
        }
        
        // 觸發條件：有關鍵字 OR (有編號且有短期記憶)
        if (hasKeyword || (hasNumber && rememberedIssue)) {
          analysisResult = analyzeStreetLightText(buffer);
          
          if (analysisResult && analysisResult.isReportingIssue) {
            // 記住這次的故障原因 (3 分鐘)
            if (analysisResult.originalIssue && analysisResult.originalIssue !== '無法判斷') {
              cache.put(issueKey, analysisResult.originalIssue, 180);
            } else if (rememberedIssue) {
              // 如果這次沒分析出原因，但有記憶，就用記憶的
              analysisResult.issueText = rememberedIssue;
            }
            
            // 如果有編號，通報後清除文字暫存 (但保留 issue 記憶)
            if (analysisResult.numbers.length > 0) {
              cache.remove(cacheKey);
            }
          } else if (analysisResult && !analysisResult.isReportingIssue) {
            // 如果 Gemini 判斷這不是在報修，則不予理會
            return ContentService.createTextOutput('OK');
          }
        } else {
          // 尚未偵測到關鍵字且無記憶，繼續等待
          return ContentService.createTextOutput('OK');
        }
      }
      
      if (analysisResult) {
        if (analysisResult.error === 'RATE_LIMIT') {
          replyLineMessage(replyToken, '系統目前繁忙中（AI 辨識額度已滿），請稍後再試，或直接撥打專線電話 876782 找路燈承辦吳小姐，謝謝您的幫忙！');
          return ContentService.createTextOutput('OK');
        }
        
        const userName = getUserName(userId, event.source.groupId);
        
        if (analysisResult.isReportingIssue && analysisResult.numbers.length === 0) {
          replyLineMessage(replyToken, \`請 \${userName} 提供路燈號碼或撥打專線電話876782找路燈承辦吳小姐，謝謝您的幫忙!\`);
        } else if (analysisResult.numbers.length > 0) {
          // 驗證路燈編號開頭是否合法，並過濾掉不合法的編號
          const validPrefixes = ['01', '02', '03', '04', '05', '06', '07', '99'];
          const validNumbers = analysisResult.numbers.filter(num => {
            const prefix = String(num).substring(0, 2);
            return validPrefixes.includes(prefix);
          });
          
          const invalidNumbers = analysisResult.numbers.filter(num => {
            const prefix = String(num).substring(0, 2);
            return !validPrefixes.includes(prefix);
          });
          
          if (validNumbers.length === 0) {
            replyLineMessage(replyToken, '路燈號碼有誤，請確認');
            return ContentService.createTextOutput('OK');
          }

          // 使用過濾後的合法編號進行後續處理
          analysisResult.numbers = validNumbers;

          // 進行分組處理 (以前兩碼分組)
          const groups = {};
          analysisResult.numbers.forEach(num => {
            const prefix = num.substring(0, 2);
            if (!groups[prefix]) groups[prefix] = [];
            if (!groups[prefix].includes(num)) groups[prefix].push(num);
          });
          
          let replyMsg = \`謝謝 \${userName} 的幫忙！\\n\`;
          let groupIndex = 0;
          let allSuccess = true;
          
          for (const prefix in groups) {
            const groupNums = groups[prefix];
            const mainNumber = groupNums[0];
            let issueText = analysisResult.issueText;
            let isOtherIssue = false;
            
            if (groupNums.length > 1) {
              isOtherIssue = true;
              issueText = groupNums.join('、') + issueText;
            }
            
            const formData = {
              [ENTRY_ID_LIGHT_NUMBER]: mainNumber,
              [ENTRY_ID_REPORTER]: userName,
            };
            
            if (isOtherIssue) {
              formData[ENTRY_ID_ISSUE] = '__other_option__';
              formData[ENTRY_ID_ISSUE + '.other_option_response'] = issueText;
            } else {
              formData[ENTRY_ID_ISSUE] = issueText;
            }
            
            const formSuccess = submitGoogleForm(formData);
            if (!formSuccess) allSuccess = false;
            
            let displayIssue = groupNums.length > 1 ? \`\${groupNums.join('、')}\${analysisResult.issueText}\` : \`\${mainNumber}\${analysisResult.issueText}\`;
            if (groupIndex === 0) {
              replyMsg += \`\\n已通報：\${displayIssue}\`;
            } else {
              replyMsg += \`\\n另外通報：\${displayIssue}\`;
            }
            groupIndex++;
          }
          
          if (invalidNumbers.length > 0) {
            replyMsg += \`\\n\\n(提醒：號碼\${invalidNumbers.join('、')}有誤，請確認)\`;
          }
          
          if (!allSuccess) replyMsg += \`\\n\\n(部分表單提交失敗，請確認表單必填欄位)\`;
          replyLineMessage(replyToken, replyMsg);
        }
      } else {
        if (event.message.type === 'image') {
          replyLineMessage(replyToken, '系統處理圖片時發生錯誤，請稍後再試。');
        } else if (event.message.type === 'text' && hasNumber && hasKeyword) {
          replyLineMessage(replyToken, '系統處理文字時發生錯誤，請稍後再試。');
        }
      }
    }
    return ContentService.createTextOutput('OK');
  } catch (error) {
    console.error(error);
    return ContentService.createTextOutput('Error');
  }
}

function getLineImage(messageId) {
  const url = \`https://api-data.line.me/v2/bot/message/\${messageId}/content\`;
  const options = {
    method: 'get',
    headers: {
      'Authorization': \`Bearer \${LINE_CHANNEL_ACCESS_TOKEN}\`
    }
  };
  const response = UrlFetchApp.fetch(url, options);
  return response.getBlob();
}

// --- 取得可用的 API Key 列表 ---
function getApiKeys() {
  // 支援新舊變數名稱，避免 ReferenceError
  let keysString = '';
  if (typeof GEMINI_API_KEYS !== 'undefined') {
    keysString = GEMINI_API_KEYS;
  } else if (typeof GEMINI_API_KEY !== 'undefined') {
    keysString = GEMINI_API_KEY;
  }
  return keysString.split(',').map(key => key.trim()).filter(key => key !== '');
}

function analyzeStreetLightImage(imageBlob) {
  const apiKeys = getApiKeys();
  
  const base64Image = Utilities.base64Encode(imageBlob.getBytes());
  const mimeType = imageBlob.getContentType();
  
  const prompt = \`這是一張包含路燈編號的圖片（可能是手寫或印刷）。請分析圖片並以 JSON 格式回傳以下資訊，不要包含其他文字：
{
  "isReportingIssue": true,
  "numbers": ["01001", "02322"],
  "issue": "路燈不亮"
}

欄位定義：
- isReportingIssue: 布林值，只要圖片中包含疑似路燈編號的數字，就請設為 true。
- numbers: 字串陣列，圖片中出現的所有路燈編號。
  路燈編號規則與手寫辨識重點：
  1. 通常為 5 碼數字且以 0 開頭（例如 01234），常見開頭為 01, 02, 03, 04, 05, 06, 07。
  2. 也有 99 開頭的 5 碼編號（例如 99011）。
  3. 若使用者只寫了 4 碼（例如 5899），請務必提取出來。
  4. 手寫數字可能會有間距、連筆，或者數字之間有斜線（例如 0/001 可能是 01001），請盡可能辨識出合理的 4 到 5 碼數字。
- issue: 字串，根據圖片判斷故障情形。請從 "路燈不亮", "路燈閃爍", "白天亮燈", "路燈轉向", "無法判斷" 中擇一。如果圖片只有數字沒有寫故障原因，請務必回傳 "無法判斷"（不要自己預設為路燈不亮）。\`;
  
  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  // 嘗試使用多組 API Key
  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    const url = \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=\${apiKey}\`;
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 429) {
      console.error(\`Gemini API Rate Limit Exceeded (Image) using key \${i + 1}\`);
      // 如果還有下一組 Key，就繼續嘗試
      if (i < apiKeys.length - 1) {
        continue;
      }
      // 如果所有 Key 都試過了還是 429
      return {
        isReportingIssue: false,
        numbers: [],
        issue: '無法判斷',
        error: 'RATE_LIMIT'
      };
    }
    
    if (responseCode !== 200) {
      console.error(\`Gemini API Error (Image HTTP \${responseCode}) using key \${i + 1}:\`, responseText);
      // 其他錯誤也嘗試換 Key
      if (i < apiKeys.length - 1) {
        continue;
      }
      return null;
    }
    
    const json = JSON.parse(responseText);
    
    if (json.candidates && json.candidates.length > 0) {
      return processAnalysisResult(json.candidates[0].content.parts[0].text);
    }
    return null;
  }
  return null;
}

function analyzeStreetLightText(text) {
  try {
    const apiKeys = getApiKeys();
    
    const prompt = \`你是一個路燈維修通報助理。請從以下文字中提取路燈編號與故障狀況。
文字內容：「\${text}」

請忽略所有與路燈通報無關的閒聊或文字。
路燈編號規則：
1. 通常為 5 碼數字。
2. 常見開頭為 01, 02, 03, 04, 05, 06, 07。
3. 也有 99 開頭的 5 碼編號（例如 99011）。
4. 使用者可能會省略開頭的 0 只輸入 4 碼（例如 1111 代表 01111），請務必將其提取出來。
5. 如果使用者明確表示「沒有編號」、「不知道號碼」、「沒號碼」等，請在 numbers 陣列中回傳 ["99999"]。

請務必只回傳一個合法的 JSON 物件，不要包含任何其他文字。
JSON 格式範例：
{
  "isReportingIssue": true,
  "numbers": ["01111", "99011"],
  "issue": "路燈不亮"
}

欄位定義：
- isReportingIssue: 布林值。如果使用者明確提到路燈故障、不亮、損壞、轉向等，則為 true。如果只是純數字或無關閒聊，則為 false。
- numbers: 字串陣列，提取到的所有路燈編號。若無則為 []。若明確表示無編號則為 ["99999"]。
- issue: 字串，故障狀況。請從 "路燈不亮", "路燈閃爍", "白天亮燈", "路燈轉向", "無法判斷" 中擇一。如果文字中沒提到故障狀況，請務必回傳 "無法判斷"（不要自己預設為路燈不亮）。\`;
    
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    // 嘗試使用多組 API Key
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      const url = \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=\${apiKey}\`;
      
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      if (responseCode === 429) {
        console.error(\`Gemini API Rate Limit Exceeded using key \${i + 1}\`);
        if (i < apiKeys.length - 1) {
          continue;
        }
        return {
          isReportingIssue: false,
          numbers: [],
          issue: '無法判斷',
          error: 'RATE_LIMIT'
        };
      }
      
      if (responseCode !== 200) {
        console.error(\`Gemini API Error (HTTP \${responseCode}) using key \${i + 1}:\`, responseText);
        if (i < apiKeys.length - 1) {
          continue;
        }
        return null;
      }
      
      const json = JSON.parse(responseText);
      if (json.candidates && json.candidates.length > 0 && json.candidates[0].content && json.candidates[0].content.parts) {
        return processAnalysisResult(json.candidates[0].content.parts[0].text);
      }
      console.error(\`Gemini API No Candidates using key \${i + 1}:\`, responseText);
    }
    return null;
  } catch (e) {
    console.error("analyzeStreetLightText Error:", e);
    return null;
  }
}

function processAnalysisResult(resultText) {
  try {
    const cleanText = resultText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    const result = JSON.parse(cleanText);
    
    let numbers = result.numbers || [];
    
    // 如果 Gemini 回傳的是單一字串 (例如 "01001 02015")，將其拆分成陣列
    if (typeof numbers === 'string') {
      numbers = numbers.replace(/、/g, ' ').replace(/,/g, ' ').split(/\s+/).filter(n => n.trim() !== '');
    } else if (Array.isArray(numbers)) {
      // 如果陣列裡面的元素包含空格 (例如 ["01001 02015"])，也要拆分
      let newNumbers = [];
      numbers.forEach(num => {
        if (typeof num === 'string') {
          newNumbers.push(...num.replace(/、/g, ' ').replace(/,/g, ' ').split(/\s+/).filter(n => n.trim() !== ''));
        } else {
          newNumbers.push(String(num));
        }
      });
      numbers = newNumbers;
    } else if (numbers) {
      numbers = [String(numbers)];
    }
    
    // 處理編號：如果是 4 碼數字，前面補 0 變成 5 碼
    numbers = numbers.map(num => {
      let str = String(num).trim();
      if (/^\\d{4}$/.test(str)) {
        return '0' + str;
      }
      return str;
    });
    
    let originalIssue = result.issue || '無法判斷';
    let issueText = originalIssue;
    
    // 如果無法判斷，預設給 '路燈不亮'
    if (issueText === '無法判斷') {
      issueText = '路燈不亮';
    }
    
    return {
      isReportingIssue: result.isReportingIssue === true,
      numbers: numbers,
      issueText: issueText,
      originalIssue: originalIssue
    };
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return null;
  }
}

function submitGoogleForm(formData) {
  const options = {
    method: 'post',
    payload: formData,
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(GOOGLE_FORM_URL, options);
  // Google 表單成功提交通常會回傳 200
  return response.getResponseCode() === 200;
}

// --- 關鍵字管理功能 ---
function getKeywords() {
  const props = PropertiesService.getScriptProperties();
  let kwString = props.getProperty('KEYWORDS');
  if (!kwString) {
    const defaultKeywords = ['不亮', '閃爍', '亮燈', '轉向', '故障', '壞了', '維修', '查修', '沒亮'];
    props.setProperty('KEYWORDS', JSON.stringify(defaultKeywords));
    return defaultKeywords;
  }
  return JSON.parse(kwString);
}

function addKeyword(keyword) {
  const keywords = getKeywords();
  if (!keywords.includes(keyword)) {
    keywords.push(keyword);
    PropertiesService.getScriptProperties().setProperty('KEYWORDS', JSON.stringify(keywords));
    return true;
  }
  return false;
}

function removeKeyword(keyword) {
  let keywords = getKeywords();
  const initialLength = keywords.length;
  keywords = keywords.filter(k => k !== keyword);
  if (keywords.length < initialLength) {
    PropertiesService.getScriptProperties().setProperty('KEYWORDS', JSON.stringify(keywords));
    return true;
  }
  return false;
}

// --- 群組紀錄功能 ---
function recordGroup(groupId, groupName) {
  const props = PropertiesService.getScriptProperties();
  let groupsString = props.getProperty('JOINED_GROUPS_MAP');
  let groups = groupsString ? JSON.parse(groupsString) : {};
  
  // 如果尚未記錄，或是群組名稱有更新，則寫入
  if (!groups[groupId] || groups[groupId] !== groupName) {
    groups[groupId] = groupName || "未知群組";
    props.setProperty('JOINED_GROUPS_MAP', JSON.stringify(groups));
  }
}

function getRecordedGroups() {
  const props = PropertiesService.getScriptProperties();
  let groupsString = props.getProperty('JOINED_GROUPS_MAP');
  return groupsString ? JSON.parse(groupsString) : {};
}

function getGroupName(groupId) {
  try {
    const url = \`https://api.line.me/v2/bot/group/\${groupId}/summary\`;
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      return data.groupName;
    }
    return "未知群組";
  } catch (e) {
    console.error('Error getting group name:', e);
    return "未知群組";
  }
}

function getUserName(userId, groupId) {
  try {
    // 根據是否在群組內，呼叫不同的 API 路徑
    let url = \`https://api.line.me/v2/bot/profile/\${userId}\`;
    if (groupId) {
      url = \`https://api.line.me/v2/bot/group/\${groupId}/member/\${userId}\`;
    }
    
    const options = {
      method: 'get',
      headers: {
        'Authorization': \`Bearer \${LINE_CHANNEL_ACCESS_TOKEN}\`
      }
    };
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    // 在取得的 LINE 暱稱後面加上「君」
    return json.displayName + '君';
  } catch (e) {
    console.error("Get User Name Error:", e);
    return '熱心民眾'; // 若發生錯誤或無權限，回傳預設名稱
  }
}

function replyLineMessage(replyToken, text) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const payload = {
    replyToken: replyToken,
    messages: [
      {
        type: 'text',
        text: text
      }
    ]
  };
  
  const options = {
    method: 'post',
    headers: {
      'Authorization': \`Bearer \${LINE_CHANNEL_ACCESS_TOKEN}\`
    },
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  UrlFetchApp.fetch(url, options);
}`;

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
                在 LINE Developers Console (Messaging API 設定頁面)，請確認 <strong>Use webhook</strong> 的開關已經打開。您可以點擊 Webhook URL 旁邊的 <strong>Verify</strong> 按鈕，如果顯示 Success，代表連線正常。
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
