import React, { createContext, useState, useContext, useEffect } from "react";
import liff from "@line/liff";
import { View, Text, Image, ActivityIndicator, Platform } from "react-native";
// 1. 定義資料格式
export interface Member {
  userId: string;
  userName: string;
  role: "管理員" | "成員";
  status: "正常" | "可疑";
  isMuted?: boolean;
  isPinned?: boolean;
}
export interface Group {
  id: string;
  name: string;
  status: "正常" | "可疑";
  createdAt: number;
  members: Member[];
  isPinned?: boolean;
  isMuted?: boolean;
  membersCount?: number;
  pendingMembers?: any[];
  pendingCount?: number;
  statusDisplay?: string;
  muted: boolean;
}
export interface PendingMember {
  userId: string;
  userName: string;
  groupId: string;
}

// 2. 介面定義
interface GroupContextType {
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  createGroup: (groupName: string) => Promise<string>;
  joinGroupById: (id: string) => Promise<boolean>;
  pendingRequests: PendingMember[];
  handleReview: (
    userId: string,
    groupId: string,
    isApprove: boolean,
  ) => Promise<void>;
  getGroupMembers: (groupId: string) => Member[];
  currentUser: { userId: string; userName: string } | null;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

// 🔴🔴🔴 這裡請務必換成你目前啟動的 ngrok 網址 🔴🔴🔴
const API_BASE_URL = "https://5edb-220-130-167-166.ngrok-free.app";

export const GroupProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingMember[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    userId: string;
    userName: string;
  } | null>(null);

  useEffect(() => {
    // 🌟 加上這個旗標，防止 React 開發環境下執行兩次導致 LIFF 當機
    let isInitialized = false;

    const initLiffAndFetchData = async () => {
      if (isInitialized) return;
      isInitialized = true;

      try {
        const liffCore = (liff as any).default || liff;

        // 🌟 1. 先讓 LIFF 正常初始化 (讓它把網址上的 code 吃掉並完成登入)
        await liffCore.init({
          liffId: "2009712421-QF2zlOtI",
          withLoginOnExternalBrowser: true,
        });

        // 🌟 2. 等 LIFF 確定吃完、登入成功後，我們再把網址洗乾淨！
        if (typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.has("code") || urlParams.has("liff.state")) {
            // 安全淨化網址，預防下次手動重新整理時噴 400 錯誤
            window.history.replaceState(
              {},
              document.title,
              window.location.pathname,
            );
          }
        }

        if (liffCore.isLoggedIn()) {
          const profile = await liffCore.getProfile();
          setCurrentUser({
            userId: profile.userId,
            userName: profile.displayName,
          });
          fetchUserGroups(profile.userId);
        } else {
          // 本地測試身分放行邏輯維持不變
          console.warn("⚠️ 目前未登入 LINE，進入本地開發/新聞獨立測試模式");
          setCurrentUser({
            userId: "test_dev_user",
            userName: "開發測試員",
          });
        }
      } catch (error) {
        console.error("❌ LIFF 初始化失敗:", error);
        setCurrentUser({
          userId: "test_dev_user",
          userName: "開發測試員",
        });
      }
    };

    initLiffAndFetchData();
  }, []);

  const fetchUserGroups = async (userId: string) => {
    try {
      // 🌟 關鍵修復 1：加上 /user/ 才是正確的後端路由！[cite: 3, 4]
      // 🌟 關鍵修復 2：加上 headers 繞過 ngrok 的 HTML 警告頁面！[cite: 4]
      const response = await fetch(
        `${API_BASE_URL}/api/groups/user/${userId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            "Bypass-Tunnel-Reminder": "true",
          },
        },
      );

      const data = await response.json();
      if (data.success) {
        // 🌟 直接接收後端為我們整理好的完整資訊（包含待審核人數與狀態）
        const formattedGroups = data.groups.map((g: any) => ({
          id: g.id || g.group_id,
          name: g.name || g.group_name,
          status: g.status,
          createdAt: new Date(
            g.created_at || g.createdAt || Date.now(),
          ).getTime(),
          members: g.members || [],
          muted: g.muted || false,
          isMuted: g.isMuted || g.muted || false,
          isPinned: g.isPinned || false,
          membersCount: g.membersCount || (g.members ? g.members.length : 1),
          pendingMembers: g.pendingMembers || [],
          pendingCount: g.pendingCount || 0,
        }));
        setGroups(formattedGroups);
      }
    } catch (error) {
      console.error("❌ 獲取群組失敗", error);
    }
  };

  // 4. 建立群組：打 API 寫入 PostgreSQL
  const createGroup = async (groupName: string) => {
    console.log("🟢 [前端觸發] 準備建立群組，名稱:", groupName);
    console.log("🟢 [前端狀態] 目前的 currentUser 是:", currentUser);

    if (!currentUser) {
      console.log(
        "🔴 [前端阻擋] 建立失敗：找不到 currentUser，可能是 LINE 尚未登入成功！",
      );
      alert("尚未取得 LINE 身分，請重新載入！"); // 在手機畫面上跳出警告
      return "";
    }

    try {
      console.log(`🟡 [前端發送] 準備呼叫 API: ${API_BASE_URL}/api/groups`);

      const response = await fetch(`${API_BASE_URL}/api/groups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          "Bypass-Tunnel-Reminder": "true",
        },
        body: JSON.stringify({
          groupName: groupName,
          userId: currentUser.userId,
          userName: currentUser.userName,
        }),
      });

      console.log("🟡 [後端回應] HTTP 狀態碼:", response.status);

      const data = await response.json();
      console.log("🟢 [後端回應] 解析後的資料:", data);

      if (data.success) {
        const newDbGroup = data.data;

        // 直接無縫接軌你資料庫回傳的真實欄位！
        const newGroup: Group = {
          id: newDbGroup.group_id, // 對應資料庫的 group_id
          name: newDbGroup.group_name, // 對應資料庫的 group_name
          status: newDbGroup.status, // 對應資料庫的 status
          createdAt: new Date(newDbGroup.created_at).getTime(),
          members: newDbGroup.members, // 直接整包接收 jsonb 陣列
          muted: newDbGroup.muted, // 接收 boolean
        };

        setGroups((prev) => [newGroup, ...prev]);
        return data.groupId;
      }
      return "";
    } catch (error) {
      console.error(
        "🔴 [前端錯誤] 呼叫 API 發生嚴重錯誤（可能是網址錯或網路斷線）:",
        error,
      );
      return "";
    }
  };

  // 5. 保留前端原本的其他函式
  const joinGroupById = async (id: string) => {
    return false;
  };
  const handleReview = async (
    userId: string,
    groupId: string,
    isApprove: boolean,
  ) => {};

  // 💡 修復點 2：明確定義 find 裡面的 g 的型別為 Group
  const getGroupMembers = (groupId: string) =>
    groups.find((g: Group) => g.id === groupId)?.members || [];

  return (
    <GroupContext.Provider
      value={{
        groups,
        setGroups,
        createGroup,
        joinGroupById,
        pendingRequests,
        handleReview,
        getGroupMembers,
        currentUser,
      }}
    >
      {/* 🌟 1. 這裡維持你原本的判斷：有登入顯示主應用，沒登入顯示跳舞小雞 Loading */}
      {currentUser ? (
        children
      ) : (
        <View
          style={{
            flex: 1,
            backgroundColor: "#FFFDF9",
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 20,
            width: "100%",
            minHeight: "100vh" as any,
          }}
        >
          <Image
            source={
              Platform.OS === "web"
                ? { uri: "/loading.gif" }
                : require("../assets/loading.gif")
            }
            style={{
              width: 160,
              height: 90,
              resizeMode: "contain",
              marginBottom: 16,
            }}
          />
          <Text
            style={{
              fontSize: 17,
              fontWeight: "800",
              color: "#4A2E18",
              textAlign: "center",
            }}
          >
            🐣 小雞偵探正在確認您的 LINE 身分...
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 13,
              fontWeight: "600",
              color: "#8B5A2B",
              textAlign: "center",
            }}
          >
            (正在安全連線至真識監詐系統)
          </Text>
        </View>
      )}

      {/* 🌟 2. 【核心修改】全域常駐隱形小雞：不管老用戶跳轉到哪裡，GIF 永遠鎖在記憶體，任何頁面要用都是 0 秒秒出！ */}
      <Image
        source={
          Platform.OS === "web"
            ? { uri: "/loading.gif" }
            : require("../assets/loading.gif")
        }
        style={{
          width: 1,
          height: 1,
          opacity: 0,
          position: "absolute",
          bottom: 0,
          left: -9999, // 💡 直接把它推到螢幕左側 9999 像素外的太空！
          top: -9999,
        }}
      />
    </GroupContext.Provider>
  );
};

export const useGroups = () => {
  const c = useContext(GroupContext);
  if (!c) throw new Error("useGroups error");
  return c;
};
