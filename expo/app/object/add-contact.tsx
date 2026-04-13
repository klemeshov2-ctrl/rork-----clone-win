import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useObjects } from '@/providers/ObjectsProvider';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function AddContactScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { objectId, editContactId } = useLocalSearchParams();
  const { addContact, updateContact, getContactsByObject } = useObjects();
  
  const isEditing = !!editContactId;
  const existingContact = isEditing 
    ? getContactsByObject(objectId as string).find(c => c.id === editContactId)
    : undefined;

  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (existingContact) {
      setFullName(existingContact.fullName);
      setPosition(existingContact.position);
      setPhone(existingContact.phone);
      setEmail(existingContact.email || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingContact?.id]);

  const handleSubmit = async () => {
    if (!fullName.trim() || !position.trim() || !phone.trim()) {
      Alert.alert('Ошибка', 'Заполните обязательные поля');
      return;
    }

    setIsLoading(true);
    try {
      if (isEditing && editContactId) {
        await updateContact(editContactId as string, {
          fullName: fullName.trim(),
          position: position.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
        });
      } else {
        await addContact(objectId as string, {
          fullName: fullName.trim(),
          position: position.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
        });
      }
      router.back();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить контакт');
    } finally {
      setIsLoading(false);
    }
  };

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
          <Text style={styles.title}>{isEditing ? 'Редактировать контакт' : 'Новый контакт'}</Text>
          
          <Input
            label="ФИО"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Иванов Иван Иванович"
          />
          
          <Input
            label="Должность"
            value={position}
            onChangeText={setPosition}
            placeholder="Главный инженер"
          />
          
          <Input
            label="Телефон"
            value={phone}
            onChangeText={setPhone}
            placeholder="+7 (999) 123-45-67"
            keyboardType="phone-pad"
          />
          
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="email@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          
          <View style={styles.buttons}>
            <Button
              title="Отмена"
              variant="ghost"
              onPress={() => router.back()}
              style={{ flex: 1 }}
            />
            <Button
              title={isEditing ? 'Сохранить' : 'Добавить'}
              onPress={handleSubmit}
              loading={isLoading}
              disabled={!fullName.trim() || !position.trim() || !phone.trim()}
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
  scrollView: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: colors.text,
    marginBottom: 24,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 40,
  },
}); }
