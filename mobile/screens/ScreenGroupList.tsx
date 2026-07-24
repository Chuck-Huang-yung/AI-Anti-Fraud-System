import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Pressable,
  FlatList,
  TextInput,
  Modal,
  TouchableOpacity,
  Platform,
  RefreshControl,
  Image,
} from "react-native";
import liff from "@line/liff";
import axios from "axios";
import { useGroups } from "../context/GroupContext";
import { useFocusEffect } from "@react-navigation/native";

// 💡 請確認這裡是你當下活著的 ngrok 網址
const API_URL = "https://ae3a-220-130-167-166.ngrok-free.app";

const axiosConfig = {
  headers: {
    "ngrok-skip-browser-warning": "true",
    "Bypass-Tunnel-Reminder": "true",
  },
};

export default function ScreenGroupList({ navigation }: any) {
  const { groups, setGroups } = useGroups();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // 🌟 管理員退出專用的移交狀態
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedGroupForTransfer, setSelectedGroupForTransfer] = useState<
    any | null
  >(null);
  const [selectedSuccessorId, setSelectedSuccessorId] = useState<string | null>(
    null,
  );
  const [isLeaving, setIsLeaving] = useState(false);

  // 🌟 新增：客製化摩卡棕提示視窗專用狀態
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupData, setPopupData] = useState({
    icon: "💡",
    title: "",
    message: "",
    btnText: "確定",
    onConfirm: () => {},
  });

  const showPopup = (
    icon: string,
    title: string,
    message: string,
    onConfirmAction?: () => void,
    btnText = "確定",
  ) => {
    setPopupData({
      icon,
      title,
      message,
      btnText,
      onConfirm: () => {
        setPopupVisible(false);
        if (onConfirmAction) onConfirmAction();
      },
    });
    setPopupVisible(true);
  };

  const showAlert = (title: string, message: string) => {
    showPopup("💡", title, message);
  };

  const fetchMyGroups = async (userId: string) => {
    try {
      console.log(`[前端發出請求] 正在抓取用戶 ${userId} 的群組...`);
      const response = await axios.get(
        `${API_URL}/api/groups/user/${userId}`,
        axiosConfig,
      );

      if (
        typeof response.data === "string" &&
        response.data.includes("<!DOCTYPE html>")
      ) {
        showAlert(
          "🚨 網址被攔截",
          "後端 API 被 ngrok/localtunnel 警告頁面攔截，請檢查網址或 Header！",
        );
        return;
      }

      if (response.data && response.data.success) {
        const safeGroups = response.data.groups.map((g: any) => ({
          ...g,
          members: Array.isArray(g.members)
            ? g.members
            : typeof g.members === "string"
              ? JSON.parse(g.members)
              : [],
        }));

        setGroups(safeGroups);
        console.log(`✅ [前端成功接收] 共載入 ${safeGroups.length} 個群組！`);
      } else {
        showAlert("⚠️ 查詢異常", "伺服器成功連線，但未回傳群組資料。");
      }
    } catch (error: any) {
      console.error("❌ 取得群組清單失敗:", error);
      const errMsg = error.response?.status
        ? `HTTP 狀態碼: ${error.response.status}`
        : "無法連線到伺服器 (請檢查網址是否失效或電腦是否休眠)";
      showAlert("🔌 讀取群組失敗", `${errMsg}\n當前查詢ID: ${userId}`);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const initAndFetch = async () => {
      try {
        await liff.init({ liffId: "2009712421-QF2zlOtI" });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setCurrentUserId(profile.userId);
          await fetchMyGroups(profile.userId);
        } else {
          setIsLoading(false);
          showAlert("提示", "未能登入 LINE，無法取得使用者身分");
        }
      } catch (err) {
        console.error("LIFF 初始化失敗:", err);
        setIsLoading(false);
      }
    };
    initAndFetch();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (currentUserId) {
        fetchMyGroups(currentUserId);
      }
    }, [currentUserId]),
  );

  const onRefresh = () => {
    if (currentUserId) {
      setRefreshing(true);
      fetchMyGroups(currentUserId);
    }
  };

  const handleTogglePin = async (groupId: string) => {
    const target = groups.find((g) => g.id === groupId);
    if (!target || !currentUserId) return;
    const nextPinned = !target.isPinned;

    setGroups((prev: any[]) =>
      prev.map((g) => (g.id === groupId ? { ...g, isPinned: nextPinned } : g)),
    );

    try {
      await axios.post(
        `${API_URL}/api/groups/toggle-pin`,
        { groupId, userId: currentUserId, isPinned: nextPinned },
        axiosConfig,
      );
    } catch (err) {
      console.error("儲存釘選狀態失敗:", err);
      showAlert("連線失敗", "無法儲存釘選設定");
      setGroups((prev: any[]) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, isPinned: !nextPinned } : g,
        ),
      );
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = q
      ? groups.filter((g) => g.name.toLowerCase().includes(q))
      : groups;

    return result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });
  }, [groups, query]);

  const openMenu = (id: string) => {
    setMenuGroupId(id);
    setMenuOpen(true);
  };
  const closeMenu = () => {
    setMenuOpen(false);
  };

  const handleToggleMute = async (groupId: string, currentMuted: boolean) => {
    const nextMuted = !currentMuted;
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, muted: nextMuted } : g)),
    );

    try {
      await axios.post(
        `${API_URL}/api/groups/toggle-mute`,
        // 🌟 正確：將鍵值指定為你第 45 行宣告的 currentUserId！
        { groupId, userId: currentUserId, muted: nextMuted },
        axiosConfig,
      );
    } catch (error) {
      console.error("儲存靜音狀態失敗:", error);
      showAlert("連線失敗", "無法儲存推播設定，已回復原本狀態。");
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, muted: currentMuted } : g)),
      );
    }
  };

  const leaveGroup = () => {
    const tid = menuGroupId;
    const targetGroup = groups.find((g) => g.id === tid);
    if (!targetGroup || !currentUserId) return;
    closeMenu();

    const members = targetGroup.members || [];
    const me = members.find(
      (m: any) =>
        (m.userId || m.id || "").toLowerCase() === currentUserId.toLowerCase(),
    );
    const isMyAdmin = me?.role === "管理員";
    const remainingMembers = members.filter(
      (m: any) =>
        (m.userId || m.id || "").toLowerCase() !== currentUserId.toLowerCase(),
    );

    if (remainingMembers.length === 0) {
      showPopup(
        "💡",
        "解散群組確認",
        `目前「${targetGroup.name}」只剩您最後一位成員，退出後該群組將會自動註銷解散！確定嗎？`,
        () => executeLeaveGroup(targetGroup.id),
        "確認解散",
      );
      return;
    }

    if (isMyAdmin) {
      setSelectedGroupForTransfer(targetGroup);
      setSelectedSuccessorId(remainingMembers[0]?.userId || null);
      setShowTransferModal(true);
      return;
    }

    showPopup(
      "🚪",
      "退出群組確認",
      `確定要退出「${targetGroup.name}」嗎？\n退出後需重新輸入代碼才能加入。`,
      () => executeLeaveGroup(targetGroup.id),
      "確認退出",
    );
  };

  const executeLeaveGroup = async (
    groupId: string,
    successorId?: string | null,
  ) => {
    if (!currentUserId) return;
    setIsLeaving(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/groups/leave`,
        {
          groupId: groupId,
          userId: currentUserId,
          newAdminId: successorId || undefined,
        },
        axiosConfig,
      );

      if (res.data && res.data.success) {
        setShowTransferModal(false);
        setGroups((prev: any[]) => prev.filter((g) => g.id !== groupId));

        if (res.data.action === "disbanded") {
          showAlert("💡 群組已解散", "您是最後一位成員，群組已自動註銷解散。");
        } else if (successorId) {
          showAlert(
            "👑 移交成功",
            "您已成功退出群組，並將管理權限交棒給指定的家人！",
          );
        } else {
          showAlert("✅ 已退出", "您已成功退出該群組。");
        }
      }
    } catch (err: any) {
      console.error("退出群組失敗:", err);
      showAlert("❌ 錯誤", "退出群組失敗，請檢查網路連線");
    } finally {
      setIsLeaving(false);
    }
  };

  const deleteGroup = () => {
    const tid = menuGroupId;
    const targetGroup = groups.find((g) => g.id === tid);
    closeMenu();

    if (!targetGroup || !currentUserId) return;

    const me = targetGroup.members?.find(
      (m: any) =>
        (m.userId || m.id || "").trim().toLowerCase() ===
        currentUserId.trim().toLowerCase(),
    );
    if (me?.role !== "管理員") {
      setTimeout(() => {
        showAlert(
          "⛔ 權限不足",
          "只有該群組的「管理員」才可以執行強制解散與刪除哦！",
        );
      }, 350);
      return;
    }

    setTimeout(() => {
      showPopup(
        "⚠️",
        "刪除群組確認",
        `確定要強制解散並刪除「${targetGroup.name}」嗎？\n此動作不可逆，所有成員將立刻被移出群組！`,
        () => executeDeleteGroup(targetGroup.id),
        "確認刪除",
      );
    }, 350);
  };

  const executeDeleteGroup = async (groupId: string) => {
    if (!currentUserId) return;
    setIsLoading(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/groups/delete`,
        { groupId, userId: currentUserId },
        axiosConfig,
      );

      if (res.data && res.data.success) {
        setGroups((prev: any[]) => prev.filter((g) => g.id !== groupId));
        setTimeout(() => showAlert("✅ 已刪除", "群組已成功強制解散。"), 300);
      }
    } catch (err: any) {
      console.error("刪除群組失敗:", err);
      showAlert(
        "❌ 錯誤",
        err.response?.data?.error || "刪除失敗，請檢查權限或連線",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* 🌟 1. 客製化摩卡棕彈出提示卡 (取代系統丑丑提示) */}
      <Modal
        visible={popupVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPopupVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.popupCard}>
            {/* 🌟 貼在 popupCard 裡面的最上方：右上角大叉叉 */}
            <Pressable
              onPress={() => setPopupVisible(false)}
              style={{
                position: "absolute",
                top: 12,
                right: 16,
                padding: 6,
                zIndex: 10,
              }}
              hitSlop={15}
            >
              <Text
                style={{ fontSize: 26, fontWeight: "900", color: "#8B5A2B" }}
              >
                ✕
              </Text>
            </Pressable>
            <Text style={{ fontSize: 32, marginBottom: 10 }}>
              {popupData.icon}
            </Text>
            <Text style={styles.popupTitle}>{popupData.title}</Text>
            <Text style={styles.popupDesc}>{popupData.message}</Text>

            {/* 💡 使用 100% 寬 + 固定 46px 高度的摩卡棕按鈕，絕不變扁！ */}
            <Pressable onPress={popupData.onConfirm} style={styles.popupBtn}>
              <Text style={styles.popupBtnText}>{popupData.btnText}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>查詢群組</Text>
      </View>
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Text style={{ fontSize: 16 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜尋您的家庭群組..."
            style={styles.searchInput}
            placeholderTextColor="#A8927D"
          />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          {/* 🌟 用小雞取代無聊的轉圈圈！ */}
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
          <Text style={styles.loadingText}>
            🐣 小雞偵探正在為您查詢群組清單...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          extraData={groups}
          contentContainerStyle={styles.listPadding}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#5C3A21"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              {/* 🌟 優化點：智慧判斷用戶目前是否有輸入搜尋關鍵字 (query) */}
              {query.trim().length > 0 ? (
                <>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>🔍</Text>
                  <Text style={styles.emptyText}>
                    找不到包含「{query.trim()}」的群組
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: "#8B5A2B",
                      marginTop: 4,
                      fontWeight: "600",
                    }}
                  >
                    請檢查關鍵字或清除文字後重新搜尋
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>🏠</Text>
                  <Text style={styles.emptyText}>
                    哎呀! 您尚未加入任何家庭群組～
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: "#8B5A2B",
                      marginTop: 4,
                      fontWeight: "600",
                    }}
                  >
                    點擊下方「加入/創建」來建立專屬防護網吧！
                  </Text>
                </>
              )}
            </View>
          }
          renderItem={({ item }: any) => {
            const isAdmin = item.members?.some(
              (m: any) =>
                m.userId?.toLowerCase() === currentUserId?.toLowerCase() &&
                m.role === "管理員",
            );
            const hasPending = (item.pendingCount || 0) > 0;

            return (
              <Pressable
                onPress={() =>
                  navigation.navigate("MemberList", { group: item })
                }
                style={[
                  styles.card,
                  hasPending &&
                    isAdmin && {
                      borderColor: "#8B5A2B",
                      borderWidth: 1.5,
                      height: "auto",
                      paddingVertical: 12,
                    },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupName}>
                    {item.isPinned ? "📌 " : ""}
                    {item.name} (
                    {item.membersCount || item.members?.length || 0})
                  </Text>

                  {isAdmin && hasPending && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        navigation.navigate("ReviewMembers", { group: item });
                      }}
                      style={styles.pendingBadge}
                    >
                      <Text style={styles.pendingBadgeText}>
                        🔔 {item.pendingCount} 位新成員待審核 (點此處理)
                      </Text>
                    </Pressable>
                  )}
                </View>

                <View style={styles.rightIcons}>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      handleToggleMute(item.id, item.muted);
                    }}
                    style={styles.iconBtn}
                  >
                    <Text style={{ fontSize: 18 }}>
                      {item.muted ? "🔇" : "🔈"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      openMenu(item.id);
                    }}
                    style={styles.iconBtn}
                  >
                    <Text style={styles.icon}>⋯</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* 底部 ⋯ 選項選單 */}
      <Modal visible={menuOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={closeMenu}>
          <View style={{ flex: 1 }} />
        </Pressable>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <TouchableOpacity
            style={styles.sheetItem}
            onPress={() => {
              const target = groups.find((x) => x.id === menuGroupId);
              if (target) handleTogglePin(target.id);
              closeMenu();
            }}
          >
            <Text style={styles.sheetText}>
              {groups.find((x) => x.id === menuGroupId)?.isPinned
                ? "取消釘選"
                : "釘選群組"}
            </Text>
          </TouchableOpacity>
          <View style={styles.sheetDivider} />

          {/* 🌟 2. 【新增這裡】：複製群組代碼選項 */}
          <TouchableOpacity
            style={styles.sheetItem}
            onPress={() => {
              const target = groups.find((x) => x.id === menuGroupId);
              closeMenu(); // 先收起底部選單

              if (target) {
                // 💡 彈出摩卡棕卡片，顯示代碼與複製按鈕！
                showPopup(
                  "📋",
                  "專屬群組代碼",
                  `群組「${target.name}」的邀請代碼為：\n\n【 ${target.id} 】\n\n點擊下方按鈕即可快速複製，傳送到 LINE 邀請家人！`,
                  () => {
                    if (Platform.OS === "web" && navigator.clipboard) {
                      navigator.clipboard.writeText(target.id).then(() => {
                        setTimeout(() => {
                          showPopup(
                            "✅",
                            "複製成功！",
                            `代碼【 ${target.id} 】已成功複製到剪貼簿！`,
                          );
                        }, 300);
                      });
                    } else {
                      // 🟢 把原本報錯的 Alert.alert 改成呼叫你的客製化 showPopup！
                      setTimeout(() => {
                        showPopup(
                          "✅",
                          "複製成功",
                          `代碼【 ${target.id} 】已複製，快傳給家人吧！`,
                        );
                      }, 300);
                    }
                  },
                  "📋 一鍵複製代碼",
                );
              }
            }}
          >
            <Text style={[styles.sheetText, { color: "#4A2E18" }]}>
              複製群組代碼
            </Text>
          </TouchableOpacity>
          <View style={styles.sheetDivider} />
          <TouchableOpacity
            style={styles.sheetItem}
            onPress={() => {
              const g = groups.find((x) => x.id === menuGroupId);
              closeMenu();
              navigation.navigate("ReviewMembers", { group: g });
            }}
          >
            <Text style={styles.sheetText}>審核新成員</Text>
          </TouchableOpacity>
          <View style={styles.sheetDivider} />
          <TouchableOpacity style={styles.sheetItem} onPress={leaveGroup}>
            <Text style={[styles.sheetText, { color: "#C62828" }]}>
              退出群組
            </Text>
          </TouchableOpacity>
          {(() => {
            const tg = groups.find((x) => x.id === menuGroupId);
            const me = tg?.members?.find(
              (m: any) =>
                (m.userId || m.id || "").trim().toLowerCase() ===
                currentUserId?.trim().toLowerCase(),
            );
            if (me?.role === "管理員") {
              return (
                <>
                  <View style={styles.sheetDivider} />
                  <TouchableOpacity
                    style={styles.sheetItem}
                    onPress={deleteGroup}
                  >
                    <Text style={[styles.sheetText, { color: "#C62828" }]}>
                      刪除群組
                    </Text>
                  </TouchableOpacity>
                </>
              );
            }
            return null;
          })()}
          <TouchableOpacity
            style={[styles.sheetItem, { marginTop: 8 }]}
            onPress={closeMenu}
          >
            <Text style={[styles.sheetText, { color: "#8B5A2B" }]}>取消</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* 🌟 👑 移交接班人專用的摩卡棕卡片 */}
      <Modal
        visible={showTransferModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTransferModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.transferCard}>
            <View style={styles.transferIconBg}>
              <Text style={{ fontSize: 32 }}>👑</Text>
            </View>
            <Text style={styles.popupTitle}>移交群組管理權限</Text>
            <Text style={[styles.popupDesc, { marginBottom: 16 }]}>
              您是「{selectedGroupForTransfer?.name}
              」的管理員，退出前請選擇一位家人接任管理員喔！
            </Text>

            <View style={styles.successorList}>
              {(selectedGroupForTransfer?.members || [])
                .filter(
                  (m: any) =>
                    (m.userId || m.id || "").toLowerCase() !==
                    currentUserId?.toLowerCase(),
                )
                .map((m: any, idx: number) => {
                  const mId = m.userId || m.id || `sub-${idx}`;
                  const isSelected = selectedSuccessorId === mId;
                  const avatar = m.avatarUri || m.pictureUrl;
                  const name = m.userName || m.name || "家人";

                  return (
                    <Pressable
                      key={mId}
                      onPress={() => setSelectedSuccessorId(mId)}
                      style={[
                        styles.successorItem,
                        isSelected && styles.successorItemActive,
                      ]}
                    >
                      <View style={styles.smallAvatar}>
                        {avatar ? (
                          <Image
                            source={{ uri: avatar }}
                            style={styles.avatarImage}
                          />
                        ) : (
                          <Text style={styles.smallAvatarText}>
                            {name.charAt(0)}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.successorName,
                          isSelected && { fontWeight: "900", color: "#4A2E18" },
                        ]}
                      >
                        {name}
                      </Text>
                      <View
                        style={[
                          styles.radioCircle,
                          isSelected && styles.radioCircleActive,
                        ]}
                      >
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                    </Pressable>
                  );
                })}
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 12,
                width: "100%",
                marginTop: 10,
              }}
            >
              <Pressable
                style={[
                  styles.transferBtn,
                  { backgroundColor: "#EAE0D5", flex: 1 },
                ]}
                onPress={() => setShowTransferModal(false)}
              >
                <Text style={[styles.transferBtnText, { color: "#6E4D31" }]}>
                  取消
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.transferBtn,
                  { backgroundColor: "#5C3A21", flex: 1.5 },
                ]}
                onPress={() =>
                  executeLeaveGroup(
                    selectedGroupForTransfer.id,
                    selectedSuccessorId,
                  )
                }
                disabled={isLeaving}
              >
                <Text style={styles.transferBtnText}>
                  {isLeaving ? "處理中..." : "👑 移交並退出"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFDF9" },
  header: {
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E8DCD0",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#4A2E18" },
  searchWrap: { padding: 16 },
  searchBox: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F5EAE0",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8DCD0",
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: "#4A2E18" },
  listPadding: { paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1 },
  card: {
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E8DCD0",
    shadowColor: "#4A2E18",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  groupName: { fontSize: 16, fontWeight: "800", color: "#4A2E18" },
  rightIcons: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: { padding: 6 },
  icon: { fontSize: 18, color: "#4A2E18", fontWeight: "900" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 30,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: "#E8DCD0",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#D8CCC0",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetItem: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12 },
  sheetText: { fontSize: 16, fontWeight: "800", color: "#4A2E18" },
  sheetDivider: { height: 1, backgroundColor: "#E8DCD0" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 16, color: "#8B5A2B", fontWeight: "700" },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },
  loadingText: {
    marginTop: 6,
    fontSize: 17,
    color: "#8B5A2B",
    fontWeight: "800",
  },
  pendingBadge: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: "#F5EAE0",
    borderColor: "#8B5A2B",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pendingBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#5C3A21",
  },
  // 🌟 客製化摩卡棕 Modal 提示卡樣式
  popupCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8DCD0",
    shadowColor: "#4A2E18",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4A2E18",
    marginBottom: 8,
    textAlign: "center",
  },
  popupDesc: {
    fontSize: 13,
    color: "#6E4D31",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 18,
  },
  popupBtn: {
    width: "100%",
    height: 46,
    borderRadius: 10,
    backgroundColor: "#5C3A21",
    alignItems: "center",
    justifyContent: "center",
  },
  popupBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  // 🌟 移交接班人 Modal 專用摩卡棕樣式
  transferCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8DCD0",
    shadowColor: "#4A2E18",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  transferIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#EAE0D5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  successorList: { width: "100%", maxHeight: 180, marginBottom: 16, gap: 8 },
  successorItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#FFFDF9",
    borderWidth: 1.5,
    borderColor: "#E8DCD0",
  },
  successorItemActive: { backgroundColor: "#F5EAE0", borderColor: "#5C3A21" },
  smallAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EAE0D5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#D8CCC0",
  },
  avatarImage: { width: "100%", height: "100%", resizeMode: "cover" },
  smallAvatarText: { fontSize: 14, fontWeight: "800", color: "#6E4D31" },
  successorName: { flex: 1, fontSize: 15, fontWeight: "700", color: "#6E4D31" },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#D8CCC0",
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleActive: { borderColor: "#5C3A21" },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#5C3A21",
  },
  transferBtn: {
    height: 46,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  transferBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
