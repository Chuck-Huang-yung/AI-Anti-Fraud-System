require("dotenv").config();

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cron = require("node-cron");
const line = require("@line/bot-sdk");

const app = express();
app.use("/bot-assets", express.static(path.join(__dirname, "public")));
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
// ==========================================
// ⏰ 全域防詐連環鬧鐘追蹤中心 (Escalation Protocol)
// ==========================================
// ==========================================
// ⏰ 全域防詐連環鬧鐘追蹤中心 (無敵防彈終止版)
// ==========================================
const activeAlarms = {};
const alarmThrottleCache = {};
const MAX_ALARM_COUNT = 5;
const explanationCache = {};
// 🌟 神級輔助：強制標準化鬧鐘 Key，去除空白並統一大小寫！(現在只針對「受害者」)
function getAlarmKey(targetId) {
  // 只用 targetId 來追蹤，不管他在幾個群組，同一個受害者只會有一個鬧鐘！
  return `ALARM_${(targetId || "").trim().toLowerCase()}`;
}
// 啟動 10 分鐘連環鬧鐘
function startAlarmLoop(targetId, broadcastTask) {
  const alarmKey = getAlarmKey(targetId);

  if (activeAlarms[alarmKey]) {
    console.log(`⏰ [鬧鐘已存在] ${alarmKey} 目前已經在連續呼叫中...`);
    return;
  }

  let count = 0;
  console.log(`⏰ [啟動連續鬧鐘] ${alarmKey} 將每隔 10 分鐘發送一次緊急警報！`);

  activeAlarms[alarmKey] = setInterval(
    async () => {
      count++;
      console.log(
        `⏰ [連續鬧鐘觸發] 尚未確認，正在為 ${alarmKey} 重新發送警報...`,
      );
      await broadcastTask();

      if (count >= MAX_ALARM_COUNT) {
        console.log(
          `🛑 [達到上限自動停止] ${alarmKey} 已連續提醒 ${MAX_ALARM_COUNT} 次，系統自動關閉！`,
        );
        stopAlarmLoop(targetId);
      }
    },
    10 * 60 * 1000,
  );
}

// 停止並銷毀鬧鐘
function stopAlarmLoop(targetId) {
  const alarmKey = getAlarmKey(targetId);
  if (activeAlarms[alarmKey]) {
    clearInterval(activeAlarms[alarmKey]);
    delete activeAlarms[alarmKey];
    console.log(`🛑 [成功關閉鬧鐘] ${alarmKey} 的連續警報已被徹底終止！`);
  }
}

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
  return /幫我抓取訊息|開始偵測|開啟偵測|開始讀取/.test(text);
}

function isCommandToStop(text) {
  return /取消讀取|停止偵測|關閉偵測|停止讀取/.test(text);
}
// ==========================================
// 🌟 新增：隨選即時新聞產生器 (支援群組與私訊)
// ==========================================
let lastNewsIndex = -1;
async function replyWithNews(replyToken, chatId) {
  try {
    // 🌟 新增：觸發 LINE 的讀取特效
    if (chatId && chatId.startsWith("U")) {
      try {
        await axios.post(
          "https://api.line.me/v2/bot/chat/loading/start",
          { chatId: chatId, loadingSeconds: 60 },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`,
            },
          },
        );
      } catch (loadingErr) {
        console.error("⚠️ 無法顯示讀取動畫:", loadingErr.message);
      }
    }
    const rawUrl =
      "https://news.google.com/rss/search?q=詐騙+台灣&hl=zh-TW&gl=TW&ceid=TW:zh-Hant";
    const encodedUrl = encodeURI(rawUrl);
    const feed = await parser.parseURL(encodedUrl);

    // 💡 貼心優化：隨機從最新的前 10 篇新聞抽一篇，讓使用者連續點擊也能看到不同的新聞
    let randomIndex;
    const maxNewsCount = Math.min(10, feed.items.length);
    do {
      randomIndex = Math.floor(Math.random() * maxNewsCount);
    } while (randomIndex === lastNewsIndex && maxNewsCount > 1);

    // 更新紀錄，把這次的號碼記下來
    lastNewsIndex = randomIndex;
    const newsItem = feed.items[randomIndex];

    // 💡 解決網址斷掉問題：呼叫免費的 TinyURL API 把 Google 超長網址縮短
    let shortUrl = newsItem.link;
    try {
      // 使用你已經裝好的 axios 直接呼叫
      const urlRes = await axios.get(
        `https://tinyurl.com/api-create.php?url=${encodeURIComponent(newsItem.link)}`,
        { timeout: 5000 },
      );
      if (urlRes.data) {
        shortUrl = urlRes.data; // 成功取得短短的網址！
      }
    } catch (urlErr) {
      console.error("⚠️ 縮網址服務暫時無回應，將使用原始網址");
    }

    // 呼叫 Python 大腦針對這篇新聞進行總結 (共用每日新聞的 Prompt)
    const aiResponse = await axios.post(
      "http://127.0.0.1:8000/analyze/text",
      {
        user_id: "news_bot_system",
        message_type: "text",
        content: `【標題】：${newsItem.title}\n【來源】：${newsItem.title.split(" - ")[1] || "新聞媒體"}\n【連結】：${newsItem.link}`,
      },
      { timeout: 30000, headers: { "Content-Type": "application/json" } },
    );

    const aiReplyText = aiResponse.data.reply_text || "無法取得分析結果";

    // 組裝與每日新聞完全一致的格式
    const replyText = [
      `📢【真識監詐-即時報你知】`,
      `----------------------`,
      aiReplyText,
      `----------------------`,
      `新聞來源：${newsItem.title.split(" - ")[1] || "新聞媒體"}`,
      `完整閱讀：${shortUrl}`,
    ].join("\n");

    // 將新聞發送回當前的聊天室 (群組或私訊皆可)
    return client.replyMessage(replyToken, { type: "text", text: replyText });
  } catch (err) {
    console.error("❌ 獲取即時新聞失敗:", err.message);
    return client.replyMessage(replyToken, {
      type: "text",
      text: "抱歉，目前無法取得最新新聞，請稍後再試！",
    });
  }
}
// ==========================================
// 🌟 前端與資料庫專區
// ==========================================
const cors = require("cors");
app.use(cors()); // 允許前端連線

const { Pool } = require("pg");
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "fraud_db",
  password: "0509", // 👈 記得改！
  port: 5432,
});

// 你寫好的建立群組 API (加上 express.json() 解析)
// ==========================================
// 🌟 真正寫入 family_groups 的 API
// ==========================================
app.post("/api/groups", express.json(), async (req, res) => {
  console.log("收到前端建立群組請求：", req.body);

  const client = await pool.connect();

  try {
    const { groupName, userId, userName } = req.body;
    if (!groupName || !userId) {
      return res.status(400).json({ error: "缺少必要參數" });
    }

    // 🌟 修改點 1：神級防呆！自動幫資料庫表格加上 member_count 欄位
    await client.query(
      "ALTER TABLE family_groups ADD COLUMN IF NOT EXISTS member_count INT DEFAULT 1;",
    );
    // 1. 產生 GRP- 亂數 ID
    const groupId =
      "GRP-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    // 2. 準備你要塞進 members (jsonb) 的初始建立者資料
    const initialMembers = [
      {
        userId: userId,
        userName: userName || "Unknown User",
        role: "管理員",
        status: "正常",
      },
    ];

    // 🌟 修改點 2：SQL 增加 member_count 欄位與數值 $6 (填入 1)
    const insertQuery = `
      INSERT INTO family_groups (group_id, group_name, status, members, muted, member_count, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *;
    `;

    // 注意：把 initialMembers 轉成字串 (JSON.stringify) 才能存入 jsonb 欄位
    const values = [
      groupId,
      groupName,
      "正常",
      JSON.stringify(initialMembers),
      false,
      initialMembers.length,
    ];

    const result = await client.query(insertQuery, values);
    console.log("✅ 成功寫入 family_groups:", result.rows[0]);

    // 4. 回傳給前端
    res.status(201).json({
      success: true,
      groupId: groupId,
      data: result.rows[0], // 這裡回傳的會是包含 group_id, group_name 等完美欄位的資料
    });
  } catch (err) {
    console.error("❌ 建立群組錯誤:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    client.release();
  }
});
// ==========================================
// ==========================================

// ==========================================
// 🌟 取得指定使用者的所有群組 (無敵防彈版：已修正 parsedPending 宣告)
// ==========================================
app.get("/api/groups/user/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "缺少 userId" });

  const cleanUserId = userId.trim();
  console.log(`\n[🔍 API 收到請求] 正在向 PostgreSQL 查詢用戶: ${cleanUserId}`);

  const client = await pool.connect();
  try {
    await client.query(
      "ALTER TABLE family_groups ADD COLUMN IF NOT EXISTS member_count INT DEFAULT 1;",
    );
    await client.query(
      "ALTER TABLE family_groups ADD COLUMN IF NOT EXISTS pending_members JSONB DEFAULT '[]'::jsonb;",
    );
    await client.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS picture_url TEXT;",
    );

    // 💡 1. 抓取所有註冊用戶的最新暱稱與頭像，做成快取字典
    const allUsersRes = await client.query(
      "SELECT user_id, nickname, picture_url, line_id, created_at FROM users",
    );
    const userMap = {};
    allUsersRes.rows.forEach((u) => {
      userMap[u.user_id.toLowerCase()] = {
        nickname: u.nickname,
        pictureUrl: u.picture_url || "",
        lineId: u.line_id || "未填寫",
        createdAt: u.created_at
          ? new Date(u.created_at).toISOString().split("T")[0]
          : "2026-01-01", // 🌟 精準只取 YYYY-MM-DD
      };
    });

    // 🌟 SQL 條件加上 AND status != '已解散'，並抓取 pending_members！
    const query = `
      SELECT group_id AS id, group_name AS name, status, muted, members, pending_members, member_count, created_at
      FROM family_groups
      WHERE LOWER(members::text) LIKE LOWER($1) AND status != '已解散'
      ORDER BY created_at DESC;
    `;
    const result = await client.query(query, [`%${cleanUserId}%`]);

    console.log(
      `[✅ SQL 執行成功] 資料庫共找到 ${result.rows.length} 筆群組！`,
    );

    const formattedGroups = result.rows.map((row) => {
      // 🌟 1. 【關鍵修復】：同時宣告並解析 parsedMembers 與 parsedPending！
      let parsedMembers =
        typeof row.members === "string"
          ? JSON.parse(row.members || "[]")
          : row.members || [];
      let parsedPending =
        typeof row.pending_members === "string"
          ? JSON.parse(row.pending_members || "[]")
          : row.pending_members || [];

      // 🌟 幫成員補齊名片所需的最新資訊
      parsedMembers = parsedMembers.map((m) => {
        const uInfo = userMap[(m.userId || "").toLowerCase()];
        return {
          ...m,
          userName: uInfo?.nickname || m.userName || m.name || "未命名成員",
          pictureUrl: uInfo?.pictureUrl || m.pictureUrl || m.avatarUri || "",
          lineId: uInfo?.lineId || m.lineId || "未填寫",
          createdAt: uInfo?.createdAt || m.createdAt || "2026-01-01",
        };
      });

      parsedPending = parsedPending.map((m) => {
        const uInfo = userMap[(m.userId || "").toLowerCase()];
        return {
          ...m,
          userName: uInfo?.nickname || m.userName || m.name || "未命名申請人",
          pictureUrl: uInfo?.pictureUrl || m.pictureUrl || m.avatarUri || "",
          lineId: uInfo?.lineId || "未填寫",
          createdAt: uInfo?.createdAt || "2026-01-01",
        };
      });

      // 🌟 【關鍵修改】：找出當前查詢用戶自己在這個群組裡的資料，檢查是否有釘選！
      const myCard = parsedMembers.find(
        (m) => (m.userId || "").toLowerCase() === cleanUserId.toLowerCase(),
      );
      const isPinned = myCard?.isPinned || false;
      const isMuted = myCard?.isMuted || false;
      const count = parsedMembers.length;
      const rawStatus = row.status || (count > 0 ? "正常" : "已解散");

      return {
        id: row.id,
        name: row.name,
        muted: isMuted,
        isMuted: isMuted,
        isPinned: isPinned,
        status: rawStatus,
        statusDisplay: `${rawStatus} (${count}人)`,
        members: parsedMembers,
        membersCount: count,
        // 🚀 將待審核陣列與人數順利回傳給前端
        pendingMembers: parsedPending,
        pendingCount: parsedPending.length,
      };
    });

    res.json({ success: true, groups: formattedGroups });
  } catch (err) {
    console.error("❌ [資料庫查詢嚴重錯誤]:", err.message);
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    client.release();
  }
});
// ==========================================
// 🌟 加入群組 API (/api/groups/join) —— 升級為「送入待審核區」
// ==========================================
app.post("/api/groups/join", express.json(), async (req, res) => {
  const { groupId, userId, userName, pictureUrl } = req.body;
  if (!groupId || !userId)
    return res.status(400).json({ error: "缺少必要參數" });

  const client = await pool.connect();
  try {
    // 💡 神級防呆：自動幫資料庫建立 pending_members 待審核欄位！
    await client.query(
      "ALTER TABLE family_groups ADD COLUMN IF NOT EXISTS pending_members JSONB DEFAULT '[]'::jsonb;",
    );

    const cleanGroupId = groupId.trim().toUpperCase();
    const findRes = await client.query(
      `SELECT * FROM family_groups WHERE UPPER(group_id) = $1`,
      [cleanGroupId],
    );
    if (findRes.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, error: "找不到該群組代碼！" });

    const group = findRes.rows[0];
    if (group.status === "已解散")
      return res.status(400).json({ success: false, error: "此群組已解散！" });

    let members =
      typeof group.members === "string"
        ? JSON.parse(group.members || "[]")
        : group.members || [];
    let pending =
      typeof group.pending_members === "string"
        ? JSON.parse(group.pending_members || "[]")
        : group.pending_members || [];

    // 1. 檢查是否已經是正式成員
    if (members.some((m) => m.userId?.toLowerCase() === userId.toLowerCase())) {
      return res.json({
        success: true,
        status: "already_member",
        message: "您已經是群組正式成員囉！",
      });
    }
    // 2. 檢查是否已經在審核中
    if (pending.some((m) => m.userId?.toLowerCase() === userId.toLowerCase())) {
      return res.json({
        success: true,
        status: "pending",
        message: "您已申請過加入，請耐心等待群組管理員審核！",
      });
    }

    // 🌟 3. 放入待審核名單 (記得順便把頭像存起來！)
    pending.push({
      userId: userId,
      userName: userName || "新申請者",
      pictureUrl: pictureUrl || "",
      role: "成員",
      status: "待審核",
      appliedAt: new Date().toISOString(),
    });

    await client.query(
      `UPDATE family_groups SET pending_members = $1::jsonb WHERE group_id = $2`,
      [JSON.stringify(pending), group.group_id],
    );

    console.log(
      `[API LOG] ${userName} 已申請加入群組 ${group.group_name}，等待審核中...`,
    );
    res.json({
      success: true,
      status: "pending",
      message: "✅ 申請成功！請等待群組管理員同意後即可進入群組。",
    });
  } catch (err) {
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    client.release();
  }
});

// ==========================================
// 🌟 管理員審核通過 API (/api/groups/review/approve)
// ==========================================
app.post("/api/groups/review/approve", express.json(), async (req, res) => {
  const { groupId, targetUserId, operatorId } = req.body;
  const client = await pool.connect();
  try {
    const findRes = await client.query(
      `SELECT * FROM family_groups WHERE group_id = $1`,
      [groupId],
    );
    if (findRes.rows.length === 0)
      return res.status(404).json({ error: "找不到群組" });

    const group = findRes.rows[0];
    let members =
      typeof group.members === "string"
        ? JSON.parse(group.members || "[]")
        : group.members || [];
    let pending =
      typeof group.pending_members === "string"
        ? JSON.parse(group.pending_members || "[]")
        : group.pending_members || [];

    // 🌟 嚴格資安把關：如果傳過來的 operatorId 是 admin (前端預設寫法)，放行；否則比對當事人
    if (operatorId && operatorId !== "admin") {
      const adminUser = members.find(
        (m) => m.userId?.toLowerCase() === operatorId.toLowerCase(),
      );
      if (!adminUser || adminUser.role !== "管理員") {
        return res.status(403).json({
          success: false,
          error: "⛔ 權限不足：只有群組管理員可以審核新成員！",
        });
      }
    }

    // 1. 從待審核陣列中抓出這名申請者
    const targetMember = pending.find(
      (m) => m.userId?.toLowerCase() === targetUserId.toLowerCase(),
    );
    if (!targetMember)
      return res.status(404).json({ error: "在待審核名單中找不到該用戶" });

    // 2. 移出 pending，加入正式 members！
    pending = pending.filter(
      (m) => m.userId?.toLowerCase() !== targetUserId.toLowerCase(),
    );
    targetMember.status = "正常"; // 轉為正常綠燈
    targetMember.role = "成員";
    members.push(targetMember);

    // 🌟 3. 關鍵修復：SQL 加上 RETURNING *; 並明確將陣列轉為 JSON 字串！
    const updateQuery = `
      UPDATE family_groups 
      SET members = $1::jsonb, pending_members = $2::jsonb, member_count = $3 
      WHERE group_id = $4
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [
      JSON.stringify(members),
      JSON.stringify(pending),
      members.length,
      groupId,
    ]);

    console.log(`✅ [審核通過] 已成功允許 ${targetMember.userName} 加入群組！`);
    res.json({
      success: true,
      message: `已成功同意 ${targetMember.userName} 加入群組！`,
      group: updateRes.rows[0],
    });
  } catch (err) {
    console.error("❌ 審核通過失敗:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    client.release();
  }
});

// ==========================================
// 🌟 管理員審核拒絕 API (/api/groups/review/reject)
// ==========================================
app.post("/api/groups/review/reject", express.json(), async (req, res) => {
  const { groupId, targetUserId, operatorId } = req.body;
  const client = await pool.connect();
  try {
    const findRes = await client.query(
      `SELECT * FROM family_groups WHERE group_id = $1`,
      [groupId],
    );
    if (findRes.rows.length === 0)
      return res.status(404).json({ error: "找不到群組" });

    const group = findRes.rows[0];
    let members =
      typeof group.members === "string"
        ? JSON.parse(group.members || "[]")
        : group.members || [];
    let pending =
      typeof group.pending_members === "string"
        ? JSON.parse(group.pending_members || "[]")
        : group.pending_members || [];

    if (operatorId && operatorId !== "admin") {
      const adminUser = members.find(
        (m) => m.userId?.toLowerCase() === operatorId.toLowerCase(),
      );
      if (!adminUser || adminUser.role !== "管理員") {
        return res.status(403).json({
          success: false,
          error: "⛔ 權限不足：只有群組管理員可以審核！",
        });
      }
    }

    // 直接從待審核名單中剔除
    pending = pending.filter(
      (m) => m.userId?.toLowerCase() !== targetUserId.toLowerCase(),
    );

    // 🌟 關鍵修復：同樣加上 RETURNING *; 與 JSON.stringify
    const updateQuery = `
      UPDATE family_groups 
      SET pending_members = $1::jsonb 
      WHERE group_id = $2
      RETURNING *;
    `;
    const updateRes = await client.query(updateQuery, [
      JSON.stringify(pending),
      groupId,
    ]);

    console.log(`✅ [審核拒絕] 已拒絕用戶加入申請`);
    res.json({
      success: true,
      message: "已拒絕該用戶的加入申請",
      group: updateRes.rows[0],
    });
  } catch (err) {
    console.error("❌ 審核拒絕失敗:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    client.release();
  }
});
// ==========================================
// 🌟 退出群組 API (/api/groups/leave) - 修復解散 + 指定權限移交升級版
// ==========================================
app.post("/api/groups/leave", express.json(), async (req, res) => {
  // 🌟 1. 多接收一個 newAdminId 參數（前端傳來的指定接班人 ID）
  const { groupId, userId, newAdminId } = req.body;
  if (!groupId || !userId)
    return res.status(400).json({ error: "缺少必要參數" });

  const client = await pool.connect(); // 這裡明確宣告 client
  try {
    const findQuery = `SELECT * FROM family_groups WHERE group_id = $1`;
    const findRes = await client.query(findQuery, [groupId]);

    if (findRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: "群組不存在" });
    }

    const group = findRes.rows[0];
    let members = [];
    if (typeof group.members === "string") {
      try {
        members = JSON.parse(group.members);
      } catch (e) {
        members = [];
      }
    } else if (Array.isArray(group.members)) {
      members = group.members;
    }

    // 💡 邏輯判定 1：檢查離開的是不是群組最後一個人？
    if (members.length <= 1) {
      // 🌟 【重大錯字修復】：把原本報錯的 dbClient 徹底改為 client！
      await client.query(
        `UPDATE family_groups SET status = '已解散', members = '[]'::jsonb, member_count = 0 WHERE group_id = $1`,
        [groupId],
      );
      console.log(
        `[API LOG] 群組 ${group.group_name} (${groupId}) 所有成員已退出，標記為已解散`,
      );
      return res.json({
        success: true,
        action: "disbanded",
        status: "已解散",
        remainingCount: 0,
      });
    }

    // 判斷離開者的身分與過濾剩餘成員
    const leavingMember = members.find(
      (m) => m.userId && m.userId.toLowerCase() === userId.toLowerCase(),
    );
    const remainingMembers = members.filter(
      (m) => !(m.userId && m.userId.toLowerCase() === userId.toLowerCase()),
    );

    // 🌟 邏輯判定 2：如果離開的是「管理員」，執行管理權限移交程序！
    if (
      leavingMember &&
      leavingMember.role === "管理員" &&
      remainingMembers.length > 0
    ) {
      let transferSuccess = false;

      // 【情境 A：有指定接班人】如果前端有傳入 newAdminId，優先把管理員給他！
      if (newAdminId) {
        const targetSuccessor = remainingMembers.find(
          (m) =>
            m.userId &&
            m.userId.toLowerCase() === newAdminId.trim().toLowerCase(),
        );
        if (targetSuccessor) {
          targetSuccessor.role = "管理員";
          transferSuccess = true;
          console.log(
            `👑 [權限移交成功] 管理員指定移交權限給接班人：${targetSuccessor.userName}`,
          );
        }
      }

      // 【情境 B：沒有指定，或指定的人找不到】自動把第一順位家人升格為管理員
      if (!transferSuccess) {
        const hasOtherAdmin = remainingMembers.some((m) => m.role === "管理員");
        if (!hasOtherAdmin) {
          remainingMembers[0].role = "管理員";
          console.log(
            `👑 [自動遞補管理員] 管理員離開未指定，已自動移交給：${remainingMembers[0].userName}`,
          );
        }
      }
    }

    // 💡 邏輯判定 3：將更新後的剩餘成員陣列寫回 PostgreSQL
    const updateQuery = `
      UPDATE family_groups
      SET members = $1::jsonb, member_count = $2
      WHERE group_id = $3
      RETURNING *;
    `;
    await client.query(updateQuery, [
      JSON.stringify(remainingMembers),
      remainingMembers.length,
      groupId,
    ]);

    console.log(`[API LOG] 用戶 (${userId}) 成功退出群組 ${group.group_name}`);
    res.json({
      success: true,
      action: "left",
      remainingCount: remainingMembers.length,
    });
  } catch (err) {
    console.error("❌ 退出群組失敗:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    client.release();
  }
});
// ==========================================
// 🌟 切換群組釘選狀態 API (/api/groups/toggle-pin)
// ==========================================
app.post("/api/groups/toggle-pin", express.json(), async (req, res) => {
  const { groupId, userId, isPinned } = req.body;
  if (!groupId || !userId)
    return res.status(400).json({ error: "缺少必要參數" });

  const client = await pool.connect();
  try {
    const findRes = await client.query(
      `SELECT * FROM family_groups WHERE group_id = $1`,
      [groupId],
    );
    if (findRes.rows.length === 0)
      return res.status(404).json({ error: "找不到群組" });

    const group = findRes.rows[0];
    let members =
      typeof group.members === "string"
        ? JSON.parse(group.members)
        : group.members || [];

    // 💡 將該名用戶在 members 陣列裡的 isPinned 屬性更新
    members = members.map((m) => {
      if (m.userId && m.userId.toLowerCase() === userId.trim().toLowerCase()) {
        return { ...m, isPinned: isPinned };
      }
      return m;
    });

    await client.query(
      `UPDATE family_groups SET members = $1::jsonb WHERE group_id = $2 RETURNING *;`,
      [JSON.stringify(members), groupId],
    );

    console.log(
      `[API LOG] 📌 用戶 ${userId} 已將群組 ${groupId} 釘選狀態改為: ${isPinned ? "已釘選" : "取消釘選"}`,
    );
    res.json({ success: true, isPinned });
  } catch (err) {
    console.error("❌ 切換釘選狀態失敗:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    client.release();
  }
});

// ==========================================
// 🌟 刪除群組 API (/api/groups/delete) - 僅限管理員強制解散
// ==========================================
app.post("/api/groups/delete", express.json(), async (req, res) => {
  const { groupId, userId } = req.body;
  if (!groupId || !userId)
    return res.status(400).json({ error: "缺少必要參數" });

  const client = await pool.connect();
  try {
    const findRes = await client.query(
      `SELECT * FROM family_groups WHERE group_id = $1`,
      [groupId],
    );
    if (findRes.rows.length === 0)
      return res.status(404).json({ error: "群組不存在" });

    const group = findRes.rows[0];
    let members =
      typeof group.members === "string"
        ? JSON.parse(group.members)
        : group.members || [];

    // 💡 嚴格資安把關：檢查發送者在 members 名單中是不是「管理員」？
    const me = members.find(
      (m) =>
        m.userId &&
        m.userId.trim().toLowerCase() === userId.trim().toLowerCase(),
    );
    if (!me || me.role !== "管理員") {
      console.log(
        `⛔ [越權攔截] 非管理員 (${userId}) 試圖刪除群組 ${groupId}，已拒絕！`,
      );
      return res.status(403).json({
        error: "⛔ 權限不足：只有該群組的「管理員」可以解散與刪除群組！",
      });
    }

    // 🌟 權限確認無誤，執行強制解散
    await client.query(
      `UPDATE family_groups SET status = '已解散', members = '[]'::jsonb, member_count = 0 WHERE group_id = $1`,
      [groupId],
    );

    console.log(
      `[API LOG] 🗑️ 管理員 ${me.userName} 已強制解散並刪除群組 ${group.group_name} (${groupId})`,
    );
    res.json({ success: true, action: "deleted" });
  } catch (err) {
    console.error("❌ 刪除群組失敗:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    client.release();
  }
});
// ==========================================
// 🌟 切換個人群組靜音狀態 API (/api/groups/toggle-mute) - 個人獨立設定版
// ==========================================
app.post("/api/groups/toggle-mute", express.json(), async (req, res) => {
  // 🌟 1. 這裡必須多接收 userId (是誰想要把這群組靜音？)
  const { groupId, userId, muted } = req.body;
  if (!groupId || !userId || typeof muted !== "boolean") {
    return res
      .status(400)
      .json({ error: "缺少必要參數 (groupId, userId, muted)" });
  }

  const client = await pool.connect();
  try {
    const findRes = await client.query(
      `SELECT * FROM family_groups WHERE group_id = $1`,
      [groupId],
    );
    if (findRes.rows.length === 0)
      return res.status(404).json({ error: "找不到群組" });

    const group = findRes.rows[0];
    let members =
      typeof group.members === "string"
        ? JSON.parse(group.members)
        : group.members || [];

    // 🌟 2. 只將該名用戶在 members 陣列裡的 isMuted 屬性更新！
    members = members.map((m) => {
      if (m.userId && m.userId.toLowerCase() === userId.trim().toLowerCase()) {
        return { ...m, isMuted: muted };
      }
      return m;
    });

    await client.query(
      `UPDATE family_groups SET members = $1::jsonb WHERE group_id = $2 RETURNING *;`,
      [JSON.stringify(members), groupId],
    );

    console.log(
      `[API LOG] 🔇 用戶 ${userId} 已將群組 ${groupId} 的個人通報狀態改為: ${muted ? "靜音 (不收警報)" : "正常開啟"}`,
    );
    res.json({ success: true, muted });
  } catch (err) {
    console.error("❌ 更新群組個人靜音狀態失敗:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    client.release();
  }
});
// ==========================================
// 🌟 解除可疑警報 API (/api/groups/reset-status) - 全域連動同步版
// ==========================================
app.post("/api/groups/reset-status", express.json(), async (req, res) => {
  // 💡 雖然前端傳了 groupId，但我們直接以 targetUserId 為準，幫他清掉所有群組的紅燈！
  const { targetUserId, operatorName, operatorId } = req.body;
  if (!targetUserId)
    return res.status(400).json({ error: "缺少必要參數 targetUserId" });

  const cleanTargetId = targetUserId.trim().toLowerCase();
  // 🌟 【資安鐵門：如果前端有傳操作者ID，且等於受害者本人，直接拒絕！】
  if (operatorId && operatorId.trim().toLowerCase() === cleanTargetId) {
    console.log(
      `⛔ [App資安攔截] 當事人 (${cleanTargetId}) 試圖在 App 自行解除警報！`,
    );
    return res.status(403).json({
      success: false,
      error:
        "⛔ 安全防護機制：為避免當事人受騙自行關閉通報，系統禁止當事人自行解除狀態！請聯繫其他家人幫您點擊確認安全。",
    });
  }
  const dbClient = await pool.connect();
  try {
    // 🌟 1. 查詢該當事人的所有群組
    const allGroupsRes = await dbClient.query(
      `SELECT * FROM family_groups WHERE LOWER(members::text) LIKE LOWER($1) AND status != '已解散'`,
      [`%${cleanTargetId}%`],
    );

    if (allGroupsRes.rows.length === 0)
      return res.status(404).json({ error: "找不到該用戶的任何群組" });

    let isChanged = false;
    let targetName = "該成員";
    let updatedGroupMembers = [];

    // 🌟 2. 遍歷所有群組進行全域漂白
    for (const group of allGroupsRes.rows) {
      let members =
        typeof group.members === "string"
          ? JSON.parse(group.members)
          : group.members || [];

      members = members.map((m) => {
        const mId = (m.userId || "").trim().toLowerCase();
        if (mId === cleanTargetId) {
          targetName = m.userName || m.name || "該成員";
          if (m.status !== "正常") {
            m.status = "正常";
            isChanged = true;
          }
        }
        return m;
      });

      // 關閉對應鬧鐘
      stopAlarmLoop(cleanTargetId);

      // 如果這是前端原本正在瀏覽的群組，把最新的 members 存回變數準備吐給前端
      if (req.body.groupId && group.group_id === req.body.groupId.trim()) {
        updatedGroupMembers = members;
      }

      // 寫回資料庫
      await dbClient.query(
        `UPDATE family_groups SET members = $1::jsonb WHERE group_id = $2`,
        [JSON.stringify(members), group.group_id],
      );
    }

    if (!isChanged)
      return res.json({
        success: true,
        message: "已經是正常狀態囉！",
        members: updatedGroupMembers,
      });

    try {
      await client.pushMessage(targetUserId.trim(), {
        type: "text",
        text: `🛡️【真識監詐 - 警報解除通知】\n\n家人「${operatorName || "某位家人"}」已在防詐 App 中確認您的安全!`,
      });
    } catch (e) {}

    console.log(
      `✅ [App全域解除成功] 當事人 ${targetName} 所在的所有群組已恢復正常！`,
    );
    res.json({ success: true, members: updatedGroupMembers });
  } catch (err) {
    console.error("❌ 解除警報失敗:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    dbClient.release();
  }
});
// ==========================================
// 🌟 使用者註冊與驗證 API (修復：保留註冊流程、頭像百分百同步！)
// ==========================================
// 1. 檢查使用者是否已註冊
app.post("/api/users/check", express.json(), async (req, res) => {
  const { userId, nickname, pictureUrl } = req.body;
  if (!userId) return res.status(400).json({ error: "缺少 userId" });

  const cleanId = userId.trim();
  const cleanName = nickname ? nickname.trim() : "";
  const cleanAvatar = pictureUrl ? pictureUrl.trim() : "";

  const client = await pool.connect();
  try {
    await client.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS picture_url TEXT;",
    );
    await client.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_off BOOLEAN DEFAULT FALSE;",
    );

    const result = await client.query(
      "SELECT * FROM users WHERE user_id = $1",
      [cleanId],
    );

    if (result.rows.length > 0) {
      const existingUser = result.rows[0];

      // 🌟 【老用戶專屬】：只有「已經註冊過的老家人」，如果發現資料庫沒頭像或換頭像了，才在背景幫他自動同步！
      if (cleanAvatar && existingUser.picture_url !== cleanAvatar) {
        await client.query(
          "UPDATE users SET picture_url = $1, nickname = COALESCE(NULLIF(nickname, ''), $2) WHERE user_id = $3",
          [cleanAvatar, cleanName || existingUser.nickname, cleanId],
        );
        existingUser.picture_url = cleanAvatar;
        if (!existingUser.nickname && cleanName)
          existingUser.nickname = cleanName;
        console.log(
          `✅ [老用戶同步] 已自動為用戶 ${cleanId} 更新 LINE 頭像與暱稱！`,
        );
      }

      // 確實有註冊過，回傳 true
      res.json({ isRegistered: true, user: existingUser });
    } else {
      // 🌟 【關鍵修復】：查無此人時，絕對不幫他 INSERT！
      // 必須乖乖回傳 isRegistered: false，讓你的 App 前端正常跳轉到【新用戶註冊頁面】！
      console.log(`ℹ️ [新帳號到來] 查無 ${cleanId}，即將導向註冊流程。`);
      res.json({ isRegistered: false });
    }
  } catch (err) {
    console.error("檢查註冊狀態錯誤:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    client.release();
  }
});

// 2. 註冊新使用者 (🌟 關鍵升級：在註冊當下，把頭像一併存入資料庫！)
app.post("/api/users/register", express.json(), async (req, res) => {
  // 🌟 記得在這裡接收前端傳過來的 pictureUrl
  const { userId, nickname, lineId, pictureUrl } = req.body;
  if (!userId || !nickname)
    return res.status(400).json({ error: "缺少必要參數" });

  const client = await pool.connect();
  try {
    await client.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS picture_url TEXT;",
    );

    // 💡 SQL 加上 picture_url 欄位，註冊成功的瞬間，頭像與個人資料一併永久儲存！
    const insertQuery = `
      INSERT INTO users (user_id, nickname, line_id, picture_url, notifications_off, created_at)
      VALUES ($1, $2, $3, $4, false, NOW())
      ON CONFLICT (user_id) DO UPDATE 
      SET nickname = EXCLUDED.nickname, 
          line_id = EXCLUDED.line_id, 
          picture_url = COALESCE(NULLIF(EXCLUDED.picture_url, ''), users.picture_url)
      RETURNING *;
    `;
    const result = await client.query(insertQuery, [
      userId.trim(),
      nickname.trim(),
      lineId ? lineId.trim() : "",
      pictureUrl ? pictureUrl.trim() : "", // 👈 確保遇到 null 時轉為空字串，絕不報錯
    ]);

    console.log(
      `🎉 [新用戶註冊成功] ${nickname} 已完成註冊並成功存入 LINE 頭像！`,
    );
    res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error("註冊使用者錯誤:", err);
    res.status(500).json({ error: "伺服器錯誤" });
  } finally {
    client.release();
  }
});
// ==========================================
// 3. 更新使用者資料 (修改暱稱與自訂 Line ID)
// 3. 更新使用者資料 (新增：同步儲存個人全局通知開關 notifications_off)
// ==========================================
// 🌟 更新使用者資料 (存在就修改，不存在就自動註冊！)
// ==========================================
app.post(
  "/api/users/update",
  express.json({ limit: "50mb" }),
  async (req, res) => {
    const { userId, nickname, lineId, notificationsOff, pictureUrl } = req.body;
    if (!userId) return res.status(400).json({ error: "缺少必要參數 userId" });

    const client = await pool.connect();
    try {
      await client.query(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_off BOOLEAN DEFAULT FALSE;",
      );
      await client.query(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS picture_url TEXT;",
      );

      // 🌟 1. 宣告變數：統一命名為 upsertQuery
      const upsertQuery = `
      INSERT INTO users (user_id, nickname, line_id, notifications_off, picture_url, created_at)
      VALUES ($5, $1, $2, $3, $4, NOW())
      ON CONFLICT (user_id) DO UPDATE 
      SET nickname = EXCLUDED.nickname, 
          line_id = EXCLUDED.line_id, 
          notifications_off = EXCLUDED.notifications_off, 
          picture_url = EXCLUDED.picture_url
      RETURNING *;
    `;

      // 🌟 2. 執行查詢：確保這裡呼叫的也是一模一樣的 upsertQuery！絕對不能寫成 updateQuery！
      const result = await client.query(upsertQuery, [
        nickname || "未命名",
        lineId || "",
        notificationsOff || false,
        pictureUrl || "",
        userId,
      ]);

      res.json({ success: true, user: result.rows[0] });
    } catch (err) {
      console.error("更新使用者錯誤:", err);
      res.status(500).json({ error: "伺服器錯誤" });
    } finally {
      client.release();
    }
  },
);

// ==========================================
// 🌟 系統問題與建議回報 API (/api/reports)
// ==========================================
app.post("/api/reports", express.json(), async (req, res) => {
  const { userId, text, userName } = req.body;
  if (!userId || !text) {
    return res.status(400).json({ error: "缺少必要參數：userId 或文字內容" });
  }

  const client = await pool.connect();
  try {
    // 💡 神級防呆：自動在 PostgreSQL 建立 user_reports 回報表格！
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS user_reports (
        report_id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(100),
        report_text TEXT NOT NULL,
        status VARCHAR(20) DEFAULT '未處理',
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
      );
    `;
    await client.query(createTableQuery);

    // 🌟 將使用者的反饋寫入資料庫
    const insertQuery = `
      INSERT INTO user_reports (user_id, user_name, report_text, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *;
    `;
    const result = await client.query(insertQuery, [
      userId.trim(),
      userName || "匿名用戶",
      text.trim(),
    ]);

    console.log(
      `\n💬 [收到新回報] 來自用戶 (${userId}): ${text.slice(0, 20)}...`,
    );
    res.status(201).json({ success: true, report: result.rows[0] });
  } catch (err) {
    console.error("❌ 寫入回報資料庫失敗:", err);
    res.status(500).json({ error: "伺服器錯誤，無法送出回報" });
  } finally {
    client.release();
  }
});
// ==========================================
// 🚨 核心心臟：紅燈防詐警報家庭廣播系統 (智能去重防重複轟炸 + 1人群組過濾版)
// ==========================================
async function triggerRedAlertBroadcast(
  senderUserId,
  aiAnalysisText,
  originalContent,
  publicFileUrl = null, // 🌟 新增：接收公開網址 (圖片或語音)
  fileType = null, // 🌟 新增：接收檔案類型 ("image" 或 "audio")
  audioDuration = null, // 🌟 新增：接收語音長度
) {
  console.log(
    `\n🚨 [紅燈警戒觸發] 正在為用戶 ${senderUserId} 查詢所屬家庭群組與發送緊急通報...`,
  );
  const dbClient = await pool.connect();
  try {
    await dbClient.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_off BOOLEAN DEFAULT FALSE;",
    );

    const cleanId = senderUserId.trim();
    const groupRes = await dbClient.query(
      `SELECT * FROM family_groups WHERE LOWER(members::text) LIKE LOWER($1) AND status != '已解散'`,
      [`%${cleanId}%`],
    );

    if (groupRes.rows.length === 0) return;

    const userRes = await dbClient.query(
      `SELECT user_id, notifications_off FROM users`,
    );
    const globalMuteMap = {};
    userRes.rows.forEach((u) => {
      globalMuteMap[u.user_id.toLowerCase()] = u.notifications_off || false;
    });

    // 🌟 【防重複轟炸神器】：記錄這次廣播已經推播過哪些家人，絕不重複發送！
    const notifiedFamilyTargets = new Set();

    for (const group of groupRes.rows) {
      let members =
        typeof group.members === "string"
          ? JSON.parse(group.members)
          : group.members || [];
      if (members.length < 1) continue;

      // 🌟 【防火牆 1：先檢查有沒有其他有效家人！】
      // 必須在「修改資料庫為可疑」之前先檢查！如果是 1 人群組，直接跳過，絕對不標記可疑！
      const validFamilyTargets = members.filter(
        (m) =>
          m.userId &&
          m.userId.trim().toLowerCase() !== cleanId.toLowerCase() &&
          !globalMuteMap[m.userId.trim().toLowerCase()] &&
          !m.isMuted,
      );

      if (validFamilyTargets.length === 0) {
        console.log(
          `⚠️ [跳過無人群組/單人群組] 群組「${group.group_name}」(${group.group_id}) 無其他可通知家人，不標記可疑、不發警報。`,
        );
        continue;
      }

      // 🌟 檢查通過！確實有多人，才進入資料庫將該成員標記為「可疑」
      let senderName = "某位家人";
      members.forEach((m) => {
        if (m.userId && m.userId.toLowerCase() === cleanId.toLowerCase()) {
          m.status = "可疑";
          senderName = m.userName || m.name || "某位家人";
        }
      });
      await dbClient.query(
        `UPDATE family_groups SET members = $1::jsonb WHERE group_id = $2`,
        [JSON.stringify(members), group.group_id],
      );

      // 準備警報訊息 (這裡把群組名稱優化成通用提示，不管幾個群組都適用)
      const alertTextMessage = {
        type: "text",
        text: [
          `🚨【真識監詐 - 緊急防詐通報】🚨`,
          `----------------------`,
          `⚠️ 您所屬的家庭群組「${group.group_name}」中，成員「${senderName}」疑似收到高風險詐騙訊息！`,
          `----------------------`,
          `👤 收到疑似詐騙者：${senderName}`,
          `🔴 AI 風險等級：危險 (紅燈)`,
          `${aiAnalysisText ? aiAnalysisText.replace(/\n\n💡 溫馨小提醒：[\s\S]*?👉.*/g, "") : "包含典型詐騙誘導話術，請多加防範！"}`,
          `💬 內容摘要：${originalContent.length > 150 ? originalContent.slice(0, 150) + "..." : originalContent}`,
          `----------------------`,
          `💡 貼心提醒：若無人解除警報，系統將每 10 分鐘重新提醒一次！\n(最多五次)`,
        ].join("\n"),
      };

      const alertButtonMessage = {
        type: "flex",
        altText: `🚨 請確認 ${senderName} 的安全並解除警報`,
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            paddingBottom: "none",
            contents: [
              {
                type: "text",
                text: "🛡️ 家人安全確認指令",
                weight: "bold",
                size: "lg",
                color: "#111827",
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: `請確認 [${senderName}] 是否匯款或受騙！點擊下方按鈕即可「停止通知」並確認狀態`,
                wrap: true,
                size: "sm",
                color: "#4B5563",
              },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "box",
                layout: "vertical",
                backgroundColor: "#06C755", // 🌟 替換為 LINE 的經典安全綠色
                cornerRadius: "md",
                paddingAll: "lg",
                action: {
                  type: "postback",
                  label: "解除警報", // 系統隱藏標籤
                  // 💡 完整保留原本的全域解除資料
                  data: `action=reset_alarm&targetId=${cleanId}&targetName=${encodeURIComponent(senderName)}`,
                },
                contents: [
                  {
                    type: "text",
                    text: "👉 我已確認安全，點此解除",
                    weight: "bold", // 🌟 文字加粗
                    color: "#FFFFFF", // 白色文字
                    align: "center",
                    size: "md",
                  },
                ],
              },
            ],
          },
        },
      };

      // 🌟 新增：動態組裝推播陣列 (文字 -> 圖片/語音/檔案按鈕 -> 解除按鈕)
      const pushMessages = [alertTextMessage];

      if (publicFileUrl) {
        if (fileType === "image") {
          pushMessages.push({
            type: "image",
            originalContentUrl: publicFileUrl,
            previewImageUrl: publicFileUrl,
          });
        } else if (fileType === "audio") {
          pushMessages.push({
            type: "audio",
            originalContentUrl: publicFileUrl,
            duration: audioDuration || 10000,
          });
        } else if (fileType === "video" || fileType === "file") {
          // 🌟 針對影片與 PDF，推送一個專屬的查看卡片按鈕，避開 LINE 不能直傳檔案的限制
          const typeName = fileType === "video" ? "可疑影片" : "可疑文件 (PDF)";
          pushMessages.push({
            type: "flex",
            altText: `📁 家人收到的${typeName}`,
            contents: {
              type: "bubble",
              header: {
                type: "box",
                layout: "vertical",
                paddingBottom: "none",
                contents: [
                  {
                    type: "text",
                    text: `📁 原始${typeName}備份`,
                    weight: "bold",
                    size: "lg", // 🌟 統一標題字體大小為 lg
                    color: "#111827",
                  },
                ],
              },
              body: {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "text",
                    text: `長輩接收到的完整${typeName}已暫存，請點擊下方按鈕開啟查核：`,
                    wrap: true,
                    size: "sm",
                    color: "#4B5563",
                  },
                ],
              },
              footer: {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: "#EF4444", // 紅色按鈕
                    cornerRadius: "md",
                    paddingAll: "lg", // 🌟 統一內邊距為 lg (撐開按鈕高度)
                    action: {
                      type: "uri",
                      label: `開啟${typeName}`,
                      uri: publicFileUrl,
                    },
                    contents: [
                      {
                        type: "text",
                        text: `🔍 點此查看${typeName}`,
                        weight: "bold",
                        color: "#FFFFFF",
                        align: "center",
                        size: "md", // 🌟 統一文字大小為 md
                      },
                    ],
                  },
                ],
              },
            },
          });
        }
      }

      pushMessages.push(alertButtonMessage);
      // 3. 執行推播給群組內的其他家人 (加上去重判斷！)
      for (const target of validFamilyTargets) {
        if (!target.userId) continue;
        const targetId = target.userId.trim().toLowerCase();

        if (globalMuteMap[targetId] === true) continue;
        if (targetId === cleanId.toLowerCase()) continue;

        // 🌟 【防重複轟炸核心】：如果這位家人剛才已經在其他群組收到過推播，直接略過！
        if (notifiedFamilyTargets.has(targetId)) {
          console.log(
            `🔕 [智能去重] 家人 (${target.userName || targetId}) 已收到過本次通報，略過重複推播！`,
          );
          continue;
        }

        try {
          await client.pushMessage(target.userId.trim(), pushMessages);
          notifiedFamilyTargets.add(targetId); // 記到黑板上，今天這次不准再發給他
          console.log(
            `🔔 成功發送警報給家人：${target.userName || target.userId}`,
          );
        } catch (pushErr) {
          console.error(`❌ 推播失敗:`, pushErr.message);
        }
      }

      // 4. 啟動連續鬧鐘 (每個有效群組各自計時，直到被按鈕解除)
      startAlarmLoop(cleanId, async () => {
        const checkDbClient = await pool.connect();
        try {
          // 1. 每次鬧鐘響時，先去資料庫看當事人是不是還在「可疑」狀態
          const res = await checkDbClient.query(
            `SELECT members FROM family_groups WHERE group_id = $1`,
            [group.group_id],
          );

          if (res.rows.length === 0) return;

          const currentMembers =
            typeof res.rows[0].members === "string"
              ? JSON.parse(res.rows[0].members)
              : res.rows[0].members;

          const targetNow = currentMembers.find(
            (m) => m.userId && m.userId.toLowerCase() === cleanId.toLowerCase(),
          );

          // 2. 如果家人已經點擊「解除警報」(狀態變回正常)，就直接關閉鬧鐘，不發訊息
          if (!targetNow || targetNow.status !== "可疑") {
            console.log(
              `🛑 [狀態已解除] ${cleanId} 已恢復正常，自動關閉連續鬧鐘。`,
            );
            stopAlarmLoop(cleanId);
            return;
          }

          // 3. 如果還是「可疑」，就利用原本的 validFamilyTargets 重新發送一次警報給家人！
          for (const target of validFamilyTargets) {
            if (!target.userId) continue;
            const throttleKey = `${cleanId}_${target.userId}`;
            const now = Date.now();

            // 💡 設定 10 秒的冷卻時間 (即使你現在用 30 秒測試，或未來上線用 10 分鐘，這招都完美適用)
            if (
              alarmThrottleCache[throttleKey] &&
              now - alarmThrottleCache[throttleKey] < 10000
            ) {
              console.log(
                `🔕 [鬧鐘智能去重] 家人 ${target.userName || target.userId} 剛已收到其他群組的連環鬧鐘，略過！`,
              );
              continue;
            }
            // 記錄這位家人這次收到鬧鐘的時間
            alarmThrottleCache[throttleKey] = now;
            try {
              // 💡 這裡因為閉包 (Closure) 的特性，可以直接使用上面組裝好的卡片變數
              await client.pushMessage(target.userId.trim(), pushMessages);
              console.log(
                `🔔 [連續鬧鐘] 成功補發警報給家人：${target.userName || target.userId}`,
              );
            } catch (pushErr) {
              console.error(
                `❌ [連續鬧鐘] 推播失敗給 ${target.userId}:`,
                pushErr.message,
              );
            }
          }
        } catch (err) {
          console.error("❌ 鬧鐘資料庫檢查失敗:", err);
        } finally {
          checkDbClient.release();
        }
      });
    }
  } catch (err) {
    console.error("❌ 觸發紅燈廣播發生錯誤:", err);
  } finally {
    dbClient.release();
  }
}

// ==========================================
// 🌟 1. [POST] 更新用戶的「不再顯示單人提示」設定
// ⚠️ 注意：第二個參數務必加上 express.json()，否則 req.body 永遠是 undefined！
// ==========================================
app.post(
  "/api/users/update-alert-setting",
  express.json(),
  async (req, res) => {
    const { userId, hideAlert } = req.body;
    if (!userId) return res.status(400).json({ error: "缺少 userId" });

    const client = await pool.connect();
    try {
      // 💡 神級防呆：確保 users 表單裡真的有這個布林欄位
      await client.query(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_one_person_alert BOOLEAN DEFAULT FALSE;",
      );

      const result = await client.query(
        "UPDATE users SET hide_one_person_alert = $1 WHERE user_id = $2 RETURNING *;",
        [hideAlert, userId.trim()],
      );

      console.log(
        `✅ 用戶 ${userId.trim()} 的「不再顯示」設定已成功寫入資料庫: ${hideAlert}`,
      );
      res.json({ success: true, user: result.rows[0] });
    } catch (err) {
      console.error("❌ 更新提示設定失敗:", err);
      res.status(500).json({ success: false, error: "資料庫更新失敗" });
    } finally {
      client.release();
    }
  },
);

// ==========================================
// 🌟 2. [GET] 查詢用戶設定 (必須用 app.get，供手機 App 登入時檢查是否要跳出視窗)
// ==========================================
app.get("/api/users/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "缺少 userId" });

  const client = await pool.connect();
  try {
    await client.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_one_person_alert BOOLEAN DEFAULT FALSE;",
    );

    const result = await client.query(
      "SELECT * FROM users WHERE user_id = $1",
      [userId.trim()],
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      res.json({
        success: true,
        user: {
          ...user,
          // 💡 確保吐給前端的值一定是乾淨的布林值 (true 或 false)
          hide_one_person_alert: Boolean(user.hide_one_person_alert),
        },
      });
    } else {
      res.status(404).json({ success: false, error: "找不到用戶" });
    }
  } catch (err) {
    console.error("❌ 查詢用戶設定失敗:", err);
    res.status(500).json({ success: false, error: "查詢失敗" });
  } finally {
    client.release();
  }
});

app.get("/api/quiz", async (req, res) => {
  try {
    // 執行查詢，把 scam_quiz 表格裡的所有卡牌題目撈出來
    const result = await pool.query("SELECT * FROM scam_quiz");
    console.log(`✅ 成功向前端傳送 ${result.rows.length} 筆防詐題目！`);

    // 將結果轉換為 JSON 格式傳送給你的 React Native 前端
    res.json(result.rows);
  } catch (err) {
    console.error("❌ 資料庫查詢失敗:", err.message);
    res.status(500).json({ error: "資料庫連線或查詢異常" });
  }
});

// 🌟 新增：專門給「問題回報與經驗分享 (含圖片)」用的獨立 API
app.post("/api/feedback", express.json(), async (req, res) => {
  const { report_text, report_image } = req.body;

  if (!report_text || !report_text.trim()) {
    return res.status(400).json({ error: "回報內容不能為空！" });
  }

  try {
    // 🚀 寫入我們剛剛新建的獨立表格 public.system_feedback
    const query = `
      INSERT INTO public.system_feedback (report_text, report_image, status, created_at)
      VALUES ($1, $2, '未處理', NOW())
      RETURNING *;
    `;
    const values = [report_text.trim(), report_image || null];

    const result = await pool.query(query, values);
    console.log("✅ 成功收到新經驗回報！新增 ID:", result.rows[0].feedback_id);

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("❌ 寫入 system_feedback 失敗:", error);
    res.status(500).json({ error: "伺服器錯誤，無法寫入資料庫" });
  }
});

// ==========================================
// 4) Webhook 與 handleEvent 整合
// ==========================================
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

async function callAnalyzeAPI({ userId, messageType, text, sourceType }) {
  const res = await axios.post(
    "http://127.0.0.1:8000/analyze/text",
    {
      user_id: userId,
      message_type: messageType,
      content: text,
      source_type: sourceType || "user", // 🌟 把這個傳給 Python
    },
    { timeout: 90000 },
  );
  return res.data;
}

async function handleEvent(event) {
  // ==========================================
  // 🌟 1. 優先處理 LINE 互動按鈕點擊事件 (Postback)
  // ==========================================
  if (event.type === "postback") {
    const params = new URLSearchParams(event.postback.data);

    // ======== 新增這段：處理詢問詳解的請求 ========
    if (params.get("action") === "explain") {
      const targetColor = params.get("color");
      const msgId = params.get("msgId");
      const operatorId = (event.source.userId || "").trim();

      // 從記憶體中抓出剛剛那段長文字，找不到就給預設值
      const contentText = explanationCache[msgId] || "未知的內容";

      console.log(
        `🔍 [請求詳解] 用戶 ${operatorId} 詢問 ${targetColor} 燈原因...`,
      );

      try {
        // 呼叫你在 main.py 寫好的解釋 API
        const resAPI = await axios.post(
          "http://127.0.0.1:8000/analyze/explain",
          {
            user_id: operatorId,
            message_content: contentText,
            color: targetColor,
          },
        );

        await client.replyMessage(event.replyToken, {
          type: "text",
          text: `💡【AI 分析說明】\n${resAPI.data.explanation}`,
        });
      } catch (err) {
        console.error("❌ 請求詳解失敗:", err);
      }
      return Promise.resolve(null);
    }
    // ==============================================

    // 如果點擊的是「👉 我已確認安全，點此解除」按鈕
    if (params.get("action") === "reset_alarm") {
      const targetId = (params.get("targetId") || "").trim();
      const targetName = decodeURIComponent(params.get("targetName") || "家人");
      const operatorId = (event.source.userId || "").trim();

      // 🌟 【資安鐵門：禁止當事人自己解除自己！】
      if (operatorId.toLowerCase() === targetId.toLowerCase()) {
        console.log(
          `⛔ [資安攔截] 疑似受騙者 (${operatorId}) 試圖自行解除警報，已阻擋！`,
        );
        await client.replyMessage(event.replyToken, {
          type: "text",
          text: "⛔【真識監詐 - 安全防護機制】\n\n為了防止受騙者在受騙下自行關閉通報，系統禁止當事人「自行解除」可疑警報！\n\n⚠️ 請務必由「群組內的另一位家人」確認您的情況安全後，由家人幫您點擊按鈕解除狀態。",
        });
        return Promise.resolve(null);
      }

      console.log(
        `\n🛡️ [收到LINE全域解除指令] 家人 (${operatorId}) 正在為當事人 ${targetName} 解除【所有群組】的警報！`,
      );

      const dbClient = await pool.connect();
      try {
        // 🌟 1. 抓出這名當事人所在的所有未解散群組！
        const allGroupsRes = await dbClient.query(
          `SELECT * FROM family_groups WHERE LOWER(members::text) LIKE LOWER($1) AND status != '已解散'`,
          [`%${targetId}%`],
        );

        let operatorName = "某位家人";

        if (allGroupsRes.rows.length > 0) {
          // 🌟 2. 迴圈遍歷他所有的群組，全面改成綠燈「正常」，並銷毀鬧鐘！
          for (const group of allGroupsRes.rows) {
            let members =
              typeof group.members === "string"
                ? JSON.parse(group.members)
                : group.members || [];

            members = members.map((m) => {
              const mId = (m.userId || "").trim().toLowerCase();
              if (mId === targetId.toLowerCase()) m.status = "正常"; // 全面改回綠燈
              if (mId === operatorId.toLowerCase())
                operatorName = m.userName || m.name || "某位家人";
              return m;
            });

            // 寫回資料庫
            await dbClient.query(
              `UPDATE family_groups SET members = $1::jsonb WHERE group_id = $2`,
              [JSON.stringify(members), group.group_id],
            );

            // 🛑 關閉這個群組裡對應的連續鬧鐘
            stopAlarmLoop(targetId);
          }

          // 3) 直接在 LINE 回覆這位好家人，並推播給當事人報平安！
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: `✅ 感謝您的協助！\n\n您已確認「${targetName}」的安全，後續請再多加注意`,
          });

          try {
            await client.pushMessage(targetId, {
              type: "text",
              text: `🛡️【真識監詐 - 警報解除通知】\n\n家人「${operatorName}」已在 LINE 中確認您的安全!`,
            });
          } catch (e) {}

          console.log(
            `✅ [全域解除成功] 當事人 ${targetName} 的 ${allGroupsRes.rows.length} 個群組已全數恢復綠燈！`,
          );
        }
      } catch (err) {
        console.error("按鈕解除警報資料庫處理失敗:", err);
      } finally {
        dbClient.release();
      }
      return Promise.resolve(null);
    }
  }

  if (event.type === "join") {
    console.log(
      `🤖 機器人成功加入新群組！群組ID: ${event.source.groupId || event.source.roomId}`,
    );
    return client.replyMessage(event.replyToken, [
      {
        type: "text",
        text: "大家好！我是「真識監詐」防詐 Bot 🤖👋\n\n已成功加入群組💡我會在後台默默守護大家的對話安全。\n\n如果怕我打擾只要輸入「停止偵測」就可以關閉喔!；也可以在對話框輸入「新手教學」查看更多功能喔！🗒️",
      },
      {
        type: "text",
        text: "⚠️【免責聲明與使用規範】\n為保障您的權益，使用本服務前請詳閱：\n\n1. 本系統為學術研究與 AI 測試性質之輔助工具，分析結果（含風險評分與燈號）僅供參考，不保證 100% 準確。\n2. 系統判定為「安全」不代表絕對無風險；判定為「危險」亦非最終法律定讞，本系統無法取代警方專業判斷。\n3. 任何因依賴本系統結果而做出之決策，或產生之直接/間接財物損失，開發團隊恕不負擔任何法律與賠償責任。\n4. 若遇緊急詐騙疑慮，請務必直接撥打 165 反詐騙專線或向鄰近派出所求證！\n\n💡 傳送任何訊息進行分析，即代表您同意上述聲明。",
      },
    ]);
  }

  if (event.type !== "message") return Promise.resolve(null);

  // 🌟 神級升級：現在系統支援 text, image, audio, video 與 file 了！
  if (
    event.message.type !== "text" &&
    event.message.type !== "image" &&
    event.message.type !== "audio" &&
    event.message.type !== "video" &&
    event.message.type !== "file"
  ) {
    // 如果是貼圖或位置，依然保持默默忽略
    return Promise.resolve(null);
  }
  // ==========================================
  // 🌟 2. 狀態與變數定義
  // ==========================================
  const msgType = event.message.type;
  const source = event?.source || {};
  const sourceType = source.type || "unknown"; // 判斷是 user, group, 或 room
  const senderUserId = source.userId || "unknown_user"; // 真正發話的人
  const chatRoomId =
    source.groupId || source.roomId || source.userId || "unknown_user"; // 所在的群組
  const isGroupOrRoom = sourceType === "group" || sourceType === "room";

  let state = loadState();
  // 🌟 核心魔法：如果這個群組沒有開關紀錄，預設就是「開啟 (true)」！
  if (isGroupOrRoom && state[chatRoomId] === undefined) {
    state[chatRoomId] = true;
  }
  let payloadContent = "";
  let logText = "";
  const newbieGuideCarousel = {
    type: "flex",
    altText: "真識監詐 - 新手教學指南",
    contents: {
      type: "carousel",
      contents: [
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://fraudchickenbye.com/scam-guide01.png",
            size: "full",
            aspectRatio: "4:5",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "1. 歡迎👋 我是您的防詐小幫手 ，來跟我一起看看有哪些功能吧！",
                weight: "bold",
                size: "md",
                wrap: true,
                color: "#111827",
              },
            ],
          },
        },
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://fraudchickenbye.com/scam-guide02.png",
            size: "full",
            aspectRatio: "4:5",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "2. 怕我在群組太吵嗎？覺得不需要時，只要打字輸入「停止偵測」讓我休眠；需要時再輸入「開始偵測」叫醒我即可👌",
                weight: "bold",
                size: "md",
                wrap: true,
                color: "#111827",
              },
            ],
          },
        },
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://fraudchickenbye.com/scam-guide03.png",
            size: "full",
            aspectRatio: "4:5",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "3. 怎麼讓我檢查？超簡單！不用按任何按鈕，只要把覺得不懂的「直接傳給我」，我就會自動幫您檢查 💬",
                weight: "bold",
                size: "md",
                wrap: true,
                color: "#111827",
              },
            ],
          },
        },
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://fraudchickenbye.com/scam-guide04.png",
            size: "full",
            aspectRatio: "4:5",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "4. ✨ 試著在聊天室輸入圖片上的「關鍵字」，就能快速找到想要的功能喔!快來嘗試看看吧 👍",
                weight: "bold",
                size: "md",
                wrap: true,
                color: "#111827",
              },
            ],
          },
        },
      ],
    },
  };

  // 🌟 共用圖卡變數：上傳教學三聯裝
  const uploadGuideCarousel = {
    type: "flex",
    altText: "教學：如何上傳可疑訊息",
    contents: {
      type: "carousel",
      contents: [
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://fraudchickenbye.com/guide01-1.png",
            size: "full",
            aspectRatio: "4:5",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "1. 看到可疑內容？直接傳給我看看 (支援圖片/文字/語音)",
                weight: "bold",
                size: "md",
                wrap: true,
                color: "#111827",
              },
            ],
          },
        },
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://fraudchickenbye.com/guide02.png",
            size: "full",
            aspectRatio: "4:5",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "2. 不用自己判斷，把可疑內容交給「真識監詐」",
                weight: "bold",
                size: "md",
                wrap: true,
                color: "#111827",
              },
            ],
          },
        },
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://fraudchickenbye.com/guide03.png",
            size: "full",
            aspectRatio: "4:5",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "3. 傳送後，系統會自動分析特徵並提供風險評估結果",
                weight: "bold",
                size: "md",
                wrap: true,
                color: "#111827",
              },
            ],
          },
        },
      ],
    },
  };

  // 🌟 共用圖卡變數：邀請教學三聯裝
  const inviteGuideCarousel = {
    type: "flex",
    altText: "教學：如何邀請防詐小幫手進群組",
    contents: {
      type: "carousel",
      contents: [
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://fraudchickenbye.com/invite0015.png",
            size: "full",
            aspectRatio: "4:5",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "1. 進入您想加入的群組，點擊右上角的「三條線」選單符號 ↗️",
                weight: "bold",
                size: "md",
                wrap: true,
                color: "#111827",
              },
            ],
          },
        },
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://fraudchickenbye.com/invite0025.png", // ⚠️ 注意是 .png
            size: "full",
            aspectRatio: "4:5",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "2. 點擊「邀請」，搜尋「真識監詐」將我打勾後送出邀請 ➡️",
                weight: "bold",
                size: "md",
                wrap: true,
                color: "#111827",
              },
            ],
          },
        },
        {
          type: "bubble",
          hero: {
            type: "image",
            url: "https://fraudchickenbye.com/invite0031.png", // ⚠️ 注意是 .png
            size: "full",
            aspectRatio: "4:5",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "3. 邀請成功！我會開始默默在群組幫大家把關每一條可疑訊息 🛡️",
                weight: "bold",
                size: "md",
                wrap: true,
                color: "#111827",
              },
            ],
          },
        },
      ],
    },
  };

  // 🌟 共用圖卡變數：165 通報教學 (單張卡片附帶連結按鈕)
  const report165Flex = {
    type: "flex",
    altText: "165 防詐通報教學",
    contents: {
      type: "bubble",
      hero: {
        type: "image",
        url: "https://fraudchickenbye.com/165.png", // 確保檔名一致
        size: "full",
        aspectRatio: "4:5",
        aspectMode: "cover",
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "請保持冷靜！點擊下方按鈕，前往內政部警政署 165 官方網站進行報案：",
            wrap: true,
            weight: "bold",
            size: "md",
            color: "#111827",
          },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#F59E0B",
            cornerRadius: "md",
            paddingAll: "lg",
            action: {
              type: "uri",
              label: "前往通報", // 系統隱藏標籤
              uri: "https://165.npa.gov.tw/#/report/statement",
            },
            contents: [
              {
                type: "text",
                text: "👉 點我前往官方通報網站",
                weight: "bold", // 🌟 成功突破限制，變成粗體！
                color: "#FFFFFF",
                align: "center",
                size: "md",
                gravity: "center",
              },
            ],
          },
          {
            type: "text",
            text: "💡 報案基本資料為政府紀錄索取，並非此平台要求，請安心填寫。",
            wrap: true,
            size: "sm",
            color: "#6B7280",
            margin: "md",
          },
        ],
      },
    },
  };
  // ==========================================
  // 🌟 3. 訊息過濾與前置處理
  // ==========================================
  if (msgType === "text") {
    const trimmedText = event.message.text.trim();
    // 👉 1. 文字觸發「新手教學」
    if (/新手教學|新手導覽|新手/.test(trimmedText)) {
      return client.replyMessage(event.replyToken, newbieGuideCarousel);
    }

    // 👉 2. 文字觸發「上傳教學」
    if (
      /如何上傳可疑訊息|上傳可疑訊息|上傳訊息|我想上傳|我要上傳|我想要上傳/.test(
        trimmedText,
      )
    ) {
      return client.replyMessage(event.replyToken, uploadGuideCarousel);
    }

    // 👉 3. 文字觸發「165通報」
    if (/通報165|我想通報165|165/.test(trimmedText)) {
      return client.replyMessage(event.replyToken, report165Flex);
    }

    // 👉 4. 文字觸發「邀請教學」
    if (
      /如何把「真識監詐」拉進群組一起防詐|如何把真識監詐拉進群組一起防詐|邀請到群組|邀請至群組/.test(
        trimmedText,
      )
    ) {
      return client.replyMessage(event.replyToken, inviteGuideCarousel);
    }

    // 🌟 新增：文字觸發「想看更多新聞」
    if (
      /更多假新聞|更多新聞|想看更多假新聞|想看更多新聞|想要更多假新聞|想要更多新聞|看更多假新聞|看更多新聞|要更多假新聞|要更多新聞/.test(
        trimmedText,
      )
    ) {
      console.log("📰 [文字觸發] 使用者請求即時新聞！");
      return replyWithNews(event.replyToken, chatRoomId);
    }

    // 👉 針對「文字」的開關控制：提早攔截，省去呼叫 Python 的資源
    if (isGroupOrRoom) {
      if (isCommandToStart(trimmedText)) {
        state[chatRoomId] = true;
        saveState(state);
        return client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "🛡️ 「真識監詐」已啟動防護",
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: "#06C755", // 象徵安全的綠色底色
              paddingAll: "lg",
              contents: [
                {
                  type: "text",
                  text: "💡 提 醒 💡",
                  weight: "bold",
                  color: "#FFFFFF",
                  size: "xl",
                  align: "center",
                },
              ],
            },
            hero: {
              type: "image",
              // 💡 預留給你的啟動圖片。如果還沒做好圖，可以先暫時把整個 hero 區塊刪除，版面依然會很好看！
              url: "https://fraudchickenbye.com/start_safe.png",
              size: "full",
              aspectRatio: "4:3",
              aspectMode: "cover",
            },
            body: {
              type: "box",
              layout: "vertical",
              paddingAll: "md",
              contents: [
                {
                  type: "text",
                  text: "【「真識監詐」已開始判斷】",
                  weight: "bold",
                  color: "#111827",
                  size: "md",
                  margin: "none",
                },
                { type: "separator", margin: "sm" },
                {
                  type: "text",
                  text: "✅ 接下來我會隨時判斷訊息。若不需要我幫忙，請隨時輸入「停止偵測」或點擊下方按鈕",
                  wrap: true,
                  size: "sm",
                  color: "#374151",
                  margin: "md",
                },
              ],
            },
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  backgroundColor: "#06C755", // 💡 使用低調的淺灰色，避免搶走上方綠色的焦點
                  cornerRadius: "md",
                  paddingAll: "lg",
                  action: {
                    type: "message",
                    label: "暫停防護",
                    text: "停止偵測",
                  },
                  contents: [
                    {
                      type: "text",
                      text: "👉 點我立即停止防護", // 因為是反向操作，文字保持簡潔就好
                      weight: "bold",
                      color: "#FFFFFF", // 深灰色文字
                      align: "center",
                      size: "md",
                      gravity: "center",
                    },
                  ],
                },
              ],
            },
          },
        });
      }
      if (isCommandToStop(trimmedText)) {
        state[chatRoomId] = false;
        saveState(state);
        return client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "💡提醒💡 「真識監詐」已停止偵測",
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: "#F59E0B",
              paddingAll: "lg",
              contents: [
                {
                  type: "text",
                  text: "💡 提 醒 💡",
                  weight: "bold",
                  color: "#FFFFFF",
                  size: "xl",
                  align: "center",
                },
              ],
            },
            hero: {
              type: "image",
              // 💡 替換成你上傳後的圖片網址，這裡先依照你 redred.png 的路徑格式設定
              url: "https://fraudchickenbye.com/stop_alert.png",
              size: "full",
              aspectRatio: "4:3",
              aspectMode: "cover",
            },
            body: {
              type: "box",
              layout: "vertical",
              paddingAll: "md",
              contents: [
                {
                  type: "text",
                  text: "【「真識監詐」已停止判斷】",
                  weight: "bold",
                  color: "#111827",
                  size: "md",
                  margin: "none",
                },
                { type: "separator", margin: "sm" },
                {
                  type: "text",
                  text: "🚫 接下來的訊息將不會偵測。若需要我幫忙，請隨時輸入「開始偵測」或點擊下方按鈕",
                  wrap: true,
                  size: "sm",
                  color: "#374151",
                  margin: "md",
                },
              ],
            },
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  backgroundColor: "#F59E0B", // 保持黃色背景
                  cornerRadius: "md", // 讓邊角圓潤，看起來像按鈕
                  paddingAll: "lg", // 設定內邊距撐開按鈕高度
                  action: {
                    type: "message",
                    label: "重啟防護", // 系統隱藏標籤
                    text: "開始偵測", // 點擊後實際送出的文字
                  },
                  contents: [
                    {
                      type: "text",
                      text: "👉 點我立即重啟防護",
                      weight: "bold", // 🌟 成功突破限制，變成粗體！
                      color: "#FFFFFF", // 白色文字
                      align: "center", // 文字置中
                      size: "md",
                      gravity: "center",
                    },
                  ],
                },
              ],
            },
          },
        });
      }
      // 群組若沒開，直接略過文字訊息
      if (!state[chatRoomId]) return Promise.resolve(null);
    } else {
      if (isCommandToStart(trimmedText) || isCommandToStop(trimmedText)) {
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "💡 在「私訊模式」下，防詐小幫手預設是全天候開啟的喔！請直接傳送可疑訊息給我即可 😊",
        });
      }
    }

    const ignoreCommands = [
      //"真識監詐",
      //"我想上傳",
      //"我要上傳",
      //"我想要上傳",
      //"如何上傳可疑訊息?",
      "如何使用家庭群組",
      "如何使用家庭群組?",
      //"如何把真識監詐拉進群組一起防詐",
      //"如何把「真識監詐」拉進群組一起防詐?",
      //"我想通報165",
      //"我想通報165!!!",
      //"上傳",
      //"新手導覽",
      //"新手教學",
      "家庭群組",
      //"邀請到群組",
      //"邀請至群組",
      "測驗",
      "假新聞",
      "其他假新聞",
      "其它假新聞",
      "其他假新聞資訊",
      "其它假新聞資訊",
      "其他假新聞相關資訊",
      "其它假新聞相關資訊",
      "紅色警戒",
    ];

    if (ignoreCommands.includes(trimmedText)) {
      console.log(`🤫 命中特定指令 [${trimmedText}]，系統不進行 AI 分析。`);
      return Promise.resolve(null);
    }
    payloadContent = trimmedText;
    logText = payloadContent;
  } else if (msgType === "image") {
    // 👉 圖片不可能包含指令，若群組沒開就直接略過
    if (isGroupOrRoom && !state[chatRoomId]) return Promise.resolve(null);

    const stream = await client.getMessageContent(event.message.id);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    payloadContent = Buffer.concat(chunks).toString("base64");
    logText = "[圖片訊息]";
  } else if (msgType === "audio") {
    // 🎙️ 👉 語音訊息：不管群組有沒有開啟，都必須先下載並轉成 Base64，讓 Python 聽聽看是不是指令！
    const stream = await client.getMessageContent(event.message.id);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    payloadContent = Buffer.concat(chunks).toString("base64");
    logText = "[語音訊息]";
  } else if (msgType === "video" || msgType === "file") {
    // 👉 群組沒開的話，就直接略過，不浪費資源下載影片
    if (isGroupOrRoom && !state[chatRoomId]) return Promise.resolve(null);
    // 🌟 新增：針對文件類型的嚴格防呆 (攔截 Word/PPT，只放行 PDF)
    if (msgType === "file" && event.message.fileName) {
      const fileName = event.message.fileName.toLowerCase();
      // 判斷是否為微軟 Office 檔案
      if (
        fileName.endsWith(".docx") ||
        fileName.endsWith(".doc") ||
        fileName.endsWith(".pptx") ||
        fileName.endsWith(".ppt")
      ) {
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "⚠️ 系統目前無法直接閱讀 Word 或簡報檔喔！請幫我「另存成 PDF」或是直接「截圖」傳給我，我馬上幫您分析！",
        });
      }
      // 如果連 PDF 都不是，也擋下來
      else if (!fileName.endsWith(".pdf")) {
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "⚠️ 目前檔案分析僅支援「PDF 格式」喔！請將您的文件另存為 PDF 後再上傳給我。",
        });
      }
    }

    // 1. 嚴格把關檔案大小 (限制為 10MB = 10485760 bytes) 以防超時
    const MAX_SIZE = 10 * 1024 * 1024;
    if (event.message.fileSize && event.message.fileSize > MAX_SIZE) {
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "⚠️ 檔案過大，處理可能會超時卡死！請上傳 10MB 內的短影片，或直接截圖上傳喔。",
      });
    }

    // 2. 下載檔案二進制內容
    const stream = await client.getMessageContent(event.message.id);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);

    // 3. 轉成 Base64，交給你的 payloadContent 變數去搭上通往 Python 的列車
    payloadContent = Buffer.concat(chunks).toString("base64");
    logText = `[${msgType === "video" ? "影片" : "文件"}訊息]`;
  }
  // ==========================================
  // 🌟 4. 呼叫 Python 大腦分析與語音後判斷
  // ==========================================
  try {
    // 🌟 新增：觸發 LINE 的「點點點」讀取特效 (最多顯示 60 秒，機器人回覆後會自動消失)
    // ⚠️ 注意：LINE 官方規定，此特效目前「僅支援一對一私訊」，群組內無法顯示
    if (!isGroupOrRoom) {
      try {
        await axios.post(
          "https://api.line.me/v2/bot/chat/loading/start",
          {
            chatId: senderUserId,
            loadingSeconds: 60,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`,
            },
          },
        );
      } catch (loadingErr) {
        console.error("⚠️ 無法顯示讀取動畫:", loadingErr.message);
      }
    }

    const data = {
      sourceType,
      userId: chatRoomId,
      text: logText,
      timestamp: event.timestamp,
    };
    fs.appendFileSync(
      path.join(__dirname, "messages.jsonl"),
      JSON.stringify(data) + "\n",
      "utf-8",
    );

    // 🌟
    if (msgType === "video" || msgType === "file") {
      const typeName = msgType === "video" ? "🎬 影片" : "📁 檔案";
      try {
        await client.pushMessage(chatRoomId, {
          type: "text",
          text: `${typeName}接收成功！AI 正在進行逐字拆解與深度掃描，大約需要 30~60 秒，請稍候☕...`,
        });
      } catch (e) {
        console.error("發送等待提示失敗", e);
      }
    }
    // 🌟

    const responseData = await callAnalyzeAPI({
      userId: senderUserId,
      messageType: msgType,
      text: payloadContent,
      sourceType: sourceType,
    });

    if (!responseData || responseData.risk_level === null)
      return Promise.resolve(null);
    // 🌟🌟🌟 神級新增：語音與圖片關鍵字攔截系統 (模擬官方自動回應) 🌟🌟🌟
    if (msgType === "audio") {
      let aiExtractedText = responseData.transcribed_text || "";

      // 1️⃣ 攔截：新手教學
      if (/新手教學|新手導覽|新手/.test(aiExtractedText)) {
        return client.replyMessage(event.replyToken, newbieGuideCarousel);
      }

      // 2️⃣ 攔截：上傳教學
      if (
        /如何上傳可疑訊息|上傳可疑訊息|上傳訊息|我想上傳|我要上傳|我想要上傳/.test(
          aiExtractedText,
        )
      ) {
        return client.replyMessage(event.replyToken, uploadGuideCarousel);
      }

      // 3️⃣ 攔截：家庭群組 (依據要求，簡化為純文字與網址)
      if (/家庭群組|如何使用家庭群組/.test(aiExtractedText)) {
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "真識監詐 | 詐騙掰家庭群組\nhttps://liff.line.me/2009712421-QF2zlOtI",
        });
      }

      // 4️⃣ 攔截：邀請至群組
      if (
        /如何把「真識監詐」拉進群組一起防詐|如何把真識監詐拉進群組一起防詐|邀請到群組|邀請至群組/.test(
          aiExtractedText,
        )
      ) {
        return client.replyMessage(event.replyToken, inviteGuideCarousel);
      }

      // 5️⃣ 攔截：165通報
      if (/通報165|我想通報165|165/.test(aiExtractedText)) {
        return client.replyMessage(event.replyToken, report165Flex);
      }

      // 6️⃣ 攔截：其他假新聞 (依據要求，簡化為純文字與網址)
      if (
        /其他假新聞資訊|其他假新聞相關資訊|假新聞|測驗/.test(aiExtractedText)
      ) {
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "真識監詐 | 其他假新聞相關資訊\nhttps://liff.line.me/2009712421-UkSMyLLt",
        });
      }

      // 7️⃣ 攔截：紅色警戒 (模擬群組通報)
      if (/紅色警戒/.test(aiExtractedText)) {
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "警告❗️您以下家庭群組的成員已於對話偵測中出現「紅色」警報，請協助關心\n⚠️ 成員暱稱: 阿嬤\n⚠️ 群組名稱: 外婆家(媽媽)",
        });
      }

      // 🌟 8️⃣ 攔截：即時新聞 (支援語音與圖片OCR)
      if (
        /更多假新聞|更多新聞|想看更多假新聞|想看更多新聞|想要更多假新聞|想要更多新聞|看更多假新聞|看更多新聞|要更多假新聞|要更多新聞/.test(
          aiExtractedText,
        )
      ) {
        console.log("📰 [語音/圖片觸發] 使用者請求即時新聞！");
        return replyWithNews(event.replyToken, chatRoomId);
      }
    }
    // 🌟🌟🌟 攔截系統結束，以下繼續原本的紅綠燈判斷邏輯 🌟🌟🌟

    // 🌟🌟🌟 神級新增：針對「語音」的指令判斷 🌟🌟🌟
    if (msgType === "audio" && isGroupOrRoom) {
      // 假設 Python 辨識完語音，文字會放在 transcribed_text 或 reply_text 裡
      const audioText =
        responseData.transcribed_text ||
        responseData.content ||
        responseData.reply_text ||
        "";

      if (isCommandToStart(audioText)) {
        state[chatRoomId] = true;
        saveState(state);
        return client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "🛡️ 「真識監詐」已啟動防護",
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: "#06C755", // 象徵安全的綠色底色
              paddingAll: "lg",
              contents: [
                {
                  type: "text",
                  text: "💡 提 醒 💡",
                  weight: "bold",
                  color: "#FFFFFF",
                  size: "xl",
                  align: "center",
                },
              ],
            },
            hero: {
              type: "image",
              url: "https://fraudchickenbye.com/start_safe.png",
              size: "full",
              aspectRatio: "4:3",
              aspectMode: "cover",
            },
            body: {
              type: "box",
              layout: "vertical",
              paddingAll: "md",
              contents: [
                {
                  type: "text",
                  text: "【「真識監詐」已開始判斷】",
                  weight: "bold",
                  color: "#111827",
                  size: "md",
                  margin: "none",
                },
                { type: "separator", margin: "sm" },
                {
                  type: "text",
                  text: "✅ 聽到您的語音指示！接下來我會隨時判斷訊息。若不需要我幫忙，請隨時輸入「停止偵測」或點擊下方按鈕",
                  wrap: true,
                  size: "sm",
                  color: "#374151",
                  margin: "md",
                },
              ],
            },
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  backgroundColor: "#06C755",
                  cornerRadius: "md",
                  paddingAll: "lg",
                  action: {
                    type: "message",
                    label: "暫停防護",
                    text: "停止偵測",
                  },
                  contents: [
                    {
                      type: "text",
                      text: "👉 點我立即停止防護",
                      weight: "bold",
                      color: "#FFFFFF",
                      align: "center",
                      size: "md",
                      gravity: "center",
                    },
                  ],
                },
              ],
            },
          },
        });
      }

      if (isCommandToStop(audioText)) {
        state[chatRoomId] = false;
        saveState(state);
        return client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "💡提醒💡 「真識監詐」已停止偵測",
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: "#F59E0B",
              paddingAll: "lg",
              contents: [
                {
                  type: "text",
                  text: "💡 提 醒 💡",
                  weight: "bold",
                  color: "#FFFFFF",
                  size: "xl",
                  align: "center",
                },
              ],
            },
            hero: {
              type: "image",
              url: "https://fraudchickenbye.com/stop_alert.png",
              size: "full",
              aspectRatio: "4:3",
              aspectMode: "cover",
            },
            body: {
              type: "box",
              layout: "vertical",
              paddingAll: "md",
              contents: [
                {
                  type: "text",
                  text: "【「真識監詐」已停止判斷】",
                  weight: "bold",
                  color: "#111827",
                  size: "md",
                  margin: "none",
                },
                { type: "separator", margin: "sm" },
                {
                  type: "text",
                  text: "🚫 收到語音指示！接下來的訊息將不會偵測。若需要我幫忙，請隨時輸入「開始偵測」或點擊下方按鈕",
                  wrap: true,
                  size: "sm",
                  color: "#374151",
                  margin: "md",
                },
              ],
            },
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "vertical",
                  backgroundColor: "#F59E0B",
                  cornerRadius: "md",
                  paddingAll: "lg",
                  action: {
                    type: "message",
                    label: "重啟防護",
                    text: "開始偵測",
                  },
                  contents: [
                    {
                      type: "text",
                      text: "👉 點我立即重啟防護",
                      weight: "bold",
                      color: "#FFFFFF",
                      align: "center",
                      size: "md",
                      gravity: "center",
                    },
                  ],
                },
              ],
            },
          },
        });
      }

      // 如果語音說的不是指令，且群組目前是「關閉」的狀態，就默默丟掉，不發送分析結果
      if (!state[chatRoomId]) {
        return Promise.resolve(null);
      }
    }

    const riskLevel = responseData.risk_level;
    const replyText = responseData.reply_text;

    let emoji = "🟢";
    let riskZh = "(安全)";
    let riskColorName = "綠燈";
    if (riskLevel === "Yellow") {
      emoji = "🟡";
      riskZh = "(注意!)";
      riskColorName = "黃燈";
    } else if (riskLevel === "Red") {
      // 🌟 1. 處理摘要文字 (改為簡潔提示)
      let alertSummary = payloadContent;
      if (msgType === "image") {
        alertSummary = "圖片檔案顯示在下方👇";
      } else if (msgType === "audio") {
        alertSummary = "語音檔案顯示在下方👇";
      } else if (msgType === "video") {
        alertSummary =
          "🎥 影片檔案已暫存，請點擊下方「開啟可疑影片」按鈕查看👇";
      } else if (msgType === "file") {
        alertSummary =
          "📁 文件檔案已暫存，請點擊下方「開啟可疑文件」按鈕查看👇";
      }

      // 🌟 2. 處理檔案落地暫存
      let publicFileUrl = null;
      let audioDuration = null;

      // 👇 放寬條件，把 video 和 file 都加進來
      if (
        (msgType === "image" ||
          msgType === "audio" ||
          msgType === "video" ||
          msgType === "file") &&
        payloadContent
      ) {
        const publicDir = path.join(__dirname, "public");
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

        // 👇 根據檔案類型給予正確的副檔名
        let ext = "bin";
        if (msgType === "image") ext = "jpg";
        else if (msgType === "audio") ext = "m4a";
        else if (msgType === "video") ext = "mp4";
        else if (msgType === "file") ext = "pdf";

        const fileName = `fraud_${event.message.id}.${ext}`;
        const tempFilePath = path.join(publicDir, fileName);

        // 寫入檔案
        fs.writeFileSync(tempFilePath, Buffer.from(payloadContent, "base64"));

        // 取得正式網址
        const serverUrl =
          process.env.SERVER_URL || "https://fraudchickenbye.com";
        publicFileUrl = `${serverUrl}/bot-assets/${fileName}`;

        if (msgType === "audio") {
          audioDuration = event.message.duration;
        }

        // 🌟 3. 設定 24 小時後自動銷毀 (將原本的 1 小時改為 24 小時，讓家人有充裕時間查看)
        setTimeout(
          () => {
            try {
              if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
                console.log(
                  `🗑️ [暫存清理] 已自動刪除紅燈暫存檔案: ${fileName}`,
                );
              }
            } catch (e) {
              console.error("刪除暫存檔案失敗", e);
            }
          },
          60 * 60 * 1000,
        );
      }

      // 🌟 4. 觸發升級版廣播
      triggerRedAlertBroadcast(
        senderUserId,
        replyText,
        alertSummary,
        publicFileUrl,
        msgType,
        audioDuration,
      );

      const redFlexMsg = {
        type: "flex",
        altText: "🚨 嚴重警告：偵測到極高風險詐騙訊息！請勿點擊！",
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#D32F2F",
            paddingAll: "lg",
            contents: [
              {
                type: "text",
                text: "🚨 嚴重警告 🚨",
                weight: "bold",
                color: "#FFFFFF",
                size: "xl",
                align: "center",
              },
              {
                type: "text",
                text: "風險等級：紅燈 (危險!!!)",
                weight: "bold",
                color: "#FFFF00",
                size: "md",
                align: "center",
                margin: "sm",
              },
            ],
          },
          hero: {
            type: "image",
            url: "https://fraudchickenbye.com/redred.png",
            size: "full",
            aspectRatio: "1:1",
            aspectMode: "cover",
          },
          body: {
            type: "box",
            layout: "vertical",
            paddingAll: "md",
            contents: [
              {
                type: "text",
                text: "【「真識監詐」防詐分析】",
                weight: "bold",
                color: "#111827",
                size: "md",
                margin: "none",
              },
              { type: "separator", margin: "sm" },
              {
                type: "text",
                text:
                  replyText ||
                  "系統判定此內容包含極大詐騙風險，為了您的個人資安與財產安全，絕對不要點擊連結、匯款或填寫任何個資！",
                wrap: true,
                size: "sm",
                color: "#374151",
                margin: "md",
              },
            ],
          },
        },
      };

      // 2. 如果 Python 有指示需要解釋按鈕
      if (responseData.needs_explanation_button) {
        // 把文字存進快取，用訊息 ID 當鑰匙
        explanationCache[event.message.id] =
          responseData.transcribed_text || "";

        // 把 quickReply 屬性加到剛才宣告的 redFlexMsg 物件裡面
        redFlexMsg.quickReply = {
          items: [
            {
              type: "action",
              action: {
                type: "postback",
                label: "🔍 為什麼是紅燈？",
                data: `action=explain&color=red&msgId=${event.message.id}`,
                displayText: "為什麼一定就是詐騙？", // 隱藏指令，畫面上只會秀這句
              },
            },
          ],
        };
      }

      // 3. 最後，統一在這裡把變數 redFlexMsg 傳送出去！
      return client.replyMessage(event.replyToken, redFlexMsg);
    }

    if (riskLevel === "Command") {
      // 🌟 隱形人模式擴充：如果 Python 將閒聊判定為 Command，在群組內也必須閉嘴！
      if (isGroupOrRoom) {
        console.log(`🥷 [隱形模式] 群組內的閒聊對話已在背景處理，不發送通知。`);
        return Promise.resolve(null); // 🤫 隱身退出，不回覆閒聊！
      }
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: replyText,
      });
    }

    // 1. 先宣告一個變數 finalReplyMsg，把原本的一般文字訊息裝進去
    const finalReplyMsg = {
      type: "text",
      text: `【「真識監詐」防詐分析】\n${emoji} 風險等級：${riskColorName} ${riskZh}\n\n${replyText}`,
    };

    // 2. 如果 Python 有指示需要解釋按鈕 (通常是黃燈)
    if (responseData.needs_explanation_button) {
      // 把文字存進快取，用訊息 ID 當鑰匙
      explanationCache[event.message.id] = responseData.transcribed_text || "";

      finalReplyMsg.quickReply = {
        items: [
          {
            type: "action",
            action: {
              type: "postback",
              label: `🔍 為什麼是${riskColorName}？`,
              data: `action=explain&color=${responseData.button_color || "yellow"}&msgId=${event.message.id}`,
              displayText: "為什麼可能是詐騙？", // 隱藏指令
            },
          },
        ],
      };
    }

    // 3. 統一在這裡把變數 finalReplyMsg 傳送出去！
    //return client.replyMessage(event.replyToken, finalReplyMsg);
    if (isGroupOrRoom) {
      console.log(
        `🥷 [隱形模式] 群組內的 ${riskColorName} 訊息已在背景分析，不發送通知。`,
      );
      return Promise.resolve(null); // 🤫 隱身退出，不回覆黃綠燈！
    } else {
      // 💬 一對一私訊模式：維持原樣，回覆所有結果
      console.log(`💬 [私訊模式] 回覆使用者 ${riskColorName} 分析結果。`);
      return client.replyMessage(event.replyToken, finalReplyMsg);
    }
  } catch (err) {
    console.error(
      "處理訊息或呼叫 API 失敗:",
      err?.response?.data || err.message,
    );
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "分析服務連線異常，已先幫您保存訊息記錄。",
    });
  }
}

// 6) 錯誤處理
app.use((err, req, res, next) => {
  // 🌟 這裡一定要放 4 個參數！
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
    let shortUrl = firstNews.link;
    try {
      const urlRes = await axios.get(
        `https://tinyurl.com/api-create.php?url=${encodeURIComponent(firstNews.link)}`,
        { timeout: 5000 },
      );
      if (urlRes.data) {
        shortUrl = urlRes.data; // 成功取得短網址！
      }
    } catch (urlErr) {
      console.error("⚠️ 每日新聞縮網址服務暫時無回應，將使用原始網址");
    }

    // 🔴 修改點 3：推播新聞給 Python 分析時，也要加上 message_type: "text"
    const aiResponse = await axios.post(
      "http://127.0.0.1:8000/analyze/text",
      {
        user_id: "news_bot_system",
        message_type: "text", // 確保 Python 知道這是文字
        content: `【標題】：${firstNews.title}\n【來源】：${firstNews.title.split(" - ")[1] || "新聞媒體"}\n【連結】：${shortUrl}`,
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
      `完整閱讀：${shortUrl}`,
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

// ==========================================
// 啟動伺服器
// ==========================================
app.listen(port, () => {
  console.log(`🚀 LINE 防詐機器人後端 Server 運作中，埠號：${port}`);
});

// ==========================================
// 🌟 設定每天早上 6:00 自動執行排程任務 (新聞推播 + 群組喚醒提醒)
// ==========================================
cron.schedule(
  "0 6 * * *",
  async () => {
    console.log("⏰ [排程觸發] 開始執行每日早上 6 點任務...");

    try {
      // 任務 1：執行每日防詐新聞推播 (發送給私訊用戶)
      console.log("👉 準備發送每日新聞推播...");
      await runNewsAiTask();
      console.log("✅ 每日新聞推播任務執行完畢！");

      // 任務 2：檢查 LINE 群組狀態，提醒忘記開啟的群組
      console.log("👉 準備檢查群組休眠狀態...");
      const state = loadState();

      // 💡 抓出群組 ID (LINE 的群組以 C 開頭，聊天室以 R 開頭，藉此避開私訊的 U 開頭)
      const groupIds = Object.keys(state).filter(
        (id) => id.startsWith("C") || id.startsWith("R"),
      );

      for (const groupId of groupIds) {
        // 如果這個群組的偵測狀態被手動關閉了 (false)
        if (state[groupId] === false) {
          try {
            await client.pushMessage(groupId, {
              type: "text",
              text: "💡【真識監詐 - 溫馨小提醒】\n\n早安！本群組的「防詐偵測模式」目前處於暫停狀態 💤\n\n為了保護大家今天的聊天安全，若需重新啟動防護，請隨時輸入「開始偵測」喚醒我喔！",
            });
            console.log(`🔔 已發送喚醒提醒至群組: ${groupId}`);
          } catch (err) {
            console.error(
              `❌ 發送提醒至群組 ${groupId} 失敗 (可能機器人已被踢出):`,
              err.message,
            );
          }
        }
      }
      console.log("✅ 群組喚醒檢查任務執行完畢！");
    } catch (err) {
      console.error("❌ 每日排程任務發生錯誤:", err);
    }
  },
  {
    timezone: "Asia/Taipei", // 💡 極度重要：強制指定台灣時間，防止雲端伺服器時區錯亂
  },
);
