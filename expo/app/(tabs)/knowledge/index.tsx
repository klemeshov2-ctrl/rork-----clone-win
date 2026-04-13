import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Platform, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, BookOpen, FileText, StickyNote, Search, Trash2, Image as ImageIcon, X, Edit3, FileSpreadsheet, FileType, FolderPlus, ChevronDown, ChevronRight, Tag, Pencil, ArrowRightLeft, ChevronsUpDown } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useKnowledge } from '@/providers/KnowledgeProvider';
import { KnowledgeItem, KnowledgeCategory } from '@/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ZoomableImage } from '@/components/ZoomableImage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import * as IntentLauncher from 'expo-intent-launcher';
import { formatDate, getMimeType, isImageFile, isDocumentFile, isPdfFile, isWordFile, isExcelFile, DOCUMENT_PICKER_TYPES, compressImage } from '@/lib/utils';
import { useSubscriberGuard } from '@/providers/ProfileProvider';
import { ensureFileLocal, isRemoteUrl, saveFileToUnifiedDir } from '@/lib/fileManager';
import { useBackup } from '@/providers/BackupProvider';
import { NotificationBell } from '@/components/NotificationBell';

function KnowledgeCard({ item, onDelete, onView, onRename, onMove, colors }: { item: KnowledgeItem; onDelete: () => void; onView: () => void; onRename: () => void; onMove: () => void; colors: ThemeColors }) {
  const getIcon = () => {
    const name = item.filePath || item.title || '';
    if (item.type === 'document' || isDocumentFile(name)) {
      if (isWordFile(name)) return <FileType size={24} color="#2B579A" />;
      if (isExcelFile(name)) return <FileSpreadsheet size={24} color="#217346" />;
      return <FileText size={24} color={colors.info} />;
    }
    if (item.type === 'pdf') return <FileText size={24} color={colors.error} />;
    if (item.type === 'image') return <ImageIcon size={24} color={colors.info} />;
    return <StickyNote size={24} color={colors.secondary} />;
  };
  const getTypeLabel = () => {
    const name = item.filePath || item.title || '';
    if (item.type === 'document' || isDocumentFile(name)) {
      if (isWordFile(name)) return 'Word';
      if (isExcelFile(name)) return 'Excel';
      return 'Документ';
    }
    if (item.type === 'pdf') return 'PDF';
    if (item.type === 'image') return 'Фото';
    return 'Заметка';
  };
  const isFile = item.type === 'pdf' || item.type === 'image' || item.type === 'document';

  return (
    <Card style={{ marginBottom: 12 }} onPress={isFile ? onView : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const }}>{getIcon()}</View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '600' as const, color: colors.text }} numberOfLines={2}>{item.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' as const, backgroundColor: colors.primary + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' as const }}>{getTypeLabel()}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onMove} style={{ padding: 8 }}><ArrowRightLeft size={14} color={colors.secondary} /></TouchableOpacity>
        <TouchableOpacity onPress={onRename} style={{ padding: 8 }}><Edit3 size={16} color={colors.primary} /></TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={{ padding: 8 }}><Trash2 size={16} color={colors.error} /></TouchableOpacity>
      </View>
      {item.type === 'note' && item.content && <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSecondary, lineHeight: 20 }} numberOfLines={3}>{item.content}</Text>}
    </Card>
  );
}

function CategoryAccordion({ category, items, colors, isExpanded, onToggle, onEdit, onDelete, onViewItem, onDeleteItem, onRenameItem, onMoveItem }: {
  category: KnowledgeCategory | null;
  items: KnowledgeItem[];
  colors: ThemeColors;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewItem: (item: KnowledgeItem) => void;
  onDeleteItem: (item: KnowledgeItem) => void;
  onRenameItem: (item: KnowledgeItem) => void;
  onMoveItem: (item: KnowledgeItem) => void;
}) {
  const title = category ? category.name : 'Без категории';
  return (
    <View style={{ marginBottom: 6 }}>
      <TouchableOpacity onPress={onToggle} style={{ flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 10, gap: 8 }}>
        {isExpanded ? <ChevronDown size={18} color={colors.textSecondary} /> : <ChevronRight size={18} color={colors.textSecondary} />}
        <Tag size={15} color={category ? colors.primary : colors.textMuted} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700' as const, color: colors.text, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>{title}</Text>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>{items.length}</Text>
        {category && onEdit && (
          <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
            <Pencil size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
        {category && onDelete && (
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
            <Trash2 size={14} color={colors.error} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      {isExpanded && items.map(item => (
        <KnowledgeCard
          key={item.id}
          item={item}
          onDelete={() => onDeleteItem(item)}
          onView={() => onViewItem(item)}
          onRename={() => onRenameItem(item)}
          onMove={() => onMoveItem(item)}
          colors={colors}
        />
      ))}
      {isExpanded && items.length === 0 && (
        <Text style={{ fontSize: 13, color: colors.textMuted, paddingLeft: 40, paddingVertical: 8 }}>Пусто</Text>
      )}
    </View>
  );
}

export default function KnowledgeScreen() {
  const colors = useThemeColors();
  const { items, categories, isLoading, addItem, updateItem, deleteItem, searchItems, addCategory, updateCategory, deleteCategory, moveItemToCategory } = useKnowledge();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategoryId, setNoteCategoryId] = useState<string | undefined>(undefined);
  const [fileViewerVisible, setFileViewerVisible] = useState(false);
  const [viewingFileUri, setViewingFileUri] = useState<string | null>(null);
  const [viewingFileName, setViewingFileName] = useState('');
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameItemId, setRenameItemId] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [movingItemId, setMovingItemId] = useState<string | null>(null);
  const [showUploadCategoryPicker, setShowUploadCategoryPicker] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { guardEdit } = useSubscriberGuard();
  const { accessToken, activeMasterPublicUrl } = useBackup();

  const filteredItems = useMemo(() => {
    if (searchQuery.trim()) return searchItems(searchQuery);
    return items;
  }, [searchQuery, searchItems, items]);

  const categoryGrouped = useMemo(() => {
    const grouped: { category: KnowledgeCategory | null; items: KnowledgeItem[] }[] = [];
    categories.forEach(cat => {
      grouped.push({ category: cat, items: filteredItems.filter(i => i.categoryId === cat.id) });
    });
    grouped.push({ category: null, items: filteredItems.filter(i => !i.categoryId) });
    return grouped.filter(g => g.items.length > 0 || !searchQuery.trim());
  }, [filteredItems, categories, searchQuery]);

  const toggleCategory = useCallback((catId: string) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: prev[catId] === undefined ? false : !prev[catId] }));
  }, []);

  const isCatExpanded = useCallback((catId: string) => {
    return expandedCategories[catId] !== false;
  }, [expandedCategories]);

  const handleViewFile = async (item: KnowledgeItem) => {
    const fileRef = item.fileUrl || item.filePath;
    if (!fileRef) return;
    try {
      let resolvedPath = fileRef;

      if (isRemoteUrl(fileRef) || fileRef.startsWith('yadisk://')) {
        if (Platform.OS === 'web') {
          try {
            resolvedPath = await ensureFileLocal(fileRef, accessToken, activeMasterPublicUrl);
          } catch {
            Alert.alert('Ошибка', 'Не удалось загрузить файл');
            return;
          }
          await WebBrowser.openBrowserAsync(resolvedPath);
          return;
        }
        try {
          resolvedPath = await ensureFileLocal(fileRef, accessToken, activeMasterPublicUrl);
        } catch {
          Alert.alert('Ошибка', 'Не удалось загрузить файл');
          return;
        }
      } else if (Platform.OS === 'web') {
        await WebBrowser.openBrowserAsync(resolvedPath);
        return;
      }

      const fileInfo = await FileSystem.getInfoAsync(resolvedPath);
      if (!fileInfo.exists) { Alert.alert('Ошибка', 'Файл не найден'); return; }
      const fileName = resolvedPath;
      if (isImageFile(fileName) || item.type === 'image') {
        setViewingFileUri(resolvedPath); setViewingFileName(item.title); setFileViewerVisible(true);
      } else {
        const mimeType = getMimeType(fileName);
        if (Platform.OS === 'android') {
          try {
            const contentUri = await FileSystem.getContentUriAsync(resolvedPath);
            await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
              data: contentUri,
              flags: 1,
              type: mimeType,
            });
            return;
          } catch (intentError) {
            console.log('[Knowledge] IntentLauncher failed, falling back to sharing:', intentError);
          }
        }
        await Sharing.shareAsync(resolvedPath, { mimeType, dialogTitle: item.title });
      }
    } catch (error) { console.error('[Knowledge] Open file error:', error); Alert.alert('Ошибка', 'Не удалось открыть файл'); }
  };

  const handleRename = (id: string, currentTitle: string) => { setRenameItemId(id); setRenameValue(currentTitle); setRenameModalVisible(true); };
  const submitRename = async () => { if (!renameValue.trim()) return; await updateItem(renameItemId, { title: renameValue.trim() }); setRenameModalVisible(false); setRenameItemId(''); setRenameValue(''); };

  const handleMoveItem = (item: KnowledgeItem) => {
    setMovingItemId(item.id);
    setMoveModalVisible(true);
  };

  const submitMove = useCallback(async (categoryId: string | null) => {
    if (!movingItemId) return;
    await moveItemToCategory(movingItemId, categoryId);
    setMoveModalVisible(false);
    setMovingItemId(null);
  }, [movingItemId, moveItemToCategory]);

  const handleUploadFile = async (targetCategoryId?: string) => {
    if (Platform.OS === 'web') { Alert.alert('Ограничение', 'Загрузка файлов доступна только в мобильном приложении'); return; }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_PICKER_TYPES });
      if (result.canceled) return;
      const file = result.assets[0];
      let fileUri = file.uri;
      if (Platform.OS === 'android' && fileUri.startsWith('content://')) { const tempUri = (FileSystem.cacheDirectory || '') + (file.name || 'file'); await FileSystem.copyAsync({ from: fileUri, to: tempUri }); fileUri = tempUri; }
      const isImg = file.mimeType?.startsWith('image/') || isImageFile(file.name || '');
      if (isImg) {
        fileUri = await compressImage(fileUri);
      }
      const destinationUri = await saveFileToUnifiedDir(fileUri, file.name || 'file');
      const fileInfoResult = await FileSystem.getInfoAsync(destinationUri);
      const fileName = file.name || 'document';
      const isPdf = file.mimeType?.includes('pdf') || isPdfFile(fileName);
      const isImage = file.mimeType?.startsWith('image/') || isImageFile(fileName);
      const isDoc = isDocumentFile(fileName);
      const fileType: 'pdf' | 'image' | 'note' | 'document' = isPdf ? 'pdf' : isImage ? 'image' : isDoc ? 'document' : 'pdf';
      const defaultTitle = fileName.replace(/\.(pdf|jpg|jpeg|png|webp|doc|docx|xls|xlsx)$/i, '');
      await addItem({ type: fileType, title: defaultTitle, category: 'other', categoryId: targetCategoryId, filePath: destinationUri, fileSize: fileInfoResult.exists ? fileInfoResult.size : 0 });
      Alert.alert('Успех', 'Файл загружен');
    } catch (error) { console.error('Upload error:', error); Alert.alert('Ошибка', 'Не удалось загрузить файл'); }
  };

  const handleUploadWithCategory = () => {
    if (categories.length === 0) {
      void handleUploadFile(undefined);
      return;
    }
    setShowUploadCategoryPicker(true);
  };

  const handleAddNote = async () => {
    if (!noteTitle.trim()) { Alert.alert('Ошибка', 'Введите название'); return; }
    const ok = await guardEdit();
    if (!ok) return;
    await addItem({ type: 'note', title: noteTitle.trim(), category: 'other', categoryId: noteCategoryId, content: noteContent.trim() });
    setNoteTitle(''); setNoteContent(''); setNoteCategoryId(undefined); setShowAddNote(false);
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Удалить?', `"${title}" будет удален`, [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => deleteItem(id) }]);
  };

  const handleAddCategory = async () => {
    if (!categoryNameInput.trim()) return;
    const ok = await guardEdit();
    if (!ok) return;
    if (editingCategoryId) {
      await updateCategory(editingCategoryId, categoryNameInput.trim());
    } else {
      const cat = await addCategory(categoryNameInput.trim());
      setExpandedCategories(prev => ({ ...prev, [cat.id]: true }));
    }
    setCategoryNameInput('');
    setEditingCategoryId(null);
    setShowCategoryModal(false);
  };

  const handleEditCategory = (cat: KnowledgeCategory) => {
    setEditingCategoryId(cat.id);
    setCategoryNameInput(cat.name);
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = (cat: KnowledgeCategory) => {
    Alert.alert('Удалить категорию?', `Файлы из "${cat.name}" останутся без категории`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteCategory(cat.id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>База знаний</Text>
        <NotificationBell />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.smallButton} onPress={() => { setEditingCategoryId(null); setCategoryNameInput(''); setShowCategoryModal(true); }}>
          <FolderPlus size={20} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={handleUploadWithCategory}><FileText size={20} color={colors.text} /></TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddNote(true)}><Plus size={24} color={colors.text} /></TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <Search size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
          <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Поиск..." placeholderTextColor={colors.textMuted} style={styles.searchInput} />
        </View>
        <TouchableOpacity style={styles.collapseButton} onPress={() => {
          const allExpanded = categoryGrouped.every(g => isCatExpanded(g.category?.id || 'ungrouped'));
          const newState: Record<string, boolean> = {};
          categoryGrouped.forEach(g => { newState[g.category?.id || 'ungrouped'] = !allExpanded; });
          setExpandedCategories(newState);
        }}>
          <ChevronsUpDown size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {showAddNote && (
        <Card style={{ marginHorizontal: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '600' as const, color: colors.text, marginBottom: 12 }}>Новая заметка</Text>
          <Input placeholder="Название" value={noteTitle} onChangeText={setNoteTitle} containerStyle={{ marginBottom: 12 }} />
          <Input placeholder="Текст заметки..." value={noteContent} onChangeText={setNoteContent} multiline numberOfLines={4} containerStyle={{ marginBottom: 12 }} />
          {categories.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>Категория:</Text>
              <View style={{ flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 }}>
                <TouchableOpacity
                  style={[styles.catChip, !noteCategoryId && styles.catChipActive]}
                  onPress={() => setNoteCategoryId(undefined)}
                >
                  <Text style={[styles.catChipText, !noteCategoryId && styles.catChipTextActive]}>Без категории</Text>
                </TouchableOpacity>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catChip, noteCategoryId === cat.id && styles.catChipActive]}
                    onPress={() => setNoteCategoryId(cat.id)}
                  >
                    <Text style={[styles.catChipText, noteCategoryId === cat.id && styles.catChipTextActive]}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
            <Button title="Отмена" variant="ghost" size="small" onPress={() => setShowAddNote(false)} />
            <Button title="Сохранить" size="small" onPress={handleAddNote} disabled={!noteTitle.trim()} />
          </View>
        </Card>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>Загрузка...</Text></View>
      ) : (
        <FlatList
          data={categoryGrouped}
          keyExtractor={(item) => item.category?.id || 'ungrouped'}
          renderItem={({ item: group }) => (
            <CategoryAccordion
              category={group.category}
              items={group.items}
              colors={colors}
              isExpanded={isCatExpanded(group.category?.id || 'ungrouped')}
              onToggle={() => toggleCategory(group.category?.id || 'ungrouped')}
              onEdit={group.category ? () => handleEditCategory(group.category!) : undefined}
              onDelete={group.category ? () => handleDeleteCategory(group.category!) : undefined}
              onViewItem={handleViewFile}
              onDeleteItem={(item) => handleDelete(item.id, item.title)}
              onRenameItem={(item) => handleRename(item.id, item.title)}
              onMoveItem={handleMoveItem}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <BookOpen size={48} color={colors.textMuted} />
              <Text style={{ fontSize: 16, color: colors.textSecondary }}>{searchQuery ? 'Ничего не найдено' : 'База знаний пуста'}</Text>
            </View>
          }
        />
      )}

      <Modal visible={fileViewerVisible} animationType="fade" transparent={false} onRequestClose={() => setFileViewerVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '600' as const, color: colors.text, marginRight: 12 }} numberOfLines={1}>{viewingFileName}</Text>
            <TouchableOpacity onPress={() => setFileViewerVisible(false)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceElevated, alignItems: 'center' as const, justifyContent: 'center' as const }}><X size={24} color={colors.text} /></TouchableOpacity>
          </View>
          {viewingFileUri && <ZoomableImage uri={viewingFileUri} />}
        </SafeAreaView>
      </Modal>

      <Modal visible={renameModalVisible} animationType="slide" transparent onRequestClose={() => setRenameModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Переименовать</Text>
            <TextInput style={styles.modalInput} value={renameValue} onChangeText={setRenameValue} placeholder="Название" placeholderTextColor={colors.textMuted} autoFocus />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button title="Отмена" variant="ghost" onPress={() => setRenameModalVisible(false)} style={{ flex: 1 }} />
              <Button title="Сохранить" onPress={submitRename} disabled={!renameValue.trim()} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCategoryModal} animationType="slide" transparent onRequestClose={() => { setShowCategoryModal(false); setEditingCategoryId(null); setCategoryNameInput(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingCategoryId ? 'Переименовать категорию' : 'Новая категория'}</Text>
            <TextInput
              style={styles.modalInput}
              value={categoryNameInput}
              onChangeText={setCategoryNameInput}
              placeholder="Например: Нормативы"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <View style={{ flexDirection: 'row' as const, gap: 12 }}>
              <Button title="Отмена" variant="ghost" onPress={() => { setShowCategoryModal(false); setEditingCategoryId(null); setCategoryNameInput(''); }} style={{ flex: 1 }} />
              <Button title={editingCategoryId ? 'Сохранить' : 'Создать'} onPress={handleAddCategory} disabled={!categoryNameInput.trim()} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={moveModalVisible} animationType="slide" transparent onRequestClose={() => { setMoveModalVisible(false); setMovingItemId(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Переместить в категорию</Text>
            <TouchableOpacity style={styles.moveOption} onPress={() => submitMove(null)}>
              <Text style={styles.moveOptionText}>Без категории</Text>
            </TouchableOpacity>
            {categories.map(cat => (
              <TouchableOpacity key={cat.id} style={styles.moveOption} onPress={() => submitMove(cat.id)}>
                <Tag size={16} color={colors.primary} />
                <Text style={styles.moveOptionText}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ marginTop: 12 }}>
              <Button title="Отмена" variant="ghost" onPress={() => { setMoveModalVisible(false); setMovingItemId(null); }} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showUploadCategoryPicker} animationType="slide" transparent onRequestClose={() => setShowUploadCategoryPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Выберите категорию для файла</Text>
            <TouchableOpacity style={styles.moveOption} onPress={() => { setShowUploadCategoryPicker(false); void handleUploadFile(undefined); }}>
              <Text style={styles.moveOptionText}>Без категории</Text>
            </TouchableOpacity>
            {categories.map(cat => (
              <TouchableOpacity key={cat.id} style={styles.moveOption} onPress={() => { setShowUploadCategoryPicker(false); void handleUploadFile(cat.id); }}>
                <Tag size={16} color={colors.primary} />
                <Text style={styles.moveOptionText}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ marginTop: 12 }}>
              <Button title="Отмена" variant="ghost" onPress={() => setShowUploadCategoryPicker(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    actionRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8, gap: 8 },
    title: { fontSize: 28, fontWeight: 'bold' as const, color: colors.text },
    smallButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12, gap: 8 },
    searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceElevated, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
    searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 },
    collapseButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    catChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    catChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' as const },
    catChipTextActive: { color: colors.text },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 16 },
    modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalContent: { width: '100%', backgroundColor: colors.surfaceElevated, borderRadius: 16, padding: 20 },
    modalTitle: { fontSize: 18, fontWeight: '600' as const, color: colors.text, marginBottom: 16 },
    modalInput: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontSize: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
    moveOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.surface, marginBottom: 6 },
    moveOptionText: { fontSize: 15, color: colors.text, fontWeight: '500' as const },
  });
}
