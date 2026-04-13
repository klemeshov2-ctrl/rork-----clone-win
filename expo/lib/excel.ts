import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import {
  ObjectItem,
  ContactPerson,
  WorkEntry,
  InventoryItem,
  ChecklistTemplate,
  ChecklistResult,
  Reminder,
  Task,
  KnowledgeItem,
} from '@/types';

interface ExportData {
  objects: ObjectItem[];
  contacts: Record<string, ContactPerson[]>;
  workEntries: Record<string, WorkEntry[]>;
  inventory: InventoryItem[];
  checklistTemplates: ChecklistTemplate[];
  checklistResults: ChecklistResult[];
  reminders: Reminder[];
  tasks: Task[];
  knowledge: KnowledgeItem[];
  getObjectName: (id: string) => string;
}

function formatTs(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('ru-RU');
}

export async function exportToExcel(data: ExportData): Promise<void> {
  console.log('[Excel] Starting export...');
  const wb = XLSX.utils.book_new();

  const objectsRows = data.objects.map(o => ({
    'ID': o.id,
    'Название': o.name,
    'Адрес': o.address,
    'Создан': formatTs(o.createdAt),
    'Обновлён': formatTs(o.updatedAt),
  }));
  const wsObjects = XLSX.utils.json_to_sheet(objectsRows);
  wsObjects['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 40 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsObjects, 'Объекты');

  const allContacts: ContactPerson[] = [];
  Object.values(data.contacts).forEach(arr => allContacts.push(...arr));
  const contactsRows = allContacts.map(c => ({
    'ID': c.id,
    'Объект': data.getObjectName(c.objectId),
    'ID объекта': c.objectId,
    'ФИО': c.fullName,
    'Должность': c.position,
    'Телефон': c.phone,
    'Email': c.email || '',
    'Создан': formatTs(c.createdAt),
  }));
  const wsContacts = XLSX.utils.json_to_sheet(contactsRows);
  wsContacts['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 18 }, { wch: 25 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsContacts, 'Контакты');

  const allEntries: WorkEntry[] = [];
  Object.values(data.workEntries).forEach(arr => allEntries.push(...arr));
  const entriesRows = allEntries.map(e => ({
    'ID': e.id,
    'Объект': data.getObjectName(e.objectId),
    'ID объекта': e.objectId,
    'Описание': e.description,
    'Материалы': e.usedMaterials?.map(m => `${m.name}: ${m.quantity} ${m.unit}`).join('; ') || '',
    'Фото (кол-во)': e.photos?.length || 0,
    'Широта': e.latitude || '',
    'Долгота': e.longitude || '',
    'Создан': formatTs(e.createdAt),
  }));
  const wsEntries = XLSX.utils.json_to_sheet(entriesRows);
  wsEntries['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 50 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsEntries, 'Записи работ');

  const inventoryRows = data.inventory.map(i => ({
    'ID': i.id,
    'Название': i.name,
    'Количество': i.quantity,
    'Единица': i.unit,
    'Мин. количество': i.minQuantity,
    'Создан': formatTs(i.createdAt),
    'Обновлён': formatTs(i.updatedAt),
  }));
  const wsInventory = XLSX.utils.json_to_sheet(inventoryRows);
  wsInventory['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsInventory, 'Склад');

  const templatesRows = data.checklistTemplates.map(t => ({
    'ID': t.id,
    'Название': t.name,
    'Пункты': t.items.map(i => i.text).join('\n'),
    'Кол-во пунктов': t.items.length,
    'По умолчанию': t.isDefault ? 'Да' : 'Нет',
    'Создан': formatTs(t.createdAt),
  }));
  const wsTemplates = XLSX.utils.json_to_sheet(templatesRows);
  wsTemplates['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 50 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsTemplates, 'Шаблоны чек-листов');

  const resultsRows = data.checklistResults.map(r => {
    const template = data.checklistTemplates.find(t => t.id === r.templateId);
    return {
      'ID': r.id,
      'Шаблон': template?.name || r.templateId,
      'Объект': r.objectId ? data.getObjectName(r.objectId) : '',
      'Результаты': r.items.map(i => {
        const resultText = i.result === 'yes' ? '✓' : i.result === 'no' ? '✗' : '—';
        return `${i.itemText || i.itemId}: ${resultText}${i.note ? ` (${i.note})` : ''}`;
      }).join('\n'),
      'Завершён': formatTs(r.completedAt),
    };
  });
  const wsResults = XLSX.utils.json_to_sheet(resultsRows);
  wsResults['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 60 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsResults, 'Результаты чек-листов');

  const remindersRows = data.reminders.map(r => ({
    'ID': r.id,
    'Объект': r.objectId ? data.getObjectName(r.objectId) : '',
    'Заголовок': r.title,
    'Описание': r.description || '',
    'Срок': formatTs(r.dueDate),
    'Выполнено': r.isCompleted ? 'Да' : 'Нет',
    'Создан': formatTs(r.createdAt),
  }));
  const wsReminders = XLSX.utils.json_to_sheet(remindersRows);
  wsReminders['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 30 }, { wch: 40 }, { wch: 20 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsReminders, 'Напоминания');

  const tasksRows = data.tasks.map(t => ({
    'ID': t.id,
    'Тип': t.type === 'reminder' ? 'Напоминание' : 'Заявка',
    'Объект': t.objectId ? data.getObjectName(t.objectId) : '',
    'Заголовок': t.title,
    'Описание': t.description || '',
    'Дата': formatTs(t.dueDate || 0),
    'Время': t.dueTime || '',
    'Выполнено': t.isCompleted ? 'Да' : 'Нет',
    'Дата выполнения': t.completedAt ? formatTs(t.completedAt) : '',
    'Создан': formatTs(t.createdAt),
  }));
  const wsTasks = XLSX.utils.json_to_sheet(tasksRows);
  wsTasks['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 25 }, { wch: 30 }, { wch: 40 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsTasks, 'Задачи');

  const categoryMap: Record<string, string> = {
    instructions: 'Инструкции',
    schemes: 'Схемы',
    errors: 'Ошибки',
    other: 'Другое',
  };
  const typeMap: Record<string, string> = {
    pdf: 'PDF',
    note: 'Заметка',
    image: 'Изображение',
  };
  const knowledgeRows = data.knowledge.map(k => ({
    'ID': k.id,
    'Тип': typeMap[k.type] || k.type,
    'Название': k.title,
    'Категория': categoryMap[k.category] || k.category,
    'Содержимое': k.content || '',
    'Создан': formatTs(k.createdAt),
  }));
  const wsKnowledge = XLSX.utils.json_to_sheet(knowledgeRows);
  wsKnowledge['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 50 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsKnowledge, 'База знаний');

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const fileName = `export_${dateStr}.xlsx`;

  if (Platform.OS === 'web') {
    const binaryStr = atob(wbout);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    console.log('[Excel] Web download triggered');
    return;
  }

  const filePath = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(filePath, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });
  console.log('[Excel] File saved to:', filePath);

  await Sharing.shareAsync(filePath, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Экспорт данных',
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });
  console.log('[Excel] Shared successfully');
}

interface ImportResult {
  objects: Array<{ name: string; address: string }>;
  contacts: Array<{ objectName: string; fullName: string; position: string; phone: string; email?: string }>;
  inventory: Array<{ name: string; quantity: number; unit: string; minQuantity: number }>;
  reminders: Array<{ title: string; description?: string; dueDate: number }>;
  tasks: Array<{ type: 'reminder' | 'request'; title: string; description?: string; dueDate: number; dueTime?: string }>;
  knowledge: Array<{ type: 'note'; title: string; category: 'instructions' | 'schemes' | 'errors' | 'other'; content?: string }>;
}

function parseRuDate(dateStr: string): number {
  if (!dateStr) return Date.now();
  const parts = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4}),?\s*(\d{2}):(\d{2})/);
  if (parts) {
    return new Date(
      parseInt(parts[3]),
      parseInt(parts[2]) - 1,
      parseInt(parts[1]),
      parseInt(parts[4]),
      parseInt(parts[5])
    ).getTime();
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

export async function pickAndParseExcel(): Promise<ImportResult | null> {
  console.log('[Excel] Picking file...');
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    console.log('[Excel] Pick cancelled');
    return null;
  }

  const asset = result.assets[0];
  console.log('[Excel] File picked:', asset.name, asset.uri);

  let wb: XLSX.WorkBook;

  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    const arrayBuffer = await response.arrayBuffer();
    wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  } else {
    const fileContent = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    wb = XLSX.read(fileContent, { type: 'base64' });
  }

  console.log('[Excel] Sheets found:', wb.SheetNames);

  const imported: ImportResult = {
    objects: [],
    contacts: [],
    inventory: [],
    reminders: [],
    tasks: [],
    knowledge: [],
  };

  const objectsSheet = wb.Sheets['Объекты'];
  if (objectsSheet) {
    const rows = XLSX.utils.sheet_to_json<any>(objectsSheet);
    imported.objects = rows
      .filter((r: any) => r['Название'])
      .map((r: any) => ({
        name: String(r['Название'] || ''),
        address: String(r['Адрес'] || ''),
      }));
    console.log('[Excel] Parsed objects:', imported.objects.length);
  }

  const contactsSheet = wb.Sheets['Контакты'];
  if (contactsSheet) {
    const rows = XLSX.utils.sheet_to_json<any>(contactsSheet);
    imported.contacts = rows
      .filter((r: any) => r['ФИО'])
      .map((r: any) => ({
        objectName: String(r['Объект'] || ''),
        fullName: String(r['ФИО'] || ''),
        position: String(r['Должность'] || ''),
        phone: String(r['Телефон'] || ''),
        email: r['Email'] ? String(r['Email']) : undefined,
      }));
    console.log('[Excel] Parsed contacts:', imported.contacts.length);
  }

  const inventorySheet = wb.Sheets['Склад'];
  if (inventorySheet) {
    const rows = XLSX.utils.sheet_to_json<any>(inventorySheet);
    imported.inventory = rows
      .filter((r: any) => r['Название'])
      .map((r: any) => ({
        name: String(r['Название'] || ''),
        quantity: Number(r['Количество']) || 0,
        unit: String(r['Единица'] || 'шт'),
        minQuantity: Number(r['Мин. количество']) || 0,
      }));
    console.log('[Excel] Parsed inventory:', imported.inventory.length);
  }

  const remindersSheet = wb.Sheets['Напоминания'];
  if (remindersSheet) {
    const rows = XLSX.utils.sheet_to_json<any>(remindersSheet);
    imported.reminders = rows
      .filter((r: any) => r['Заголовок'])
      .map((r: any) => ({
        title: String(r['Заголовок'] || ''),
        description: r['Описание'] ? String(r['Описание']) : undefined,
        dueDate: parseRuDate(String(r['Срок'] || '')),
      }));
    console.log('[Excel] Parsed reminders:', imported.reminders.length);
  }

  const tasksSheet = wb.Sheets['Задачи'];
  if (tasksSheet) {
    const rows = XLSX.utils.sheet_to_json<any>(tasksSheet);
    imported.tasks = rows
      .filter((r: any) => r['Заголовок'])
      .map((r: any) => {
        const typeStr = String(r['Тип'] || '');
        const type = typeStr === 'Заявка' ? 'request' as const : 'reminder' as const;
        return {
          type,
          title: String(r['Заголовок'] || ''),
          description: r['Описание'] ? String(r['Описание']) : undefined,
          dueDate: parseRuDate(String(r['Дата'] || '')),
          dueTime: r['Время'] ? String(r['Время']) : undefined,
        };
      });
    console.log('[Excel] Parsed tasks:', imported.tasks.length);
  }

  const knowledgeSheet = wb.Sheets['База знаний'];
  if (knowledgeSheet) {
    const categoryReverseMap: Record<string, 'instructions' | 'schemes' | 'errors' | 'other'> = {
      'Инструкции': 'instructions',
      'Схемы': 'schemes',
      'Ошибки': 'errors',
      'Другое': 'other',
    };
    const rows = XLSX.utils.sheet_to_json<any>(knowledgeSheet);
    imported.knowledge = rows
      .filter((r: any) => r['Название'])
      .map((r: any) => ({
        type: 'note' as const,
        title: String(r['Название'] || ''),
        category: categoryReverseMap[String(r['Категория'] || '')] || 'other',
        content: r['Содержимое'] ? String(r['Содержимое']) : undefined,
      }));
    console.log('[Excel] Parsed knowledge:', imported.knowledge.length);
  }

  return imported;
}
