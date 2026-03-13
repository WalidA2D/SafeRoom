import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#92B4A7",
        tabBarInactiveTintColor: "#64748B",
        tabBarStyle: { backgroundColor: "#FFFFFF" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Accueil" }} />
      <Tabs.Screen name="settings" options={{ title: "Paramètres" }} />
      <Tabs.Screen name="history" options={{ title: "Historique" }} />
      <Tabs.Screen name="inspection" options={{ title: "Inspection" }} />
    </Tabs>
  );
}