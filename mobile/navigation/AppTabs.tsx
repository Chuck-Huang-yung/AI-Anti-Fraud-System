import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import HomeStack from "./HomeStack";
import ScreenJoinCreate from "../screens/ScreenJoinCreate";
import ScreenMe from "../screens/ScreenMe";
import BottomNav from "../components/BottomNav";

export type TabParamList = {
  Home: undefined;
  JoinCreate: undefined;
  Me: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export default function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomNav {...props} />}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="JoinCreate" component={ScreenJoinCreate} />
      <Tab.Screen name="Me" component={ScreenMe} />
    </Tab.Navigator>
  );
}
