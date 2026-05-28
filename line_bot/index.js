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

// 2) 先初始化 client
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
  return /幫我抓取訊息|開始偵測|開始讀取/.test(text);
}

function isCommandToStop(text) {
  return /取消讀取|停止偵測|停止讀取/.test(text);
}

// 3) 測試路由
app.get("/", (req, res) => {
  res.send("LINE 防詐機器人後端 Server 運作中...");
});

// 4) Webhook
app.post("/webhook", line.middleware(config), (req, res) => {
  console.log("✅ /webhook hit");

  res.sendStatus(200);

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

// 🔴 修改點 1：API 呼叫加入 message_type，並延長 timeout 給 OCR 慢慢跑
async function callAnalyzeAPI({ userId, messageType, text }) {
  const res = await axios.post(
    "http://127.0.0.1:8000/analyze/text",
    {
      user_id: userId,
      message_type: messageType, // 告訴大腦這是文字還是圖片
      content: text,
    },
    { timeout: 15000 }, // 因為圖片轉文字比較花時間，放寬到 15 秒
  );

  return res.data;
}

// 5) 🔴 修改點 2：負責處理訊息的 handleEvent 大升級 (支援圖片下載)
async function handleEvent(event) {
  // 放寬限制：允許 message 類型，且必須是 text 或 image
  if (event.type !== "message") return Promise.resolve(null);
  if (event.message.type !== "text" && event.message.type !== "image") {
    return Promise.resolve(null);
  }

  const msgType = event.message.type;
  const source = event?.source || {};
  const sourceType = source.type || "unknown";
  const safeUserId =
    source.userId || source.groupId || source.roomId || "unknown_user";

  let payloadContent = ""; // 準備送給 Python 的內容 (文字 或 Base64)
  let logText = ""; // 準備存進 messages.jsonl 的紀錄文字

  if (msgType === "text") {
    const trimmedText = event.message.text.trim();
    if (
      trimmedText === "如何上傳可疑訊息?" ||
      trimmedText === "如何使用家庭群組?" ||
      trimmedText === "如何把「真識監詐」拉進群組一起防詐?" ||
      trimmedText === "上傳" ||
      trimmedText === "我想通報165!!!" ||
      trimmedText === "新手導覽" ||
      trimmedText === "新手教學" ||
      trimmedText === "家庭群組" ||
      trimmedText === "邀請到群組" ||
      trimmedText === "邀請至群組" ||
      trimmedText === "其他假新聞" ||
      trimmedText === "其他假新聞資訊"
    ) {
      console.log(
        `🤫 命中特定文字 [${trimmedText}]，系統不進行任何回覆與後續分析。`,
      );
      return Promise.resolve(null);
    }
  }

  try {
    // 💡 判斷是文字還是圖片
    if (msgType === "text") {
      payloadContent = event.message.text.trim();
      logText = payloadContent;
    } else if (msgType === "image") {
      // 向 LINE 伺服器請求下載圖片
      const stream = await client.getMessageContent(event.message.id);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      payloadContent = buffer.toString("base64"); // 轉成 Base64 亂碼
      logText = "[圖片訊息]"; // Jsonl 檔案裡不要存亂碼，存標籤就好
    }

    // ===== 群組邏輯 =====
    if (sourceType === "group") {
      const groupId = event.source.groupId;
      const state = loadState();
      const isOn = !!state[groupId];

      // 群組指令只接受文字
      if (msgType === "text") {
        if (isCommandToStart(payloadContent)) {
          state[groupId] = true;
          saveState(state);
          return client.replyMessage(event.replyToken, {
            type: "text",
            text: "✅ 已開始監控本群組訊息（只記錄之後的新訊息）。",
          });
        }
        if (isCommandToStop(payloadContent)) {
          state[groupId] = false;
          saveState(state);
          return client.replyMessage(event.replyToken, {
            type: "text",
            text: "⛔ 已停止監控本群組訊息。",
          });
        }
      }

      if (!isOn) return Promise.resolve(null);

      const data = {
        sourceType,
        userId: safeUserId,
        text: logText,
        timestamp: event.timestamp,
      };
      fs.appendFileSync(
        path.join(__dirname, "messages.jsonl"),
        JSON.stringify(data) + "\n",
        "utf-8",
      );
    } else {
      // 一對一聊天：直接寫入檔案存檔
      const data = {
        sourceType,
        userId: safeUserId,
        text: logText,
        timestamp: event.timestamp,
      };
      fs.appendFileSync(
        path.join(__dirname, "messages.jsonl"),
        JSON.stringify(data) + "\n",
        "utf-8",
      );
    }

    // ===== 一對一聊天：寫入 + 呼叫 FastAPI 分析 + 回覆 =====

    // 將資料送給 Python 大腦
    const responseData = await callAnalyzeAPI({
      userId: safeUserId,
      messageType: msgType,
      text: payloadContent,
    });

    if (!responseData || responseData.risk_level === null) {
      return Promise.resolve(null);
    }

    const riskLevel = responseData.risk_level;
    const replyText = responseData.reply_text;

    let emoji = "🟢";
    let riskZh = "(安全)";
    if (riskLevel === "Yellow") {
      emoji = "🟡";
      riskZh = "(注意!)";
    } else if (riskLevel === "Red") {
      emoji = "🔴";
      riskZh = "(危險!!!)";
    }

    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `【「真識監詐」防詐分析】\n${emoji} 風險等級：${riskLevel} ${riskZh}\n\n${replyText}`,
    });
  } catch (err) {
    console.error(
      "處理訊息或呼叫 API 失敗:",
      err?.response?.data || err.message,
    );

    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "分析服務未啟動或連線異常，已先幫您保存訊息。",
    });
  }
}

// 6) 錯誤處理
app.use((err, req, res) => {
  console.error("❌ middleware error:", err);
  res.status(500).send(err.message);
});

function cleanAndRefreshUserList() {
  try {
    const data = fs.readFileSync("./messages.jsonl", "utf8");
    const lines = data.trim().split("\n");
    const allIds = lines.map((line) => JSON.parse(line).userId);
    const uniqueIds = [...new Set(allIds)];

    fs.writeFileSync(
      "./users.json",
      JSON.stringify({ users: uniqueIds }, null, 2),
    );
    return uniqueIds;
  } catch (err) {
    console.error("清洗失敗:", err.message);
    return [];
  }
}

async function runNewsAiTask() {
  try {
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
    const firstNews = feed.items[0];

    // 🔴 修改點 3：推播新聞給 Python 分析時，也要加上 message_type: "text"
    const aiResponse = await axios.post(
      "http://127.0.0.1:8000/analyze/text",
      {
        user_id: "news_bot_system",
        message_type: "text", // 確保 Python 知道這是文字
        content: `【標題】：${firstNews.title}\n【來源】：${firstNews.title.split(" - ")[1] || "新聞媒體"}\n【連結】：${firstNews.link}`,
      },
      {
        timeout: 30000,
        headers: { "Content-Type": "application/json" },
      },
    );

    const aiReplyText = aiResponse.data.reply_text || "無法取得分析結果";
    const pushText = [
      `📢【真識監詐-每日報你知】`,
      `----------------------`,
      aiReplyText,
      `----------------------`,
      `新聞來源：${firstNews.title.split(" - ")[1] || "新聞媒體"}`,
      `完整閱讀：${firstNews.link}`,
    ].join("\n");

    for (const userId of allUserIds) {
      try {
        await client.pushMessage(userId, { type: "text", text: pushText });
        console.log(`✅ 成功發送給: ${userId}`);
      } catch (pushErr) {
        console.error(`❌ 發送失敗給 ${userId}:`, pushErr.message);
      }
    }
    console.log("全數推播任務完成！");
  } catch (err) {
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

// 啟動伺服器
app.listen(port, async () => {
  console.log(`🚀 LINE 防詐機器人後端 Server 運作中，埠號：${port}`);
  try {
    await runNewsAiTask();
    console.log("✅ 初始推播任務執行成功");
  } catch (err) {
    console.error("❌ 初始推播任務失敗:", err);
  }
});
