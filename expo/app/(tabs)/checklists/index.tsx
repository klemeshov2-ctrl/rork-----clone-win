import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, ClipboardList, Trash2, Pencil } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useChecklists } from '@/providers/ChecklistsProvider';
import { Card } from '@/components/ui/Card';
import { ChecklistTemplate } from '@/types';

function TemplateCard({ template, onEdit, onDelete, colors }: { 
  template: ChecklistTemplate; 
  onEdit: () => void;
  onDelete: () => void;
  colors: ThemeColors;
}) {
  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const }}>
          <ClipboardList size={24} color={colors.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '600' as const, color: colors.text }}>{template.name}</Text>
          <Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 2 }}>{template.items.length} пунктов</Text>
        </View>
        <TouchableOpacity onPress={onEdit} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const, marginLeft: 6 }}>
          <Pencil size={16} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const, marginLeft: 6 }}>
          <Trash2 size={16} color={colors.error} />
        </TouchableOpacity>
      </View>
    </Card>
  );
}

export default function ChecklistsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { templates, isLoading, deleteTemplate } = useChecklists();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Удалить шаблон?', `"${name}" будет удален`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteTemplate(id) },
    ]);
  };

  const handleEdit = (templateId: string) => {
    router.push({ pathname: '/checklist/create', params: { editTemplateId: templateId } });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Шаблоны</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/checklist/create')}>
          <Plus size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Создавайте шаблоны чек-листов здесь. Выполнение ТО — в карточке объекта.</Text>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={{ color: colors.textSecondary, fontSize: 16 }}>Загрузка...</Text>
        </View>
      ) : (
        <FlatList
          data={templates}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TemplateCard template={item} onEdit={() => handleEdit(item.id)} onDelete={() => handleDelete(item.id, item.name)} colors={colors} />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <ClipboardList size={48} color={colors.textMuted} />
              <Text style={{ fontSize: 16, color: colors.textSecondary }}>Нет шаблонов</Text>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>Создайте свой первый чек-лист</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    title: { fontSize: 28, fontWeight: 'bold' as const, color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 16, marginBottom: 12 },
    addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  });
}
