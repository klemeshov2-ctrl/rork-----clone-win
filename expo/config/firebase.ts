import { initializeApp, FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, Auth, signInAnonymously } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getFirebaseConfig() {
  const extraFirebase = Constants.expoConfig?.extra?.firebase;
  return {
    apiKey: extraFirebase?.apiKey || process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: extraFirebase?.authDomain || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: extraFirebase?.projectId || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: extraFirebase?.storageBucket || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: extraFirebase?.messagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: extraFirebase?.appId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
  };
}

const config = getFirebaseConfig();
console.log('[Firebase] Initializing with project:', config.projectId);
console.log('[Firebase] API key present:', !!config.apiKey);
if (!config.apiKey) {
  console.error('[Firebase] WARNING: No API key found!');
}

const app: FirebaseApp = initializeApp(config);

let auth: Auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  const { getReactNativePersistence } = require('firebase/auth');
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

const db: Firestore = getFirestore(app);

console.log('[Firebase] DB ready:', !!db);
console.log('[Firebase] Auth ready:', !!auth);

signInAnonymously(auth).catch((err) => {
  console.error('[Firebase] Anonymous auth error:', err?.message);
});

export { auth, db };
export const firestore = db;
