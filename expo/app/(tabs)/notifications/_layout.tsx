import { Stack } from 'expo-router';
import React from 'react';
import { useThemeColors } from '@/providers/ThemeProvider';

export default function NotificationsLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Уведомления' }} />
    </Stack>
  );
}
