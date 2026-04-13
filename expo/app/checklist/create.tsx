import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, X } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useChecklists } from '@/providers/ChecklistsProvider';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function CreateChecklistScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { editTemplateId } = useLocalSearchParams();
  const { addTemplate, updateTemplate, getTemplate } = useChecklists();

  const isEditing = !!editTemplateId;
  const existingTemplate = isEditing ? getTemplate(editTemplateId as string) : undefined;

  const [name, setName] = useState('');
  const [items, setItems] = useState<string[]>(['']);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (existingTemplate) {
      setName(existingTemplate.name);
      setItems(existingTemplate.items.map(i => i.text));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingTemplate?.id]);

  const addItem = () => {
    setItems([...items, '']);
  };

  const updateItem = (index: number, text: string) => {
    const newItems = [...items];
    newItems[index] = text;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    const validItems = items.filter(i => i.trim());
    if (!name.trim() || validItems.length === 0) {
      Alert.alert('Ошибка', 'Введите название и хотя бы один пункт');
      return;
    }

    setIsLoading(true);
    try {
      if (isEditing && editTemplateId) {
        await updateTemplate(editTemplateId as string, name.trim(), validItems.map(text => ({ text })));
      } else {
        await addTemplate(name.trim(), validItems.map(text => ({ text })));
      }
      router.back();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить шаблон');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={styles.flex} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.title}>{isEditing ? 'Редактировать шаблон' : 'Новый шаблон'}</Text>
        
        <Input
          label="Название чек-листа"
          value={name}
          onChangeText={setName}
          placeholder="Например: ТО пожарных извещателей"
        />

        <Text style={styles.sectionLabel}>Пункты проверки</Text>
        
        {items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <Text style={styles.itemNumber}>{index + 1}.</Text>
            <Input
              value={item}
              onChangeText={(text) => updateItem(index, text)}
              placeholder={`Пункт ${index + 1}`}
              containerStyle={styles.itemInput}
            />
            {items.length > 1 && (
              <TouchableOpacity 
                onPress={() => removeItem(index)}
                style={styles.removeButton}
              >
                <X size={20} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        ))}

        <TouchableOpacity style={styles.addItemButton} onPress={addItem}>
          <Plus size={20} color={colors.primary} />
          <Text style={styles.addItemText}>Добавить пункт</Text>
        </TouchableOpacity>
        
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
            disabled={!name.trim() || items.filter(i => i.trim()).length === 0}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  title: {
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
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  itemNumber: {
    color: colors.textMuted,
    fontSize: 14,
    width: 24,
  },
  itemInput: {
    flex: 1,
    marginBottom: 0,
  },
  removeButton: {
    padding: 8,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 8,
  },
  addItemText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '500' as const,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
    marginBottom: 40,
  },
}); }
