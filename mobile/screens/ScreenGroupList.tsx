import React, { useMemo, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View, Pressable, FlatList, Alert, TextInput, Modal, TouchableOpacity, Platform } from "react-native";
import { useGroups } from "../context/GroupContext";

export default function ScreenGroupList({ navigation }: any) {
  const { groups, setGroups } = useGroups();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;
  }, [groups, query]);

  const openMenu = (id: string) => { setMenuGroupId(id); setMenuOpen(true); };
  const closeMenu = () => { setMenuOpen(false); setMenuGroupId(null); };

  const leaveGroup = () => {
    const tid = menuGroupId;
    const targetGroup = groups.find(g => g.id === tid);
    if (!targetGroup) return;
    closeMenu();

    const doDelete = () => setGroups(prev => prev.filter(g => g.id !== tid));

    if (Platform.OS === 'web') {
      if (window.confirm(`確定退出「${targetGroup.name}」？`)) doDelete();
    } else {
      Alert.alert("退出確認", `確定退出「${targetGroup.name}」？`, [
        { text: "取消", style: "cancel" },
        { text: "確定", style: "destructive", onPress: doDelete }
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><Text style={styles.headerTitle}>查詢群組</Text></View>
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Text>🔍</Text>
          <TextInput value={query} onChangeText={setQuery} placeholder="搜尋群組" style={styles.searchInput} placeholderTextColor="#9ca3af" />
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        extraData={groups}
        contentContainerStyle={styles.listPadding}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate("MemberList", { group: item })} style={styles.card}>
            <Text style={styles.groupName}>{item.name}</Text>
            <View style={styles.rightIcons}>
              <Pressable onPress={(e) => { e.stopPropagation(); setGroups(p => p.map(x => x.id === item.id ? {...x, muted: !x.muted} : x)); }} style={styles.iconBtn}>
                <Text style={{ fontSize: 18 }}>{item.muted ? "🔇" : "🔈"}</Text>
              </Pressable>
              <Pressable onPress={(e) => { e.stopPropagation(); openMenu(item.id); }} style={styles.iconBtn}>
                <Text style={styles.icon}>⋯</Text>
              </Pressable>
            </View>
          </Pressable>
        )}
      />
      <Modal visible={menuOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={closeMenu}><View style={{ flex: 1 }} /></Pressable>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <TouchableOpacity style={styles.sheetItem} onPress={() => { setGroups(p => p.map(x => x.id === menuGroupId ? {...x, muted: !x.muted} : x)); closeMenu(); }}>
            <Text style={styles.sheetText}>{groups.find(x => x.id === menuGroupId)?.muted ? "開啟推播" : "關閉推播"}</Text>
          </TouchableOpacity>
          <View style={styles.sheetDivider} />
          <TouchableOpacity style={styles.sheetItem} onPress={() => { const g = groups.find(x => x.id === menuGroupId); closeMenu(); navigation.navigate("ReviewMembers", { group: g }); }}>
            <Text style={styles.sheetText}>審核新成員</Text>
          </TouchableOpacity>
          <View style={styles.sheetDivider} />
          <TouchableOpacity style={styles.sheetItem} onPress={leaveGroup}>
            <Text style={[styles.sheetText, { color: "#ef4444" }]}>退出群組</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.sheetItem, { marginTop: 8 }]} onPress={closeMenu}><Text style={[styles.sheetText, { color: "#6b7280" }]}>取消</Text></TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: { height: 56, justifyContent: "center", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  searchWrap: { padding: 16 },
  searchBox: { height: 46, borderRadius: 12, backgroundColor: "#f3f4f6", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#111827" },
  listPadding: { paddingHorizontal: 16 },
  card: { height: 60, borderRadius: 12, backgroundColor: "#f3f4f6", paddingHorizontal: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  groupName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  rightIcons: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { padding: 6 },
  icon: { fontSize: 18, color: "#111827" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 24, backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHandle: { width: 40, height: 5, borderRadius: 999, backgroundColor: "#e5e7eb", alignSelf: "center", marginBottom: 12 },
  sheetItem: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12 },
  sheetText: { fontSize: 15, fontWeight: "800", color: "#111827" },
  sheetDivider: { height: 1, backgroundColor: "#f3f4f6" },
});