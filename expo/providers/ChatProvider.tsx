import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { auth, firestore } from '@/config/firebase';
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  orderBy,
  limit,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  writeBatch,
} from 'firebase/firestore';
import { useBackup } from './BackupProvider';
import { useProfile } from './ProfileProvider';
import { useComments } from './CommentsProvider';
import { useAccessCode } from './AccessCodeProvider';
import type { ChatMessage, ChatDialog } from '@/types';
import * as Notifications from 'expo-notifications';
import { sendChatPush } from '@/lib/pushNotifications';

const DISPLAY_NAME_KEY = '@user_display_name';
const READ_MESSAGE_IDS_KEY = '@read_message_ids';

interface ChatContextType {
  chats: ChatDialog[];
  messages: ChatMessage[];
  loadMessages: (masterId: string, subscriberId: string) => void;
  unloadMessages: () => void;
  sendMessage: (masterId: string, subscriberId: string, text: string) => Promise<void>;
  deleteChat: (masterId: string, subscriberId: string) => Promise<void>;
  markChatAsRead: (masterId: string, subscriberId: string) => void;
  unreadMessagesCount: number;
  isLoadingChats: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  isDeleting: boolean;
  userId: string | null;
}

function getChatDocId(masterId: string, subscriberId: string): string {
  return `${masterId}_${subscriberId}`;
}

export const [ChatProvider, useChat] = createContextHook<ChatContextType>(() => {
  const { userEmail, masterId: backupMasterId, subscriptions, firestoreUid } = useBackup();
  const { activeProfileId, isSubscriberProfile } = useProfile();
  const { userId: commentsUserId, displayName } = useComments();
  const { isAccessGranted } = useAccessCode();

  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatDialog[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const messagesUnsubRef = useRef<(() => void) | null>(null);
  const chatsUnsubRef = useRef<(() => void) | null>(null);
  const globalMsgUnsubRef = useRef<(() => void) | null>(null);
  const prevMessageIdsRef = useRef<Set<string>>(new Set());
  const prevGlobalMsgIdsRef = useRef<Set<string>>(new Set());
  const activeLoadedChatRef = useRef<string | null>(null);


  useEffect(() => {
    console.log('[Chat][DEBUG] commentsUserId changed:', commentsUserId, '| prev userId:', userId, '| firestoreUid:', firestoreUid, '| backupMasterId:', backupMasterId);
    if (commentsUserId && firestoreUid && commentsUserId !== firestoreUid) {
      console.log('[Chat][WARN] commentsUserId and firestoreUid mismatch! commentsUserId:', commentsUserId, 'firestoreUid:', firestoreUid);
    }
    setUserId(commentsUserId);
  }, [commentsUserId]);

  useEffect(() => {
    AsyncStorage.getItem(READ_MESSAGE_IDS_KEY).then(stored => {
      if (stored) {
        try {
          const ids = JSON.parse(stored) as string[];
          setReadMessageIds(new Set(ids));
        } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  const persistReadIds = useCallback((ids: Set<string>) => {
    const arr = Array.from(ids);
    AsyncStorage.setItem(READ_MESSAGE_IDS_KEY, JSON.stringify(arr)).catch(() => {});
  }, []);

  const activeMasterId = useMemo(() => {
    let result: string | null;
    if (!isSubscriberProfile) {
      result = backupMasterId || userId;
    } else {
      const activeSub = subscriptions.find(s => s.id === activeProfileId);
      if (activeSub?.masterId) {
        result = activeSub.masterId;
      } else {
        result = backupMasterId || userId;
      }
    }
    console.log('[Chat][DEBUG] activeMasterId computed:', result, '| isSubscriber:', isSubscriberProfile, '| backupMasterId:', backupMasterId, '| userId:', userId, '| activeProfileId:', activeProfileId);
    return result;
  }, [isSubscriberProfile, activeProfileId, subscriptions, backupMasterId, userId]);

  const relevantMasterIds = useMemo(() => {
    const ids = new Set<string>();
    if (backupMasterId) ids.add(backupMasterId);
    if (userId) ids.add(userId);
    if (firestoreUid && firestoreUid !== userId) ids.add(firestoreUid);
    subscriptions.forEach(s => {
      if (s.masterId) ids.add(s.masterId);
    });
    const result = Array.from(ids).filter(Boolean);
    console.log('[Chat][DEBUG] relevantMasterIds computed:', result, '| backupMasterId:', backupMasterId, '| userId:', userId, '| firestoreUid:', firestoreUid, '| subscriptions masterId list:', subscriptions.map(s => s.masterId));
    return result;
  }, [backupMasterId, userId, firestoreUid, subscriptions]);

  useEffect(() => {
    if (!userId) return;
    const masterIdsForQuery = relevantMasterIds.length > 0 ? relevantMasterIds.slice(0, 30) : [userId];
    console.log('[Chat] Setting up global messages listener for notifications, masterIds:', masterIdsForQuery);

    if (globalMsgUnsubRef.current) {
      globalMsgUnsubRef.current();
      globalMsgUnsubRef.current = null;
    }

    prevGlobalMsgIdsRef.current = new Set();

    try {
      const q = query(
        collection(firestore, 'messages'),
        where('masterId', 'in', masterIdsForQuery),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const processGlobalSnapshot = (docs: Array<{ id: string; data: () => Record<string, unknown> }>) => {
        const newIds = new Set<string>();
        const freshMessages: Array<{ id: string; senderId: string; senderName: string; text: string; masterId: string; subscriberId: string }> = [];

        docs.forEach((d) => {
          const data = d.data();
          newIds.add(d.id);
          if (
            prevGlobalMsgIdsRef.current.size > 0 &&
            !prevGlobalMsgIdsRef.current.has(d.id) &&
            typeof data.senderId === 'string' &&
            data.senderId !== userId
          ) {
            const chatKey = `${data.masterId}_${data.subscriberId}`;
            if (activeLoadedChatRef.current !== chatKey) {
              freshMessages.push({
                id: d.id,
                senderId: data.senderId as string,
                senderName: typeof data.senderName === 'string' ? data.senderName : 'Сообщение',
                text: typeof data.text === 'string' ? data.text : '',
                masterId: typeof data.masterId === 'string' ? data.masterId : '',
                subscriberId: typeof data.subscriberId === 'string' ? data.subscriberId : '',
              });
            }
          }
        });

        console.log('[Chat] Global messages snapshot: total=', docs.length, 'fresh=', freshMessages.length, 'prevSize=', prevGlobalMsgIdsRef.current.size);

        if (freshMessages.length > 0 && Platform.OS !== 'web') {
          console.log('[Chat] Scheduling', Math.min(freshMessages.length, 3), 'chat notifications');
          for (const m of freshMessages.slice(0, 3)) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: `${m.senderName}`,
                body: m.text.substring(0, 100),
                data: { type: 'chat', masterId: m.masterId, subscriberId: m.subscriberId, senderName: m.senderName },
                ...(Platform.OS === 'android' ? { channelId: 'chat_channel' } : {}),
              },
              trigger: null,
            }).catch((err) => {
              console.log('[Chat] Global notification error:', err);
            });
          }
        }

        prevGlobalMsgIdsRef.current = newIds;
      };

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          processGlobalSnapshot(snapshot.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
        },
        async (error) => {
          const errMsg = error?.message || '';
          console.log('[Chat] Global messages listener error:', errMsg, '| isIndex:', errMsg.includes('index') || errMsg.includes('Index'), '| isPerm:', errMsg.includes('permission') || errMsg.includes('insufficient'));
          console.log('[Chat] Falling back to getDocs for global messages...');
          try {
            const fallbackQ = query(
              collection(firestore, 'messages'),
              where('masterId', 'in', masterIdsForQuery),
              limit(50)
            );
            const snapshot = await getDocs(fallbackQ);
            processGlobalSnapshot(snapshot.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
            console.log('[Chat] getDocs fallback for global messages succeeded, got', snapshot.docs.length);
          } catch (fbErr: unknown) {
            const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
            console.log('[Chat] getDocs fallback for global messages also failed:', fbMsg);
          }
        }
      );

      globalMsgUnsubRef.current = unsubscribe;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('[Chat] Global messages listener setup error:', msg);
    }

    return () => {
      if (globalMsgUnsubRef.current) {
        globalMsgUnsubRef.current();
        globalMsgUnsubRef.current = null;
      }
    };
  }, [userId, relevantMasterIds]);

  useEffect(() => {
    if (!userId) return;
    console.log('[Chat] Setting up chats subscription, userId:', userId);
    setIsLoadingChats(true);

    if (chatsUnsubRef.current) {
      chatsUnsubRef.current();
      chatsUnsubRef.current = null;
    }

    const isMaster = !isSubscriberProfile;

    try {
      const q = query(
        collection(firestore, 'chats'),
        where('participants', 'array-contains', userId),
        orderBy('lastMessageTime', 'desc'),
        limit(100)
      );

      const parseChatDocs = (snapshotDocs: Array<{ id: string; data: () => Record<string, unknown> }>): ChatDialog[] => {
        const docs: ChatDialog[] = [];
        snapshotDocs.forEach((d) => {
          const data = d.data();
          const lastMessageTime = data.lastMessageTime instanceof Timestamp
            ? data.lastMessageTime.toMillis()
            : (typeof data.lastMessageTime === 'number' ? data.lastMessageTime : Date.now());
          docs.push({
            id: d.id,
            masterId: typeof data.masterId === 'string' ? data.masterId : '',
            subscriberId: typeof data.subscriberId === 'string' ? data.subscriberId : '',
            masterName: typeof data.masterName === 'string' ? data.masterName : 'Мастер',
            subscriberName: typeof data.subscriberName === 'string' ? data.subscriberName : 'Подписчик',
            lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
            lastMessageTime,
            lastSenderId: typeof data.lastSenderId === 'string' ? data.lastSenderId : '',
            unreadForMaster: typeof data.unreadForMaster === 'number' ? data.unreadForMaster : (typeof data.unreadCount === 'number' ? data.unreadCount : 0),
            unreadForSubscriber: typeof data.unreadForSubscriber === 'number' ? data.unreadForSubscriber : 0,
          });
        });
        return docs;
      };

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const docs = parseChatDocs(snapshot.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
          console.log('[Chat] Chats snapshot received:', docs.length);
          setChats(docs);
          setIsLoadingChats(false);
        },
        async (error) => {
          const errMsg = error?.message || '';
          console.log('[Chat] Chats subscription error:', errMsg, '| isIndex:', errMsg.includes('index') || errMsg.includes('Index'), '| isPerm:', errMsg.includes('permission') || errMsg.includes('insufficient'));
          console.log('[Chat] Falling back to getDocs for chats...');
          try {
            const fallbackQ = query(
              collection(firestore, 'chats'),
              where('participants', 'array-contains', userId),
              limit(100)
            );
            const snapshot = await getDocs(fallbackQ);
            const docs = parseChatDocs(snapshot.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
            docs.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
            console.log('[Chat] getDocs fallback for chats succeeded, got', docs.length);
            setChats(docs);
          } catch (fbErr: unknown) {
            const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
            console.log('[Chat] getDocs fallback for chats also failed:', fbMsg);
          }
          setIsLoadingChats(false);
        }
      );

      chatsUnsubRef.current = unsubscribe;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('[Chat] Chats subscription setup error:', msg);
      setIsLoadingChats(false);
    }

    return () => {
      if (chatsUnsubRef.current) {
        chatsUnsubRef.current();
        chatsUnsubRef.current = null;
      }
    };
  }, [userId, isSubscriberProfile, relevantMasterIds]);

  const unreadMessagesCount = useMemo(() => {
    if (!userId) return 0;
    let count = 0;
    chats.forEach(chat => {
      const iAmMaster = chat.masterId === userId || (!isSubscriberProfile && relevantMasterIds.includes(chat.masterId));
      if (iAmMaster) {
        count += chat.unreadForMaster || 0;
      } else if (chat.subscriberId === userId) {
        count += chat.unreadForSubscriber || 0;
      }
    });
    return count;
  }, [chats, userId, relevantMasterIds, isSubscriberProfile]);

  const unloadMessages = useCallback(() => {
    console.log('[Chat] Unloading messages, clearing active chat ref');
    if (messagesUnsubRef.current) {
      messagesUnsubRef.current();
      messagesUnsubRef.current = null;
    }
    activeLoadedChatRef.current = null;
    setMessages([]);
  }, []);

  const loadMessages = useCallback((masterId: string, subscriberId: string) => {
    console.log('[Chat][DEBUG] loadMessages called:', { masterId, subscriberId, userId, prevActiveChat: activeLoadedChatRef.current, hasExistingSub: !!messagesUnsubRef.current });
    activeLoadedChatRef.current = `${masterId}_${subscriberId}`;

    if (messagesUnsubRef.current) {
      messagesUnsubRef.current();
      messagesUnsubRef.current = null;
    }

    setIsLoadingMessages(true);
    setMessages([]);

    try {
      const q = query(
        collection(firestore, 'messages'),
        where('masterId', '==', masterId),
        where('subscriberId', '==', subscriberId),
        orderBy('createdAt', 'asc'),
        limit(500)
      );

      const parseMessageDocs = (snapshotDocs: Array<{ id: string; data: () => Record<string, unknown> }>): ChatMessage[] => {
        const docs: ChatMessage[] = [];
        snapshotDocs.forEach((d) => {
          const data = d.data();
          const createdAt = data.createdAt instanceof Timestamp
            ? data.createdAt.toMillis()
            : (typeof data.createdAt === 'number' ? data.createdAt : Date.now());
          docs.push({
            id: d.id,
            masterId: typeof data.masterId === 'string' ? data.masterId : '',
            subscriberId: typeof data.subscriberId === 'string' ? data.subscriberId : '',
            text: typeof data.text === 'string' ? data.text : '',
            senderId: typeof data.senderId === 'string' ? data.senderId : '',
            senderName: typeof data.senderName === 'string' ? data.senderName : '',
            createdAt,
            isRead: typeof data.isRead === 'boolean' ? data.isRead : false,
          });
        });
        return docs;
      };

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const docs = parseMessageDocs(snapshot.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
          prevMessageIdsRef.current = new Set(docs.map(d => d.id));
          console.log('[Chat] Messages snapshot received:', docs.length);
          setMessages(docs);
          setIsLoadingMessages(false);
        },
        async (error) => {
          const errMsg = error?.message || '';
          console.log('[Chat] Messages subscription error:', errMsg, '| isIndex:', errMsg.includes('index') || errMsg.includes('Index'), '| isPerm:', errMsg.includes('permission') || errMsg.includes('insufficient'));
          console.log('[Chat] Falling back to getDocs for messages...');
          try {
            const fallbackQ = query(
              collection(firestore, 'messages'),
              where('masterId', '==', masterId),
              where('subscriberId', '==', subscriberId),
              limit(500)
            );
            const snapshot = await getDocs(fallbackQ);
            const docs = parseMessageDocs(snapshot.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
            docs.sort((a, b) => a.createdAt - b.createdAt);
            prevMessageIdsRef.current = new Set(docs.map(d => d.id));
            console.log('[Chat] getDocs fallback for messages succeeded, got', docs.length);
            setMessages(docs);
          } catch (fbErr: unknown) {
            const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
            console.log('[Chat] getDocs fallback for messages also failed:', fbMsg);
          }
          setIsLoadingMessages(false);
        }
      );

      messagesUnsubRef.current = unsubscribe;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('[Chat] loadMessages error:', msg);
      setIsLoadingMessages(false);
    }
  }, [userId]);

  const sendMessage = useCallback(async (masterId: string, subscriberId: string, text: string) => {
    console.log('[Chat][DEBUG] sendMessage called:', { masterId, subscriberId, textLen: text.length, userId, isSubscriberProfile, activeProfileId });
    if (!isAccessGranted) {
      console.log('[Chat][DEBUG] sendMessage: access not granted, aborting');
      Alert.alert('Доступ ограничен', 'Введите код доступа в настройках для отправки сообщений');
      return;
    }
    if (!userId) {
      console.log('[Chat][DEBUG] sendMessage: userId is null, aborting');
      Alert.alert('Ошибка', 'Авторизация не завершена.');
      return;
    }

    const normalizedMasterId = !isSubscriberProfile
      ? (backupMasterId || firestoreUid || masterId)
      : masterId;

    console.log('[Chat][DEBUG] sendMessage normalizedMasterId:', normalizedMasterId, '| original masterId:', masterId, '| backupMasterId:', backupMasterId, '| firestoreUid:', firestoreUid);

    if (isSubscriberProfile) {
      const activeSub = subscriptions.find(s => s.id === activeProfileId);
      if (!activeSub || !activeSub.masterId) {
        Alert.alert('Ошибка', 'Недействительная ссылка мастера. Проверьте подписку.');
        return;
      }
      if (activeSub.masterId !== normalizedMasterId) {
        Alert.alert('Ошибка', 'Этот чат не принадлежит вашему мастеру.');
        return;
      }
    }

    setIsSending(true);
    const resolvedName = displayName || userEmail || 'Аноним';
    const isMaster = !isSubscriberProfile;

    console.log('[Chat] Sending message:', { normalizedMasterId, subscriberId, senderId: userId, senderName: resolvedName, firestoreUid, backupMasterId, isSubscriberProfile, activeProfileId });

    try {
      try {
        console.log('[Chat][DEBUG] sendMessage: Adding message doc to Firestore:', { masterId: normalizedMasterId, subscriberId, senderId: userId, senderName: resolvedName });
        const msgDocRef = await addDoc(collection(firestore, 'messages'), {
          masterId: normalizedMasterId,
          subscriberId,
          text,
          senderId: userId,
          senderName: resolvedName,
          createdAt: serverTimestamp(),
          isRead: false,
        });
        console.log('[Chat] Message doc added to Firestore, id:', msgDocRef.id);
      } catch (msgErr: unknown) {
        const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr);
        console.log('[Chat] Failed to add message doc:', errMsg);
        if (errMsg.includes('permission') || errMsg.includes('Permission')) {
          Alert.alert('Ошибка доступа', 'Нет прав для отправки сообщений. Попросите мастера настроить правила Firebase (Firestore Rules) для коллекций messages и chats.');
          return;
        }
        throw msgErr;
      }

      try {
        const chatDocId = getChatDocId(normalizedMasterId, subscriberId);
        console.log('[Chat][DEBUG] sendMessage: Updating/creating chat doc:', chatDocId);
        const chatRef = doc(firestore, 'chats', chatDocId);
        const chatSnap = await getDoc(chatRef);
        console.log('[Chat][DEBUG] sendMessage: chatSnap exists:', chatSnap.exists(), 'data:', chatSnap.exists() ? JSON.stringify({ participants: chatSnap.data()?.participants, masterId: chatSnap.data()?.masterId, subscriberId: chatSnap.data()?.subscriberId }) : 'N/A');

        const activeSub = subscriptions.find(s => s.masterId === normalizedMasterId);

        if (chatSnap.exists()) {
          const existingData = chatSnap.data();
          const updateData: Record<string, unknown> = {
            lastMessage: text,
            lastMessageTime: serverTimestamp(),
            lastSenderId: userId,
            ...(isMaster ? { masterName: resolvedName } : { subscriberName: resolvedName }),
          };
          if (isMaster) {
            updateData.unreadForSubscriber = (existingData.unreadForSubscriber || 0) + 1;
            updateData.unreadForMaster = 0;
          } else {
            updateData.unreadForMaster = (existingData.unreadForMaster || 0) + 1;
            updateData.unreadForSubscriber = 0;
          }
          if (!existingData.participants) {
            updateData.participants = [normalizedMasterId, subscriberId];
          }
          await updateDoc(chatRef, updateData);
        } else {
          await setDoc(chatRef, {
            masterId: normalizedMasterId,
            subscriberId,
            participants: [normalizedMasterId, subscriberId],
            masterName: isMaster ? resolvedName : (activeSub?.name || 'Мастер'),
            subscriberName: isMaster ? (activeSub?.name || 'Подписчик') : resolvedName,
            lastMessage: text,
            lastMessageTime: serverTimestamp(),
            lastSenderId: userId,
            unreadForMaster: isMaster ? 0 : 1,
            unreadForSubscriber: isMaster ? 1 : 0,
          });
        }
        console.log('[Chat] Chat doc updated/created');

        const recipientIds: string[] = [];
        if (userId === normalizedMasterId) {
          recipientIds.push(subscriberId);
        } else {
          recipientIds.push(normalizedMasterId);
        }
        sendChatPush(recipientIds, resolvedName, text, normalizedMasterId, subscriberId, userId).catch(err => {
          console.log('[Chat] Push notification send error:', err);
        });
      } catch (chatErr: unknown) {
        const errMsg = chatErr instanceof Error ? chatErr.message : String(chatErr);
        console.log('[Chat] Failed to update chat doc (non-critical):', errMsg);
      }

      console.log('[Chat] Message sent successfully, checking onSnapshot is active:', !!messagesUnsubRef.current);

      if (!messagesUnsubRef.current) {
        console.log('[Chat] onSnapshot not active, force reloading messages');
        loadMessages(normalizedMasterId, subscriberId);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('[Chat] sendMessage error:', msg);
      Alert.alert('Ошибка', msg || 'Не удалось отправить сообщение');
    } finally {
      setIsSending(false);
    }
  }, [userId, userEmail, displayName, isSubscriberProfile, subscriptions, activeProfileId, loadMessages, backupMasterId, firestoreUid, isAccessGranted]);

  const deleteChat = useCallback(async (masterId: string, subscriberId: string) => {
    const currentAuthUser = auth.currentUser;
    console.log('[Chat][DEBUG] deleteChat called:', { masterId, subscriberId, userId, authUid: currentAuthUser?.uid ?? null });
    if (!currentAuthUser) {
      console.log('[Chat] deleteChat: user not authenticated, aborting');
      Alert.alert('Ошибка', 'Необходимо авторизоваться для удаления чата');
      return;
    }
    setIsDeleting(true);
    try {
      const chatDocId = getChatDocId(masterId, subscriberId);
      const chatRef = doc(firestore, 'chats', chatDocId);

      const messagesQuery = query(
        collection(firestore, 'messages'),
        where('masterId', '==', masterId),
        where('subscriberId', '==', subscriberId)
      );
      const messagesSnap = await getDocs(messagesQuery);
      const batch = writeBatch(firestore);
      messagesSnap.docs.forEach((d) => {
        batch.delete(d.ref);
      });
      batch.delete(chatRef);
      await batch.commit();
      console.log('[Chat] Chat deleted, removed', messagesSnap.docs.length, 'messages');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('[Chat] deleteChat error:', msg);
      Alert.alert('Ошибка', 'Не удалось удалить чат: ' + msg);
    } finally {
      setIsDeleting(false);
    }
  }, [userId]);

  const markChatAsRead = useCallback((masterId: string, subscriberId: string) => {
    if (!userId) return;
    const chatDocId = getChatDocId(masterId, subscriberId);
    const chatRef = doc(firestore, 'chats', chatDocId);

    const iAmMaster = !isSubscriberProfile && (masterId === userId || relevantMasterIds.includes(masterId));
    const resetField = iAmMaster ? 'unreadForMaster' : 'unreadForSubscriber';
    console.log('[Chat] markChatAsRead:', { chatDocId, iAmMaster, resetField, userId, isSubscriberProfile });
    updateDoc(chatRef, { [resetField]: 0 }).catch((err) => {
      console.log('[Chat] markChatAsRead error:', err?.message);
    });

    const batch = writeBatch(firestore);
    const q = query(
      collection(firestore, 'messages'),
      where('masterId', '==', masterId),
      where('subscriberId', '==', subscriberId),
      where('isRead', '==', false)
    );
    getDocs(q).then((snapshot) => {
      snapshot.docs.forEach((d) => {
        if (d.data().senderId !== userId) {
          batch.update(d.ref, { isRead: true });
        }
      });
      return batch.commit();
    }).catch((err) => {
      console.log('[Chat] markChatAsRead batch error:', err?.message);
    });
  }, [userId, isSubscriberProfile, relevantMasterIds]);

  useEffect(() => {
    return () => {
      if (messagesUnsubRef.current) {
        messagesUnsubRef.current();
        messagesUnsubRef.current = null;
      }
      activeLoadedChatRef.current = null;
    };
  }, []);

  return useMemo(() => ({
    chats,
    messages,
    loadMessages,
    unloadMessages,
    sendMessage,
    deleteChat,
    markChatAsRead,
    unreadMessagesCount,
    isLoadingChats,
    isLoadingMessages,
    isSending,
    isDeleting,
    userId,
  }), [chats, messages, loadMessages, unloadMessages, sendMessage, deleteChat, markChatAsRead, unreadMessagesCount, isLoadingChats, isLoadingMessages, isSending, isDeleting, userId]);
});
