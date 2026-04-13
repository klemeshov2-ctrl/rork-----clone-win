import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Check, X, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useChecklists } from '@/providers/ChecklistsProvider';
import { useObjects } from '@/providers/ObjectsProvider';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ChecklistResultItem } from '@/types';
import { Card } from '@/components/ui/Card';

export default function RunChecklistScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { templateId, objectId: initialObjectId } = useLocalSearchParams();
  const { templates, getTemplate, addResult } = useChecklists();
  const { objects } = useObjects();
  
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(templateId as string || undefined);
  const [selectedObjectId, setSelectedObjectId] = useState<string | undefined>(initialObjectId as string || undefined);

  const template = selectedTemplateId ? getTemplate(selectedTemplateId) : undefined;

  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<Record<string, ChecklistResultItem>>({});
  const [note, setNote] = useState('');

  const [started, setStarted] = useState(!!templateId);

  if (!started || !template) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.selectionContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.selectionTitle}>Запуск чек-листа</Text>

          {!initialObjectId && (
            <>
              <Text style={styles.sectionLabel}>Привязать к объекту</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.objectsScroll}>
                <TouchableOpacity
                  style={[styles.objectChip, !selectedObjectId && styles.objectChipActive]}
                  onPress={() => setSelectedObjectId(undefined)}
                >
                  <Text style={[styles.objectChipText, !selectedObjectId && styles.objectChipTextActive]}>
                    Без объекта
                  </Text>
                </TouchableOpacity>
                {objects.map(obj => (
                  <TouchableOpacity
                    key={obj.id}
                    style={[styles.objectChip, selectedObjectId === obj.id && styles.objectChipActive]}
                    onPress={() => setSelectedObjectId(obj.id)}
                  >
                    <Text style={[styles.objectChipText, selectedObjectId === obj.id && styles.objectChipTextActive]}>
                      {obj.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <Text style={styles.sectionLabel}>Выберите шаблон</Text>
          {templates.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Нет шаблонов. Создайте первый.</Text>
            </View>
          ) : (
            templates.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.templateItem, selectedTemplateId === t.id && styles.templateItemActive]}
                onPress={() => setSelectedTemplateId(t.id)}
              >
                <Text style={styles.templateItemName}>{t.name}</Text>
                <Text style={styles.templateItemCount}>{t.items.length} пунктов</Text>
              </TouchableOpacity>
            ))
          )}

          <View style={styles.startButtons}>
            <Button
              title="Отмена"
              variant="ghost"
              onPress={() => router.back()}
              style={{ flex: 1 }}
            />
            <Button
              title="Начать"
              onPress={() => setStarted(true)}
              disabled={!selectedTemplateId}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  const currentItem = template.items[currentIndex];
  const currentResult = results[currentItem.id];
  const progress = ((currentIndex + 1) / template.items.length) * 100;

  const handleAnswer = (answer: 'yes' | 'no') => {
    setResults({
      ...results,
      [currentItem.id]: {
        itemId: currentItem.id,
        result: answer,
        note: note || undefined,
      },
    });
    setNote('');
    if (currentIndex < template.items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleComplete = async () => {
    const resultItems = template.items.map(item => ({
      itemId: item.id,
      itemText: item.text,
      result: results[item.id]?.result || null,
      photoPath: results[item.id]?.photoPath,
      note: results[item.id]?.note,
    }));

    await addResult({
      templateId: template.id,
      objectId: selectedObjectId,
      items: resultItems,
      completedAt: Date.now(),

    });

    Alert.alert('Готово!', 'Чек-лист сохранен', [
      { text: 'OK', onPress: () => router.back() }
    ]);
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setNote(results[template.items[currentIndex - 1].id]?.note || '');
    }
  };

  const goNext = () => {
    if (currentIndex < template.items.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setNote(results[template.items[currentIndex + 1].id]?.note || '');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.templateName} numberOfLines={1}>{template.name}</Text>
        <Text style={styles.progress}>{currentIndex + 1} / {template.items.length}</Text>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.questionCard}>
          <Text style={styles.questionNumber}>Пункт {currentIndex + 1}</Text>
          <Text style={styles.questionText}>{currentItem.text}</Text>
          
          <Input
            label="Примечание (опционально)"
            value={note}
            onChangeText={setNote}
            placeholder="Дополнительная информация..."
            multiline
            numberOfLines={2}
            containerStyle={{ marginBottom: 0, marginTop: 12 }}
          />
        </Card>


      </ScrollView>

      <View style={styles.navigation}>
        <TouchableOpacity 
          style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
          onPress={goBack}
          disabled={currentIndex === 0}
        >
          <ChevronLeft size={24} color={currentIndex === 0 ? colors.textMuted : colors.text} />
        </TouchableOpacity>

        <View style={styles.answerButtons}>
          <TouchableOpacity 
            style={[styles.answerButton, styles.noButton, currentResult?.result === 'no' && styles.noButtonActive]}
            onPress={() => handleAnswer('no')}
          >
            <X size={28} color={colors.text} />
            <Text style={styles.answerText}>Нет</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.answerButton, styles.yesButton, currentResult?.result === 'yes' && styles.yesButtonActive]}
            onPress={() => handleAnswer('yes')}
          >
            <Check size={28} color={colors.text} />
            <Text style={styles.answerText}>Да</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.navButton, currentIndex === template.items.length - 1 && styles.navButtonDisabled]}
          onPress={goNext}
          disabled={currentIndex === template.items.length - 1}
        >
          <ChevronRight size={24} color={currentIndex === template.items.length - 1 ? colors.textMuted : colors.text} />
        </TouchableOpacity>
      </View>

      {Object.keys(results).length === template.items.length && (
        <View style={styles.completeContainer}>
          <Button title="Завершить" onPress={handleComplete} size="large" />
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  selectionContent: {
    flex: 1,
    padding: 16,
  },
  selectionTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: colors.text,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: colors.textSecondary,
    marginBottom: 12,
    marginTop: 8,
  },
  objectsScroll: {
    marginBottom: 20,
  },
  objectChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  objectChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  objectChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  objectChipTextActive: {
    color: colors.text,
  },
  templateItem: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  templateItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '20',
  },
  templateItemName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  templateItemCount: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  startButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
    marginBottom: 40,
  },
  emptyContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  templateName: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
    flex: 1,
  },
  progress: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.surfaceElevated,
    marginHorizontal: 16,
    borderRadius: 2,
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  questionCard: {
    marginBottom: 16,
  },
  questionNumber: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  questionText: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: colors.text,
    lineHeight: 28,
    marginBottom: 16,
  },


  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  answerButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  answerButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  yesButton: {
    backgroundColor: colors.success,
  },
  yesButtonActive: {
    borderWidth: 4,
    borderColor: colors.text,
  },
  noButton: {
    backgroundColor: colors.error,
  },
  noButtonActive: {
    borderWidth: 4,
    borderColor: colors.text,
  },
  answerText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  completeContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  errorText: {
    color: colors.error,
    fontSize: 16,
    textAlign: 'center' as const,
    marginTop: 40,
  },
}); }
