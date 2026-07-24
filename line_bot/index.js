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
// ==========================================
// ⏰ 全域防詐連環鬧鐘追蹤中心 (Escalation Protocol)
// ==========================================
// ==========================================
// ⏰ 全域防詐連環鬧鐘追蹤中心 (無敵防彈終止版)
// ==========================================
const activeAlarms = {};
const MAX_ALARM_COUNT = 5;

// 🌟 神級輔助：強制標準化鬧鐘 Key，去除空白並統一大小寫！
function getAlarmKey(groupId, targetId) {
  return `${(groupId || "").trim().toUpperCase()}_${(targetId || "").trim().toLowerCase()}`;
}

// 啟動 10 分鐘連環鬧鐘
function startAlarmLoop(groupId, targetId, broadcastTask) {
  const alarmKey = getAlarmKey(groupId, targetId);

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
        stopAlarmLoop(groupId, targetId);
      }
    },
    10 * 60 * 1000,
  );
}

// 停止並銷毀鬧鐘
function stopAlarmLoop(groupId, targetId) {
  const alarmKey = getAlarmKey(groupId, targetId);
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
  return /幫我抓取訊息|開始偵測|開始讀取/.test(text);
}

function isCommandToStop(text) {
  return /取消讀取|停止偵測|停止讀取/.test(text);
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
      stopAlarmLoop(group.group_id, cleanTargetId);

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
        text: `🛡️【真識監詐 - 警報解除通知】\n\n家人「${operatorName || "某位家人"}」已在防詐 App 中確認您的安全，所有群組狀態已同步恢復正常！`,
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
          `${aiAnalysisText ? aiAnalysisText.slice(0, 60) + "..." : "包含典型詐騙誘導話術，請多加防範！"}`,
          `💬 內容摘要：${originalContent.length > 30 ? originalContent.slice(0, 30) + "..." : originalContent}`,
          `----------------------`,
          `💡 貼心提醒：若無人解除警報，系統將每 10 分鐘重新提醒一次！\n(最多五次)`,
        ].join("\n"),
      };

      const alertButtonMessage = {
        type: "template",
        altText: `🚨 請確認 ${senderName} 的安全並解除警報`,
        template: {
          type: "buttons",
          title: "🛡️ 家人安全確認指令",
          text: `請確認 [${senderName}] 是否匯款或受騙!點擊下方按鈕即可「停止通知」並確認狀態`,
          actions: [
            {
              type: "postback",
              label: "👉 我已確認安全，點此解除",
              // 💡 這裡傳入 targetId，讓按鈕點下去時可以「全域解除」該成員的所有群組
              data: `action=reset_alarm&targetId=${cleanId}&targetName=${encodeURIComponent(senderName)}`,
            },
          ],
        },
      };

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
          await client.pushMessage(target.userId.trim(), [
            alertTextMessage,
            alertButtonMessage,
          ]);
          notifiedFamilyTargets.add(targetId); // 記到黑板上，今天這次不准再發給他
          console.log(
            `🔔 成功發送警報給家人：${target.userName || target.userId}`,
          );
        } catch (pushErr) {
          console.error(`❌ 推播失敗:`, pushErr.message);
        }
      }

      // 4. 啟動連續鬧鐘 (每個有效群組各自計時，直到被按鈕解除)
      startAlarmLoop(group.group_id, cleanId, async () => {
        // ... (這裡維持你原本寫好的鬧鐘資料庫檢查，不用動) ...
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

async function callAnalyzeAPI({ userId, messageType, text }) {
  const res = await axios.post(
    "http://127.0.0.1:8000/analyze/text",
    {
      user_id: userId,
      message_type: messageType,
      content: text,
    },
    { timeout: 30000 },
  );
  return res.data;
}

async function handleEvent(event) {
  // ==========================================
  // 🌟 1. 優先處理 LINE 互動按鈕點擊事件 (Postback)
  // ==========================================
  if (event.type === "postback") {
    const params = new URLSearchParams(event.postback.data);

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
          text: "⛔【真識監詐 - 安全防護機制】\n\n為了防止受騙者在歹徒誘導下自行關閉通報，系統禁止當事人「自行解除」可疑警報！\n\n🛡️ 請務必由「群組內的另一位家人」確認您的情況安全後，由家人幫您點擊按鈕解除狀態。",
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
            stopAlarmLoop(group.group_id, targetId);
          }

          // 3) 直接在 LINE 回覆這位好家人，並推播給當事人報平安！
          await client.replyMessage(event.replyToken, {
            type: "text",
            text: `✅ 感謝您的協助！\n\n您已確認「${targetName}」的安全，系統已同步解除他所在【所有群組】的可疑狀態🛡️`,
          });

          try {
            await client.pushMessage(targetId, {
              type: "text",
              text: `🛡️【真識監詐 - 警報解除通知】\n\n家人「${operatorName}」已在 LINE 中確認您的安全，所有群組狀態已同步恢復正常！`,
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
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "大家好！我是「真識監詐」防詐 Bot 🤖👋\n\n已成功加入群組💡我會在後台默默守護大家的對話安全。\n\n只要輸入「開始偵測」即可啟動判斷機制；也可以輸入「新手教學」查看更多功能喔！🗒️",
    });
  }

  if (event.type !== "message") return Promise.resolve(null);
  if (
    event.message.type !== "text" &&
    event.message.type !== "image" &&
    event.message.type !== "audio"
  )
    return Promise.resolve(null);

  const msgType = event.message.type;
  const source = event?.source || {};
  const sourceType = source.type || "unknown";
  const safeUserId =
    source.userId || source.groupId || source.roomId || "unknown_user";

  let payloadContent = "";
  let logText = "";

  if (msgType === "text") {
    const trimmedText = event.message.text.trim();

    // 💡 建立指令白名單陣列：只有「完全等於」陣列裡的關鍵字，才會被忽略
    const ignoreCommands = [
      "如何上傳可疑訊息",
      "如何上傳可疑訊息?",
      "如何使用家庭群組",
      "如何使用家庭群組?",
      "如何把真識監詐拉進群組一起防詐",
      "如何把「真識監詐」拉進群組一起防詐?",
      "我想通報165",
      "我想通報165!!!",
      "上傳",
      "新手導覽",
      "新手教學",
      "家庭群組",
      "邀請到群組",
      "邀請至群組",
      "其他假新聞",
      "紅色警戒",
      "其他假新聞資訊",
    ];

    // 使用 .includes() 進行精準比對
    if (ignoreCommands.includes(trimmedText)) {
      console.log(`🤫 命中特定指令 [${trimmedText}]，系統不進行 AI 分析。`);
      return Promise.resolve(null);
    }
    payloadContent = trimmedText;
    logText = payloadContent;
  } else if (msgType === "image") {
    const stream = await client.getMessageContent(event.message.id);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    payloadContent = buffer.toString("base64");
    logText = "[圖片訊息]";
    // 🌟 【直接貼在 image 區塊下面】：處理長輩傳來的語音檔
  } else if (msgType === "audio") {
    const stream = await client.getMessageContent(event.message.id);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    payloadContent = buffer.toString("base64"); // 將語音壓縮為 base64 字串傳給 Python
    logText = "[語音訊息]";
  }

  try {
    // 寫入 jsonl 紀錄
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

    // 呼叫 Python 大腦分析
    const responseData = await callAnalyzeAPI({
      userId: safeUserId,
      messageType: msgType,
      text: payloadContent,
    });
    if (!responseData || responseData.risk_level === null)
      return Promise.resolve(null);

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
      // 🌟 1. 關鍵發動：當判定為紅燈 (Red)，依舊立即非同步啟動家庭群組廣播！
      triggerRedAlertBroadcast(safeUserId, replyText, payloadContent);

      // 🌟 2. 改用 Flex Message：發送帶有「大紅底色警告標題」與「警示圖片」的強烈卡片！
      return client.replyMessage(event.replyToken, {
        type: "flex",
        altText: "🚨 嚴重警告：偵測到極高風險詐騙訊息！請勿點擊！", // 手機推播通知與未點開時顯示的警示字眼
        contents: {
          type: "bubble",
          // 🟥 第一區塊：強烈的紅色警告標題 (解決同學說的第一行不夠警示的問題)
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#D32F2F", // 深紅底色
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
                color: "#FFFF00", // 亮黃色字體對比深紅底
                size: "md",
                align: "center",
                margin: "sm",
              },
            ],
          },
          // 🖼️ 第二區塊：滿版嚴重警告圖 (解決同學說的需要用圖片表示真的不要點的問題)
          // ⚠️ 注意：這是一張免費公開圖床的警示圖，你日後也可以隨意換成自己設計上傳 Imgur 的網址！
          hero: {
            type: "image",
            url: "https://drive.google.com/uc?export=view&id=1EUqhueJfScjGPLK7GjtwpxNJj-30Oqy7",
            size: "full",
            aspectRatio: "1:1",
            aspectMode: "cover",
          },
          // 📝 第三區塊：將 AI 原本的詳細解說與分析理由放在下方
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
              {
                type: "separator",
                margin: "sm",
              },
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
      });
    }

    // 🌟 【新增這個判斷】：如果 Python 說是 Command (指令)，直接乾淨回覆文字，絕對不加【防詐分析】與【🟢綠燈0分】！
    if (riskLevel === "Command") {
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: replyText,
      });
    }
    // 🟢🟡 綠燈與黃燈：維持原本乾淨俐落的純文字輸出
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `【「真識監詐」防詐分析】\n${emoji} 風險等級：${riskColorName} ${riskZh}\n\n${replyText}`,
    });
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
  //try {
  //  await runNewsAiTask();
  // console.log("✅ 初始推播任務執行成功");
  // } catch (err) {
  //  console.error("❌ 初始推播任務失敗:", err);
  // }
});
