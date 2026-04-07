require("dotenv").config();

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const express = require("express");
const line = require("@line/bot-sdk");

const app = express();
const port = process.env.PORT || 3000;
const Parser = require("rss-parser");
const parser = new Parser();

//// 1) LINE 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// 2) 先初始化 client（避免 handleEvent 用到時還沒建立）
const client = new line.Client(config);
const STATE_FILE = path.join(__dirname, "monitor_state.json");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

function isCommandToStart(text) {
  return /幫我抓取訊息|開始監控|開始讀取/.test(text);
}

function isCommandToStop(text) {
  return /取消讀取|停止監控|停止讀取/.test(text);
}

// 3) 測試路由：確認伺服器有活著
app.get("/", (req, res) => {
  res.send("LINE 防詐機器人後端 Server 運作中...");
});

// 4) Webhook：加上 log，且避免 req.body / events 為空時爆掉
app.post("/webhook", line.middleware(config), (req, res) => {
  console.log("✅ /webhook hit");
  console.log(JSON.stringify(req.body, null, 2));

  // 先回 200（重要！避免 LINE 重送）
  res.sendStatus(200);

  //再處理事件（即使出錯也不影響 webhook 回應）
  Promise.all(
    (req.body.events || []).map(async (event) => {
      try {
        return await handleEvent(event);
      } catch (err) {
        console.error("❌ handleEvent error:", err?.originalError || err);
        return null;
      }
    }),
  );
});

async function callAnalyzeAPI({ userId, messageType, text }) {
  const res = await axios.post(
    "http://127.0.0.1:8000/analyze/text", // 🔴 修改：對齊 Python 的 API 路由
    {
      user_id: userId,
      content: text, // 🔴 修改：Python 規定的欄位名稱是 content
    },
    { timeout: 8000 },
  );

  return res.data;
}

// 5) 確保 handleEvent 一定 return Promise（replyMessage 本身就是 Promise）
async function handleEvent(event) {
  if (!(event.type === "message" && event.message?.type === "text")) {
    return Promise.resolve(null);
  }

  const text = event.message.text.trim();

  //先保護 source（避免 event.source 偶發 undefined）
  const source = event?.source || {};
  const sourceType = source.type || "unknown";

  const safeUserId =
    source.userId || source.groupId || source.roomId || "unknown_user";

  // ===== 群組邏輯 =====
  if (sourceType === "group") {
    const groupId = event.source.groupId;
    const state = loadState();
    const isOn = !!state[groupId];

    // 開始監控
    if (isCommandToStart(text)) {
      state[groupId] = true;
      saveState(state);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "✅ 已開始監控本群組訊息（只記錄之後的新訊息）。",
      });
    }

    // 停止監控
    if (isCommandToStop(text)) {
      state[groupId] = false;
      saveState(state);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "⛔ 已停止監控本群組訊息。",
      });
    }

    // 沒開監控就不做事
    if (!isOn) return Promise.resolve(null);

    // 寫入訊息
    const data = {
      sourceType,
      userId: safeUserId,
      text,
      timestamp: event.timestamp,
    };

    fs.appendFileSync(
      path.join(__dirname, "messages.jsonl"),
      JSON.stringify(data) + "\n",
      "utf-8",
    );

    return Promise.resolve(null); // 不吵群
  }

  // ===== 一對一聊天：寫入 + 呼叫 FastAPI 分析 + 回覆 =====
  const data = {
    sourceType,
    userId: safeUserId,
    text,
    timestamp: event.timestamp,
  };

  fs.appendFileSync(
    path.join(__dirname, "messages.jsonl"),
    JSON.stringify(data) + "\n",
    "utf-8",
  );

  try {
    const responseData = await callAnalyzeAPI({
      userId: safeUserId,
      messageType: "text",
      text: text,
    });

    // 🟢 配合 AI 版本：直接讀取 risk_level 和 reply_text
    const riskLevel = responseData.risk_level;
    const replyText = responseData.reply_text;

    let emoji = "🟢"; // 預設綠色
    if (riskLevel === "Yellow") {
      emoji = "🟡";
    } else if (riskLevel === "Red") {
      emoji = "🔴";
    }

    // 🟢 配合 AI 版本：印出等級和 AI 寫好的回覆
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `【坤坤防詐分析】\n${emoji} 風險等級：${riskLevel}\n\n${replyText}`,
    });
  } catch (err) {
    console.error("callAnalyzeAPI error:", err?.response?.data || err.message);

    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "分析服務未啟動或暫時無法連線，已先幫你保存訊息。",
    });
  }
}

// 6) 加上錯誤處理（可以抓到 middleware 擋下來的錯）
app.use((err, req, res) => {
  console.error("❌ middleware error:", err);
  res.status(500).send(err.message);
});

//
function cleanAndRefreshUserList() {
  //清理我聊天的資料
  try {
    const data = fs.readFileSync("./messages.jsonl", "utf8");
    const lines = data.trim().split("\n");
    const allIds = lines.map((line) => JSON.parse(line).userId);
    const uniqueIds = [...new Set(allIds)];

    // 寫入 users.json 備份
    fs.writeFileSync(
      "./users.json",
      JSON.stringify({ users: uniqueIds }, null, 2),
    );

    return uniqueIds; // 回傳 ID 陣列給後面的程式用
  } catch (err) {
    console.error("清洗失敗:", err.message);
    return [];
  }
}

async function runNewsAiTask() {
  //AI 回復
  try {
    // 修正：呼叫剛剛寫的清洗功能，從 users.json 拿乾淨的名單
    const allUserIds = cleanAndRefreshUserList();

    if (!allUserIds || allUserIds.length === 0) {
      console.log("⚠️ 目前沒有任何加好友的使用者。");
      return;
    }

    console.log(`🔍 開始抓取新聞並準備推播給 ${allUserIds.length} 位用戶...`);

    const rawUrl =
      "https://news.google.com/rss/search?q=詐騙+台灣&hl=zh-TW&gl=TW&ceid=TW:zh-Hant";
    const encodedUrl = encodeURI(rawUrl);
    const feed = await parser.parseURL(encodedUrl);

    // 1. 先取出「第一則」新聞物件
    const firstNews = feed.items[0];

    // 1. 呼叫 AI 分析 (🔴 路由和欄位已更新)
    const aiResponse = await axios.post(
      "http://127.0.0.1:8000/analyze/text",
      {
        user_id: "news_bot_system",
        content: `【標題】：${firstNews.title}\n【來源】：${firstNews.title.split(" - ")[1] || "新聞媒體"}\n【連結】：${firstNews.link}`,
      },
      {
        timeout: 30000,
        headers: { "Content-Type": "application/json" },
      },
    );

    // 2. 組合最終要推播的文字 (🔴 取出 Python 回傳的 reason 作為分析內容)
    // 2. 組合最終要推播的文字
    const aiReplyText = aiResponse.data.reply_text || "無法取得分析結果";
    const pushText = [
      `📢【真識監詐-每日報你知】`,
      `----------------------`,
      aiReplyText,
      `----------------------`,
      `新聞來源：${firstNews.title.split(" - ")[1] || "新聞媒體"}`,
      `完整閱讀：${firstNews.link}`,
    ].join("\n");

    // ❌ 這裡原本有 await client.pushMessage(targetId, ...)，請整段刪除！

    // 3. 安全發送推播給所有人 (使用迴圈)
    for (const userId of allUserIds) {
      try {
        await client.pushMessage(userId, {
          type: "text",
          text: pushText,
        });
        console.log(`✅ 成功發送給: ${userId}`);
      } catch (pushErr) {
        console.error(`❌ 發送失敗給 ${userId}:`, pushErr.message);
      }
    }

    console.log("全數推播任務完成！");
  } catch (err) {
    // 🚨 這裡就是你剛才漏掉的 catch 區塊！抓 FastAPI 的 400 錯誤全靠它
    if (err.response) {
      console.log(
        "🔍 終極錯誤細節：",
        JSON.stringify(err.response.data, null, 2),
      );
    } else {
      console.log("❌ 網路層級錯誤:", err.message);
    }
  }
}
//

//啟動伺服器
app.listen(port, async () => {
  console.log(`🚀 LINE 防詐機器人後端 Server 運作中，埠號：${port}`);

  // 伺服器啟動後自動執行一次推播任務
  try {
    // 如果你已經改成廣播模式，就不用傳 ID
    await runNewsAiTask();
    console.log("✅ 初始推播任務執行成功");
  } catch (err) {
    console.error("❌ 初始推播任務失敗:", err);
  }
});
