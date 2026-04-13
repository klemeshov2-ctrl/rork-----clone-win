import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, X, Package, Minus, Plus, ChevronDown } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useObjects } from '@/providers/ObjectsProvider';
import { useInventory } from '@/providers/InventoryProvider';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { UsedMaterial } from '@/types';
import { Wrench } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSubscriberGuard } from '@/providers/ProfileProvider';
import { compressImage, compressImages } from '@/lib/utils';
import { saveFileToUnifiedDir } from '@/lib/fileManager';

interface MaterialSelection {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  available: number;
}

export default function NewEntryScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { objectId, editEntryId } = useLocalSearchParams();
  const { addWorkEntry, updateWorkEntry, getWorkEntry, getObject } = useObjects();
  const { items: inventoryItems, consumeItem, updateItem, getItem: getInventoryItem, addItem: addInventoryItem } = useInventory();
  const { guardEdit } = useSubscriberGuard();
  
  const isEditing = !!editEntryId;
  const existingEntry = isEditing ? getWorkEntry(editEntryId as string) : undefined;

  const [description, setDescription] = useState('');
  const [selectedSystem, setSelectedSystem] = useState<string>('');
  const [showSystemPicker, setShowSystemPicker] = useState(false);
  
  const currentObject = objectId ? getObject(objectId as string) : undefined;
  const objectSystems = currentObject?.systems || [];
  const [photos, setPhotos] = useState<string[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<MaterialSelection[]>([]);
  const [showMaterials, setShowMaterials] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (existingEntry) {
      setDescription(existingEntry.description);
      setSelectedSystem(existingEntry.systemName || '');
      setPhotos(existingEntry.photos || []);
      if (existingEntry.usedMaterials && existingEntry.usedMaterials.length > 0) {
        const mats: MaterialSelection[] = existingEntry.usedMaterials.map(m => {
          const inv = getInventoryItem(m.itemId);
          return {
            itemId: m.itemId,
            name: m.name,
            quantity: m.quantity,
            unit: m.unit,
            available: inv ? inv.quantity + m.quantity : m.quantity,
          };
        });
        setSelectedMaterials(mats);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingEntry?.id]);

  const takePhoto = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Недоступно', 'Камера недоступна в веб-версии. Используйте "Галерея".');
      return;
    }
    if (photos.length >= 5) { Alert.alert('Ошибка', 'Максимум 5 фото'); return; }
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) { Alert.alert('Ошибка', 'Нужно разрешение на камеру'); return; }
    }
    setShowCamera(true);
  };

  const capturePhoto = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      if (photo) {
        const compressed = await compressImage(photo.uri);
        const saved = await saveFileToUnifiedDir(compressed, 'photo.jpg');
        setPhotos([...photos, saved]);
      }
      setShowCamera(false);
    }
  };

  const pickFromGallery = async () => {
    if (photos.length >= 5) { Alert.alert('Ошибка', 'Максимум 5 фото'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5 - photos.length,
    });
    if (!result.canceled) {
      const rawUris = result.assets.map(asset => asset.uri);
      const compressed = await compressImages(rawUris);
      const saved: string[] = [];
      for (const uri of compressed) {
        const s = await saveFileToUnifiedDir(uri, 'photo.jpg');
        saved.push(s);
      }
      setPhotos([...photos, ...saved]);
    }
  };

  const addMaterial = (itemId: string) => {
    const item = inventoryItems.find(i => i.id === itemId);
    if (!item) return;
    const existing = selectedMaterials.find(m => m.itemId === itemId);
    if (existing) return;
    setSelectedMaterials([...selectedMaterials, {
      itemId: item.id, name: item.name, quantity: 1, unit: item.unit, available: item.quantity,
    }]);
    setMaterialSearch('');
    setShowMaterials(false);
  };

  const handleCreateNewMaterial = useCallback(async () => {
    if (!materialSearch.trim()) return;
    try {
      const newItem = await addInventoryItem({ name: materialSearch.trim(), quantity: 0, unit: 'шт', minQuantity: 2 });
      setSelectedMaterials(prev => [...prev, {
        itemId: newItem.id, name: newItem.name, quantity: 1, unit: newItem.unit, available: 0,
      }]);
      setMaterialSearch('');
      setShowMaterials(false);
    } catch {
      Alert.alert('Ошибка', 'Не удалось создать материал');
    }
  }, [materialSearch, addInventoryItem]);

  const updateMaterialQty = (itemId: string, delta: number) => {
    setSelectedMaterials(prev => prev.map(m => {
      if (m.itemId !== itemId) return m;
      const newQty = Math.max(0, Math.min(m.available, m.quantity + delta));
      return { ...m, quantity: newQty };
    }).filter(m => m.quantity > 0));
  };

  const removeMaterial = (itemId: string) => {
    setSelectedMaterials(prev => prev.filter(m => m.itemId !== itemId));
  };

  const handleSubmit = async () => {
    if (!description.trim()) { Alert.alert('Ошибка', 'Введите описание работы'); return; }
    const ok = await guardEdit();
    if (!ok) return;
    if (!objectId) { Alert.alert('Ошибка', 'Объект не определен'); return; }
    setIsLoading(true);
    try {
      const usedMaterials: UsedMaterial[] = selectedMaterials
        .filter(m => m.quantity > 0)
        .map(m => ({ itemId: m.itemId, name: m.name, quantity: m.quantity, unit: m.unit }));

      if (isEditing && existingEntry) {
        if (existingEntry.usedMaterials) {
          for (const oldMat of existingEntry.usedMaterials) {
            const inv = getInventoryItem(oldMat.itemId);
            if (inv) { await updateItem(inv.id, { quantity: inv.quantity + oldMat.quantity }); }
          }
        }
        for (const mat of usedMaterials) { await consumeItem(mat.itemId, mat.quantity); }
        await updateWorkEntry(editEntryId as string, { description: description.trim(), photos, usedMaterials, systemName: selectedSystem || undefined });
      } else {
        for (const mat of usedMaterials) {
          const success = await consumeItem(mat.itemId, mat.quantity);
          if (!success) { Alert.alert('Ошибка', `Недостаточно "${mat.name}" на складе`); setIsLoading(false); return; }
        }
        console.log('[NewEntry] Saving entry for object:', objectId);
        await addWorkEntry(objectId as string, { description: description.trim(), photos, usedMaterials, systemName: selectedSystem || undefined, syncStatus: 'pending' });
        console.log('[NewEntry] Entry saved successfully');
      }
      router.back();
    } catch (error) {
      console.error('[NewEntry] Save error:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить запись');
    } finally {
      setIsLoading(false);
    }
  };

  const removePhoto = (index: number) => { setPhotos(photos.filter((_, i) => i !== index)); };

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} ref={cameraRef} facing="back">
          <View style={styles.cameraControls}>
            <TouchableOpacity style={styles.cameraClose} onPress={() => setShowCamera(false)}>
              <X size={28} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.captureButton} onPress={capturePhoto}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  const availableToAdd = inventoryItems.filter(
    i => !selectedMaterials.find(m => m.itemId === i.id)
  );

  const filteredMaterials = materialSearch.trim()
    ? availableToAdd.filter(i => i.name.toLowerCase().includes(materialSearch.toLowerCase()))
    : availableToAdd;

  const showCreateMaterial = materialSearch.trim() && !availableToAdd.find(i => i.name.toLowerCase() === materialSearch.toLowerCase());

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
      >
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{isEditing ? 'Редактировать запись' : 'Новая запись'}</Text>
          
          {objectSystems.length > 0 && (
            <View style={styles.systemSection}>
              <Text style={styles.sectionLabel}>Система</Text>
              <TouchableOpacity 
                style={styles.systemPicker} 
                onPress={() => setShowSystemPicker(!showSystemPicker)}
              >
                <Wrench size={16} color={selectedSystem ? colors.primary : colors.textMuted} />
                <Text style={[styles.systemPickerText, selectedSystem && { color: colors.text }]}>
                  {selectedSystem || 'Выберите систему'}
                </Text>
                <ChevronDown size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {showSystemPicker && (
                <View style={styles.systemDropdown}>
                  <TouchableOpacity 
                    style={[styles.systemOption, !selectedSystem && styles.systemOptionActive]} 
                    onPress={() => { setSelectedSystem(''); setShowSystemPicker(false); }}
                  >
                    <Text style={[styles.systemOptionText, !selectedSystem && { color: colors.primary }]}>Без системы</Text>
                  </TouchableOpacity>
                  {objectSystems.map(sys => (
                    <TouchableOpacity 
                      key={sys} 
                      style={[styles.systemOption, selectedSystem === sys && styles.systemOptionActive]} 
                      onPress={() => { setSelectedSystem(sys); setShowSystemPicker(false); }}
                    >
                      <Text style={[styles.systemOptionText, selectedSystem === sys && { color: colors.primary }]}>{sys}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          <Input
            label="Описание работы"
            value={description}
            onChangeText={setDescription}
            placeholder="Опишите выполненные работы..."
            multiline
            numberOfLines={4}
            style={styles.textArea}
          />

          <Text style={styles.sectionLabel}>Фото ({photos.length}/5)</Text>
          <View style={styles.photoButtons}>
            <Button title="Камера" variant="secondary" icon={<Camera size={18} color={colors.text} />} onPress={takePhoto} disabled={photos.length >= 5} style={{ flex: 1 }} />
            <Button title="Галерея" variant="secondary" onPress={pickFromGallery} disabled={photos.length >= 5} style={{ flex: 1 }} />
          </View>

          {photos.length > 0 && (
            <ScrollView horizontal style={styles.photosRow} showsHorizontalScrollIndicator={false}>
              {photos.map((photo, index) => (
                <View key={index} style={styles.photoContainer}>
                  <Image source={{ uri: photo }} style={styles.photo} />
                  <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(index)}>
                    <X size={16} color={colors.text} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <Text style={styles.sectionLabel}>Материалы со склада</Text>
          {selectedMaterials.length > 0 && (
            <View style={styles.materialsList}>
              {selectedMaterials.map(mat => (
                <View key={mat.itemId} style={styles.materialRow}>
                  <View style={styles.materialInfo}>
                    <Text style={styles.materialName} numberOfLines={1}>{mat.name}</Text>
                    <Text style={styles.materialAvailable}>Доступно: {mat.available} {mat.unit}</Text>
                  </View>
                  <View style={styles.materialQtyControls}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateMaterialQty(mat.itemId, -1)}>
                      <Minus size={16} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{mat.quantity}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateMaterialQty(mat.itemId, 1)}>
                      <Plus size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => removeMaterial(mat.itemId)} style={styles.removeMat}>
                    <X size={16} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {!showMaterials ? (
            <TouchableOpacity style={styles.addMaterialBtn} onPress={() => setShowMaterials(true)}>
              <Package size={18} color={colors.primary} />
              <Text style={styles.addMaterialText}>Добавить материал</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.materialPickerContainer}>
              <View style={styles.materialPickerHeader}>
                <Text style={styles.materialPickerTitle}>Выберите материал</Text>
                <TouchableOpacity onPress={() => { setShowMaterials(false); setMaterialSearch(''); }}>
                  <X size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.materialSearchInput}
                value={materialSearch}
                onChangeText={setMaterialSearch}
                placeholder="Поиск или новый материал..."
                placeholderTextColor={colors.textMuted}
              />
              {filteredMaterials.length === 0 && !showCreateMaterial ? (
                <Text style={styles.noMaterials}>Нет доступных материалов</Text>
              ) : (
                filteredMaterials.slice(0, 10).map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.materialPickerItem}
                    onPress={() => addMaterial(item.id)}
                  >
                    <Package size={16} color={colors.secondary} />
                    <Text style={styles.materialPickerName}>{item.name}</Text>
                    <Text style={styles.materialPickerQty}>{item.quantity} {item.unit}</Text>
                  </TouchableOpacity>
                ))
              )}
              {showCreateMaterial && (
                <TouchableOpacity style={styles.createMaterialBtn} onPress={handleCreateNewMaterial}>
                  <Plus size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' as const }}>Создать «{materialSearch.trim()}» на складе</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.buttons}>
            <Button title="Отмена" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
            <Button title={isEditing ? 'Сохранить' : 'Создать'} onPress={handleSubmit} loading={isLoading} disabled={!description.trim()} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold' as const, color: colors.text, marginBottom: 24 },
  textArea: { height: 100, textAlignVertical: 'top' as const },
  sectionLabel: { fontSize: 14, fontWeight: '500' as const, color: colors.textSecondary, marginBottom: 12, marginTop: 8 },
  photoButtons: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  photosRow: { marginBottom: 16 },
  photoContainer: { position: 'relative' as const, marginRight: 12 },
  photo: { width: 100, height: 100, borderRadius: 12 },
  removePhoto: { position: 'absolute' as const, top: -8, right: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.error, alignItems: 'center' as const, justifyContent: 'center' as const },
  materialsList: { marginBottom: 12 },
  materialRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceElevated, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  materialInfo: { flex: 1 },
  materialName: { fontSize: 14, fontWeight: '500' as const, color: colors.text },
  materialAvailable: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  materialQtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8 },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  qtyText: { color: colors.text, fontSize: 16, fontWeight: '600' as const, minWidth: 24, textAlign: 'center' as const },
  removeMat: { padding: 4 },
  addMaterialBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, marginBottom: 8 },
  addMaterialText: { color: colors.primary, fontSize: 15, fontWeight: '500' as const },
  materialPickerContainer: { backgroundColor: colors.surfaceElevated, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  materialPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  materialPickerTitle: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
  materialSearchInput: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  noMaterials: { color: colors.textMuted, fontSize: 14, textAlign: 'center' as const, paddingVertical: 12 },
  materialPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, marginBottom: 4 },
  materialPickerName: { flex: 1, color: colors.text, fontSize: 14 },
  materialPickerQty: { color: colors.textMuted, fontSize: 13 },
  createMaterialBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 8, backgroundColor: colors.primary + '10', borderRadius: 8, marginTop: 4 },
  systemSection: { marginBottom: 8 },
  systemPicker: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceElevated, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border },
  systemPickerText: { flex: 1, fontSize: 14, color: colors.textMuted },
  systemDropdown: { backgroundColor: colors.surfaceElevated, borderRadius: 10, marginTop: 4, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' as const },
  systemOption: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  systemOptionActive: { backgroundColor: colors.primary + '15' },
  systemOptionText: { fontSize: 14, color: colors.text },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 40 },
  cameraContainer: { flex: 1, backgroundColor: colors.background },
  camera: { flex: 1 },
  cameraControls: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' as const, paddingBottom: 40, alignItems: 'center' as const },
  cameraClose: { position: 'absolute' as const, top: 60, left: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.overlay, alignItems: 'center' as const, justifyContent: 'center' as const },
  captureButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.text, alignItems: 'center' as const, justifyContent: 'center' as const },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.text, borderWidth: 3, borderColor: colors.background },
}); }
