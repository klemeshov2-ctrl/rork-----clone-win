import { Tabs } from "expo-router";
import { LayoutList, Package, ListChecks, BookOpen, Settings } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { useThemeColors } from "@/providers/ThemeProvider";
import { SyncFloatingButton } from "@/components/SyncFloatingButton";
import { SyncBottomSheet } from "@/components/SyncBottomSheet";

export default function TabLayout() {
  const colors = useThemeColors();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.tabIconDefault,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="(home)"
          options={{
            title: "Объекты",
            tabBarIcon: ({ color }) => <LayoutList size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: "Склад",
            tabBarIcon: ({ color }) => <Package size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="checklists"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="reminders"
          options={{
            title: "Задачи",
            tabBarIcon: ({ color }) => <ListChecks size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="knowledge"
          options={{
            title: "Знания",
            tabBarIcon: ({ color }) => <BookOpen size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Настройки",
            tabBarIcon: ({ color }) => <Settings size={22} color={color} />,
          }}
        />
      </Tabs>
      <SyncFloatingButton />
      <SyncBottomSheet />
    </View>
  );
}
