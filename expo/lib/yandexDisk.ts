const YANDEX_CLIENT_ID = '059ea08d977746548d585ca385e5d219';
const YANDEX_CLIENT_SECRET = 'd0b03956699a43c283f1eb310a14c2ee';

export { YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET };

export interface YandexFile {
  fileId: string;
  name: string;
  created: string;
  size: number;
  downloadUrl?: string;
}

export interface BackupData {
  version: number;
  createdAt: number;
  objects: any[];
  contacts: any[];
  documents: any[];
  workEntries: any[];
  checklistTemplates: any[];
  checklistResults: any[];
  inventory: any[];
  reminders: any[];
  tasks?: any[];
  knowledgeItems: any[];
}

export async function getUserInfoYandex(accessToken: string): Promise<{ id: string; email: string; name: string }> {
  console.log('[YandexDisk] Getting user info...');
  const response = await fetch('https://login.yandex.ru/info', {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.log('[YandexDisk] User info error:', response.status, errorText);
    throw new Error('Failed to get user info');
  }
  const data = await response.json();
  console.log('[YandexDisk] Yandex user ID:', data.id);
  return { id: String(data.id), email: data.default_email || data.login, name: data.display_name || data.login };
}

async function getUploadUrl(accessToken: string, path: string, retries = 3): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `https://cloud-api.yandex.net/v1/disk/resources/upload?path=${encodeURIComponent(path)}&overwrite=true`,
        { headers: { Authorization: `OAuth ${accessToken}` } }
      );
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[YandexDisk] Get upload URL error (attempt ${attempt}/${retries}):`, response.status, errorText, 'path:', path);
        if (attempt < retries && (response.status >= 500 || response.status === 429)) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw new Error(`Failed to get upload URL for ${path} (status ${response.status}): ${errorText}`);
      }
      const data = await response.json();
      return data.href;
    } catch (e: any) {
      if (attempt < retries && !e?.message?.includes('Failed to get upload URL')) {
        console.log(`[YandexDisk] getUploadUrl network error (attempt ${attempt}/${retries}):`, e?.message);
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Failed to get upload URL for ' + path);
}

async function ensureBackupFolder(accessToken: string): Promise<void> {
  const folderPath = encodeURIComponent('app:/Журнал мастера backups');
  console.log('[YandexDisk] Ensuring backup folder exists...');
  const response = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${folderPath}`, {
    method: 'PUT',
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (response.status !== 201 && response.status !== 409) {
    const errorText = await response.text();
    console.log('[YandexDisk] Create folder error:', response.status, errorText);
    throw new Error('Failed to create backup folder');
  }
  console.log('[YandexDisk] Backup folder ready');
}

export async function uploadBackupYandex(accessToken: string, backupData: BackupData): Promise<string> {
  await ensureBackupFolder(accessToken);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16).replace(':', '-');
  const filename = `backup_${dateStr}_${timeStr}.json`;
  const filePath = `app:/Журнал мастера backups/${filename}`;

  console.log('[YandexDisk] Uploading backup:', filename);

  const uploadUrl = await getUploadUrl(accessToken, filePath);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: JSON.stringify(backupData),
    headers: { 'Content-Type': 'application/json' },
  });

  if (!uploadResponse.ok && uploadResponse.status !== 201) {
    const errorText = await uploadResponse.text();
    console.log('[YandexDisk] Upload error:', uploadResponse.status, errorText);
    throw new Error('Failed to upload backup');
  }

  console.log('[YandexDisk] Upload complete:', filename);
  return filename;
}

export async function uploadZipBackupYandex(accessToken: string, zipPath: string): Promise<string> {
  const { File: FSFile } = await import('expo-file-system');
  const { fetch: expoFetch } = await import('expo/fetch');
  await ensureBackupFolder(accessToken);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16).replace(':', '-');
  const filename = `backup_${dateStr}_${timeStr}.zip`;
  const filePath = `app:/Журнал мастера backups/${filename}`;

  console.log('[YandexDisk] Uploading ZIP backup:', filename, 'from path:', zipPath);

  const uploadUrl = await getUploadUrl(accessToken, filePath);

  const file = new FSFile(zipPath);
  if (!file.exists) {
    throw new Error('ZIP file does not exist at path: ' + zipPath);
  }

  console.log('[YandexDisk] Uploading file size:', file.size, 'bytes');

  const uploadResponse = await expoFetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body: file,
  });

  if (!uploadResponse.ok && uploadResponse.status !== 201) {
    const errorText = await uploadResponse.text();
    console.log('[YandexDisk] ZIP upload error:', uploadResponse.status, errorText);
    throw new Error(`Failed to upload ZIP backup with status ${uploadResponse.status}`);
  }

  console.log('[YandexDisk] ZIP upload complete:', filename);
  return filename;
}

export async function downloadZipBackupYandex(accessToken: string, remoteFilePath: string): Promise<ArrayBuffer> {
  console.log('[YandexDisk] Downloading ZIP backup:', remoteFilePath);

  const downloadUrlResponse = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources/download?path=${encodeURIComponent(remoteFilePath)}`,
    { headers: { Authorization: `OAuth ${accessToken}` } }
  );

  if (!downloadUrlResponse.ok) {
    const errorText = await downloadUrlResponse.text();
    console.log('[YandexDisk] Get download URL error:', downloadUrlResponse.status, errorText);
    throw new Error('Failed to get download URL for ZIP');
  }

  const { href } = await downloadUrlResponse.json();

  const fileResponse = await fetch(href);
  if (!fileResponse.ok) {
    throw new Error('Failed to download ZIP backup file');
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  console.log('[YandexDisk] ZIP download complete, size:', arrayBuffer.byteLength);
  return arrayBuffer;
}

export async function listBackupsYandex(accessToken: string): Promise<YandexFile[]> {
  const folderPath = encodeURIComponent('app:/Журнал мастера backups');
  console.log('[YandexDisk] Listing backups...');

  const response = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources?path=${folderPath}&limit=100&sort=-created`,
    { headers: { Authorization: `OAuth ${accessToken}` } }
  );

  if (!response.ok) {
    if (response.status === 404) {
      console.log('[YandexDisk] Backup folder not found, returning empty list');
      return [];
    }
    const errorText = await response.text();
    console.log('[YandexDisk] List error:', response.status, errorText);
    throw new Error('Failed to list backups');
  }

  const data = await response.json();

  if (!data._embedded) return [];

  const files: YandexFile[] = data._embedded.items
    .filter((item: any) => item.type === 'file' && item.name.startsWith('backup_'))
    .map((item: any) => ({
      fileId: item.path,
      name: item.name,
      created: item.created,
      size: item.size,
      downloadUrl: item.file,
    }));

  console.log('[YandexDisk] Found backups:', files.length);
  return files;
}

export async function downloadBackupYandex(accessToken: string, filePath: string): Promise<BackupData> {
  console.log('[YandexDisk] Downloading backup:', filePath);

  const downloadUrlResponse = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources/download?path=${encodeURIComponent(filePath)}`,
    { headers: { Authorization: `OAuth ${accessToken}` } }
  );

  if (!downloadUrlResponse.ok) {
    const errorText = await downloadUrlResponse.text();
    console.log('[YandexDisk] Get download URL error:', downloadUrlResponse.status, errorText);
    throw new Error('Failed to get download URL');
  }

  const { href } = await downloadUrlResponse.json();

  const fileResponse = await fetch(href);
  if (!fileResponse.ok) {
    throw new Error('Failed to download backup file');
  }

  const data = await fileResponse.json();
  console.log('[YandexDisk] Download complete, version:', data.version);
  return data as BackupData;
}

export async function publishFileYandex(accessToken: string, filePath: string): Promise<string> {
  console.log('[YandexDisk] Publishing file:', filePath);
  const response = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources/publish?path=${encodeURIComponent(filePath)}`,
    {
      method: 'PUT',
      headers: { Authorization: `OAuth ${accessToken}` },
    }
  );
  if (!response.ok) {
    const errorText = await response.text();
    console.log('[YandexDisk] Publish error:', response.status, errorText);
    throw new Error('Failed to publish file');
  }

  const resourceResponse = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(filePath)}`,
    { headers: { Authorization: `OAuth ${accessToken}` } }
  );
  if (!resourceResponse.ok) {
    throw new Error('Failed to get public URL');
  }
  const resourceData = await resourceResponse.json();
  const publicUrl = resourceData.public_url;
  if (!publicUrl) {
    throw new Error('No public URL returned');
  }
  console.log('[YandexDisk] Published, public URL:', publicUrl);
  return publicUrl;
}

export async function getPublicResourceInfo(publicUrl: string): Promise<{ modified: string; size: number; downloadUrl: string }> {
  console.log('[YandexDisk] Getting public resource info:', publicUrl);
  const response = await fetch(
    `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(publicUrl)}`
  );
  if (!response.ok) {
    const errorText = await response.text();
    console.log('[YandexDisk] Public resource info error:', response.status, errorText);
    throw new Error('Failed to get public resource info');
  }
  const data = await response.json();
  return {
    modified: data.modified || data.created || '',
    size: data.size || 0,
    downloadUrl: data.file || '',
  };
}

export async function downloadPublicBackup(publicUrl: string): Promise<BackupData> {
  console.log('[YandexDisk] Downloading public backup...');
  const dlResponse = await fetch(
    `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(publicUrl)}`
  );
  if (!dlResponse.ok) {
    throw new Error('Failed to get public download URL');
  }
  const { href } = await dlResponse.json();
  const fileResponse = await fetch(href);
  if (!fileResponse.ok) {
    throw new Error('Failed to download public backup');
  }
  const data = await fileResponse.json();
  console.log('[YandexDisk] Public backup downloaded, version:', data.version);
  return data as BackupData;
}

export async function downloadPublicZipBackup(publicUrl: string): Promise<ArrayBuffer> {
  console.log('[YandexDisk] Downloading public ZIP backup...');
  const dlResponse = await fetch(
    `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(publicUrl)}`
  );
  if (!dlResponse.ok) {
    throw new Error('Failed to get public download URL');
  }
  const { href } = await dlResponse.json();
  const fileResponse = await fetch(href);
  if (!fileResponse.ok) {
    throw new Error('Failed to download public ZIP backup');
  }
  const arrayBuffer = await fileResponse.arrayBuffer();
  console.log('[YandexDisk] Public ZIP download complete, size:', arrayBuffer.byteLength);
  return arrayBuffer;
}

export async function uploadMasterBackupYandex(accessToken: string, backupData: BackupData): Promise<string> {
  await ensureBackupFolder(accessToken);
  const filePath = 'app:/Журнал мастера backups/master_backup.json';
  console.log('[YandexDisk] Uploading master backup (JSON)...');
  const uploadUrl = await getUploadUrl(accessToken, filePath);
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: JSON.stringify(backupData),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!uploadResponse.ok && uploadResponse.status !== 201) {
    const errorText = await uploadResponse.text();
    console.log('[YandexDisk] Master upload error:', uploadResponse.status, errorText);
    throw new Error('Failed to upload master backup');
  }
  console.log('[YandexDisk] Master JSON upload complete');
  return filePath;
}

export async function uploadMasterZipBackupYandex(accessToken: string, zipPath: string): Promise<string> {
  const { File: FSFile } = await import('expo-file-system');
  const { fetch: expoFetch } = await import('expo/fetch');
  await ensureBackupFolder(accessToken);
  const filePath = 'app:/Журнал мастера backups/master_backup.zip';
  console.log('[YandexDisk] Uploading master ZIP backup...');
  const uploadUrl = await getUploadUrl(accessToken, filePath);
  const file = new FSFile(zipPath);
  if (!file.exists) {
    throw new Error('ZIP file does not exist at path: ' + zipPath);
  }
  const uploadResponse = await expoFetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  if (!uploadResponse.ok && uploadResponse.status !== 201) {
    const errorText = await uploadResponse.text();
    console.log('[YandexDisk] Master ZIP upload error:', uploadResponse.status, errorText);
    throw new Error('Failed to upload master ZIP backup');
  }
  console.log('[YandexDisk] Master ZIP upload complete');
  return filePath;
}

export async function cleanupOldBackupsYandex(accessToken: string, keepCount: number = 5): Promise<void> {
  const backups = await listBackupsYandex(accessToken);
  if (backups.length <= keepCount) return;

  const sorted = [...backups].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  const toDelete = sorted.slice(keepCount);

  console.log('[YandexDisk] Cleaning up', toDelete.length, 'old backups');

  for (const backup of toDelete) {
    try {
      await fetch(
        `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(backup.fileId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `OAuth ${accessToken}` },
        }
      );
    } catch (error) {
      console.log('[YandexDisk] Failed to delete:', backup.fileId, error);
    }
  }
}

export const SYNC_FOLDER = 'app:/zhurnal-mastera-sync';
export const APP_FILES_FOLDER = SYNC_FOLDER + '/app_files';

export async function ensureFolderYandex(accessToken: string, folderPath: string): Promise<void> {
  const parts = folderPath.split('/');
  let current = '';
  for (const part of parts) {
    current = current ? current + '/' + part : part;
    if (current === 'app:') continue;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(current)}`, {
          method: 'PUT',
          headers: { Authorization: `OAuth ${accessToken}` },
        });
        if (response.status === 201 || response.status === 409) {
          break;
        }
        const errorText = await response.text();
        console.log(`[YandexDisk] Create folder error (attempt ${attempt}/3):`, current, response.status, errorText);
        if (attempt < 3 && response.status >= 500) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        if (response.status !== 201 && response.status !== 409) {
          throw new Error(`Failed to create folder ${current} (status ${response.status})`);
        }
      } catch (e: any) {
        if (e?.message?.includes('Failed to create folder')) throw e;
        console.log(`[YandexDisk] ensureFolder network error (attempt ${attempt}/3):`, current, e?.message);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        throw new Error(`Failed to create folder ${current}: ${e?.message}`);
      }
    }
  }
}

export async function uploadTextFileYandex(accessToken: string, remotePath: string, content: string): Promise<void> {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[YandexDisk] Uploading text file (attempt ${attempt}/${maxRetries}):`, remotePath, 'size:', content.length);
      const uploadUrl = await getUploadUrl(accessToken, remotePath);
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: content,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
      if (uploadResponse.ok || uploadResponse.status === 201) {
        console.log('[YandexDisk] Text file uploaded successfully:', remotePath);
        return;
      }
      const errorText = await uploadResponse.text();
      console.log(`[YandexDisk] Upload text file error (attempt ${attempt}/${maxRetries}):`, remotePath, uploadResponse.status, errorText);
      if (attempt < maxRetries && (uploadResponse.status >= 500 || uploadResponse.status === 429)) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      throw new Error(`Ошибка загрузки файла ${remotePath.split('/').pop()} (статус ${uploadResponse.status})`);
    } catch (e: any) {
      if (e?.message?.includes('Ошибка загрузки файла')) throw e;
      console.log(`[YandexDisk] uploadTextFile network error (attempt ${attempt}/${maxRetries}):`, remotePath, e?.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      throw new Error(`Ошибка загрузки файла ${remotePath.split('/').pop()}: ${e?.message}`);
    }
  }
}

export async function downloadTextFileYandex(accessToken: string, remotePath: string): Promise<string> {
  const downloadUrlResponse = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources/download?path=${encodeURIComponent(remotePath)}`,
    { headers: { Authorization: `OAuth ${accessToken}` } }
  );
  if (!downloadUrlResponse.ok) {
    throw new Error('Failed to get download URL for: ' + remotePath);
  }
  const { href } = await downloadUrlResponse.json();
  const fileResponse = await fetch(href);
  if (!fileResponse.ok) {
    throw new Error('Failed to download file: ' + remotePath);
  }
  return fileResponse.text();
}

export async function downloadPublicFileYandex(publicKey: string, path: string): Promise<string> {
  console.log('[YandexDisk] Downloading public file:', path);
  const dlResponse = await fetch(
    `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(publicKey)}&path=${encodeURIComponent('/' + path)}`
  );
  if (!dlResponse.ok) {
    const errorText = await dlResponse.text();
    console.log('[YandexDisk] Public file download URL error:', dlResponse.status, errorText);
    throw new Error('Failed to get public download URL for: ' + path);
  }
  const { href } = await dlResponse.json();
  const fileResponse = await fetch(href);
  if (!fileResponse.ok) {
    throw new Error('Failed to download public file: ' + path);
  }
  return fileResponse.text();
}

export async function deleteResourceYandex(accessToken: string, remotePath: string): Promise<void> {
  const response = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(remotePath)}&permanently=false`,
    {
      method: 'DELETE',
      headers: { Authorization: `OAuth ${accessToken}` },
    }
  );
  if (!response.ok && response.status !== 204 && response.status !== 404 && response.status !== 202) {
    const errorText = await response.text();
    console.log('[YandexDisk] Delete error:', remotePath, response.status, errorText);
  }
}

export async function resourceExistsYandex(accessToken: string, remotePath: string): Promise<boolean> {
  const response = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(remotePath)}`,
    { headers: { Authorization: `OAuth ${accessToken}` } }
  );
  return response.ok;
}

export async function publishFolderYandex(accessToken: string, folderPath: string): Promise<string> {
  console.log('[YandexDisk] Publishing folder:', folderPath);
  const response = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources/publish?path=${encodeURIComponent(folderPath)}`,
    {
      method: 'PUT',
      headers: { Authorization: `OAuth ${accessToken}` },
    }
  );
  if (!response.ok) {
    const errorText = await response.text();
    console.log('[YandexDisk] Publish folder error:', response.status, errorText);
    throw new Error('Failed to publish folder');
  }

  const resourceResponse = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(folderPath)}`,
    { headers: { Authorization: `OAuth ${accessToken}` } }
  );
  if (!resourceResponse.ok) {
    throw new Error('Failed to get public URL for folder');
  }
  const resourceData = await resourceResponse.json();
  const publicUrl = resourceData.public_url;
  if (!publicUrl) {
    throw new Error('No public URL returned for folder');
  }
  console.log('[YandexDisk] Folder published, public URL:', publicUrl);
  return publicUrl;
}

export async function getPublicFolderManifest(publicKey: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await downloadPublicFileYandex(publicKey, 'manifest.json');
    return JSON.parse(content);
  } catch (e) {
    console.log('[YandexDisk] Failed to get public manifest:', e);
    return null;
  }
}

export async function uploadPhotoFileYandex(accessToken: string, remotePath: string, localPath: string): Promise<void> {
  const { File: FSFile } = await import('expo-file-system');
  const { fetch: expoFetch } = await import('expo/fetch');

  const uploadUrl = await getUploadUrl(accessToken, remotePath);
  const file = new FSFile(localPath);
  if (!file.exists) {
    console.log('[YandexDisk] Photo file not found:', localPath);
    return;
  }

  const uploadResponse = await expoFetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });

  if (!uploadResponse.ok && uploadResponse.status !== 201) {
    const errorText = await uploadResponse.text();
    console.log('[YandexDisk] Photo upload error:', remotePath, uploadResponse.status, errorText);
    throw new Error('Failed to upload photo: ' + remotePath);
  }
}

export async function ensureAppFilesFolder(accessToken: string): Promise<void> {
  console.log('[YandexDisk] Ensuring app_files folder exists...');
  await ensureFolderYandex(accessToken, APP_FILES_FOLDER);
  console.log('[YandexDisk] app_files folder ready');
}

export async function uploadAppFile(accessToken: string, localPath: string, remoteFileName: string, maxRetries = 3): Promise<string> {
  const remotePath = `${APP_FILES_FOLDER}/${remoteFileName}`;
  console.log('[YandexDisk] uploadAppFile START:', remoteFileName);
  console.log('[YandexDisk] uploadAppFile localPath (raw):', localPath);
  console.log('[YandexDisk] uploadAppFile localPath length:', localPath?.length, 'starts with file://:', localPath?.startsWith('file://'), 'starts with /:', localPath?.startsWith('/'));

  if (!localPath || localPath.trim() === '') {
    console.log('[YandexDisk] ERROR: localPath is empty or null');
    throw new Error('File path is empty or null');
  }

  const FileSystemLegacy = await import('expo-file-system/legacy');

  const docDir = FileSystemLegacy.documentDirectory || '';
  const cacheDir = FileSystemLegacy.cacheDirectory || '';
  console.log('[YandexDisk] documentDirectory:', docDir);
  console.log('[YandexDisk] cacheDirectory:', cacheDir);

  const pathsToTry: string[] = [];

  if (localPath.startsWith('file://')) {
    pathsToTry.push(localPath);
    pathsToTry.push(localPath.substring(7));
  } else if (localPath.startsWith('/')) {
    pathsToTry.push(localPath);
    pathsToTry.push('file://' + localPath);
  } else {
    pathsToTry.push(docDir + localPath);
    pathsToTry.push(cacheDir + localPath);
    pathsToTry.push(localPath);
    pathsToTry.push('file://' + localPath);
  }

  let normalizedPath = '';
  let foundFileInfo: any = null;

  for (const candidate of pathsToTry) {
    try {
      console.log('[YandexDisk] Trying path:', candidate);
      const info = await FileSystemLegacy.getInfoAsync(candidate);
      console.log('[YandexDisk] Path check result:', candidate, 'exists:', info.exists, 'size:', info.exists && 'size' in info ? info.size : 'n/a');
      if (info.exists) {
        normalizedPath = candidate;
        foundFileInfo = info;
        break;
      }
    } catch (checkErr: any) {
      console.log('[YandexDisk] Path check error:', candidate, checkErr?.message);
    }
  }

  if (!normalizedPath || !foundFileInfo) {
    console.log('[YandexDisk] ERROR: File NOT FOUND after trying all path variants:');
    pathsToTry.forEach((p, i) => console.log(`[YandexDisk]   variant ${i + 1}: ${p}`));

    try {
      const parentDir = localPath.substring(0, localPath.lastIndexOf('/'));
      const resolvedParent = parentDir.startsWith('/') ? parentDir : docDir + parentDir;
      console.log('[YandexDisk] Checking parent dir:', resolvedParent);
      const parentInfo = await FileSystemLegacy.getInfoAsync(resolvedParent);
      console.log('[YandexDisk] Parent dir exists:', parentInfo.exists);
      if (parentInfo.exists) {
        const dirContents = await FileSystemLegacy.readDirectoryAsync(resolvedParent);
        console.log('[YandexDisk] Parent dir contents (first 20):', dirContents.slice(0, 20).join(', '));
        console.log('[YandexDisk] Parent dir total files:', dirContents.length);
      }
    } catch (dirErr: any) {
      console.log('[YandexDisk] Could not list parent dir:', dirErr?.message);
    }

    throw new Error('File not found after trying all path variants: ' + localPath);
  }

  const fileSize = foundFileInfo && 'size' in foundFileInfo ? foundFileInfo.size : 0;
  console.log('[YandexDisk] File FOUND at:', normalizedPath, 'size:', fileSize, 'bytes');

  let useNewApi = true;
  let file: any = null;
  try {
    const { File: FSFile } = await import('expo-file-system');
    file = new FSFile(normalizedPath);
    if (!file.exists) {
      const altFile = new FSFile(localPath);
      if (altFile.exists) {
        file = altFile;
        console.log('[YandexDisk] New API found file with original path');
      } else {
        console.log('[YandexDisk] New File API cannot find file, falling back to legacy upload');
        useNewApi = false;
      }
    } else {
      console.log('[YandexDisk] New File API found file, size:', file.size);
    }
  } catch (e: any) {
    console.log('[YandexDisk] New File API init error, falling back to legacy:', e?.message);
    useNewApi = false;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const uploadUrl = await getUploadUrl(accessToken, remotePath);

      if (useNewApi && file) {
        const { fetch: expoFetch } = await import('expo/fetch');
        console.log(`[YandexDisk] Uploading via new API (attempt ${attempt}/${maxRetries})...`);
        const uploadResponse = await expoFetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        });

        if (uploadResponse.ok || uploadResponse.status === 201) {
          console.log('[YandexDisk] App file uploaded successfully (new API):', remoteFileName);
          return remotePath;
        }

        const errorText = await uploadResponse.text();
        console.log(`[YandexDisk] New API upload error (attempt ${attempt}/${maxRetries}):`, uploadResponse.status, errorText);

        if (attempt === 1 && uploadResponse.status >= 400 && uploadResponse.status < 500) {
          console.log('[YandexDisk] Client error with new API, trying legacy fallback...');
          useNewApi = false;
          continue;
        }
      }

      if (!useNewApi) {
        console.log(`[YandexDisk] Uploading via legacy API (attempt ${attempt}/${maxRetries}):`, normalizedPath);
        const uploadResult = await FileSystemLegacy.uploadAsync(uploadUrl, normalizedPath, {
          httpMethod: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          uploadType: FileSystemLegacy.FileSystemUploadType.BINARY_CONTENT,
        });

        if (uploadResult.status >= 200 && uploadResult.status < 300) {
          console.log('[YandexDisk] App file uploaded successfully (legacy API):', remoteFileName);
          return remotePath;
        }

        console.log(`[YandexDisk] Legacy upload error (attempt ${attempt}/${maxRetries}):`, uploadResult.status, uploadResult.body?.substring(0, 200));
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      throw new Error(`Failed to upload app file: ${remoteFileName} after ${maxRetries} attempts`);
    } catch (e: any) {
      if (e?.message?.includes('Failed to upload app file')) throw e;
      console.log(`[YandexDisk] uploadAppFile error (attempt ${attempt}/${maxRetries}):`, remoteFileName, e?.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      throw new Error(`Failed to upload app file: ${remoteFileName}: ${e?.message}`);
    }
  }
  throw new Error('Failed to upload app file after retries: ' + remoteFileName);
}

export async function getAppFileDownloadUrl(accessToken: string, remoteFileName: string): Promise<string> {
  const remotePath = `${APP_FILES_FOLDER}/${remoteFileName}`;
  const downloadUrlResponse = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources/download?path=${encodeURIComponent(remotePath)}`,
    { headers: { Authorization: `OAuth ${accessToken}` } }
  );
  if (!downloadUrlResponse.ok) {
    throw new Error('Failed to get download URL for app file: ' + remoteFileName);
  }
  const { href } = await downloadUrlResponse.json();
  return href;
}

export async function downloadAppFileToLocal(accessToken: string, remoteFileName: string, localPath: string): Promise<void> {
  const FileSystem = await import('expo-file-system/legacy');
  console.log('[YandexDisk] Downloading app file:', remoteFileName, 'to', localPath);

  const downloadUrl = await getAppFileDownloadUrl(accessToken, remoteFileName);

  const dirPath = localPath.substring(0, localPath.lastIndexOf('/'));
  const dirInfo = await FileSystem.getInfoAsync(dirPath);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  }

  const result = await FileSystem.downloadAsync(downloadUrl, localPath);
  console.log('[YandexDisk] App file downloaded:', remoteFileName, 'status:', result.status);
}

export async function appFileExistsOnDisk(accessToken: string, remoteFileName: string): Promise<boolean> {
  const remotePath = `${APP_FILES_FOLDER}/${remoteFileName}`;
  return resourceExistsYandex(accessToken, remotePath);
}

export async function publishAppFile(accessToken: string, remoteFileName: string): Promise<string> {
  const remotePath = `${APP_FILES_FOLDER}/${remoteFileName}`;
  return publishFileYandex(accessToken, remotePath);
}

export async function getAppFilePublicDownloadUrl(remoteFileName: string, appFilesFolderPublicKey: string): Promise<string> {
  const dlResponse = await fetch(
    `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(appFilesFolderPublicKey)}&path=${encodeURIComponent('/app_files/' + remoteFileName)}`
  );
  if (!dlResponse.ok) {
    const errorText = await dlResponse.text();
    console.log('[YandexDisk] Public app file download URL error:', dlResponse.status, errorText, 'file:', remoteFileName);
    throw new Error('Failed to get public download URL for app file: ' + remoteFileName);
  }
  const { href } = await dlResponse.json();
  console.log('[YandexDisk] Got public download URL for app file:', remoteFileName);
  return href;
}

export async function getResourceInfoByPath(accessToken: string, remotePath: string): Promise<{ modified: string; size: number; public_url?: string }> {
  console.log('[YandexDisk] Getting resource info by path:', remotePath);
  const response = await fetch(
    `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(remotePath)}`,
    { headers: { Authorization: `OAuth ${accessToken}` } }
  );
  if (!response.ok) {
    const errorText = await response.text();
    console.log('[YandexDisk] Resource info error:', response.status, errorText);
    throw new Error('Failed to get resource info for: ' + remotePath);
  }
  const data = await response.json();
  return {
    modified: data.modified || data.created || '',
    size: data.size || 0,
    public_url: data.public_url || undefined,
  };
}

export async function getPublicResourceModifiedDate(publicUrl: string): Promise<{ modified: string; size: number }> {
  console.log('[YandexDisk] Getting public resource modified date...');
  const response = await fetch(
    `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(publicUrl)}`
  );
  if (!response.ok) {
    const errorText = await response.text();
    console.log('[YandexDisk] Public resource modified date error:', response.status, errorText);
    throw new Error('Failed to get public resource modified date');
  }
  const data = await response.json();
  return {
    modified: data.modified || data.created || '',
    size: data.size || 0,
  };
}

export async function getPublicManifestData(publicUrl: string): Promise<SyncManifest | null> {
  try {
    console.log('[YandexDisk] Downloading public manifest for update check...');
    const dlResponse = await fetch(
      `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(publicUrl)}&path=${encodeURIComponent('/manifest.json')}`
    );
    if (!dlResponse.ok) {
      console.log('[YandexDisk] Public manifest download URL error:', dlResponse.status);
      return null;
    }
    const { href } = await dlResponse.json();
    const fileResponse = await fetch(href);
    if (!fileResponse.ok) {
      console.log('[YandexDisk] Public manifest download error:', fileResponse.status);
      return null;
    }
    const data = await fileResponse.json();
    console.log('[YandexDisk] Public manifest downloaded, updatedAt:', data.updatedAt);
    return data as SyncManifest;
  } catch (e) {
    console.log('[YandexDisk] Failed to get public manifest:', e);
    return null;
  }
}

interface SyncManifest {
  version: number;
  updatedAt: number;
  files: Record<string, unknown>;
  photos: Record<string, unknown>;
}

export const COMMENTS_FOLDER = SYNC_FOLDER + '/comments';

export async function ensureCommentsFolderYandex(accessToken: string): Promise<void> {
  console.log('[YandexDisk] Ensuring comments folder exists...');
  await ensureFolderYandex(accessToken, COMMENTS_FOLDER);
  console.log('[YandexDisk] Comments folder ready');
}

export async function listCommentFiles(accessToken: string): Promise<{ name: string; path: string }[]> {
  const url = `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(COMMENTS_FOLDER)}&limit=100`;
  const response = await fetch(url, { headers: { Authorization: `OAuth ${accessToken}` } });
  if (!response.ok) {
    if (response.status === 404) return [];
    const errorText = await response.text();
    console.log('[YandexDisk] List comment files error:', response.status, errorText);
    return [];
  }
  const data = await response.json();
  if (!data._embedded) return [];
  return data._embedded.items
    .filter((item: any) => item.type === 'file' && item.name.endsWith('.json'))
    .map((item: any) => ({ name: item.name, path: item.path }));
}

export async function uploadCommentFileYandex(
  accessToken: string,
  fileName: string,
  content: any
): Promise<void> {
  const remotePath = `${COMMENTS_FOLDER}/${fileName}`;
  console.log('[YandexDisk] Uploading comment file:', remotePath);
  await uploadTextFileYandex(accessToken, remotePath, JSON.stringify(content));
  console.log('[YandexDisk] Comment file uploaded:', fileName);
}

export async function downloadCommentFileYandex(
  accessToken: string,
  fileName: string
): Promise<any> {
  const remotePath = `${COMMENTS_FOLDER}/${fileName}`;
  const content = await downloadTextFileYandex(accessToken, remotePath);
  return JSON.parse(content);
}

export async function deleteCommentFileYandex(
  accessToken: string,
  fileName: string
): Promise<void> {
  const remotePath = `${COMMENTS_FOLDER}/${fileName}`;
  await deleteResourceYandex(accessToken, remotePath);
  console.log('[YandexDisk] Comment file deleted:', fileName);
}

export async function grantFolderAccessYandex(accessToken: string, folderPath: string, userEmail: string): Promise<boolean> {
  console.log('[YandexDisk] Granting access to folder:', folderPath, 'for user:', userEmail);
  try {
    const publishResp = await fetch(
      `https://cloud-api.yandex.net/v1/disk/resources/publish?path=${encodeURIComponent(folderPath)}`,
      {
        method: 'PUT',
        headers: { Authorization: `OAuth ${accessToken}` },
      }
    );
    if (!publishResp.ok) {
      const errorText = await publishResp.text();
      console.log('[YandexDisk] grantFolderAccess publish error:', publishResp.status, errorText);
    } else {
      console.log('[YandexDisk] Folder published successfully for comments sharing');
    }

    const shareResp = await fetch(
      `https://cloud-api.yandex.net/v1/disk/resources/share?path=${encodeURIComponent(folderPath)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { email: userEmail },
          right: 'edit',
        }),
      }
    );
    if (!shareResp.ok) {
      const errorText = await shareResp.text();
      console.log('[YandexDisk] grantFolderAccess share error:', shareResp.status, errorText);
      console.log('[YandexDisk] Note: Folder is published publicly. Subscriber can read via public URL.');
      return false;
    }
    console.log('[YandexDisk] Folder access granted successfully');
    return true;
  } catch (e: any) {
    console.log('[YandexDisk] grantFolderAccess error:', e?.message);
    return false;
  }
}

export async function publishCommentsFolderYandex(accessToken: string): Promise<string | null> {
  console.log('[YandexDisk] Publishing comments folder...');
  try {
    await ensureCommentsFolderYandex(accessToken);
    const publishResp = await fetch(
      `https://cloud-api.yandex.net/v1/disk/resources/publish?path=${encodeURIComponent(COMMENTS_FOLDER)}`,
      {
        method: 'PUT',
        headers: { Authorization: `OAuth ${accessToken}` },
      }
    );
    if (!publishResp.ok) {
      const errorText = await publishResp.text();
      console.log('[YandexDisk] publishCommentsFolder publish error:', publishResp.status, errorText);
      return null;
    }
    const resourceResp = await fetch(
      `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(COMMENTS_FOLDER)}`,
      { headers: { Authorization: `OAuth ${accessToken}` } }
    );
    if (!resourceResp.ok) {
      console.log('[YandexDisk] publishCommentsFolder resource error');
      return null;
    }
    const resourceData = await resourceResp.json();
    const publicUrl = resourceData.public_url || null;
    console.log('[YandexDisk] Comments folder published, URL:', publicUrl);
    return publicUrl;
  } catch (e: any) {
    console.log('[YandexDisk] publishCommentsFolder error:', e?.message);
    return null;
  }
}

export async function listPublicCommentFiles(masterPublicUrl: string): Promise<{ name: string }[]> {
  console.log('[YandexDisk] Listing public comment files from master...');
  try {
    const response = await fetch(
      `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${encodeURIComponent(masterPublicUrl)}&path=${encodeURIComponent('/comments')}&limit=200`
    );
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[YandexDisk] Public comments folder not found');
        return [];
      }
      const errorText = await response.text();
      console.log('[YandexDisk] listPublicCommentFiles error:', response.status, errorText);
      return [];
    }
    const data = await response.json();
    if (!data._embedded) return [];
    const files = data._embedded.items
      .filter((item: any) => item.type === 'file' && item.name.endsWith('.json'))
      .map((item: any) => ({ name: item.name }));
    console.log('[YandexDisk] Found', files.length, 'public comment files');
    return files;
  } catch (e: any) {
    console.log('[YandexDisk] listPublicCommentFiles error:', e?.message);
    return [];
  }
}

export async function downloadPublicCommentFile(masterPublicUrl: string, fileName: string): Promise<any> {
  console.log('[YandexDisk] Downloading public comment file:', fileName);
  const dlResponse = await fetch(
    `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(masterPublicUrl)}&path=${encodeURIComponent('/comments/' + fileName)}`
  );
  if (!dlResponse.ok) {
    const errorText = await dlResponse.text();
    console.log('[YandexDisk] downloadPublicCommentFile URL error:', dlResponse.status, errorText);
    throw new Error('Failed to get download URL for comment: ' + fileName);
  }
  const { href } = await dlResponse.json();
  const fileResponse = await fetch(href);
  if (!fileResponse.ok) {
    throw new Error('Failed to download comment file: ' + fileName);
  }
  const content = await fileResponse.json();
  console.log('[YandexDisk] Downloaded public comment:', fileName);
  return content;
}

export async function checkFolderAccessYandex(accessToken: string, folderPath: string): Promise<boolean> {
  console.log('[YandexDisk] Checking folder access:', folderPath);
  try {
    const url = `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(folderPath)}`;
    const response = await fetch(url, { headers: { Authorization: `OAuth ${accessToken}` } });
    if (response.status === 404) {
      console.log('[YandexDisk] Folder not found:', folderPath);
      return false;
    }
    if (response.status === 403) {
      console.log('[YandexDisk] Access denied to folder:', folderPath);
      return false;
    }
    if (!response.ok) {
      console.log('[YandexDisk] Folder access check error:', response.status);
      return false;
    }
    console.log('[YandexDisk] Folder accessible:', folderPath);
    return true;
  } catch (e: any) {
    console.log('[YandexDisk] checkFolderAccess error:', e?.message);
    return false;
  }
}

export async function sendFolderInvitationYandex(
  accessToken: string,
  folderPath: string,
  userEmail: string
): Promise<{ success: boolean; message: string }> {
  console.log('[YandexDisk] Sending folder invitation to:', userEmail, 'for folder:', folderPath);
  try {
    const publishResp = await fetch(
      `https://cloud-api.yandex.net/v1/disk/resources/publish?path=${encodeURIComponent(folderPath)}`,
      {
        method: 'PUT',
        headers: { Authorization: `OAuth ${accessToken}` },
      }
    );
    if (!publishResp.ok) {
      const errorText = await publishResp.text();
      console.log('[YandexDisk] sendFolderInvitation publish error:', publishResp.status, errorText);
    } else {
      console.log('[YandexDisk] Folder published for invitation sharing');
    }

    const shareResp = await fetch(
      `https://cloud-api.yandex.net/v1/disk/resources/share?path=${encodeURIComponent(folderPath)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { email: userEmail },
          right: 'edit',
        }),
      }
    );

    if (shareResp.ok || shareResp.status === 201) {
      console.log('[YandexDisk] Invitation sent successfully to:', userEmail);
      return { success: true, message: `Приглашение отправлено для ${userEmail}` };
    }

    const errorData = await shareResp.json().catch(() => ({ error: 'unknown', description: '' }));
    console.log('[YandexDisk] sendFolderInvitation share error:', shareResp.status, JSON.stringify(errorData));

    if (errorData.error === 'ShareFolderAlreadySharedError' || errorData.error === 'UserAlreadyInFolder' ||
        (errorData.description && errorData.description.includes('already'))) {
      return { success: true, message: `Пользователь ${userEmail} уже имеет доступ` };
    }

    return {
      success: false,
      message: errorData.description || errorData.message || `Ошибка отправки приглашения (${shareResp.status})`,
    };
  } catch (err: any) {
    console.log('[YandexDisk] sendFolderInvitation error:', err?.message);
    return { success: false, message: err?.message || 'Неизвестная ошибка при отправке приглашения' };
  }
}

export async function getFolderUsersYandex(accessToken: string, folderPath: string): Promise<string[]> {
  console.log('[YandexDisk] Getting folder users for:', folderPath);
  try {
    const url = `https://cloud-api.yandex.net/v1/disk/resources?path=${encodeURIComponent(folderPath)}&fields=share`;
    const response = await fetch(url, { headers: { Authorization: `OAuth ${accessToken}` } });
    if (!response.ok) {
      console.log('[YandexDisk] getFolderUsers error:', response.status);
      return [];
    }
    const data = await response.json();
    const users: string[] = [];
    if (data.share && data.share.rights) {
      for (const right of data.share.rights) {
        if (right.login) users.push(right.login);
        if (right.email) users.push(right.email);
      }
    }
    console.log('[YandexDisk] Folder users:', users);
    return users;
  } catch (err: any) {
    console.log('[YandexDisk] getFolderUsers error:', err?.message);
    return [];
  }
}

export async function exchangeCodeForToken(code: string): Promise<{ access_token: string; refresh_token?: string }> {
  console.log('[YandexDisk] Exchanging code for token...');
  const response = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: [
      `grant_type=authorization_code`,
      `code=${encodeURIComponent(code)}`,
      `client_id=${YANDEX_CLIENT_ID}`,
      `client_secret=${YANDEX_CLIENT_SECRET}`,
    ].join('&'),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.log('[YandexDisk] Token exchange error:', response.status, errorText);
    throw new Error('Failed to exchange code for token');
  }

  const tokenData = await response.json();
  console.log('[YandexDisk] Token exchange successful');
  return tokenData;
}
