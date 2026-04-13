export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `+${cleaned[0]} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9, 11)}`;
  }
  return phone;
}

export function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

export function getFileExtension(fileName: string): string {
  return (fileName.toLowerCase().split('.').pop() || '').toLowerCase();
}

export function isImageFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
}

export function isDocumentFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return ['doc', 'docx', 'xls', 'xlsx'].includes(ext);
}

export function isPdfFile(fileName: string): boolean {
  return getFileExtension(fileName) === 'pdf';
}

export function isWordFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return ['doc', 'docx'].includes(ext);
}

export function isExcelFile(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return ['xls', 'xlsx'].includes(ext);
}

export const DOCUMENT_PICKER_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export function isLowInventory(quantity: number, minQuantity: number): boolean {
  return quantity <= minQuantity;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export async function compressImage(uri: string, maxWidth: number = 1280, quality: number = 0.7): Promise<string> {
  try {
    const ImageManipulator = require('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );
    console.log('[compressImage] Compressed:', uri, '->', result.uri);
    return result.uri;
  } catch (error) {
    console.warn('[compressImage] Failed to compress, using original:', error);
    return uri;
  }
}

export async function compressImages(uris: string[], maxWidth: number = 1280, quality: number = 0.7): Promise<string[]> {
  const results: string[] = [];
  for (const uri of uris) {
    const compressed = await compressImage(uri, maxWidth, quality);
    results.push(compressed);
  }
  return results;
}
