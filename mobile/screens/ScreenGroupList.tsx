import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Pressable,
  FlatList,
  Alert,
  TextInput,
  Modal,
  TouchableOpacity,
} from "react-native";

type TabKey = "home" | "join" | "me";

type GroupItem = {
  id: string;
  name: string;
  muted: boolean; // true = 推播關閉
};

export default function ScreenGroupList() {
  const [tab, setTab] = useState<TabKey>("home");

  const [groups, setGroups] = useState<GroupItem[]>([
    { id: "1", name: "家庭群組 A", muted: false },
    { id: "2", name: "家人群組 B", muted: true },
    { id: "3", name: "朋友群組 C", muted: false },
  ]);

  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  // 三點選單
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);

  const openMenu = (groupId: string) => {
    setMenuGroupId(groupId);
    setMenuOpen(true);
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setMenuGroupId(null);
  };

  const getGroup = () => groups.find((g) => g.id === menuGroupId);

  const toggleMute = () => {
    const g = getGroup();
    if (!g) return;

    const nextMuted = !g.muted;

    setGroups((prev) =>
      prev.map((x) => (x.id === g.id ? { ...x, muted: nextMuted } : x))
    );

    closeMenu();

    Alert.alert(
      "推播設定",
      nextMuted ? "已關閉推播（鈴鐺會出現紅線）" : "已開啟推播"
    );
  };

  const leaveGroup = () => {
    const g = getGroup();
    if (!g) return;

    Alert.alert("退出群組", `確定要退出「${g.name}」嗎？`, [
      { text: "取消", style: "cancel" },
      {
        text: "退出",
        style: "destructive",
        onPress: () => {
          setGroups((prev) => prev.filter((x) => x.id !== g.id));
          closeMenu();
        },
      },
    ]);
  };

  const reviewMembers = () => {
    const g = getGroup();
    if (!g) return;

    closeMenu();
    Alert.alert("審核新成員", `這裡之後接「${g.name}」的新成員審核頁面`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn}>
          <Text style={styles.headerIcon}>⌄</Text>
        </Pressable>

        <Text style={styles.headerTitle}>查詢群組</Text>

        <Pressable style={styles.headerBtn}>
          <Text style={styles.headerIcon}>✕</Text>
        </Pressable>
      </View>

      {/* ✅ 搜尋框（補回來） */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜尋群組"
            placeholderTextColor="#9ca3af"
            style={styles.searchInput}
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Text style={styles.searchClear}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* 群組列表 */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 10 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.groupName}>{item.name}</Text>

            {/* 右側：鈴鐺(可顯示紅線) + 三點 */}
            <View style={styles.rightIcons}>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "通知狀態",
                    item.muted ? "目前：推播已關閉" : "目前：推播已開啟"
                  )
                }
                style={{ paddingHorizontal: 4, paddingVertical: 2 }}
              >
                <Bell muted={item.muted} />
              </Pressable>

              <Pressable
                onPress={() => openMenu(item.id)}
                style={{ paddingHorizontal: 4, paddingVertical: 2 }}
              >
                <Text style={styles.icon}>⋯</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      {/* Bottom Nav */}
      <View style={styles.nav}>
        <NavItem
          icon="🏠"
          label="首頁"
          active={tab === "home"}
          onPress={() => setTab("home")}
        />
        <NavItem
          icon="+"
          label="加入/創建"
          active={tab === "join"}
          onPress={() => setTab("join")}
        />
        <NavItem
          icon="👤"
          label="個人"
          active={tab === "me"}
          onPress={() => setTab("me")}
        />
      </View>

      {/* ✅ 三點選單（Modal） */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.modalBackdrop} onPress={closeMenu}>
          <View />
        </Pressable>

        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <TouchableOpacity style={styles.sheetItem} onPress={toggleMute}>
            <Text style={styles.sheetText}>
              {getGroup()?.muted ? "開啟推播" : "關閉推播"}
            </Text>
          </TouchableOpacity>

          <View style={styles.sheetDivider} />

          <TouchableOpacity style={styles.sheetItem} onPress={reviewMembers}>
            <Text style={styles.sheetText}>審核新成員是否加入群組</Text>
          </TouchableOpacity>

          <View style={styles.sheetDivider} />

          <TouchableOpacity style={styles.sheetItem} onPress={leaveGroup}>
            <Text style={[styles.sheetText, { color: "#b91c1c" }]}>退出群組</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.sheetItem, { marginTop: 8 }]} onPress={closeMenu}>
            <Text style={[styles.sheetText, { color: "#6b7280" }]}>取消</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- 小元件 ---------- */

function Bell({ muted }: { muted: boolean }) {
  // muted=true：顯示鈴鐺 + 紅色斜線（不靠圖片檔）
  return (
    <View style={styles.bellWrap}>
      <Text style={styles.bellText}>{muted ? "🔔" : "🔔"}</Text>
      {muted ? <View style={styles.bellSlash} /> : null}
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
      <Text style={[styles.navIcon, active && styles.active]}>{icon}</Text>
      <Text style={[styles.navText, active && styles.active]}>{label}</Text>
    </Pressable>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  headerBtn: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIcon: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },

  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  searchBox: {
    height: 46,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
  },
  searchClear: {
    fontSize: 16,
    color: "#6b7280",
    fontWeight: "800",
  },

  card: {
    height: 60,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupName: { fontSize: 15, fontWeight: "700", color: "#111827" },

  rightIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  icon: { fontSize: 18, color: "#111827" },

  bellWrap: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  bellText: { fontSize: 18 },
  bellSlash: {
    position: "absolute",
    width: 22,
    height: 3,
    backgroundColor: "#ef4444",
    transform: [{ rotate: "-35deg" }],
    borderRadius: 2,
  },

  nav: {
    height: 64,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    flexDirection: "row",
    backgroundColor: "#fff",
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  navIcon: { fontSize: 20, color: "#6b7280" },
  navText: { fontSize: 12, fontWeight: "700", color: "#6b7280" },
  active: { color: "#111827" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
  },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    paddingBottom: 18,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    alignSelf: "center",
    marginBottom: 10,
  },
  sheetItem: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  sheetText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  sheetDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
  },
});
