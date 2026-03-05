import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  SafeAreaView,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  View,
  ScrollView,
  StatusBar,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Mode = "create" | "join";
type TabKey = "home" | "joinCreate" | "profile";

type Group = {
  id: string;
  name: string;
  createdAt: number;
};

const STORAGE_KEY = "fc_groups_v1";

function makeGroupId(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 避免 0/O 1/I
  let out = "";
  for (let i = 0; i < len; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function ScreenJoinCreate() {
  const [mode, setMode] = useState<Mode>("create");
  const [tab, setTab] = useState<TabKey>("joinCreate");

  // Create inputs
  const [groupName, setGroupName] = useState("");
  const [created, setCreated] = useState<Group | null>(null);

  // Join inputs
  const [joinId, setJoinId] = useState("");

  // Stored groups
  const [groups, setGroups] = useState<Group[]>([]);
  const groupMap = useMemo(() => {
    const m = new Map<string, Group>();
    groups.forEach((g) => m.set(g.id, g));
    return m;
  }, [groups]);

  // Load on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Group[];
        if (Array.isArray(parsed)) setGroups(parsed);
      } catch (e) {
        console.log("load groups error", e);
      }
    })();
  }, []);

  const saveGroups = async (next: Group[]) => {
    setGroups(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.log("save groups error", e);
    }
  };

  // ✅ 固定模板：左上返回、右上叉叉
  const onBack = () => {
    Alert.alert("返回", "這裡之後可接上一頁（navigation）");
  };

  const onClose = () => {
    Alert.alert("關閉", "要關閉此頁面嗎？", [
      { text: "取消", style: "cancel" },
      {
        text: "確定",
        style: "destructive",
        onPress: () => console.log("close"),
      },
    ]);
  };

  const onCreate = async () => {
    const name = groupName.trim();
    if (!name) {
      Alert.alert("請輸入群組名稱");
      return;
    }

    let id = makeGroupId(12);
    while (groupMap.has(id)) id = makeGroupId(12);

    const newGroup: Group = { id, name, createdAt: Date.now() };
    const next = [newGroup, ...groups];
    await saveGroups(next);

    setCreated(newGroup);
    Alert.alert("已創建完成", `群組名稱：${name}`);
  };

  const onCopyId = async () => {
    if (!created?.id) return;
    await Clipboard.setStringAsync(created.id);
    Alert.alert("已複製群組 ID", created.id);
  };

  const onJoin = async () => {
    const id = joinId.trim().toUpperCase();
    if (!id) {
      Alert.alert("請輸入群組 ID");
      return;
    }

    const g = groupMap.get(id);
    if (!g) {
      Alert.alert(
        "找不到此群組",
        "請確認 ID 是否正確，或該群組尚未在本機建立/記錄。",
      );
      return;
    }

    // ✅ 顯示群組名稱
    Alert.alert("已加入", `群組名稱：${g.name}`);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setCreated(null);
  };

  // ✅ 底部導覽列：先做 UI（之後接 navigation）
  const goTab = (k: TabKey) => {
    setTab(k);
    if (k === "home") Alert.alert("首頁", "之後接首頁頁面");
    if (k === "joinCreate") Alert.alert("加入/創建", "目前頁面");
    if (k === "profile") Alert.alert("個人", "之後接個人設定頁");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* ✅ 固定 Header：左下拉箭頭、右叉叉 */}
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn}>
          <Text style={styles.iconText}>⌄</Text>
        </Pressable>

        <Text style={styles.headerTitle}>加入 / 創建</Text>

        <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
          <Text style={styles.iconText}>✕</Text>
        </Pressable>
      </View>

      {/* Body */}
      <ScrollView contentContainerStyle={styles.body}>
        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            onPress={() => switchMode("create")}
            style={[styles.tab, mode === "create" && styles.tabActive]}
          >
            <Text
              style={[
                styles.tabText,
                mode === "create" && styles.tabTextActive,
              ]}
            >
              創建
            </Text>
          </Pressable>

          <Pressable
            onPress={() => switchMode("join")}
            style={[styles.tab, mode === "join" && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, mode === "join" && styles.tabTextActive]}
            >
              加入
            </Text>
          </Pressable>
        </View>

        {mode === "create" ? (
          <View style={styles.card}>
            <Text style={styles.label}>群組名稱</Text>
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="例如：家人群 / 朋友群"
              style={styles.input}
            />

            <Text style={[styles.label, { marginTop: 14 }]}>
              群組 ID（創建後固定）
            </Text>

            <View style={styles.idRow}>
              <View style={[styles.input, styles.idBox]}>
                <Text style={styles.idText}>
                  {created?.id ?? "（尚未創建）"}
                </Text>
              </View>

              <Pressable
                onPress={onCopyId}
                style={[styles.copyBtn, !created?.id && styles.copyBtnDisabled]}
                disabled={!created?.id}
              >
                <Text style={styles.copyText}>複製</Text>
              </Pressable>
            </View>

            <Pressable onPress={onCreate} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>確認創建</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>輸入群組 ID</Text>
            <TextInput
              value={joinId}
              onChangeText={setJoinId}
              placeholder="貼上群組 ID"
              style={styles.input}
              autoCapitalize="characters"
            />

            <Pressable onPress={onJoin} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>確認加入</Text>
            </Pressable>

            <Text style={styles.hint}>
              你輸入的 ID
              會去本機「已記錄的群組清單」比對，找到就會顯示對應的群組名稱。
            </Text>
          </View>
        )}

        <Text style={styles.listTitle}>已記錄群組（本機）</Text>
        {groups.length === 0 ? (
          <Text style={styles.empty}>目前還沒有記錄任何群組</Text>
        ) : (
          groups.map((g) => (
            <View key={g.id} style={styles.groupRow}>
              <Text style={styles.groupName}>{g.name}</Text>
              <Text style={styles.groupId}>{g.id}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- Bottom Nav Item ---------- */
function NavItem({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.navItem}>
      {/* 灰色圓圈 icon */}
      <View
        style={[styles.navIconCircle, active && styles.navIconCircleActive]}
      >
        <Text style={[styles.navIconText, active && styles.navIconTextActive]}>
          {icon}
        </Text>
      </View>
      <Text style={[styles.navText, active && styles.navTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  /* Header */
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
    fontWeight: "800",
    color: "#111827",
  },

  body: { paddingHorizontal: 14, paddingBottom: 24 },

  /* Tabs */
  tabs: { flexDirection: "row", gap: 10, marginBottom: 10 },
  tab: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: { backgroundColor: "#111827" },
  tabText: { fontSize: 14, fontWeight: "800", color: "#111827" },
  tabTextActive: { color: "#fff" },

  /* Card */
  card: { backgroundColor: "#f3f4f6", borderRadius: 14, padding: 14 },

  label: { fontSize: 13, fontWeight: "800", color: "#111827", marginBottom: 8 },
  input: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#111827",
  },

  idRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  idBox: { flex: 1, justifyContent: "center" },
  idText: { fontSize: 14, fontWeight: "800", color: "#111827" },

  copyBtn: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  copyBtnDisabled: { backgroundColor: "#9ca3af" },
  copyText: { color: "#fff", fontWeight: "900" },

  primaryBtn: {
    marginTop: 14,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "900" },

  hint: { marginTop: 12, fontSize: 12, lineHeight: 18, color: "#6b7280" },

  listTitle: {
    marginTop: 16,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "900",
    color: "#111827",
  },
  empty: { fontSize: 12, color: "#6b7280" },

  groupRow: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 10,
  },
  groupName: { fontSize: 14, fontWeight: "900", color: "#111827" },
  groupId: { marginTop: 4, fontSize: 12, fontWeight: "700", color: "#6b7280" },

  /* Bottom Nav */
  nav: {
    height: 72,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    flexDirection: "row",
    backgroundColor: "#ffffff",
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  navIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#e5e7eb", // 灰色圓圈
    alignItems: "center",
    justifyContent: "center",
  },
  navIconCircleActive: { backgroundColor: "#111827" },
  navIconText: { fontSize: 16, color: "#111827", fontWeight: "900" },
  navIconTextActive: { color: "#ffffff" },
  navText: { fontSize: 12, fontWeight: "900", color: "#6b7280" },
  navTextActive: { color: "#111827" },
});
