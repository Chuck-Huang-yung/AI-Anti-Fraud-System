import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

export default function BottomNav(props: BottomTabBarProps) {
  const { state, navigation } = props;

  return (
    <View style={styles.nav}>
      <NavItem
        icon="🏠"
        label="首頁"
        active={state.index === 0}
        onPress={() => navigation.navigate("Home")}
      />
      <NavItem
        icon="➕"
        label="加入/創建"
        active={state.index === 1}
        onPress={() => navigation.navigate("JoinCreate")}
      />
      <NavItem
        icon="👤"
        label="個人"
        active={state.index === 2}
        onPress={() => navigation.navigate("Me")}
      />
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

const styles = StyleSheet.create({
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
});
