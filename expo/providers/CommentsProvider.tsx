import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { auth, firestore } from '@/config/firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  getDocs,
  orderBy,
  limit,
} from 'firebase/firestore';
import { useBackup } from './BackupProvider';
import { useProfile } from './ProfileProvider';
import { useAccessCode } from './AccessCodeProvider';
import type { Comment, CommentEntityType } from '@/types';
import * as Notifications from 'expo-notifications';
import { sendCommentPush } from '@/lib/pushNotifications';

const DISPLAY_NAME_KEY = '@user_display_name';
const READ_COMMENT_IDS_KEY = '@read_comment_ids';

interface CommentsContextType {
  comments: Record<string, Comment[]>;
  loadComments: (entityType: CommentEntityType, entityId: string) => void;
  addComment: (entityType: CommentEntityType, entityId: string, text: string) => Promise<void>;
  isLoading: boolean;
  isSending: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  displayName: string;
  setDisplayName: (name: string) => Promise<void>;
  unreadComments: Comment[];
  unreadCount: number;
  markAsRead: (commentId: string) => void;
  markAllAsRead: () => void;
  activeMasterId: string | null;
  canWriteComments: boolean;
  cannotWriteReason: string | null;
}

function makeKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

export const [CommentsProvider, useComments] = createContextHook<CommentsContextType>(() => {
  const { userEmail, masterId: backupMasterId, subscriptions, subscriberEmails, firestoreSubscribers, firestoreUid } = useBackup();
  const { activeProfileId, isSubscriberProfile } = useProfile();
  const { isAccessGranted } = useAccessCode();

  const [userId, setUserId] = useState<string | null>(null);
  const [commentsMap, setCommentsMap] = useState<Record<string, Comment[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [displayName, setDisplayNameState] = useState<string>('');
  const unsubscribeMap = useRef<Record<string, () => void>>({});

  const [allComments, setAllComments] = useState<Comment[]>([]);
  const [readCommentIds, setReadCommentIds] = useState<Set<string>>(new Set());
  const prevCommentIdsRef = useRef<Set<string>>(new Set());


  useEffect(() => {
    AsyncStorage.getItem(DISPLAY_NAME_KEY).then(stored => {
      if (stored) setDisplayNameState(stored);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(READ_COMMENT_IDS_KEY).then(stored => {
      if (stored) {
        try {
          const ids = JSON.parse(stored) as string[];
          setReadCommentIds(new Set(ids));
        } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  const persistReadIds = useCallback((ids: Set<string>) => {
    const arr = Array.from(ids);
    AsyncStorage.setItem(READ_COMMENT_IDS_KEY, JSON.stringify(arr)).catch(() => {});
  }, []);

  const setDisplayName = useCallback(async (name: string) => {
    setDisplayNameState(name);
    try {
      await AsyncStorage.setItem(DISPLAY_NAME_KEY, name);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    console.log('[Comments] Initializing Firebase anonymous auth...');
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log('[Comments] Firebase user authenticated:', user.uid);
        setUserId(user.uid);
      } else {
        console.log('[Comments] No Firebase user, signing in anonymously...');
        signInAnonymously(auth).catch((err) => {
          console.log('[Comments] Anonymous auth error:', err?.message);
        });
      }
    });

    return () => unsubscribe();
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
    console.log('[Comments][DEBUG] activeMasterId computed:', result, '| isSubscriber:', isSubscriberProfile, '| backupMasterId:', backupMasterId, '| userId:', userId, '| activeProfileId:', activeProfileId);
    return result;
  }, [isSubscriberProfile, activeProfileId, subscriptions, backupMasterId, userId]);

  useEffect(() => {
    console.log('[Comments] Active masterId changed:', activeMasterId, 'isSubscriber:', isSubscriberProfile);
    Object.values(unsubscribeMap.current).forEach(unsub => unsub());
    unsubscribeMap.current = {};
    setCommentsMap({});
  }, [activeMasterId, isSubscriberProfile]);

  const relevantMasterIds = useMemo(() => {
    const ids = new Set<string>();
    if (backupMasterId) ids.add(backupMasterId);
    if (userId) ids.add(userId);
    if (firestoreUid && firestoreUid !== userId) ids.add(firestoreUid);
    subscriptions.forEach(s => {
      if (s.masterId) ids.add(s.masterId);
    });
    const result = Array.from(ids).filter(Boolean);
    console.log('[Comments][DEBUG] relevantMasterIds computed:', result, '| backupMasterId:', backupMasterId, '| userId:', userId, '| firestoreUid:', firestoreUid, '| subscriptions masterId list:', subscriptions.map(s => s.masterId));
    return result;
  }, [backupMasterId, userId, firestoreUid, subscriptions]);

  useEffect(() => {
    if (!userId) return;
    console.log('[Comments] Setting up global comments subscription, relevantMasterIds:', relevantMasterIds);

    prevCommentIdsRef.current = new Set();

    try {
      let q;
      if (relevantMasterIds.length > 0 && relevantMasterIds.length <= 30) {
        q = query(
          collection(firestore, 'comments'),
          where('masterId', 'in', relevantMasterIds),
          orderBy('createdAt', 'desc'),
          limit(200)
        );
      } else {
        q = query(
          collection(firestore, 'comments'),
          orderBy('createdAt', 'desc'),
          limit(200)
        );
      }

      const parseGlobalDocs = (snapshotDocs: Array<{ id: string; data: () => Record<string, unknown> }>): Comment[] => {
        const docs: Comment[] = [];
        snapshotDocs.forEach((d) => {
          const data = d.data();
          const createdAt = data.createdAt instanceof Timestamp
            ? data.createdAt.toMillis()
            : (typeof data.createdAt === 'number' ? data.createdAt : Date.now());
          const entityType = (typeof data.entityType === 'string' ? data.entityType : '') as CommentEntityType;
          docs.push({
            id: d.id,
            entityType,
            entityId: typeof data.entityId === 'string' ? data.entityId : '',
            userId: typeof data.userId === 'string' ? data.userId : '',
            userEmail: typeof data.userEmail === 'string' ? data.userEmail : '',
            userName: typeof data.userName === 'string' ? data.userName : '',
            text: typeof data.text === 'string' ? data.text : '',
            createdAt,
            masterId: typeof data.masterId === 'string' ? data.masterId : undefined,
            authorId: typeof data.authorId === 'string' ? data.authorId : undefined,
            authorName: typeof data.authorName === 'string' ? data.authorName : undefined,
            subscriberId: typeof data.subscriberId === 'string' ? data.subscriberId : undefined,
          });
        });
        return docs;
      };

      const handleGlobalDocs = (docs: Comment[]) => {
        console.log('[Comments][DEBUG] handleGlobalDocs called with', docs.length, 'docs, userId:', userId, 'activeMasterId:', activeMasterId);
        const newIds = new Set(docs.map(c => c.id));
        const prevIds = prevCommentIdsRef.current;
        const freshComments = docs.filter(c =>
          prevIds.size > 0 &&
          !prevIds.has(c.id) &&
          c.userId !== userId &&
          (c.authorId ? c.authorId !== userId : true) &&
          (!activeMasterId || !c.masterId || c.masterId === activeMasterId)
        );

        console.log('[Comments] Global snapshot: total=', docs.length, 'fresh=', freshComments.length, 'prevSize=', prevIds.size);

        if (freshComments.length > 0 && Platform.OS !== 'web') {
          console.log('[Comments] Scheduling', Math.min(freshComments.length, 3), 'comment notifications');
          for (const c of freshComments.slice(0, 3)) {
            const entityLabel = c.entityType === 'work_entry' ? 'Запись работ'
              : c.entityType === 'inventory' ? 'Склад'
              : c.entityType === 'task' ? 'Задача' : 'Комментарий';
            const authorLabel = c.authorName || c.userName || 'Аноним';
            Notifications.scheduleNotificationAsync({
              content: {
                title: `${authorLabel} — ${entityLabel}`,
                body: c.text.substring(0, 100),
                data: { commentId: c.id, entityType: c.entityType, entityId: c.entityId },
                ...(Platform.OS === 'android' ? { channelId: 'comments_channel' } : {}),
              },
              trigger: null,
            }).catch((err) => {
              console.log('[Comments] Notification error:', err);
            });
          }
        }

        prevCommentIdsRef.current = newIds;
        setAllComments(docs);
        console.log('[Comments] Global subscription: received', docs.length, 'comments');
      };

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const docs = parseGlobalDocs(snapshot.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
          handleGlobalDocs(docs);
        },
        async (error) => {
          const errMsg = error?.message || '';
          const isIndexError = errMsg.includes('index') || errMsg.includes('Index');
          const isPermError = errMsg.includes('permission') || errMsg.includes('Permission') || errMsg.includes('insufficient');
          console.log('[Comments] Global subscription error:', errMsg, '| isIndex:', isIndexError, '| isPerm:', isPermError);
          console.log('[Comments] Falling back to getDocs for global comments...');
          try {
            const fallbackQ = relevantMasterIds.length > 0 && relevantMasterIds.length <= 30
              ? query(
                  collection(firestore, 'comments'),
                  where('masterId', 'in', relevantMasterIds),
                  limit(200)
                )
              : query(
                  collection(firestore, 'comments'),
                  limit(200)
                );
            const snapshot = await getDocs(fallbackQ);
            const docs = parseGlobalDocs(snapshot.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
            docs.sort((a, b) => b.createdAt - a.createdAt);
            handleGlobalDocs(docs);
            console.log('[Comments] getDocs fallback succeeded, got', docs.length, 'comments');
          } catch (fallbackErr: unknown) {
            const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            console.log('[Comments] getDocs fallback also failed:', fbMsg);
          }
        }
      );
      return () => unsubscribe();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('[Comments] Global subscription setup error:', msg);
    }
  }, [userId, relevantMasterIds]);

  const unreadComments = useMemo(() => {
    return allComments
      .filter(c => {
        if (readCommentIds.has(c.id)) return false;
        if (c.userId === userId) return false;
        if (c.authorId && c.authorId === userId) return false;
        if (activeMasterId && c.masterId && c.masterId !== activeMasterId) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [allComments, readCommentIds, userId, activeMasterId]);

  const unreadCount = unreadComments.length;

  // Badge count is now set in _layout.tsx combining comments + chat unreads

  const markAsRead = useCallback((commentId: string) => {
    setReadCommentIds(prev => {
      const next = new Set(prev);
      next.add(commentId);
      persistReadIds(next);
      return next;
    });
  }, [persistReadIds]);

  const markAllAsRead = useCallback(() => {
    setReadCommentIds(prev => {
      const next = new Set(prev);
      allComments.forEach(c => next.add(c.id));
      persistReadIds(next);
      return next;
    });
  }, [allComments, persistReadIds]);

  const parseSnapshot = useCallback((snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => {
    const docs: Comment[] = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt instanceof Timestamp
        ? data.createdAt.toMillis()
        : (typeof data.createdAt === 'number' ? data.createdAt : Date.now());

      const entityType = (typeof data.entityType === 'string' ? data.entityType : '') as CommentEntityType;

      docs.push({
        id: doc.id,
        entityType,
        entityId: typeof data.entityId === 'string' ? data.entityId : '',
        userId: typeof data.userId === 'string' ? data.userId : '',
        userEmail: typeof data.userEmail === 'string' ? data.userEmail : '',
        userName: typeof data.userName === 'string' ? data.userName : '',
        text: typeof data.text === 'string' ? data.text : '',
        createdAt: createdAt as number,
        masterId: typeof data.masterId === 'string' ? data.masterId : undefined,
        authorId: typeof data.authorId === 'string' ? data.authorId : undefined,
        authorName: typeof data.authorName === 'string' ? data.authorName : undefined,
        subscriberId: typeof data.subscriberId === 'string' ? data.subscriberId : undefined,
      });
    });
    docs.sort((a, b) => a.createdAt - b.createdAt);
    return docs;
  }, []);

  const filterForSubscriber = useCallback((docs: Comment[]): Comment[] => {
    if (!isSubscriberProfile || !activeMasterId || !userId) return docs;
    return docs.filter(c =>
      c.userId === userId ||
      c.userId === activeMasterId ||
      (c.authorId && (c.authorId === userId || c.authorId === activeMasterId)) ||
      (!c.authorId && !c.subscriberId)
    );
  }, [isSubscriberProfile, activeMasterId, userId]);

  const loadComments = useCallback((entityType: CommentEntityType, entityId: string) => {
    const key = makeKey(entityType, entityId);
    console.log('[Comments] Subscribing to comments for', key, 'masterId:', activeMasterId);

    if (unsubscribeMap.current[key]) {
      unsubscribeMap.current[key]();
      delete unsubscribeMap.current[key];
    }

    setIsLoading(true);

    try {
      const constraints: ReturnType<typeof where>[] = [
        where('entityType', '==', String(entityType)),
        where('entityId', '==', String(entityId)),
      ];

      if (activeMasterId) {
        constraints.push(where('masterId', '==', activeMasterId));
      }

      const q = query(collection(firestore, 'comments'), ...constraints);

      console.log('[Comments] Trying onSnapshot for', key, 'with masterId filter:', !!activeMasterId);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          let docs = parseSnapshot(snapshot as unknown as { docs: Array<{ id: string; data: () => Record<string, unknown> }> });
          docs = filterForSubscriber(docs);
          console.log('[Comments] onSnapshot received', docs.length, 'comments for', key);
          setCommentsMap((prev) => ({ ...prev, [key]: docs }));
          setIsLoading(false);
        },
        async (error) => {
          console.log('[Comments] onSnapshot error for', key, ':', error?.message);
          console.log('[Comments] Falling back to getDocs for', key);
          try {
            const snapshot = await getDocs(q);
            let docs = parseSnapshot(snapshot as unknown as { docs: Array<{ id: string; data: () => Record<string, unknown> }> });
            docs = filterForSubscriber(docs);
            console.log('[Comments] getDocs received', docs.length, 'comments for', key);
            setCommentsMap((prev) => ({ ...prev, [key]: docs }));
          } catch (fallbackErr: unknown) {
            const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            console.log('[Comments] getDocs fallback error:', fbMsg);
          }
          setIsLoading(false);
        }
      );

      unsubscribeMap.current[key] = unsubscribe;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('[Comments] loadComments error:', msg);
      setIsLoading(false);
    }
  }, [parseSnapshot, activeMasterId, filterForSubscriber]);

  useEffect(() => {
    return () => {
      Object.values(unsubscribeMap.current).forEach((unsub) => unsub());
      unsubscribeMap.current = {};
    };
  }, []);

  const addComment = useCallback(async (entityType: CommentEntityType, entityId: string, text: string) => {
    console.log('[Comments][DEBUG] addComment called:', { entityType, entityId, textLen: text.length, userId, activeMasterId, isSubscriberProfile });
    if (!isAccessGranted) {
      console.log('[Comments][DEBUG] addComment: access not granted, aborting');
      Alert.alert('Доступ ограничен', 'Введите код доступа в настройках для добавления комментариев');
      return;
    }
    if (!userId) {
      console.log('[Comments][DEBUG] addComment: userId is null, aborting');
      Alert.alert('Ошибка', 'Авторизация не завершена. Попробуйте позже.');
      return;
    }

    if (!isSubscriberProfile) {
      if (!firestoreSubscribers || firestoreSubscribers.length === 0) {
        Alert.alert('Нет подписчиков', 'Вы не можете писать комментарии, пока у вас нет подписчиков.');
        return;
      }
    }

    if (isSubscriberProfile) {
      const activeSub = subscriptions.find(s => s.id === activeProfileId);
      if (!activeSub) {
        Alert.alert('Ошибка', 'Подписка не найдена. Выберите активный профиль мастера.');
        return;
      }
      if (!activeSub.masterId) {
        Alert.alert('Ошибка', 'Недействительная подписка. Ссылка мастера не содержит идентификатор. Удалите подписку и добавьте заново с корректной ссылкой.');
        return;
      }
      if (!activeMasterId || activeMasterId === userId) {
        Alert.alert('Ошибка', 'Не удалось определить мастера для отправки комментария. Проверьте подписку.');
        return;
      }
    }

    setIsSending(true);
    try {
      const resolvedName = displayName || userEmail || 'Аноним';
      const resolvedMasterId = activeMasterId || backupMasterId || userId;
      const isSubscriber = isSubscriberProfile && activeMasterId && activeMasterId !== userId;

      console.log('[Comments] Adding comment:', {
        entityType, entityId, userId,
        masterId: resolvedMasterId,
        authorId: userId,
        authorName: resolvedName,
        isSubscriber,
      });

      const commentData: Record<string, unknown> = {
        entityType: String(entityType),
        entityId: String(entityId),
        userId,
        masterId: resolvedMasterId,
        authorId: userId,
        authorName: resolvedName,
        userEmail: userEmail || '',
        userName: resolvedName,
        text,
        createdAt: serverTimestamp(),
      };

      if (isSubscriber) {
        commentData.subscriberId = userId;
      }

      try {
        await addDoc(collection(firestore, 'comments'), commentData);
        console.log('[Comments] Comment added successfully');

        if (resolvedMasterId) {
          sendCommentPush(
            resolvedMasterId,
            resolvedName,
            text,
            String(entityType),
            String(entityId),
            userId,
          ).catch(err => {
            console.log('[Comments] Push notification send error:', err);
          });
        }
      } catch (firestoreErr: unknown) {
        const errMsg = firestoreErr instanceof Error ? firestoreErr.message : String(firestoreErr);
        console.log('[Comments] Firestore addDoc error:', errMsg);
        if (errMsg.includes('permission') || errMsg.includes('Permission')) {
          Alert.alert(
            'Ошибка доступа',
            'Нет прав для отправки комментариев. Попросите мастера настроить правила Firebase (Firestore Rules) для коллекции comments.'
          );
          return;
        }
        throw firestoreErr;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('[Comments] addComment error:', msg);
      Alert.alert('Ошибка', msg || 'Не удалось добавить комментарий');
    } finally {
      setIsSending(false);
    }
  }, [userId, userEmail, displayName, activeMasterId, backupMasterId, isSubscriberProfile, subscriptions, activeProfileId, subscriberEmails, firestoreSubscribers, isAccessGranted]);

  const canWriteComments = useMemo(() => {
    let result: boolean;
    if (isSubscriberProfile) {
      const activeSub = subscriptions.find(s => s.id === activeProfileId);
      if (!activeSub || !activeSub.masterId) result = false;
      else if (!activeMasterId || activeMasterId === userId) result = false;
      else result = true;
    } else {
      result = firestoreSubscribers.length > 0;
    }
    console.log('[Comments][DEBUG] canWriteComments:', result, '| isSubscriber:', isSubscriberProfile, '| firestoreSubscribers:', firestoreSubscribers.length, '| activeMasterId:', activeMasterId, '| userId:', userId);
    return result;
  }, [isSubscriberProfile, subscriptions, activeProfileId, activeMasterId, userId, firestoreSubscribers]);

  const cannotWriteReason = useMemo(() => {
    if (!userId) return 'Авторизация не завершена';
    if (isSubscriberProfile) {
      const activeSub = subscriptions.find(s => s.id === activeProfileId);
      if (!activeSub) return 'Подписка не найдена';
      if (!activeSub.masterId) return 'Недействительная ссылка мастера';
      if (!activeMasterId || activeMasterId === userId) return 'Не удалось подключиться к мастеру';
      return null;
    }
    if (firestoreSubscribers.length === 0) return 'Нет подписчиков';
    return null;
  }, [userId, isSubscriberProfile, subscriptions, activeProfileId, activeMasterId, firestoreSubscribers]);

  return useMemo(() => ({
    comments: commentsMap,
    loadComments,
    addComment,
    isLoading,
    isSending,
    isAuthenticated: !!userId,
    userId,
    displayName,
    setDisplayName,
    unreadComments,
    unreadCount,
    markAsRead,
    markAllAsRead,
    activeMasterId,
    canWriteComments,
    cannotWriteReason,
  }), [commentsMap, loadComments, addComment, isLoading, isSending, userId, displayName, setDisplayName, unreadComments, unreadCount, markAsRead, markAllAsRead, activeMasterId, canWriteComments, cannotWriteReason]);
});
