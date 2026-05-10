import React from "react";
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
} from "react-native";

export default function ScreenMe() {
  // 假資料
  const lineId = "XXXX-XXXX";

  const [nickname, setNickname] = React.useState("使用者暱稱");
  const [showId, setShowId] = React.useState(true); 
  const [notificationsOff, setNotificationsOff] = React.useState(false); 

  const onChangeAvatar = () => {
    Alert.alert("修改頭像", "這裡之後可接相簿/相機選擇（先保留灰色圓圈）");
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header - 已移除左右圖示並置中 */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>個人設定</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 1) 修改頭像 */}
        <Pressable onPress={onChangeAvatar} style={styles.row}>
          <View style={styles.left}>
            <View style={styles.avatarCircle} />
            <Text style={styles.rowLabel}>修改頭像</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
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

        {/* 3) 顯示id（圈圈/叉叉） */}
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
        
        {/* 🌟 提示：原本最後一行的「是否顯示 ID」已根據你的要求移除 */}
      </ScrollView>
    </SafeAreaView>
  );
}

/** 圈圈 / 叉叉 */
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
  safe: { flex: 1, backgroundColor: "#fff" },

  header: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
  },

  row: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowLabel: { fontSize: 16, fontWeight: "800", color: "#111827" },
  chevron: { fontSize: 22, color: "#6b7280", marginRight: 4 },

  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e5e7eb",
  },

  divider: { height: 1, backgroundColor: "#e5e7eb" },

  input: {
    height: 52,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#111827",
    marginBottom: 10,
    ...Platform.select({
      web: { cursor: "text" } as any,
    }),
  },

  hint: {
    marginTop: -6,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  hintMuted: {
    marginTop: -6,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "800",
    color: "#6b7280",
  },

  oxWrap: { flexDirection: "row", gap: 10, alignItems: "center" },
  oxBtn: {
    width: 44,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  oxBtnActive: { backgroundColor: "#111827" },
  oxText: { fontSize: 18, fontWeight: "900", color: "#111827" },
  oxTextActive: { color: "#fff" },
});