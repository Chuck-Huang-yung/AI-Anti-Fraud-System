import React, { useMemo, useState, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  Image,
  Alert,
  Modal,
} from "react-native";
import liff from "@line/liff";
import axios from "axios";

// 💡 記得確認為你當前最新的 API 網址
const API_URL = "https://5edb-220-130-167-166.ngrok-free.app";
const STORAGE_KEY_HIDE_ALERT = "@hide_one_person_group_alert_v1";

type GroupItem = { id: string; name: string; muted: boolean };
type Member = {
  id?: string;
  userId?: string;
  name?: string;
  userName?: string;
  avatarUri?: string;
  pictureUrl?: string;
  role?: "管理員" | "成員";
  status?: "正常" | "可疑";
  lineId?: string;
  createdAt?: string;
};

export default function ScreenMemberList({ navigation, route }: any) {
  const group: GroupItem = route.params?.group || { name: "未知群組" };
  const [myProfile, setMyProfile] = useState<{
    userId: string;
    pictureUrl: string;
    displayName?: string;
    hideAlert?: boolean;
  } | null>(null);

  const [membersList, setMembersList] = useState<Member[]>(
    Array.isArray(route.params?.group?.members)
      ? route.params.group.members
      : [],
  );

  const [showOnePersonModal, setShowOnePersonModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // 🌟 名片卡 Modal 專用狀態
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const members: Member[] = useMemo(() => {
    return Array.isArray(route.params?.group?.members)
      ? route.params.group.members
      : [];
  }, [route.params?.group?.members]);

  // 🌟 新增：通用摩卡棕提示窗狀態（支援雙按鈕與右上角大叉叉）
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertData, setAlertData] = useState<{
    icon: string;
    title: string;
    message: string;
    btnText: string;
    showCancel?: boolean;
    confirmColor?: string;
    onConfirm: () => void;
  }>({
    icon: "💡",
    title: "",
    message: "",
    btnText: "確定",
    showCancel: false,
    confirmColor: "#5C3A21",
    onConfirm: () => {},
  });

  // 🌟 專屬提示窗小幫手
  const showCustomAlert = (
    icon: string,
    title: string,
    message: string,
    onConfirmAction?: () => void,
    showCancel = false,
    btnText = "確定",
    confirmColor = "#5C3A21",
  ) => {
    setAlertData({
      icon,
      title,
      message,
      btnText,
      showCancel,
      confirmColor,
      onConfirm: () => {
        setAlertVisible(false);
        if (onConfirmAction) onConfirmAction();
      },
    });
    setAlertVisible(true);
  };

  // 🌟 暴力測試版：播放溫馨提示音
  const playGentleAlertSound = () => {
    console.log("🔊 準備播放音效... Platform 狀態:", Platform.OS);

    if (Platform.OS === "web") {
      try {
        // 💡 確保使用當前網域的絕對路徑
        const audioUrl = window.location.origin + "/alert.mp3";
        console.log("🎵 嘗試讀取的音檔網址:", audioUrl);

        const alarmSound = new Audio(audioUrl);

        // 💡 測試階段先開到最大聲
        alarmSound.volume = 1.0;

        let playPromise = alarmSound.play();

        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("✅ 音效順利播放中！");
            })
            .catch((err) => {
              console.log("❌ 音效被阻擋或發生錯誤：", err);
            });
        }
      } catch (err) {
        console.log("❌ 音效物件建立失敗:", err);
      }
    }
  };

  useEffect(() => {
    const fetchMyLiffProfile = async () => {
      try {
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();

          // 🌟 順便去後端問一下：這個用戶在資料庫裡，是不是已經勾過「不再顯示」了？
          let dbHideAlert = false;
          try {
            const res = await axios.get(
              `${API_URL}/api/users/${profile.userId}`,
              {
                headers: {
                  "ngrok-skip-browser-warning": "true",
                  "Bypass-Tunnel-Reminder": "true",
                },
              },
            );
            if (res.data && res.data.success) {
              // 假設後端回傳的欄位叫做 hide_one_person_alert (或 hideAlert)
              dbHideAlert = !!res.data.user?.hide_one_person_alert;
            }
          } catch (e) {
            console.log("向資料庫查詢用戶設定失敗，預設為不隱藏:", e);
          }

          setMyProfile({
            userId: profile.userId,
            pictureUrl: profile.pictureUrl || "",
            displayName: profile.displayName,
            hideAlert: dbHideAlert, // 💡 把資料庫的狀態記在手機記憶體裡
          });
        }
      } catch (err) {
        console.log("取得當前用戶頭像失敗:", err);
      }
    };
    fetchMyLiffProfile();
  }, []);

  useEffect(() => {
    // 🌟 如果群組只有 1 個人，且「當前用戶存在」＋「資料庫裡沒勾過隱藏」，才跳出視窗！
    if (members.length === 1 && myProfile && !myProfile.hideAlert) {
      setShowOnePersonModal(true);
    }
  }, [members.length, myProfile]);

  const handleCloseModal = async () => {
    if (dontShowAgain && myProfile?.userId) {
      // 1. 樂觀更新 (Optimistic UI)：當下記憶體先改為 true，這一趟絕對不會再跳出來！
      setMyProfile((prev) => (prev ? { ...prev, hideAlert: true } : null));

      // 2. 背景默默發送請求，把設定永久寫入 PostgreSQL 資料庫！
      try {
        await axios.post(
          `${API_URL}/api/users/update-alert-setting`,
          {
            userId: myProfile.userId,
            hideAlert: true,
          },
          {
            headers: {
              "ngrok-skip-browser-warning": "true",
              "Bypass-Tunnel-Reminder": "true",
            },
          },
        );
        console.log("✅ 成功將「不再顯示」設定寫入資料庫！");
      } catch (e) {
        console.log("❌ 寫入資料庫失敗:", e);
      }
    }
    setShowOnePersonModal(false);
  };

  const onBack = () => navigation.goBack();

  return (
    <SafeAreaView style={styles.safe}>
      {/* 🌟 1. 摩卡棕個人名片卡 Modal (Business Card) */}
      <Modal
        visible={!!selectedMember}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedMember(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedMember(null)}
        >
          <Pressable
            style={styles.cardModal}
            onPress={(e) => e.stopPropagation()}
          >
            {/* 右上角關閉叉叉 */}
            <Pressable
              style={styles.cardCloseIcon}
              onPress={() => setSelectedMember(null)}
              hitSlop={15}
            >
              <Text
                style={{ fontSize: 20, color: "#FFFFFF", fontWeight: "800" }}
              >
                ✕
              </Text>
            </Pressable>

            {/* 頂部裝飾背景 */}
            <View style={styles.cardHeaderBg} />

            {/* 大頭照 */}
            <View style={styles.cardAvatarWrap}>
              {selectedMember?.pictureUrl || selectedMember?.avatarUri ? (
                <Image
                  source={{
                    uri: selectedMember.pictureUrl || selectedMember.avatarUri,
                  }}
                  style={styles.cardAvatarImg}
                />
              ) : (
                <Text style={styles.cardAvatarText}>
                  {(
                    selectedMember?.userName ||
                    selectedMember?.name ||
                    "未"
                  ).charAt(0)}
                </Text>
              )}
            </View>

            {/* 用戶稱號與名字 */}
            <Text style={styles.cardName}>
              {selectedMember?.userName || selectedMember?.name || "未命名成員"}
            </Text>
            <View style={styles.cardRoleTag}>
              <Text style={styles.cardRoleText}>
                {selectedMember?.role || "成員"}
              </Text>
            </View>

            {/* 詳細資料區塊 */}
            <View style={styles.cardInfoBox}>
              <View style={styles.cardInfoRow}>
                <Text style={styles.cardInfoLabel}>系統 User ID</Text>
                <Text
                  style={[
                    styles.cardInfoValue,
                    { fontSize: 12, color: "#8B5A2B" },
                  ]}
                  selectable
                >
                  {selectedMember?.userId || selectedMember?.id || "未知"}
                </Text>
              </View>

              <View style={styles.cardDivider} />
              <View style={styles.cardInfoRow}>
                <Text style={styles.cardInfoLabel}>聯絡 Line ID</Text>
                <Text style={styles.cardInfoValue} selectable>
                  {selectedMember?.lineId || "未設定"}
                </Text>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.cardInfoRow}>
                <Text style={styles.cardInfoLabel}>加入日期</Text>
                <Text style={styles.cardInfoValue}>
                  {selectedMember?.createdAt || "2026-01-01"}
                </Text>
              </View>
            </View>

            {/* 關閉按鈕 */}
            <Pressable
              style={styles.cardCloseBtn}
              onPress={() => setSelectedMember(null)}
            >
              <Text style={styles.cardCloseBtnText}>關閉名片</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 🌟 2. 摩卡棕單人群組提示 Modal */}
      <Modal
        visible={showOnePersonModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* 右上角關閉叉叉 */}
            <Pressable
              style={styles.modalCloseIcon}
              onPress={handleCloseModal}
              hitSlop={15}
            >
              <Text
                style={{ fontSize: 20, color: "#8B5A2B", fontWeight: "800" }}
              >
                ✕
              </Text>
            </Pressable>

            <View style={styles.modalIconBg}>
              <Text style={styles.modalIcon}>💡</Text>
            </View>
            <Text style={styles.modalTitle}>防詐警報觸發規則</Text>
            <Text style={styles.modalText}>
              目前群組內只有您 1 個人喔！{"\n\n"}
              為了避免個人測試干擾，系統設定{" "}
              <Text style={{ fontWeight: "800", color: "#C62828" }}>
                需 2 人（含）以上在同個群組
              </Text>
              ，收到可疑訊息時才會啟動「緊急通報與奪命連環鬧鐘」。{"\n\n"}
              快去點擊下方「邀請至群組」，拉家人一起進來防詐吧！🛡️
            </Text>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => setDontShowAgain(!dontShowAgain)}
            >
              <View
                style={[
                  styles.checkbox,
                  dontShowAgain && styles.checkboxChecked,
                ]}
              >
                {dontShowAgain && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>不再顯示此提醒</Text>
            </Pressable>

            <Pressable style={styles.modalBtn} onPress={handleCloseModal}>
              <Text style={styles.modalBtnText}>我知道了</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack} hitSlop={20}>
          <Text style={styles.backIcon}>〈</Text>
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{group.name}</Text>
        </View>
        <View style={styles.rightPlaceholder} />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.subTitle}>群組成員 ({members.length})</Text>
      </View>

      <FlatList
        data={membersList}
        keyExtractor={(item, index) =>
          item.userId || item.id || `member-${index}`
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <Text style={{ color: "#8B5A2B", fontWeight: "700" }}>
              目前尚無成員資料
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const displayName = item.userName || item.name || "未命名成員";
          const role = item.role || "成員";
          const status = item.status || "正常";

          let avatar = item.avatarUri || item.pictureUrl;
          if (!avatar && myProfile && item.userId === myProfile.userId) {
            avatar = myProfile.pictureUrl;
          }

          return (
            <Pressable
              style={styles.memberCard}
              onPress={() => setSelectedMember({ ...item, pictureUrl: avatar })}
            >
              <View style={styles.avatar}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{displayName.charAt(0)}</Text>
                )}
              </View>

              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{displayName}</Text>
                <Text style={styles.memberRole}>{role}</Text>
              </View>

              <Pressable
                onPress={async (e) => {
                  e.stopPropagation();
                  if (status !== "可疑") {
                    const msg = `${displayName} 目前防詐狀態良好，沒有異常警報喔！`;
                    return showCustomAlert("🛡️", "狀態正常", msg);
                  }

                  // 🌟 【資安鐵門：防範被害人自行解除】
                  // 檢查「當前登入的使用者 (myProfile?.userId)」是否等於「被點擊的這位成員 (item.userId 或 item.id)」
                  const currentUid = (myProfile?.userId || "")
                    .trim()
                    .toLowerCase();
                  const targetUid = (item.userId || item.id || "")
                    .trim()
                    .toLowerCase();

                  if (currentUid && targetUid && currentUid === targetUid) {
                    console.log("⛔ [前端資安攔截] 當事人試圖自行解除警報！");
                    playGentleAlertSound();
                    return showCustomAlert(
                      "⛔",
                      "安全防護機制",
                      "為避免當事人受騙在受騙下自行關閉通報，系統嚴格禁止當事人「自行解除」可疑警報！\n\n⚠️ 請務必聯繫群組內的「其他家人」確認您的安全後，由家人幫您點擊按鈕解除狀態。",
                      undefined,
                      false, // 不顯示取消按鈕
                      "我知道了",
                      "#C62828", // 警示紅色彩
                    );
                  }

                  const confirmMessage = `確定要解除「${displayName}」的可疑警報，將狀態回復為正常嗎？\n\n💡 點擊確認後，系統將同時停止該成員的警報！`;

                  const executeReset = async () => {
                    try {
                      const me = membersList.find(
                        (m) =>
                          (m.userId || m.id || "").toLowerCase() === currentUid,
                      );
                      const myNickname =
                        me?.userName ||
                        me?.name ||
                        myProfile?.displayName ||
                        "某位家人";
                      const res = await axios.post(
                        `${API_URL}/api/groups/reset-status`,
                        {
                          groupId: group.id,
                          targetUserId: item.userId || item.id,
                          operatorName: myNickname,
                          // 🌟 把當前操作者 ID 一併傳給後端做雙重校驗
                          operatorId: myProfile?.userId,
                        },
                        {
                          headers: {
                            "ngrok-skip-browser-warning": "true",
                            "Bypass-Tunnel-Reminder": "true",
                          },
                        },
                      );

                      if (res.data && res.data.success) {
                        const successMsg = `🎉 已成功將「${displayName}」調回正常綠燈，並終止連環通報！`;
                        showCustomAlert("🎉", "警報已解除", successMsg);

                        setMembersList((prevList) =>
                          prevList.map((m) =>
                            (m.userId || m.id || "").toLowerCase() === targetUid
                              ? { ...m, status: "正常" }
                              : m,
                          ),
                        );
                      }
                    } catch (err: any) {
                      // 🌟 萬一後端回傳 403 阻擋，直接把錯誤訊息跳出來
                      const errMsg =
                        err.response?.data?.error ||
                        "連線伺服器失敗，無法解除警報";
                      showCustomAlert("⛔", "操作受阻", errMsg);
                    }
                  };

                  showCustomAlert(
                    "🛡️",
                    "解除可疑警報確認",
                    confirmMessage,
                    executeReset,
                    true, // 開啟取消按鈕
                    "✓ 確認解除",
                    "#5C3A21",
                  );
                }}
                style={[
                  styles.statusTag,
                  status === "可疑" ? styles.statusAlert : styles.statusNormal,
                  status === "可疑" && {
                    borderWidth: 1.5,
                    borderColor: "#C62828",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    status === "可疑"
                      ? styles.statusTextAlert
                      : styles.statusTextNormal,
                  ]}
                >
                  {status === "可疑" ? "⚠ 可疑 (點此解除)" : "✓ 正常"}
                </Text>
              </Pressable>
            </Pressable>
          );
        }}
      />
      {/* 🌟 3. 通用客製化摩卡棕彈出卡片 (帶有右上角大叉叉與雙按鈕) */}
      <Modal
        visible={alertVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAlertVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalCard, { paddingTop: 24, position: "relative" }]}
          >
            {/* 💡 右上角大叉叉 */}
            <Pressable
              onPress={() => setAlertVisible(false)}
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
              {alertData.icon}
            </Text>
            <Text style={styles.modalTitle}>{alertData.title}</Text>
            <Text style={styles.modalText}>{alertData.message}</Text>

            <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
              {alertData.showCancel && (
                <Pressable
                  onPress={() => setAlertVisible(false)}
                  style={[
                    styles.modalBtn,
                    { backgroundColor: "#EAE0D5", flex: 1 },
                  ]}
                >
                  <Text style={[styles.modalBtnText, { color: "#6E4D31" }]}>
                    取消
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={alertData.onConfirm}
                style={[
                  styles.modalBtn,
                  {
                    backgroundColor: alertData.confirmColor || "#5C3A21",
                    flex: alertData.showCancel ? 1.3 : 1,
                  },
                ]}
              >
                <Text style={styles.modalBtnText}>{alertData.btnText}</Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#4A2E18" },
  rightPlaceholder: { width: 44 },
  sectionHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  subTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#8B5A2B",
    letterSpacing: 0.5,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 30 },
  separator: { height: 12 },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8DCD0",
    ...Platform.select({
      ios: {
        shadowColor: "#4A2E18",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 2px 6px rgba(74,46,24,0.08)" } as any,
    }),
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#EAE0D5",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D8CCC0",
  },
  avatarImage: { width: "100%", height: "100%", resizeMode: "cover" },
  avatarText: { fontSize: 18, fontWeight: "800", color: "#5C3A21" },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberName: { fontSize: 16, fontWeight: "800", color: "#4A2E18" },
  memberRole: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8B5A2B",
    marginTop: 2,
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusNormal: { backgroundColor: "#F0F9F4", borderColor: "#2E7D32" },
  statusAlert: { backgroundColor: "#FDF2F2", borderColor: "#C62828" },
  statusText: { fontSize: 12, fontWeight: "800" },
  statusTextNormal: { color: "#2E7D32" },
  statusTextAlert: { color: "#C62828" },

  // 🌟 摩卡棕名片卡 Modal 專屬 CSS
  cardModal: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    alignItems: "center",
    overflow: "hidden",
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: "#E8DCD0",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#4A2E18",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
      web: { boxShadow: "0px 15px 35px rgba(74,46,24,0.18)" } as any,
    }),
  },
  cardCloseIcon: {
    position: "absolute",
    top: 14,
    right: 16,
    padding: 4,
    zIndex: 10,
  },
  cardHeaderBg: {
    width: "100%",
    height: 70,
    backgroundColor: "#5C3A21", // 頂部替換為經典深焙摩卡棕
  },
  cardAvatarWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginTop: -42,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#4A2E18",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  cardAvatarImg: { width: 76, height: 76, borderRadius: 38 },
  cardAvatarText: { fontSize: 32, fontWeight: "800", color: "#5C3A21" },
  cardName: {
    fontSize: 20,
    fontWeight: "900",
    color: "#4A2E18",
    marginTop: 10,
  },
  cardRoleTag: {
    backgroundColor: "#F5EAE0",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E8DCD0",
  },
  cardRoleText: { fontSize: 12, fontWeight: "800", color: "#5C3A21" },
  cardInfoBox: {
    width: "88%",
    backgroundColor: "#FFFDF9",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E8DCD0",
    marginBottom: 20,
  },
  cardInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  cardInfoLabel: { fontSize: 13, fontWeight: "700", color: "#8B5A2B" },
  cardInfoValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#4A2E18",
    maxWidth: 160,
  },
  cardDivider: { height: 1, backgroundColor: "#E8DCD0" } as any,
  cardCloseBtn: {
    width: "88%",
    height: 46,
    backgroundColor: "#5C3A21",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cardCloseBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },

  // 🌟 摩卡棕單人提示 Modal 與共用樣式
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8DCD0",
    position: "relative",
    ...Platform.select({
      ios: {
        shadowColor: "#4A2E18",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0px 10px 25px rgba(74,46,24,0.12)" } as any,
    }),
  },
  modalCloseIcon: {
    position: "absolute",
    top: 14,
    right: 16,
    padding: 4,
    zIndex: 10,
  },
  modalIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#EAE0D5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalIcon: { fontSize: 28 },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4A2E18",
    marginBottom: 12,
    textAlign: "center",
  },
  modalText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6E4D31",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 20,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D8CCC0",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    backgroundColor: "#FFFDF9",
  },
  checkboxChecked: { backgroundColor: "#5C3A21", borderColor: "#5C3A21" },
  checkmark: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  checkboxLabel: { fontSize: 14, fontWeight: "700", color: "#6E4D31" },
  modalBtn: {
    width: "100%",
    height: 46,
    backgroundColor: "#5C3A21",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
