import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  ActivityIndicator,
  Image, // 🌟 1. 新增 Image 元件用來顯示吉祥物
} from "react-native";
import liff from "@line/liff";
import axios from "axios";
import { useGroups } from "../context/GroupContext"; // 💡 1. 引入共用群組狀態

// 這裡填入你的後端網址 (使用 Localtunnel 或 ngrok 時記得換成最新網址)
const API_URL = "https://02f9-220-130-167-166.ngrok-free.app";
// 🌟 1. 新增：穿透 ngrok / localtunnel 攔截的專屬標頭！
const axiosConfig = {
  headers: {
    "ngrok-skip-browser-warning": "true",
    "Bypass-Tunnel-Reminder": "true",
  },
};
export default function AppMain({ navigation }: any) {
  const [lineId, setLineId] = useState("");
  const [nickname, setNickname] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  // 🌟 2. 新增：用來暫存新用戶 LINE 大頭照的 State！
  const [avatarUrl, setAvatarUrl] = useState("");
  //const { setGroups } = useGroups(); // 💡 2. 拿出 setGroups 工具
  // 🌟 客製化摩卡棕提示視窗專用狀態
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  // 🌟 專屬小助手函式：任何地方呼叫它，就會優雅彈出摩卡棕提示視窗
  const showCustomAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertModalVisible(true);
  };
  // 1. 初始化 LIFF 並檢查註冊狀態
  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: "2009712421-QF2zlOtI" });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          const userId = profile.userId;
          setLineId(userId);

          // 🌟 把新用戶的大頭照先暫存在記憶體裡！
          setAvatarUrl(profile.pictureUrl || "");

          // 🌟 加上 axiosConfig 穿透標頭
          const response = await axios.post(
            `${API_URL}/api/users/check`,
            { userId: userId },
            axiosConfig,
          );

          if (response.data.isRegistered) {
            // 資料庫資料準備完畢，秒進主系統！首頁立刻顯示群組！
            navigation.replace("Tabs");
          } else {
            setNickname(profile.displayName || "");
            setIsLoading(false);
          }
        } else {
          liff.login();
        }
      } catch (err) {
        console.error("LIFF 初始化失敗:", err);
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, []);

  const Container = (
    Platform.OS === "web" ? View : TouchableWithoutFeedback
  ) as any;
  const containerProps =
    Platform.OS === "web"
      ? { style: { flex: 1 } }
      : { onPress: Keyboard.dismiss, accessible: false };

  const onNext = async () => {
    const id = lineId.trim();
    const name = nickname.trim();
    const contact = contactInfo.trim();

    const showAlert = (title: string, message: string) => {
      setAlertTitle(title);
      setAlertMessage(message);
      setAlertModalVisible(true);
    };

    if (!id) return showAlert("錯誤", "無法取得 LINE ID");
    if (!contact) return showAlert("提示", "請輸入 Line ID 或其他聯絡資訊");
    if (!name) return showAlert("提示", "請確認您的暱稱");

    try {
      setIsLoading(true);
      // 🌟 核心升級：送出註冊封包時，把 LINE 大頭照也一起傳給資料庫！
      await axios.post(
        `${API_URL}/api/users/register`,
        {
          userId: id,
          nickname: name,
          lineId: contact,
          pictureUrl: avatarUrl || "", // 👈 就是這行！新家人一註冊就寫入頭像！
        },
        axiosConfig, // 👈 加上標頭，保證註冊絕不報錯！
      );
      // 新註冊成功，跳轉進入主系統
      navigation.replace("Tabs");
    } catch (err) {
      console.error("註冊失敗:", err);
      Alert.alert("錯誤", "註冊失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#FFFDF9",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 20,
          width: "100%",
          // 💡 關鍵：兩邊都加上這行，確保網頁與手機端的中心點 Y 軸絕對一致！
          minHeight: Platform.OS === "web" ? ("100vh" as any) : "100%",
        }}
      >
        {/* 🌟 這裡也放入跳舞小雞 GIF，取代轉圈圈！ */}
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
          🐣 小雞偵探正在為您連接防詐資料庫...
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
          (正在驗證 LINE 身分與家庭群組設定)
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Container {...containerProps}>
        <KeyboardAvoidingView
          style={styles.safe}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* 🌟 3. 活化頂部空 Header：放入小雞標誌與溫暖招呼，不破壞任何 Layout */}
          <View style={styles.header}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#5C3A21" }}>
              — 真識監詐 · 守護您的家庭安全 —
            </Text>
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>歡迎使用家庭群組功能</Text>
            <Text style={styles.desc}>
              請確認您的暱稱，並留下相關資訊方式以利後續群組管理。
            </Text>
            <Text style={styles.desc}>
              📌相關資訊只用於此系統，也可於後續設定自訂調整!
            </Text>
            <Text style={styles.label}>系統 User ID (不可修改)</Text>
            <TextInput
              value={lineId}
              style={[styles.input, styles.readOnlyInput]}
              editable={false}
            />
            <Text style={[styles.label, { marginTop: 18 }]}>
              Line ID / 其他 (用於他人互相辨識身份)
            </Text>
            <TextInput
              value={contactInfo}
              onChangeText={setContactInfo}
              style={[
                styles.input,
                Platform.OS === "web" && ({ outlineStyle: "none" } as any),
              ]}
              placeholder="例如: 0912345678"
              placeholderTextColor="#9ca3af"
              returnKeyType="next"
            />
            <Text style={[styles.label, { marginTop: 18 }]}>暱稱</Text>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              style={[
                styles.input,
                Platform.OS === "web" && ({ outlineStyle: "none" } as any),
              ]}
              placeholder="請輸入暱稱"
              placeholderTextColor="#9ca3af"
              returnKeyType="done"
            />
            <Text style={styles.footerText}>
              系統將自動偵測Line對話，如成員有遇詐騙會立即通知
            </Text>
            <View style={{ marginTop: 24 }}>
              <Pressable onPress={onNext} style={styles.nextBtn}>
                <Text style={styles.nextBtnText}>下一步</Text>
              </Pressable>
            </View>
            {/* 🌟 隱形背景預載：在你填寫表單時，系統就默默把 GIF 抓進記憶體解碼，按下按鈕 0 秒秒出！ */}
            <Image
              source={
                Platform.OS === "web"
                  ? { uri: "/loading.gif" }
                  : require("../assets/loading.gif")
              }
              style={{ width: 1, height: 1, opacity: 0, position: "absolute" }}
            />
          </View>
          {/* 🌟 摩卡棕客製化系統提示視窗 (中性黑灰半透明遮罩 + 純白襯底 + 獨立飽滿按鈕) */}
          <Modal
            visible={alertModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setAlertModalVisible(false)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(0, 0, 0, 0.4)", // 💡 舒適不刺眼的深色遮罩
                justifyContent: "center",
                alignItems: "center",
                padding: 20,
              }}
            >
              <View
                style={{
                  width: "100%",
                  maxWidth: 300,
                  backgroundColor: "#FFFFFF", // 💡 純白底色，視覺通透乾淨
                  borderRadius: 20,
                  padding: 20,
                  borderWidth: 1,
                  borderColor: "#E8DCD0",
                  shadowColor: "#4A2E18",
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.12,
                  shadowRadius: 16,
                  elevation: 8,
                  alignItems: "center",
                }}
              >
                {/* 💡 修改這裡：將燈泡與中文字拆成兩行，兩者皆為 100% 水平置中 */}
                <Text
                  style={{
                    fontSize: 28,
                    marginBottom: 6,
                    textAlign: "center",
                    width: "100%",
                  }}
                >
                  💡
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: "#4A2E18",
                    marginBottom: 10,
                    textAlign: "center",
                    width: "100%", // 確保寬度佔滿，文字必定在最正中間
                  }}
                >
                  提示
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#6E4D31",
                    textAlign: "center",
                    marginBottom: 20,
                    lineHeight: 18,
                  }}
                >
                  {alertMessage}
                </Text>

                {/* 💡 徹底獨立的 46px 固定高度按鈕，保證任何畫面下都不會縮水變扁！ */}
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
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: "#FFFFFF",
                    }}
                  >
                    確定
                  </Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        </KeyboardAvoidingView>
      </Container>
    </SafeAreaView>
  );
}

// 🌟 4. 全面棕色化樣式大升級 (排版屬性 flex、padding、height 完全不變！)
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFDF9" }, // 輕柔暖米奶油底色
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  content: { paddingHorizontal: 18, paddingTop: 6 },
  title: {
    fontSize: 20, // 稍微提亮標題層級
    fontWeight: "800",
    color: "#4A2E18", // 深焙黑摩卡棕
    marginBottom: 10,
  },
  desc: { fontSize: 14, lineHeight: 20, color: "#6E4D31", marginBottom: 18 }, // 溫暖可可棕
  label: { fontSize: 16, fontWeight: "700", color: "#4A2E18", marginBottom: 8 },
  input: {
    height: 56,
    borderRadius: 10, // 稍微微調圓角更現代
    backgroundColor: "#F5EAE0", // 溫潤燕麥奶棕背景
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#4A2E18",
    borderWidth: 1,
    borderColor: "#E8DCD0", // 細緻棕色邊框
    ...Platform.select({ web: { cursor: "text" } as any }),
  },
  readOnlyInput: {
    backgroundColor: "#EAE0D5", // 唯讀狀態使用沉穩茶棕
    color: "#7A5C43",
    borderColor: "#D8CCC0",
  },
  footerText: {
    marginTop: 22,
    fontSize: 15,
    fontWeight: "700",
    color: "#8B5A2B", // 呼應小雞橘棕色的警示文字
  },
  nextBtn: {
    height: 52,
    borderRadius: 10,
    backgroundColor: "#5C3A21", // 主視覺：深黑摩卡棕
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4A2E18", // 加上輕微棕色陰影更有質感
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  nextBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
