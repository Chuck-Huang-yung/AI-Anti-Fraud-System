import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  SafeAreaView,
  Platform,
} from "react-native";
import { useGroups } from "../context/GroupContext";

export default function ScreenReviewMembers({ navigation }: any) {
  const { pendingRequests, handleReview } = useGroups();

  const onConfirm = (req: any, approve: boolean) => {
    const action = approve ? "通過" : "拒絕";
    
    // 根據平台選擇確認方式
    if (Platform.OS === "web") {
      const confirm = window.confirm(`確定要${action} ${req.userName} 的加入申請嗎？`);
      if (confirm) {
        handleReview(req.userId, req.groupId, approve);
        checkAndRedirect();
      }
    } else {
      Alert.alert("審核操作", `確定要 ${action} ${req.userName} 的加入申請嗎？`, [
        { text: "取消", style: "cancel" },
        {
          text: "確定",
          style: approve ? "default" : "destructive",
          onPress: async () => {
            // 🌟 確保 Context 處理完畢
            await handleReview(req.userId, req.groupId, approve);
            checkAndRedirect();
          },
        },
      ]);
    }
  };

  // 檢查是否還有剩餘申請，若無則返回
  const checkAndRedirect = () => {
    if (pendingRequests.length <= 1) {
      setTimeout(() => {
        navigation.goBack();
      }, 800);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 自定義 Header */}
      <View style={styles.header}>
        <Pressable 
          onPress={() => navigation.goBack()} 
          style={styles.backBtn}
          hitSlop={20}
        >
          <Text style={styles.backIcon}>〈</Text>
        </Pressable>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>新成員申請審核</Text>
          <Text style={styles.subtitle}>
            共有 {pendingRequests.length} 位待處理
          </Text>
        </View>

        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={pendingRequests}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.requestCard}>
            <View style={styles.userInfo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.userName.charAt(0)}</Text>
              </View>
              <View style={styles.textDetails}>
                <Text style={styles.userName}>{item.userName}</Text>
                <Text style={styles.userId}>Line ID: {item.userId}</Text>
              </View>
            </View>

            <View style={styles.btnGroup}>
              <Pressable
                onPress={() => onConfirm(item, false)}
                style={styles.rejectBtn}
              >
                <Text style={styles.rejectBtnText}>拒絕</Text>
              </Pressable>

              <Pressable
                onPress={() => onConfirm(item, true)}
                style={styles.approveBtn}
              >
                <Text style={styles.approveBtnText}>通過</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.empty}>目前沒有待審核的申請</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingHorizontal: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    fontSize: 22,
    fontWeight: "300",
    color: "#111827",
  },
  headerTitleWrap: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center" 
  },
  title: {
    fontSize: 17,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    textAlign: "center",
  },
  listContent: { padding: 16 },
  requestCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  userInfo: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "800", color: "#4B5563" },
  textDetails: { marginLeft: 12 },
  userName: { fontSize: 17, fontWeight: "800", color: "#111827" },
  userId: { fontSize: 13, color: "#9CA3AF", marginTop: 2 },
  btnGroup: {
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },
  approveBtn: {
    flex: 1,
    height: 44,
    backgroundColor: "#111827",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  rejectBtn: {
    flex: 1,
    height: 44,
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnText: { color: "#EF4444", fontWeight: "800", fontSize: 15 },
  emptyBox: { alignItems: "center", justifyContent: "center", marginTop: 100 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  empty: { fontSize: 15, color: "#9CA3AF", fontWeight: "600" },
});