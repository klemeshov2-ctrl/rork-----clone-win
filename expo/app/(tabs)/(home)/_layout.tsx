import { Stack } from "expo-router";
import { useThemeColors } from "@/providers/ThemeProvider";

export default function HomeLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerBackTitle: "Назад",
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="object-detail" options={{ title: "Объект" }} />
      <Stack.Screen name="checklist-run" options={{ title: "Чек-лист" }} />
      <Stack.Screen name="checklist-result" options={{ title: "Результаты чек-листа" }} />
    </Stack>
  );
}
