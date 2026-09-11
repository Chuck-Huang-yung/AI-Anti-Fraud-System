import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  SafeAreaView,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal, // 🌟 記得引入 Modal
} from "react-native";
import liff from "@line/liff";
import axios from "axios";
import { useGroups } from "../context/GroupContext";

// 💡 記得替換成你目前最新的 ngrok 網址
const API_URL = "https://7e20-118-163-112-61.ngrok-free.app";

// 🌟 穿透 ngrok/localtunnel 的通關密語
const axiosConfig = {
  headers: {
    "ngrok-skip-browser-warning": "true",
    "Bypass-Tunnel-Reminder": "true",
  },
};

export default function ScreenJoinCreate({ navigation }: any) {
  const [isCreate, setIsCreate] = useState(true);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [joinId, setJoinId] = useState("");
  const [createdGroupId, setCreatedGroupId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 🌟 記住目前建立者的真實資料與 LINE 大頭照
  const [currentUser, setCurrentUser] = useState({
    userId: "",
    userName: "",
    pictureUrl: "",
  });

  // 🌟 新增：專屬客製化彈跳視窗 (Modal) 的控制狀態
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupData, setPopupData] = useState({
    icon: "💡",
    title: "",
    message: "",
    btnText: "我知道了",
    onConfirm: () => {},
  });

  const { groups, setGroups } = useGroups();

  // 1. 畫面載入時，自動去 LIFF 抓取當前建立者的身分與頭像
  useEffect(() => {
    const initLiffUser = async () => {
      try {
        await liff.init({ liffId: "2009712421-QF2zlOtI" });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setCurrentUser({
            userId: profile.userId,
            userName: profile.displayName || "Unknown User",
            pictureUrl: profile.pictureUrl || "",
          });
        }
      } catch (err) {
        console.error("LIFF 載入失敗:", err);
      }
    };
    initLiffUser();
  }, []);

  // 🌟 觸發高質感彈窗的小幫手
  const showPopup = (
    icon: string,
    title: string,
    message: string,
    onConfirmAction?: () => void,
    btnText = "我知道了",
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

  // 💡 通用的簡易提示 (保留給部分簡單錯誤)
  const showAlert = (title: string, message: string) => {
    showPopup("💡", title, message);
  };

  // 2. 呼叫 Node.js 後端建立群組，並寫入 PostgreSQL
  const handleCreateGroup = async () => {
    if (!groupNameInput.trim()) {
      return showAlert("提示", "請先輸入群組名稱哦！");
    }
    if (!currentUser.userId) {
      return showAlert("錯誤", "無法取得您的 LINE 身分，請重新整理網頁");
    }

    setIsLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/groups`,
        {
          groupName: groupNameInput.trim(),
          userId: currentUser.userId,
          userName: currentUser.userName,
        },
        axiosConfig,
      );

      if (response.data && response.data.success) {
        const newId = response.data.groupId;
        setCreatedGroupId(newId);
        setGroups((prev: any[]) => [
          ...prev,
          { id: newId, name: groupNameInput.trim(), muted: false },
        ]);
        // 🌟 建立成功：彈出高質感視窗！
        showPopup(
          "🎉",
          "建立成功！",
          `您的群組代碼為：\n【 ${newId} 】\n\n快把代碼複製分享給家人，邀請他們一起加入防護網吧！`,
        );
      } else {
        showAlert("錯誤", "建立失敗，伺服器回傳異常");
      }
    } catch (error) {
      console.error("建立群組 API 失敗:", error);
      showAlert("錯誤", "建立失敗，請檢查網路連線或後端設定");
    } finally {
      setIsLoading(false);
    }
  };

  // 3. 發送加入群組申請
  const handleJoinGroup = async () => {
    if (!joinId.trim()) {
      return showAlert("提示", "請輸入群組代碼！");
    }
    if (!currentUser.userId) {
      return showAlert("錯誤", "無法取得您的 LINE 身分，請重新整理網頁");
    }

    const targetId = joinId.trim().toUpperCase();

    // 💡 防呆：如果手機記憶體已存在該群組，直接提示
    const alreadyJoined = (groups || []).some((g: any) => g.id === targetId);
    if (alreadyJoined) {
      return showPopup(
        "💡",
        "您已是群組成員",
        "您已經加入過這個群組囉！不需要重複申請～",
        () => navigation.navigate("Home"),
        "回首頁查看",
      );
    }

    setIsLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/groups/join`,
        {
          groupId: targetId,
          userId: currentUser.userId,
          userName: currentUser.userName,
          pictureUrl: currentUser.pictureUrl || "", // 順手帶上最新頭像
        },
        axiosConfig,
      );

      if (response.data && response.data.success) {
        // 🌟 狀態 A：成功進入待審核區
        if (response.data.status === "pending") {
          showPopup(
            "⏳",
            "加入申請已送出！",
            response.data.message ||
              "請等待群組管理員審核同意後，即可正式進入群組防護網！",
            () => navigation.navigate("Home"),
            "回到首頁等待",
          );
        }
        // 🌟 狀態 B：後端確認已經是成員
        else if (response.data.status === "already_member") {
          showPopup(
            "🤝",
            "歡迎回來！",
            "系統確認您已經是這個群組的正式成員囉！",
            () => navigation.navigate("Home"),
            "前往首頁",
          );
        }
        // 🌟 狀態 C：直接加入成功 (如果未來有免審核群組)
        else {
          const joinedGroup = response.data.group;
          if (joinedGroup) {
            setGroups((prev: any[]) => {
              const exists = (prev || []).some((g) => g.id === joinedGroup.id);
              return exists ? prev : [joinedGroup, ...prev];
            });
          }
          showPopup(
            "🎉",
            "成功加入群組！",
            `歡迎加入「${joinedGroup?.name || "家庭群組"}」！`,
            () => navigation.navigate("Home"),
            "進入首頁",
          );
        }
        setJoinId("");
      } else {
        showPopup(
          "❌",
          "無法加入",
          response.data.error || "無效的群組代碼，請確認後再試",
        );
      }
    } catch (error: any) {
      console.error("加入群組 API 失敗:", error);
      const errMsg =
        error.response?.data?.error ||
        "找不到該群組代碼，請檢查網路或確認代碼是否正確";
      showPopup("❌", "加入失敗", errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!createdGroupId) {
      return showAlert("提示", "請先建立群組哦！");
    }
    if (Platform.OS === "web") {
      navigator.clipboard.writeText(createdGroupId).then(() => {
        showPopup(
          "✅",
          "複製成功！",
          `代碼【 ${createdGroupId} 】已複製到剪貼簿，快傳到 LINE 給家人吧！`,
        );
      });
    } else {
      Alert.alert("提示", "請手動複製代碼");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* 🌟 專屬客製化彈跳視窗 (Modal) */}
      <Modal
        visible={popupVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPopupVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconBg}>
              <Text style={styles.modalIcon}>{popupData.icon}</Text>
            </View>
            <Text style={styles.modalTitle}>{popupData.title}</Text>
            <Text style={styles.modalText}>{popupData.message}</Text>

            <Pressable style={styles.modalBtn} onPress={popupData.onConfirm}>
              <Text style={styles.modalBtnText}>{popupData.btnText}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>群組管理</Text>
        </View>

        <View style={styles.tabWrapper}>
          <Pressable
            onPress={() => setIsCreate(true)}
            style={[styles.tab, isCreate && styles.activeTab]}
          >
            <Text style={[styles.tabText, isCreate && styles.activeTabText]}>
              建立新群組
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setIsCreate(false)}
            style={[styles.tab, !isCreate && styles.activeTab]}
          >
            <Text style={[styles.tabText, !isCreate && styles.activeTabText]}>
              加入現有群組
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formCard}>
            {isCreate ? (
              <View>
                <View style={styles.welcomeBox}>
                  <Text style={styles.welcomeTitle}>
                    👋 歡迎使用防詐家庭群組！
                  </Text>
                  <Text style={styles.welcomeDesc}>
                    建立專屬的家庭防護網。當群組內的家人收到可疑訊息時，系統會立即進行詐騙分析並通知全體成員。
                  </Text>
                </View>

                <Text style={styles.label}>1. 設定群組名稱</Text>
                <TextInput
                  value={groupNameInput}
                  onChangeText={setGroupNameInput}
                  placeholder="例如：我們這一家"
                  placeholderTextColor="#A8927D"
                  style={styles.input}
                />

                <Text style={styles.label}>2. 群組代碼 (創建後產生)</Text>
                <View style={styles.idRow}>
                  <TextInput
                    value={createdGroupId}
                    editable={false}
                    placeholder="點擊下方按鈕獲取"
                    placeholderTextColor="#A8927D"
                    style={[
                      styles.input,
                      {
                        flex: 1,
                        marginBottom: 0,
                        backgroundColor: createdGroupId ? "#F0E6DA" : "#F5EAE0",
                        color: createdGroupId ? "#5C3A21" : "#4A2E18",
                        fontWeight: createdGroupId ? "900" : "400",
                      },
                    ]}
                  />
                  <Pressable onPress={copyToClipboard} style={styles.copyBtn}>
                    <Text style={styles.copyBtnText}>複製</Text>
                  </Pressable>
                </View>

                <View style={styles.spacer} />

                {createdGroupId ? (
                  <Pressable
                    onPress={() => {
                      setGroupNameInput(""); // 🌟 清空群組名稱欄位
                      setCreatedGroupId(""); // 🌟 清空生成的代碼欄位
                      setJoinId(""); // 💡 順手連加入群組的欄位也一起清空
                      navigation.navigate("Home");
                    }}
                    style={[styles.primaryBtn, { backgroundColor: "#5C3A21" }]}
                  >
                    <Text style={styles.primaryText}>完成！回首頁查看</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={handleCreateGroup}
                    style={styles.primaryBtn}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>確認建立並獲取代碼</Text>
                    )}
                  </Pressable>
                )}
              </View>
            ) : (
              <View>
                <View
                  style={[
                    styles.welcomeBox,
                    { borderLeftColor: "#8B5A2B", backgroundColor: "#F0E6DA" },
                  ]}
                >
                  <Text style={[styles.welcomeTitle, { color: "#4A2E18" }]}>
                    🤝 加入家人的防護網
                  </Text>
                  <Text style={[styles.welcomeDesc, { color: "#5C3A21" }]}>
                    請輸入家人分享給您的專屬代碼，即可加入群組共同防範詐騙。
                  </Text>
                </View>

                <Text style={styles.label}>群組代碼</Text>
                <TextInput
                  value={joinId}
                  onChangeText={(t) => setJoinId(t.toUpperCase())}
                  placeholder="請貼上代碼..."
                  placeholderTextColor="#A8927D"
                  style={styles.input}
                />
                <Pressable
                  onPress={handleJoinGroup}
                  style={styles.primaryBtn}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>確認加入</Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFDF9" },
  header: {
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFDF9",
    borderBottomWidth: 1,
    borderBottomColor: "#E8DCD0",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#4A2E18" },

  tabWrapper: { flexDirection: "row", padding: 16, paddingBottom: 8, gap: 12 },
  tab: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#EAE0D5",
    justifyContent: "center",
    alignItems: "center",
  },
  activeTab: { backgroundColor: "#5C3A21" },
  tabText: { fontSize: 15, fontWeight: "700", color: "#8B5A2B" },
  activeTabText: { color: "#FFFFFF" },

  scrollContent: { padding: 16 },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E8DCD0",
    shadowColor: "#4A2E18",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },

  welcomeBox: {
    backgroundColor: "#F5EAE0",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#8B5A2B",
  },
  welcomeTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#4A2E18",
    marginBottom: 6,
  },
  welcomeDesc: {
    fontSize: 13,
    color: "#5C3A21",
    lineHeight: 20,
  },

  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4A2E18",
    marginBottom: 12,
  },
  input: {
    height: 54,
    backgroundColor: "#F5EAE0",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#4A2E18",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E8DCD0",
  },

  idRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  copyBtn: {
    width: 60,
    height: 54,
    backgroundColor: "#EAE0D5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D8CCC0",
  },
  copyBtnText: { color: "#4A2E18", fontWeight: "800", fontSize: 14 },
  spacer: { height: 4 },

  primaryBtn: {
    height: 54,
    backgroundColor: "#5C3A21",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4A2E18",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },

  // 🌟 客製化 Modal 彈窗樣式 (純白襯底 + 舒適黑灰半透明遮罩 + 飽滿摩卡棕按鈕)
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
  modalIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#EAE0D5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalIcon: { fontSize: 32 },
  modalTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#4A2E18",
    marginBottom: 10,
    textAlign: "center",
  },
  modalText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6E4D31",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  modalBtn: {
    width: "100%",
    height: 48,
    backgroundColor: "#5C3A21",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
