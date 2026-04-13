import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, SectionList, FlatList, TouchableOpacity, Alert, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Bell, Wrench, Check, Clock, AlertTriangle, ChevronDown, ChevronUp, Archive, Trash2, Building2, ClipboardList, Pencil } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useTasks } from '@/providers/TasksProvider';
import { useObjects } from '@/providers/ObjectsProvider';
import { useChecklists } from '@/providers/ChecklistsProvider';
import { Task, ChecklistTemplate } from '@/types';
import { Card } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';
import * as Haptics from 'expo-haptics';
import { NotificationBell } from '@/components/NotificationBell';
import { useComments } from '@/providers/CommentsProvider';
import { CommentsBottomSheet } from '@/components/CommentsBottomSheet';
import { MessageCircle } from 'lucide-react-native';

type TabKey = 'tasks' | 'checklists';

function SegmentedControl({ activeTab, onTabChange, colors }: { activeTab: TabKey; onTabChange: (tab: TabKey) => void; colors: ThemeColors }) {
  const indicatorAnim = useRef(new Animated.Value(activeTab === 'tasks' ? 0 : 1)).current;

  const handlePress = useCallback((tab: TabKey) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(indicatorAnim, {
      toValue: tab === 'tasks' ? 0 : 1,
      useNativeDriver: false,
      tension: 300,
      friction: 30,
    }).start();
    onTabChange(tab);
  }, [onTabChange, indicatorAnim]);

  const indicatorLeft = indicatorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['2%', '50%'],
  });

  return (
    <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: colors.surface, borderRadius: 12, padding: 3, flexDirection: 'row', position: 'relative' as const }}>
      <Animated.View style={{ position: 'absolute', top: 3, bottom: 3, left: indicatorLeft, width: '48%', backgroundColor: colors.primary, borderRadius: 10 }} />
      <TouchableOpacity style={{ flex: 1, paddingVertical: 10, alignItems: 'center' as const, flexDirection: 'row', justifyContent: 'center' as const, gap: 6, zIndex: 1 }} onPress={() => handlePress('tasks')}>
        <Bell size={15} color={activeTab === 'tasks' ? '#fff' : colors.textMuted} />
        <Text style={{ fontSize: 14, fontWeight: '600' as const, color: activeTab === 'tasks' ? '#fff' : colors.textMuted }}>Задачи</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ flex: 1, paddingVertical: 10, alignItems: 'center' as const, flexDirection: 'row', justifyContent: 'center' as const, gap: 6, zIndex: 1 }} onPress={() => handlePress('checklists')}>
        <ClipboardList size={15} color={activeTab === 'checklists' ? '#fff' : colors.textMuted} />
        <Text style={{ fontSize: 14, fontWeight: '600' as const, color: activeTab === 'checklists' ? '#fff' : colors.textMuted }}>Чек-листы</Text>
      </TouchableOpacity>
    </View>
  );
}

function getShortPreview(text: string, wordCount: number = 3): string {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  const preview = words.slice(0, wordCount).join(' ');
  return words.length > wordCount ? preview + '...' : preview;
}

function TaskCard({ task, objectName, onComplete, onPress, onDelete, onComments, lastComment, commentCount, colors }: {
  task: Task; objectName?: string; onComplete: () => void; onPress: () => void; onDelete: () => void; onComments: () => void; lastComment?: string; commentCount: number; colors: ThemeColors;
}) {
  const isOverdue = task.dueDate != null && task.dueDate < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime() && !task.isCompleted;
  const hasNoDate = !task.dueDate;
  const isRequest = task.type === 'request';
  const handleCheckPress = useCallback(() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onComplete(); }, [onComplete]);

  return (
    <Card style={{ marginBottom: 10, padding: 14, borderLeftWidth: 0, borderColor: isOverdue ? colors.error + '40' : undefined }} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <TouchableOpacity
          style={[{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 2 }, task.isCompleted && { backgroundColor: colors.success, borderColor: colors.success }]}
          onPress={handleCheckPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {task.isCompleted && <Check size={14} color="#fff" strokeWidth={3} />}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }, isRequest ? { backgroundColor: colors.warning + '18' } : { backgroundColor: colors.info + '18' }]}>
              {isRequest ? <Wrench size={11} color={colors.warning} /> : <Bell size={11} color={colors.info} />}
              <Text style={{ fontSize: 11, fontWeight: '600' as const, color: isRequest ? colors.warning : colors.info }}>{isRequest ? 'Заявка' : 'Напомин.'}</Text>
            </View>
            {isOverdue && <View style={{ padding: 2 }}><AlertTriangle size={12} color={colors.error} /></View>}
          </View>
          <Text style={[{ fontSize: 15, fontWeight: '600' as const, color: colors.text, lineHeight: 20 }, task.isCompleted && { textDecorationLine: 'line-through' as const, color: colors.textMuted }]} numberOfLines={2}>{task.title}</Text>
          {task.description ? <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 3 }} numberOfLines={1}>{task.description}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap' as const }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Clock size={12} color={isOverdue ? colors.error : colors.textMuted} />
              <Text style={[{ fontSize: 12, color: colors.textMuted }, isOverdue && { color: colors.error, fontWeight: '600' as const }]}>{hasNoDate ? 'Без срока' : (task.dueTime ? `${formatDate(task.dueDate!)}, ${task.dueTime}` : formatDate(task.dueDate!))}</Text>
            </View>
            {objectName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 160 }}>
                <Building2 size={12} color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '500' as const }} numberOfLines={1}>{objectName}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <TouchableOpacity style={{ padding: 6, marginTop: 2 }} onPress={(e) => { e.stopPropagation?.(); onDelete(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Trash2 size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={onComments} activeOpacity={0.7} style={{ flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 8, marginHorizontal: -14, paddingHorizontal: 14 }}>
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
        <ChevronDown size={14} color={colors.textMuted} style={{ transform: [{ rotate: '-90deg' }] }} />
      </TouchableOpacity>
    </Card>
  );
}

function TemplateCard({ template, onEdit, onDelete, colors }: {
  template: ChecklistTemplate; onEdit: () => void; onDelete: () => void; colors: ThemeColors;
}) {
  return (
    <Card style={{ marginBottom: 10, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + '15', alignItems: 'center' as const, justifyContent: 'center' as const }}>
          <ClipboardList size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '600' as const, color: colors.text }}>{template.name}</Text>
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{template.items.length} пунктов</Text>
        </View>
        <TouchableOpacity onPress={onEdit} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceElevated, alignItems: 'center' as const, justifyContent: 'center' as const, marginLeft: 6 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Pencil size={15} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceElevated, alignItems: 'center' as const, justifyContent: 'center' as const, marginLeft: 6 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Trash2 size={15} color={colors.error} />
        </TouchableOpacity>
      </View>
    </Card>
  );
}

interface SectionData { title: string; data: Task[]; color: string; icon: React.ReactNode; }

function TasksTab({ colors }: { colors: ThemeColors }) {
  const router = useRouter();
  const { isLoading, completeTask, uncompleteTask, deleteTask, getOverdueTasks, getTodayTasks, getTomorrowTasks, getLaterTasks, getCompletedTasks, getNoDateTasks } = useTasks();
  const { getObject } = useObjects();
  const { comments: commentsRaw, loadComments } = useComments();
  const [showCompleted, setShowCompleted] = useState(false);
  const [commentsTaskId, setCommentsTaskId] = useState<string>('');
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);

  const overdue = useMemo(() => getOverdueTasks(), [getOverdueTasks]);
  const today = useMemo(() => getTodayTasks(), [getTodayTasks]);
  const tomorrow = useMemo(() => getTomorrowTasks(), [getTomorrowTasks]);
  const later = useMemo(() => getLaterTasks(), [getLaterTasks]);
  const noDate = useMemo(() => getNoDateTasks(), [getNoDateTasks]);
  const completed = useMemo(() => getCompletedTasks(), [getCompletedTasks]);

  const sections: SectionData[] = useMemo(() => {
    const s: SectionData[] = [];
    if (overdue.length > 0) s.push({ title: `Просрочено (${overdue.length})`, data: overdue, color: colors.error, icon: <AlertTriangle size={16} color={colors.error} /> });
    if (today.length > 0) s.push({ title: `Сегодня (${today.length})`, data: today, color: colors.primary, icon: <Clock size={16} color={colors.primary} /> });
    if (tomorrow.length > 0) s.push({ title: `Завтра (${tomorrow.length})`, data: tomorrow, color: colors.info, icon: <Clock size={16} color={colors.info} /> });
    if (later.length > 0) s.push({ title: `Позже (${later.length})`, data: later, color: colors.textSecondary, icon: <Clock size={16} color={colors.textSecondary} /> });
    if (noDate.length > 0) s.push({ title: `Без срока (${noDate.length})`, data: noDate, color: colors.textMuted, icon: <Clock size={16} color={colors.textMuted} /> });
    if (showCompleted && completed.length > 0) s.push({ title: `Выполнено (${completed.length})`, data: completed, color: colors.success, icon: <Check size={16} color={colors.success} /> });
    return s;
  }, [overdue, today, tomorrow, later, noDate, completed, showCompleted, colors]);

  const allTasks = useMemo(() => {
    return [...getOverdueTasks(), ...getTodayTasks(), ...getTomorrowTasks(), ...getLaterTasks(), ...getNoDateTasks(), ...getCompletedTasks()];
  }, [getOverdueTasks, getTodayTasks, getTomorrowTasks, getLaterTasks, getNoDateTasks, getCompletedTasks]);

  React.useEffect(() => {
    allTasks.forEach(t => { loadComments('task', t.id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks.length]);

  const taskCommentsMap = useMemo(() => {
    const map: Record<string, { count: number; lastText: string }> = {};
    for (const key of Object.keys(commentsRaw)) {
      if (key.startsWith('task:')) {
        const arr = commentsRaw[key];
        if (arr && arr.length > 0) {
          map[key] = { count: arr.length, lastText: arr[arr.length - 1].text };
        }
      }
    }
    return map;
  }, [commentsRaw]);

  const handleComplete = useCallback((task: Task) => { if (task.isCompleted) void uncompleteTask(task.id); else void completeTask(task.id); }, [completeTask, uncompleteTask]);
  const handlePress = useCallback((task: Task) => { if (task.type === 'request' && task.objectId) router.push({ pathname: '/(home)/object-detail' as any, params: { id: task.objectId } }); else router.push({ pathname: '/reminders/create', params: { editId: task.id } }); }, [router]);
  const handleDelete = useCallback((task: Task) => { Alert.alert('Удалить задачу?', 'Это действие нельзя отменить', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => deleteTask(task.id) }]); }, [deleteTask]);
  const handleComments = useCallback((taskId: string) => { setCommentsTaskId(taskId); setCommentsModalVisible(true); }, []);

  const activeCount = overdue.length + today.length + tomorrow.length + later.length + noDate.length;

  if (isLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>Загрузка...</Text></View>;
  }

  if (activeCount === 0 && completed.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceElevated, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 16 }}>
          <Bell size={36} color={colors.textMuted} />
        </View>
        <Text style={{ fontSize: 18, fontWeight: '700' as const, color: colors.text, marginBottom: 6 }}>Нет задач</Text>
        <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' as const, lineHeight: 20, marginBottom: 24 }}>Создайте напоминание или заявку</Text>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 }} onPress={() => router.push('/reminders/create')}>
          <Plus size={18} color="#fff" />
          <Text style={{ fontSize: 15, fontWeight: '600' as const, color: '#fff' }}>Создать задачу</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderSectionHeader={({ section }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 10, paddingHorizontal: 4 }}>
          {section.icon}
          <Text style={{ fontSize: 13, fontWeight: '700' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const, color: section.color }}>{section.title}</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const obj = item.objectId ? getObject(item.objectId) : undefined;
        const displayObjName = obj?.name || item.objectName;
        const cInfo = taskCommentsMap[`task:${item.id}`];
        return <TaskCard task={item} objectName={displayObjName} onComplete={() => handleComplete(item)} onPress={() => handlePress(item)} onDelete={() => handleDelete(item)} onComments={() => handleComments(item.id)} lastComment={cInfo?.lastText} commentCount={cInfo?.count || 0} colors={colors} />;
      }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      ListFooterComponent={completed.length > 0 ? (
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginTop: 8 }} onPress={() => setShowCompleted(!showCompleted)}>
          <Archive size={16} color={colors.textMuted} />
          <Text style={{ fontSize: 14, color: colors.textMuted, fontWeight: '500' as const }}>Выполненные ({completed.length})</Text>
          {showCompleted ? <ChevronUp size={16} color={colors.textMuted} /> : <ChevronDown size={16} color={colors.textMuted} />}
        </TouchableOpacity>
      ) : null}
    />
    <CommentsBottomSheet
      visible={commentsModalVisible}
      onClose={() => setCommentsModalVisible(false)}
      entityType="task"
      entityId={commentsTaskId}
      title="Комментарии к задаче"
    />
    </>
  );
}

function ChecklistsTab({ colors }: { colors: ThemeColors }) {
  const router = useRouter();
  const { templates, isLoading, deleteTemplate } = useChecklists();

  const handleDelete = useCallback((id: string, name: string) => {
    Alert.alert('Удалить шаблон?', `"${name}" будет удалён`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteTemplate(id) },
    ]);
  }, [deleteTemplate]);

  const handleEdit = useCallback((templateId: string) => {
    router.push({ pathname: '/checklist/create', params: { editTemplateId: templateId } });
  }, [router]);

  if (isLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>Загрузка...</Text></View>;
  }

  return (
    <FlatList
      data={templates}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TemplateCard template={item} onEdit={() => handleEdit(item.id)} onDelete={() => handleDelete(item.id, item.name)} colors={colors} />
      )}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12, lineHeight: 18 }}>Шаблоны чек-листов. Выполнение ТО — в карточке объекта.</Text>
      }
      ListEmptyComponent={
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 10 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceElevated, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 8 }}>
            <ClipboardList size={36} color={colors.textMuted} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '700' as const, color: colors.text }}>Нет шаблонов</Text>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>Создайте свой первый чек-лист</Text>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginTop: 12 }} onPress={() => router.push('/checklist/create')}>
            <Plus size={18} color="#fff" />
            <Text style={{ fontSize: 15, fontWeight: '600' as const, color: '#fff' }}>Создать шаблон</Text>
          </TouchableOpacity>
        </View>
      }
    />
  );
}

export default function TasksScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [activeTab, setActiveTab] = useState<TabKey>('tasks');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { getOverdueTasks, getTodayTasks, getTomorrowTasks, getLaterTasks, getNoDateTasks } = useTasks();
  const overdue = useMemo(() => getOverdueTasks(), [getOverdueTasks]);
  const today = useMemo(() => getTodayTasks(), [getTodayTasks]);
  const tomorrow = useMemo(() => getTomorrowTasks(), [getTomorrowTasks]);
  const later = useMemo(() => getLaterTasks(), [getLaterTasks]);
  const noDateCount = useMemo(() => getNoDateTasks(), [getNoDateTasks]);
  const activeCount = overdue.length + today.length + tomorrow.length + later.length + noDateCount.length;

  const handleAdd = useCallback(() => {
    if (activeTab === 'tasks') {
      router.push('/reminders/create');
    } else {
      router.push('/checklist/create');
    }
  }, [activeTab, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Задачи</Text>
        </View>
        <NotificationBell />
      </View>

      <View style={styles.actionRow}>
        <Text style={{ fontSize: 13, color: colors.textMuted, flex: 1 }}>
          {activeTab === 'tasks'
            ? (activeCount > 0 ? `${activeCount} активных` : 'Нет активных задач')
            : 'Шаблоны чек-листов'}
        </Text>
        <TouchableOpacity style={styles.addButton} onPress={handleAdd} testID="add-task-btn">
          <Plus size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <SegmentedControl activeTab={activeTab} onTabChange={setActiveTab} colors={colors} />

      {activeTab === 'tasks' ? (
        <TasksTab colors={colors} />
      ) : (
        <ChecklistsTab colors={colors} />
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
    actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
    title: { fontSize: 28, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
    addButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  });
}
