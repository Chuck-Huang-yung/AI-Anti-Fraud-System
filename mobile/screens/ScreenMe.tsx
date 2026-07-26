import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import liff from "@line/liff";
import axios from "axios";

// 💡 記得換成你最新的 Ngrok 網址
const API_URL = "https://5edb-220-130-167-166.ngrok-free.app";

const axiosConfig = {
  headers: {
    "ngrok-skip-browser-warning": "true",
    "Bypass-Tunnel-Reminder": "true",
  },
};

export default function ScreenMe() {
  const [systemUserId, setSystemUserId] = useState("");
  const [lineId, setLineId] = useState("讀取中...");
  const [nickname, setNickname] = useState("讀取中...");
  const [notificationsOff, setNotificationsOff] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 🌟 問題回報專用的狀態
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportText, setReportText] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalData, setOriginalData] = useState({
    nickname: "",
    lineId: "",
    notificationsOff: false,
    avatarUri: "",
  });

  // 🌟 客製化摩卡棕提示視窗專用狀態
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  // 🌟 專屬小助手函式，呼叫就會彈出漂亮視窗
  const showCustomAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertModalVisible(true);
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        await liff.init({ liffId: "2009712421-QF2zlOtI" });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setSystemUserId(profile.userId);

          const liffAvatar = profile.pictureUrl || "";
          const liffName = profile.displayName || "";

          if (liffAvatar) {
            setAvatarUri(liffAvatar);
          }

          const response = await axios.post(
            `${API_URL}/api/users/check`,
            {
              userId: profile.userId,
              nickname: liffName,
              pictureUrl: liffAvatar,
            },
            axiosConfig,
          );

          if (response.data && response.data.user) {
            const userData = response.data.user;
            const dbName = userData.nickname || liffName || "";
            const dbLineId = userData.line_id || "";
            const dbNotif = userData.notifications_off || false;
            const dbAvatar = userData.picture_url || liffAvatar || "";

            setNickname(dbName);
            setLineId(dbLineId);
            setNotificationsOff(dbNotif);
            if (dbAvatar) setAvatarUri(dbAvatar);

            setOriginalData({
              nickname: dbName,
              lineId: dbLineId,
              notificationsOff: dbNotif,
              avatarUri: dbAvatar,
            });
          } else {
            setNickname(liffName || "請設定暱稱");
            setLineId("請設定聯絡資訊");
          }
        }
      } catch (error: any) {
        console.error("載入使用者資料失敗:", error);
        const statusCode =
          error.response?.status || "無 (封包被攔截或網址失效)";
        showCustomAlert(
          "❌ 讀取資料失敗！",
          `狀態碼: ${statusCode}\n請檢查 Ngrok 網址或 Headers`,
        );
        setNickname("讀取失敗");
        setLineId("讀取失敗");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  useEffect(() => {
    if (!isLoading) {
      const isChanged =
        nickname !== originalData.nickname ||
        lineId !== originalData.lineId ||
        notificationsOff !== originalData.notificationsOff ||
        avatarUri !== originalData.avatarUri;

      setHasUnsavedChanges(isChanged);
    }
  }, [nickname, lineId, notificationsOff, avatarUri, originalData, isLoading]);

  const onChangeAvatar = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const pickedUri = result.assets[0].uri;
        setAvatarUri(pickedUri);
      }
    } catch (error) {
      console.log("選取失敗:", error);
      showCustomAlert("錯誤", "無法開啟相簿，請檢查相機/相簿權限。");
    }
  };

  const handleNotificationChange = (newValue: boolean) => {
    setNotificationsOff(newValue);
    setHasUnsavedChanges(true);

    if (newValue === true) {
      showCustomAlert(
        "貼心提醒",
        "⚠️ 關閉通知將會收不到系統任何訊息，包含群組通知！",
      );
    }
  };

  const onSaveChanges = async () => {
    const name = nickname.trim();
    const contact = lineId.trim();

    if (!systemUserId) return showCustomAlert("錯誤", "無法取得系統ID");
    if (!name) return showCustomAlert("提示", "暱稱不能為空");

    setIsLoading(true);
    try {
      await axios.post(
        `${API_URL}/api/users/update`,
        {
          userId: systemUserId,
          nickname: name,
          lineId: contact,
          notificationsOff: notificationsOff,
          pictureUrl: avatarUri,
        },
        axiosConfig,
      );
      showCustomAlert("成功", "個人設定與通知權限已成功更新！");
      setOriginalData({
        nickname: name,
        lineId: contact,
        notificationsOff: notificationsOff,
        avatarUri: avatarUri || "",
      });
    } catch (error) {
      console.error("更新失敗:", error);
      showCustomAlert("錯誤", "更新失敗，請稍後再試。");
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmitReport = async () => {
    const content = reportText.trim();
    if (!content) {
      return showCustomAlert("提示", "請先輸入您想回報的問題或建議喔！");
    }

    if (!systemUserId) {
      return showCustomAlert("錯誤", "無法取得您的用戶 ID，請重新開啟 App");
    }

    setIsSubmittingReport(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/reports`,
        {
          userId: systemUserId,
          userName: nickname || "未命名用戶",
          text: content,
        },
        axiosConfig,
      );

      if (res.data && res.data.success) {
        setReportModalVisible(false);
        setReportText("");
        showCustomAlert(
          "送出成功",
          "✅ 感謝您的回報！我們已收到您的反饋並會儘速優化系統。",
        );
      }
    } catch (error: any) {
      console.error("回報發送失敗:", error);
      const statusCode = error.response?.status || "無 (網路異常)";
      showCustomAlert(
        "❌ 送出失敗",
        `伺服器暫時無法連線 (狀態碼: ${statusCode})`,
      );
    } finally {
      setIsSubmittingReport(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={{ width: 50 }} />
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>個人設定</Text>
        </View>
        <Pressable
          onPress={() => setReportModalVisible(true)}
          style={styles.reportPillBtn}
          hitSlop={10}
        >
          <Text style={{ fontSize: 20 }}>🛠️</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={onChangeAvatar} style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            {isLoading ? (
              <ActivityIndicator color="#5C3A21" />
            ) : avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarFull} />
            ) : (
              <View style={styles.avatarPlaceholder} />
            )}
          </View>
          <Text style={styles.avatarLabel}>修改頭像</Text>
        </Pressable>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.rowLabel}>修改暱稱</Text>
        </View>
        <TextInput
          value={nickname}
          onChangeText={(text) => {
            setNickname(text);
            setHasUnsavedChanges(true);
          }}
          style={[
            styles.input,
            Platform.OS === "web" && ({ outlineStyle: "none" } as any),
          ]}
          placeholder="輸入暱稱"
          placeholderTextColor="#A8927D"
        />

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Line ID / 其他聯絡資訊</Text>
        </View>
        <Text style={styles.hintMuted}>(可自行選擇填寫)</Text>
        <TextInput
          value={lineId}
          onChangeText={(text) => {
            setLineId(text);
            if (text.trim() === "") {
              showCustomAlert(
                "貼心提醒",
                "🔔建議填寫🔔\n提供聯絡資訊能快速讓群組家人知道您是誰喔",
              );
            }
          }}
          style={[
            styles.input,
            Platform.OS === "web" && ({ outlineStyle: "none" } as any),
          ]}
          placeholder="例如: 0912345678"
          placeholderTextColor="#A8927D"
        />

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.rowLabel}>是否關閉通知</Text>
          <OX value={notificationsOff} onChange={handleNotificationChange} />
        </View>
        <Text style={styles.hintMuted}>
          {notificationsOff ? "通知已關閉" : "通知已開啟"}
        </Text>

        {hasUnsavedChanges && (
          <Text
            style={{
              color: "#C62828",
              fontSize: 13,
              fontWeight: "800",
              textAlign: "center",
              marginTop: 15,
            }}
          >
            ⚠️ 溫馨提醒：資料有異動，記得點擊下方按鈕儲存變更喔！
          </Text>
        )}

        <Pressable onPress={onSaveChanges} style={styles.saveBtn}>
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.saveBtnText}>儲存變更</Text>
          )}
        </Pressable>
      </ScrollView>

      {/* 🌟 系統問題與建議回報 - 獨立彈跳視窗 */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💬 問題與建議回報</Text>
              <Pressable
                onPress={() => {
                  setReportModalVisible(false);
                  setReportText("");
                }}
                style={styles.closeBtn}
                hitSlop={10}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.modalDesc}>
              在使用防詐 App 時有遇到任何 Bug 或想法嗎？歡迎直接告訴我們！
            </Text>

            <TextInput
              value={reportText}
              onChangeText={setReportText}
              style={[
                styles.modalInput,
                Platform.OS === "web" && ({ outlineStyle: "none" } as any),
              ]}
              placeholder="請詳細描述您遇到的問題或操作建議..."
              placeholderTextColor="#A8927D"
              multiline
              numberOfLines={4}
            />

            <View style={styles.modalBtnGroup}>
              <Pressable
                onPress={() => setReportModalVisible(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>取消</Text>
              </Pressable>

              <Pressable
                onPress={onSubmitReport}
                disabled={isSubmittingReport}
                style={[
                  styles.submitModalBtn,
                  isSubmittingReport && { opacity: 0.6 },
                ]}
              >
                {isSubmittingReport ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.submitModalBtnText}>送出</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 🌟 摩卡棕客製化系統提示視窗 (按鈕徹底獨立，絕對不再變扁！) */}
      <Modal
        visible={alertModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAlertModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalCard, { maxWidth: 300, alignItems: "center" }]}
          >
            <Text
              style={[
                styles.modalTitle,
                { fontSize: 18, marginBottom: 10, textAlign: "center" },
              ]}
            >
              {alertTitle}
            </Text>
            <Text
              style={[
                styles.modalDesc,
                { textAlign: "center", marginBottom: 20 },
              ]}
            >
              {alertMessage}
            </Text>

            {/* 💡 徹底脫離舊樣式，直接獨立設定為 46px 固定高度與 100% 寬度 */}
            <Pressable
              onPress={() => setAlertModalVisible(false)}
              style={{
                width: "100%",
                height: 46,
                borderRadius: 10,
                backgroundColor: "#5C3A21",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 4,
              }}
            >
              <Text style={styles.submitModalBtnText}>確定</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function OX({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.oxWrap}>
      <Pressable
        onPress={() => onChange(true)}
        style={[styles.oxBtn, value && styles.oxBtnActive]}
      >
        <Text style={[styles.oxText, value && styles.oxTextActive]}>○</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange(false)}
        style={[styles.oxBtn, !value && styles.oxBtnActive]}
      >
        <Text style={[styles.oxText, !value && styles.oxTextActive]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFDF9" },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E8DCD0",
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4A2E18",
    textAlign: "center",
  },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 40 },
  avatarSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 10,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#EAE0D5",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E8DCD0",
  },
  avatarFull: { width: "100%", height: "100%", resizeMode: "cover" },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#EAE0D5",
  },
  avatarLabel: { fontSize: 14, fontWeight: "800", color: "#8B5A2B" },
  row: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: { fontSize: 16, fontWeight: "800", color: "#4A2E18" },
  divider: { height: 1, backgroundColor: "#E8DCD0" },
  input: {
    height: 52,
    borderRadius: 10,
    backgroundColor: "#F5EAE0",
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#4A2E18",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E8DCD0",
  },
  hint: {
    marginTop: -6,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "800",
    color: "#4A2E18",
  },
  hintMuted: {
    marginTop: -6,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "800",
    color: "#8B5A2B",
  },
  oxWrap: { flexDirection: "row", gap: 10, alignItems: "center" },
  oxBtn: {
    width: 44,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EAE0D5",
    alignItems: "center",
    justifyContent: "center",
  },
  oxBtnActive: { backgroundColor: "#5C3A21" },
  oxText: { fontSize: 18, fontWeight: "900", color: "#4A2E18" },
  oxTextActive: { color: "#FFFFFF" },
  saveBtn: {
    height: 52,
    borderRadius: 10,
    backgroundColor: "#5C3A21",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    shadowColor: "#4A2E18",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  saveBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  reportIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EAE0D5",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E8DCD0",
    shadowColor: "#4A2E18",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#4A2E18",
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 18,
    color: "#8B5A2B",
    fontWeight: "600",
  },
  modalDesc: {
    fontSize: 13,
    color: "#6E4D31",
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    height: 110,
    borderRadius: 12,
    backgroundColor: "#F5EAE0",
    borderWidth: 1,
    borderColor: "#E8DCD0",
    padding: 12,
    fontSize: 14,
    color: "#4A2E18",
    textAlignVertical: "top",
    marginBottom: 20,
  },
  modalBtnGroup: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#EAE0D5",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#6E4D31",
  },
  submitModalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#5C3A21",
    alignItems: "center",
    justifyContent: "center",
  },
  submitModalBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  reportPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAE0D5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D8CCC0",
    gap: 4,
  },
});
