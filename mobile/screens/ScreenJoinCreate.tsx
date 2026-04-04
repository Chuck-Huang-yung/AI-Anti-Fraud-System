import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  SafeAreaView,
  ScrollView,
  Clipboard,
  Platform,
  TouchableOpacity,
  KeyboardAvoidingView,
} from "react-native";
import { useGroups } from "../context/GroupContext";

export default function ScreenJoinCreate({ navigation }: any) {
  const [isCreate, setIsCreate] = useState(true);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [joinId, setJoinId] = useState("");
  const [createdGroupId, setCreatedGroupId] = useState("");

  const { groups, createGroup, joinGroupById } = useGroups();

  const handleCreateGroup = async () => {
    if (!groupNameInput.trim()) return Alert.alert("提示", "請輸入群組名稱");
    const newId = await createGroup(groupNameInput);
    setCreatedGroupId(newId); 
    Alert.alert("獲取成功", `群組代碼：${newId}`, [
      { text: "複製代碼", onPress: () => Clipboard.setString(newId) },
      { text: "確定" }
    ]);
  };

  const handleJoinGroup = async () => {
    if (!joinId.trim()) return Alert.alert("提示", "請輸入群組 ID");
    const success = await joinGroupById(joinId.toUpperCase());
    if (success) {
      Alert.alert("已加入", "群組名稱已同步至首頁", [{ text: "OK", onPress: () => navigation.navigate("Home") }]);
      setJoinId("");
    } else {
      Alert.alert("錯誤", "無效的代碼");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={styles.headerSideSpace} />
          <Text style={styles.headerTitle}>加入 / 創建</Text>
          <View style={styles.headerSideSpace} />
        </View>

        <View style={styles.tabWrapper}>
          <Pressable onPress={() => setIsCreate(true)} style={[styles.tab, isCreate && styles.activeTab]}><Text style={[styles.tabText, isCreate && styles.activeTabText]}>創建</Text></Pressable>
          <Pressable onPress={() => setIsCreate(false)} style={[styles.tab, !isCreate && styles.activeTab]}><Text style={[styles.tabText, !isCreate && styles.activeTabText]}>加入</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.formCard}>
            {isCreate ? (
              <View>
                <Text style={styles.label}>群組名稱</Text>
                <TextInput value={groupNameInput} onChangeText={setGroupNameInput} placeholder="family" placeholderTextColor="#9ca3af" style={styles.input} />
                <Text style={styles.label}>群組 ID（創建後固定）</Text>
                <View style={styles.idRow}>
                  <TextInput value={createdGroupId} editable={false} placeholder="點擊下方按鈕獲取" style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: "#f3f4f6" }]} />
                  <TouchableOpacity onPress={() => createdGroupId && Clipboard.setString(createdGroupId)} style={styles.copyBtn}><Text style={styles.copyBtnText}>複製</Text></TouchableOpacity>
                </View>
                <View style={styles.spacer} />
                <Pressable onPress={handleCreateGroup} style={styles.primaryBtn}><Text style={styles.primaryText}>獲取群組代碼</Text></Pressable>
              </View>
            ) : (
              <View>
                <Text style={styles.label}>輸入群組 ID</Text>
                <TextInput value={joinId} onChangeText={(t) => setJoinId(t.toUpperCase())} placeholder="貼上代碼..." placeholderTextColor="#9ca3af" style={styles.input} />
                <Pressable onPress={handleJoinGroup} style={styles.primaryBtn}><Text style={styles.primaryText}>確認加入</Text></Pressable>
              </View>
            )}
          </View>

          <View style={styles.localListWrapper}>
            <Text style={styles.localListTitle}>已記錄群組（本機）</Text>
            {groups.map((g) => (
              <Pressable key={g.id} style={styles.localItem} onPress={() => isCreate ? (setGroupNameInput(g.name), setCreatedGroupId(g.id)) : setJoinId(g.id)}>
                <Text style={styles.itemGroupName}>{g.name}</Text>
                <Text style={styles.itemGroupId}>{g.id}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  headerSideSpace: { width: 44 },
  headerTitle: { fontSize: 17, fontWeight: "900", color: "#111827" },
  tabWrapper: { flexDirection: "row", padding: 16, gap: 12 },
  tab: { flex: 1, height: 48, borderRadius: 14, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  activeTab: { backgroundColor: "#111827" },
  tabText: { fontSize: 15, fontWeight: "700", color: "#6b7280" },
  activeTabText: { color: "#fff" },
  scrollContent: { padding: 16 },
  formCard: { backgroundColor: "#f9fafb", borderRadius: 24, padding: 24, borderWidth: 1, borderColor: "#f3f4f6" },
  label: { fontSize: 14, fontWeight: "800", color: "#4b5563", marginBottom: 12 },
  input: { height: 54, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 16, fontSize: 16, color: "#111827", borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 24 },
  idRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  copyBtn: { width: 60, height: 54, backgroundColor: "#f3f4f6", borderRadius: 14, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb" },
  copyBtnText: { color: "#111827", fontWeight: "700", fontSize: 14 },
  spacer: { height: 10 },
  primaryBtn: { height: 54, backgroundColor: "#111827", borderRadius: 14, justifyContent: "center", alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  localListWrapper: { marginTop: 30, paddingBottom: 20 },
  localListTitle: { fontSize: 15, fontWeight: "800", color: "#111827", marginBottom: 12 },
  localItem: { backgroundColor: "#fff", padding: 16, borderRadius: 14, borderWidth: 1, borderColor: "#f3f4f6", marginBottom: 10 },
  itemGroupName: { fontSize: 16, fontWeight: "800", color: "#111827" },
  itemGroupId: { fontSize: 13, color: "#9ca3af", marginTop: 4 },
});