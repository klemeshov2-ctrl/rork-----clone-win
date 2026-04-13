import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;
let isInitialized = false;

const profileDbCache: Record<string, boolean> = {};

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    console.log('[DB] Opening database...');
    db = await SQLite.openDatabaseAsync('master_journal.db');
    console.log('[DB] Database opened successfully');
  }
  if (!isInitialized) {
    isInitialized = true;
    await setupTables(db);
  }
  return db;
}

export async function setupTables(database: SQLite.SQLiteDatabase): Promise<void> {
  console.log('[DB] Setting up tables...');
  
  await database.execAsync(`PRAGMA journal_mode = WAL;`);
  
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS object_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS objects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      group_id TEXT,
      systems TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      FOREIGN KEY (group_id) REFERENCES object_groups(id) ON DELETE SET NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      object_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      position TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE CASCADE
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS object_documents (
      id TEXT PRIMARY KEY,
      object_id TEXT NOT NULL,
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_at INTEGER NOT NULL,
      FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE CASCADE
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS work_entries (
      id TEXT PRIMARY KEY,
      object_id TEXT NOT NULL,
      description TEXT NOT NULL,
      photos TEXT,
      attached_pdf_id TEXT,
      used_materials TEXT,
      system_name TEXT,
      latitude REAL,
      longitude REAL,
      created_at INTEGER NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE CASCADE,
      FOREIGN KEY (attached_pdf_id) REFERENCES object_documents(id) ON DELETE SET NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS checklist_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      items TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS checklist_results (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      object_id TEXT,
      items TEXT NOT NULL,
      completed_at INTEGER NOT NULL,
      pdf_instruction_id TEXT,
      sync_status TEXT DEFAULT 'pending',
      FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE SET NULL,
      FOREIGN KEY (pdf_instruction_id) REFERENCES object_documents(id) ON DELETE SET NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS inventory_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      unit TEXT NOT NULL,
      min_quantity INTEGER DEFAULT 2,
      category_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (category_id) REFERENCES inventory_categories(id) ON DELETE SET NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      object_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      due_date INTEGER NOT NULL,
      is_completed INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE SET NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS knowledge_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      category_id TEXT,
      content TEXT,
      file_path TEXT,
      file_size INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (category_id) REFERENCES knowledge_categories(id) ON DELETE SET NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      author_email TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_master_comment INTEGER DEFAULT 0,
      sync_status TEXT DEFAULT 'synced'
    );
  `);

  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'reminder',
      object_id TEXT,
      object_name TEXT,
      title TEXT NOT NULL,
      description TEXT,
      due_date INTEGER,
      due_time TEXT,
      is_completed INTEGER DEFAULT 0,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE SET NULL
    );
  `);

  const migrations = [
    { table: 'work_entries', column: 'used_materials', type: 'TEXT' },
    { table: 'objects', column: 'group_id', type: 'TEXT' },
    { table: 'objects', column: 'systems', type: 'TEXT' },
    { table: 'inventory', column: 'category_id', type: 'TEXT' },
    { table: 'tasks', column: 'object_name', type: 'TEXT' },
    { table: 'work_entries', column: 'system_name', type: 'TEXT' },
    { table: 'knowledge_items', column: 'category_id', type: 'TEXT' },
    { table: 'object_documents', column: 'file_url', type: 'TEXT' },
    { table: 'knowledge_items', column: 'file_url', type: 'TEXT' },
    { table: 'comments', column: 'author_email', type: 'TEXT' },
    { table: 'comments', column: 'is_master_comment', type: 'INTEGER' },
    { table: 'comments', column: 'sync_status', type: 'TEXT' },
  ];
  for (const m of migrations) {
    try {
      await database.execAsync(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
      console.log(`[DB] Added column ${m.column} to ${m.table}`);
    } catch {
    }
  }

  await migrateRemindersToTasks(database);
  await migrateKnowledgeCategories(database);

  console.log('[DB] All tables created successfully');
}

async function migrateRemindersToTasks(database: SQLite.SQLiteDatabase): Promise<void> {
  try {
    const migrated = await database.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = 'reminders_migrated_to_tasks'`
    );
    if (migrated?.value === '1') return;

    const reminders = await database.getAllAsync<any>(
      `SELECT id, object_id, title, description, due_date, is_completed, created_at FROM reminders`
    );
    
    if (reminders.length > 0) {
      console.log(`[DB] Migrating ${reminders.length} reminders to tasks...`);
      for (const r of reminders) {
        const existing = await database.getFirstAsync<{ id: string }>(
          `SELECT id FROM tasks WHERE id = ?`, [r.id]
        );
        if (!existing) {
          await database.runAsync(
            `INSERT INTO tasks (id, type, object_id, title, description, due_date, due_time, is_completed, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [r.id, 'reminder', r.object_id, r.title, r.description, r.due_date, null, r.is_completed, null, r.created_at]
          );
        }
      }
      console.log('[DB] Reminders migrated to tasks successfully');
    }

    await database.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('reminders_migrated_to_tasks', '1')`
    );
  } catch (error) {
    console.error('[DB] Migration error:', error);
  }
}

async function migrateKnowledgeCategories(database: SQLite.SQLiteDatabase): Promise<void> {
  try {
    const migrated = await database.getFirstAsync<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = 'knowledge_categories_migrated'`
    );
    if (migrated?.value === '1') return;

    const categoryMap: Record<string, string> = {
      'instructions': 'Инструкции',
      'schemes': 'Схемы',
      'errors': 'Ошибки',
      'regulations': 'Нормативы',
      'other': 'Другое',
    };

    const existingItems = await database.getAllAsync<{ category: string }>(
      `SELECT DISTINCT category FROM knowledge_items WHERE category_id IS NULL`
    );

    for (const item of existingItems) {
      const catName = categoryMap[item.category] || item.category;
      const existing = await database.getFirstAsync<{ id: string }>(
        `SELECT id FROM knowledge_categories WHERE name = ?`, [catName]
      );
      let catId: string;
      if (existing) {
        catId = existing.id;
      } else {
        catId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
        await database.runAsync(
          `INSERT INTO knowledge_categories (id, name, created_at) VALUES (?, ?, ?)`,
          [catId, catName, Date.now()]
        );
      }
      await database.runAsync(
        `UPDATE knowledge_items SET category_id = ? WHERE category = ? AND category_id IS NULL`,
        [catId, item.category]
      );
    }

    await database.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('knowledge_categories_migrated', '1')`
    );
    console.log('[DB] Knowledge categories migration completed');
  } catch (error) {
    console.error('[DB] Knowledge categories migration error:', error);
  }
}

export async function initDatabase(): Promise<void> {
  await getDatabase();
}

export function getProfileDbName(profileId: string): string {
  return profileId === 'master' ? 'master_journal.db' : `master_journal_sub_${profileId}.db`;
}

export async function openProfileDatabase(profileId: string): Promise<SQLite.SQLiteDatabase> {
  const dbName = getProfileDbName(profileId);
  console.log('[DB] Opening profile database:', dbName);
  const database = await SQLite.openDatabaseAsync(dbName);
  if (!profileDbCache[dbName]) {
    await setupTables(database);
    profileDbCache[dbName] = true;
    console.log('[DB] Tables set up for:', dbName);
  }
  return database;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
    isInitialized = false;
  }
}
