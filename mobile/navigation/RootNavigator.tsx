import React from "react";
import { Platform } from "react-native";
import {
  NavigationContainer,
  getStateFromPath,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// 1. 引入原本的家庭群組頁面
import AppMain from "../screens/AppMain";
import AppTabs from "./AppTabs";

// 2. 引入你獨立的新聞與防詐頁面
import ScreenScamHome from "../screens/ScreenScamHome";
import ScamMethods from "../screens/ScamMethods";
import FraudDashboard from "../screens/FraudDashboard";
import Feedback from "../screens/Feedback";

// 3. 擴充 TypeScript 路由型別
export type RootStackParamList = {
  Login: undefined;
  Tabs: undefined;
  ScreenScamHome: undefined;
  ScamMethods: undefined;
  FraudDashboard: undefined;
  Feedback: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// 4. 🌟 神級關鍵：修正 Linking 網址解析邏輯，加入動態網域判斷
const linking = {
  prefixes: [
    "https://*.loca.lt",
    "https://*.ngrok-free.app",
    "https://fraudchickenbye.com",
    "https://*.fraudchickenbye.com", // 🌟 補上萬用字元，確保子網域 (news) 能被正確捕捉
    "http://localhost:8081",
  ],
  config: {
    screens: {
      // 📰 你的新聞防詐獨立頁面
      ScreenScamHome: "news",
      ScamMethods: "news/methods",
      FraudDashboard: "news/165",
      Feedback: "news/feedback",

      // 🏠 家庭群組頁面
      Login: "group",
      Tabs: "group/tabs",
    },
  },

  // 🌟 終極修復：根據網域，決定預設的首頁是誰！
  getStateFromPath: (path: string, options: any) => {
    // 確保只在 Web 網頁環境下執行網域判斷
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;

      // 情況 A：如果網址包含 'news'，且路徑是空的，直接指派為防詐首頁 ("news")
      if (hostname.includes("news") && (path === "" || path === "/")) {
        return getStateFromPath("news", options);
      }

      // 情況 B：如果是原本的網址 (不含 news)，且路徑是空的，指派為家庭群組 ("group")
      if (!hostname.includes("news") && (path === "" || path === "/")) {
        return getStateFromPath("group", options);
      }
    } else {
      // 給原生手機 App (iOS/Android) 的安全防呆預設值
      if (path === "" || path === "/") {
        path = "group";
      }
    }

    // 處理其他帶有具體路徑的情況
    return getStateFromPath(path, options);
  },
};

export default function RootNavigator() {
  return (
    <NavigationContainer
      linking={linking}
      documentTitle={{
        formatter: (options, route) => {
          const newsPages = [
            "ScreenScamHome",
            "ScamMethods",
            "FraudDashboard",
            "Feedback",
          ];

          if (route?.name && newsPages.includes(route.name)) {
            return "其他假新聞相關資訊";
          }

          return "詐騙掰家庭群組";
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* === 新聞與防詐小幫手獨立頁面 === */}
        <Stack.Screen name="ScreenScamHome" component={ScreenScamHome} />
        <Stack.Screen name="ScamMethods" component={ScamMethods} />
        <Stack.Screen name="FraudDashboard" component={FraudDashboard} />
        <Stack.Screen name="Feedback" component={Feedback} />

        {/* === 家庭群組獨立頁面 === */}
        <Stack.Screen name="Login" component={AppMain} />
        <Stack.Screen name="Tabs" component={AppTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
