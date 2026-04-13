import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider, useThemeColors } from "@/providers/ThemeProvider";
import { ProfileProvider } from "@/providers/ProfileProvider";
import { DatabaseProvider } from "@/providers/DatabaseProvider";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { ObjectsProvider } from "@/providers/ObjectsProvider";
import { ChecklistsProvider } from "@/providers/ChecklistsProvider";
import { InventoryProvider } from "@/providers/InventoryProvider";
import { TasksProvider } from "@/providers/TasksProvider";
import { KnowledgeProvider } from "@/providers/KnowledgeProvider";
import { RemindersProvider } from "@/providers/RemindersProvider";
import { BackupProvider } from "@/providers/BackupProvider";
import { CommentsProvider, useComments } from "@/providers/CommentsProvider";
import { ChatProvider, useChat } from "@/providers/ChatProvider";
import { SyncPanelProvider } from "@/providers/SyncPanelProvider";
import { AccessCodeProvider } from "@/providers/AccessCodeProvider";
import { PinAuth } from "@/components/PinAuth";
import { initLogger } from "@/lib/logger";
import { db } from "@/config/firebase";
import { requestNotificationPermissions, setupNotificationChannels } from "@/lib/notifications";
import { registerPushToken } from "@/lib/pushNotifications";
import { ActivityIndicator, Platform, View, Image, Text, StyleSheet, useWindowDimensions } from "react-native";
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function useNotificationResponseHandler() {
  const router = useRouter();
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      console.log('[Notifications] Response received, data:', data);
      if (!data) return;

      if (data.type === 'chat' && data.masterId && data.subscriberId) {
        router.push({
          pathname: '/chat' as any,
          params: {
            masterId: data.masterId,
            subscriberId: data.subscriberId,
            partnerName: data.senderName || 'Чат',
          },
        });
        return;
      }

      const { commentId, entityType, entityId } = data;
      if (commentId && entityType && entityId) {
        if (entityType === 'work_entry') {
          router.push({
            pathname: '/(home)/object-detail' as any,
            params: { highlightComment: entityId },
          });
        } else if (entityType === 'inventory') {
          router.navigate('/(tabs)/inventory' as any);
        } else if (entityType === 'task') {
          router.push({
            pathname: '/reminders/create' as any,
            params: { editId: entityId },
          });
        } else {
          router.push('/notifications' as any);
        }
      }
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [router]);
}

function useBadgeCount() {
  const { unreadCount: commentUnread } = useComments();
  const { unreadMessagesCount: chatUnread } = useChat();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const total = commentUnread + chatUnread;
    Notifications.setBadgeCountAsync(total).catch(() => {});
    console.log('[Badge] Updated badge count:', total, '(comments:', commentUnread, 'chat:', chatUnread, ')');
  }, [commentUnread, chatUnread]);
}

function PushTokenRegistrar() {
  const { userId } = useComments();

  useEffect(() => {
    if (userId && Platform.OS !== 'web') {
      console.log('[Push] Registering push token for userId:', userId);
      registerPushToken(userId).catch(err => {
        console.log('[Push] Token registration error:', err);
      });
    }
  }, [userId]);

  return null;
}

function BadgeUpdater() {
  useBadgeCount();
  return null;
}

function RootLayoutNav() {
  const colors = useThemeColors();
  useNotificationResponseHandler();
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Назад",
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="backup" options={{ title: "Синхронизация" }} />
      <Stack.Screen name="excel" options={{ title: "Экспорт / Импорт" }} />
      <Stack.Screen name="sync-master" options={{ title: "Режим мастера" }} />
      <Stack.Screen name="sync-subscriber" options={{ title: "Подписка" }} />
      <Stack.Screen name="reminders/create" options={{ title: "Новая задача", headerShown: false }} />
      <Stack.Screen name="object/new-entry" options={{ title: "Новая запись" }} />
      <Stack.Screen name="object/add-contact" options={{ title: "Контакт" }} />
      <Stack.Screen name="notifications" options={{ title: "Уведомления" }} />
      <Stack.Screen name="chat" options={{ title: "Чат" }} />
      <Stack.Screen name="access-code" options={{ title: "Код доступа" }} />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}

function WebContainer({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const colors = useThemeColors();

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  if (width < 768) {
    return <>{children}</>;
  }

  return (
    <View style={webStyles.outerContainer}>
      <View style={[
        webStyles.innerContainer,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}>
        {children}
      </View>
    </View>
  );
}

const webStyles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    alignItems: 'center' as const,
    backgroundColor: '#0f0f14',
    paddingHorizontal: 24,
  },
  innerContainer: {
    flex: 1,
    width: '100%' as unknown as number,
    maxWidth: 1200,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden' as const,
  },
});

function AuthGate() {
  const { isAuthenticated, hasPin, pinEnabled, isLoading } = useAuth();
  const colors = useThemeColors();

  if (isLoading) {
    return (
      <View style={[loadingStyles.container, { backgroundColor: colors.background }]}>
        <Image
          source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/10gmvv4g5zd8evsone5fr.png' }}
          style={loadingStyles.icon}
        />
        <Text style={[loadingStyles.title, { color: colors.text }]}>Журнал мастера</Text>
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (hasPin && pinEnabled && !isAuthenticated) {
    return <PinAuth />;
  }

  if (!hasPin) {
    return <PinAuth />;
  }

  return (
    <WebContainer>
      <PushTokenRegistrar />
      <BadgeUpdater />
      <RootLayoutNav />
    </WebContainer>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: {
    width: 140,
    height: 140,
    borderRadius: 35,
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

export default function RootLayout() {
  useEffect(() => {
    void initLogger();
    console.log('[Firebase] DB ready:', !!db);
    void requestNotificationPermissions();
    void setupNotificationChannels();
    void SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <AuthProvider>
            <ProfileProvider>
              <DatabaseProvider>
                <ObjectsProvider>
                  <ChecklistsProvider>
                    <InventoryProvider>
                      <TasksProvider>
                        <KnowledgeProvider>
                          <RemindersProvider>
                            <BackupProvider>
                              <AccessCodeProvider>
                                <CommentsProvider>
                                  <ChatProvider>
                                    <SyncPanelProvider>
                                      <AuthGate />
                                    </SyncPanelProvider>
                                  </ChatProvider>
                                </CommentsProvider>
                              </AccessCodeProvider>
                            </BackupProvider>
                          </RemindersProvider>
                        </KnowledgeProvider>
                      </TasksProvider>
                    </InventoryProvider>
                  </ChecklistsProvider>
                </ObjectsProvider>
              </DatabaseProvider>
            </ProfileProvider>
          </AuthProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
