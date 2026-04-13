import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const UNIFIED_FILES_DIR = 'zhurnal-mastera-files/';
const LOCAL_CACHE_DIR = 'app_files/';

export function getUnifiedFilesDir(): string {
  return (FileSystem.documentDirectory || '') + UNIFIED_FILES_DIR;
}

function getLocalCacheDir(): string {
  return (FileSystem.documentDirectory || '') + LOCAL_CACHE_DIR;
}

function getRemoteFileName(url: string): string {
  const parts = url.split('/');
  return parts[parts.length - 1] || url;
}

function getLocalPathForRemote(remoteFileName: string): string {
  return getLocalCacheDir() + remoteFileName;
}

export function normalizeFileUri(path: string): string {
  if (!path) return path;
  if (path.startsWith('file://')) return path;
  if (path.startsWith('/')) return 'file://' + path;
  return path;
}

export function stripFileScheme(uri: string): string {
  if (uri.startsWith('file://')) return uri.substring(7);
  return uri;
}

export function isRemoteUrl(path: string): boolean {
  if (!path) return false;
  return path.startsWith('http://') || path.startsWith('https://') || path.startsWith('yadisk://');
}

export function extractRemoteFileName(fileUrl: string): string {
  if (fileUrl.startsWith('yadisk://')) {
    return fileUrl.replace('yadisk://', '');
  }
  return getRemoteFileName(fileUrl);
}

export function generateUniqueFileName(originalPath: string): string {
  const ext = originalPath.split('.').pop()?.toLowerCase() || 'bin';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}_${random}.${ext}`;
}

export function generateRemoteFileName(localPath: string): string {
  const ext = localPath.split('.').pop() || 'bin';
  const baseName = localPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'file';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}_${random}_${baseName}.${ext}`;
}

export function makeYadiskRef(remoteFileName: string): string {
  return `yadisk://${remoteFileName}`;
}

export function isInUnifiedDir(path: string): boolean {
  if (!path) return false;
  return path.includes(UNIFIED_FILES_DIR);
}

export async function ensureUnifiedFilesDir(): Promise<void> {
  if (Platform.OS === 'web') return;
  const dir = getUnifiedFilesDir();
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    console.log('[FileManager] Created unified files directory:', dir);
  }
}

export async function saveFileToUnifiedDir(sourceUri: string, originalName?: string): Promise<string> {
  if (Platform.OS === 'web') return sourceUri;

  await ensureUnifiedFilesDir();

  const ext = (originalName || sourceUri).split('.').pop()?.toLowerCase() || 'bin';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const fileName = `${timestamp}_${random}.${ext}`;
  const destPath = getUnifiedFilesDir() + fileName;

  console.log('[FileManager] Saving file to unified dir:', fileName, 'from:', sourceUri.substring(0, 80));

  await FileSystem.copyAsync({ from: sourceUri, to: destPath });

  const info = await FileSystem.getInfoAsync(destPath);
  if (!info.exists) {
    throw new Error('Failed to copy file to unified directory: ' + fileName);
  }
  console.log('[FileManager] File saved:', destPath, 'size:', info.size);
  return destPath;
}

export async function ensureLocalFilesDir(): Promise<void> {
  if (Platform.OS === 'web') return;
  const dir = getLocalCacheDir();
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    console.log('[FileManager] Created local cache directory:', dir);
  }
}

export async function isFileLocallyAvailable(fileRef: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!fileRef) return false;

  if (!isRemoteUrl(fileRef) && !fileRef.startsWith('yadisk://')) {
    const info = await FileSystem.getInfoAsync(fileRef);
    return info.exists;
  }

  const remoteFileName = extractRemoteFileName(fileRef);
  const localPath = getLocalPathForRemote(remoteFileName);
  const info = await FileSystem.getInfoAsync(localPath);
  return info.exists;
}

export async function getLocalPath(fileRef: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!fileRef) return null;

  if (!isRemoteUrl(fileRef) && !fileRef.startsWith('yadisk://')) {
    const info = await FileSystem.getInfoAsync(fileRef);
    if (info.exists) return fileRef;
    return null;
  }

  const remoteFileName = extractRemoteFileName(fileRef);
  const localPath = getLocalPathForRemote(remoteFileName);
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return localPath;
  return null;
}

export async function ensureFileLocal(
  fileRef: string,
  accessToken?: string | null,
  masterPublicUrl?: string | null,
): Promise<string> {
  if (Platform.OS === 'web') {
    if (fileRef.startsWith('yadisk://')) {
      const remoteFileName = extractRemoteFileName(fileRef);
      if (masterPublicUrl) {
        try {
          const { getAppFilePublicDownloadUrl } = await import('@/lib/yandexDisk');
          const url = await getAppFilePublicDownloadUrl(remoteFileName, masterPublicUrl);
          console.log('[FileManager] Web: got public download URL for:', remoteFileName);
          return url;
        } catch (e) {
          console.log('[FileManager] Web: failed to get public download URL:', e);
        }
      }
      if (accessToken) {
        try {
          const { getAppFileDownloadUrl } = await import('@/lib/yandexDisk');
          const url = await getAppFileDownloadUrl(accessToken, remoteFileName);
          return url;
        } catch (e) {
          console.log('[FileManager] Web: failed to get download URL:', e);
          return fileRef;
        }
      }
    }
    return fileRef;
  }

  if (!isRemoteUrl(fileRef) && !fileRef.startsWith('yadisk://')) {
    const info = await FileSystem.getInfoAsync(fileRef);
    if (info.exists) return fileRef;
    console.log('[FileManager] Local file missing:', fileRef);
    throw new Error('File not found locally: ' + fileRef);
  }

  const remoteFileName = extractRemoteFileName(fileRef);
  const localPath = getLocalPathForRemote(remoteFileName);

  const localInfo = await FileSystem.getInfoAsync(localPath);
  if (localInfo.exists) {
    console.log('[FileManager] File already cached locally:', localPath);
    return localPath;
  }

  await ensureLocalFilesDir();

  if (fileRef.startsWith('yadisk://')) {
    console.log('[FileManager] Resolving yadisk ref:', remoteFileName, 'masterPublicUrl:', masterPublicUrl ? 'yes' : 'no', 'accessToken:', accessToken ? 'yes' : 'no');

    if (accessToken) {
      try {
        console.log('[FileManager] Downloading from Yandex Disk (own token):', remoteFileName);
        const { downloadAppFileToLocal } = await import('@/lib/yandexDisk');
        await downloadAppFileToLocal(accessToken, remoteFileName, localPath);
        console.log('[FileManager] Downloaded and cached (own token):', localPath);
        return localPath;
      } catch (e: any) {
        console.log('[FileManager] Own token download error:', e?.message);
        if (!masterPublicUrl) {
          throw new Error('Failed to download file with own token: ' + remoteFileName + ': ' + (e?.message || ''));
        }
      }
    }

    if (masterPublicUrl) {
      try {
        console.log('[FileManager] Downloading via public URL for subscriber:', remoteFileName);
        const { getAppFilePublicDownloadUrl } = await import('@/lib/yandexDisk');
        const downloadUrl = await getAppFilePublicDownloadUrl(remoteFileName, masterPublicUrl);
        const downloadResult = await FileSystem.downloadAsync(downloadUrl, localPath);
        if (downloadResult.status === 200) {
          console.log('[FileManager] Downloaded via public URL and cached:', localPath);
          return localPath;
        }
        console.log('[FileManager] Public download failed with status:', downloadResult.status);
        throw new Error('Public download failed with status: ' + downloadResult.status);
      } catch (e: any) {
        console.log('[FileManager] Public download error:', e?.message);
        throw new Error('Failed to download file via public URL: ' + remoteFileName + ': ' + (e?.message || ''));
      }
    }

    throw new Error('Нет токена или ссылки мастера для загрузки файла: ' + remoteFileName);
  }

  if (fileRef.startsWith('http')) {
    console.log('[FileManager] Downloading from URL:', fileRef);
    const downloadResult = await FileSystem.downloadAsync(fileRef, localPath);
    if (downloadResult.status !== 200) {
      throw new Error('Failed to download file: ' + fileRef);
    }
    console.log('[FileManager] Downloaded and cached:', localPath);
    return localPath;
  }

  throw new Error('Cannot resolve file reference: ' + fileRef);
}

export async function resolveFileUri(
  fileRef: string | undefined | null,
  accessToken?: string | null,
  masterPublicUrl?: string | null,
): Promise<string | null> {
  if (!fileRef) return null;

  try {
    return await ensureFileLocal(fileRef, accessToken, masterPublicUrl);
  } catch (e) {
    console.log('[FileManager] Failed to resolve file:', fileRef, e);
    return null;
  }
}

export async function migrateExistingFiles(db: any): Promise<{ migrated: number; errors: number }> {
  if (Platform.OS === 'web') return { migrated: 0, errors: 0 };

  console.log('[FileManager] === migrateExistingFiles START ===');
  await ensureUnifiedFilesDir();

  let migrated = 0;
  let errors = 0;

  const docs = await db.getAllAsync(
    'SELECT id, file_path, file_url FROM object_documents'
  ) as { id: string; file_path: string | null; file_url: string | null }[];
  console.log('[FileManager] object_documents to check:', docs.length);

  for (const doc of docs) {
    const filePath = doc.file_path;
    if (!filePath) continue;
    if (filePath.startsWith('yadisk://') || isRemoteUrl(filePath)) continue;
    if (isInUnifiedDir(filePath)) continue;

    try {
      const info = await FileSystem.getInfoAsync(filePath);
      if (!info.exists) {
        console.log('[FileManager] Migration skip (not found):', filePath);
        continue;
      }
      const newPath = await saveFileToUnifiedDir(filePath, filePath.split('/').pop());
      await db.runAsync('UPDATE object_documents SET file_path = ? WHERE id = ?', [newPath, doc.id]);
      console.log('[FileManager] Migrated object_document:', doc.id, '->', newPath);
      migrated++;
    } catch (e: any) {
      console.log('[FileManager] Migration error for object_document:', doc.id, e?.message);
      errors++;
    }
  }

  const entries = await db.getAllAsync(
    'SELECT id, photos FROM work_entries WHERE photos IS NOT NULL'
  ) as { id: string; photos: string | null }[];
  console.log('[FileManager] work_entries to check:', entries.length);

  for (const entry of entries) {
    if (!entry.photos) continue;
    try {
      const photos: string[] = JSON.parse(entry.photos);
      if (!Array.isArray(photos)) continue;

      let changed = false;
      const updatedPhotos: string[] = [];

      for (const photo of photos) {
        if (!photo || photo.startsWith('yadisk://') || isRemoteUrl(photo) || isInUnifiedDir(photo)) {
          updatedPhotos.push(photo);
          continue;
        }
        try {
          const info = await FileSystem.getInfoAsync(photo);
          if (!info.exists) {
            console.log('[FileManager] Migration skip photo (not found):', photo);
            updatedPhotos.push(photo);
            continue;
          }
          const newPath = await saveFileToUnifiedDir(photo, photo.split('/').pop());
          updatedPhotos.push(newPath);
          changed = true;
          migrated++;
          console.log('[FileManager] Migrated photo:', entry.id, '->', newPath);
        } catch (e: any) {
          console.log('[FileManager] Migration error for photo:', entry.id, e?.message);
          updatedPhotos.push(photo);
          errors++;
        }
      }

      if (changed) {
        await db.runAsync('UPDATE work_entries SET photos = ? WHERE id = ?', [JSON.stringify(updatedPhotos), entry.id]);
      }
    } catch (e: any) {
      console.log('[FileManager] Migration parse error for entry:', entry.id, e?.message);
      errors++;
    }
  }

  const knowledge = await db.getAllAsync(
    'SELECT id, file_path, file_url FROM knowledge_items'
  ) as { id: string; file_path: string | null; file_url: string | null }[];
  console.log('[FileManager] knowledge_items to check:', knowledge.length);

  for (const item of knowledge) {
    const filePath = item.file_path;
    if (!filePath) continue;
    if (filePath.startsWith('yadisk://') || isRemoteUrl(filePath)) continue;
    if (isInUnifiedDir(filePath)) continue;

    try {
      const info = await FileSystem.getInfoAsync(filePath);
      if (!info.exists) {
        console.log('[FileManager] Migration skip knowledge (not found):', filePath);
        continue;
      }
      const newPath = await saveFileToUnifiedDir(filePath, filePath.split('/').pop());
      await db.runAsync('UPDATE knowledge_items SET file_path = ? WHERE id = ?', [newPath, item.id]);
      console.log('[FileManager] Migrated knowledge_item:', item.id, '->', newPath);
      migrated++;
    } catch (e: any) {
      console.log('[FileManager] Migration error for knowledge_item:', item.id, e?.message);
      errors++;
    }
  }

  console.log('[FileManager] === migrateExistingFiles DONE: migrated =', migrated, ', errors =', errors, '===');
  return { migrated, errors };
}

export async function getLocalCacheSize(): Promise<number> {
  if (Platform.OS === 'web') return 0;
  let total = 0;

  const dirs = [getLocalCacheDir(), getUnifiedFilesDir()];
  for (const dir of dirs) {
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) continue;
    try {
      const files = await FileSystem.readDirectoryAsync(dir);
      for (const file of files) {
        const info = await FileSystem.getInfoAsync(dir + file);
        if (info.exists && info.size) total += info.size;
      }
    } catch {
      // ignore
    }
  }
  return total;
}

export async function deleteFileFromUnifiedDir(filePath: string): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!filePath) return;

  if (filePath.startsWith('yadisk://')) {
    console.log('[FileManager] Skipping yadisk ref deletion:', filePath);
    return;
  }

  if (!isInUnifiedDir(filePath) && !filePath.includes(UNIFIED_FILES_DIR)) {
    console.log('[FileManager] File not in unified dir, skipping deletion:', filePath);
    return;
  }

  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) {
      console.log('[FileManager] File already gone:', filePath);
      return;
    }
    await FileSystem.deleteAsync(filePath, { idempotent: true });
    console.log('[FileManager] Deleted file:', filePath);
  } catch (e: any) {
    console.log('[FileManager] Error deleting file:', filePath, e?.message);
  }
}

export async function deleteFilesFromUnifiedDir(filePaths: string[]): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const fp of filePaths) {
    if (fp) {
      await deleteFileFromUnifiedDir(fp);
    }
  }
}

export async function clearLocalCache(): Promise<void> {
  if (Platform.OS === 'web') return;
  const dir = getLocalCacheDir();
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (dirInfo.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
    console.log('[FileManager] Local cache cleared');
  }
  await ensureLocalFilesDir();
}
