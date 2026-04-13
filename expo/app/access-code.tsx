import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { KeyRound, ShieldCheck } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { useAccessCode } from '@/providers/AccessCodeProvider';
import { ThemeColors } from '@/constants/colors';

export default function AccessCodeScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { validateCode, isAccessGranted } = useAccessCode();
  const [code, setCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const shakeError = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 15, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -15, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleSubmit = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      Alert.alert('Ошибка', 'Введите код доступа');
      return;
    }
    Keyboard.dismiss();
    setIsValidating(true);
    try {
      const valid = await validateCode(trimmed);
      if (valid) {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      } else {
        shakeError();
        Alert.alert('Ошибка', 'Неверный код доступа');
      }
    } catch {
      Alert.alert('Ошибка', 'Не удалось проверить код');
    } finally {
      setIsValidating(false);
    }
  }, [code, validateCode, router, shakeError]);

  if (isAccessGranted) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Код доступа', headerBackTitle: 'Назад' }} />
        <View style={styles.grantedContainer}>
          <View style={styles.grantedIconCircle}>
            <ShieldCheck size={40} color={colors.success} />
          </View>
          <Text style={styles.grantedTitle}>Доступ активен</Text>
          <Text style={styles.grantedSubtitle}>
            Вы уже ввели код доступа. Чат и комментарии доступны.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonText}>Назад</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Код доступа', headerBackTitle: 'Назад' }} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={styles.iconCircle}>
          <KeyRound size={40} color={colors.primary} />
        </View>

        <Text style={styles.title}>Введите код доступа</Text>
        <Text style={styles.hint}>Код доступа выдаётся мастером</Text>

        <Animated.View style={[styles.inputWrapper, { transform: [{ translateX: shakeAnim }] }]}>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="Код доступа"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            testID="access-code-input"
          />
        </Animated.View>

        <TouchableOpacity
          style={[styles.submitButton, isValidating && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isValidating}
          activeOpacity={0.7}
          testID="access-code-submit"
        >
          {isValidating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Подтвердить</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardAvoid: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingBottom: 40,
    },
    iconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 22,
      fontWeight: '700' as const,
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    hint: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 32,
    },
    inputWrapper: {
      width: '100%',
      marginBottom: 20,
    },
    input: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
      textAlign: 'center',
      letterSpacing: 2,
    },
    submitButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 48,
      width: '100%',
      alignItems: 'center',
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700' as const,
    },
    grantedContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    grantedIconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.success + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    grantedTitle: {
      fontSize: 22,
      fontWeight: '700' as const,
      color: colors.text,
      marginBottom: 8,
    },
    grantedSubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 32,
      lineHeight: 20,
    },
    backButton: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      paddingHorizontal: 48,
    },
    backButtonText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600' as const,
    },
  });
}
