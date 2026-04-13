import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  MapPin, Phone, Mail, User, Plus, FileText, 
  Clock, CheckSquare, Trash2, FileUp, Navigation, Pencil, Package,
  ClipboardList, X, Edit3, FileSpreadsheet, FileType, Cpu
} from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useObjects } from '@/providers/ObjectsProvider';
import { useInventory } from '@/providers/InventoryProvider';
import { useChecklists } from '@/providers/ChecklistsProvider';
import { useComments } from '@/providers/CommentsProvider';
import { ChevronRight } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ZoomableImage } from '@/components/ZoomableImage';
import { LazyImage } from '@/components/LazyFile';
import { ensureFileLocal, isRemoteUrl, saveFileToUnifiedDir } from '@/lib/fileManager';
import { useBackup } from '@/providers/BackupProvider';
import { formatDateTime, getInitials, getMimeType, isImageFile, isPdfFile, isWordFile, isExcelFile, DOCUMENT_PICKER_TYPES } from '@/lib/utils';
import { UsedMaterial, ChecklistResult } from '@/types';
import { CommentsBottomSheet } from '@/components/CommentsBottomSheet';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import * as IntentLauncher from 'expo-intent-launcher';

function ContactCard({ contact, onDelete, onEdit, colors }: { contact: any; onDelete: () => void; onEdit: () => void; colors: ThemeColors }) {
  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center' as const, justifyContent: 'center' as const }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' as const }}>{getInitials(contact.fullName)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '600' as const, color: colors.text }}>{contact.fullName}</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 2 }}>{contact.position}</Text>
        </View>
        <TouchableOpacity onPress={onEdit} style={{ padding: 8 }}>
          <Pencil size={16} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={{ padding: 8 }}>
          <Trash2 size={16} color={colors.error} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row' as const, gap: 12 }}>
        <TouchableOpacity
          style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: colors.surface, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }}
          onPress={() => Linking.openURL(`tel:${contact.phone}`)}
        >
          <Phone size={18} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' as const }}>Позвонить</Text>
        </TouchableOpacity>
        {contact.email && (
          <TouchableOpacity
            style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, backgroundColor: colors.surface, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }}
            onPress={() => Linking.openURL(`mailto:${contact.email}`)}
          >
            <Mail size={18} color={colors.secondary} />
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' as const }}>Написать</Text>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
}

function DocumentCard({ doc, onDelete, onRename, onView, colors }: { doc: any; onDelete: () => void; onRename: () => void; onView: () => void; colors: ThemeColors }) {
  const getDocIcon = () => {
    const name = doc.name || doc.filePath || '';
    if (isWordFile(name)) return <FileType size={24} color="#2B579A" />;
    if (isExcelFile(name)) return <FileSpreadsheet size={24} color="#217346" />;
    if (isImageFile(name)) return <FileUp size={24} color={colors.info} />;
    return <FileText size={24} color={colors.error} />;
  };

  const getFileLabel = () => {
    const name = doc.name || doc.filePath || '';
    if (isWordFile(name)) return 'Word';
    if (isExcelFile(name)) return 'Excel';
    if (isPdfFile(name)) return 'PDF';
    if (isImageFile(name)) return 'Фото';
    return 'Файл';
  };

  return (
    <Card style={{ flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 12 }} onPress={onView}>
      <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const }}>
        {getDocIcon()}
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ fontSize: 15, fontWeight: '500' as const, color: colors.text }} numberOfLines={1}>{doc.name}</Text>
        <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 2 }}>
          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' as const, backgroundColor: colors.primary + '20', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' as const }}>{getFileLabel()}</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{formatDateTime(doc.uploadedAt)}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={onRename} style={{ padding: 8 }}>
        <Edit3 size={16} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} style={{ padding: 8 }}>
        <Trash2 size={18} color={colors.error} />
      </TouchableOpacity>
    </Card>
  );
}

function getShortPreview(text: string, wordCount: number = 3): string {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  const preview = words.slice(0, wordCount).join(' ');
  return words.length > wordCount ? preview + '...' : preview;
}

function WorkEntryCard({ entry, onEdit, onDelete, onEditDate, onPhotoPress, onComments, lastComment, commentCount, colors }: { entry: any; onEdit: () => void; onDelete: () => void; onEditDate: () => void; onPhotoPress: (uri: string) => void; onComments: () => void; lastComment?: string; commentCount: number; colors: ThemeColors }) {
  const usedMaterials: UsedMaterial[] = entry.usedMaterials || [];
  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: 8 }}>
        <TouchableOpacity onPress={onEditDate} style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }} activeOpacity={0.7}>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{formatDateTime(entry.createdAt)}</Text>
          <Calendar size={11} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row' as const, gap: 4 }}>
          <TouchableOpacity onPress={onEdit} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const }}>
            <Pencil size={14} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const }}>
            <Trash2 size={14} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={{ fontSize: 15, color: colors.text, lineHeight: 22 }}>{entry.description}</Text>
      {usedMaterials.length > 0 && (
        <View style={{ marginTop: 10, backgroundColor: colors.surface, borderRadius: 8, padding: 10 }}>
          <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 4 }}>
            <Package size={12} color={colors.secondary} />
            <Text style={{ fontSize: 12, color: colors.secondary, fontWeight: '600' as const }}>Материалы:</Text>
          </View>
          {usedMaterials.map((m: UsedMaterial, idx: number) => (
            <Text key={idx} style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 18, lineHeight: 20 }}>{m.name} — {m.quantity} {m.unit}</Text>
          ))}
        </View>
      )}
      {entry.photos && entry.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -16 }}>
          {entry.photos.map((photo: string, index: number) => (
            <LazyImage
              key={index}
              uri={photo}
              style={{ width: 100, height: 100, borderRadius: 8, marginLeft: 16 }}
              onPress={() => onPhotoPress(photo)}
            />
          ))}
        </ScrollView>
      )}
      <TouchableOpacity onPress={onComments} activeOpacity={0.7} style={{ flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 8, marginHorizontal: -16, paddingHorizontal: 16 }}>
        <View style={{ position: 'relative' as const }}>
          <MessageCircle size={15} color={colors.info} />
          {commentCount > 0 && (
            <View style={{ position: 'absolute' as const, top: -5, right: -8, backgroundColor: colors.primary, borderRadius: 7, minWidth: 14, height: 14, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 3 }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' as const }}>{commentCount}</Text>
            </View>
          )}
        </View>
        {lastComment ? (
          <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>{getShortPreview(lastComment)}</Text>
        ) : (
          <Text style={{ fontSize: 12, color: colors.textMuted, fontStyle: 'italic' as const }}>Комментарии</Text>
        )}
        <ChevronRight size={14} color={colors.textMuted} />
      </TouchableOpacity>
    </Card>
  );
}

function ChecklistResultCard({ result, templateName, onDelete, onView, colors }: { result: ChecklistResult; templateName: string; onDelete: () => void; onView: () => void; colors: ThemeColors }) {
  const totalItems = result.items.length;
  const yesCount = result.items.filter(i => i.result === 'yes').length;
  const noCount = result.items.filter(i => i.result === 'no').length;
  const percentage = totalItems > 0 ? Math.round((yesCount / totalItems) * 100) : 0;
  return (
    <Card style={{ marginBottom: 12 }} onPress={onView}>
      <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const }}>
          <ClipboardList size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '600' as const, color: colors.text }} numberOfLines={1}>{templateName}</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{formatDateTime(result.completedAt)}</Text>
        </View>
        <TouchableOpacity onPress={(e) => { e.stopPropagation(); onDelete(); }} style={{ padding: 8 }}>
          <Trash2 size={16} color={colors.error} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row' as const, gap: 16, marginBottom: 8 }}>
        <View style={{ alignItems: 'center' as const }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold' as const, color: colors.success }}>{yesCount}</Text>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Да</Text>
        </View>
        <View style={{ alignItems: 'center' as const }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold' as const, color: colors.error }}>{noCount}</Text>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Нет</Text>
        </View>
        <View style={{ alignItems: 'center' as const }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold' as const, color: colors.primary }}>{percentage}%</Text>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Выполнено</Text>
        </View>
      </View>
      <View style={{ height: 4, backgroundColor: colors.surface, borderRadius: 2 }}>
        <View style={{ height: '100%', backgroundColor: colors.success, borderRadius: 2, width: `${percentage}%` }} />
      </View>
    </Card>
  );
}

export default function ObjectDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { 
    getObject, 
    updateObject,
    updateObjectSystems,
    getContactsByObject, 
    getDocumentsByObject, 
    getWorkEntriesByObject,
    deleteObject,
    deleteContact,
    deleteDocument,
    deleteWorkEntry,
    updateWorkEntry,
    getWorkEntry,
    addDocument,
    updateDocument,
  } = useObjects();
  const { updateItem, getItem: getInventoryItem } = useInventory();
  const { getResultsByObject, deleteResult, getTemplate } = useChecklists();
  
  const object = getObject(id as string);
  const contacts = getContactsByObject(id as string);
  const documents = getDocumentsByObject(id as string);
  const workEntries = getWorkEntriesByObject(id as string);
  const checklistResults = getResultsByObject(id as string);
  
  const [activeTab, setActiveTab] = useState<'contacts' | 'docs' | 'history' | 'checklists'>('history');
  const { comments: commentsRaw, loadComments } = useComments();

  React.useEffect(() => {
    workEntries.forEach(e => { loadComments('work_entry', e.id); });
  }, [workEntries, loadComments]);

  const entryCommentsMap = useMemo(() => {
    const map: Record<string, { count: number; lastText: string }> = {};
    for (const key of Object.keys(commentsRaw)) {
      if (key.startsWith('work_entry:')) {
        const arr = commentsRaw[key];
        if (arr && arr.length > 0) {
          map[key] = { count: arr.length, lastText: arr[arr.length - 1].text };
        }
      }
    }
    return map;
  }, [commentsRaw]);
  const [fileViewerVisible, setFileViewerVisible] = useState(false);
  const [viewingFileUri, setViewingFileUri] = useState<string | null>(null);
  const [viewingFileName, setViewingFileName] = useState('');
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameDocId, setRenameDocId] = useState('');
  const [renameValue, setRenameValue] = useState('');

  const [historyPhotoUri, setHistoryPhotoUri] = useState<string | null>(null);
  const [historyPhotoVisible, setHistoryPhotoVisible] = useState(false);

  const [editObjectVisible, setEditObjectVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [newSystemText, setNewSystemText] = useState('');
  const [showSystemInput, setShowSystemInput] = useState(false);

  const [editEntryDateVisible, setEditEntryDateVisible] = useState(false);
  const [editEntryDateId, setEditEntryDateId] = useState('');
  const [editEntryDateValue, setEditEntryDateValue] = useState('');
  const [editEntryTimeValue, setEditEntryTimeValue] = useState('');

  const [commentsEntryId, setCommentsEntryId] = useState<string>('');
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);

  if (!object) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Объект не найден</Text>
      </View>
    );
  }

  const handleAddSystem = async () => {
    if (!newSystemText.trim()) return;
    const current = object.systems || [];
    if (current.includes(newSystemText.trim().toUpperCase())) {
      Alert.alert('Ошибка', 'Система уже добавлена');
      return;
    }
    await updateObjectSystems(object.id, [...current, newSystemText.trim().toUpperCase()]);
    setNewSystemText('');
    setShowSystemInput(false);
  };

  const handleRemoveSystem = async (sys: string) => {
    const current = object.systems || [];
    await updateObjectSystems(object.id, current.filter(s => s !== sys));
  };

  const handleEditObject = () => {
    setEditName(object.name);
    setEditAddress(object.address);
    setEditObjectVisible(true);
  };

  const submitEditObject = async () => {
    if (!editName.trim() || !editAddress.trim()) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }
    try {
      await updateObject(object.id, {
        name: editName.trim(),
        address: editAddress.trim(),
      });
      setEditObjectVisible(false);
    } catch {
      Alert.alert('Ошибка', 'Не удалось обновить объект');
    }
  };

  const handleDeleteObject = () => {
    Alert.alert(
      'Удалить объект?',
      'Это действие нельзя отменить',
      [
        { text: 'Отмена', style: 'cancel' },
        { 
          text: 'Удалить', 
          style: 'destructive',
          onPress: async () => {
            await deleteObject(object.id);
            router.back();
          }
        },
      ]
    );
  };

  const handleDeleteWorkEntry = (entryId: string) => {
    const entry = getWorkEntry(entryId);
    Alert.alert(
      'Удалить запись?',
      'Использованные материалы будут возвращены на склад',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            if (entry?.usedMaterials && entry.usedMaterials.length > 0) {
              for (const mat of entry.usedMaterials) {
                const invItem = getInventoryItem(mat.itemId);
                if (invItem) {
                  await updateItem(invItem.id, { quantity: invItem.quantity + mat.quantity });
                }
              }
            }
            await deleteWorkEntry(entryId);
          },
        },
      ]
    );
  };

  const handleEditWorkEntry = (entryId: string) => {
    router.push({
      pathname: '/object/new-entry',
      params: { objectId: object.id, editEntryId: entryId }
    });
  };

  const handleEditEntryDate = (entryId: string, currentDate: number) => {
    const d = new Date(currentDate);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    setEditEntryDateId(entryId);
    setEditEntryDateValue(`${day}.${month}.${year}`);
    setEditEntryTimeValue(`${hours}:${minutes}`);
    setEditEntryDateVisible(true);
  };

  const submitEditEntryDate = async () => {
    const dateParts = editEntryDateValue.split('.');
    if (dateParts.length !== 3) { Alert.alert('Ошибка', 'Неверный формат даты'); return; }
    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const year = parseInt(dateParts[2], 10);
    const timeParts = editEntryTimeValue.split(':');
    const hours = timeParts.length >= 2 ? parseInt(timeParts[0], 10) : 0;
    const minutes = timeParts.length >= 2 ? parseInt(timeParts[1], 10) : 0;
    const d = new Date(year, month, day, hours, minutes);
    if (isNaN(d.getTime())) { Alert.alert('Ошибка', 'Неверная дата или время'); return; }
    try {
      await updateWorkEntry(editEntryDateId, { createdAt: d.getTime() } as any);
      setEditEntryDateVisible(false);
    } catch {
      Alert.alert('Ошибка', 'Не удалось обновить дату');
    }
  };

  const handleEditContact = (contactId: string) => {
    router.push({
      pathname: '/object/add-contact',
      params: { objectId: object.id, editContactId: contactId }
    });
  };

  const { accessToken, activeMasterPublicUrl } = useBackup();

  const resolveFileRef = async (fileRef: string): Promise<string | null> => {
    if (isRemoteUrl(fileRef) || fileRef.startsWith('yadisk://')) {
      try {
        return await ensureFileLocal(fileRef, accessToken, activeMasterPublicUrl);
      } catch (e) {
        console.log('[ObjectDetail] Failed to resolve file:', e);
        return null;
      }
    }
    return fileRef;
  };

  const handleViewFile = async (filePath: string, fileName: string, fileUrl?: string) => {
    try {
      const actualRef = fileUrl || filePath;

      if (Platform.OS === 'web') {
        if (actualRef.startsWith('yadisk://') && accessToken) {
          const resolved = await resolveFileRef(actualRef);
          if (resolved) await WebBrowser.openBrowserAsync(resolved);
        } else {
          await WebBrowser.openBrowserAsync(actualRef);
        }
        return;
      }

      const resolved = await resolveFileRef(actualRef);
      if (!resolved) {
        Alert.alert('Ошибка', 'Не удалось загрузить файл');
        return;
      }

      const fileInfo = await FileSystem.getInfoAsync(resolved);
      if (!fileInfo.exists) {
        Alert.alert('Ошибка', 'Файл не найден');
        return;
      }

      if (isImageFile(fileName) || isImageFile(resolved)) {
        setViewingFileUri(resolved);
        setViewingFileName(fileName);
        setFileViewerVisible(true);
      } else {
        const mimeType = getMimeType(fileName || resolved);
        if (Platform.OS === 'android') {
          try {
            const contentUri = await FileSystem.getContentUriAsync(resolved);
            await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
              data: contentUri,
              flags: 1,
              type: mimeType,
            });
            return;
          } catch (intentError) {
            console.log('[ObjectDetail] IntentLauncher failed, falling back to sharing:', intentError);
          }
        }
        await Sharing.shareAsync(resolved, {
          mimeType: mimeType,
          dialogTitle: fileName,
        });
      }
    } catch (error) {
      console.error('[ObjectDetail] Open file error:', error);
      Alert.alert('Ошибка', 'Не удалось открыть файл');
    }
  };

  const handleRenameDocument = (docId: string, currentName: string) => {
    setRenameDocId(docId);
    setRenameValue(currentName);
    setRenameModalVisible(true);
  };

  const submitRename = async () => {
    if (!renameValue.trim()) return;
    if (updateDocument) {
      await updateDocument(renameDocId, { name: renameValue.trim() });
    }
    setRenameModalVisible(false);
    setRenameDocId('');
    setRenameValue('');
  };

  const handleUploadDocument = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Ограничение', 'Загрузка файлов доступна только в мобильном приложении');
      return;
    }
    
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: DOCUMENT_PICKER_TYPES,
        copyToCacheDirectory: true,
      });
      
      if (result.canceled) return;
      
      const file = result.assets[0];
      const fileName = file.name || 'document';
      let fileUri = file.uri;
      
      if (Platform.OS === 'android' && fileUri.startsWith('content://')) {
        const tempUri = (FileSystem.cacheDirectory || '') + fileName;
        await FileSystem.copyAsync({ from: fileUri, to: tempUri });
        fileUri = tempUri;
      }
      
      const destinationUri = await saveFileToUnifiedDir(fileUri, fileName);
      const fileInfoResult = await FileSystem.getInfoAsync(destinationUri);

      await addDocument(object.id, {
        name: fileName,
        filePath: destinationUri,
        fileSize: fileInfoResult.exists ? fileInfoResult.size : 0,
        uploadedAt: Date.now(),
      });
      
      Alert.alert('Успех', 'Файл загружен');
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить файл');
    }
  };

  const handleDeleteChecklistResult = (resultId: string) => {
    Alert.alert('Удалить результат?', 'Результат чек-листа будет удален', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteResult(resultId) },
    ]);
  };

  const openAddressInNavigator = async () => {
    const encodedAddress = encodeURIComponent(object.address);
    const yandexUrl = `yandexmaps://maps.yandex.ru/?text=${encodedAddress}`;
    const yandexWebUrl = `https://yandex.ru/maps/?text=${encodedAddress}`;
    const googleUrl = `comgooglemaps://?q=${encodedAddress}`;
    const googleWebUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
    
    try {
      const canOpenYandex = await Linking.canOpenURL(yandexUrl);
      if (canOpenYandex) {
        await Linking.openURL(yandexUrl);
        return;
      }
      const canOpenGoogle = await Linking.canOpenURL(googleUrl);
      if (canOpenGoogle) {
        await Linking.openURL(googleUrl);
        return;
      }
      await Linking.openURL(yandexWebUrl);
    } catch {
      await Linking.openURL(googleWebUrl);
    }
  };

  const tabs = [
    { key: 'history' as const, label: `История` },
    { key: 'checklists' as const, label: `ТО` },
    { key: 'contacts' as const, label: `Контакты` },
    { key: 'docs' as const, label: `Док.` },
  ];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.objectName}>{object.name}</Text>
            <TouchableOpacity style={styles.addressRow} onPress={openAddressInNavigator}>
              <MapPin size={16} color={colors.primary} />
              <Text style={styles.objectAddress}>{object.address}</Text>
              <Navigation size={16} color={colors.primary} style={styles.navIcon} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleEditObject} style={styles.headerActionBtn}>
              <Pencil size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeleteObject} style={styles.headerActionBtn}>
              <Trash2 size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.systemsSection}>
          <View style={styles.systemsHeader}>
            <Cpu size={16} color={colors.primary} />
            <Text style={styles.systemsTitle}>Системы</Text>
            <TouchableOpacity onPress={() => setShowSystemInput(!showSystemInput)} style={{ padding: 4 }}>
              <Plus size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
          {object.systems && object.systems.length > 0 ? (
            <View style={styles.systemsTags}>
              {object.systems.map((sys, idx) => (
                <View key={idx} style={styles.systemTag}>
                  <Text style={styles.systemTagText}>{sys}</Text>
                  <TouchableOpacity onPress={() => handleRemoveSystem(sys)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <X size={12} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Не указаны</Text>
          )}
          {showSystemInput && (
            <View style={styles.systemInputRow}>
              <TextInput
                style={styles.systemInput}
                value={newSystemText}
                onChangeText={setNewSystemText}
                placeholder="Например: СПС"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <TouchableOpacity style={styles.systemAddBtn} onPress={handleAddSystem}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' as const }}>Добавить</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => router.push({
              pathname: '/object/new-entry',
              params: { objectId: object.id }
            })}
          >
            <Plus size={20} color={colors.text} />
            <Text style={styles.actionText}>Запись</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => router.push({
              pathname: '/object/add-contact',
              params: { objectId: object.id }
            })}
          >
            <User size={20} color={colors.text} />
            <Text style={styles.actionText}>Контакт</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => router.push({ pathname: '/(home)/checklist-run' as any, params: { objectId: object.id } })}
          >
            <CheckSquare size={20} color={colors.text} />
            <Text style={styles.actionText}>Чек-лист</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabsRow}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              <Text style={[styles.tabCount, activeTab === tab.key && styles.tabCountActive]}>
                {tab.key === 'history' ? workEntries.length :
                 tab.key === 'checklists' ? checklistResults.length :
                 tab.key === 'contacts' ? contacts.length :
                 documents.length}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.content}>
          {activeTab === 'contacts' && (
            <>
              {contacts.length === 0 ? (
                <View style={styles.emptyState}>
                  <User size={48} color={colors.textMuted} />
                  <Text style={styles.emptyText}>Нет контактов</Text>
                  <Button
                    title="Добавить контакт"
                    variant="secondary"
                    onPress={() => router.push({
                      pathname: '/object/add-contact',
                      params: { objectId: object.id }
                    })}
                  />
                </View>
              ) : (
                contacts.map(contact => (
                  <ContactCard 
                    key={contact.id} 
                    contact={contact}
                    onDelete={() => deleteContact(contact.id)}
                    onEdit={() => handleEditContact(contact.id)}
                    colors={colors}
                  />
                ))
              )}
            </>
          )}

          {activeTab === 'docs' && (
            <>
              <Button
                title="Загрузить файл"
                variant="secondary"
                icon={<FileUp size={18} color={colors.text} />}
                onPress={handleUploadDocument}
                style={styles.uploadButton}
              />
              {documents.length === 0 ? (
                <View style={styles.emptyState}>
                  <FileText size={48} color={colors.textMuted} />
                  <Text style={styles.emptyText}>Нет документов</Text>
                </View>
              ) : (
                documents.map(doc => (
                  <DocumentCard 
                    key={doc.id} 
                    doc={doc}
                    onDelete={() => deleteDocument(doc.id)}
                    onRename={() => handleRenameDocument(doc.id, doc.name)}
                    onView={() => handleViewFile(doc.filePath, doc.name, (doc as any).fileUrl)}
                    colors={colors}
                  />
                ))
              )}
            </>
          )}

          {activeTab === 'history' && (
            <>
              {workEntries.length === 0 ? (
                <View style={styles.emptyState}>
                  <Clock size={48} color={colors.textMuted} />
                  <Text style={styles.emptyText}>Нет записей</Text>
                  <Button
                    title="Добавить запись"
                    variant="secondary"
                    onPress={() => router.push({
                      pathname: '/object/new-entry',
                      params: { objectId: object.id }
                    })}
                  />
                </View>
              ) : (
                workEntries.map(entry => (
                  <WorkEntryCard 
                    key={entry.id} 
                    entry={entry}
                    onEdit={() => handleEditWorkEntry(entry.id)}
                    onDelete={() => handleDeleteWorkEntry(entry.id)}
                    onEditDate={() => handleEditEntryDate(entry.id, entry.createdAt)}
                    onComments={() => { setCommentsEntryId(entry.id); setCommentsModalVisible(true); }}
                    lastComment={entryCommentsMap[`work_entry:${entry.id}`]?.lastText}
                    commentCount={entryCommentsMap[`work_entry:${entry.id}`]?.count || 0}
                    colors={colors}
                    onPhotoPress={async (uri) => {
                      try {
                        const resolved = await resolveFileRef(uri);
                        if (resolved) {
                          setHistoryPhotoUri(resolved);
                          setHistoryPhotoVisible(true);
                        } else {
                          Alert.alert('Ошибка', 'Не удалось загрузить фото');
                        }
                      } catch {
                        Alert.alert('Ошибка', 'Не удалось загрузить фото');
                      }
                    }}
                  />
                ))
              )}
            </>
          )}

          {activeTab === 'checklists' && (
            <>
              <Button
                title="Выполнить чек-лист"
                variant="secondary"
                icon={<ClipboardList size={18} color={colors.text} />}
                onPress={() => router.push({ pathname: '/(home)/checklist-run' as any, params: { objectId: object.id } })}
                style={styles.uploadButton}
              />
              {checklistResults.length === 0 ? (
                <View style={styles.emptyState}>
                  <ClipboardList size={48} color={colors.textMuted} />
                  <Text style={styles.emptyText}>Нет выполненных чек-листов</Text>
                  <Text style={styles.emptySubtext}>Выполните чек-лист для этого объекта</Text>
                </View>
              ) : (
                checklistResults.map(result => {
                  const tmpl = getTemplate(result.templateId);
                  return (
                    <ChecklistResultCard 
                      key={result.id}
                      result={result}
                      templateName={tmpl?.name || 'Неизвестный шаблон'}
                      onDelete={() => handleDeleteChecklistResult(result.id)}
                      onView={() => router.push({ pathname: '/(home)/checklist-result' as any, params: { resultId: result.id } })}
                      colors={colors}
                    />
                  );
                })
              )}
            </>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={fileViewerVisible}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setFileViewerVisible(false)}
      >
        <SafeAreaView style={styles.viewerContainer}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle} numberOfLines={1}>{viewingFileName}</Text>
            <TouchableOpacity onPress={() => setFileViewerVisible(false)} style={styles.viewerClose}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          {viewingFileUri && (
            <ZoomableImage uri={viewingFileUri} />
          )}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={renameModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <KeyboardAvoidingView style={styles.renameOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.renameModal}>
            <Text style={styles.renameTitle}>Переименовать файл</Text>
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Название файла"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <View style={styles.renameButtons}>
              <Button
                title="Отмена"
                variant="ghost"
                onPress={() => setRenameModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Сохранить"
                onPress={submitRename}
                disabled={!renameValue.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={historyPhotoVisible}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setHistoryPhotoVisible(false)}
      >
        <SafeAreaView style={styles.viewerContainer}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle} numberOfLines={1}>Фото</Text>
            <TouchableOpacity onPress={() => setHistoryPhotoVisible(false)} style={styles.viewerClose}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          {historyPhotoUri && (
            <ZoomableImage uri={historyPhotoUri} />
          )}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={editEntryDateVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditEntryDateVisible(false)}
      >
        <KeyboardAvoidingView style={styles.renameOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.renameModal}>
            <Text style={styles.renameTitle}>Редактировать дату записи</Text>
            <Text style={styles.fieldLabel}>Дата (ДД.ММ.ГГГГ)</Text>
            <TextInput
              style={styles.renameInput}
              value={editEntryDateValue}
              onChangeText={setEditEntryDateValue}
              placeholder="01.01.2025"
              placeholderTextColor={colors.textMuted}
              keyboardType="default"
              autoFocus
            />
            <Text style={styles.fieldLabel}>Время (ЧЧ:ММ)</Text>
            <TextInput
              style={styles.renameInput}
              value={editEntryTimeValue}
              onChangeText={setEditEntryTimeValue}
              placeholder="12:00"
              placeholderTextColor={colors.textMuted}
              keyboardType="default"
            />
            <View style={styles.renameButtons}>
              <Button
                title="Отмена"
                variant="ghost"
                onPress={() => setEditEntryDateVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Сохранить"
                onPress={submitEditEntryDate}
                disabled={!editEntryDateValue.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={editObjectVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditObjectVisible(false)}
      >
        <KeyboardAvoidingView style={styles.renameOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.renameModal}>
            <Text style={styles.renameTitle}>Редактировать объект</Text>
            <Text style={styles.fieldLabel}>Название</Text>
            <TextInput
              style={styles.renameInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Название объекта"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <Text style={styles.fieldLabel}>Адрес</Text>
            <TextInput
              style={styles.renameInput}
              value={editAddress}
              onChangeText={setEditAddress}
              placeholder="Адрес объекта"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.renameButtons}>
              <Button
                title="Отмена"
                variant="ghost"
                onPress={() => setEditObjectVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Сохранить"
                onPress={submitEditObject}
                disabled={!editName.trim() || !editAddress.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CommentsBottomSheet
        visible={commentsModalVisible}
        onClose={() => setCommentsModalVisible(false)}
        entityType="work_entry"
        entityId={commentsEntryId}
        title="Комментарии к записи"
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
  },
  headerContent: {
    flex: 1,
    marginRight: 12,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  headerActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  objectName: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: colors.text,
    marginBottom: 8,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceElevated,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  navIcon: {
    marginLeft: 4,
  },
  objectAddress: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  tabTextActive: {
    color: colors.text,
  },
  tabCount: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  tabCountActive: {
    color: colors.text,
  },
  content: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 100,
  },
  contactCard: {
    marginBottom: 12,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  contactPosition: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  editButton: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 12,
  },
  contactAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  contactActionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  documentIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  documentName: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: colors.text,
  },
  documentDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  uploadButton: {
    marginBottom: 16,
  },
  entryCard: {
    marginBottom: 12,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  entryDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  entryActions: {
    flexDirection: 'row',
    gap: 4,
  },
  entryActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryDescription: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  materialsUsed: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 10,
  },
  materialsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  materialsLabel: {
    fontSize: 12,
    color: colors.secondary,
    fontWeight: '600' as const,
  },
  materialItem: {
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 18,
    lineHeight: 20,
  },
  photosRow: {
    marginTop: 12,
    marginHorizontal: -16,
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginLeft: 16,
  },
  checklistResultCard: {
    marginBottom: 12,
  },
  checklistResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checklistResultIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistResultInfo: {
    flex: 1,
    marginLeft: 12,
  },
  checklistResultName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
  },
  checklistResultDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  checklistResultStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  checklistStatItem: {
    alignItems: 'center',
  },
  checklistStatValue: {
    fontSize: 18,
    fontWeight: 'bold' as const,
  },
  checklistStatLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  progressBarSmall: {
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: 2,
  },
  progressFillSmall: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textMuted,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    textAlign: 'center' as const,
    marginTop: 40,
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  viewerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginRight: 12,
  },
  viewerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerContent: {
    flex: 1,
  },
  viewerContentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  renameOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  renameModal: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    padding: 20,
  },
  renameTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  renameInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  renameButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  systemsSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
    backgroundColor: colors.surfaceElevated,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  systemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  systemsTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  systemsTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  systemTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary + '18',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  systemTagText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.primary,
  },
  systemInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  systemInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  systemAddBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },

});
}
