import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  Cloud,
  CloudOff,
  Download,
  Upload,
  LogOut,
  RefreshCw,
  Shield,
  Clock,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Radio,
  Link2,
  HardDrive,
  ArrowLeftRight,
  Info,
} from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useBackup } from '@/providers/BackupProvider';
import { YandexFile } from '@/lib/yandexDisk';
import { User, RefreshCcw } from 'lucide-react-native';

function formatBackupDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  const size = bytes;
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

function BackupFileItem({ file, onRestore, colors }: { file: YandexFile; onRestore: (id: string) => void; colors: ThemeColors }) {
  return (
    <TouchableOpacity style={{ flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={() => onRestore(file.fileId)}>
      <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, flex: 1 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(78, 205, 196, 0.1)', alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: 12 }}>
          <Clock size={18} color={colors.secondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '500' as const, color: colors.text }}>{formatBackupDate(file.created)}</Text>
          <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{formatFileSize(file.size)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.info }}>Восстановить</Text>
        <ChevronRight size={16} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

export default function BackupScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const {
    isConnected,
    userEmail,
    lastBackupDate,
    autoBackupEnabled,
    isCreatingBackup,
    isRestoring,
    isLoadingBackups,
    backupsList,
    signIn,
    signOut,
    switchAccount,
    createBackup,
    restoreBackup,
    loadBackupsList,
    toggleAutoBackup,
    isInitializing,
  } = useBackup();

  const [showBackups, setShowBackups] = useState(false);

  useEffect(() => {
    if (isConnected && showBackups) {
      void loadBackupsList();
    }
  }, [isConnected, showBackups, loadBackupsList]);

  const handleCreateBackup = async () => {
    try {
      await createBackup();
      Alert.alert('Готово', 'Резервная копия успешно создана');
      if (showBackups) void loadBackupsList();
    } catch (error: any) {
      console.log('[BackupScreen] Create error:', error);
      Alert.alert('Ошибка', error?.message || 'Не удалось создать резервную копию');
    }
  };

  const handleRestore = (fileId: string) => {
    Alert.alert(
      'Восстановление',
      'Все текущие данные будут заменены данными из резервной копии. Продолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Восстановить',
          style: 'destructive',
          onPress: async () => {
            try {
              await restoreBackup(fileId);
              Alert.alert('Готово', 'Данные успешно восстановлены. Перезапустите приложение для применения изменений.');
            } catch (error: any) {
              console.log('[BackupScreen] Restore error:', error);
              Alert.alert('Ошибка', error?.message || 'Не удалось восстановить данные');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Выход',
      'Вы будете отключены от Яндекс.Диска. Локальные данные останутся на устройстве.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: signOut },
      ]
    );
  };

  const handleSwitchAccount = () => {
    Alert.alert(
      'Сменить аккаунт',
      'Настройки мастера (публикация, интервалы, ссылка) будут сброшены, так как они привязаны к конкретному Яндекс.Диску. Подписки на других мастеров сохранятся.\n\nПродолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сменить',
          onPress: async () => {
            try {
              await switchAccount();
            } catch (error: any) {
              console.log('[BackupScreen] Switch account error:', error);
              Alert.alert('Ошибка', error?.message || 'Не удалось сменить аккаунт');
            }
          },
        },
      ]
    );
  };

  if (isInitializing) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Яндекс.Диск' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Яндекс.Диск' }} />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>

        <View style={styles.heroSection}>
          <View style={[styles.heroIcon, { backgroundColor: isConnected ? 'rgba(78, 205, 196, 0.15)' : 'rgba(255, 107, 53, 0.15)' }]}>
            {isConnected ? (
              <Cloud size={36} color={colors.secondary} />
            ) : (
              <CloudOff size={36} color={colors.primary} />
            )}
          </View>
          <Text style={styles.heroTitle}>
            {isConnected ? 'Подключено' : 'Не подключено'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {isConnected
              ? userEmail || 'Яндекс.Диск'
              : 'Данные хранятся только на устройстве'}
          </Text>
        </View>

        {!isConnected ? (
          <>
            <View style={styles.section}>
              <View style={styles.infoCard}>
                <Shield size={20} color={colors.secondary} />
                <Text style={styles.infoText}>
                  Подключите Яндекс.Диск для автоматического резервного копирования.{'\n'}
                  Приложение получит доступ только к своей папке.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.signInButton}
                onPress={signIn}
              >
                <View style={styles.yandexIconWrapper}>
                  <Text style={styles.yandexLetter}>Я</Text>
                </View>
                <Text style={styles.signInButtonText}>Войти с Яндекс</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{'СИНХРОНИЗАЦИЯ МЕЖДУ ПОЛЬЗОВАТЕЛЯМИ'}</Text>
              <View style={styles.explainerCard}>
                <View style={styles.explainerIconRow}>
                  <ArrowLeftRight size={20} color={colors.info} />
                  <Text style={styles.explainerTitle}>Мастер и Подписчик</Text>
                </View>
                <Text style={styles.explainerDesc}>
                  Для обмена данными между устройствами разных пользователей. Мастер публикует данные, подписчики получают обновления.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push('/sync-subscriber')}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(33, 150, 243, 0.15)' }]}>
                  <Link2 size={20} color={colors.info} />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Подписки на мастеров</Text>
                  <Text style={styles.actionSubtitle}>Управление подписками и синхронизация</Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* ===== СИНХРОНИЗАЦИЯ МЕЖДУ ПОЛЬЗОВАТЕЛЯМИ (ВЕРХНЯЯ ЧАСТЬ) ===== */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{'СИНХРОНИЗАЦИЯ МЕЖДУ ПОЛЬЗОВАТЕЛЯМИ'}</Text>
              <View style={styles.explainerCard}>
                <View style={styles.explainerIconRow}>
                  <ArrowLeftRight size={20} color={colors.info} />
                  <Text style={styles.explainerTitle}>Мастер и Подписчик</Text>
                </View>
                <Text style={styles.explainerDesc}>
                  Для обмена данными между устройствами разных пользователей. Мастер публикует свои данные на Яндекс.Диск, а подписчики автоматически получают обновления. Подходит для команд и совместной работы.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push('/sync-master')}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(76, 175, 80, 0.15)' }]}>
                  <Radio size={20} color={colors.success} />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Я — Мастер</Text>
                  <Text style={styles.actionSubtitle}>Публикую данные для других пользователей</Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push('/sync-subscriber')}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(33, 150, 243, 0.15)' }]}>
                  <Link2 size={20} color={colors.info} />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Я — Подписчик</Text>
                  <Text style={styles.actionSubtitle}>Получаю данные от мастера</Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </TouchableOpacity>

              <View style={styles.hintCard}>
                <Info size={16} color={colors.textMuted} />
                <Text style={styles.hintText}>
                  Быстрые действия (обновить, опубликовать) также доступны через иконку облака в правом верхнем углу экрана.
                </Text>
              </View>
            </View>

            {/* ===== РАЗДЕЛИТЕЛЬ ===== */}
            <View style={styles.divider} />

            {/* ===== РЕЗЕРВНОЕ КОПИРОВАНИЕ (НИЖНЯЯ ЧАСТЬ) ===== */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{'РЕЗЕРВНОЕ КОПИРОВАНИЕ'}</Text>
              <View style={styles.explainerCard}>
                <View style={styles.explainerIconRow}>
                  <HardDrive size={20} color={colors.secondary} />
                  <Text style={styles.explainerTitle}>Личный бэкап</Text>
                </View>
                <Text style={styles.explainerDesc}>
                  Полная копия всех ваших данных на Яндекс.Диск. Только для одного пользователя — сохраните и восстановите свои данные при переустановке или смене устройства.
                </Text>
              </View>
            </View>

            {lastBackupDate && (
              <View style={styles.section}>
                <View style={styles.lastBackupCard}>
                  <CheckCircle2 size={18} color={colors.success} />
                  <View style={styles.lastBackupInfo}>
                    <Text style={styles.lastBackupLabel}>Последний бэкап</Text>
                    <Text style={styles.lastBackupDate}>{formatBackupDate(lastBackupDate)}</Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.section}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleCreateBackup}
                disabled={isCreatingBackup}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(78, 205, 196, 0.15)' }]}>
                  {isCreatingBackup ? (
                    <ActivityIndicator size="small" color={colors.secondary} />
                  ) : (
                    <Upload size={20} color={colors.secondary} />
                  )}
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Создать бэкап</Text>
                  <Text style={styles.actionSubtitle}>Сохранить все данные в облако</Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  setShowBackups(!showBackups);
                  if (!showBackups) void loadBackupsList();
                }}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(33, 150, 243, 0.15)' }]}>
                  <Download size={20} color={colors.info} />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Восстановить из бэкапа</Text>
                  <Text style={styles.actionSubtitle}>Загрузить данные из облака</Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {showBackups && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{'ДОСТУПНЫЕ БЭКАПЫ'}</Text>
                  <TouchableOpacity onPress={loadBackupsList}>
                    <RefreshCw size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                {isLoadingBackups ? (
                  <View style={styles.backupsLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.backupsLoadingText}>Загрузка списка...</Text>
                  </View>
                ) : backupsList.length === 0 ? (
                  <View style={styles.emptyBackups}>
                    <AlertCircle size={24} color={colors.textMuted} />
                    <Text style={styles.emptyBackupsText}>Нет сохранённых бэкапов</Text>
                  </View>
                ) : (
                  <View style={styles.backupsList}>
                    {backupsList.map((file) => (
                      <BackupFileItem key={file.fileId} file={file} onRestore={handleRestore} colors={colors} />
                    ))}
                  </View>
                )}
              </View>
            )}

            {isRestoring && (
              <View style={styles.section}>
                <View style={styles.restoringCard}>
                  <ActivityIndicator size="small" color={colors.warning} />
                  <Text style={styles.restoringText}>Восстановление данных...</Text>
                </View>
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Автоматический бэкап</Text>
                  <Text style={styles.settingDescription}>Раз в сутки при наличии интернета</Text>
                </View>
                <Switch
                  value={autoBackupEnabled}
                  onValueChange={toggleAutoBackup}
                  trackColor={{ false: colors.border, true: colors.secondary }}
                  thumbColor={Platform.OS === 'android' ? colors.text : undefined}
                />
              </View>
            </View>

            {/* ===== РАЗДЕЛИТЕЛЬ ===== */}
            <View style={styles.divider} />

            {/* ===== АККАУНТ ===== */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{'АККАУНТ ЯНДЕКС'}</Text>
              <View style={styles.accountCard}>
                <View style={styles.accountHeader}>
                  <View style={styles.accountIconWrap}>
                    <User size={20} color={colors.primary} />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountEmail}>{userEmail || 'Яндекс.Диск'}</Text>
                    <Text style={styles.accountStatus}>Подключено</Text>
                  </View>
                </View>
                <View style={styles.accountActions}>
                  <TouchableOpacity style={styles.accountBtn} onPress={handleSwitchAccount} activeOpacity={0.7}>
                    <RefreshCcw size={16} color={colors.info} />
                    <Text style={[styles.accountBtnText, { color: colors.info }]}>Сменить аккаунт</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.accountBtn, styles.accountBtnDanger]} onPress={handleSignOut} activeOpacity={0.7}>
                    <LogOut size={16} color={colors.error} />
                    <Text style={[styles.accountBtnText, { color: colors.error }]}>Выйти</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.signOutNote}>
                При смене аккаунта настройки мастера сбрасываются. Подписки сохраняются.
              </Text>
            </View>
          </>
        )}
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  explainerCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  explainerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  explainerTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.text,
  },
  explainerDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    paddingVertical: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yandexIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FC3F1D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  yandexLetter: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  lastBackupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lastBackupInfo: {
    flex: 1,
  },
  lastBackupLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  lastBackupDate: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
    marginTop: 2,
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
    width: 42,
    height: 42,
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
  backupsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 10,
  },
  backupsLoadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyBackups: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyBackupsText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  backupsList: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  restoringCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
  restoringText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: colors.warning,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  signOutNote: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
  },
  accountCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 14,
  },
  accountIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountEmail: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
  },
  accountStatus: {
    fontSize: 12,
    color: colors.success,
    marginTop: 2,
  },
  accountActions: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  accountBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.info + '12',
    gap: 6,
  },
  accountBtnDanger: {
    backgroundColor: colors.error + '12',
  },
  accountBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
}); }
