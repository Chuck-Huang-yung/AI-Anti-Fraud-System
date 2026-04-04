import React, { useMemo } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";

type GroupItem = { id: string; name: string; muted: boolean };

type Member = {
  id: string;
  name: string;
  role: "管理員" | "成員";
  status: "正常" | "可疑";
};

export default function ScreenMemberList({ navigation, route }: any) {
  // 取得從上一頁傳過來的群組資訊
  const group: GroupItem = route.params?.group || { name: "未知群組" };

  // 模擬成員資料（之後可以從 API 取得）
  const members: Member[] = useMemo(
    () => [
      { id: "m1", name: "爸爸", role: "管理員", status: "正常" },
      { id: "m2", name: "媽媽", role: "管理員", status: "正常" },
      { id: "m3", name: "弟弟", role: "成員", status: "可疑" },
      { id: "m4", name: "我", role: "成員", status: "正常" },
      { id: "m5", name: "阿嬤", role: "成員", status: "可疑" },
    ],
    []
  );

  const onBack = () => navigation.goBack();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header - 點擊標題可返回 */}
      <View style={styles.header}>
        <Pressable 
          style={styles.headerTitleContainer} 
          onPress={onBack}
          hitSlop={10}
        >
          <Text style={styles.headerTitle}>{group.name}</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.subTitle}>群組成員 ({members.length})</Text>
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <View style={styles.memberCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
            </View>
            
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={styles.memberRole}>{item.role}</Text>
            </View>

            <View style={[
              styles.statusTag, 
              item.status === "可疑" ? styles.statusAlert : styles.statusNormal
            ]}>
              <Text style={[
                styles.statusText,
                item.status === "可疑" ? styles.statusTextAlert : styles.statusTextNormal
              ]}>
                {item.status === "可疑" ? "⚠ 可疑" : "✓ 正常"}
              </Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  subTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#6b7280",
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  separator: {
    height: 12,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0px 1px 3px rgba(0,0,0,0.1)",
      } as any,
    }),
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4b5563",
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  memberRole: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
    marginTop: 2,
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusNormal: {
    backgroundColor: "#ecfdf5",
    borderColor: "#10b981",
  },
  statusAlert: {
    backgroundColor: "#fef2f2",
    borderColor: "#ef4444",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800",
  },
  statusTextNormal: {
    color: "#059669",
  },
  statusTextAlert: {
    color: "#dc2626",
  },
});