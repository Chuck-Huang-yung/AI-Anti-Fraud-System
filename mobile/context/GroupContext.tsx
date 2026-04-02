import React, { createContext, useState, useContext, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// 定義資料型別
interface Group {
  id: string;
  name: string;
  status: "正常" | "可疑";
  createdAt: number;
}

interface PendingMember {
  userId: string;
  userName: string;
  groupId: string;
}

interface GroupContextType {
  groups: Group[];
  addGroup: (name: string) => Promise<Group>;
  joinGroupById: (id: string) => Promise<boolean>;
  pendingRequests: PendingMember[];
  handleReview: (userId: string, groupId: string, isApprove: boolean) => void;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

const STORAGE_KEY = "fc_groups_v1";

export const GroupProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingMember[]>([
    { userId: "user_01", userName: "小明", groupId: "7CD9QCC668HP" }, // 預設一筆測試資料
  ]);

  // 初始化讀取
  useEffect(() => {
    loadLocalGroups();
  }, []);

  const loadLocalGroups = async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) setGroups(JSON.parse(raw));
  };

  const addGroup = async (name: string) => {
    const newGroup: Group = {
      id: Math.random().toString(36).substring(2, 10).toUpperCase(),
      name,
      status: "正常",
      createdAt: Date.now(),
    };
    const next = [newGroup, ...groups];
    setGroups(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return newGroup;
  };

  const joinGroupById = async (id: string) => {
    // 這裡模擬「加入」：實務上應該去後端查 ID，目前我們模擬從現有清單找
    // 如果未來有後端，這裡改寫成 API Fetch
    const exists = groups.find((g) => g.id === id);
    return !!exists;
  };

  // 審核通過或拒絕的函式
  const handleReview = (
    userId: string,
    groupId: string,
    isApprove: boolean,
  ) => {
    if (isApprove) {
      // 這裡實務上會把 User 加入群組成員清單
      console.log(`用戶 ${userId} 已加入群組 ${groupId}`);
    }
    // 無論通過或拒絕，都從待審核清單移除
    setPendingRequests((prev) => prev.filter((req) => req.userId !== userId));
  };

  return (
    <GroupContext.Provider
      value={{ groups, addGroup, joinGroupById, pendingRequests, handleReview }}
    >
      {children}
    </GroupContext.Provider>
  );
};

export const useGroups = () => {
  const context = useContext(GroupContext);
  if (!context)
    throw new Error("useGroups must be used within a GroupProvider");
  return context;
};
