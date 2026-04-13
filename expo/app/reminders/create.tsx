import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, KeyboardAvoidingView, TextInput } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, Clock, Bell, Wrench, Building2, ChevronRight, X, Plus, ArrowLeft } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useTasks } from '@/providers/TasksProvider';
import { useObjects } from '@/providers/ObjectsProvider';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { parseTaskVoice } from '@/lib/voiceParser';
import type { TaskType } from '@/types';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function CreateTaskScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { objectId, editId } = useLocalSearchParams();
  const { addTask, updateTask, tasks } = useTasks();
  const { objects, addObject } = useObjects();

  const editingTask = useMemo(() => {
    if (editId) return tasks.find(t => t.id === editId);
    return undefined;
  }, [editId, tasks]);

  const [taskType, setTaskType] = useState<TaskType>(
    editingTask?.type || (objectId ? 'request' : 'reminder')
  );
  const [title, setTitle] = useState(editingTask?.title || '');
  const [description, setDescription] = useState(editingTask?.description || '');
  const [selectedObjectId, setSelectedObjectId] = useState<string | undefined>(
    editingTask?.objectId || (objectId as string | undefined)
  );
  const [objectSearchText, setObjectSearchText] = useState('');
  const [showObjectSearch, setShowObjectSearch] = useState(false);
  const [customObjectName, setCustomObjectName] = useState(editingTask?.objectName || '');
  const [hasDate, setHasDate] = useState(() => {
    if (editingTask) return !!editingTask.dueDate;
    return true;
  });
  const [date, setDate] = useState(() => {
    if (editingTask?.dueDate) return new Date(editingTask.dueDate);
    return new Date();
  });
  const [hours, setHours] = useState(() => {
    if (editingTask?.dueTime) return editingTask.dueTime.split(':')[0];
    return '08';
  });
  const [minutes, setMinutes] = useState(() => {
    if (editingTask?.dueTime) return editingTask.dueTime.split(':')[1];
    return '00';
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const isEditing = !!editingTask;

  const handleVoiceResult = useCallback((text: string) => {
    console.log('[VoiceTask] Recognized:', text);
    const objectsList = objects.map(o => ({ id: o.id, name: o.name }));
    const parsed = parseTaskVoice(text, objectsList);
    console.log('[VoiceTask] Parsed:', parsed);

    if (parsed.type) setTaskType(parsed.type);
    if (parsed.title) setTitle(parsed.title);
    if (parsed.objectId) {
      setSelectedObjectId(parsed.objectId);
      setCustomObjectName(parsed.objectName || '');
    }
    if (parsed.date) {
      setHasDate(true);
      setDate(parsed.date);
    }
    if (parsed.time) {
      const [h, m] = parsed.time.split(':');
      setHours(h);
      setMinutes(m);
    }


  }, [objects]);

  const selectedObject = useMemo(() => {
    if (!selectedObjectId) return undefined;
    return objects.find(o => o.id === selectedObjectId);
  }, [selectedObjectId, objects]);

  const filteredObjectsList = useMemo(() => {
    if (!objectSearchText.trim()) return objects;
    const q = objectSearchText.toLowerCase();
    return objects.filter(o => o.name.toLowerCase().includes(q) || o.address.toLowerCase().includes(q));
  }, [objects, objectSearchText]);

  const handleCreateNewObject = useCallback(async () => {
    if (!objectSearchText.trim()) return;
    try {
      const newObj = await addObject(objectSearchText.trim(), '');
      setSelectedObjectId(newObj.id);
      setCustomObjectName('');
      setObjectSearchText('');
      setShowObjectSearch(false);
    } catch {
      Alert.alert('Ошибка', 'Не удалось создать объект');
    }
  }, [objectSearchText, addObject]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Ошибка', 'Введите название задачи');
      return;
    }

    let dueDate: number | undefined;
    let dueTime: string | undefined;

    if (hasDate) {
      const h = parseInt(hours) || 0;
      const m = parseInt(minutes) || 0;
      if (h < 0 || h > 23 || m < 0 || m > 59) {
        Alert.alert('Ошибка', 'Некорректное время');
        return;
      }
      const dd = new Date(date);
      dd.setHours(0, 0, 0, 0);
      dueDate = dd.getTime();
      dueTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const objectName = selectedObject?.name || customObjectName || undefined;

    setIsLoading(true);
    try {
      if (isEditing) {
        await updateTask(editingTask.id, {
          type: taskType,
          objectId: selectedObjectId,
          objectName,
          title: title.trim(),
          description: description.trim() || undefined,
          dueDate,
          dueTime,
        });
      } else {
        await addTask({
          type: taskType,
          objectId: selectedObjectId,
          objectName,
          title: title.trim(),
          description: description.trim() || undefined,
          dueDate,
          dueTime,
        });
      }
      router.back();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить задачу');
    } finally {
      setIsLoading(false);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    if (event?.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const formatHoursInput = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 2) {
      const num = parseInt(cleaned);
      if (!isNaN(num) && num <= 23) {
        setHours(cleaned);
      } else if (cleaned === '') {
        setHours('');
      }
    }
  };

  const formatMinutesInput = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 2) {
      const num = parseInt(cleaned);
      if (!isNaN(num) && num <= 59) {
        setMinutes(cleaned);
      } else if (cleaned === '') {
        setMinutes('');
      }
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Редактирование' : 'Задача'}</Text>
        <View style={{ width: 40 }} />
      </View>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.titleRow}>
          <Text style={styles.screenTitle}>
            {isEditing ? 'Редактирование' : 'Новая задача'}
          </Text>
          <VoiceInputButton onResult={handleVoiceResult} size={40} />
        </View>

        <Text style={styles.sectionLabel}>Тип задачи</Text>
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[styles.typeButton, taskType === 'reminder' && styles.typeButtonActive]}
            onPress={() => setTaskType('reminder')}
          >
            <Bell size={20} color={taskType === 'reminder' ? '#fff' : colors.info} />
            <Text style={[styles.typeButtonText, taskType === 'reminder' && styles.typeButtonTextActive]}>
              Напоминание
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeButton, taskType === 'request' && styles.typeButtonActiveRequest]}
            onPress={() => setTaskType('request')}
          >
            <Wrench size={20} color={taskType === 'request' ? '#fff' : colors.warning} />
            <Text style={[styles.typeButtonText, taskType === 'request' && styles.typeButtonTextActive]}>
              Заявка
            </Text>
          </TouchableOpacity>
        </View>

        <Input
          label="Название"
          value={title}
          onChangeText={setTitle}
          placeholder={taskType === 'reminder' ? 'Например: Плановое ТО' : 'Например: Ремонт насоса'}
        />

        <Input
          label="Описание"
          value={description}
          onChangeText={setDescription}
          placeholder="Дополнительная информация..."
          multiline
          numberOfLines={3}
        />

        <Text style={styles.sectionLabel}>Объект</Text>
        {!showObjectSearch ? (
          <TouchableOpacity
            style={styles.objectSelector}
            onPress={() => setShowObjectSearch(true)}
          >
            {selectedObject ? (
              <View style={styles.selectedObjectInfo}>
                <Building2 size={18} color={colors.primary} />
                <View style={styles.selectedObjectTextWrap}>
                  <Text style={styles.selectedObjectName}>{selectedObject.name}</Text>
                  {selectedObject.address ? (
                    <Text style={styles.selectedObjectAddr} numberOfLines={1}>{selectedObject.address}</Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => { setSelectedObjectId(undefined); setCustomObjectName(''); }} style={{ padding: 4 }}>
                  <X size={16} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.objectSelectorPlaceholder}>
                {taskType === 'request' ? 'Выберите или введите объект' : 'Без объекта (необязательно)'}
              </Text>
            )}
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <View style={styles.objectSearchContainer}>
            <View style={styles.objectSearchInputRow}>
              <TextInput
                style={styles.objectSearchInput}
                value={objectSearchText}
                onChangeText={setObjectSearchText}
                placeholder="Название объекта..."
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <TouchableOpacity onPress={() => { setShowObjectSearch(false); setObjectSearchText(''); }} style={{ padding: 8 }}>
                <X size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.objectList}>
              {taskType !== 'request' && (
                <TouchableOpacity
                  style={[styles.objectItem, !selectedObjectId && styles.objectItemActive]}
                  onPress={() => { setSelectedObjectId(undefined); setCustomObjectName(''); setShowObjectSearch(false); setObjectSearchText(''); }}
                >
                  <Text style={[styles.objectItemText, !selectedObjectId && styles.objectItemTextActive]}>Без объекта</Text>
                </TouchableOpacity>
              )}
              {filteredObjectsList.map(obj => (
                <TouchableOpacity
                  key={obj.id}
                  style={[styles.objectItem, selectedObjectId === obj.id && styles.objectItemActive]}
                  onPress={() => { setSelectedObjectId(obj.id); setCustomObjectName(''); setShowObjectSearch(false); setObjectSearchText(''); }}
                >
                  <Text style={[styles.objectItemText, selectedObjectId === obj.id && styles.objectItemTextActive]}>{obj.name}</Text>
                  {obj.address ? <Text style={styles.objectItemAddr} numberOfLines={1}>{obj.address}</Text> : null}
                </TouchableOpacity>
              ))}
              {objectSearchText.trim() && !filteredObjectsList.find(o => o.name.toLowerCase() === objectSearchText.toLowerCase()) && (
                <TouchableOpacity style={styles.createNewObjectBtn} onPress={handleCreateNewObject}>
                  <Plus size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' as const }}>Создать «{objectSearchText.trim()}»</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={styles.dateToggleRow}>
          <Text style={styles.sectionLabel}>Дата и время</Text>
          <TouchableOpacity
            style={[styles.dateToggle, hasDate && styles.dateToggleActive]}
            onPress={() => setHasDate(!hasDate)}
          >
            <Text style={[styles.dateToggleText, hasDate && styles.dateToggleTextActive]}>
              {hasDate ? 'Указана' : 'Без срока'}
            </Text>
          </TouchableOpacity>
        </View>

        {hasDate && (
          <>
            <View style={styles.dateTimeRow}>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Calendar size={18} color={colors.primary} />
                <Text style={styles.dateText}>
                  {date.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </Text>
              </TouchableOpacity>

              <View style={styles.timeRow}>
                <Clock size={18} color={colors.primary} />
                <View style={styles.timeInputWrapper}>
                  <Input
                    value={hours}
                    onChangeText={formatHoursInput}
                    placeholder="08"
                    keyboardType="numeric"
                    maxLength={2}
                    containerStyle={styles.timeInputContainer}
                    style={styles.timeInput}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 300);
                    }}
                  />
                </View>
                <Text style={styles.timeSeparator}>:</Text>
                <View style={styles.timeInputWrapper}>
                  <Input
                    value={minutes}
                    onChangeText={formatMinutesInput}
                    placeholder="00"
                    keyboardType="numeric"
                    maxLength={2}
                    containerStyle={styles.timeInputContainer}
                    style={styles.timeInput}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 300);
                    }}
                  />
                </View>
              </View>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display="default"
                onChange={onDateChange}
              />
            )}
          </>
        )}

          <View style={styles.buttons}>
            <Button
              title="Отмена"
              variant="ghost"
              onPress={() => router.back()}
              style={{ flex: 1 }}
            />
            <Button
              title={isEditing ? 'Сохранить' : 'Создать'}
              onPress={handleSubmit}
              loading={isLoading}
              disabled={!title.trim()}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: ThemeColors) { return StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: colors.text,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: colors.text,
    letterSpacing: -0.3,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    marginBottom: 10,
    marginTop: 8,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  typeButtonActive: {
    backgroundColor: colors.info,
    borderColor: colors.info,
  },
  typeButtonActiveRequest: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  typeButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  objectSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  objectSelectorPlaceholder: {
    fontSize: 15,
    color: colors.textMuted,
  },
  selectedObjectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  selectedObjectTextWrap: {
    flex: 1,
  },
  selectedObjectName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
  },
  selectedObjectAddr: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  objectSearchContainer: {
    marginBottom: 12,
  },
  objectSearchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  objectSearchInput: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  objectList: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden' as const,
    maxHeight: 200,
  },
  objectItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  objectItemActive: {
    backgroundColor: colors.primary + '20',
  },
  objectItemText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500' as const,
  },
  objectItemTextActive: {
    color: colors.primary,
    fontWeight: '600' as const,
  },
  objectItemAddr: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  createNewObjectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.primary + '10',
    borderBottomWidth: 0,
  },
  dateToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dateToggle: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateToggleActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  dateToggleText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500' as const,
  },
  dateToggleTextActive: {
    color: colors.primary,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceElevated,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500' as const,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceElevated,
    padding: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeInputWrapper: {
    width: 50,
  },
  timeInputContainer: {
    marginBottom: 0,
  },
  timeInput: {
    textAlign: 'center' as const,
    fontSize: 18,
    fontWeight: '600' as const,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  timeSeparator: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: colors.text,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 40,
  },
}); }
