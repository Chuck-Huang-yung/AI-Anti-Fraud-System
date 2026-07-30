import { useNavigation } from "@react-navigation/native";
import React from "react";
import {
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";

export default function Index() {
  const navigation = useNavigation<any>();
  return (
    <SafeAreaView style={styles.safe}>
      {/* 頂部導覽列：換上溫潤可可棕與米白底色 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>防詐騙小幫手</Text>
      </View>

      <View style={styles.container}>
        {/* 🌟 1. 基本手法挑戰 (上層大卡片) */}
        <TouchableOpacity
          style={[styles.card, styles.topCard]}
          onPress={() => navigation.navigate("ScamMethods")}
          activeOpacity={0.85}
        >
          <Image
            // 💡 請確認圖片的存放資料夾與名稱是否相符（例如 ./assets/ 或 ../assets/）
            source={require("../assets/part1_true_no_border.png")}
            style={styles.cardImage}
            contentFit="cover" // 注意 expo-image 的屬性叫 contentFit 而不是 resizeMode
            cachePolicy="memory-disk" // 🌟 啟動磁碟與記憶體雙快取！
            transition={200} // 加上輕微漸顯動畫，視覺體驗直接滿分
          />
        </TouchableOpacity>

        {/* 下方兩張小卡片並排 */}
        <View style={styles.bottomRow}>
          {/* 🌟 2. 165 詐騙儀表板 */}
          <TouchableOpacity
            style={[styles.card, styles.bottomCard]}
            onPress={() => navigation.navigate("FraudDashboard")}
            activeOpacity={0.85}
          >
            <Image
              source={require("../assets/part2_v_padded.png")}
              style={styles.cardImage}
              contentFit="cover" // 注意 expo-image 的屬性叫 contentFit 而不是 resizeMode
              cachePolicy="memory-disk" // 🌟 啟動磁碟與記憶體雙快取！
              transition={200} // 加上輕微漸顯動畫，視覺體驗直接滿分
            />
          </TouchableOpacity>

          {/* 🌟 3. 建議回報 */}
          <TouchableOpacity
            style={[styles.card, styles.bottomCard]}
            onPress={() => navigation.navigate("Feedback")}
            activeOpacity={0.85}
          >
            <Image
              source={require("../assets/part3_true_no_border.png")}
              style={styles.cardImage}
              contentFit="cover" // 注意 expo-image 的屬性叫 contentFit 而不是 resizeMode
              cachePolicy="memory-disk" // 🌟 啟動磁碟與記憶體雙快取！
              transition={200} // 加上輕微漸顯動畫，視覺體驗直接滿分
            />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ☕ 整體背景改為溫潤的奶茶米白底色，告別冷灰與死白
  safe: { flex: 1, backgroundColor: "#fcfaf7" },
  header: {
    height: 58,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#ede5dc",
    backgroundColor: "#fcfaf7",
  },
  // 標題換上深可可棕，跟其他頁面字體配色呼應
  headerTitle: { fontSize: 19, fontWeight: "900", color: "#4a3b32" },

  container: { flex: 1, padding: 16, backgroundColor: "#faf6f0" },

  // ☕ 首頁卡片共用樣式：改為相框感奶茶邊框，並設定 overflow 讓圖片切出漂亮圓角
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 6,
    borderColor: "#e8ded4", // 溫暖的濃奶茶色邊框
    overflow: "hidden", // 🌟 關鍵：讓內層插圖順著圓角裁切，毫無破綻
    ...Platform.select({
      web: { boxShadow: "0px 6px 16px rgba(74, 59, 50, 0.08)" },
      default: {
        shadowColor: "#4a3b32",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  // 讓圖片滿版貼合卡片，視覺衝擊力最強
  cardImage: {
    width: "100%",
    height: "100%",
  },

  topCard: { flex: 1.1, marginBottom: 16 },
  bottomRow: { flex: 1, flexDirection: "row", gap: 16 },
  bottomCard: { flex: 1 },
});
