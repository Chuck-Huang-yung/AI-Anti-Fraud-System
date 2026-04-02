import React from "react";
import RootNavigator from "./navigation/RootNavigator";
import { GroupProvider } from "./context/GroupContext";

export default function App() {
  return (
    <GroupProvider>
      <RootNavigator />
    </GroupProvider>
  );
}
