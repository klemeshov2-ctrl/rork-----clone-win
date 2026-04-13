import { Stack } from "expo-router";
import { useThemeColors } from "@/providers/ThemeProvider";

export default function SettingsLayout() {
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
      <Stack.Screen name="help" options={{ title: 'Справка' }} />
      <Stack.Screen name="logs" options={{ title: 'Журнал ошибок' }} />
    </Stack>
  );
}
