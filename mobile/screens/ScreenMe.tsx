import React, { useState } from "react";
import {
  Alert,
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
  Image,
} from "react-native";
// 🌟 確保你有執行過 npx expo install expo-image-picker
import * as ImagePicker from 'expo-image-picker';

export default function ScreenMe() {
  const lineId = "XXXX-XXXX";
  const [nickname, setNickname] = React.useState("使用者暱稱");
  const [showId, setShowId] = React.useState(true); 
  const [notificationsOff, setNotificationsOff] = React.useState(false); 
  
  // 🌟 儲存頭像路徑
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  // 🚀 修改頭像功能：相容 iPhone 瀏覽器與 App
  const onChangeAvatar = async () => {
    try {
      // 在網頁版上，這行會直接觸發瀏覽器的檔案選取器
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, // 支援縮放裁剪
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const pickedUri = result.assets[0].uri;
        setAvatarUri(pickedUri);
        
        // 針對網頁版的回饋
        if (Platform.OS === 'web') {
          console.log("頭像已更新");
        }
      }
    } catch (error) {
      console.log("選取失敗:", error);
      if (Platform.OS === 'web') {
        window.alert("無法開啟相簿，請檢查瀏覽器權限。");
      } else {
        Alert.alert("錯誤", "無法開啟相簿");
      }
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>個人設定</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 1) 修改頭像 - 置中大圖版 */}
        <Pressable onPress={onChangeAvatar} style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarFull} />
            ) : (
              <View style={styles.avatarPlaceholder} />
            )}
          </View>
          <Text style={styles.avatarLabel}>修改頭像</Text>
        </Pressable>

        <View style={styles.divider} />

        {/* 2) 修改暱稱 */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>修改暱稱</Text>
        </View>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          style={[
            styles.input,
            Platform.OS === "web" && ({ outlineStyle: "none" } as any),
          ]}
          placeholder="輸入暱稱"
          placeholderTextColor="#9ca3af"
        />

        <View style={styles.divider} />

        {/* 3) 顯示 ID */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>顯示 ID</Text>
          <OX value={showId} onChange={setShowId} />
        </View>
        {showId ? (
          <Text style={styles.hint}>Line ID：{lineId}</Text>
        ) : (
          <Text style={styles.hintMuted}>Line ID 已隱藏</Text>
        )}

        <View style={styles.divider} />

        {/* 4) 是否關閉通知 */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>是否關閉通知</Text>
          <OX value={notificationsOff} onChange={setNotificationsOff} />
        </View>
        <Text style={styles.hintMuted}>
          {notificationsOff ? "通知已關閉" : "通知已開啟"}
        </Text>

        {/* 最後一行「是否顯示 ID」已移除 */}
      </ScrollView>
    </SafeAreaView>
  );
}

function OX({ value, onChange }: { value: boolean; onChange: (v: boolean) => void; }) {
  return (
    <View style={styles.oxWrap}>
      <Pressable onPress={() => onChange(true)} style={[styles.oxBtn, value && styles.oxBtnActive]}>
        <Text style={[styles.oxText, value && styles.oxTextActive]}>○</Text>
      </Pressable>
      <Pressable onPress={() => onChange(false)} style={[styles.oxBtn, !value && styles.oxBtnActive]}>
        <Text style={[styles.oxText, !value && styles.oxTextActive]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  headerTitleContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "900", color: "#111827", textAlign: "center" },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 },
  
  // 頭像置中樣式
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
    backgroundColor: "#e5e7eb", 
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6'
  },
  avatarFull: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: "#e5e7eb",
  },
  avatarLabel: { fontSize: 14, fontWeight: "800", color: "#6b7280" },

  row: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowLabel: { fontSize: 16, fontWeight: "800", color: "#111827" },
  divider: { height: 1, backgroundColor: "#e5e7eb" },
  input: { height: 52, borderRadius: 10, backgroundColor: "#e5e7eb", paddingHorizontal: 14, fontSize: 16, color: "#111827", marginBottom: 10 },
  hint: { marginTop: -6, marginBottom: 10, fontSize: 14, fontWeight: "800", color: "#111827" },
  hintMuted: { marginTop: -6, marginBottom: 10, fontSize: 14, fontWeight: "800", color: "#6b7280" },
  oxWrap: { flexDirection: "row", gap: 10, alignItems: "center" },
  oxBtn: { width: 44, height: 36, borderRadius: 10, backgroundColor: "#e5e7eb", alignItems: "center", justifyContent: "center" },
  oxBtnActive: { backgroundColor: "#111827" },
  oxText: { fontSize: 18, fontWeight: "900", color: "#111827" },
  oxTextActive: { color: "#fff" },
});