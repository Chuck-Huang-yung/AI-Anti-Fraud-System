import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ScreenGroupList from "../screens/ScreenGroupList";
import ScreenMemberList from "../screens/ScreenMemberList";

export type HomeStackParamList = {
  GroupList: undefined;
  MemberList: { group: { id: string; name: string; muted: boolean } };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GroupList" component={ScreenGroupList} />
      <Stack.Screen name="MemberList" component={ScreenMemberList} />
    </Stack.Navigator>
  );
}
