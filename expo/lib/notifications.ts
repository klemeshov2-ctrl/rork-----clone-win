import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Task } from '@/types';

const NOTIFICATION_IDS_KEY = 'task_notification_ids';

interface NotificationIdsMap {
  [taskId: string]: string[];
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('comments_channel', {
      name: 'Комментарии',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });
    await Notifications.setNotificationChannelAsync('chat_channel', {
      name: 'Чат',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Общие',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });
    console.log('[Notifications] Android channels created');
  } catch (err) {
    console.log('[Notifications] Error creating channels:', err);
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    console.log('[Notifications] Web platform, skipping permissions');
    return false;
  }
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    console.log('[Notifications] Permission status:', finalStatus);
    return finalStatus === 'granted';
  } catch (err) {
    console.log('[Notifications] Error requesting permissions:', err);
    return false;
  }
}

async function loadNotificationIds(): Promise<NotificationIdsMap> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_IDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveNotificationIds(map: NotificationIdsMap): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_IDS_KEY, JSON.stringify(map));
  } catch (err) {
    console.log('[Notifications] Error saving notification IDs:', err);
  }
}

function getTaskTriggerDate(task: Task): Date | null {
  if (!task.dueDate) return null;
  const triggerDate = new Date(task.dueDate);
  if (task.dueTime) {
    const [h, m] = task.dueTime.split(':').map(Number);
    triggerDate.setHours(h, m, 0, 0);
  } else {
    triggerDate.setHours(9, 0, 0, 0);
  }
  return triggerDate;
}

export async function scheduleTaskNotifications(
  task: Task,
  objectName?: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (task.isCompleted) return;

  const triggerDate = getTaskTriggerDate(task);
  if (!triggerDate) return;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await cancelTaskNotifications(task.id);
  const now = Date.now();
  const notificationIds: string[] = [];

  const typeLabel = task.type === 'request' ? 'Заявка' : 'Напоминание';
  const objectSuffix = objectName ? ` (Объект: ${objectName})` : '';
  const taskBody = `${task.title}${objectSuffix}`;

  const trigger24h = new Date(triggerDate.getTime() - 24 * 60 * 60 * 1000);
  if (trigger24h.getTime() > now) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${typeLabel} через 24 часа`,
          body: taskBody,
          data: { taskId: task.id, objectId: task.objectId, taskType: task.type },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: trigger24h,
        },
      });
      notificationIds.push(id);
      console.log(`[Notifications] Scheduled 24h notification for task ${task.id}: ${id}`);
    } catch (err) {
      console.log('[Notifications] Error scheduling 24h notification:', err);
    }
  }

  const trigger1h = new Date(triggerDate.getTime() - 60 * 60 * 1000);
  if (trigger1h.getTime() > now) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${typeLabel} через 1 час`,
          body: taskBody,
          data: { taskId: task.id, objectId: task.objectId, taskType: task.type },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: trigger1h,
        },
      });
      notificationIds.push(id);
      console.log(`[Notifications] Scheduled 1h notification for task ${task.id}: ${id}`);
    } catch (err) {
      console.log('[Notifications] Error scheduling 1h notification:', err);
    }
  }

  if (notificationIds.length > 0) {
    const map = await loadNotificationIds();
    map[task.id] = notificationIds;
    await saveNotificationIds(map);
  }
}

export async function cancelTaskNotifications(taskId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const map = await loadNotificationIds();
    const ids = map[taskId];
    if (ids && ids.length > 0) {
      for (const id of ids) {
        try {
          await Notifications.cancelScheduledNotificationAsync(id);
          console.log(`[Notifications] Cancelled notification ${id} for task ${taskId}`);
        } catch (err) {
          console.log(`[Notifications] Error cancelling notification ${id}:`, err);
        }
      }
      delete map[taskId];
      await saveNotificationIds(map);
    }
  } catch (err) {
    console.log('[Notifications] Error in cancelTaskNotifications:', err);
  }
}

export async function rescheduleAllTaskNotifications(
  tasks: Task[],
  getObjectName?: (objectId: string) => string | undefined
): Promise<void> {
  if (Platform.OS === 'web') return;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  console.log('[Notifications] Rescheduling all task notifications...');

  await Notifications.cancelAllScheduledNotificationsAsync();
  await saveNotificationIds({});

  const activeTasks = tasks.filter(t => !t.isCompleted);
  for (const task of activeTasks) {
    const objectName = task.objectId && getObjectName ? getObjectName(task.objectId) : undefined;
    await scheduleTaskNotifications(task, objectName);
  }

  console.log(`[Notifications] Rescheduled notifications for ${activeTasks.length} active tasks`);
}
