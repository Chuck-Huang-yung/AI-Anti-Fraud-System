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
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={AppMain} />
        <Stack.Screen name="Tabs" component={AppTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
