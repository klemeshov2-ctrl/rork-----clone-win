const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const APP_FOLDER_NAME = 'МастерЖурнал_Backup';

export interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
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

async function driveRequest(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.log('[GoogleDrive] API error:', response.status, errorText);
    throw new Error(`Google Drive API error: ${response.status} ${errorText}`);
  }
  return response;
}

export async function getUserInfo(accessToken: string): Promise<{ email: string; name: string }> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Failed to get user info');
  const data = await response.json();
  return { email: data.email, name: data.name || data.email };
}

async function findOrCreateAppFolder(accessToken: string): Promise<string> {
  console.log('[GoogleDrive] Looking for app folder...');
  const query = `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const searchResp = await driveRequest(searchUrl, accessToken);
  const searchData = await searchResp.json();

  if (searchData.files && searchData.files.length > 0) {
    console.log('[GoogleDrive] Found existing folder:', searchData.files[0].id);
    return searchData.files[0].id;
  }

  console.log('[GoogleDrive] Creating app folder...');
  const createResp = await driveRequest(`${DRIVE_API_BASE}/files`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: APP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const folder = await createResp.json();
  console.log('[GoogleDrive] Created folder:', folder.id);
  return folder.id;
}

export async function listBackups(accessToken: string): Promise<DriveFile[]> {
  const folderId = await findOrCreateAppFolder(accessToken);
  const query = `'${folderId}' in parents and name contains 'backup_' and trashed=false`;
  const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime,modifiedTime,size)&orderBy=createdTime desc&pageSize=20`;
  const resp = await driveRequest(url, accessToken);
  const data = await resp.json();
  console.log('[GoogleDrive] Found backups:', data.files?.length || 0);
  return data.files || [];
}

export async function uploadBackup(
  accessToken: string,
  backupData: BackupData
): Promise<DriveFile> {
  const folderId = await findOrCreateAppFolder(accessToken);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16).replace(':', '-');
  const fileName = `backup_${dateStr}_${timeStr}.json`;

  console.log('[GoogleDrive] Uploading backup:', fileName);

  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/json',
  };

  const jsonContent = JSON.stringify(backupData);

  const boundary = 'backup_boundary_' + Date.now();
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${jsonContent}\r\n` +
    `--${boundary}--`;

  const resp = await driveRequest(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,createdTime,modifiedTime,size`,
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  const file = await resp.json();
  console.log('[GoogleDrive] Upload complete:', file.id);
  return file;
}

export async function downloadBackup(
  accessToken: string,
  fileId: string
): Promise<BackupData> {
  console.log('[GoogleDrive] Downloading backup:', fileId);
  const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;
  const resp = await driveRequest(url, accessToken);
  const data = await resp.json();
  console.log('[GoogleDrive] Download complete, version:', data.version);
  return data as BackupData;
}

export async function deleteBackupFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  console.log('[GoogleDrive] Deleting file:', fileId);
  await driveRequest(`${DRIVE_API_BASE}/files/${fileId}`, accessToken, {
    method: 'DELETE',
  });
}

export async function cleanupOldBackups(
  accessToken: string,
  keepCount: number = 5
): Promise<void> {
  const backups = await listBackups(accessToken);
  if (backups.length <= keepCount) return;

  const toDelete = backups.slice(keepCount);
  console.log('[GoogleDrive] Cleaning up', toDelete.length, 'old backups');
  for (const file of toDelete) {
    try {
      await deleteBackupFile(accessToken, file.id);
    } catch (error) {
      console.log('[GoogleDrive] Failed to delete:', file.id, error);
    }
  }
}
