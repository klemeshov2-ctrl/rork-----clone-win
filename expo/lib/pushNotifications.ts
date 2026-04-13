import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { firestore } from '@/config/firebase';
import { doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';
import Constants from 'expo-constants';

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

export async function registerPushToken(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    console.log('[Push] Web platform, skipping token registration');
    return null;
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Общие',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        lightColor: '#FF231F7C',
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
      await Notifications.setNotificationChannelAsync('comments_channel', {
        name: 'Комментарии',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });
      console.log('[Push] Android all notification channels created');
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      'zhurnal-mastera';

    console.log('[Push] Using projectId:', projectId);
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    console.log('[Push] Got Expo push token:', token);

    await setDoc(doc(firestore, 'push_tokens', userId), {
      token,
      userId,
      platform: Platform.OS,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    console.log('[Push] Token saved to Firestore for userId:', userId);
    return token;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[Push] registerPushToken error:', msg);
    return null;
  }
}

export async function getTokensForUser(userId: string): Promise<string[]> {
  try {
    const docSnap = await getDoc(doc(firestore, 'push_tokens', userId));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.token) return [data.token];
    }
    return [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[Push] getTokensForUser error:', msg);
    return [];
  }
}

export async function getTokensForUsers(userIds: string[]): Promise<string[]> {
  const tokens: string[] = [];
  const unique = [...new Set(userIds.filter(Boolean))];
  
  for (const uid of unique) {
    const userTokens = await getTokensForUser(uid);
    tokens.push(...userTokens);
  }
  return tokens;
}

export async function getTokensByMasterId(masterId: string, excludeUserId?: string): Promise<string[]> {
  try {
    const tokens: string[] = [];

    const masterTokens = await getTokensForUser(masterId);
    tokens.push(...masterTokens);

    const subsQuery = query(
      collection(firestore, 'subscriptions'),
      where('masterId', '==', masterId)
    );
    const subsSnap = await getDocs(subsQuery);
    const subscriberIds: string[] = [];
    subsSnap.docs.forEach(d => {
      const data = d.data();
      if (typeof data.subscriberId === 'string') {
        subscriberIds.push(data.subscriberId);
      }
    });

    for (const subId of subscriberIds) {
      const subTokens = await getTokensForUser(subId);
      tokens.push(...subTokens);
    }

    if (excludeUserId) {
      const excludeTokens = await getTokensForUser(excludeUserId);
      const excludeSet = new Set(excludeTokens);
      return tokens.filter(t => !excludeSet.has(t));
    }

    return tokens;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[Push] getTokensByMasterId error:', msg);
    return [];
  }
}

interface PushPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  channelId?: string;
  sound?: string;
  priority?: string;
  badge?: number;
  ttl?: number;
  _contentAvailable?: boolean;
  _mutableContent?: boolean;
}

export async function sendPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
  channelId?: string,
): Promise<void> {
  if (tokens.length === 0) {
    console.log('[Push] No tokens to send to');
    return;
  }

  const validTokens = tokens.filter(t => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));
  if (validTokens.length === 0) {
    console.log('[Push] No valid Expo push tokens found');
    return;
  }

  const messages: PushPayload[] = validTokens.map(token => ({
    to: token,
    title,
    body,
    data,
    channelId: channelId || 'default',
    sound: 'default',
    priority: 'high',
    badge: 1,
    ttl: 2419200,
    _contentAvailable: true,
    _mutableContent: true,
  }));

  try {
    console.log('[Push] Sending', messages.length, 'push notifications');
    const response = await fetch(EXPO_PUSH_API, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    console.log('[Push] Send result:', JSON.stringify(result).substring(0, 300));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[Push] sendPushNotifications error:', msg);
  }
}

export async function sendChatPush(
  recipientIds: string[],
  senderName: string,
  text: string,
  masterId: string,
  subscriberId: string,
  excludeSenderId?: string,
): Promise<void> {
  try {
    const tokens = await getTokensForUsers(recipientIds);
    
    let filteredTokens = tokens;
    if (excludeSenderId) {
      const senderTokens = await getTokensForUser(excludeSenderId);
      const senderSet = new Set(senderTokens);
      filteredTokens = tokens.filter(t => !senderSet.has(t));
    }

    await sendPushNotifications(
      filteredTokens,
      senderName,
      text.substring(0, 200),
      { type: 'chat', masterId, subscriberId, senderName },
      'chat_channel',
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[Push] sendChatPush error:', msg);
  }
}

export async function sendCommentPush(
  masterId: string,
  authorName: string,
  text: string,
  entityType: string,
  entityId: string,
  excludeUserId?: string,
): Promise<void> {
  try {
    const tokens = await getTokensByMasterId(masterId, excludeUserId);

    const entityLabel = entityType === 'work_entry' ? 'Запись работ'
      : entityType === 'inventory' ? 'Склад'
      : entityType === 'task' ? 'Задача' : 'Комментарий';

    await sendPushNotifications(
      tokens,
      `${authorName} - ${entityLabel}`,
      text.substring(0, 200),
      { type: 'comment', entityType, entityId },
      'comments_channel',
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[Push] sendCommentPush error:', msg);
  }
}
