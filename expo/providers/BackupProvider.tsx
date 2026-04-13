import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import * as SecureStore from 'expo-secure-store';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState, Platform } from 'react-native';

import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import JSZip from 'jszip';
import { useDatabase } from './DatabaseProvider';
import { useProfile } from './ProfileProvider';
import { openProfileDatabase } from '@/lib/database';
import { useObjects } from './ObjectsProvider';
import { useChecklists } from './ChecklistsProvider';
import { useInventory } from './InventoryProvider';
import { useTasks } from './TasksProvider';
import { useKnowledge } from './KnowledgeProvider';
import { useReminders } from './RemindersProvider';
import {
  YANDEX_CLIENT_ID,
  YANDEX_CLIENT_SECRET,
  getUserInfoYandex,
  listBackupsYandex,
  uploadBackupYandex,
  downloadBackupYandex,
  downloadZipBackupYandex,
  cleanupOldBackupsYandex,
  getPublicResourceInfo,
  downloadPublicBackup,
  downloadPublicZipBackup,
  YandexFile,
  BackupData,
  SYNC_FOLDER,
  ensureFolderYandex,
  uploadTextFileYandex,
  downloadTextFileYandex,
  deleteResourceYandex,
  resourceExistsYandex,
  publishFolderYandex,
  downloadPublicFileYandex,
  getPublicFolderManifest,
  uploadPhotoFileYandex,
  ensureAppFilesFolder,
  uploadAppFile,
  getResourceInfoByPath,
  getPublicManifestData,
  ensureCommentsFolderYandex,
  publishCommentsFolderYandex,
  COMMENTS_FOLDER,
  grantFolderAccessYandex,
  checkFolderAccessYandex,
  sendFolderInvitationYandex,
} from '@/lib/yandexDisk';
import { auth, firestore } from '@/config/firebase';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import {
  isRemoteUrl,
  generateRemoteFileName,
  makeYadiskRef,
  ensureUnifiedFilesDir,
  migrateExistingFiles,
  isInUnifiedDir,
} from '@/lib/fileManager';
import {
  buildSyncFiles,
  buildManifest,
  diffManifests,
  restoreFromSyncFiles,
  collectPhotoInfo,
  convertBackupDataToSyncFiles,
  type SyncManifest,
  type SyncProgress,
} from '@/lib/syncEngine';

if (Platform.OS !== 'web') {
  try {
    WebBrowser.maybeCompleteAuthSession();
  } catch (e) {
    console.log('[Backup] maybeCompleteAuthSession error:', e);
  }
}

const TOKEN_KEY = 'yandex_access_token';
const REFRESH_TOKEN_KEY = 'yandex_refresh_token';
const USER_EMAIL_KEY = 'yandex_user_email';
const LAST_BACKUP_KEY = '@backup_last_date';
const AUTO_BACKUP_KEY = '@backup_auto_enabled';

const MASTER_ENABLED_KEY = '@sync_master_enabled';
const MASTER_INTERVAL_KEY = '@sync_master_interval';
const MASTER_PUBLIC_URL_KEY = '@sync_master_public_url';
const MASTER_LAST_PUBLISH_KEY = '@sync_master_last_publish';
const SUBSCRIBER_URL_KEY = '@sync_subscriber_url';
const SUBSCRIBER_AUTO_KEY = '@sync_subscriber_auto';
const SUBSCRIBER_INTERVAL_KEY = '@sync_subscriber_interval';
const SUBSCRIBER_LAST_CHECK_KEY = '@sync_subscriber_last_check';
const SUBSCRIPTIONS_KEY = '@sync_subscriptions';

const MASTER_ID_KEY = '@sync_master_id';
const MASTER_YANDEX_ID_KEY = '@sync_master_yandex_id';
const MASTER_AUTO_SYNC_KEY = '@sync_master_auto_sync';
const MASTER_AUTO_SYNC_INTERVAL_KEY = '@sync_master_auto_sync_interval';
const MASTER_LAST_SYNC_KEY = '@sync_master_last_sync';
const SUBSCRIBER_EMAILS_KEY = '@sync_subscriber_emails';

const LOCAL_MANIFEST_KEY = '@sync_local_manifest';
const MIGRATION_DONE_KEY = '@sync_migration_v2_done';
const FILES_MIGRATION_DONE_KEY = '@files_migration_to_unified_done';

export const SYNC_INTERVALS = {
  HOURLY: 60 * 60 * 1000,
  TWELVE_HOURS: 12 * 60 * 60 * 1000,
  DAILY: 24 * 60 * 60 * 1000,
} as const;

export type SyncIntervalValue = typeof SYNC_INTERVALS[keyof typeof SYNC_INTERVALS];

import type { MasterSubscription, SyncIntervalKey, FirestoreSubscription } from '@/types';

const INTERVAL_KEY_TO_MS: Record<SyncIntervalKey, number> = {
  hourly: SYNC_INTERVALS.HOURLY,
  twelveHours: SYNC_INTERVALS.TWELVE_HOURS,
  daily: SYNC_INTERVALS.DAILY,
};

const yandexDiscovery = {
  authorizationEndpoint: 'https://oauth.yandex.ru/authorize',
  tokenEndpoint: 'https://oauth.yandex.ru/token',
};

interface BackupContextType {
  isConnected: boolean;
  userEmail: string | null;
  lastBackupDate: string | null;
  autoBackupEnabled: boolean;
  isCreatingBackup: boolean;
  isRestoring: boolean;
  isLoadingBackups: boolean;
  backupsList: YandexFile[];
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  createBackup: () => Promise<void>;
  restoreBackup: (fileId: string) => Promise<void>;
  loadBackupsList: () => Promise<void>;
  toggleAutoBackup: () => Promise<void>;
  isInitializing: boolean;
  accessToken: string | null;

  isMasterEnabled: boolean;
  masterInterval: SyncIntervalValue;
  masterPublicUrl: string | null;
  lastMasterPublish: string | null;
  isPublishing: boolean;
  toggleMasterMode: (enable: boolean) => Promise<void>;
  setMasterInterval: (interval: SyncIntervalValue) => Promise<void>;
  publishBackup: () => Promise<string>;

  subscriptionUrl: string | null;
  isAutoSyncEnabled: boolean;
  syncInterval: SyncIntervalValue;
  lastSyncCheck: string | null;
  isSyncing: boolean;
  subscribeToMaster: (publicUrl: string) => Promise<void>;
  unsubscribe: () => Promise<void>;
  setSyncInterval: (interval: SyncIntervalValue) => Promise<void>;
  toggleAutoSync: (enable: boolean) => Promise<void>;
  manualSync: () => Promise<{ updated: boolean; error?: string }>;

  subscriptions: MasterSubscription[];
  addSubscription: (name: string, masterUrl: string) => Promise<MasterSubscription>;
  removeSubscription: (id: string) => Promise<void>;
  renameSubscription: (id: string, name: string) => Promise<void>;
  updateSubscriptionAutoSync: (id: string, enabled: boolean) => Promise<void>;
  updateSubscriptionInterval: (id: string, interval: SyncIntervalKey) => Promise<void>;
  syncSubscription: (id: string) => Promise<{ updated: boolean; error?: string }>;
  isSyncingSubscription: string | null;

  masterAutoSyncEnabled: boolean;
  masterAutoSyncInterval: SyncIntervalValue;
  lastMasterSync: string | null;
  isMasterSyncing: boolean;
  toggleMasterAutoSync: (enable: boolean) => Promise<void>;
  setMasterAutoSyncInterval: (interval: SyncIntervalValue) => Promise<void>;
  masterSyncNow: () => Promise<{ updated: boolean; error?: string }>;

  switchAccount: () => Promise<void>;
  resetMasterSettings: () => Promise<void>;

  syncProgress: SyncProgress | null;

  masterId: string | null;
  yandexUserId: string | null;

  activeMasterPublicUrl: string | null;

  subscriberEmails: string[];
  addSubscriberEmail: (email: string) => Promise<void>;
  removeSubscriberEmail: (email: string) => Promise<void>;
  grantAccessToSubscriber: (email: string) => Promise<void>;
  sendInvitationToSubscriber: (email: string) => Promise<void>;
  isGrantingAccess: boolean;
  isSendingInvitation: boolean;

  firestoreSubscribers: FirestoreSubscription[];
  isLoadingSubscribers: boolean;
  firestoreUid: string | null;
  removeFirestoreSubscriber: (subscriberId: string) => Promise<void>;
}

export const [BackupProvider, useBackup] = createContextHook<BackupContextType>(() => {
  const { db, isReady } = useDatabase();
  const { refreshData: refreshObjects } = useObjects();
  const { refreshData: refreshChecklists } = useChecklists();
  const { refreshData: refreshInventory } = useInventory();
  const { refreshData: refreshTasks } = useTasks();
  const { refreshData: refreshKnowledge } = useKnowledge();
  const { refreshData: refreshReminders } = useReminders();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [backupsList, setBackupsList] = useState<YandexFile[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);


  const [isMasterEnabled, setIsMasterEnabled] = useState(false);
  const [masterInterval, setMasterIntervalState] = useState<SyncIntervalValue>(SYNC_INTERVALS.DAILY);
  const [masterPublicUrl, setMasterPublicUrl] = useState<string | null>(null);
  const [lastMasterPublish, setLastMasterPublish] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const [subscriptionUrl, setSubscriptionUrl] = useState<string | null>(null);
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState(false);
  const [syncInterval, setSyncIntervalState] = useState<SyncIntervalValue>(SYNC_INTERVALS.DAILY);
  const [lastSyncCheck, setLastSyncCheck] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [subscriptions, setSubscriptions] = useState<MasterSubscription[]>([]);
  const [isSyncingSubscription, setIsSyncingSubscription] = useState<string | null>(null);

  const [masterAutoSyncEnabled, setMasterAutoSyncEnabledState] = useState(false);
  const [masterAutoSyncInterval, setMasterAutoSyncIntervalState] = useState<SyncIntervalValue>(SYNC_INTERVALS.DAILY);
  const [lastMasterSync, setLastMasterSync] = useState<string | null>(null);
  const [isMasterSyncing, setIsMasterSyncing] = useState(false);

  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [subscriberEmails, setSubscriberEmails] = useState<string[]>([]);
  const [isGrantingAccess, setIsGrantingAccess] = useState(false);
  const [isSendingInvitation, setIsSendingInvitation] = useState(false);

  const [masterId, setMasterId] = useState<string | null>(null);
  const [yandexUserId, setYandexUserId] = useState<string | null>(null);

  const [firestoreSubscribers, setFirestoreSubscribers] = useState<FirestoreSubscription[]>([]);
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(false);
  const prevSubscriberIdsRef = useRef<Set<string>>(new Set());
  const [firebaseUid, setFirebaseUid] = useState<string | null>(auth.currentUser?.uid || null);

  const { activeProfileId, refreshProfiles } = useProfile();

  useEffect(() => {
    console.log('[Backup] Setting up Firebase auth state listener...');
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log('[Backup] Firebase auth state changed, uid:', user.uid);
        setFirebaseUid(user.uid);
      } else {
        console.log('[Backup] No Firebase user, signing in anonymously...');
        setFirebaseUid(null);
        signInAnonymously(auth).catch((err) => {
          console.log('[Backup] Anonymous auth error:', err?.message);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'zhurnal-mastera',
    path: 'auth',
  });
  console.log('[Backup] Redirect URI:', redirectUri);

  const [_request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: YANDEX_CLIENT_ID,
      scopes: ['cloud_api:disk.app_folder', 'login:email'],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
        force_code_for_refresh_token: 'true',
      },
    },
    yandexDiscovery
  );

  const [codeVerifier, setCodeVerifier] = useState<string | null>(null);

  useEffect(() => {
    if (_request?.codeVerifier) {
      setCodeVerifier(_request.codeVerifier);
    }
  }, [_request]);

  useEffect(() => {
    void loadStoredAuth();
  }, []);

  useEffect(() => {
    if (!db || !isReady) return;
    if (Platform.OS === 'web') return;
    const runMigration = async () => {
      try {
        const done = await AsyncStorage.getItem(FILES_MIGRATION_DONE_KEY);
        if (done === 'true') {
          await ensureUnifiedFilesDir();
          return;
        }
        console.log('[Backup] Running file migration to unified folder...');
        await ensureUnifiedFilesDir();
        const result = await migrateExistingFiles(db);
        console.log('[Backup] File migration result: migrated =', result.migrated, ', errors =', result.errors);
        await AsyncStorage.setItem(FILES_MIGRATION_DONE_KEY, 'true');
      } catch (e: any) {
        console.log('[Backup] File migration error:', e?.message);
      }
    };
    void runMigration();
  }, [db, isReady]);

  const parseSubscriberDocs = useCallback((snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }): FirestoreSubscription[] => {
    const subs: FirestoreSubscription[] = [];
    snapshot.docs.forEach((d) => {
      const data = d.data();
      const createdAt = data.createdAt instanceof Timestamp
        ? data.createdAt.toMillis()
        : (typeof data.createdAt === 'number' ? data.createdAt : Date.now());
      subs.push({
        id: d.id,
        masterId: typeof data.masterId === 'string' ? data.masterId : '',
        subscriberId: typeof data.subscriberId === 'string' ? data.subscriberId : '',
        subscriberName: typeof data.subscriberName === 'string' ? data.subscriberName : 'Подписчик',
        masterUrl: typeof data.masterUrl === 'string' ? data.masterUrl : '',
        createdAt: createdAt as number,
      });
    });
    subs.sort((a, b) => b.createdAt - a.createdAt);
    return subs;
  }, []);

  const handleNewSubscribers = useCallback((subs: FirestoreSubscription[]) => {
    const newIds = new Set(subs.map(s => s.id));
    const prevIds = prevSubscriberIdsRef.current;
    if (prevIds.size > 0 && Platform.OS !== 'web') {
      const freshSubs = subs.filter(s => !prevIds.has(s.id));
      for (const s of freshSubs.slice(0, 3)) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Новый подписчик',
            body: `${s.subscriberName} подписался на ваши данные`,
            data: { type: 'new_subscriber', subscriberId: s.subscriberId },
          },
          trigger: null,
        }).catch((err) => {
          console.log('[Backup] Subscriber notification error:', err);
        });
      }
    }
    prevSubscriberIdsRef.current = newIds;
    setFirestoreSubscribers(subs);
    setIsLoadingSubscribers(false);
    console.log('[Backup] handleNewSubscribers: received', subs.length, 'subscribers:', subs.map(s => ({ id: s.id, name: s.subscriberName, subscriberId: s.subscriberId })));
  }, []);

  const effectiveMasterId = useMemo(() => {
    const result = masterId || firebaseUid || null;
    console.log('[Backup][DEBUG] effectiveMasterId computed:', result, '| masterId:', masterId, '| firebaseUid:', firebaseUid, '| isMasterEnabled:', isMasterEnabled);
    return result;
  }, [masterId, firebaseUid]);

  useEffect(() => {
    console.log('[Backup][DEBUG] Subscribers listener useEffect triggered. effectiveMasterId:', effectiveMasterId, '| masterId:', masterId, '| firebaseUid:', firebaseUid, '| isMasterEnabled:', isMasterEnabled);
    if (!effectiveMasterId) {
      console.log('[Backup] No effectiveMasterId yet, skipping subscribers listener');
      return;
    }

    console.log('[Backup] Setting up Firestore subscribers listener for masterId:', effectiveMasterId, '(masterId:', masterId, ', firebaseUid:', firebaseUid, ', isMasterEnabled:', isMasterEnabled, ')');
    setIsLoadingSubscribers(true);

    const masterIdsToQuery = new Set<string>();
    masterIdsToQuery.add(effectiveMasterId);
    if (masterId && masterId !== effectiveMasterId) masterIdsToQuery.add(masterId);
    if (firebaseUid && firebaseUid !== effectiveMasterId) masterIdsToQuery.add(firebaseUid);
    const masterIdsArr = Array.from(masterIdsToQuery).filter(Boolean);

    const unsubscribers: (() => void)[] = [];
    const allSubs = new Map<string, FirestoreSubscription>();

    const mergeAndNotify = () => {
      const merged = Array.from(allSubs.values());
      merged.sort((a, b) => b.createdAt - a.createdAt);
      handleNewSubscribers(merged);
    };

    let hasError = false;

    for (const mid of masterIdsArr) {
      try {
        const q = query(
          collection(firestore, 'subscriptions'),
          where('masterId', '==', mid)
        );

        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const subs = parseSubscriberDocs(snapshot as unknown as { docs: Array<{ id: string; data: () => Record<string, unknown> }> });
            console.log('[Backup] Subscribers snapshot for masterId', mid, ':', subs.length, 'docs');
            subs.forEach(s => allSubs.set(s.id, s));
            const currentIds = new Set(subs.map(s => s.id));
            Array.from(allSubs.keys()).forEach(key => {
              const sub = allSubs.get(key);
              if (sub && sub.masterId === mid && !currentIds.has(key)) {
                allSubs.delete(key);
              }
            });
            mergeAndNotify();
          },
          async (error) => {
            console.log('[Backup] Firestore subscribers onSnapshot error for masterId', mid, ':', error?.message, '- trying getDocs fallback');
            hasError = true;
            try {
              const fallbackQ = query(
                collection(firestore, 'subscriptions'),
                where('masterId', '==', mid)
              );
              const snapshot = await getDocs(fallbackQ);
              const subs = parseSubscriberDocs(snapshot as unknown as { docs: Array<{ id: string; data: () => Record<string, unknown> }> });
              console.log('[Backup] getDocs fallback for masterId', mid, ':', subs.length, 'docs');
              subs.forEach(s => allSubs.set(s.id, s));
              mergeAndNotify();
            } catch (fallbackErr: any) {
              console.log('[Backup] Firestore subscribers getDocs fallback error for masterId', mid, ':', fallbackErr?.message);
              if (masterIdsArr.indexOf(mid) === masterIdsArr.length - 1 && allSubs.size === 0) {
                setIsLoadingSubscribers(false);
              }
            }
          }
        );

        unsubscribers.push(unsubscribe);
      } catch (e: any) {
        console.log('[Backup] Firestore subscribers listener setup error for masterId', mid, ':', e?.message);
      }
    }

    if (unsubscribers.length === 0) {
      setIsLoadingSubscribers(false);
    }

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [effectiveMasterId, masterId, firebaseUid, isMasterEnabled, parseSubscriberDocs, handleNewSubscribers]);

  const refreshAllProviders = useCallback(async () => {
    console.log('[Backup] Refreshing all providers after restore...');
    try {
      await refreshObjects();
      await refreshChecklists();
      await refreshInventory();
      await refreshTasks();
      await refreshKnowledge();
      await refreshReminders();
      console.log('[Backup] All providers refreshed');
    } catch (error) {
      console.log('[Backup] Error refreshing providers:', error);
    }
  }, [refreshObjects, refreshChecklists, refreshInventory, refreshTasks, refreshKnowledge, refreshReminders]);

  const exchangeCodeForToken = useCallback(async (code: string): Promise<{ access_token: string; refresh_token?: string }> => {
    console.log('[Backup] Exchanging code for token...');
    const params: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      client_id: YANDEX_CLIENT_ID,
      client_secret: YANDEX_CLIENT_SECRET,
      redirect_uri: redirectUri,
    };
    if (codeVerifier) {
      params.code_verifier = codeVerifier;
      console.log('[Backup] Including code_verifier in token exchange');
    }
    const body = new URLSearchParams(params);
    const resp = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!resp.ok) {
      const errorText = await resp.text();
      console.log('[Backup] Token exchange error:', resp.status, errorText);
      throw new Error('Token exchange failed: ' + errorText);
    }
    const data = await resp.json();
    console.log('[Backup] Token exchange success, has refresh_token:', !!data.refresh_token);
    return { access_token: data.access_token, refresh_token: data.refresh_token };
  }, [redirectUri, codeVerifier]);

  const linkMasterToYandex = useCallback(async (yandexId: string, email: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.log('[Backup] No Firebase user, cannot link master');
        return;
      }

      console.log('[Backup] Linking master to Yandex ID:', yandexId, 'Firebase UID:', currentUser.uid);
      setYandexUserId(yandexId);
      await AsyncStorage.setItem(MASTER_YANDEX_ID_KEY, yandexId);

      console.log('[Backup][DEBUG] linkMasterToYandex: checking yandex_masters doc for yandexId:', yandexId);
      const masterDocRef = doc(firestore, 'yandex_masters', yandexId);
      const masterDoc = await getDoc(masterDocRef);
      console.log('[Backup][DEBUG] linkMasterToYandex: masterDoc exists:', masterDoc.exists(), 'data:', masterDoc.exists() ? JSON.stringify(masterDoc.data()) : 'N/A');

      if (masterDoc.exists()) {
        const data = masterDoc.data();
        const existingMasterId = data.masterId as string;
        console.log('[Backup] Found existing master mapping, masterId:', existingMasterId);
        setMasterId(existingMasterId);
        await AsyncStorage.setItem(MASTER_ID_KEY, existingMasterId);

        if (existingMasterId !== currentUser.uid) {
          console.log('[Backup] Current Firebase UID differs from stored masterId. Stored:', existingMasterId, 'Current:', currentUser.uid);
        }
      } else {
        const newMasterId = currentUser.uid;
        console.log('[Backup] Creating new master mapping, masterId:', newMasterId);
        await setDoc(masterDocRef, {
          masterId: newMasterId,
          email,
          yandexId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setMasterId(newMasterId);
        await AsyncStorage.setItem(MASTER_ID_KEY, newMasterId);
        console.log('[Backup] Master mapping created successfully');
      }
    } catch (e: any) {
      console.log('[Backup] linkMasterToYandex error:', e?.message);
      const fallbackId = auth.currentUser?.uid || null;
      if (fallbackId) {
        console.log('[Backup] Using fallback masterId:', fallbackId);
        setMasterId(fallbackId);
        await AsyncStorage.setItem(MASTER_ID_KEY, fallbackId);
      }
    }
  }, []);

  const handleTokenReceived = useCallback(async (token: string, refreshToken?: string) => {
    try {
      console.log('[Backup] Токен получен (implicit flow), сохраняем...');
      if (Platform.OS === 'web') {
        await AsyncStorage.setItem(TOKEN_KEY, token);
        if (refreshToken) await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      } else {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        if (refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
      }

      const userInfo = await getUserInfoYandex(token);

      if (Platform.OS === 'web') {
        await AsyncStorage.setItem(USER_EMAIL_KEY, userInfo.email);
      } else {
        await SecureStore.setItemAsync(USER_EMAIL_KEY, userInfo.email);
      }

      setUserEmail(userInfo.email);
      setAccessToken(token);

      await linkMasterToYandex(userInfo.id, userInfo.email);

      console.log('[Backup] Авторизация завершена, email:', userInfo.email, 'yandexId:', userInfo.id);
    } catch (error) {
      console.log('[Backup] handleTokenReceived error:', error);
    }
  }, [linkMasterToYandex]);

  useEffect(() => {
    if (response?.type === 'success') {
      const code = response.params?.code;
      const token = response.authentication?.accessToken || response.params?.access_token;
      console.log('[Backup] Auth success, got code:', code ? 'yes' : 'no', 'token:', token ? 'yes' : 'no');
      if (code) {
        void (async () => {
          try {
            const tokens = await exchangeCodeForToken(code);
            await handleTokenReceived(tokens.access_token, tokens.refresh_token);
          } catch (e: any) {
            console.log('[Backup] Code exchange failed:', e?.message);
          }
        })();
      } else if (token) {
        void handleTokenReceived(token);
      } else {
        console.log('[Backup] Auth success but no code or token found in response');
      }
    } else if (response?.type === 'error') {
      console.log('[Backup] Auth error:', response.error);
    }
  }, [response, handleTokenReceived, exchangeCodeForToken]);

  const loadStoredAuth = async () => {
    try {
      let token: string | null = null;
      let email: string | null = null;

      if (Platform.OS === 'web') {
        token = await AsyncStorage.getItem(TOKEN_KEY);
        email = await AsyncStorage.getItem(USER_EMAIL_KEY);
      } else {
        token = await SecureStore.getItemAsync(TOKEN_KEY);
        email = await SecureStore.getItemAsync(USER_EMAIL_KEY);
      }

      const lastDate = await AsyncStorage.getItem(LAST_BACKUP_KEY);
      const autoEnabled = await AsyncStorage.getItem(AUTO_BACKUP_KEY);

      const masterEnabled = await AsyncStorage.getItem(MASTER_ENABLED_KEY);
      const masterInt = await AsyncStorage.getItem(MASTER_INTERVAL_KEY);
      const masterUrl = await AsyncStorage.getItem(MASTER_PUBLIC_URL_KEY);
      const masterLastPub = await AsyncStorage.getItem(MASTER_LAST_PUBLISH_KEY);

      const subUrl = await AsyncStorage.getItem(SUBSCRIBER_URL_KEY);
      const subAuto = await AsyncStorage.getItem(SUBSCRIBER_AUTO_KEY);
      const subInt = await AsyncStorage.getItem(SUBSCRIBER_INTERVAL_KEY);
      const subLastCheck = await AsyncStorage.getItem(SUBSCRIBER_LAST_CHECK_KEY);

      if (token && email) {
        setAccessToken(token);
        setUserEmail(email);
        console.log('[Backup] Restored auth for:', email);
      }

      const storedMasterId = await AsyncStorage.getItem(MASTER_ID_KEY);
      if (storedMasterId) {
        setMasterId(storedMasterId);
        console.log('[Backup] Restored masterId:', storedMasterId);
      }
      const storedYandexId = await AsyncStorage.getItem(MASTER_YANDEX_ID_KEY);
      if (storedYandexId) {
        setYandexUserId(storedYandexId);
        console.log('[Backup] Restored yandexUserId:', storedYandexId);
      }
      if (lastDate) setLastBackupDate(lastDate);
      if (autoEnabled === 'true') setAutoBackupEnabled(true);

      if (masterEnabled === 'true') setIsMasterEnabled(true);
      if (masterInt) setMasterIntervalState(Number(masterInt) as SyncIntervalValue);
      if (masterUrl) setMasterPublicUrl(masterUrl);
      if (masterLastPub) setLastMasterPublish(masterLastPub);

      if (subUrl) setSubscriptionUrl(subUrl);
      if (subAuto === 'true') setIsAutoSyncEnabled(true);
      if (subInt) setSyncIntervalState(Number(subInt) as SyncIntervalValue);
      if (subLastCheck) setLastSyncCheck(subLastCheck);

      const masterAutoSync = await AsyncStorage.getItem(MASTER_AUTO_SYNC_KEY);
      const masterAutoSyncInt = await AsyncStorage.getItem(MASTER_AUTO_SYNC_INTERVAL_KEY);
      const masterLastSyncVal = await AsyncStorage.getItem(MASTER_LAST_SYNC_KEY);
      if (masterAutoSync === 'true') setMasterAutoSyncEnabledState(true);
      if (masterAutoSyncInt) setMasterAutoSyncIntervalState(Number(masterAutoSyncInt) as SyncIntervalValue);
      if (masterLastSyncVal) setLastMasterSync(masterLastSyncVal);

      const storedSubs = await AsyncStorage.getItem(SUBSCRIPTIONS_KEY);
      if (storedSubs) {
        try {
          const parsed = JSON.parse(storedSubs) as MasterSubscription[];
          setSubscriptions(parsed);
          console.log('[Backup] Loaded subscriptions:', parsed.length);
        } catch (e) {
          console.log('[Backup] Failed to parse subscriptions:', e);
        }
      }

      const storedEmails = await AsyncStorage.getItem(SUBSCRIBER_EMAILS_KEY);
      if (storedEmails) {
        try {
          const parsed = JSON.parse(storedEmails) as string[];
          setSubscriberEmails(parsed);
          console.log('[Backup] Loaded subscriber emails:', parsed.length);
        } catch (e) {
          console.log('[Backup] Failed to parse subscriber emails:', e);
        }
      }
    } catch (error) {
      console.log('[Backup] Error loading stored auth:', error);
    } finally {
      setIsInitializing(false);
    }
  };

  const signIn = useCallback(async () => {
    console.log('[Backup] Starting sign in...');
    await promptAsync({ createTask: false });
  }, [promptAsync]);

  const resetMasterSettings = useCallback(async () => {
    console.log('[Backup] Resetting master settings...');
    try {
      setIsMasterEnabled(false);
      setMasterIntervalState(SYNC_INTERVALS.DAILY);
      setMasterPublicUrl(null);
      setLastMasterPublish(null);
      setMasterAutoSyncEnabledState(false);
      setMasterAutoSyncIntervalState(SYNC_INTERVALS.DAILY);
      setLastMasterSync(null);
      setAutoBackupEnabled(false);
      setLastBackupDate(null);

      await AsyncStorage.removeItem(MASTER_ENABLED_KEY);
      await AsyncStorage.removeItem(MASTER_INTERVAL_KEY);
      await AsyncStorage.removeItem(MASTER_PUBLIC_URL_KEY);
      await AsyncStorage.removeItem(MASTER_LAST_PUBLISH_KEY);
      await AsyncStorage.removeItem(MASTER_AUTO_SYNC_KEY);
      await AsyncStorage.removeItem(MASTER_AUTO_SYNC_INTERVAL_KEY);
      await AsyncStorage.removeItem(MASTER_LAST_SYNC_KEY);
      await AsyncStorage.removeItem(AUTO_BACKUP_KEY);
      await AsyncStorage.removeItem(LAST_BACKUP_KEY);
      await AsyncStorage.removeItem(LOCAL_MANIFEST_KEY);
      console.log('[Backup] Master settings reset complete');
    } catch (error) {
      console.log('[Backup] Error resetting master settings:', error);
    }
  }, []);

  const signOut = useCallback(async () => {
    console.log('[Backup] Signing out...');
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.removeItem(TOKEN_KEY);
        await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
        await AsyncStorage.removeItem(USER_EMAIL_KEY);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        await SecureStore.deleteItemAsync(USER_EMAIL_KEY);
      }
      setAccessToken(null);
      setUserEmail(null);
      setBackupsList([]);
      console.log('[Backup] Signed out successfully');
    } catch (error) {
      console.log('[Backup] Error signing out:', error);
    }
  }, []);

  const switchAccount = useCallback(async () => {
    console.log('[Backup] Switching account...');
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.removeItem(TOKEN_KEY);
        await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
        await AsyncStorage.removeItem(USER_EMAIL_KEY);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        await SecureStore.deleteItemAsync(USER_EMAIL_KEY);
      }
      setAccessToken(null);
      setUserEmail(null);
      setBackupsList([]);

      await resetMasterSettings();

      console.log('[Backup] Old account cleared, starting new auth...');
      await promptAsync({ createTask: false });
    } catch (error) {
      console.log('[Backup] Error switching account:', error);
    }
  }, [promptAsync, resetMasterSettings]);

  const collectAllLocalFiles = useCallback(async (): Promise<{ table: string; id: string; column: string; localPath: string }[]> => {
    if (!db) return [];
    const files: { table: string; id: string; column: string; localPath: string }[] = [];

    console.log('[Backup] === collectAllLocalFiles: scanning all 3 tables ===');

    const docs = await db.getAllAsync<{ id: string; file_path: string | null; file_url: string | null }>(
      'SELECT id, file_path, file_url FROM object_documents'
    );
    console.log('[Backup] object_documents: total rows =', docs.length);
    let docsSkippedAlready = 0;
    let docsSkippedNoPath = 0;
    let docsSkippedRemote = 0;
    docs.forEach((row) => {
      if (!row.file_path) { docsSkippedNoPath++; return; }
      const alreadyUploaded = row.file_url && row.file_url.startsWith('yadisk://');
      if (alreadyUploaded) { docsSkippedAlready++; return; }
      if (isRemoteUrl(row.file_path)) { docsSkippedRemote++; return; }
      console.log('[Backup] Found local doc to upload: id=', row.id, 'file_path=', row.file_path, 'file_url=', row.file_url);
      files.push({ table: 'object_documents', id: row.id, column: 'file_url', localPath: row.file_path });
    });
    console.log('[Backup] object_documents: toUpload =', files.filter(f => f.table === 'object_documents').length,
      ', alreadyUploaded =', docsSkippedAlready, ', noPath =', docsSkippedNoPath, ', remote =', docsSkippedRemote);

    const entries = await db.getAllAsync<{ id: string; photos: string | null }>(
      'SELECT id, photos FROM work_entries WHERE photos IS NOT NULL'
    );
    console.log('[Backup] work_entries with photos: total rows =', entries.length);
    let photosLocal = 0;
    let photosAlreadyYadisk = 0;
    let photosRemote = 0;
    let photosEmpty = 0;
    entries.forEach((row) => {
      if (row.photos) {
        try {
          const photos = JSON.parse(row.photos);
          if (Array.isArray(photos)) {
            console.log('[Backup] work_entry', row.id, 'photos array length:', photos.length, 'values:', JSON.stringify(photos).substring(0, 200));
            photos.forEach((p: string, idx: number) => {
              if (!p) { photosEmpty++; return; }
              if (p.startsWith('yadisk://')) { photosAlreadyYadisk++; return; }
              if (isRemoteUrl(p)) { photosRemote++; return; }
              photosLocal++;
              console.log('[Backup] Found local photo to upload: entry=', row.id, 'idx=', idx, 'path=', p);
              files.push({ table: 'work_entries', id: row.id, column: 'photos', localPath: p });
            });
          }
        } catch (e) {
          console.log('[Backup] Failed to parse photos JSON for entry', row.id, ':', e, 'raw:', row.photos?.substring(0, 100));
        }
      }
    });
    console.log('[Backup] work_entries photos: toUpload =', photosLocal, ', alreadyYadisk =', photosAlreadyYadisk, ', remote =', photosRemote, ', empty =', photosEmpty);

    const knowledge = await db.getAllAsync<{ id: string; file_path: string | null; file_url: string | null }>(
      'SELECT id, file_path, file_url FROM knowledge_items'
    );
    console.log('[Backup] knowledge_items: total rows =', knowledge.length);
    let knowledgeSkippedAlready = 0;
    let knowledgeSkippedNoPath = 0;
    let knowledgeSkippedRemote = 0;
    knowledge.forEach((row) => {
      if (!row.file_path) { knowledgeSkippedNoPath++; return; }
      const alreadyUploaded = row.file_url && row.file_url.startsWith('yadisk://');
      if (alreadyUploaded) { knowledgeSkippedAlready++; return; }
      if (isRemoteUrl(row.file_path)) { knowledgeSkippedRemote++; return; }
      console.log('[Backup] Found local knowledge file to upload: id=', row.id, 'file_path=', row.file_path, 'file_url=', row.file_url);
      files.push({ table: 'knowledge_items', id: row.id, column: 'file_url', localPath: row.file_path });
    });
    console.log('[Backup] knowledge_items: toUpload =', files.filter(f => f.table === 'knowledge_items').length,
      ', alreadyUploaded =', knowledgeSkippedAlready, ', noPath =', knowledgeSkippedNoPath, ', remote =', knowledgeSkippedRemote);

    console.log('[Backup] === Total files to upload:', files.length, '===');
    return files;
  }, [db]);

  const uploadFilesToDiskAndUpdateDb = useCallback(async (token: string): Promise<{ uploaded: number; failed: number; skipped: number; details: { docs: number; photos: number; knowledge: number }; failedFiles: string[] }> => {
    const emptyResult = { uploaded: 0, failed: 0, skipped: 0, details: { docs: 0, photos: 0, knowledge: 0 }, failedFiles: [] as string[] };
    if (!db) return emptyResult;
    if (Platform.OS === 'web') return emptyResult;

    console.log('[Backup] === uploadFilesToDiskAndUpdateDb START ===');
    const localFiles = await collectAllLocalFiles();
    if (localFiles.length === 0) {
      console.log('[Backup] No local files to upload, skipping');
      return emptyResult;
    }

    console.log('[Backup] Ensuring app_files folder exists...');
    try {
      await ensureAppFilesFolder(token);
      console.log('[Backup] app_files folder ensured OK');
    } catch (folderErr: any) {
      console.log('[Backup] CRITICAL: Failed to create app_files folder:', folderErr?.message);
      throw new Error('Не удалось создать папку app_files на Диске: ' + (folderErr?.message || 'неизвестная ошибка'));
    }

    let uploaded = 0;
    let failed = 0;
    let skipped = 0;
    const details = { docs: 0, photos: 0, knowledge: 0 };
    const uniqueFiles = new Map<string, string>();
    const failedFiles: string[] = [];

    const resolveLocalPath = async (rawPath: string): Promise<{ resolved: string; exists: boolean }> => {
      if (isInUnifiedDir(rawPath)) {
        try {
          const info = await FileSystemLegacy.getInfoAsync(rawPath);
          return { resolved: rawPath, exists: info.exists };
        } catch (e: any) {
          console.log('[Backup] resolveLocalPath check error (unified):', rawPath, e?.message);
          return { resolved: rawPath, exists: false };
        }
      }

      const docDir = FileSystemLegacy.documentDirectory || '';
      const cacheDir = FileSystemLegacy.cacheDirectory || '';
      const candidates: string[] = [];
      if (rawPath.startsWith('file://')) {
        candidates.push(rawPath);
        candidates.push(rawPath.substring(7));
      } else if (rawPath.startsWith('/')) {
        candidates.push(rawPath);
        candidates.push('file://' + rawPath);
      } else {
        candidates.push(docDir + rawPath);
        candidates.push(cacheDir + rawPath);
        candidates.push(rawPath);
        candidates.push('file://' + rawPath);
      }

      for (const candidate of candidates) {
        try {
          const info = await FileSystemLegacy.getInfoAsync(candidate);
          if (info.exists) {
            return { resolved: candidate, exists: true };
          }
        } catch (e: any) {
          console.log('[Backup] resolveLocalPath check error:', candidate, e?.message);
        }
      }

      console.log('[Backup] resolveLocalPath FAILED for:', rawPath);
      return { resolved: rawPath, exists: false };
    };

    const MAX_FILE_RETRIES = 3;

    for (let i = 0; i < localFiles.length; i++) {
      const fileInfo = localFiles[i];
      const shortPath = fileInfo.localPath.split('/').pop() || fileInfo.localPath;
      setSyncProgress({
        phase: 'uploading',
        current: i + 1,
        total: localFiles.length,
        currentFile: `${shortPath} (${i + 1}/${localFiles.length})`,
      });

      try {
        console.log(`[Backup] --- Processing file ${i + 1}/${localFiles.length} ---`);
        console.log('[Backup] table:', fileInfo.table, 'id:', fileInfo.id, 'column:', fileInfo.column);
        console.log('[Backup] raw localPath:', fileInfo.localPath);

        const { resolved: resolvedPath, exists: fileExists } = await resolveLocalPath(fileInfo.localPath);

        if (!fileExists) {
          console.log('[Backup] FILE NOT FOUND (all variants tried), skipping:', fileInfo.table, fileInfo.id);
          console.log('[Backup]   original path:', fileInfo.localPath);
          try {
            const parentDir = fileInfo.localPath.substring(0, fileInfo.localPath.lastIndexOf('/'));
            const resolvedParent = parentDir.startsWith('/') ? parentDir : (FileSystemLegacy.documentDirectory || '') + parentDir;
            const parentInfo = await FileSystemLegacy.getInfoAsync(resolvedParent);
            if (parentInfo.exists) {
              const contents = await FileSystemLegacy.readDirectoryAsync(resolvedParent);
              console.log('[Backup]   parent dir exists:', resolvedParent, 'contains', contents.length, 'files:', contents.slice(0, 10).join(', '));
            } else {
              console.log('[Backup]   parent dir NOT found:', resolvedParent);
            }
          } catch (dirErr: any) {
            console.log('[Backup]   parent dir check error:', dirErr?.message);
          }
          skipped++;
          failedFiles.push(`NOTFOUND:${fileInfo.table}/${shortPath}`);
          continue;
        }

        console.log('[Backup] File found at:', resolvedPath);

        let remoteFileName = uniqueFiles.get(fileInfo.localPath);
        if (!remoteFileName) {
          remoteFileName = generateRemoteFileName(fileInfo.localPath);
          console.log('[Backup] Uploading:', fileInfo.table, fileInfo.id, '->', remoteFileName, 'from:', resolvedPath);

          let uploadSuccess = false;
          for (let attempt = 1; attempt <= MAX_FILE_RETRIES; attempt++) {
            try {
              console.log(`[Backup] Upload attempt ${attempt}/${MAX_FILE_RETRIES} for:`, shortPath);
              await uploadAppFile(token, resolvedPath, remoteFileName);
              uploadSuccess = true;
              console.log(`[Backup] Upload attempt ${attempt} succeeded for:`, shortPath);
              break;
            } catch (uploadErr: any) {
              console.log(`[Backup] Upload attempt ${attempt}/${MAX_FILE_RETRIES} FAILED for:`, shortPath, 'error:', uploadErr?.message);
              if (attempt < MAX_FILE_RETRIES) {
                const delay = 1000 * Math.pow(2, attempt - 1);
                console.log(`[Backup] Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
              } else {
                console.log('[Backup] All retry attempts exhausted for:', shortPath);
                throw uploadErr;
              }
            }
          }

          if (!uploadSuccess) {
            throw new Error('Upload failed after all retries: ' + shortPath);
          }

          uniqueFiles.set(fileInfo.localPath, remoteFileName);
          uploaded++;
          if (fileInfo.table === 'object_documents') details.docs++;
          else if (fileInfo.table === 'work_entries') details.photos++;
          else if (fileInfo.table === 'knowledge_items') details.knowledge++;
          console.log('[Backup] Upload OK:', remoteFileName);
        } else {
          console.log('[Backup] Reusing already uploaded:', remoteFileName, 'for', shortPath);
        }

        const yadiskRef = makeYadiskRef(remoteFileName);

        if (fileInfo.table === 'work_entries' && fileInfo.column === 'photos') {
          const row = await db.getFirstAsync<{ photos: string | null }>(
            'SELECT photos FROM work_entries WHERE id = ?', [fileInfo.id]
          );
          if (row?.photos) {
            try {
              const photosArr = JSON.parse(row.photos) as string[];
              const updatedPhotos = photosArr.map((p: string) =>
                p === fileInfo.localPath ? yadiskRef : p
              );
              await db.runAsync(
                'UPDATE work_entries SET photos = ? WHERE id = ?',
                [JSON.stringify(updatedPhotos), fileInfo.id]
              );
              console.log('[Backup] DB updated: work_entries', fileInfo.id, 'photo ->', yadiskRef);
            } catch (e) {
              console.log('[Backup] Error updating photo ref:', e);
            }
          }
        } else if (fileInfo.column === 'file_url') {
          await db.runAsync(
            `UPDATE ${fileInfo.table} SET file_url = ? WHERE id = ?`,
            [yadiskRef, fileInfo.id]
          );
          console.log('[Backup] DB updated:', fileInfo.table, fileInfo.id, 'file_url ->', yadiskRef);
        }
      } catch (e: any) {
        failed++;
        failedFiles.push(`ERROR:${fileInfo.table}/${shortPath}:${e?.message?.substring(0, 80)}`);
        console.log('[Backup] FAILED to upload file:', fileInfo.table, fileInfo.id, shortPath);
        console.log('[Backup]   error message:', e?.message);
        console.log('[Backup]   raw path:', fileInfo.localPath);
      }
    }

    console.log('[Backup] === uploadFilesToDiskAndUpdateDb DONE ===');
    console.log('[Backup] Results: uploaded =', uploaded, '(docs:', details.docs, ', photos:', details.photos, ', knowledge:', details.knowledge, '), failed =', failed, ', skipped =', skipped, ', total =', localFiles.length);
    if (failedFiles.length > 0) {
      console.log('[Backup] Failed files:', failedFiles.join(', '));
    }
    return { uploaded, failed, skipped, details, failedFiles };
  }, [db, collectAllLocalFiles]);

  const collectBackupData = useCallback(async (): Promise<BackupData> => {
    if (!db) throw new Error('Database not ready');

    console.log('[Backup] Collecting backup data...');

    const objects = await db.getAllAsync('SELECT * FROM objects');
    const contacts = await db.getAllAsync('SELECT * FROM contacts');
    const documents = await db.getAllAsync('SELECT * FROM object_documents');
    const workEntries = await db.getAllAsync('SELECT * FROM work_entries');
    const checklistTemplates = await db.getAllAsync('SELECT * FROM checklist_templates');
    const checklistResults = await db.getAllAsync('SELECT * FROM checklist_results');
    const inventory = await db.getAllAsync('SELECT * FROM inventory');
    const reminders = await db.getAllAsync('SELECT * FROM reminders');
    const tasksData = await db.getAllAsync('SELECT * FROM tasks');
    const knowledgeItems = await db.getAllAsync('SELECT * FROM knowledge_items');

    return {
      version: 1,
      createdAt: Date.now(),
      objects,
      contacts,
      documents,
      workEntries,
      checklistTemplates,
      checklistResults,
      inventory,
      reminders,
      tasks: tasksData,
      knowledgeItems,
    };
  }, [db]);

  const restoreFromBackupData = useCallback(async (data: BackupData, targetDb?: SQLite.SQLiteDatabase) => {
    const database = targetDb || db;
    if (!database) throw new Error('Database not ready');

    console.log('[Backup] Restoring data...');

    await database.execAsync('DELETE FROM knowledge_items');
    await database.execAsync('DELETE FROM reminders');
    await database.execAsync('DELETE FROM tasks');
    await database.execAsync('DELETE FROM inventory');
    await database.execAsync('DELETE FROM checklist_results');
    await database.execAsync('DELETE FROM checklist_templates');
    await database.execAsync('DELETE FROM work_entries');
    await database.execAsync('DELETE FROM object_documents');
    await database.execAsync('DELETE FROM contacts');
    await database.execAsync('DELETE FROM objects');

    for (const obj of (data.objects || [])) {
      await database.runAsync(
        'INSERT OR REPLACE INTO objects (id, name, address, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?)',
        [obj.id, obj.name, obj.address, obj.created_at, obj.updated_at, obj.sync_status || 'pending']
      );
    }

    for (const c of (data.contacts || [])) {
      await database.runAsync(
        'INSERT OR REPLACE INTO contacts (id, object_id, full_name, position, phone, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [c.id, c.object_id, c.full_name, c.position, c.phone, c.email || null, c.created_at]
      );
    }

    for (const d of (data.documents || [])) {
      await database.runAsync(
        'INSERT OR REPLACE INTO object_documents (id, object_id, name, file_path, file_url, file_size, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [d.id, d.object_id, d.name, d.file_path, d.file_url || null, d.file_size, d.uploaded_at]
      );
    }

    for (const w of (data.workEntries || [])) {
      await database.runAsync(
        'INSERT OR REPLACE INTO work_entries (id, object_id, description, photos, attached_pdf_id, used_materials, latitude, longitude, created_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [w.id, w.object_id, w.description, w.photos, w.attached_pdf_id || null, w.used_materials || null, w.latitude || null, w.longitude || null, w.created_at, w.sync_status || 'pending']
      );
    }

    for (const t of (data.checklistTemplates || [])) {
      await database.runAsync(
        'INSERT OR REPLACE INTO checklist_templates (id, name, items, is_default, created_at) VALUES (?, ?, ?, ?, ?)',
        [t.id, t.name, t.items, t.is_default || 0, t.created_at]
      );
    }

    for (const r of (data.checklistResults || [])) {
      await database.runAsync(
        'INSERT OR REPLACE INTO checklist_results (id, template_id, object_id, items, completed_at, pdf_instruction_id, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [r.id, r.template_id, r.object_id || null, r.items, r.completed_at, r.pdf_instruction_id || null, r.sync_status || 'pending']
      );
    }

    for (const i of (data.inventory || [])) {
      await database.runAsync(
        'INSERT OR REPLACE INTO inventory (id, name, quantity, unit, min_quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [i.id, i.name, i.quantity, i.unit, i.min_quantity || 2, i.created_at, i.updated_at]
      );
    }

    for (const rem of (data.reminders || [])) {
      await database.runAsync(
        'INSERT OR REPLACE INTO reminders (id, object_id, title, description, due_date, is_completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [rem.id, rem.object_id || null, rem.title, rem.description || null, rem.due_date, rem.is_completed || 0, rem.created_at]
      );
    }

    for (const t of ((data as any).tasks || [])) {
      await database.runAsync(
        'INSERT OR REPLACE INTO tasks (id, type, object_id, title, description, due_date, due_time, is_completed, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [t.id, t.type || 'reminder', t.object_id || null, t.title, t.description || null, t.due_date, t.due_time || null, t.is_completed || 0, t.completed_at || null, t.created_at]
      );
    }

    for (const k of (data.knowledgeItems || [])) {
      await database.runAsync(
        'INSERT OR REPLACE INTO knowledge_items (id, type, title, category, category_id, content, file_path, file_url, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [k.id, k.type, k.title, k.category, k.category_id || null, k.content || null, k.file_path || null, k.file_url || null, k.file_size || null, k.created_at]
      );
    }

    console.log('[Backup] Restore complete');
  }, [db]);



  const createBackup = useCallback(async () => {
    if (!accessToken) throw new Error('Not authenticated');
    setIsCreatingBackup(true);
    try {
      setSyncProgress({ phase: 'preparing', current: 0, total: 0, currentFile: 'Подготовка данных...' });

      if (Platform.OS !== 'web') {
        setSyncProgress({ phase: 'uploading', current: 0, total: 0, currentFile: 'Загрузка файлов на Диск...' });
        await uploadFilesToDiskAndUpdateDb(accessToken);
      }

      const data = await collectBackupData();
      setSyncProgress({ phase: 'uploading', current: 0, total: 1, currentFile: 'Загрузка бэкапа...' });
      await uploadBackupYandex(accessToken, data);

      await cleanupOldBackupsYandex(accessToken, 5);

      const now = new Date().toISOString();
      await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackupDate(now);

      setSyncProgress({ phase: 'complete', current: 1, total: 1, currentFile: 'Готово' });
      setTimeout(() => setSyncProgress(null), 2000);
      console.log('[Backup] Backup created successfully (files uploaded separately)');
    } catch (error) {
      setSyncProgress({ phase: 'error', current: 0, total: 0, currentFile: 'Ошибка создания бэкапа' });
      setTimeout(() => setSyncProgress(null), 3000);
      throw error;
    } finally {
      setIsCreatingBackup(false);
    }
  }, [accessToken, collectBackupData, uploadFilesToDiskAndUpdateDb]);

  const restoreFilesFromZip = useCallback(async (zip: JSZip, targetDb?: SQLite.SQLiteDatabase): Promise<void> => {
    const database = targetDb || db;
    let mappingData: { documentDirectory?: string; mapping?: Record<string, string> } = {};
    const mappingFile = zip.file('file_mapping.json');
    if (mappingFile) {
      try {
        const mappingStr = await mappingFile.async('string');
        mappingData = JSON.parse(mappingStr);
      } catch (e) {
        console.log('[Backup] Failed to parse file_mapping.json:', e);
      }
    }

    const currentDocDir = FileSystemLegacy.documentDirectory || '';
    const oldDocDir = mappingData.documentDirectory || '';
    const fileEntries = Object.keys(zip.files).filter((name) => name.startsWith('files/') && !zip.files[name].dir);

    console.log('[Backup] Restoring', fileEntries.length, 'files from ZIP...');

    for (const zipKey of fileEntries) {
      try {
        const relativePath = zipKey.substring('files/'.length);
        let targetPath = currentDocDir + relativePath;

        if (relativePath.startsWith('cache/')) {
          targetPath = (FileSystemLegacy.cacheDirectory || '') + relativePath.substring('cache/'.length);
        }

        const dirPath = targetPath.substring(0, targetPath.lastIndexOf('/'));
        if (dirPath) {
          try {
            const dirInfo = await FileSystemLegacy.getInfoAsync(dirPath);
            if (!dirInfo.exists) {
              await FileSystemLegacy.makeDirectoryAsync(dirPath, { intermediates: true });
            }
          } catch (dirErr) {
            console.log('[Backup] Dir create warning:', dirErr);
          }
        }

        const fileData = await zip.files[zipKey].async('base64');
        const existingFileInfo = await FileSystemLegacy.getInfoAsync(targetPath);
        if (existingFileInfo.exists) {
          await FileSystemLegacy.deleteAsync(targetPath, { idempotent: true });
        }
        await FileSystemLegacy.writeAsStringAsync(targetPath, fileData, { encoding: FileSystemLegacy.EncodingType.Base64 });
      } catch (fileErr) {
        console.log('[Backup] Error restoring file:', zipKey, fileErr);
      }
    }

    if (database) {
      try {
        if (oldDocDir && oldDocDir !== currentDocDir) {
          await database.runAsync(
            `UPDATE object_documents SET file_path = REPLACE(file_path, ?, ?) WHERE file_path LIKE ?`,
            [oldDocDir, currentDocDir, oldDocDir + '%']
          );

          const workRows = await database.getAllAsync<{ id: string; photos: string | null }>(
            'SELECT id, photos FROM work_entries WHERE photos IS NOT NULL'
          );
          for (const row of workRows) {
            if (row.photos && row.photos.includes(oldDocDir)) {
              const updated = row.photos.split(oldDocDir).join(currentDocDir);
              await database.runAsync('UPDATE work_entries SET photos = ? WHERE id = ?', [updated, row.id]);
            }
          }

          await database.runAsync(
            `UPDATE knowledge_items SET file_path = REPLACE(file_path, ?, ?) WHERE file_path LIKE ?`,
            [oldDocDir, currentDocDir, oldDocDir + '%']
          );
        }

        const cacheWorkRows = await database.getAllAsync<{ id: string; photos: string | null }>(
          'SELECT id, photos FROM work_entries WHERE photos IS NOT NULL'
        );
        for (const row of cacheWorkRows) {
          if (!row.photos) continue;
          try {
            const photosArr: string[] = JSON.parse(row.photos);
            let changed = false;
            const updated = photosArr.map((p: string) => {
              if (p && !p.startsWith('/') && !p.startsWith('file://')) {
                changed = true;
                return currentDocDir + p;
              }
              return p;
            });
            if (changed) {
              await database.runAsync('UPDATE work_entries SET photos = ? WHERE id = ?', [JSON.stringify(updated), row.id]);
            }
          } catch (e) {
            console.log('[Backup] Error fixing photo path:', e);
          }
        }
      } catch (dbErr) {
        console.log('[Backup] Error updating file paths:', dbErr);
      }
    }
  }, [db]);

  const restoreBackup = useCallback(async (fileId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    setIsRestoring(true);
    try {
      const isZip = fileId.endsWith('.zip');

      if (isZip && Platform.OS !== 'web') {
        console.log('[Backup] Restoring from ZIP backup...');
        const arrayBuffer = await downloadZipBackupYandex(accessToken, fileId);
        const zip = await JSZip.loadAsync(arrayBuffer);

        const dbFile = zip.file('database.json');
        if (!dbFile) {
          throw new Error('ZIP does not contain database.json');
        }
        const dbJsonStr = await dbFile.async('string');
        const data: BackupData = JSON.parse(dbJsonStr);

        await restoreFromBackupData(data);
        await restoreFilesFromZip(zip);
      } else {
        const data = await downloadBackupYandex(accessToken, fileId);
        await restoreFromBackupData(data);
      }

      await refreshAllProviders();
    } finally {
      setIsRestoring(false);
    }
  }, [accessToken, restoreFromBackupData, restoreFilesFromZip, refreshAllProviders]);

  const ensureSyncFolderStructure = useCallback(async (token: string) => {
    console.log('[Backup] Ensuring sync folder structure...');
    await ensureFolderYandex(token, SYNC_FOLDER);
    await ensureFolderYandex(token, SYNC_FOLDER + '/objects');
    await ensureFolderYandex(token, SYNC_FOLDER + '/entries');
    await ensureFolderYandex(token, SYNC_FOLDER + '/photos');
    await ensureFolderYandex(token, SYNC_FOLDER + '/app_files');
    console.log('[Backup] Sync folder structure ready');
  }, []);

  const saveLocalManifest = useCallback(async (manifest: SyncManifest) => {
    await AsyncStorage.setItem(LOCAL_MANIFEST_KEY, JSON.stringify(manifest));
  }, []);

  const getRemoteManifest = useCallback(async (token: string): Promise<SyncManifest | null> => {
    try {
      const content = await downloadTextFileYandex(token, SYNC_FOLDER + '/manifest.json');
      return JSON.parse(content) as SyncManifest;
    } catch {
      console.log('[Backup] No remote manifest found');
      return null;
    }
  }, []);

  const migrateFromZipIfNeeded = useCallback(async (token: string) => {
    const migrationDone = await AsyncStorage.getItem(MIGRATION_DONE_KEY);
    if (migrationDone === 'true') return;

    console.log('[Backup] Checking for old ZIP backup to migrate...');

    setSyncProgress({ phase: 'migrating', current: 0, total: 1, currentFile: 'Проверка старого формата...' });

    try {
      const zipExists = await resourceExistsYandex(token, 'app:/Журнал мастера backups/master_backup.zip');
      const jsonExists = await resourceExistsYandex(token, 'app:/Журнал мастера backups/master_backup.json');

      if (!zipExists && !jsonExists) {
        console.log('[Backup] No old backup found, skipping migration');
        await AsyncStorage.setItem(MIGRATION_DONE_KEY, 'true');
        setSyncProgress(null);
        return;
      }

      let backupData: BackupData | null = null;

      if (zipExists && Platform.OS !== 'web') {
        try {
          console.log('[Backup] Migrating from old ZIP...');
          setSyncProgress({ phase: 'migrating', current: 0, total: 1, currentFile: 'Скачивание старого архива...' });
          const arrayBuffer = await downloadZipBackupYandex(token, 'app:/Журнал мастера backups/master_backup.zip');
          const zip = await JSZip.loadAsync(arrayBuffer);
          const dbFile = zip.file('database.json');
          if (dbFile) {
            const dbJsonStr = await dbFile.async('string');
            backupData = JSON.parse(dbJsonStr);
          }
        } catch (e) {
          console.log('[Backup] ZIP migration error, trying JSON:', e);
        }
      }

      if (!backupData && jsonExists) {
        try {
          console.log('[Backup] Migrating from old JSON...');
          setSyncProgress({ phase: 'migrating', current: 0, total: 1, currentFile: 'Скачивание старого бэкапа...' });
          backupData = await downloadBackupYandex(token, 'app:/Журнал мастера backups/master_backup.json');
        } catch (e) {
          console.log('[Backup] JSON migration error:', e);
        }
      }

      if (backupData) {
        console.log('[Backup] Converting old backup to file-based structure...');
        setSyncProgress({ phase: 'migrating', current: 0, total: 1, currentFile: 'Конвертация в новый формат...' });

        const syncFiles = await convertBackupDataToSyncFiles(backupData);
        const manifest = buildManifest(syncFiles);

        await ensureSyncFolderStructure(token);

        const filePaths = Object.keys(syncFiles);
        for (let i = 0; i < filePaths.length; i++) {
          const path = filePaths[i];
          setSyncProgress({
            phase: 'migrating',
            current: i + 1,
            total: filePaths.length,
            currentFile: `Миграция: ${path}`,
          });

          const parentDir = path.includes('/') ? SYNC_FOLDER + '/' + path.substring(0, path.lastIndexOf('/')) : null;
          if (parentDir && parentDir !== SYNC_FOLDER + '/objects' && parentDir !== SYNC_FOLDER + '/entries') {
            await ensureFolderYandex(token, parentDir);
          }

          await uploadTextFileYandex(token, SYNC_FOLDER + '/' + path, syncFiles[path]);
        }

        await uploadTextFileYandex(token, SYNC_FOLDER + '/manifest.json', JSON.stringify(manifest));
        await saveLocalManifest(manifest);

        console.log('[Backup] Migration complete, uploaded', filePaths.length, 'files');
      }

      await AsyncStorage.setItem(MIGRATION_DONE_KEY, 'true');
      setSyncProgress(null);
    } catch (error) {
      console.log('[Backup] Migration error:', error);
      await AsyncStorage.setItem(MIGRATION_DONE_KEY, 'true');
      setSyncProgress(null);
    }
  }, [ensureSyncFolderStructure, saveLocalManifest]);

  const publishBackup = useCallback(async (): Promise<string> => {
    if (!accessToken) throw new Error('Not authenticated');
    if (!db) throw new Error('Database not ready');
    setIsPublishing(true);
    try {
      await migrateFromZipIfNeeded(accessToken);

      setSyncProgress({ phase: 'preparing', current: 0, total: 0, currentFile: 'Подготовка данных...' });

      let fileUploadResult: { uploaded: number; failed: number; skipped: number; details: { docs: number; photos: number; knowledge: number }; failedFiles: string[] } | null = null;
      if (Platform.OS !== 'web') {
        setSyncProgress({ phase: 'uploading', current: 0, total: 0, currentFile: 'Загрузка файлов на Диск...' });
        fileUploadResult = await uploadFilesToDiskAndUpdateDb(accessToken);
        console.log('[Backup] publishBackup: files result - uploaded:', fileUploadResult.uploaded, ', failed:', fileUploadResult.failed, ', skipped:', fileUploadResult.skipped, ', details:', JSON.stringify(fileUploadResult.details));
      }

      await ensureSyncFolderStructure(accessToken);

      console.log('[Backup] publishBackup: building sync files from DB...');
      const syncFiles = await buildSyncFiles(db);
      const remoteManifest = await getRemoteManifest(accessToken);

      const diff = diffManifests(syncFiles, remoteManifest);

      const totalOps = diff.toUpload.length + diff.toDelete.length + 1;
      let currentOp = 0;

      if (diff.toUpload.length > 0 || diff.toDelete.length > 0) {
        console.log('[Backup] Publishing: uploading', diff.toUpload.length, 'files, deleting', diff.toDelete.length);

        let failedUploads: string[] = [];
        for (const path of diff.toUpload) {
          currentOp++;
          const shortName = path.split('/').pop() || path;
          setSyncProgress({
            phase: 'uploading',
            current: currentOp,
            total: totalOps,
            currentFile: shortName,
          });

          const parentDir = path.includes('/') ? SYNC_FOLDER + '/' + path.substring(0, path.lastIndexOf('/')) : null;
          if (parentDir && parentDir !== SYNC_FOLDER + '/objects' && parentDir !== SYNC_FOLDER + '/entries') {
            await ensureFolderYandex(accessToken, parentDir);
          }

          try {
            await uploadTextFileYandex(accessToken, SYNC_FOLDER + '/' + path, syncFiles[path]);
          } catch (uploadErr: any) {
            console.log('[Backup] Failed to upload file:', path, uploadErr?.message);
            failedUploads.push(shortName);
          }
        }
        if (failedUploads.length > 0 && failedUploads.length === diff.toUpload.length) {
          throw new Error(`Не удалось загрузить файлы: ${failedUploads.join(', ')}`);
        }
        if (failedUploads.length > 0) {
          console.log('[Backup] Some files failed to upload:', failedUploads.join(', '), '- continuing with partial sync');
        }

        for (const path of diff.toDelete) {
          currentOp++;
          setSyncProgress({
            phase: 'uploading',
            current: currentOp,
            total: totalOps,
            currentFile: `Удаление: ${path.split('/').pop() || path}`,
          });
          await deleteResourceYandex(accessToken, SYNC_FOLDER + '/' + path);
        }

        if (Platform.OS !== 'web') {
          try {
            const photoInfo = await collectPhotoInfo(db);
            const remotePhotos = remoteManifest?.photos ?? {};

            for (const [remotePath, info] of Object.entries(photoInfo)) {
              if (remotePhotos[remotePath]) continue;

              const entries = await db.getAllAsync<{ photos: string | null }>(
                'SELECT photos FROM work_entries WHERE object_id = ?',
                [info.objectId]
              );

              for (const entry of entries) {
                if (!entry.photos) continue;
                try {
                  const photosArr = JSON.parse(entry.photos) as string[];
                  const filename = remotePath.split('/').pop() || '';
                  const localPath = photosArr.find((p: string) => p && p.endsWith(filename));
                  if (localPath) {
                    const photoDir = SYNC_FOLDER + '/photos/' + info.objectId;
                    await ensureFolderYandex(accessToken, photoDir);
                    await uploadPhotoFileYandex(accessToken, SYNC_FOLDER + '/' + remotePath, localPath);
                    console.log('[Backup] Uploaded photo:', remotePath);
                    break;
                  }
                } catch {}
              }
            }
          } catch (photoErr) {
            console.log('[Backup] Photo upload error (non-critical):', photoErr);
          }
        }
      } else {
        console.log('[Backup] No changes to publish');
      }

      const photoInfo = Platform.OS !== 'web' && db ? await collectPhotoInfo(db) : {};
      const newManifest = buildManifest(syncFiles, photoInfo);

      setSyncProgress({
        phase: 'uploading',
        current: totalOps,
        total: totalOps,
        currentFile: 'Обновление манифеста и бэкапа...',
      });

      await uploadTextFileYandex(accessToken, SYNC_FOLDER + '/manifest.json', JSON.stringify(newManifest));
      await saveLocalManifest(newManifest);

      try {
        console.log('[Backup] Uploading master_backup.json to sync folder...');
        const backupData = await collectBackupData();
        await uploadTextFileYandex(accessToken, SYNC_FOLDER + '/master_backup.json', JSON.stringify(backupData));
        console.log('[Backup] master_backup.json uploaded successfully');
      } catch (backupJsonErr: any) {
        console.log('[Backup] Failed to upload master_backup.json (non-critical):', backupJsonErr?.message);
      }

      try {
        const currentMasterId = masterId || firebaseUid || auth.currentUser?.uid || null;
        if (currentMasterId) {
          const masterInfo = {
            masterId: currentMasterId,
            yandexUserId: yandexUserId || null,
            email: userEmail || '',
            updatedAt: Date.now(),
          };
          console.log('[Backup] Uploading master_info.json with masterId:', currentMasterId);
          await uploadTextFileYandex(accessToken, SYNC_FOLDER + '/master_info.json', JSON.stringify(masterInfo));
          console.log('[Backup] master_info.json uploaded successfully');
        } else {
          console.log('[Backup] WARNING: No masterId available for master_info.json!');
        }
      } catch (masterInfoErr: any) {
        console.log('[Backup] Failed to upload master_info.json (non-critical):', masterInfoErr?.message);
      }

      let publicUrl = masterPublicUrl;

      if (publicUrl) {
        console.log('[Backup] Reusing existing public URL:', publicUrl);
        try {
          const resourceInfo = await getResourceInfoByPath(accessToken, SYNC_FOLDER);
          if (!resourceInfo.public_url) {
            console.log('[Backup] Folder lost public access, re-publishing...');
            publicUrl = await publishFolderYandex(accessToken, SYNC_FOLDER);
          } else {
            publicUrl = resourceInfo.public_url;
          }
        } catch (checkErr) {
          console.log('[Backup] Error checking public status, re-publishing:', checkErr);
          publicUrl = await publishFolderYandex(accessToken, SYNC_FOLDER);
        }
      } else {
        console.log('[Backup] No saved public URL, publishing folder...');
        publicUrl = await publishFolderYandex(accessToken, SYNC_FOLDER);
      }

      const now = new Date().toISOString();
      await AsyncStorage.setItem(MASTER_PUBLIC_URL_KEY, publicUrl);
      await AsyncStorage.setItem(MASTER_LAST_PUBLISH_KEY, now);
      setMasterPublicUrl(publicUrl);
      setLastMasterPublish(now);

      setSyncProgress({ phase: 'complete', current: totalOps, total: totalOps, currentFile: 'Готово' });
      setTimeout(() => setSyncProgress(null), 2000);

      console.log('[Backup] Published with file-based sync, URL:', publicUrl);
      console.log('[Backup] Uploaded:', diff.toUpload.length, 'Deleted:', diff.toDelete.length, 'Unchanged:', diff.unchanged.length);

      let fileUploadSummary = '';
      if (Platform.OS !== 'web' && fileUploadResult) {
        const r = fileUploadResult;
        if (r.uploaded > 0 || r.failed > 0 || r.skipped > 0) {
          fileUploadSummary = `\n\nФайлы в app_files/:\n  Загружено: ${r.uploaded} (документы: ${r.details.docs}, фото: ${r.details.photos}, знания: ${r.details.knowledge})\n  Пропущено: ${r.skipped}\n  Ошибок: ${r.failed}`;
          if (r.failedFiles.length > 0) {
            fileUploadSummary += `\n  Не загружены: ${r.failedFiles.slice(0, 5).join(', ')}${r.failedFiles.length > 5 ? '...' : ''}`;
          }
        } else {
          fileUploadSummary = '\n\nНовых файлов для загрузки нет';
        }
      }
      Alert.alert(
        'Публикация завершена',
        `Метаданные: загружено ${diff.toUpload.length}, удалено ${diff.toDelete.length}, без изменений ${diff.unchanged.length}${fileUploadSummary}\n\nСсылка: ${publicUrl}`
      );

      return publicUrl;
    } catch (error: any) {
      console.log('[Backup] Publish error:', error);
      setSyncProgress({ phase: 'error', current: 0, total: 0, currentFile: 'Ошибка публикации' });
      setTimeout(() => setSyncProgress(null), 3000);
      Alert.alert('Ошибка публикации', error?.message || 'Неизвестная ошибка');
      throw error;
    } finally {
      setIsPublishing(false);
    }
  }, [accessToken, db, masterPublicUrl, ensureSyncFolderStructure, getRemoteManifest, saveLocalManifest, migrateFromZipIfNeeded, uploadFilesToDiskAndUpdateDb, collectBackupData, masterId, yandexUserId, userEmail]);

  const syncFromPublicFolder = useCallback(async (publicUrl: string, targetDb?: SQLite.SQLiteDatabase) => {
    const database = targetDb || db;
    if (!database) throw new Error('Database not ready');

    console.log('[Backup] Syncing from public folder:', publicUrl);

    setSyncProgress({ phase: 'downloading', current: 0, total: 0, currentFile: 'Скачивание манифеста...' });

    const remoteManifest = await getPublicFolderManifest(publicUrl) as SyncManifest | null;

    if (!remoteManifest || !remoteManifest.files) {
      console.log('[Backup] No valid manifest in public folder, trying master_backup.json fallback...');
      setSyncProgress({ phase: 'downloading', current: 0, total: 1, currentFile: 'Скачивание master_backup.json...' });

      try {
        const backupContent = await downloadPublicFileYandex(publicUrl, 'master_backup.json');
        const backupData: BackupData = JSON.parse(backupContent);
        console.log('[Backup] Downloaded master_backup.json, version:', backupData.version, 'createdAt:', backupData.createdAt);
        await restoreFromBackupData(backupData, targetDb);
        setSyncProgress({ phase: 'complete', current: 1, total: 1, currentFile: 'Готово (из master_backup.json)' });
        setTimeout(() => setSyncProgress(null), 2000);
        console.log('[Backup] Restored from master_backup.json successfully');
        return;
      } catch (backupJsonErr) {
        console.log('[Backup] master_backup.json fallback failed:', backupJsonErr);
      }

      setSyncProgress(null);

      if (Platform.OS !== 'web') {
        try {
          const arrayBuffer = await downloadPublicZipBackup(publicUrl);
          const zip = await JSZip.loadAsync(arrayBuffer);
          const dbFile = zip.file('database.json');
          if (dbFile) {
            const dbJsonStr = await dbFile.async('string');
            const data: BackupData = JSON.parse(dbJsonStr);
            await restoreFromBackupData(data, targetDb);
            await restoreFilesFromZip(zip, targetDb);
            return;
          }
        } catch (zipErr) {
          console.log('[Backup] Not ZIP, trying JSON...', zipErr);
        }
      }

      const data = await downloadPublicBackup(publicUrl);
      await restoreFromBackupData(data, targetDb);
      return;
    }

    const filePaths = Object.keys(remoteManifest.files);
    const totalFiles = filePaths.length;
    const downloadedFiles: Record<string, string> = {};

    console.log('[Backup] Downloading', totalFiles, 'files from public folder...');

    for (let i = 0; i < filePaths.length; i++) {
      const path = filePaths[i];
      const shortName = path.split('/').pop() || path;

      setSyncProgress({
        phase: 'downloading',
        current: i + 1,
        total: totalFiles,
        currentFile: shortName,
      });

      try {
        const content = await downloadPublicFileYandex(publicUrl, path);
        downloadedFiles[path] = content;
      } catch (e) {
        console.log('[Backup] Failed to download file:', path, e);
      }
    }

    console.log('[Backup] Downloaded', Object.keys(downloadedFiles).length, 'files, restoring...');

    setSyncProgress({
      phase: 'downloading',
      current: totalFiles,
      total: totalFiles,
      currentFile: 'Применение данных...',
    });

    await restoreFromSyncFiles(database, downloadedFiles);

    setSyncProgress({ phase: 'complete', current: totalFiles, total: totalFiles, currentFile: 'Готово' });
    setTimeout(() => setSyncProgress(null), 2000);

    console.log('[Backup] Sync from public folder complete');
  }, [db, restoreFromBackupData, restoreFilesFromZip]);

  const ensureSubscriberFolderAccess = useCallback(async (subscriberEmail: string) => {
    if (!accessToken) return;
    try {
      console.log('[Backup] Ensuring comments folder access for subscriber:', subscriberEmail);
      const folderExists = await checkFolderAccessYandex(accessToken, COMMENTS_FOLDER);
      if (!folderExists) {
        console.log('[Backup] Comments folder does not exist, creating...');
        await ensureCommentsFolderYandex(accessToken);
      }
      const granted = await grantFolderAccessYandex(accessToken, COMMENTS_FOLDER, subscriberEmail);
      if (granted) {
        console.log('[Backup] Comments folder access granted to:', subscriberEmail);
      } else {
        console.log('[Backup] Could not grant direct access to:', subscriberEmail, '- folder is published publicly as fallback');
      }
    } catch (e: any) {
      console.log('[Backup] ensureSubscriberFolderAccess error:', e?.message);
    }
  }, [accessToken]);

  const addSubscriberEmail = useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    const updated = [...new Set([...subscriberEmails, trimmed])];
    setSubscriberEmails(updated);
    await AsyncStorage.setItem(SUBSCRIBER_EMAILS_KEY, JSON.stringify(updated));
    console.log('[Backup] Added subscriber email:', trimmed);
  }, [subscriberEmails]);

  const removeSubscriberEmail = useCallback(async (email: string) => {
    const updated = subscriberEmails.filter(e => e !== email);
    setSubscriberEmails(updated);
    await AsyncStorage.setItem(SUBSCRIBER_EMAILS_KEY, JSON.stringify(updated));
    console.log('[Backup] Removed subscriber email:', email);
  }, [subscriberEmails]);

  const grantAccessToSubscriber = useCallback(async (subscriberEmail: string) => {
    if (!accessToken) {
      Alert.alert('Ошибка', 'Сначала подключите Яндекс.Диск');
      return;
    }
    setIsGrantingAccess(true);
    try {
      console.log('[Backup] Granting comments folder access to:', subscriberEmail);
      const folderExists = await checkFolderAccessYandex(accessToken, COMMENTS_FOLDER);
      if (!folderExists) {
        console.log('[Backup] Comments folder does not exist, creating...');
        await ensureCommentsFolderYandex(accessToken);
      }
      const granted = await grantFolderAccessYandex(accessToken, COMMENTS_FOLDER, subscriberEmail);
      if (granted) {
        Alert.alert('Успех', `Доступ к комментариям выдан для ${subscriberEmail}`);
        console.log('[Backup] Comments folder access granted to:', subscriberEmail);
      } else {
        Alert.alert('Внимание', `Не удалось выдать прямой доступ для ${subscriberEmail}. Папка опубликована публично как резервный вариант.`);
        console.log('[Backup] Could not grant direct access, folder published publicly');
      }
    } catch (e: any) {
      console.error('[Backup] grantAccessToSubscriber error:', e?.message);
      Alert.alert('Ошибка', 'Не удалось выдать доступ: ' + (e?.message || 'неизвестная ошибка'));
    } finally {
      setIsGrantingAccess(false);
    }
  }, [accessToken]);

  const removeFirestoreSubscriber = useCallback(async (subscriberId: string) => {
    const eMasterId = effectiveMasterId;
    if (!eMasterId) {
      Alert.alert('Ошибка', 'Не удалось определить masterId');
      return;
    }
    try {
      console.log('[Backup] Removing Firestore subscriber:', subscriberId, 'for masterId:', eMasterId);
      const q = query(
        collection(firestore, 'subscriptions'),
        where('masterId', '==', eMasterId),
        where('subscriberId', '==', subscriberId)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        console.log('[Backup] No Firestore subscription doc found for subscriber:', subscriberId);
        Alert.alert('Ошибка', 'Подписчик не найден в базе данных');
        return;
      }
      const { deleteDoc } = await import('firebase/firestore');
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
        console.log('[Backup] Deleted Firestore subscription doc:', d.id);
      }
      Alert.alert('Готово', 'Подписчик удалён');
    } catch (e: any) {
      console.log('[Backup] removeFirestoreSubscriber error:', e?.message);
      Alert.alert('Ошибка', 'Не удалось удалить подписчика: ' + (e?.message || 'неизвестная ошибка'));
    }
  }, [effectiveMasterId]);

  const sendInvitationToSubscriber = useCallback(async (subscriberEmail: string) => {
    if (!accessToken) {
      Alert.alert('Ошибка', 'Сначала подключите Яндекс.Диск');
      return;
    }
    if (!isMasterEnabled) {
      Alert.alert('Ошибка', 'Вы не в режиме мастера');
      return;
    }
    setIsSendingInvitation(true);
    try {
      console.log('[Backup] Sending invitation to subscriber:', subscriberEmail);
      const folderExists = await checkFolderAccessYandex(accessToken, COMMENTS_FOLDER);
      if (!folderExists) {
        console.log('[Backup] Comments folder does not exist, creating...');
        await ensureCommentsFolderYandex(accessToken);
      }
      const result = await sendFolderInvitationYandex(accessToken, COMMENTS_FOLDER, subscriberEmail);
      if (result.success) {
        Alert.alert(
          'Приглашение отправлено',
          `${result.message}\n\nПодписчик должен принять приглашение в Яндекс.Диске (веб-версии или приложении), после чего сможет оставлять комментарии.`
        );
        console.log('[Backup] Invitation sent successfully to:', subscriberEmail);
      } else {
        Alert.alert('Ошибка отправки', result.message);
        console.log('[Backup] Invitation failed:', result.message);
      }
    } catch (e: any) {
      console.error('[Backup] sendInvitationToSubscriber error:', e?.message);
      Alert.alert('Ошибка', 'Не удалось отправить приглашение: ' + (e?.message || 'неизвестная ошибка'));
    } finally {
      setIsSendingInvitation(false);
    }
  }, [accessToken, isMasterEnabled]);

  const enableMasterModeInternal = useCallback(async () => {
    setIsMasterEnabled(true);
    await AsyncStorage.setItem(MASTER_ENABLED_KEY, 'true');
    console.log('[Backup] Master mode: enabled');

    if (accessToken) {
      const MAX_MASTER_INFO_RETRIES = 3;
      let masterInfoUploaded = false;
      for (let attempt = 1; attempt <= MAX_MASTER_INFO_RETRIES; attempt++) {
        try {
          console.log('[Backup] Ensuring sync folder exists for master_info.json... (attempt', attempt, ')');
          await ensureFolderYandex(accessToken, SYNC_FOLDER);
          const currentMasterId = masterId || firebaseUid || auth.currentUser?.uid || 'unknown';
          const masterInfo = {
            masterId: currentMasterId,
            yandexUserId: yandexUserId || null,
            email: userEmail || '',
            updatedAt: Date.now(),
          };
          await uploadTextFileYandex(accessToken, SYNC_FOLDER + '/master_info.json', JSON.stringify(masterInfo));
          console.log('[Backup] master_info.json created for master mode, masterId:', currentMasterId);
          masterInfoUploaded = true;
          break;
        } catch (e: any) {
          console.log('[Backup] Failed to upload master_info.json attempt', attempt, ':', e?.message);
          if (attempt < MAX_MASTER_INFO_RETRIES) {
            console.log('[Backup] Retrying master_info.json upload in', attempt * 1000, 'ms...');
            await new Promise(r => setTimeout(r, attempt * 1000));
          }
        }
      }
      if (!masterInfoUploaded) {
        console.log('[Backup] WARNING: master_info.json could not be uploaded after', MAX_MASTER_INFO_RETRIES, 'attempts');
      }

      try {
        console.log('[Backup] Creating and publishing comments folder for master...');
        await ensureCommentsFolderYandex(accessToken);
        const commentsPublicUrl = await publishCommentsFolderYandex(accessToken);
        if (commentsPublicUrl) {
          console.log('[Backup] Comments folder published:', commentsPublicUrl);
        } else {
          console.log('[Backup] Comments folder created but publishing failed (non-critical)');
        }
      } catch (e: any) {
        console.log('[Backup] Failed to create/publish comments folder (non-critical):', e?.message);
      }
    }
  }, [accessToken, masterId, firebaseUid, yandexUserId, userEmail]);

  const disableMasterModeInternal = useCallback(async () => {
    setIsMasterEnabled(false);
    await AsyncStorage.setItem(MASTER_ENABLED_KEY, 'false');
    setMasterPublicUrl(null);
    setLastMasterPublish(null);
    await AsyncStorage.removeItem(MASTER_PUBLIC_URL_KEY);
    await AsyncStorage.removeItem(MASTER_LAST_PUBLISH_KEY);
    console.log('[Backup] Master mode: disabled');
  }, []);

  const checkExistingBackupOnDisk = useCallback(async (token: string): Promise<boolean> => {
    try {
      console.log('[Backup] Checking if master_backup.json exists on Disk...');
      const backupPath = SYNC_FOLDER + '/master_backup.json';
      const exists = await resourceExistsYandex(token, backupPath);
      console.log('[Backup] master_backup.json exists on Disk:', exists);
      if (!exists) {
        const manifestPath = SYNC_FOLDER + '/manifest.json';
        const manifestExists = await resourceExistsYandex(token, manifestPath);
        console.log('[Backup] manifest.json exists on Disk:', manifestExists);
        return manifestExists;
      }
      return exists;
    } catch (e: any) {
      console.log('[Backup] Error checking existing backup:', e?.message);
      return false;
    }
  }, []);

  const restoreFromDiskAndEnableMaster = useCallback(async () => {
    if (!accessToken) throw new Error('Not authenticated');
    setIsPublishing(true);
    try {
      console.log('[Backup] Restoring data from Disk before enabling master...');
      setSyncProgress({ phase: 'downloading', current: 0, total: 0, currentFile: 'Загрузка данных с Диска...' });

      let publicUrl = masterPublicUrl;
      if (!publicUrl) {
        try {
          const resourceInfo = await getResourceInfoByPath(accessToken, SYNC_FOLDER);
          publicUrl = resourceInfo.public_url || null;
        } catch {
          console.log('[Backup] Could not get public URL for sync folder');
        }
      }

      if (publicUrl) {
        await syncFromPublicFolder(publicUrl);
        await refreshAllProviders();
        setMasterPublicUrl(publicUrl);
        await AsyncStorage.setItem(MASTER_PUBLIC_URL_KEY, publicUrl);
      } else {
        try {
          const backupContent = await downloadTextFileYandex(accessToken, SYNC_FOLDER + '/master_backup.json');
          const backupData: BackupData = JSON.parse(backupContent);
          await restoreFromBackupData(backupData);
          await refreshAllProviders();
        } catch (backupErr: any) {
          console.log('[Backup] Could not restore from master_backup.json:', backupErr?.message);
          throw new Error('Не удалось загрузить данные с Диска: ' + (backupErr?.message || 'неизвестная ошибка'));
        }
      }

      await enableMasterModeInternal();
      const now = new Date().toISOString();
      setLastMasterPublish(now);
      await AsyncStorage.setItem(MASTER_LAST_PUBLISH_KEY, now);

      setSyncProgress({ phase: 'complete', current: 1, total: 1, currentFile: 'Готово' });
      setTimeout(() => setSyncProgress(null), 2000);

      Alert.alert('Готово', 'Данные загружены с Диска. Режим мастера включён.');
      console.log('[Backup] Restored from Disk and enabled master mode');
    } catch (error: any) {
      console.log('[Backup] Error restoring from Disk:', error);
      setSyncProgress({ phase: 'error', current: 0, total: 0, currentFile: 'Ошибка загрузки' });
      setTimeout(() => setSyncProgress(null), 3000);
      Alert.alert('Ошибка', error?.message || 'Не удалось загрузить данные');
    } finally {
      setIsPublishing(false);
    }
  }, [accessToken, masterPublicUrl, syncFromPublicFolder, refreshAllProviders, restoreFromBackupData, enableMasterModeInternal]);

  const toggleMasterMode = useCallback(async (enable: boolean) => {
    if (!enable) {
      await disableMasterModeInternal();
      return;
    }

    if (isMasterEnabled) {
      console.log('[Backup] Master mode already enabled, skipping check');
      return;
    }

    if (!accessToken) {
      Alert.alert('Ошибка', 'Сначала подключите Яндекс.Диск');
      return;
    }

    const existsOnDisk = await checkExistingBackupOnDisk(accessToken);

    if (existsOnDisk) {
      console.log('[Backup] Existing backup found on Disk, showing dialog...');
      return new Promise<void>((resolve) => {
        Alert.alert(
          'Данные найдены на Диске',
          'На Яндекс.Диске уже есть данные от другого мастера. Хотите загрузить их и продолжить работу с ними? (Ваши локальные данные будут заменены)',
          [
            {
              text: 'Отмена',
              style: 'cancel',
              onPress: () => {
                console.log('[Backup] User cancelled master mode activation');
                resolve();
              },
            },
            {
              text: 'Загрузить',
              onPress: async () => {
                try {
                  await restoreFromDiskAndEnableMaster();
                } catch (e) {
                  console.log('[Backup] Restore from Disk failed:', e);
                }
                resolve();
              },
            },
            {
              text: 'Перезаписать',
              style: 'destructive',
              onPress: async () => {
                console.log('[Backup] User chose to overwrite existing backup');
                await enableMasterModeInternal();
                resolve();
              },
            },
          ]
        );
      });
    } else {
      console.log('[Backup] No existing backup on Disk, enabling master mode directly');
      await enableMasterModeInternal();
    }
  }, [accessToken, isMasterEnabled, checkExistingBackupOnDisk, enableMasterModeInternal, disableMasterModeInternal, restoreFromDiskAndEnableMaster]);

  const setMasterInterval = useCallback(async (interval: SyncIntervalValue) => {
    setMasterIntervalState(interval);
    await AsyncStorage.setItem(MASTER_INTERVAL_KEY, String(interval));
  }, []);

  const subscribeToMaster = useCallback(async (publicUrl: string) => {
    console.log('[Backup] Subscribing to master:', publicUrl);
    setSubscriptionUrl(publicUrl);
    await AsyncStorage.setItem(SUBSCRIBER_URL_KEY, publicUrl);

    await syncFromPublicFolder(publicUrl);
    await refreshAllProviders();

    const now = new Date().toISOString();
    setLastSyncCheck(now);
    await AsyncStorage.setItem(SUBSCRIBER_LAST_CHECK_KEY, now);

    setIsAutoSyncEnabled(true);
    await AsyncStorage.setItem(SUBSCRIBER_AUTO_KEY, 'true');
    console.log('[Backup] Subscribed and synced');
  }, [syncFromPublicFolder, refreshAllProviders]);

  const unsubscribe = useCallback(async () => {
    setSubscriptionUrl(null);
    setIsAutoSyncEnabled(false);
    setLastSyncCheck(null);
    await AsyncStorage.removeItem(SUBSCRIBER_URL_KEY);
    await AsyncStorage.removeItem(SUBSCRIBER_AUTO_KEY);
    await AsyncStorage.removeItem(SUBSCRIBER_LAST_CHECK_KEY);
    console.log('[Backup] Unsubscribed');
  }, []);

  const setSyncIntervalFn = useCallback(async (interval: SyncIntervalValue) => {
    setSyncIntervalState(interval);
    await AsyncStorage.setItem(SUBSCRIBER_INTERVAL_KEY, String(interval));
  }, []);

  const toggleAutoSync = useCallback(async (enable: boolean) => {
    setIsAutoSyncEnabled(enable);
    await AsyncStorage.setItem(SUBSCRIBER_AUTO_KEY, enable ? 'true' : 'false');
  }, []);

  const checkForUpdates = useCallback(async (): Promise<{ updated: boolean; error?: string }> => {
    if (!subscriptionUrl) return { updated: false, error: 'Нет ссылки на мастера' };
    setIsSyncing(true);
    try {
      console.log('[Backup] Checking for updates from master...');
      console.log('[Backup] Subscription URL:', subscriptionUrl);
      console.log('[Backup] Last sync check:', lastSyncCheck);

      const remoteManifest = await getPublicManifestData(subscriptionUrl);
      const lastCheckTime = lastSyncCheck ? new Date(lastSyncCheck).getTime() : 0;

      let needUpdate = false;
      let remoteUpdatedAt = 0;

      if (remoteManifest && remoteManifest.updatedAt) {
        remoteUpdatedAt = remoteManifest.updatedAt;
        needUpdate = remoteUpdatedAt > lastCheckTime;
        console.log('[Backup] Manifest updatedAt:', new Date(remoteUpdatedAt).toISOString(), '(', remoteUpdatedAt, ')');
        console.log('[Backup] Last check time:', lastSyncCheck || 'never', '(', lastCheckTime, ')');
        console.log('[Backup] Need update (manifest):', needUpdate, 'diff:', remoteUpdatedAt - lastCheckTime, 'ms');
      } else {
        console.log('[Backup] No manifest found, trying folder modified date...');
        try {
          const info = await getPublicResourceInfo(subscriptionUrl);
          remoteUpdatedAt = new Date(info.modified).getTime();
          needUpdate = remoteUpdatedAt > lastCheckTime;
          console.log('[Backup] Folder modified:', new Date(info.modified).toISOString());
        } catch (infoErr) {
          console.log('[Backup] Failed to get folder info, forcing sync:', infoErr);
          needUpdate = true;
        }
      }

      if (!needUpdate && lastCheckTime === 0) {
        console.log('[Backup] First sync ever, forcing update');
        needUpdate = true;
      }

      if (needUpdate) {
        console.log('[Backup] New data available, syncing...');
        await syncFromPublicFolder(subscriptionUrl);
        await refreshAllProviders();

        const now = new Date().toISOString();
        setLastSyncCheck(now);
        await AsyncStorage.setItem(SUBSCRIBER_LAST_CHECK_KEY, now);

        Alert.alert(
          'Синхронизация завершена',
          `Данные обновлены.\nДата на Диске: ${remoteUpdatedAt ? new Date(remoteUpdatedAt).toLocaleString() : 'н/д'}\nЛокальная дата: ${lastSyncCheck || 'первая синхронизация'}`
        );
        return { updated: true };
      } else {
        console.log('[Backup] No new data');
        const now = new Date().toISOString();
        setLastSyncCheck(now);
        await AsyncStorage.setItem(SUBSCRIBER_LAST_CHECK_KEY, now);

        Alert.alert(
          'Нет обновлений',
          `Данные актуальны.\nДата на Диске: ${remoteUpdatedAt ? new Date(remoteUpdatedAt).toLocaleString() : 'н/д'}\nПоследняя проверка: ${lastSyncCheck || 'н/д'}`
        );
        return { updated: false };
      }
    } catch (error: any) {
      console.log('[Backup] Check for updates error:', error);
      Alert.alert('Ошибка проверки обновлений', error?.message || 'Неизвестная ошибка');
      return { updated: false, error: error?.message || 'Ошибка проверки обновлений' };
    } finally {
      setIsSyncing(false);
    }
  }, [subscriptionUrl, lastSyncCheck, syncFromPublicFolder, refreshAllProviders]);

  const manualSync = useCallback(async (): Promise<{ updated: boolean; error?: string }> => {
    return checkForUpdates();
  }, [checkForUpdates]);

  const saveSubscriptions = useCallback(async (subs: MasterSubscription[]) => {
    setSubscriptions(subs);
    await AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subs));
    console.log('[Backup] Saved subscriptions:', subs.length);
    void refreshProfiles();
  }, [refreshProfiles]);

  const addSubscription = useCallback(async (name: string, masterUrl: string, subscriberEmail?: string): Promise<MasterSubscription> => {
    let remoteMasterId: string | null = null;
    let linkValid = false;

    const MAX_MASTER_INFO_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_MASTER_INFO_RETRIES; attempt++) {
      try {
        console.log('[Backup] addSubscription: fetching master_info.json attempt', attempt);
        const masterInfoContent = await downloadPublicFileYandex(masterUrl, 'master_info.json');
        const masterInfo = JSON.parse(masterInfoContent);
        remoteMasterId = masterInfo.masterId || null;
        if (remoteMasterId) {
          linkValid = true;
          console.log('[Backup] Got masterId from master_info.json:', remoteMasterId, '(attempt', attempt, ')');
          break;
        }
      } catch (e: any) {
        console.log('[Backup] Could not fetch master_info.json attempt', attempt, ':', e?.message);
      }
      if (attempt < MAX_MASTER_INFO_RETRIES && !remoteMasterId) {
        console.log('[Backup] Waiting 2s before retry...');
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!remoteMasterId) {
      try {
        console.log('[Backup] Trying to get masterId from master_backup.json...');
        const backupContent = await downloadPublicFileYandex(masterUrl, 'master_backup.json');
        if (backupContent) {
          linkValid = true;
          console.log('[Backup] Link validated via master_backup.json');
          try {
            const backupData = JSON.parse(backupContent);
            if (backupData.masterId) {
              remoteMasterId = backupData.masterId;
              console.log('[Backup] Got masterId from master_backup.json:', remoteMasterId);
            }
          } catch (parseErr) {
            console.log('[Backup] Could not parse master_backup.json for masterId');
          }
        }
      } catch (e: any) {
        console.log('[Backup] Could not fetch master_backup.json:', e?.message);
      }
    }

    if (!linkValid) {
      try {
        const manifestContent = await downloadPublicFileYandex(masterUrl, 'manifest.json');
        if (manifestContent) {
          linkValid = true;
          console.log('[Backup] Link validated via manifest.json');
          if (!remoteMasterId) {
            try {
              const manifestData = JSON.parse(manifestContent);
              if (manifestData.masterId) {
                remoteMasterId = manifestData.masterId;
                console.log('[Backup] Got masterId from manifest.json:', remoteMasterId);
              }
            } catch (parseErr) {
              console.log('[Backup] Could not parse manifest.json for masterId');
            }
          }
        }
      } catch (e: any) {
        console.log('[Backup] Could not fetch manifest.json:', e?.message);
      }
    }

    if (!linkValid) {
      throw new Error('Недействительная ссылка. Проверьте адрес и убедитесь, что мастер опубликовал данные.');
    }

    if (!remoteMasterId) {
      console.log('[Backup] WARNING: Link is valid but no masterId found after all attempts. Comments and chats will NOT work.');
      Alert.alert(
        'Внимание',
        'Мастер ещё не опубликовал master_info.json. Комментарии и чат не будут работать. Попросите мастера опубликовать данные заново или подождите и повторите попытку.'
      );
    } else {
      console.log('[Backup] addSubscription: remoteMasterId resolved:', remoteMasterId);
    }

    const newSub: MasterSubscription = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name,
      masterUrl,
      masterId: remoteMasterId || undefined,
      autoSyncEnabled: false,
      syncInterval: 'daily',
      lastSyncTimestamp: null,
    };
    const updated = [...subscriptions, newSub];
    await saveSubscriptions(updated);
    console.log('[Backup] Added subscription:', newSub.id, name, 'masterId:', remoteMasterId, 'localSubId:', newSub.id);

    if (remoteMasterId) {
      console.log('[Backup][DEBUG] addSubscription: Starting Firestore registration with remoteMasterId:', remoteMasterId);
      let firestoreRegistered = false;
      const MAX_RETRIES = 3;
      for (let attempt = 1; attempt <= MAX_RETRIES && !firestoreRegistered; attempt++) {
        try {
          let currentUser = auth.currentUser;
          console.log('[Backup][DEBUG] addSubscription: attempt', attempt, '| currentUser:', currentUser?.uid || 'null');
          if (!currentUser) {
            console.log('[Backup] No Firebase user yet, signing in anonymously... (attempt', attempt, ')');
            const { signInAnonymously } = await import('firebase/auth');
            const cred = await signInAnonymously(auth);
            currentUser = cred.user;
            console.log('[Backup] Anonymous sign-in complete, uid:', currentUser.uid);
          }
          const subscriberUid = currentUser.uid;
          const storedDisplayName = await AsyncStorage.getItem('@user_display_name');
          const subscriberName = storedDisplayName || name || ('Подписчик_' + subscriberUid.slice(0, 6));

          console.log('[Backup][DEBUG] addSubscription: Checking existing Firestore doc for masterId:', remoteMasterId, 'subscriberId:', subscriberUid);
          const existingQuery = query(
            collection(firestore, 'subscriptions'),
            where('masterId', '==', remoteMasterId),
            where('subscriberId', '==', subscriberUid)
          );
          const existingSnap = await getDocs(existingQuery);
          console.log('[Backup][DEBUG] addSubscription: existingSnap.empty:', existingSnap.empty, 'size:', existingSnap.size);
          if (!existingSnap.empty) {
            console.log('[Backup] Subscriber already registered in Firestore, skipping duplicate');
            firestoreRegistered = true;
            break;
          }

          console.log('[Backup][DEBUG] addSubscription: Creating Firestore doc with data:', JSON.stringify({ masterId: remoteMasterId, subscriberId: subscriberUid, subscriberName, masterUrl }));
          const docRef = await addDoc(collection(firestore, 'subscriptions'), {
            masterId: remoteMasterId,
            subscriberId: subscriberUid,
            subscriberName,
            masterUrl,
            createdAt: serverTimestamp(),
          });
          firestoreRegistered = true;
          console.log('[Backup] Created Firestore subscription doc: id=', docRef.id, 'masterId=', remoteMasterId, 'subscriberId=', subscriberUid, 'subscriberName=', subscriberName, 'masterUrl=', masterUrl);
        } catch (firestoreErr: any) {
          const errMsg = firestoreErr?.message || '';
          console.log('[Backup] Firestore subscription attempt', attempt, 'failed:', errMsg);
          if (errMsg.includes('permission') || errMsg.includes('Permission')) {
            console.log('[Backup] Firestore permissions error - master needs to configure Firestore Rules');
            Alert.alert(
              'Внимание',
              'Подписка добавлена, но уведомление мастеру не отправлено из-за ограничений доступа Firebase. Попросите мастера настроить правила Firestore для коллекций: subscriptions, comments, messages, chats.\n\nПравила должны разрешать чтение и запись для авторизованных пользователей (allow read, write: if request.auth != null).'
            );
            break;
          }
          if (attempt < MAX_RETRIES) {
            console.log('[Backup] Retrying Firestore registration in', attempt * 1000, 'ms...');
            await new Promise(r => setTimeout(r, attempt * 1000));
          } else {
            console.log('[Backup] All Firestore registration attempts failed');
            Alert.alert(
              'Внимание',
              'Подписка добавлена локально, но регистрация у мастера не удалась. Попробуйте позже повторно добавить подписку или проверьте интернет-соединение.'
            );
          }
        }
      }
    }

    if (accessToken && isMasterEnabled) {
      const emailToGrant = subscriberEmail || '';
      if (emailToGrant) {
        try {
          console.log('[Backup] Granting comments folder access for subscriber:', emailToGrant);
          await ensureSubscriberFolderAccess(emailToGrant);
        } catch (e: any) {
          console.warn('[Backup] Failed to grant folder access (non-critical):', e?.message);
          Alert.alert('Предупреждение', 'Не удалось предоставить доступ к общей папке комментариев. Комментарии будут работать через публичную ссылку.');
        }
      } else {
        console.log('[Backup] No subscriber email provided, ensuring comments folder is published...');
        try {
          await ensureCommentsFolderYandex(accessToken);
          await publishCommentsFolderYandex(accessToken);
        } catch (e: any) {
          console.log('[Backup] Failed to ensure/publish comments folder:', e?.message);
        }
      }
    }

    return newSub;
  }, [subscriptions, saveSubscriptions, accessToken, isMasterEnabled, ensureSubscriberFolderAccess]);

  const removeSubscription = useCallback(async (id: string) => {
    const updated = subscriptions.filter((s) => s.id !== id);
    await saveSubscriptions(updated);
  }, [subscriptions, saveSubscriptions]);

  const renameSubscription = useCallback(async (id: string, name: string) => {
    const updated = subscriptions.map((s) => s.id === id ? { ...s, name } : s);
    await saveSubscriptions(updated);
  }, [subscriptions, saveSubscriptions]);

  const updateSubscriptionAutoSync = useCallback(async (id: string, enabled: boolean) => {
    const updated = subscriptions.map((s) => s.id === id ? { ...s, autoSyncEnabled: enabled } : s);
    await saveSubscriptions(updated);
  }, [subscriptions, saveSubscriptions]);

  const updateSubscriptionInterval = useCallback(async (id: string, interval: SyncIntervalKey) => {
    const updated = subscriptions.map((s) => s.id === id ? { ...s, syncInterval: interval } : s);
    await saveSubscriptions(updated);
  }, [subscriptions, saveSubscriptions]);

  const restoreToProfileDb = useCallback(async (profileId: string, publicUrl: string) => {
    const isActiveProfile = profileId === activeProfileId;
    if (isActiveProfile) {
      await syncFromPublicFolder(publicUrl);
      return;
    }
    console.log('[Backup] Restoring to profile DB:', profileId);
    const targetDb = await openProfileDatabase(profileId);
    try {
      await syncFromPublicFolder(publicUrl, targetDb);
      console.log('[Backup] Profile DB sync complete for:', profileId);
    } finally {
      await targetDb.closeAsync();
    }
  }, [activeProfileId, syncFromPublicFolder]);

  const syncSubscription = useCallback(async (id: string): Promise<{ updated: boolean; error?: string }> => {
    const sub = subscriptions.find((s) => s.id === id);
    if (!sub) return { updated: false, error: 'Подписка не найдена' };
    setIsSyncingSubscription(id);
    try {
      console.log('[Backup] === syncSubscription START ===');
      console.log('[Backup] Subscription:', sub.name, 'URL:', sub.masterUrl);
      const lastCheck = sub.lastSyncTimestamp || 0;
      console.log('[Backup] Last sync timestamp:', lastCheck, lastCheck ? new Date(lastCheck).toISOString() : 'never');
      let needUpdate = false;
      let remoteUpdatedAt = 0;

      const remoteManifest = await getPublicManifestData(sub.masterUrl);
      if (remoteManifest && remoteManifest.updatedAt) {
        remoteUpdatedAt = remoteManifest.updatedAt;
        needUpdate = remoteUpdatedAt > lastCheck;
        console.log('[Backup] Manifest updatedAt:', new Date(remoteUpdatedAt).toISOString(), '(', remoteUpdatedAt, ')');
        console.log('[Backup] Last check:', lastCheck ? new Date(lastCheck).toISOString() : 'never', '(', lastCheck, ')');
        console.log('[Backup] needUpdate (manifest):', needUpdate, 'diff:', remoteUpdatedAt - lastCheck, 'ms');
      } else {
        console.log('[Backup] No manifest or no updatedAt, trying folder modified date...');
        try {
          const info = await getPublicResourceInfo(sub.masterUrl);
          remoteUpdatedAt = new Date(info.modified).getTime();
          needUpdate = remoteUpdatedAt > lastCheck;
          console.log('[Backup] Folder modified:', new Date(remoteUpdatedAt).toISOString(), 'needUpdate:', needUpdate);
        } catch (infoErr) {
          console.log('[Backup] Failed to get folder info, forcing full sync:', infoErr);
          needUpdate = true;
        }
      }

      if (!needUpdate && lastCheck === 0) {
        console.log('[Backup] First sync ever, forcing update');
        needUpdate = true;
      }

      if (needUpdate) {
        console.log('[Backup] Syncing subscription data:', sub.name);
        await restoreToProfileDb(id, sub.masterUrl);
        if (id === activeProfileId) {
          console.log('[Backup] Active profile, refreshing providers...');
          await refreshAllProviders();
        }
        const now = Date.now();
        const updated = subscriptions.map((s) => s.id === id ? { ...s, lastSyncTimestamp: now } : s);
        await saveSubscriptions(updated);
        console.log('[Backup] === syncSubscription DONE (updated) ===');
        Alert.alert(
          'Синхронизация завершена',
          `Подписка "${sub.name}" обновлена.\nДата на Диске: ${remoteUpdatedAt ? new Date(remoteUpdatedAt).toLocaleString() : 'н/д'}`
        );
        return { updated: true };
      } else {
        console.log('[Backup] No new data for subscription:', sub.name);
        const now = Date.now();
        const updated = subscriptions.map((s) => s.id === id ? { ...s, lastSyncTimestamp: now } : s);
        await saveSubscriptions(updated);
        console.log('[Backup] === syncSubscription DONE (no update) ===');
        Alert.alert(
          'Нет обновлений',
          `Подписка "${sub.name}" актуальна.\nДата на Диске: ${remoteUpdatedAt ? new Date(remoteUpdatedAt).toLocaleString() : 'н/д'}`
        );
        return { updated: false };
      }
    } catch (error: any) {
      console.log('[Backup] Sync subscription error:', id, error);
      Alert.alert('Ошибка синхронизации', `Подписка "${sub.name}"\n${error?.message || 'Неизвестная ошибка'}`);
      return { updated: false, error: error?.message || 'Ошибка синхронизации' };
    } finally {
      setIsSyncingSubscription(null);
    }
  }, [subscriptions, restoreToProfileDb, saveSubscriptions, activeProfileId, refreshAllProviders]);

  const toggleMasterAutoSync = useCallback(async (enable: boolean) => {
    setMasterAutoSyncEnabledState(enable);
    await AsyncStorage.setItem(MASTER_AUTO_SYNC_KEY, enable ? 'true' : 'false');
  }, []);

  const setMasterAutoSyncInterval = useCallback(async (interval: SyncIntervalValue) => {
    setMasterAutoSyncIntervalState(interval);
    await AsyncStorage.setItem(MASTER_AUTO_SYNC_INTERVAL_KEY, String(interval));
  }, []);

  const masterSyncNow = useCallback(async (): Promise<{ updated: boolean; error?: string }> => {
    if (!masterPublicUrl) return { updated: false, error: 'Нет публичной ссылки мастера' };
    setIsMasterSyncing(true);
    try {
      console.log('[Backup] Master self-sync from:', masterPublicUrl);
      const info = await getPublicResourceInfo(masterPublicUrl);
      const remoteModified = new Date(info.modified).getTime();
      const lastCheck = lastMasterSync ? new Date(lastMasterSync).getTime() : 0;

      if (remoteModified > lastCheck) {
        console.log('[Backup] New master data available, syncing...');
        const isActiveProfile = activeProfileId === 'master';
        if (isActiveProfile) {
          await syncFromPublicFolder(masterPublicUrl);
          await refreshAllProviders();
        } else {
          const masterDb = await openProfileDatabase('master');
          try {
            await syncFromPublicFolder(masterPublicUrl, masterDb);
          } finally {
            await masterDb.closeAsync();
          }
        }
        const now = new Date().toISOString();
        setLastMasterSync(now);
        await AsyncStorage.setItem(MASTER_LAST_SYNC_KEY, now);
        return { updated: true };
      } else {
        console.log('[Backup] Master data is up to date');
        const now = new Date().toISOString();
        setLastMasterSync(now);
        await AsyncStorage.setItem(MASTER_LAST_SYNC_KEY, now);
        return { updated: false };
      }
    } catch (error: any) {
      console.log('[Backup] Master sync error:', error);
      return { updated: false, error: error?.message || 'Ошибка синхронизации мастера' };
    } finally {
      setIsMasterSyncing(false);
    }
  }, [masterPublicUrl, lastMasterSync, activeProfileId, syncFromPublicFolder, refreshAllProviders]);

  const loadBackupsList = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingBackups(true);
    try {
      const files = await listBackupsYandex(accessToken);
      setBackupsList(files);
    } catch (error) {
      console.log('[Backup] Error loading backups list:', error);
    } finally {
      setIsLoadingBackups(false);
    }
  }, [accessToken]);

  const toggleAutoBackup = useCallback(async () => {
    const newValue = !autoBackupEnabled;
    setAutoBackupEnabled(newValue);
    await AsyncStorage.setItem(AUTO_BACKUP_KEY, newValue ? 'true' : 'false');
  }, [autoBackupEnabled]);

  useEffect(() => {
    if (accessToken && autoBackupEnabled && isReady) {
      const checkAutoBackup = async () => {
        try {
          const lastDate = await AsyncStorage.getItem(LAST_BACKUP_KEY);
          if (lastDate) {
            const diff = Date.now() - new Date(lastDate).getTime();
            if (diff < 24 * 60 * 60 * 1000) return;
          }
          console.log('[Backup] Auto backup: creating...');

          if (Platform.OS !== 'web') {
            await uploadFilesToDiskAndUpdateDb(accessToken);
          }
          const data = await collectBackupData();
          await uploadBackupYandex(accessToken, data);

          await cleanupOldBackupsYandex(accessToken, 5);
          const now = new Date().toISOString();
          await AsyncStorage.setItem(LAST_BACKUP_KEY, now);
          setLastBackupDate(now);
          console.log('[Backup] Auto backup complete');
        } catch (error) {
          console.log('[Backup] Auto backup failed:', error);
        }
      };
      void checkAutoBackup();
    }
  }, [accessToken, autoBackupEnabled, isReady, collectBackupData, uploadFilesToDiskAndUpdateDb]);

  useEffect(() => {
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    const shouldRunMaster = isMasterEnabled && accessToken && isReady;
    const shouldRunSubscriber = subscriptionUrl && isAutoSyncEnabled && isReady;
    const hasAutoSubs = subscriptions.some((s) => s.autoSyncEnabled) && isReady;

    if (!shouldRunMaster && !shouldRunSubscriber && !hasAutoSubs) return;

    const subMinInterval = subscriptions
      .filter((s) => s.autoSyncEnabled)
      .reduce((min, s) => Math.min(min, INTERVAL_KEY_TO_MS[s.syncInterval] || SYNC_INTERVALS.DAILY), Infinity);

    const minInterval = Math.min(
      shouldRunMaster ? masterInterval : Infinity,
      shouldRunSubscriber ? syncInterval : Infinity,
      hasAutoSubs ? subMinInterval : Infinity
    );

    const checkInterval = Math.max(minInterval, SYNC_INTERVALS.HOURLY);

    console.log('[Backup] Starting sync timer, check every', checkInterval / 1000 / 60, 'min');

    const runSync = async () => {
      try {
        if (shouldRunMaster && accessToken) {
          const lastPub = lastMasterPublish ? new Date(lastMasterPublish).getTime() : 0;
          if (Date.now() - lastPub >= masterInterval) {
            console.log('[Backup] Auto-publishing master backup...');
            try {
              await publishBackup();
            } catch (e) {
              console.log('[Backup] Auto-publish failed:', e);
            }
          }
        }

        if (shouldRunSubscriber) {
          const lastCheck = lastSyncCheck ? new Date(lastSyncCheck).getTime() : 0;
          if (Date.now() - lastCheck >= syncInterval) {
            try {
              await checkForUpdates();
            } catch (e) {
              console.log('[Backup] Auto-check failed:', e);
            }
          }
        }

        for (const sub of subscriptions) {
          if (!sub.autoSyncEnabled) continue;
          const intervalMs = INTERVAL_KEY_TO_MS[sub.syncInterval] || SYNC_INTERVALS.DAILY;
          const lastSubCheck = sub.lastSyncTimestamp || 0;
          if (Date.now() - lastSubCheck >= intervalMs) {
            try {
              let needUpdate = false;
              const manifest = await getPublicManifestData(sub.masterUrl);
              if (manifest && manifest.updatedAt) {
                needUpdate = manifest.updatedAt > lastSubCheck;
                console.log('[Backup] Auto-sync sub manifest check:', sub.name, 'updatedAt:', manifest.updatedAt, 'lastCheck:', lastSubCheck, 'needUpdate:', needUpdate);
              } else {
                const info = await getPublicResourceInfo(sub.masterUrl);
                const remoteModified = new Date(info.modified).getTime();
                needUpdate = remoteModified > lastSubCheck;
              }
              if (needUpdate) {
                console.log('[Backup] Auto-syncing subscription:', sub.name);
                await restoreToProfileDb(sub.id, sub.masterUrl);
                if (sub.id === activeProfileId) {
                  await refreshAllProviders();
                }
              }
              const now = Date.now();
              const updatedSubs = subscriptions.map((s) => s.id === sub.id ? { ...s, lastSyncTimestamp: now } : s);
              await AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(updatedSubs));
              setSubscriptions(updatedSubs);
            } catch (e) {
              console.log('[Backup] Auto-sync subscription failed:', sub.name, e);
            }
          }
        }
      } catch (error) {
        console.log('[Backup] Sync timer error:', error);
      }
    };

    syncTimerRef.current = setInterval(runSync, checkInterval);
    void runSync();

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [isMasterEnabled, accessToken, isReady, masterInterval, lastMasterPublish, subscriptionUrl, isAutoSyncEnabled, syncInterval, lastSyncCheck, publishBackup, checkForUpdates, subscriptions, syncFromPublicFolder, restoreToProfileDb, activeProfileId, refreshAllProviders]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const checkOnResume = async () => {
          try {
            if (isMasterEnabled && accessToken) {
              const lastPub = lastMasterPublish ? new Date(lastMasterPublish).getTime() : 0;
              if (Date.now() - lastPub >= masterInterval) {
                await publishBackup();
              }
            }
            if (subscriptionUrl && isAutoSyncEnabled) {
              const lastCheck = lastSyncCheck ? new Date(lastSyncCheck).getTime() : 0;
              if (Date.now() - lastCheck >= syncInterval) {
                await checkForUpdates();
              }
            }
          } catch (e) {
            console.log('[Backup] Resume sync check error:', e);
          }
        };
        void checkOnResume();
      }
    });
    return () => subscription.remove();
  }, [isMasterEnabled, accessToken, masterInterval, lastMasterPublish, subscriptionUrl, isAutoSyncEnabled, syncInterval, lastSyncCheck, publishBackup, checkForUpdates]);

  return useMemo(() => ({
    isConnected: !!accessToken,
    userEmail,
    lastBackupDate,
    autoBackupEnabled,
    isCreatingBackup,
    isRestoring,
    isLoadingBackups,
    backupsList,
    signIn,
    signOut,
    createBackup,
    restoreBackup,
    loadBackupsList,
    toggleAutoBackup,
    isInitializing,
    accessToken,

    isMasterEnabled,
    masterInterval,
    masterPublicUrl,
    lastMasterPublish,
    isPublishing,
    toggleMasterMode,
    setMasterInterval,
    publishBackup,

    subscriptionUrl,
    isAutoSyncEnabled,
    syncInterval,
    lastSyncCheck,
    isSyncing,
    subscribeToMaster,
    unsubscribe,
    setSyncInterval: setSyncIntervalFn,
    toggleAutoSync,
    manualSync,

    subscriptions,
    addSubscription,
    removeSubscription,
    renameSubscription,
    updateSubscriptionAutoSync,
    updateSubscriptionInterval,
    syncSubscription,
    isSyncingSubscription,

    masterAutoSyncEnabled,
    masterAutoSyncInterval,
    lastMasterSync,
    isMasterSyncing,
    toggleMasterAutoSync,
    setMasterAutoSyncInterval,
    masterSyncNow,

    switchAccount,
    resetMasterSettings,

    syncProgress,

    masterId,
    yandexUserId,

    activeMasterPublicUrl: subscriptionUrl || masterPublicUrl || subscriptions.find(s => s.id === activeProfileId)?.masterUrl || null,

    subscriberEmails,
    addSubscriberEmail,
    removeSubscriberEmail,
    grantAccessToSubscriber,
    sendInvitationToSubscriber,
    isGrantingAccess,
    isSendingInvitation,

    firestoreSubscribers,
    isLoadingSubscribers,

    firestoreUid: firebaseUid,
    removeFirestoreSubscriber,
  }), [accessToken, userEmail, lastBackupDate, autoBackupEnabled, isCreatingBackup, isRestoring, isLoadingBackups, backupsList, signIn, signOut, createBackup, restoreBackup, loadBackupsList, toggleAutoBackup, isInitializing, isMasterEnabled, masterInterval, masterPublicUrl, lastMasterPublish, isPublishing, toggleMasterMode, setMasterInterval, publishBackup, subscriptionUrl, isAutoSyncEnabled, syncInterval, lastSyncCheck, isSyncing, subscribeToMaster, unsubscribe, setSyncIntervalFn, toggleAutoSync, manualSync, subscriptions, addSubscription, removeSubscription, renameSubscription, updateSubscriptionAutoSync, updateSubscriptionInterval, syncSubscription, isSyncingSubscription, masterAutoSyncEnabled, masterAutoSyncInterval, lastMasterSync, isMasterSyncing, toggleMasterAutoSync, setMasterAutoSyncInterval, masterSyncNow, switchAccount, resetMasterSettings, syncProgress, masterId, yandexUserId, activeProfileId, subscriberEmails, addSubscriberEmail, removeSubscriberEmail, grantAccessToSubscriber, sendInvitationToSubscriber, isGrantingAccess, isSendingInvitation, firestoreSubscribers, isLoadingSubscribers, firebaseUid, removeFirestoreSubscriber]);
});
