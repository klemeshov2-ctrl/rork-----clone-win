import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, Platform, TextInput, KeyboardAvoidingView, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, X, MessageSquare, Camera, ClipboardList, ChevronDown, ChevronUp, Pencil } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useChecklists } from '@/providers/ChecklistsProvider';
import { ZoomableImage } from '@/components/ZoomableImage';
import { formatDateTime } from '@/lib/utils';
import { ChecklistResultItem } from '@/types';
import { Button } from '@/components/ui/Button';

function parseDateTimeInput(dateStr: string, timeStr: string): number | null {
  const dateParts = dateStr.split('.');
  if (dateParts.length !== 3) return null;
  const day = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const year = parseInt(dateParts[2], 10);
  const timeParts = timeStr.split(':');
  const hours = timeParts.length >= 2 ? parseInt(timeParts[0], 10) : 0;
  const minutes = timeParts.length >= 2 ? parseInt(timeParts[1], 10) : 0;
  const d = new Date(year, month, day, hours, minutes);
  if (isNaN(d.getTime())) return null;
  return d.getTime();
}

function formatDateForInput(timestamp: number): string {
  const d = new Date(timestamp);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatTimeForInput(timestamp: number): string {
  const d = new Date(timestamp);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export default function ChecklistResultScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { resultId } = useLocalSearchParams();
  const { getResult, getTemplate, updateResult } = useChecklists();

  const result = getResult(resultId as string);
  const template = result ? getTemplate(result.templateId) : undefined;

  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [editDateVisible, setEditDateVisible] = useState(false);
  const [editDateValue, setEditDateValue] = useState('');
  const [editTimeValue, setEditTimeValue] = useState('');

  if (!result) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Результат не найден</Text>
      </View>
    );
  }

  const totalItems = result.items.length;
  const yesCount = result.items.filter(i => i.result === 'yes').length;
  const noCount = result.items.filter(i => i.result === 'no').length;
  const percentage = totalItems > 0 ? Math.round((yesCount / totalItems) * 100) : 0;

  const templateName = template?.name || 'Чек-лист';

  const getItemText = (item: ChecklistResultItem, index: number): string => {
    if (item.itemText) return item.itemText;
    if (template) {
      const templateItem = template.items.find(ti => ti.id === item.itemId);
      if (templateItem) return templateItem.text;
    }
    return `Пункт ${index + 1}`;
  };

  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const hasDetails = (item: ChecklistResultItem) => !!(item.note || item.photoPath);

  const openEditDate = () => {
    setEditDateValue(formatDateForInput(result.completedAt));
    setEditTimeValue(formatTimeForInput(result.completedAt));
    setEditDateVisible(true);
  };

  const submitEditDate = async () => {
    const ts = parseDateTimeInput(editDateValue, editTimeValue);
    if (!ts) {
      Alert.alert('Ошибка', 'Неверный формат даты или времени');
      return;
    }
    try {
      await updateResult(result.id, { completedAt: ts });
      setEditDateVisible(false);
    } catch {
      Alert.alert('Ошибка', 'Не удалось обновить дату');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <ClipboardList size={28} color={colors.primary} />
          </View>
          <Text style={styles.summaryTitle}>{templateName}</Text>
          <TouchableOpacity style={styles.dateRow} onPress={openEditDate} activeOpacity={0.7}>
            <Text style={styles.summaryDate}>{formatDateTime(result.completedAt)}</Text>
            <Pencil size={14} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <View style={[styles.statDot, { backgroundColor: colors.success }]} />
              <Text style={styles.statNumber}>{yesCount}</Text>
              <Text style={styles.statLabel}>Да</Text>
            </View>
            <View style={styles.statBlock}>
              <View style={[styles.statDot, { backgroundColor: colors.error }]} />
              <Text style={styles.statNumber}>{noCount}</Text>
              <Text style={styles.statLabel}>Нет</Text>
            </View>
            <View style={styles.statBlock}>
              <View style={[styles.statDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.statNumber}>{percentage}%</Text>
              <Text style={styles.statLabel}>Итого</Text>
            </View>
          </View>

          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${percentage}%` }]} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Результаты по пунктам</Text>

        {result.items.map((item, index) => {
          const itemText = getItemText(item, index);
          const expanded = expandedItems[item.itemId] ?? false;
          const details = hasDetails(item);

          return (
            <TouchableOpacity
              key={item.itemId}
              style={styles.itemCard}
              onPress={() => details && toggleExpand(item.itemId)}
              activeOpacity={details ? 0.7 : 1}
            >
              <View style={styles.itemHeader}>
                <View style={[
                  styles.resultBadge,
                  item.result === 'yes' && styles.resultYes,
                  item.result === 'no' && styles.resultNo,
                  !item.result && styles.resultNull,
                ]}>
                  {item.result === 'yes' ? (
                    <Check size={16} color="#fff" />
                  ) : item.result === 'no' ? (
                    <X size={16} color="#fff" />
                  ) : (
                    <Text style={styles.resultNullText}>—</Text>
                  )}
                </View>
                <View style={styles.itemContent}>
                  <Text style={styles.itemIndex}>Пункт {index + 1}</Text>
                  <Text style={styles.itemText}>{itemText}</Text>
                  <View style={styles.itemMeta}>
                    <Text style={[
                      styles.itemAnswer,
                      item.result === 'yes' && { color: colors.success },
                      item.result === 'no' && { color: colors.error },
                    ]}>
                      {item.result === 'yes' ? 'Да' : item.result === 'no' ? 'Нет' : 'Не отвечено'}
                    </Text>
                    {item.note && (
                      <View style={styles.metaIcon}>
                        <MessageSquare size={12} color={colors.textMuted} />
                      </View>
                    )}
                    {item.photoPath && (
                      <View style={styles.metaIcon}>
                        <Camera size={12} color={colors.textMuted} />
                      </View>
                    )}
                  </View>
                </View>
                {details && (
                  <View style={styles.expandIcon}>
                    {expanded ? (
                      <ChevronUp size={20} color={colors.textMuted} />
                    ) : (
                      <ChevronDown size={20} color={colors.textMuted} />
                    )}
                  </View>
                )}
              </View>

              {expanded && (
                <View style={styles.itemDetails}>
                  {item.note && (
                    <View style={styles.noteBlock}>
                      <MessageSquare size={14} color={colors.secondary} />
                      <Text style={styles.noteText}>{item.note}</Text>
                    </View>
                  )}
                  {item.photoPath && (
                    <TouchableOpacity
                      onPress={() => setViewingPhoto(item.photoPath!)}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri: item.photoPath }} style={styles.photoThumb} />
                      <Text style={styles.photoHint}>Нажмите для увеличения</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={!!viewingPhoto}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setViewingPhoto(null)}
      >
        <SafeAreaView style={styles.viewerContainer}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle}>Фото</Text>
            <TouchableOpacity onPress={() => setViewingPhoto(null)} style={styles.viewerClose}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          {viewingPhoto && (
            <ZoomableImage uri={viewingPhoto} />
          )}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={editDateVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditDateVisible(false)}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Редактировать дату</Text>
            <Text style={styles.fieldLabel}>Дата (ДД.ММ.ГГГГ)</Text>
            <TextInput
              style={styles.modalInput}
              value={editDateValue}
              onChangeText={setEditDateValue}
              placeholder="01.01.2025"
              placeholderTextColor={colors.textMuted}
              keyboardType="default"
              autoFocus
            />
            <Text style={styles.fieldLabel}>Время (ЧЧ:ММ)</Text>
            <TextInput
              style={styles.modalInput}
              value={editTimeValue}
              onChangeText={setEditTimeValue}
              placeholder="12:00"
              placeholderTextColor={colors.textMuted}
              keyboardType="default"
            />
            <View style={styles.modalButtons}>
              <Button
                title="Отмена"
                variant="ghost"
                onPress={() => setEditDateVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Сохранить"
                onPress={submitEditDate}
                disabled={!editDateValue.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
  },
  summaryCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: colors.text,
    textAlign: 'center' as const,
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  summaryDate: {
    fontSize: 14,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 16,
  },
  statBlock: {
    alignItems: 'center',
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 6,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  itemCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  resultBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  resultYes: {
    backgroundColor: colors.success,
  },
  resultNo: {
    backgroundColor: colors.error,
  },
  resultNull: {
    backgroundColor: colors.surface,
  },
  resultNullText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  itemContent: {
    flex: 1,
  },
  itemIndex: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    marginBottom: 2,
  },
  itemText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: colors.text,
    lineHeight: 21,
    marginBottom: 4,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemAnswer: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: colors.textMuted,
  },
  metaIcon: {
    opacity: 0.7,
  },
  expandIcon: {
    marginLeft: 8,
    marginTop: 4,
  },
  itemDetails: {
    marginTop: 12,
    marginLeft: 44,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  noteBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  photoThumb: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  photoHint: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center' as const,
    marginTop: 6,
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
  },
  viewerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: colors.text,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
}); }
