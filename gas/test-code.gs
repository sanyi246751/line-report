// 1. 請填入您的設定值
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
          let helpMsg = '💡 【路燈通報機器人功能說明】\n\n';
          helpMsg += '📌 一般民眾功能：\n';
          helpMsg += '1. 傳送「路燈照片」，機器人會自動辨識編號並通報。\n';
          helpMsg += '2. 傳送「路燈編號」+「故障狀況」(如: 01001 不亮)，機器人會自動通報。\n';
          helpMsg += '3. 支援「連續通報」：先傳送故障狀況(如: 不亮)，3分鐘內連續傳送多組路燈編號(如: 05125)，系統會自動套用該狀況並通報。\n';
          helpMsg += '4. 支援「無編號通報」：若不知道號碼，請傳送「沒有號碼 不亮」，系統會以 99999 代替編號通報。\n\n';
          
          if (groupId === ADMIN_GROUP_ID || groupId === "DIRECT") {
            helpMsg += '🛠️ 管理員專屬指令：\n';
            helpMsg += '🔹 查詢群組ID：取得目前群組的 ID\n';
            helpMsg += '🔹 查詢所有群組：列出機器人加入的所有群組名稱與 ID\n';
            helpMsg += '🔹 查詢關鍵字：列出目前觸發通報的關鍵字\n';
            helpMsg += '🔹 新增關鍵字 [詞]：例如「新增關鍵字 黑漆漆」\n';
            helpMsg += '🔹 刪除關鍵字 [詞]：例如「刪除關鍵字 沒亮」';
          } else {
            helpMsg += '※ 管理員指令僅限於專屬後台群組使用。';
          }
          
          replyLineMessage(replyToken, helpMsg);
          return ContentService.createTextOutput('OK');
        }
        
        if (userText === '查詢群組ID') {
          replyLineMessage(replyToken, `此群組的 ID 為：\n${groupId}`);
          return ContentService.createTextOutput('OK');
        }
        
        if (userText === '查詢所有群組') {
          if (groupId === ADMIN_GROUP_ID || groupId === "DIRECT") {
            const groups = getRecordedGroups();
            if (Object.keys(groups).length === 0) {
              replyLineMessage(replyToken, '目前沒有記錄到任何群組。');
            } else {
              let msg = '機器人目前記錄到的群組列表：\n';
              for (const id in groups) {
                msg += `- ${groups[id]} (ID: ${id})\n`;
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
                replyLineMessage(replyToken, added ? `已新增關鍵字：「${newKw}」` : `關鍵字「${newKw}」已存在。`);
              }
            } else if (userText.startsWith('刪除關鍵字 ')) {
              const rmKw = userText.replace('刪除關鍵字 ', '').trim();
              if (rmKw) {
                const removed = removeKeyword(rmKw);
                replyLineMessage(replyToken, removed ? `已刪除關鍵字：「${rmKw}」` : `找不到關鍵字「${rmKw}」。`);
              }
            } else if (userText === '查詢關鍵字') {
              const currentKws = getKeywords();
              replyLineMessage(replyToken, `目前的觸發關鍵字有：\n${currentKws.join('、')}`);
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
          replyLineMessage(replyToken, `請 ${userName} 提供路燈號碼或撥打專線電話876782找路燈承辦吳小姐，謝謝您的幫忙!`);
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

          // --- 核心修改：進行分組處理 (連續連號分組) ---
          const finalGroups = [];
          if (validNumbers.length > 0) {
            let currentGroup = [validNumbers[0]];
            for (let i = 1; i < validNumbers.length; i++) {
              const prev = parseInt(validNumbers[i - 1], 10);
              const curr = parseInt(validNumbers[i], 10);
              // 如果號碼相差 1 則視為連續
              if (curr - prev === 1) {
                currentGroup.push(validNumbers[i]);
              } else {
                finalGroups.push(currentGroup);
                currentGroup = [validNumbers[i]];
              }
            }
            finalGroups.push(currentGroup);
          }
          
          let replyMsg = `謝謝 ${userName} 的幫忙！\n`;
          let allSuccess = true;
          
          finalGroups.forEach((groupNums) => {
            const mainNumber = groupNums[0];
            let issueText = analysisResult.issueText;
            const isOtherIssue = groupNums.length > 1;
            
            if (isOtherIssue) {
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
            
            let displayIssue = groupNums.length > 1 ? `${groupNums.join('、')}${analysisResult.issueText}` : `${mainNumber}${analysisResult.issueText}`;
            replyMsg += `\n已通報：${displayIssue}`;
          });
          
          if (invalidNumbers.length > 0) {
            replyMsg += `\n\n(提醒：號碼${invalidNumbers.join('、')}有誤，請確認)`;
          }
          
          if (!allSuccess) replyMsg += `\n\n(部分表單提交失敗，請確認表單必填欄位)`;
          replyLineMessage(replyToken, replyMsg);
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
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
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
  
  const prompt = `這是一張包含路燈編號的圖片（可能是手寫或印刷）。請分析圖片並以 JSON 格式回傳以下資訊，不要包含其他文字：
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
- issue: 字串，根據圖片判斷故障情形。請從 "路燈不亮", "路燈閃爍", "白天亮燈", "路燈轉向", "無法判斷" 中擇一。如果圖片只有數字沒有寫故障原因，請務必回傳 "無法判斷"（不要自己預設為路燈不亮）。`;
  
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 429) {
      console.error(`Gemini API Rate Limit Exceeded (Image) using key ${i + 1}`);
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
      console.error(`Gemini API Error (Image HTTP ${responseCode}) using key ${i + 1}:`, responseText);
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
    
    const prompt = `你是一個路燈維修通報助理。請從以下文字中提取路燈編號與故障狀況。
文字內容：「${text}」

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
- issue: 字串，故障狀況。請從 "路燈不亮", "路燈閃爍", "白天亮燈", "路燈轉向", "無法判斷" 中擇一。如果文字中沒提到故障狀況，請務必回傳 "無法判斷"（不要自己預設為路燈不亮）。`;
    
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      if (responseCode === 429) {
        console.error(`Gemini API Rate Limit Exceeded using key ${i + 1}`);
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
        console.error(`Gemini API Error (HTTP ${responseCode}) using key ${i + 1}:`, responseText);
        if (i < apiKeys.length - 1) {
          continue;
        }
        return null;
      }
      
      const json = JSON.parse(responseText);
      if (json.candidates && json.candidates.length > 0 && json.candidates[0].content && json.candidates[0].content.parts) {
        return processAnalysisResult(json.candidates[0].content.parts[0].text);
      }
      console.error(`Gemini API No Candidates using key ${i + 1}:`, responseText);
    }
    return null;
  } catch (e) {
    console.error("analyzeStreetLightText Error:", e);
    return null;
  }
}

function processAnalysisResult(resultText) {
  try {
    const cleanText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
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
      if (/^\d{4}$/.test(str)) {
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
    const url = `https://api.line.me/v2/bot/group/${groupId}/summary`;
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
    let url = `https://api.line.me/v2/bot/profile/${userId}`;
    if (groupId) {
      url = `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`;
    }
    
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    };
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    // 在取得的 LINE 暱稱後面加上「君」
    return json.displayName + '君';
  } catch (e) {
    console.error("Get User Name Error:", e);
    return '熱心民眾'; // 若發生錯誤過無權限，回傳預設名稱
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
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  UrlFetchApp.fetch(url, options);
}
