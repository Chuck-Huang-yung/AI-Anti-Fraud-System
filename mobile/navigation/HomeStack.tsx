import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// 引入你的頁面
import ScreenGroupList from "../screens/ScreenGroupList";
import ScreenMemberList from "../screens/ScreenMemberList";
import ScreenReviewMembers from "../screens/ScreenReviewMembers";

const Stack = createNativeStackNavigator();

export default function HomeStack() {
  return (
    <Stack.Navigator 
      // 🌟 重點：加上這一行，關閉 HomeStack 內部所有頁面的預設 Header
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="GroupList" component={ScreenGroupList} />
      <Stack.Screen name="MemberList" component={ScreenMemberList} />
      <Stack.Screen name="ReviewMembers" component={ScreenReviewMembers} />
    </Stack.Navigator>
  );
}