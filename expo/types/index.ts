export interface ObjectGroup {
  id: string;
  name: string;
  createdAt: number;
}

export interface ObjectItem {
  id: string;
  name: string;
  address: string;
  groupId?: string;
  systems?: string[];
  createdAt: number;
  updatedAt: number;
  syncStatus: 'synced' | 'pending' | 'error';
}

export interface ContactPerson {
  id: string;
  objectId: string;
  fullName: string;
  position: string;
  phone: string;
  email?: string;
  createdAt: number;
}

export interface ObjectDocument {
  id: string;
  objectId: string;
  name: string;
  filePath: string;
  fileUrl?: string;
  fileSize: number;
  uploadedAt: number;
}

export interface UsedMaterial {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface WorkEntry {
  id: string;
  objectId: string;
  description: string;
  photos: string[];
  attachedPdfId?: string;
  usedMaterials?: UsedMaterial[];
  systemName?: string;
  latitude?: number;
  longitude?: number;
  createdAt: number;
  syncStatus: 'synced' | 'pending' | 'error';
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  items: ChecklistItem[];
  isDefault: boolean;
  createdAt: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
}

export interface ChecklistResult {
  id: string;
  templateId: string;
  objectId?: string;
  items: ChecklistResultItem[];
  completedAt: number;
  pdfInstructionId?: string;
}

export interface ChecklistResultItem {
  itemId: string;
  itemText?: string;
  result: 'yes' | 'no' | null;
  photoPath?: string;
  note?: string;
}

export interface InventoryCategory {
  id: string;
  name: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  categoryId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Reminder {
  id: string;
  objectId?: string;
  title: string;
  description?: string;
  dueDate: number;
  isCompleted: boolean;
  createdAt: number;
}

export type TaskType = 'reminder' | 'request';

export interface Task {
  id: string;
  type: TaskType;
  objectId?: string;
  objectName?: string;
  title: string;
  description?: string;
  dueDate?: number;
  dueTime?: string;
  isCompleted: boolean;
  completedAt?: number;
  createdAt: number;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  createdAt: number;
}

export interface KnowledgeItem {
  id: string;
  type: 'pdf' | 'note' | 'image' | 'document';
  title: string;
  category: string;
  categoryId?: string;
  content?: string;
  filePath?: string;
  fileUrl?: string;
  fileSize?: number;
  createdAt: number;
}

export type SyncEntity = 
  | { type: 'object'; data: ObjectItem }
  | { type: 'workEntry'; data: WorkEntry }
  | { type: 'checklistResult'; data: ChecklistResult };

export type SyncIntervalKey = 'hourly' | 'twelveHours' | 'daily';

export type ProfileMode = 'master' | 'subscriber';

export interface AppProfile {
  id: string;
  name: string;
  type: 'master' | 'subscription';
}

export interface MasterSubscription {
  id: string;
  name: string;
  masterUrl: string;
  masterId?: string;
  autoSyncEnabled: boolean;
  syncInterval: SyncIntervalKey;
  lastSyncTimestamp: number | null;
}

export type CommentEntityType = 'work_entry' | 'inventory' | 'task';

export interface Comment {
  id: string;
  entityType: CommentEntityType;
  entityId: string;
  userId: string;
  userEmail: string;
  userName: string;
  text: string;
  createdAt: number;
  masterId?: string;
  authorId?: string;
  authorName?: string;
  subscriberId?: string;
}

export interface FirestoreSubscription {
  id: string;
  masterId: string;
  subscriberId: string;
  subscriberName: string;
  masterUrl: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  masterId: string;
  subscriberId: string;
  text: string;
  senderId: string;
  senderName: string;
  createdAt: number;
  isRead: boolean;
}

export interface ChatDialog {
  id: string;
  masterId: string;
  subscriberId: string;
  masterName: string;
  subscriberName: string;
  lastMessage: string;
  lastMessageTime: number;
  lastSenderId: string;
  unreadForMaster: number;
  unreadForSubscriber: number;
}
