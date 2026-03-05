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
} from "react-native";

type TabKey = "home" | "join_create" | "profile";

export default function ScreenMe() {
  // 假資料：之後接你真的資料
  const lineId = "XXXX-XXXX";

  const [nickname, setNickname] = React.useState("使用者暱稱");
  const [showId, setShowId] = React.useState(true); // 顯示 ID
  const [notificationsOff, setNotificationsOff] = React.useState(false); // 是否關閉通知（true=關閉）
  const [showId2, setShowId2] = React.useState(true); // 是否顯示 ID（你要求再一個圈叉）

  const [tab, setTab] = React.useState<TabKey>("profile");

  const onBack = () => Alert.alert("返回", "這裡之後可接上一頁");
  const onClose = () =>
    Alert.alert("關閉", "要關閉此頁面嗎？", [
      { text: "取消", style: "cancel" },
      { text: "確定", style: "destructive" },
    ]);

  const onChangeAvatar = () => {
    Alert.alert("修改頭像", "這裡之後可接相簿/相機選擇（先保留灰色圓圈）");
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn}>
          <Text style={styles.iconText}>⌄</Text>
        </Pressable>

        <Text style={styles.headerTitle}>個人設定</Text>

        <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
          <Text style={styles.iconText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 1) 修改頭像（點一下） */}
        <Pressable onPress={onChangeAvatar} style={styles.row}>
          <View style={styles.left}>
            <View style={styles.avatarCircle} />
            <Text style={styles.rowLabel}>修改頭像</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <View style={styles.divider} />

        {/* 2) 修改暱稱（輸入框） */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>修改暱稱</Text>
        </View>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          style={styles.input}
          placeholder="輸入暱稱"
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

        {/* 4) 是否關閉通知（圈圈/叉叉） */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>是否關閉通知</Text>
          <OX value={notificationsOff} onChange={setNotificationsOff} />
        </View>
        <Text style={styles.hintMuted}>
          {notificationsOff ? "通知已關閉" : "通知已開啟"}
        </Text>

        <View style={styles.divider} />

        {/* 5) 是否顯示 ID（圈圈/叉叉） */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>是否顯示 ID</Text>
          <OX value={showId2} onChange={setShowId2} />
        </View>
        <Text style={styles.hintMuted}>
          {showId2 ? "將顯示 ID" : "將隱藏 ID"}
        </Text>
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

function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.navItem}>
      <Text style={[styles.navIcon, active && styles.navActive]}>{icon}</Text>
      <Text style={[styles.navText, active && styles.navActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  header: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { fontSize: 20, color: "#111827" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
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

  nav: {
    height: 62,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    flexDirection: "row",
    backgroundColor: "#fff",
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  navIcon: { fontSize: 18, color: "#6b7280" },
  navText: { fontSize: 12, fontWeight: "900", color: "#6b7280" },
  navActive: { color: "#111827" },
});
