import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// 🌟 換成你們後端 ngrok 的 HTTPS 網址 (記得如果 ngrok 重新開啟網址變了，這裡要更新)
const API_URL = "https://b5c3-220-130-167-166.ngrok-free.app";
export default function Feedback() {
  const navigation = useNavigation();
  const [feedbackText, setFeedbackText] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 🌟 新增：控制我們自製奶茶確認彈窗的開關
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  // 📸 打開相簿選擇圖片 (並轉換成 Base64 以便傳給資料庫)
  const pickImage = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      alert("需要相簿權限才能上傳圖片喔！");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5, // 壓縮到 0.5，避免 Base64 字串過大撐爆資料庫
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      // 加上 Data URI 前綴，讓瀏覽器跟 App 都能直接預覽與儲存
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setSelectedImage(base64Image);
    }
  };

  // 1. 點擊「送出回報」時，只做檢查跟打開自製奶茶彈窗！
  const handleSubmit = () => {
    if (!feedbackText.trim()) {
      alert("請詳細描述您遇到的狀況，再幫我們送出喔！☕");
      return;
    }
    setConfirmModalVisible(true); // 🚀 成功打開確認彈窗！
  };

  // 2. 這是彈窗裡按「確定送出」後，真正去打 API 寫入資料庫的邏輯：
  const executeSubmit = async () => {
    setConfirmModalVisible(false); // 先把彈窗關掉
    try {
      setIsSubmitting(true);
      const response = await fetch(`${API_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_text: feedbackText,
          report_image: selectedImage,
        }),
      });

      if (!response.ok) throw new Error("傳送失敗");

      setSuccessModalVisible(true);
      setFeedbackText("");
      setSelectedImage(null);
    } catch (error) {
      console.error("回報送出失敗:", error);
      alert("⚠️ 無法連線到伺服器，請確認網路或伺服器狀態。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>3. 建議回報</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>💬 問題回報與經驗分享</Text>
          <Text style={styles.desc}>
            除了 App
            的操作建議，更歡迎您分享遇過的詐騙手法或話術。您的經驗將協助我們持續擴充防詐資料庫，保護更多家庭！
          </Text>

          {/* 🌟 圖片上傳區塊 */}
          <View style={styles.imageSection}>
            {selectedImage ? (
              <View style={styles.previewContainer}>
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.previewImage}
                />
                <TouchableOpacity
                  style={styles.removeImageBtn}
                  onPress={() => setSelectedImage(null)}
                >
                  <Text style={styles.removeImageText}>✕ 移除圖片</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
                <Text style={styles.uploadBtnIcon}>📸</Text>
                <Text style={styles.uploadBtnText}>
                  點此上傳詐騙對話截圖或可疑圖片 (選填)
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 🌟 輸入框：奶茶邊框配米白底 */}
          <TextInput
            style={[
              styles.textInput,
              Platform.OS === "web" && ({ outlineStyle: "none" } as any),
            ]}
            placeholder="請詳細描述您遇到的問題，或是想分享的詐騙經歷（例如：對方用了什麼話術？）..."
            placeholderTextColor="#9c8474"
            multiline={true}
            textAlignVertical="top"
            value={feedbackText}
            onChangeText={setFeedbackText}
          />

          {/* 🌟 送出按鈕：溫潤焦糖棕 */}
          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitBtnText}>送出回報</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      {/* 🌟 補上專題手作：溫馨奶茶送出確認彈窗 (貼在 SafeAreaView 結束前) */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={confirmModalVisible}
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertIcon}>☕</Text>
            <Text style={styles.alertTitle}>確認送出回報？</Text>
            <Text style={styles.alertMessage}>
              感謝您提供寶貴的防詐經驗！請確認內容無誤，送出後將寫入防詐資料庫喔！
            </Text>

            <View style={styles.alertBtnRow}>
              <TouchableOpacity
                style={[styles.alertBtn, styles.alertBtnCancel]}
                onPress={() => setConfirmModalVisible(false)}
              >
                <Text style={styles.alertBtnCancelText}>先不要</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.alertBtn, styles.alertBtnConfirm]}
                onPress={executeSubmit}
              >
                <Text style={styles.alertBtnConfirmText}>確定送出</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* 🌟 新增：送出成功後的專屬奶茶彈窗 */}
      <Modal
        animationType="fade" // 讓成功的彈窗有點不同的動畫
        transparent={true}
        visible={successModalVisible}
        onRequestClose={() => {
          setSuccessModalVisible(false);
          navigation.goBack();
        }}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertIcon}>🎉</Text>
            <Text style={styles.alertTitle}>回報成功！</Text>
            <Text style={styles.alertMessage}>
              感謝您的回報與分享！您的寶貴經驗將幫助我們守護更多家庭。
            </Text>

            <View style={styles.alertBtnRow}>
              {/* 成功視窗只需要一個大大的確認按鈕，所以寬度設為 100% */}
              <TouchableOpacity
                style={[
                  styles.alertBtn,
                  styles.alertBtnConfirm,
                  { width: "100%" },
                ]}
                onPress={() => {
                  setSuccessModalVisible(false);
                  navigation.goBack(); // 👈 在這裡才執行返回上一頁
                }}
              >
                <Text style={styles.alertBtnConfirmText}>我知道了</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ☕ 100% 溫潤奶茶/焦糖色系美編
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fcfaf7" },
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#ede5dc",
    backgroundColor: "#fcfaf7",
    paddingHorizontal: 16,
  },
  backButton: { paddingVertical: 8, width: 60, justifyContent: "center" },
  placeholder: { width: 60 },
  backText: { fontSize: 16, color: "#8c6b58", fontWeight: "700" },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4a3b32",
    textAlign: "center",
    flex: 1,
  },
  container: { flex: 1, backgroundColor: "#faf6f0" },
  inner: { flex: 1, padding: 20 },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#4a3b32",
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    color: "#7d685a",
    lineHeight: 22,
    fontWeight: "600",
    marginBottom: 16,
  },
  // 圖片上傳區塊樣式
  imageSection: { marginBottom: 14 },
  uploadBtn: {
    backgroundColor: "#f5ebe0",
    borderWidth: 1.5,
    borderColor: "#d5c5b5",
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadBtnIcon: { fontSize: 18, marginRight: 8 },
  uploadBtnText: { color: "#8c6b58", fontSize: 13, fontWeight: "800" },
  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5ebe0",
    padding: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e6d7c8",
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  removeImageBtn: {
    backgroundColor: "#4a3b32",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  removeImageText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  // 輸入框樣式
  textInput: {
    flex: 1,
    minHeight: 180,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    paddingTop: 16,
    fontSize: 15,
    color: "#4a3b32",
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: "#e8ded4",
  },
  submitBtn: {
    backgroundColor: "#8c6b58",
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    ...Platform.select({
      default: {
        shadowColor: "#4a3b32",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 3,
      },
    }),
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
  },
  // ☕ 自製確認彈窗美編 (請貼在 styles 的最後面)
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(40, 30, 25, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  alertBox: {
    width: "85%",
    backgroundColor: "#faf6f0",
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: "#4a3b32",
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: "center",
  },
  alertIcon: { fontSize: 36, marginBottom: 8 },
  alertTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#4a3b32",
    marginBottom: 10,
  },
  alertMessage: {
    fontSize: 14,
    fontWeight: "700",
    color: "#7d685a",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 22,
  },
  alertBtnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  alertBtn: {
    width: "48%",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1.5,
  },
  alertBtnCancel: { backgroundColor: "#f3e8df", borderColor: "#d5c5b5" },
  alertBtnCancelText: { fontSize: 15, fontWeight: "800", color: "#7d685a" },
  alertBtnConfirm: { backgroundColor: "#8c6b58", borderColor: "#8c6b58" },
  alertBtnConfirmText: { fontSize: 15, fontWeight: "900", color: "#ffffff" },
});
