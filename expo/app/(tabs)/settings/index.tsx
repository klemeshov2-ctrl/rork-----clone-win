import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Vibration,
  Animated,
  Modal,
  Alert,
  Switch,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'react-native';
import { Lock, Palette, ChevronRight, Check, LogOut, Delete, RotateCcw, X, HelpCircle, Info, Mail, Cloud, Shield, FileSpreadsheet, User, FileText, Fingerprint, ScanFace, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react-native';
import { NotificationBell } from '@/components/NotificationBell';
import { useRouter } from 'expo-router';
import { useTheme, useThemeColors } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useComments } from '@/providers/CommentsProvider';
import { useAccessCode } from '@/providers/AccessCodeProvider';
import { ThemeColors, AppTheme } from '@/constants/colors';

type PinStep = 'current' | 'new' | 'confirm';

function ThemeCard({ theme, isActive, onSelect, colors }: {
  theme: AppTheme;
  isActive: boolean;
  onSelect: () => void;
  colors: ThemeColors;
}) {
  return (
    <TouchableOpacity
      style={[
        {
          backgroundColor: colors.surfaceElevated,
          borderRadius: 16,
          padding: 16,
          borderWidth: 2,
          borderColor: isActive ? colors.primary : colors.border,
          marginBottom: 12,
        },
      ]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {theme.preview.map((color, i) => (
              <View
                key={i}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: color,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
            ))}
          </View>
          <Text style={{ fontSize: 15, fontWeight: '600' as const, color: colors.text }}>
            {theme.name}
          </Text>
        </View>
        {isActive && (
          <View style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.primary,
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
          }}>
            <Check size={16} color="#fff" strokeWidth={3} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function PinChangeModal({ visible, onClose, colors }: {
  visible: boolean;
  onClose: () => void;
  colors: ThemeColors;
}) {
  const { changePin } = useAuth();
  const [step, setStep] = useState<PinStep>('current');
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const dotScales = useRef([
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]).current;

  const resetState = useCallback(() => {
    setStep('current');
    setPin('');
    setCurrentPin('');
    setNewPin('');
    setError('');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const shakeError = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 15, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -15, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const animateDot = useCallback((index: number) => {
    Animated.sequence([
      Animated.timing(dotScales[index], { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.timing(dotScales[index], { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  }, [dotScales]);

  const handlePinComplete = useCallback(async (completedPin: string) => {
    if (step === 'current') {
      setCurrentPin(completedPin);
      setStep('new');
      setPin('');
    } else if (step === 'new') {
      setNewPin(completedPin);
      setStep('confirm');
      setPin('');
    } else if (step === 'confirm') {
      if (completedPin === newPin) {
        const success = await changePin(currentPin, completedPin);
        if (success) {
          Alert.alert('Готово', 'PIN-код успешно изменён');
          handleClose();
        } else {
          Vibration.vibrate(200);
          shakeError();
          setError('Неверный текущий PIN-код');
          setStep('current');
          setCurrentPin('');
          setNewPin('');
          setPin('');
        }
      } else {
        Vibration.vibrate(200);
        shakeError();
        setError('PIN-коды не совпадают');
        setStep('new');
        setNewPin('');
        setPin('');
      }
    }
  }, [step, newPin, currentPin, changePin, handleClose, shakeError]);

  const handleNumberPress = useCallback((num: string) => {
    if (pin.length < 4) {
      const newPinVal = pin + num;
      setPin(newPinVal);
      setError('');
      animateDot(newPinVal.length - 1);
      if (newPinVal.length === 4) {
        setTimeout(() => handlePinComplete(newPinVal), 200);
      }
    }
  }, [pin, animateDot, handlePinComplete]);

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  }, []);

  const subtitle = step === 'current'
    ? 'Введите текущий PIN'
    : step === 'new'
      ? 'Введите новый PIN'
      : 'Повторите новый PIN';

  const modalStyles = createModalStyles(colors);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={modalStyles.overlay}>
        <SafeAreaView style={modalStyles.container}>
          <View style={modalStyles.header}>
            <TouchableOpacity onPress={handleClose} style={modalStyles.closeBtn}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={modalStyles.headerTitle}>Изменить PIN</Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={modalStyles.content}>
            <Text style={modalStyles.subtitle}>{subtitle}</Text>

            <Animated.View style={[modalStyles.pinDisplay, { transform: [{ translateX: shakeAnim }] }]}>
              {[0, 1, 2, 3].map(i => (
                <Animated.View
                  key={i}
                  style={[
                    modalStyles.pinDot,
                    pin.length > i && modalStyles.pinDotFilled,
                    { transform: [{ scale: dotScales[i] }] },
                  ]}
                />
              ))}
            </Animated.View>

            {error ? <Text style={modalStyles.error}>{error}</Text> : <View style={{ height: 20, marginBottom: 20 }} />}

            <View style={modalStyles.keypad}>
              {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((row, rowIndex) => (
                <View key={rowIndex} style={modalStyles.keypadRow}>
                  {row.map(num => (
                    <TouchableOpacity
                      key={num}
                      style={modalStyles.keypadButton}
                      onPress={() => handleNumberPress(num)}
                      activeOpacity={0.6}
                    >
                      <Text style={modalStyles.keypadNumber}>{num}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
              <View style={modalStyles.keypadRow}>
                <TouchableOpacity style={modalStyles.keypadButton} onPress={resetState} activeOpacity={0.6}>
                  <RotateCcw size={22} color={colors.primary} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity style={modalStyles.keypadButton} onPress={() => handleNumberPress('0')} activeOpacity={0.6}>
                  <Text style={modalStyles.keypadNumber}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity style={modalStyles.keypadButton} onPress={handleDelete} activeOpacity={0.6}>
                  <Delete size={24} color={colors.textSecondary} strokeWidth={1.8} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export default function SettingsScreen() {
  const colors = useThemeColors();
  const { themeId, setTheme, themes } = useTheme();
  const { logout, pinEnabled, togglePinEnabled, hasPin, biometricAvailable, biometricEnabled, biometricType, toggleBiometric } = useAuth();
  const { displayName, setDisplayName } = useComments();
  const { isAccessGranted, revokeAccess } = useAccessCode();
  const router = useRouter();
  const [showPinChange, setShowPinChange] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [nameEditing, setNameEditing] = useState(false);

  useEffect(() => {
    setNameInput(displayName);
  }, [displayName]);

  const handleSaveName = useCallback(async () => {
    const trimmed = nameInput.trim();
    await setDisplayName(trimmed);
    setNameEditing(false);
    if (trimmed) {
      Alert.alert('Сохранено', `Имя "${trimmed}" будет отображаться в комментариях`);
    }
  }, [nameInput, setDisplayName]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleLogout = useCallback(() => {
    Alert.alert('Выход', 'Вы будете перенаправлены на экран ввода PIN-кода', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => logout() },
    ]);
  }, [logout]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Настройки</Text>
        <NotificationBell />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        <Text style={styles.sectionTitle}>{'ПРОФИЛЬ'}</Text>
        <View style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: colors.info + '20' }]}>
            <User size={20} color={colors.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Отображаемое имя</Text>
            <Text style={styles.settingDesc}>Будет видно в комментариях вместо email</Text>
            <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 8, gap: 8 }}>
              <TextInput
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontSize: 14,
                  color: colors.text,
                  borderWidth: 1,
                  borderColor: nameEditing ? colors.primary : colors.border,
                }}
                value={nameInput}
                onChangeText={(t) => { setNameInput(t); setNameEditing(true); }}
                placeholder="Введите имя..."
                placeholderTextColor={colors.textMuted}
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
              />
              {nameEditing && (
                <TouchableOpacity
                  onPress={handleSaveName}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' as const }}>Сохранить</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{'ДАННЫЕ'}</Text>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => router.push('/backup' as any)}
          activeOpacity={0.7}
        >
          <View style={[styles.settingIcon, { backgroundColor: '#9C27B0' + '20' }]}>
            <Cloud size={20} color="#9C27B0" />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Синхронизация и подписки</Text>
            <Text style={styles.settingDesc}>Яндекс.Диск, бэкапы, подписки на мастеров</Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => router.push('/excel' as any)}
          activeOpacity={0.7}
        >
          <View style={[styles.settingIcon, { backgroundColor: '#1B8A5A' + '20' }]}>
            <FileSpreadsheet size={20} color="#1B8A5A" />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Экспорт / Импорт</Text>
            <Text style={styles.settingDesc}>Excel-файлы</Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>{'ДОСТУП'}</Text>
        {isAccessGranted ? (
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: colors.success + '20' }]}>
              <ShieldCheck size={20} color={colors.success} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Доступ активен</Text>
              <Text style={styles.settingDesc}>Чат и комментарии доступны</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'Сброс доступа',
                  'Вы потеряете доступ к чату и комментариям. Для восстановления потребуется ввести код заново.',
                  [
                    { text: 'Отмена', style: 'cancel' },
                    { text: 'Сбросить', style: 'destructive', onPress: () => revokeAccess() },
                  ]
                );
              }}
              style={{
                backgroundColor: colors.error + '15',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
              activeOpacity={0.7}
            >
              <Text style={{ color: colors.error, fontSize: 13, fontWeight: '600' as const }}>Сбросить</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => router.push('/access-code' as any)}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: colors.warning + '20' }]}>
              <KeyRound size={20} color={colors.warning} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Ввести код доступа</Text>
              <Text style={styles.settingDesc}>Для чата и комментариев нужен код</Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        <Text style={styles.sectionTitle}>{'БЕЗОПАСНОСТЬ'}</Text>
        {hasPin && (
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: colors.success + '20' }]}>
              <Shield size={20} color={colors.success} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>PIN-код при входе</Text>
              <Text style={styles.settingDesc}>Запрашивать PIN при запуске</Text>
            </View>
            <Switch
              value={pinEnabled}
              onValueChange={togglePinEnabled}
              trackColor={{ false: colors.border, true: colors.success }}
              thumbColor={Platform.OS === 'android' ? colors.text : undefined}
            />
          </View>
        )}
        {hasPin && Platform.OS !== 'web' && (
          <View style={[styles.settingRow, !biometricAvailable && { opacity: 0.5 }]}>
            <View style={[styles.settingIcon, { backgroundColor: '#2196F3' + '20' }]}>
              <Fingerprint size={20} color="#2196F3" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>
                {'Вход по отпечатку пальца'}
              </Text>
              <Text style={styles.settingDesc}>
                {biometricAvailable
                  ? 'Разблокировка отпечатком пальца'
                  : 'Биометрия недоступна на этом устройстве'
                }
              </Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={toggleBiometric}
              disabled={!biometricAvailable}
              trackColor={{ false: colors.border, true: '#2196F3' }}
              thumbColor={Platform.OS === 'android' ? colors.text : undefined}
            />
          </View>
        )}
        <TouchableOpacity style={[styles.settingRow, { marginTop: hasPin ? 0 : 0 }]} onPress={() => setShowPinChange(true)} activeOpacity={0.7}>
          <View style={[styles.settingIcon, { backgroundColor: colors.primary + '20' }]}>
            <Lock size={20} color={colors.primary} />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Изменить PIN-код</Text>
            <Text style={styles.settingDesc}>Установить новый 4-значный PIN</Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>{'ОФОРМЛЕНИЕ'}</Text>
        <View style={styles.themeSection}>
          <View style={styles.themeSectionHeader}>
            <Palette size={20} color={colors.primary} />
            <Text style={styles.themeSectionTitle}>Тема приложения</Text>
          </View>
          {themes.map(theme => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={theme.id === themeId}
              onSelect={() => setTheme(theme.id)}
              colors={colors}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>{'ИНФОРМАЦИЯ'}</Text>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => router.push('/settings/help')}
          activeOpacity={0.7}
        >
          <View style={[styles.settingIcon, { backgroundColor: colors.info + '20' }]}>
            <HelpCircle size={20} color={colors.info} />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Справка</Text>
            <Text style={styles.settingDesc}>Инструкции и описание функций</Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => router.push('/settings/logs' as any)}
          activeOpacity={0.7}
        >
          <View style={[styles.settingIcon, { backgroundColor: colors.warning + '20' }]}>
            <FileText size={20} color={colors.warning} />
          </View>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Журнал ошибок</Text>
            <Text style={styles.settingDesc}>Просмотр логов и предупреждений</Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.appInfoCard}>
          <View style={styles.appInfoIconRow}>
            <Image
              source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/10gmvv4g5zd8evsone5fr.png' }}
              style={styles.appIcon}
            />
            <View style={styles.appInfoHeaderText}>
              <Text style={styles.appInfoName}>Журнал мастера</Text>
              <Text style={styles.appInfoVersion}>v1.3</Text>
            </View>
          </View>
          <View style={styles.appInfoDivider} />
          <View style={styles.appInfoRow}>
            <Mail size={14} color={colors.textMuted} />
            <Text style={styles.appInfoText}>klemeshov2@gmail.com</Text>
          </View>
          <View style={styles.appInfoRow}>
            <Info size={14} color={colors.textMuted} />
            <Text style={styles.appInfoText}>Управление объектами, контроль работ и учёт материалов</Text>
          </View>
        </View>

        <View style={styles.logoutSection}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
            <LogOut size={18} color={colors.error} />
            <Text style={styles.logoutText}>Заблокировать приложение</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <PinChangeModal
        visible={showPinChange}
        onClose={() => setShowPinChange(false)}
        colors={colors}
      />
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 100,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
    },
    title: {
      fontSize: 28,
      fontWeight: '800' as const,
      color: colors.text,
      letterSpacing: -0.3,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.textMuted,
      letterSpacing: 0.8,
      marginBottom: 12,
      marginTop: 8,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      padding: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    settingIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: 12,
    },
    settingInfo: {
      flex: 1,
    },
    settingLabel: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.text,
    },
    settingDesc: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
    },
    themeSection: {
      marginBottom: 24,
    },
    themeSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
    },
    themeSectionTitle: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.text,
    },
    logoutSection: {
      marginTop: 8,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      padding: 16,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.error + '30',
    },
    logoutText: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.error,
    },
    appInfoCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    appInfoIconRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginBottom: 12,
      gap: 14,
    },
    appIcon: {
      width: 56,
      height: 56,
      borderRadius: 14,
    },
    appInfoHeaderText: {
      flex: 1,
      gap: 4,
    },
    appInfoHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      marginBottom: 12,
    },
    appInfoName: {
      fontSize: 18,
      fontWeight: '700' as const,
      color: colors.text,
    },
    appInfoVersion: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.primary,
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      overflow: 'hidden' as const,
    },
    appInfoDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    appInfoRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: 8,
      marginBottom: 8,
    },
    appInfoText: {
      fontSize: 13,
      color: colors.textMuted,
      flex: 1,
      lineHeight: 18,
    },
  });
}

function createModalStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    closeBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600' as const,
      color: colors.text,
    },
    content: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 24,
    },
    subtitle: {
      fontSize: 18,
      fontWeight: '600' as const,
      color: colors.textSecondary,
      marginBottom: 32,
    },
    pinDisplay: {
      flexDirection: 'row' as const,
      gap: 20,
      marginBottom: 28,
    },
    pinDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: 'transparent',
    },
    pinDotFilled: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    error: {
      color: colors.error,
      fontSize: 14,
      marginBottom: 20,
      height: 20,
    },
    keypad: {
      width: '100%',
      maxWidth: 280,
    },
    keypadRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-around',
      marginBottom: 14,
    },
    keypadButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    keypadNumber: {
      fontSize: 26,
      fontWeight: '500' as const,
      color: colors.text,
    },
  });
}
