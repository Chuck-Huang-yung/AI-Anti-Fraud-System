import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
} from "react-native";

export default function App() {
  const [lineId, setLineId] = useState("");
  const [nickname, setNickname] = useState("");

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.iconBtn}>
          <Text style={styles.iconText}>⌄</Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable style={styles.iconBtn}>
          <Text style={styles.iconText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.introTitle}>歡迎使用家庭群組功能</Text>
        <Text style={styles.introText}>
          您必須先輸入您的「Line ID和暱稱」來讓我協助您建立群組{"\n"}
          請依照格式ID：XXXXXXXX
        </Text>

        <Text style={styles.label}>Line ID</Text>
        <TextInput
          value={lineId}
          onChangeText={setLineId}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 16 }]}>暱稱</Text>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          style={styles.input}
        />

        <Text style={styles.footerText}>
          如成員有詐騙警告將會立即通知全體群組成員
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 18,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  introTitle: {
    fontSize: 13,
    marginBottom: 8,
  },
  introText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    height: 44,
    backgroundColor: "#e5e7eb",
    borderRadius: 6,
    paddingHorizontal: 12,
  },
  footerText: {
    marginTop: 16,
    fontSize: 12,
  },
});
