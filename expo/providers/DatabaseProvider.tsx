import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from 'react';
import { openProfileDatabase } from '@/lib/database';
import { useProfile } from './ProfileProvider';
import { Platform } from 'react-native';

export type AppDatabase = {
  execAsync: (sql: string) => Promise<void>;
  getAllAsync: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  getFirstAsync: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
  runAsync: (sql: string, params?: unknown[]) => Promise<{ changes: number; lastInsertRowId: number }>;
  closeAsync: () => Promise<void>;
};

interface DatabaseContextType {
  db: AppDatabase | null;
  isReady: boolean;
}

const DatabaseContext = createContext<DatabaseContextType>({ db: null, isReady: false });

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { activeProfileId, isLoaded: profileLoaded } = useProfile();
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [isReady, setIsReady] = useState(false);
  const dbRef = useRef<AppDatabase | null>(null);
  const currentProfileRef = useRef<string>('');

  useEffect(() => {
    if (!profileLoaded) return;

    let cancelled = false;

    async function init() {
      console.log('[DB Provider] Initializing for profile:', activeProfileId, 'platform:', Platform.OS);
      setIsReady(false);

      if (dbRef.current && currentProfileRef.current !== activeProfileId) {
        try {
          console.log('[DB Provider] Closing previous DB for profile:', currentProfileRef.current);
          await dbRef.current.closeAsync();
        } catch (e) {
          console.log('[DB Provider] Error closing previous DB:', e);
        }
        dbRef.current = null;
      }

      try {
        const database = await openProfileDatabase(activeProfileId) as unknown as AppDatabase;
        if (!cancelled) {
          dbRef.current = database;
          currentProfileRef.current = activeProfileId;
          setDb(database);
          setIsReady(true);
          console.log('[DB Provider] Database ready for profile:', activeProfileId);
        } else {
          await database.closeAsync();
        }
      } catch (error) {
        console.error('[DB Provider] Database initialization error:', error);
        if (Platform.OS === 'web' && !cancelled) {
          setIsReady(true);
          console.log('[DB Provider] Web fallback: marking as ready without DB');
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [activeProfileId, profileLoaded]);

  useEffect(() => {
    return () => {
      if (dbRef.current) {
        dbRef.current.closeAsync().catch(() => {});
        dbRef.current = null;
      }
    };
  }, []);

  const value = useMemo(() => ({ db, isReady }), [db, isReady]);

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within DatabaseProvider');
  }
  return context;
}
