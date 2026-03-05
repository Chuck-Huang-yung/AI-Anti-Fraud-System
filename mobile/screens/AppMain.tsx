import React, { useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

export default function AppMain({ navigation }: any) {
  const [lineId, setLineId] = useState("");
  const [nickname, setNickname] = useState("");

  // 簡單格式：英數 + . _ -
  const isLineIdValid = useMemo(() => {
    const v = lineId.trim();
    if (v.length < 3) return false;
    return /^[a-zA-Z0-9._-]+$/.test(v);
  }, [lineId]);

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

  const onNext = () => {
    const id = lineId.trim();
    const name = nickname.trim();

    if (!id) {
      Alert.alert("請輸入 Line ID");
      return;
    }
    if (!isLineIdValid) {
      Alert.alert("Line ID 格式不正確", "請輸入英數/._-，且至少 3 碼");
      return;
    }
    if (!name) {
      Alert.alert("請輸入暱稱");
      return;
    }

    // ✅ 登入成功 → 直接進 Tabs（Home/JoinCreate/Me）
    navigation.replace("Tabs");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.safe}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => navigation.goBack?.()}
              hitSlop={12}
              style={styles.iconBtn}
            >
              <Text style={styles.iconText}>⌄</Text>
            </Pressable>

            <View style={{ flex: 1 }} />

            <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
              <Text style={styles.iconText}>✕</Text>
            </Pressable>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>歡迎使用家庭群組功能</Text>
            <Text style={styles.desc}>
              您必須先輸入您的「Line ID 和暱稱」來讓我協助您建立群組{"\n"}
              請依照格式ID：XXXXXXXXXX
            </Text>

            <Text style={styles.label}>Line ID</Text>
            <TextInput
              value={lineId}
              onChangeText={setLineId}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder=""
              returnKeyType="next"
            />
            {lineId.trim().length > 0 && !isLineIdValid ? (
              <Text style={styles.helperText}>格式：英數/._-，至少 3 碼</Text>
            ) : null}

            <Text style={[styles.label, { marginTop: 18 }]}>暱稱</Text>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              style={styles.input}
              placeholder=""
              returnKeyType="done"
            />

            <Text style={styles.footerText}>
              如成員有詐騙警告將會立即通知全體群組成員
            </Text>

            <Pressable onPress={onNext} style={styles.nextBtn}>
              <Text style={styles.nextBtnText}>下一步</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { fontSize: 20, color: "#111827" },
  content: { paddingHorizontal: 18, paddingTop: 6 },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  desc: { fontSize: 14, lineHeight: 20, color: "#111827", marginBottom: 18 },
  label: { fontSize: 16, fontWeight: "600", color: "#111827", marginBottom: 8 },
  input: {
    height: 56,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#111827",
  },
  helperText: { marginTop: 8, fontSize: 12, color: "#6b7280" },
  footerText: {
    marginTop: 22,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  nextBtn: {
    marginTop: 24,
    height: 52,
    borderRadius: 10,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  nextBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
