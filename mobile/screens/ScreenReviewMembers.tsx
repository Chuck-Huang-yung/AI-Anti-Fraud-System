import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  SafeAreaView,
  Platform,
  Image,
  Modal,
} from "react-native";
import axios from "axios";

// 💡 請確認這裡是你當下最新的 API 網址[cite: 7]
const API_URL = "https://56ba-220-130-167-166.ngrok-free.app";

export default function ScreenReviewMembers({ navigation, route }: any) {
  const group = route.params?.group || {};

  // 🌟 統一使用 pendingList 變數名稱！[cite: 7]
  const [pendingList, setPendingList] = useState<any[]>(
    group.pendingMembers || group.pending_members || [],
  );

  // 🌟 升級版：支援「取消/拒絕」雙按鈕與自訂顏色的摩卡棕客製化提示狀態
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupData, setPopupData] = useState<{
    icon: string;
    title: string;
    message: string;
    btnText: string;
    showCancel?: boolean;
    cancelText?: string;
    confirmColor?: string;
    onConfirm: () => void;
  }>({
    icon: "💡",
    title: "",
    message: "",
    btnText: "確定",
    showCancel: false,
    cancelText: "取消",
    confirmColor: "#5C3A21",
    onConfirm: () => {},
  });

  // 🌟 觸發摩卡棕視窗的小幫手
  const showPopup = (
    icon: string,
    title: string,
    message: string,
    onConfirmAction?: () => void,
    btnText = "確定",
    showCancel = false,
    cancelText = "取消",
    confirmColor = "#5C3A21",
  ) => {
    setPopupData({
      icon,
      title,
      message,
      btnText,
      showCancel,
      cancelText,
      confirmColor,
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

  const onConfirm = async (req: any, approve: boolean) => {
    const action = approve ? "通過" : "拒絕";
    const endpoint = approve
      ? "/api/groups/review/approve"
      : "/api/groups/review/reject";

    const executeReview = async () => {
      try {
        const res = await axios.post(
          `${API_URL}${endpoint}`,
          {
            groupId: group.id,
            targetUserId: req.userId,
            operatorId: "admin",
          },
          {
            headers: {
              "ngrok-skip-browser-warning": "true",
              "Bypass-Tunnel-Reminder": "true",
            },
          },
        );

        if (res.data && res.data.success) {
          const msg = approve
            ? `已成功允許「${req.userName}」加入群組！`
            : `已拒絕「${req.userName}」的申請。`;

          // 💡 成功操作改為漂亮摩卡棕單按鈕提示
          showPopup("✅", "審核成功", msg);

          // 💡 立即從畫面上移除該名成員[cite: 7]
          const updated = pendingList.filter((m) => m.userId !== req.userId);
          setPendingList(updated);

          // 如果已經沒人要審核了，800毫秒後自動退回首頁[cite: 7]
          if (updated.length === 0) {
            setTimeout(() => navigation.goBack(), 800);
          }
        }
      } catch (err) {
        console.error("審核失敗:", err);
        showAlert("錯誤", "連線伺服器失敗，無法完成審核");
      }
    };

    // 🌟 將確認對話框升級為客製化摩卡棕雙按鈕Modal
    showPopup(
      approve ? "🤝" : "⛔",
      "審核操作確認",
      `確定要 ${action} 「${req.userName}」的加入申請嗎？`,
      executeReview,
      `確定${action}`,
      true, // 顯示取消按鈕
      "再想想",
      approve ? "#5C3A21" : "#C62828", // 通過為深棕，拒絕為警示紅
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 🌟 客製化摩卡棕彈出提示卡 (支援雙按鈕與右上角叉叉關閉) */}
      <Modal
        visible={popupVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPopupVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.popupCard}>
            {/* 💡 右上角關閉叉叉 */}
            <Pressable
              onPress={() => setPopupVisible(false)}
              style={styles.popupCloseIcon}
              hitSlop={15}
            >
              <Text
                style={{ fontSize: 20, color: "#8B5A2B", fontWeight: "800" }}
              >
                ✕
              </Text>
            </Pressable>

            <Text style={{ fontSize: 32, marginBottom: 10 }}>
              {popupData.icon}
            </Text>
            <Text style={styles.popupTitle}>{popupData.title}</Text>
            <Text style={styles.popupDesc}>{popupData.message}</Text>

            {/* 💡 智慧判斷：需要拒絕/取消時顯示雙按鈕，否則維持單一確定鈕 */}
            <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
              {popupData.showCancel && (
                <Pressable
                  onPress={() => setPopupVisible(false)}
                  style={[
                    styles.popupBtn,
                    { backgroundColor: "#EAE0D5", flex: 1 },
                  ]}
                >
                  <Text style={[styles.popupBtnText, { color: "#6E4D31" }]}>
                    {popupData.cancelText || "取消"}
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={popupData.onConfirm}
                style={[
                  styles.popupBtn,
                  {
                    backgroundColor: popupData.confirmColor || "#5C3A21",
                    flex: popupData.showCancel ? 1.3 : 1,
                  },
                ]}
              >
                <Text style={styles.popupBtnText}>{popupData.btnText}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={20}
        >
          <Text style={styles.backIcon}>〈</Text>
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>新成員申請審核</Text>
          <Text style={styles.subtitle}>
            共有 {pendingList.length} 位待處理
          </Text>
        </View>

        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={pendingList}
        keyExtractor={(item, index) => item.userId || `pending-${index}`}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.requestCard}>
            <View style={styles.userInfo}>
              <View style={styles.avatar}>
                {item.pictureUrl ? (
                  <Image
                    source={{ uri: item.pictureUrl }}
                    style={styles.avatarImg}
                  />
                ) : (
                  <Text style={styles.avatarText}>
                    {(item.userName || "未").charAt(0)}
                  </Text>
                )}
              </View>
              <View style={styles.textDetails}>
                <Text style={styles.userName}>
                  {item.userName || "未命名申請人"}
                </Text>
                {/* 🌟 優化點：如果用戶有設定自訂 lineId 且不是 "未填寫"，優先顯示 Line ID；否則顯示系統 User ID */}
                <Text style={styles.userId} selectable>
                  {item.lineId && item.lineId !== "未填寫" && item.lineId !== ""
                    ? `Line ID: ${item.lineId}`
                    : `User ID: ${item.userId || "未知"}`}
                </Text>
              </View>
            </View>

            <View style={styles.btnGroup}>
              <Pressable
                onPress={() => onConfirm(item, false)}
                style={styles.rejectBtn}
              >
                <Text style={styles.rejectBtnText}>拒絕</Text>
              </Pressable>

              <Pressable
                onPress={() => onConfirm(item, true)}
                style={styles.approveBtn}
              >
                <Text style={styles.approveBtnText}>通過</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.empty}>目前沒有待審核的申請</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFDF9" },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFDF9",
    borderBottomWidth: 1,
    borderBottomColor: "#E8DCD0",
    paddingHorizontal: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: { fontSize: 22, fontWeight: "700", color: "#4A2E18" },
  headerTitleWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4A2E18",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8B5A2B",
    marginTop: 2,
    textAlign: "center",
  },
  listContent: { padding: 16, paddingBottom: 30 },
  requestCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E8DCD0",
    shadowColor: "#4A2E18",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  userInfo: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EAE0D5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D8CCC0",
  },
  avatarImg: { width: "100%", height: "100%", resizeMode: "cover" },
  avatarText: { fontSize: 18, fontWeight: "800", color: "#5C3A21" },
  textDetails: { marginLeft: 12, flex: 1 },
  userName: { fontSize: 17, fontWeight: "800", color: "#4A2E18" },
  userId: { fontSize: 13, fontWeight: "600", color: "#8B5A2B", marginTop: 2 },
  btnGroup: {
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#F5EAE0",
    paddingTop: 14,
  },
  approveBtn: {
    flex: 1,
    height: 46,
    backgroundColor: "#5C3A21",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4A2E18",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  approveBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  rejectBtn: {
    flex: 1,
    height: 46,
    backgroundColor: "#FDF2F2",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#EF4444",
  },
  rejectBtnText: { color: "#C62828", fontWeight: "800", fontSize: 15 },
  emptyBox: { alignItems: "center", justifyContent: "center", marginTop: 100 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  empty: { fontSize: 16, color: "#8B5A2B", fontWeight: "700" },

  // 🌟 客製化摩卡棕 Modal 提示卡樣式
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  popupCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    paddingTop: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8DCD0",
    shadowColor: "#4A2E18",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    position: "relative",
  },
  popupCloseIcon: {
    position: "absolute",
    top: 14,
    right: 16,
    padding: 4,
    zIndex: 10,
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
});
