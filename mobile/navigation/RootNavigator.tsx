import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import AppMain from "../screens/AppMain";
import AppTabs from "./AppTabs";

export type RootStackParamList = {
  Login: undefined;
  Tabs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    // 🌟 加入 documentTitle 設定：強制指定 LINE / 瀏覽器頂部視窗永遠顯示固定的中文名稱！
    <NavigationContainer
      documentTitle={{
        formatter: () => "真識監詐", // 💡 可以改成你們系統/專題的正式名稱
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={AppMain} />
        <Stack.Screen name="Tabs" component={AppTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
