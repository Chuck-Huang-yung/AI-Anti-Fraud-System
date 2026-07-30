import React from "react";
import {
  NavigationContainer,
  getStateFromPath,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// 1. 引入原本的家庭群組頁面[cite: 4]
import AppMain from "../screens/AppMain"; //[cite: 4]
import AppTabs from "./AppTabs"; //[cite: 4]

// 2. 引入你獨立的新聞與防詐頁面[cite: 4]
import ScreenScamHome from "../screens/ScreenScamHome"; //[cite: 4]
import ScamMethods from "../screens/ScamMethods"; //[cite: 4]
import FraudDashboard from "../screens/FraudDashboard"; //[cite: 4]
import Feedback from "../screens/Feedback"; //[cite: 4]

// 3. 擴充 TypeScript 路由型別[cite: 4]
export type RootStackParamList = {
  Login: undefined; //[cite: 4]
  Tabs: undefined; //[cite: 4]
  ScreenScamHome: undefined; //[cite: 4]
  ScamMethods: undefined; //[cite: 4]
  FraudDashboard: undefined; //[cite: 4]
  Feedback: undefined; //[cite: 4]
};

const Stack = createNativeStackNavigator<RootStackParamList>(); //[cite: 4]

// 4. 🌟 神級關鍵：修正 Linking 網址解析邏輯[cite: 4]
const linking = {
  prefixes: [
    "https://*.loca.lt", //[cite: 4]
    "https://*.ngrok-free.app", //[cite: 4]
    "https://fraudchickenbye.com", //[cite: 4]
    "http://localhost:8081", //[cite: 4]
  ],
  config: {
    screens: {
      // 📰 你的新聞防詐獨立頁面[cite: 4]
      ScreenScamHome: "news", //[cite: 4]
      ScamMethods: "news/methods", //[cite: 4]
      FraudDashboard: "news/165", //[cite: 4]
      Feedback: "news/feedback", //[cite: 4]

      // 🏠 家庭群組頁面[cite: 4]
      Login: "group", //[cite: 4]
      Tabs: "group/tabs", //[cite: 4]
    },
  },
  // 🌟 強制 Web 讀取當前網址：如果網址包含 /news，絕對不載入 group！[cite: 4]
  getStateFromPath: (path: string, options: any) => {
    //[cite: 4]
    // 當訪問 / 或 /news 時，強制歸類對應頁面[cite: 4]
    if (path === "" || path === "/") {
      //[cite: 4]
      path = "group"; //[cite: 4]
    }
    return getStateFromPath(path, options); //[cite: 4]
  },
};

export default function RootNavigator() {
  return (
    <NavigationContainer
      linking={linking} //[cite: 4]
      // 🌟 唯一修改的地方：這裡換成動態判斷標題
      documentTitle={{
        formatter: (options, route) => {
          // 定義你的新聞防詐系統有包含哪些頁面
          const newsPages = [
            "ScreenScamHome",
            "ScamMethods",
            "FraudDashboard",
            "Feedback",
          ];

          // 如果現在所在的路由 (route.name) 屬於新聞頁面，就顯示新聞標題
          if (route?.name && newsPages.includes(route.name)) {
            return "真識監詐";
          }

          // 其他頁面（也就是 Login, Tabs 這些家庭群組頁面），就顯示家庭群組標題
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
