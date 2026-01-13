require("dotenv").config(); // ✅ 加這行

const fs = require("fs");
const path = require("path");
const express = require("express");
const line = require("@line/bot-sdk");

const app = express();
const port = process.env.PORT || 3000;

//// ✅ 1) LINE 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// ✅ 2) 先初始化 client（避免 handleEvent 用到時還沒建立）
const client = new line.Client(config);

// ✅ 3) 測試路由：確認伺服器有活著
app.get("/", (req, res) => {
  res.send("LINE 防詐機器人後端 Server 運作中...");
});

// ✅ 4) Webhook：加上 log，且避免 req.body / events 為空時爆掉
app.post("/webhook", line.middleware(config), (req, res) => {
  console.log("✅ /webhook hit");
  console.log(JSON.stringify(req.body, null, 2));

  // ✅ 先回 200（重要！避免 LINE 重送）
  res.sendStatus(200);

  // ✅ 再處理事件（即使出錯也不影響 webhook 回應）
  Promise.all(
    (req.body.events || []).map(async (event) => {
      try {
        return await handleEvent(event);
      } catch (err) {
        console.error("❌ handleEvent error:", err?.originalError || err);
        return null;
      }
    })
  );
});

// ✅ 5) 確保 handleEvent 一定 return Promise（replyMessage 本身就是 Promise）
function handleEvent(event) {
  if (event.type === "message" && event.message?.type === "text") {
    const data = {
      userId: event.source.userId,
      text: event.message.text,
      timestamp: event.timestamp,
    };

    const filePath = path.join(__dirname, "messages.jsonl");

    fs.appendFileSync(filePath, JSON.stringify(data) + "\n", "utf-8");

    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `已儲存：${event.message.text}`,
    });
  }

  return Promise.resolve(null);
}

// ✅ 6) 加上錯誤處理（可以抓到 middleware 擋下來的錯）
app.use((err, req, res, next) => {
  console.error("❌ middleware error:", err);
  res.status(500).send(err.message);
});

// ✅ 7) 啟動伺服器
app.listen(port, () => {
  console.log(`伺服器已啟動，監聽 Port: ${port}`);
});
