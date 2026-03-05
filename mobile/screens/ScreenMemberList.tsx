import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
} from "react-native";

type GroupItem = { id: string; name: string; muted: boolean };
type Member = {
  id: string;
  name: string;
  role?: "管理員" | "成員";
  status?: "正常" | "可疑";
};

export default function ScreenMemberList({ navigation, route }: any) {
  const g: GroupItem = route.params.group;
  const [tab] = useState<"home" | "join" | "me">("home"); // 你如果不需要可刪

  const openMembers = (g: GroupItem) => {
    navigation.navigate("MemberList", { group: g });
  };

  const members: Member[] = useMemo(
    () => [
      { id: "m1", name: "爸爸", role: "管理員", status: "正常" },
      { id: "m2", name: "媽媽", role: "管理員", status: "正常" },
      { id: "m3", name: "弟弟", role: "成員", status: "可疑" },
      { id: "m4", name: "我", role: "成員", status: "正常" },
      { id: "m5", name: "阿嬤", role: "成員", status: "可疑" },
    ],
    [],
  );

  const onClose = () => navigation.goBack();
  const onBack = () => navigation.goBack();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={onBack} hitSlop={12}>
          <Text style={styles.headerIcon}>⌄</Text>
        </Pressable>

        <Text style={styles.headerTitle}>{g.name}</Text>

        <Pressable style={styles.headerBtn} onPress={onClose} hitSlop={12}>
          <Text style={styles.headerIcon}>✕</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <Text style={styles.subTitle}>群組成員</Text>
      </View>

      <FlatList
        data={members}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <View style={styles.memberCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={styles.memberMeta}>
                {item.role ?? "成員"} ・ {item.status ?? "正常"}
              </Text>
            </View>

            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>
                {item.status === "可疑" ? "❗可疑" : " ☑ 正常"}
              </Text>
            </View>
          </View>
        )}
      />
      {/* 注意：不要在這裡放底部 nav，Tabs 會統一顯示 */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  headerBtn: { width: 44, alignItems: "center", justifyContent: "center" },
  headerIcon: { fontSize: 22, fontWeight: "900", color: "#111827" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  subTitle: { fontSize: 14, fontWeight: "800", color: "#111827" },
  memberCard: {
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  memberName: { fontSize: 15, fontWeight: "800", color: "#111827" },
  memberMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statusPillText: { fontSize: 12, fontWeight: "900", color: "#111827" },
});
