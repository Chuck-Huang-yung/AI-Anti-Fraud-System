import { useNavigation } from "@react-navigation/native";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

export default function FraudDashboard() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.safe}>
      {/* 頂部導覽列，維持 App 的一致體驗 */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>165 詐騙儀表板</Text>
        <View style={styles.placeholder} />
      </View>

      {/* 嵌入外部網頁的核心元件 */}
      {/* 🌟 核心：智慧判斷平台，解決 Web 瀏覽器報錯問題 */}
      {Platform.OS === "web" ? (
        // 1. 如果是在網頁瀏覽器 (Safari / Chrome / 電腦端)，改用標準 iframe 嵌入
        <View style={{ flex: 1, width: "100%", height: "100%" }}>
          <iframe
            src="https://165dashboard.tw/"
            style={{ width: "100%", height: "100%", border: "none" }}
            title="165 詐騙儀表板"
          />
        </View>
      ) : (
        // 2. 如果是在 iOS / Android 原生 App，繼續用原本的 WebView
        <WebView
          source={{ uri: "https://165dashboard.tw/" }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              {/* 🌟 換上專屬的小雞 GIF 動畫 */}
              <Image
                source={require("../assets/loading.gif")}
                style={{ width: 120, height: 120, marginBottom: 16 }}
                resizeMode="contain"
              />
              <Text style={styles.loadingText}>網頁載入中...</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ☕ 1. 整體與導覽列背景改為溫潤米白底色，消滅死灰邊框
  safe: { flex: 1, backgroundColor: "#fcfaf7" },

  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#ede5dc", // 柔和奶茶相框邊線
    backgroundColor: "#fcfaf7",
    paddingHorizontal: 16,
  },

  backButton: { paddingVertical: 8, width: 60, justifyContent: "center" },
  placeholder: { width: 60 },

  // ☕ 2. 返回鍵從突兀的紅色，改為高質感的焦糖棕
  backText: { fontSize: 16, color: "#8c6b58", fontWeight: "700" },

  // ☕ 3. 標題換上深可可棕，跟首頁與基本手法挑戰頁面 100% 統一
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4a3b32",
    textAlign: "center",
    flex: 1,
  },

  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },

  // ☕ 4. 網頁載入中的等待畫面，改為奶油濃奶茶底與深奶茶字體
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#faf6f0",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 14,
    fontSize: 16,
    color: "#8c6b58",
    fontWeight: "700",
  },
});
