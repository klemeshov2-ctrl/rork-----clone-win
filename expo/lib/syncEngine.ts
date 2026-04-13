import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface ManifestFileEntry {
  hash: string;
  updatedAt: number;
  size: number;
}

export interface ManifestPhotoEntry {
  remotePath: string;
  size: number;
  objectId: string;
}

export interface SyncManifest {
  version: number;
  updatedAt: number;
  files: Record<string, ManifestFileEntry>;
  photos: Record<string, ManifestPhotoEntry>;
}

export interface SyncProgress {
  phase: 'preparing' | 'uploading' | 'downloading' | 'migrating' | 'complete' | 'error';
  current: number;
  total: number;
  currentFile: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export function simpleHash(str: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + ch) & 0xffffffff;
    h2 = ((h2 << 5) + h2 + ch) & 0xffffffff;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function createEmptyManifest(): SyncManifest {
  return { version: 2, updatedAt: 0, files: {}, photos: {} };
}

export async function buildSyncFiles(db: SQLite.SQLiteDatabase): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  console.log('[SyncEngine] Building sync files from DB...');

  const objects = await db.getAllAsync('SELECT * FROM objects');
  const allContacts = await db.getAllAsync('SELECT * FROM contacts');
  const allDocuments = await db.getAllAsync('SELECT * FROM object_documents');

  for (const obj of objects as any[]) {
    const contacts = (allContacts as any[]).filter((c: any) => c.object_id === obj.id);
    const documents = (allDocuments as any[]).filter((d: any) => d.object_id === obj.id);
    files[`objects/object_${obj.id}.json`] = JSON.stringify({ object: obj, contacts, documents });
  }

  const workEntries = await db.getAllAsync('SELECT * FROM work_entries');
  for (const entry of workEntries as any[]) {
    files[`entries/entry_${entry.id}.json`] = JSON.stringify(entry);
  }

  const inventory = await db.getAllAsync('SELECT * FROM inventory');
  files['inventory.json'] = JSON.stringify(inventory);

  const templates = await db.getAllAsync('SELECT * FROM checklist_templates');
  const results = await db.getAllAsync('SELECT * FROM checklist_results');
  files['checklists.json'] = JSON.stringify({ templates, results });

  const knowledge = await db.getAllAsync('SELECT * FROM knowledge_items');
  files['knowledge.json'] = JSON.stringify(knowledge);

  const tasks = await db.getAllAsync('SELECT * FROM tasks');
  files['tasks.json'] = JSON.stringify(tasks);

  const reminders = await db.getAllAsync('SELECT * FROM reminders');
  files['reminders.json'] = JSON.stringify(reminders);

  console.log('[SyncEngine] Built', Object.keys(files).length, 'sync files');
  return files;
}

export function buildManifest(files: Record<string, string>, photoInfo?: Record<string, ManifestPhotoEntry>): SyncManifest {
  const manifest = createEmptyManifest();
  manifest.updatedAt = Date.now();

  for (const [path, content] of Object.entries(files)) {
    manifest.files[path] = {
      hash: simpleHash(content),
      updatedAt: Date.now(),
      size: content.length,
    };
  }

  if (photoInfo) {
    manifest.photos = photoInfo;
  }

  return manifest;
}

export interface SyncDiff {
  toUpload: string[];
  toDelete: string[];
  unchanged: string[];
}

export function diffManifests(localFiles: Record<string, string>, remoteManifest: SyncManifest | null): SyncDiff {
  const toUpload: string[] = [];
  const toDelete: string[] = [];
  const unchanged: string[] = [];

  const remoteFiles = remoteManifest?.files ?? {};

  for (const [path, content] of Object.entries(localFiles)) {
    const hash = simpleHash(content);
    const remote = remoteFiles[path];
    if (!remote || remote.hash !== hash) {
      toUpload.push(path);
    } else {
      unchanged.push(path);
    }
  }

  for (const path of Object.keys(remoteFiles)) {
    if (!(path in localFiles)) {
      toDelete.push(path);
    }
  }

  console.log('[SyncEngine] Diff: upload=' + toUpload.length + ', delete=' + toDelete.length + ', unchanged=' + unchanged.length);
  return { toUpload, toDelete, unchanged };
}

export function diffForDownload(localManifest: SyncManifest | null, remoteManifest: SyncManifest): string[] {
  const toDownload: string[] = [];
  const localFiles = localManifest?.files ?? {};

  for (const [path, entry] of Object.entries(remoteManifest.files)) {
    const local = localFiles[path];
    if (!local || local.hash !== entry.hash) {
      toDownload.push(path);
    }
  }

  console.log('[SyncEngine] Download diff: ' + toDownload.length + ' files to download');
  return toDownload;
}

export async function restoreFromSyncFiles(
  db: SQLite.SQLiteDatabase,
  files: Record<string, string>
): Promise<void> {
  console.log('[SyncEngine] Restoring DB from', Object.keys(files).length, 'sync files...');

  await db.execAsync('DELETE FROM knowledge_items');
  await db.execAsync('DELETE FROM reminders');
  await db.execAsync('DELETE FROM tasks');
  await db.execAsync('DELETE FROM inventory');
  await db.execAsync('DELETE FROM checklist_results');
  await db.execAsync('DELETE FROM checklist_templates');
  await db.execAsync('DELETE FROM work_entries');
  await db.execAsync('DELETE FROM object_documents');
  await db.execAsync('DELETE FROM contacts');
  await db.execAsync('DELETE FROM objects');

  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith('objects/')) continue;
    try {
      const data = JSON.parse(content);
      const obj = data.object;
      await db.runAsync(
        'INSERT OR REPLACE INTO objects (id, name, address, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?)',
        [obj.id, obj.name, obj.address, obj.created_at, obj.updated_at, 'synced']
      );
      for (const c of (data.contacts || [])) {
        await db.runAsync(
          'INSERT OR REPLACE INTO contacts (id, object_id, full_name, position, phone, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [c.id, c.object_id, c.full_name, c.position, c.phone, c.email || null, c.created_at]
        );
      }
      for (const d of (data.documents || [])) {
        await db.runAsync(
          'INSERT OR REPLACE INTO object_documents (id, object_id, name, file_path, file_url, file_size, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [d.id, d.object_id, d.name, d.file_path, d.file_url || null, d.file_size, d.uploaded_at]
        );
      }
    } catch (e) {
      console.log('[SyncEngine] Error restoring object:', path, e);
    }
  }

  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith('entries/')) continue;
    try {
      const w = JSON.parse(content);
      await db.runAsync(
        'INSERT OR REPLACE INTO work_entries (id, object_id, description, photos, attached_pdf_id, used_materials, latitude, longitude, created_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [w.id, w.object_id, w.description, w.photos, w.attached_pdf_id || null, w.used_materials || null, w.latitude || null, w.longitude || null, w.created_at, 'synced']
      );
    } catch (e) {
      console.log('[SyncEngine] Error restoring entry:', path, e);
    }
  }

  if (files['inventory.json']) {
    try {
      const items = JSON.parse(files['inventory.json']);
      for (const i of items) {
        await db.runAsync(
          'INSERT OR REPLACE INTO inventory (id, name, quantity, unit, min_quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [i.id, i.name, i.quantity, i.unit, i.min_quantity || 2, i.created_at, i.updated_at]
        );
      }
    } catch (e) {
      console.log('[SyncEngine] Error restoring inventory:', e);
    }
  }

  if (files['checklists.json']) {
    try {
      const data = JSON.parse(files['checklists.json']);
      for (const t of (data.templates || [])) {
        await db.runAsync(
          'INSERT OR REPLACE INTO checklist_templates (id, name, items, is_default, created_at) VALUES (?, ?, ?, ?, ?)',
          [t.id, t.name, t.items, t.is_default || 0, t.created_at]
        );
      }
      for (const r of (data.results || [])) {
        await db.runAsync(
          'INSERT OR REPLACE INTO checklist_results (id, template_id, object_id, items, completed_at, pdf_instruction_id, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [r.id, r.template_id, r.object_id || null, r.items, r.completed_at, r.pdf_instruction_id || null, 'synced']
        );
      }
    } catch (e) {
      console.log('[SyncEngine] Error restoring checklists:', e);
    }
  }

  if (files['knowledge.json']) {
    try {
      const items = JSON.parse(files['knowledge.json']);
      for (const k of items) {
        await db.runAsync(
          'INSERT OR REPLACE INTO knowledge_items (id, type, title, category, category_id, content, file_path, file_url, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [k.id, k.type, k.title, k.category, k.category_id || null, k.content || null, k.file_path || null, k.file_url || null, k.file_size || null, k.created_at]
        );
      }
    } catch (e) {
      console.log('[SyncEngine] Error restoring knowledge:', e);
    }
  }

  if (files['tasks.json']) {
    try {
      const items = JSON.parse(files['tasks.json']);
      for (const t of items) {
        await db.runAsync(
          'INSERT OR REPLACE INTO tasks (id, type, object_id, title, description, due_date, due_time, is_completed, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [t.id, t.type || 'reminder', t.object_id || null, t.title, t.description || null, t.due_date, t.due_time || null, t.is_completed || 0, t.completed_at || null, t.created_at]
        );
      }
    } catch (e) {
      console.log('[SyncEngine] Error restoring tasks:', e);
    }
  }

  if (files['reminders.json']) {
    try {
      const items = JSON.parse(files['reminders.json']);
      for (const r of items) {
        await db.runAsync(
          'INSERT OR REPLACE INTO reminders (id, object_id, title, description, due_date, is_completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [r.id, r.object_id || null, r.title, r.description || null, r.due_date, r.is_completed || 0, r.created_at]
        );
      }
    } catch (e) {
      console.log('[SyncEngine] Error restoring reminders:', e);
    }
  }

  console.log('[SyncEngine] DB restore complete');
}

export async function collectPhotoInfo(db: SQLite.SQLiteDatabase): Promise<Record<string, ManifestPhotoEntry>> {
  const photos: Record<string, ManifestPhotoEntry> = {};

  const entries = await db.getAllAsync<{ id: string; object_id: string; photos: string | null }>(
    'SELECT id, object_id, photos FROM work_entries WHERE photos IS NOT NULL'
  );

  for (const entry of entries) {
    if (!entry.photos) continue;
    try {
      const parsed = JSON.parse(entry.photos);
      if (!Array.isArray(parsed)) continue;
      for (const photoPath of parsed) {
        if (!photoPath || typeof photoPath !== 'string') continue;
        const filename = photoPath.split('/').pop() || photoPath;
        const remotePath = `photos/${entry.object_id}/${filename}`;
        let size = 0;
        if (Platform.OS !== 'web') {
          try {
            const info = await FileSystem.getInfoAsync(photoPath);
            if (info.exists && !info.isDirectory) size = (info as any).size ?? 0;
          } catch {}
        }
        photos[remotePath] = { remotePath, size, objectId: entry.object_id };
      }
    } catch {}
  }

  return photos;
}

export function getRelativePath(absolutePath: string): string {
  const docDir = FileSystem.documentDirectory || '';
  if (docDir && absolutePath.startsWith(docDir)) {
    return absolutePath.substring(docDir.length);
  }
  const cacheDir = FileSystem.cacheDirectory || '';
  if (cacheDir && absolutePath.startsWith(cacheDir)) {
    return 'cache/' + absolutePath.substring(cacheDir.length);
  }
  const lastSlash = absolutePath.lastIndexOf('/');
  return lastSlash >= 0 ? absolutePath.substring(lastSlash + 1) : absolutePath;
}

export async function convertBackupDataToSyncFiles(backupData: any): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  const objects = backupData.objects || [];
  const contacts = backupData.contacts || [];
  const documents = backupData.documents || [];

  for (const obj of objects) {
    const objContacts = contacts.filter((c: any) => c.object_id === obj.id);
    const objDocs = documents.filter((d: any) => d.object_id === obj.id);
    files[`objects/object_${obj.id}.json`] = JSON.stringify({ object: obj, contacts: objContacts, documents: objDocs });
  }

  const workEntries = backupData.workEntries || [];
  for (const entry of workEntries) {
    files[`entries/entry_${entry.id}.json`] = JSON.stringify(entry);
  }

  files['inventory.json'] = JSON.stringify(backupData.inventory || []);
  files['checklists.json'] = JSON.stringify({
    templates: backupData.checklistTemplates || [],
    results: backupData.checklistResults || [],
  });
  files['knowledge.json'] = JSON.stringify(backupData.knowledgeItems || []);
  files['tasks.json'] = JSON.stringify(backupData.tasks || []);
  files['reminders.json'] = JSON.stringify(backupData.reminders || []);

  console.log('[SyncEngine] Converted backup data to', Object.keys(files).length, 'sync files');
  return files;
}
