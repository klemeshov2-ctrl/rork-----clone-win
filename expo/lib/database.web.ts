const STORAGE_PREFIX = 'mj_db_';

interface WebRow {
  [key: string]: unknown;
}

type TableStore = Record<string, WebRow[]>;

function loadStore(): TableStore {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + 'store');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store: TableStore): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + 'store', JSON.stringify(store));
  } catch (e) {
    console.log('[DB Web] Failed to save store:', e);
  }
}

function getTable(store: TableStore, name: string): WebRow[] {
  if (!store[name]) store[name] = [];
  return store[name];
}

class WebSQLiteDatabase {
  private store: TableStore;

  constructor() {
    this.store = loadStore();
    console.log('[DB Web] WebSQLiteDatabase created (localStorage backend)');
  }

  async execAsync(sql: string): Promise<void> {
    console.log('[DB Web] execAsync (no-op):', sql.substring(0, 80));
  }

  async getAllAsync<T>(_sql: string, _params?: unknown[]): Promise<T[]> {
    console.log('[DB Web] getAllAsync (returns []):', _sql.substring(0, 80));
    return [] as T[];
  }

  async getFirstAsync<T>(_sql: string, _params?: unknown[]): Promise<T | null> {
    console.log('[DB Web] getFirstAsync (returns null):', _sql.substring(0, 80));
    return null;
  }

  async runAsync(_sql: string, _params?: unknown[]): Promise<{ changes: number; lastInsertRowId: number }> {
    console.log('[DB Web] runAsync (no-op):', _sql.substring(0, 80));
    return { changes: 0, lastInsertRowId: 0 };
  }

  async closeAsync(): Promise<void> {
    console.log('[DB Web] closeAsync');
  }
}

let db: WebSQLiteDatabase | null = null;

export async function getDatabase(): Promise<WebSQLiteDatabase> {
  if (!db) {
    console.log('[DB Web] Opening web database (localStorage)...');
    db = new WebSQLiteDatabase();
  }
  return db;
}

export async function setupTables(_database: WebSQLiteDatabase): Promise<void> {
  console.log('[DB Web] setupTables (no-op on web)');
}

export async function initDatabase(): Promise<void> {
  await getDatabase();
}

export function getProfileDbName(profileId: string): string {
  return profileId === 'master' ? 'master_journal.db' : `master_journal_sub_${profileId}.db`;
}

export async function openProfileDatabase(_profileId: string): Promise<WebSQLiteDatabase> {
  console.log('[DB Web] openProfileDatabase:', _profileId);
  return getDatabase();
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}
