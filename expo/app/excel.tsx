import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Building2,
  Users,
  Wrench,
  Package,
  ClipboardList,
  ListChecks,
  Bell,
  BookOpen,
} from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useObjects } from '@/providers/ObjectsProvider';
import { useInventory } from '@/providers/InventoryProvider';
import { useChecklists } from '@/providers/ChecklistsProvider';
import { useReminders } from '@/providers/RemindersProvider';
import { useTasks } from '@/providers/TasksProvider';
import { useKnowledge } from '@/providers/KnowledgeProvider';
import { exportToExcel, pickAndParseExcel } from '@/lib/excel';

interface DataStat {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
}

export default function ExcelScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    objects,
    contacts,
    workEntries,
    getObject,
    addObject,
    addContact,
    refreshData: refreshObjects,
  } = useObjects();
  const { items: inventoryItems, addItem: addInventoryItem, refreshData: refreshInventory } = useInventory();
  const { templates, results, refreshData: refreshChecklists } = useChecklists();
  const { reminders, addReminder, refreshData: refreshReminders } = useReminders();
  const { tasks, addTask, refreshData: refreshTasks } = useTasks();
  const { items: knowledgeItems, addItem: addKnowledgeItem, refreshData: refreshKnowledge } = useKnowledge();

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [lastAction, setLastAction] = useState<{ type: 'export' | 'import'; success: boolean; message: string } | null>(null);

  const allContacts = Object.values(contacts).flat();
  const allWorkEntries = Object.values(workEntries).flat();

  const stats: DataStat[] = [
    { icon: <Building2 size={16} color={colors.primary} />, label: 'Объекты', count: objects.length, color: 'rgba(255, 107, 53, 0.12)' },
    { icon: <Users size={16} color={colors.info} />, label: 'Контакты', count: allContacts.length, color: 'rgba(33, 150, 243, 0.12)' },
    { icon: <Wrench size={16} color={colors.secondary} />, label: 'Записи работ', count: allWorkEntries.length, color: 'rgba(78, 205, 196, 0.12)' },
    { icon: <Package size={16} color={colors.warning} />, label: 'Склад', count: inventoryItems.length, color: 'rgba(255, 193, 7, 0.12)' },
    { icon: <ClipboardList size={16} color="#AB47BC" />, label: 'Шаблоны чек-листов', count: templates.length, color: 'rgba(171, 71, 188, 0.12)' },
    { icon: <ClipboardList size={16} color="#7E57C2" />, label: 'Результаты чек-листов', count: results.length, color: 'rgba(126, 87, 194, 0.12)' },
    { icon: <Bell size={16} color={colors.error} />, label: 'Напоминания', count: reminders.length, color: 'rgba(255, 82, 82, 0.12)' },
    { icon: <ListChecks size={16} color={colors.success} />, label: 'Задачи', count: tasks.length, color: 'rgba(76, 175, 80, 0.12)' },
    { icon: <BookOpen size={16} color="#26A69A" />, label: 'База знаний', count: knowledgeItems.length, color: 'rgba(38, 166, 154, 0.12)' },
  ];

  const totalRecords = stats.reduce((sum, s) => sum + s.count, 0);

  const getObjectName = useCallback((id: string): string => {
    const obj = getObject(id);
    return obj?.name || id;
  }, [getObject]);

  const handleExport = async () => {
    setIsExporting(true);
    setLastAction(null);
    try {
      await exportToExcel({
        objects,
        contacts,
        workEntries,
        inventory: inventoryItems,
        checklistTemplates: templates,
        checklistResults: results,
        reminders,
        tasks,
        knowledge: knowledgeItems,
        getObjectName,
      });
      setLastAction({ type: 'export', success: true, message: `Экспортировано ${totalRecords} записей` });
    } catch (error: any) {
      console.error('[Excel] Export error:', error);
      setLastAction({ type: 'export', success: false, message: error?.message || 'Ошибка экспорта' });
      Alert.alert('Ошибка', 'Не удалось экспортировать данные: ' + (error?.message || 'Неизвестная ошибка'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    setLastAction(null);
    try {
      const data = await pickAndParseExcel();
      if (!data) {
        setIsImporting(false);
        return;
      }

      const counts = {
        objects: data.objects.length,
        contacts: data.contacts.length,
        inventory: data.inventory.length,
        reminders: data.reminders.length,
        tasks: data.tasks.length,
        knowledge: data.knowledge.length,
      };

      const total = Object.values(counts).reduce((s, c) => s + c, 0);
      if (total === 0) {
        Alert.alert('Пусто', 'В файле не найдено данных для импорта');
        setIsImporting(false);
        return;
      }

      const summary = [
        counts.objects > 0 ? `Объекты: ${counts.objects}` : '',
        counts.contacts > 0 ? `Контакты: ${counts.contacts}` : '',
        counts.inventory > 0 ? `Склад: ${counts.inventory}` : '',
        counts.reminders > 0 ? `Напоминания: ${counts.reminders}` : '',
        counts.tasks > 0 ? `Задачи: ${counts.tasks}` : '',
        counts.knowledge > 0 ? `Знания: ${counts.knowledge}` : '',
      ].filter(Boolean).join('\n');

      Alert.alert(
        'Импорт данных',
        `Будет добавлено:\n${summary}\n\nСуществующие данные не будут удалены.`,
        [
          { text: 'Отмена', style: 'cancel', onPress: () => setIsImporting(false) },
          {
            text: 'Импортировать',
            onPress: async () => {
              try {
                const objectNameToId: Record<string, string> = {};
                objects.forEach(o => { objectNameToId[o.name] = o.id; });

                for (const obj of data.objects) {
                  if (!objectNameToId[obj.name]) {
                    const created = await addObject(obj.name, obj.address);
                    objectNameToId[obj.name] = created.id;
                  }
                }

                for (const contact of data.contacts) {
                  const objectId = objectNameToId[contact.objectName];
                  if (objectId) {
                    await addContact(objectId, {
                      fullName: contact.fullName,
                      position: contact.position,
                      phone: contact.phone,
                      email: contact.email,
                    });
                  }
                }

                for (const item of data.inventory) {
                  await addInventoryItem({
                    name: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    minQuantity: item.minQuantity,
                  });
                }

                for (const reminder of data.reminders) {
                  await addReminder({
                    title: reminder.title,
                    description: reminder.description,
                    dueDate: reminder.dueDate,
                  });
                }

                for (const task of data.tasks) {
                  await addTask({
                    type: task.type,
                    title: task.title,
                    description: task.description,
                    dueDate: task.dueDate,
                    dueTime: task.dueTime,
                  });
                }

                for (const item of data.knowledge) {
                  await addKnowledgeItem({
                    type: item.type,
                    title: item.title,
                    category: item.category,
                    content: item.content,
                  });
                }

                await Promise.all([
                  refreshObjects(),
                  refreshInventory(),
                  refreshChecklists(),
                  refreshReminders(),
                  refreshTasks(),
                  refreshKnowledge(),
                ]);

                setLastAction({ type: 'import', success: true, message: `Импортировано ${total} записей` });
                Alert.alert('Готово', `Данные успешно импортированы (${total} записей)`);
              } catch (err: any) {
                console.error('[Excel] Import processing error:', err);
                setLastAction({ type: 'import', success: false, message: err?.message || 'Ошибка импорта' });
                Alert.alert('Ошибка', 'Не удалось импортировать данные: ' + (err?.message || ''));
              } finally {
                setIsImporting(false);
              }
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('[Excel] Import error:', error);
      setLastAction({ type: 'import', success: false, message: error?.message || 'Ошибка импорта' });
      Alert.alert('Ошибка', 'Не удалось прочитать файл: ' + (error?.message || ''));
      setIsImporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Экспорт / Импорт' }} />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <View style={styles.heroIcon}>
            <FileSpreadsheet size={36} color="#1B8A5A" />
          </View>
          <Text style={styles.heroTitle}>Excel</Text>
          <Text style={styles.heroSubtitle}>
            Выгрузка и загрузка всех данных{'\n'}в формате .xlsx
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'ДАННЫЕ В ПРИЛОЖЕНИИ'}</Text>
          <View style={styles.statsCard}>
            {stats.map((stat, index) => (
              <View key={index} style={[styles.statRow, index < stats.length - 1 && styles.statRowBorder]}>
                <View style={[styles.statIcon, { backgroundColor: stat.color }]}>
                  {stat.icon}
                </View>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={styles.statCount}>{stat.count}</Text>
              </View>
            ))}
            <View style={styles.statTotalRow}>
              <Text style={styles.statTotalLabel}>Всего записей</Text>
              <Text style={styles.statTotalCount}>{totalRecords}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'ДЕЙСТВИЯ'}</Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleExport}
            disabled={isExporting || totalRecords === 0}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(27, 138, 90, 0.15)' }]}>
              {isExporting ? (
                <ActivityIndicator size="small" color="#1B8A5A" />
              ) : (
                <Download size={22} color="#1B8A5A" />
              )}
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Экспорт в Excel</Text>
              <Text style={styles.actionSubtitle}>
                {totalRecords > 0
                  ? `Выгрузить ${totalRecords} записей в .xlsx файл`
                  : 'Нет данных для экспорта'}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleImport}
            disabled={isImporting}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(33, 150, 243, 0.15)' }]}>
              {isImporting ? (
                <ActivityIndicator size="small" color={colors.info} />
              ) : (
                <Upload size={22} color={colors.info} />
              )}
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Импорт из Excel</Text>
              <Text style={styles.actionSubtitle}>Загрузить данные из .xlsx файла</Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {lastAction && (
          <View style={styles.section}>
            <View style={[
              styles.resultCard,
              { borderColor: lastAction.success ? 'rgba(76, 175, 80, 0.4)' : 'rgba(255, 82, 82, 0.4)' },
            ]}>
              {lastAction.success ? (
                <CheckCircle2 size={20} color={colors.success} />
              ) : (
                <AlertTriangle size={20} color={colors.error} />
              )}
              <View style={styles.resultInfo}>
                <Text style={[styles.resultTitle, { color: lastAction.success ? colors.success : colors.error }]}>
                  {lastAction.type === 'export' ? 'Экспорт' : 'Импорт'}{' '}
                  {lastAction.success ? 'завершён' : 'не удался'}
                </Text>
                <Text style={styles.resultMessage}>{lastAction.message}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Формат файла</Text>
            <Text style={styles.infoText}>
              Каждый тип данных сохраняется на отдельном листе Excel:{'\n'}
              Объекты, Контакты, Записи работ, Склад, Шаблоны чек-листов, Результаты чек-листов, Напоминания, Задачи, База знаний.
            </Text>
            <View style={styles.infoDivider} />
            <Text style={styles.infoTitle}>Импорт</Text>
            <Text style={styles.infoText}>
              При импорте новые записи добавляются к существующим. Дубликаты объектов по имени не создаются — контакты привязываются к существующим объектам.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  heroIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(27, 138, 90, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  statRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  statCount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    minWidth: 28,
    textAlign: 'right',
  },
  statTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surfaceElevated,
  },
  statTotalLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  statTotalCount: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.primary,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
  },
  actionSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
  resultInfo: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  resultMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
}); }
