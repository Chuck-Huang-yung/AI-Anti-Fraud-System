require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");

const app = express();
const port = process.env.PORT || 3000;

// 設定 LINE Bot 的參數 (之後會填入)
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// 測試路由：確認伺服器有活著
app.get("/", (req, res) => {
  res.send("LINE 防詐機器人後端 Server 運作中...");
});

// LINE Webhook 入口：LINE 的訊息會傳到這裡
// 注意：middleware(config) 會處理簽章驗證，這在資安上很重要
app.post("/callback", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// 簡單的事件處理函數
function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  // 這裡之後會呼叫 Python AI 進行語義分析
  // 目前先做簡單的 echo (回聲) 測試
  return client.replyMessage(event.replyToken, {
    type: "text",
    text: `你說了: ${event.message.text}`,
  });
}

// 啟動伺服器
app.listen(port, () => {
  console.log(`伺服器已啟動，監聽 Port: ${port}`);
});

// 初始化 LINE Client
const client = new line.Client(config);
