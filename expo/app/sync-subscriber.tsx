import React, { useMemo, useState, useCallback } from 'react';
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
  TextInput,
  Modal,
  FlatList,
  KeyboardAvoidingView,
} from 'react-native';
import { Stack } from 'expo-router';
import {
  Link2,
  RefreshCw,
  Clock,
  CheckCircle2,
  Trash2,
  Download,
  ScanLine,
  X,
  Plus,
  Edit3,
  Users,
} from 'lucide-react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useBackup } from '@/providers/BackupProvider';
import { useComments } from '@/providers/CommentsProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from 'lucide-react-native';
import type { MasterSubscription, SyncIntervalKey } from '@/types';

function formatTimestamp(ts: number | null): string {
  if (!ts) return 'Никогда';
  const date = new Date(ts);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const INTERVAL_OPTIONS: { label: string; value: SyncIntervalKey }[] = [
  { label: 'Каждый час', value: 'hourly' },
  { label: 'Каждые 12 часов', value: 'twelveHours' },
  { label: 'Каждые 24 часа', value: 'daily' },
];

export default function SyncSubscriberScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    subscriptions,
    addSubscription,
    removeSubscription,
    renameSubscription,
    updateSubscriptionAutoSync,
    updateSubscriptionInterval,
    syncSubscription,
    isSyncingSubscription,
    isRestoring,
  } = useBackup();

  const [activeTabId, setActiveTabId] = useState<string | null>(
    subscriptions.length > 0 ? subscriptions[0].id : null
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubUrl, setNewSubUrl] = useState('');
  const [subscriberDisplayName, setSubscriberDisplayName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { displayName, setDisplayName } = useComments();

  React.useEffect(() => {
    if (displayName) setSubscriberDisplayName(displayName);
  }, [displayName]);

  const [showScanner, setShowScanner] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const activeSub = useMemo(
    () => subscriptions.find((s) => s.id === activeTabId) ?? null,
    [subscriptions, activeTabId]
  );

  const isBusy = isSyncingSubscription === activeTabId || isRestoring;

  const handleOpenScanner = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Недоступно', 'Сканирование QR-кода недоступно в веб-версии');
      return;
    }
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Нет доступа', 'Для сканирования QR-кода необходим доступ к камере');
        return;
      }
    }
    setScanned(false);
    setShowScanner(true);
  }, [cameraPermission, requestCameraPermission]);

  const handleBarCodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);
    const url = result.data?.trim();
    if (url) {
      setNewSubUrl(url);
      setShowScanner(false);
      console.log('[SyncSubscriber] Scanned URL:', url);
    }
  }, [scanned]);

  const handleAdd = useCallback(async () => {
    const name = newSubName.trim();
    const url = newSubUrl.trim();
    const myName = subscriberDisplayName.trim();
    if (!myName) {
      Alert.alert('Ошибка', 'Введите ваше имя, чтобы мастер мог вас идентифицировать');
      return;
    }
    if (!name) {
      Alert.alert('Ошибка', 'Введите название подписки');
      return;
    }
    if (!url) {
      Alert.alert('Ошибка', 'Введите ссылку от мастера');
      return;
    }
    setIsAdding(true);
    try {
      await setDisplayName(myName);
      await AsyncStorage.setItem('@user_display_name', myName);
      const sub = await addSubscription(name, url);
      setActiveTabId(sub.id);
      setShowAddModal(false);
      setNewSubName('');
      setNewSubUrl('');
      setSubscriberDisplayName(myName);
      Alert.alert('Готово', `Подписка "${name}" добавлена. Вы зарегистрированы как "${myName}".`);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось добавить подписку');
    } finally {
      setIsAdding(false);
    }
  }, [newSubName, newSubUrl, subscriberDisplayName, addSubscription, setDisplayName]);

  const handleRemove = useCallback((sub: MasterSubscription) => {
    Alert.alert(
      'Удалить подписку',
      `Удалить подписку "${sub.name}"? Все настройки этой подписки будут удалены.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            await removeSubscription(sub.id);
            if (activeTabId === sub.id) {
              const remaining = subscriptions.filter((s) => s.id !== sub.id);
              setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
            }
          },
        },
      ]
    );
  }, [removeSubscription, activeTabId, subscriptions]);

  const handleRenameOpen = useCallback(() => {
    if (!activeSub) return;
    setRenameValue(activeSub.name);
    setShowRenameModal(true);
  }, [activeSub]);

  const handleRenameConfirm = useCallback(async () => {
    if (!activeSub) return;
    const name = renameValue.trim();
    if (!name) {
      Alert.alert('Ошибка', 'Введите название');
      return;
    }
    await renameSubscription(activeSub.id, name);
    setShowRenameModal(false);
  }, [activeSub, renameValue, renameSubscription]);

  const handleSync = useCallback(async () => {
    if (!activeSub) return;
    const result = await syncSubscription(activeSub.id);
    if (result.error) {
      Alert.alert('Ошибка', result.error);
    } else if (result.updated) {
      Alert.alert('Готово', 'Данные обновлены');
    } else {
      Alert.alert('Актуально', 'Новых данных нет');
    }
  }, [activeSub, syncSubscription]);

  const renderTabItem = useCallback(({ item }: { item: MasterSubscription }) => {
    const isActive = item.id === activeTabId;
    return (
      <TouchableOpacity
        style={[styles.tab, isActive && styles.tabActive]}
        onPress={() => setActiveTabId(item.id)}
        testID={`sub-tab-${item.id}`}
      >
        <Text
          style={[styles.tabText, isActive && styles.tabTextActive]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  }, [activeTabId, styles]);

  const hasSubscriptions = subscriptions.length > 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Подписки на мастеров' }} />

      <View style={styles.tabBar}>
        <FlatList
          data={subscriptions}
          renderItem={renderTabItem}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
          style={styles.tabList}
        />
        <TouchableOpacity
          style={styles.addTabButton}
          onPress={() => setShowAddModal(true)}
          testID="add-subscription-btn"
        >
          <Plus size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {!hasSubscriptions ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '15' }]}>
              <Users size={40} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Нет подписок</Text>
            <Text style={styles.emptySubtitle}>
              Добавьте подписку на мастера, чтобы получать обновления данных
            </Text>
            <TouchableOpacity
              style={styles.emptyAddButton}
              onPress={() => setShowAddModal(true)}
            >
              <Plus size={18} color="#FFFFFF" />
              <Text style={styles.emptyAddButtonText}>Добавить подписку</Text>
            </TouchableOpacity>
          </View>
        ) : activeSub ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ссылка на бэкап</Text>
              <View style={styles.urlCard}>
                <Link2 size={16} color={colors.info} />
                <Text style={styles.urlText} numberOfLines={3}>
                  {activeSub.masterUrl}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Последняя синхронизация</Text>
              <View style={styles.statusCard}>
                <View style={styles.statusRow}>
                  {activeSub.lastSyncTimestamp ? (
                    <CheckCircle2 size={18} color={colors.success} />
                  ) : (
                    <Clock size={18} color={colors.textMuted} />
                  )}
                  <Text style={styles.statusText}>
                    {formatTimestamp(activeSub.lastSyncTimestamp)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Действия</Text>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleSync}
                disabled={isBusy}
                testID="sync-now-btn"
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(33, 150, 243, 0.15)' }]}>
                  {isBusy ? (
                    <ActivityIndicator size="small" color={colors.info} />
                  ) : (
                    <RefreshCw size={20} color={colors.info} />
                  )}
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Проверить сейчас</Text>
                  <Text style={styles.actionSubtitle}>Скачать и применить новые данные</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Автоматическая проверка</Text>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Автопроверка</Text>
                  <Text style={styles.settingDescription}>
                    Проверять обновления по расписанию
                  </Text>
                </View>
                <Switch
                  value={activeSub.autoSyncEnabled}
                  onValueChange={(val) => updateSubscriptionAutoSync(activeSub.id, val)}
                  trackColor={{ false: colors.border, true: colors.info }}
                  thumbColor={Platform.OS === 'android' ? colors.text : undefined}
                />
              </View>
            </View>

            {activeSub.autoSyncEnabled && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Интервал проверки</Text>
                <View style={styles.intervalCard}>
                  {INTERVAL_OPTIONS.map((option) => {
                    const isSelected = activeSub.syncInterval === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.intervalOption, isSelected && styles.intervalOptionActive]}
                        onPress={() => updateSubscriptionInterval(activeSub.id, option.value)}
                      >
                        <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                        <Clock size={16} color={isSelected ? colors.primary : colors.textMuted} />
                        <Text style={[styles.intervalLabel, isSelected && styles.intervalLabelActive]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Управление</Text>
              <TouchableOpacity style={styles.manageButton} onPress={handleRenameOpen}>
                <Edit3 size={18} color={colors.info} />
                <Text style={[styles.manageButtonText, { color: colors.info }]}>Переименовать</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.manageButton, styles.manageButtonDanger]}
                onPress={() => handleRemove(activeSub)}
              >
                <Trash2 size={18} color={colors.error} />
                <Text style={[styles.manageButtonText, { color: colors.error }]}>Удалить подписку</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptySubtitle}>Выберите подписку</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={showAddModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Новая подписка</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Ваше имя (видно мастеру)</Text>
            <TextInput
              style={styles.modalInput}
              value={subscriberDisplayName}
              onChangeText={setSubscriberDisplayName}
              placeholder="Как вас зовут?"
              placeholderTextColor={colors.textMuted}
              testID="subscriber-display-name"
            />
            <Text style={styles.inputLabel}>Название подписки</Text>
            <TextInput
              style={styles.modalInput}
              value={newSubName}
              onChangeText={setNewSubName}
              placeholder="Например: Имя мастера"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.inputLabel}>Ссылка от мастера</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline]}
              value={newSubUrl}
              onChangeText={setNewSubUrl}
              placeholder="Вставьте публичную ссылку..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={3}
            />
            {Platform.OS !== 'web' && (
              <TouchableOpacity style={styles.scanButtonInModal} onPress={handleOpenScanner}>
                <ScanLine size={18} color={colors.primary} />
                <Text style={styles.scanButtonText}>Сканировать QR-код</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.confirmButton, isAdding && styles.confirmButtonDisabled]}
              onPress={handleAdd}
              disabled={isAdding}
            >
              {isAdding ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Download size={18} color="#FFFFFF" />
                  <Text style={styles.confirmButtonText}>Добавить</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showRenameModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Переименовать</Text>
              <TouchableOpacity onPress={() => setShowRenameModal(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Новое название</Text>
            <TextInput
              style={styles.modalInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Введите название..."
              placeholderTextColor={colors.textMuted}
            />
            <TouchableOpacity style={styles.confirmButton} onPress={handleRenameConfirm}>
              <Text style={styles.confirmButtonText}>Сохранить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => setShowScanner(false)}
      >
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerTopBar}>
              <TouchableOpacity
                style={styles.scannerCloseButton}
                onPress={() => setShowScanner(false)}
              >
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.scannerTitle}>Сканирование QR-кода</Text>
              <View style={{ width: 40 }} />
            </View>
            <View style={styles.scannerFrameContainer}>
              <View style={styles.scannerFrame}>
                <View style={[styles.cornerTL, styles.corner]} />
                <View style={[styles.cornerTR, styles.corner]} />
                <View style={[styles.cornerBL, styles.corner]} />
                <View style={[styles.cornerBR, styles.corner]} />
              </View>
            </View>
            <View style={styles.scannerBottomBar}>
              <Text style={styles.scannerHint}>Наведите камеру на QR-код мастера</Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    tabBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    tabList: {
      flex: 1,
    },
    tabBarContent: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    tab: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: 160,
    },
    tabActive: {
      backgroundColor: colors.primary + '20',
      borderColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '500' as const,
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.primary,
      fontWeight: '700' as const,
    },
    addTabButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 32,
    },
    emptyIcon: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.text,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
    },
    emptyAddButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 24,
      gap: 8,
    },
    emptyAddButtonText: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: '#FFFFFF',
    },
    section: {
      paddingHorizontal: 16,
      marginTop: 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    urlCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    urlText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    statusCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statusText: {
      fontSize: 15,
      fontWeight: '500' as const,
      color: colors.text,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
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
    intervalCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    intervalOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    intervalOptionActive: {
      backgroundColor: colors.primary + '10',
    },
    radioCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.textMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioCircleActive: {
      borderColor: colors.primary,
    },
    radioInner: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.primary,
    },
    intervalLabel: {
      fontSize: 15,
      color: colors.textSecondary,
      flex: 1,
    },
    intervalLabelActive: {
      color: colors.text,
      fontWeight: '600' as const,
    },
    manageButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    manageButtonDanger: {
      borderColor: 'rgba(255, 82, 82, 0.3)',
    },
    manageButtonText: {
      fontSize: 15,
      fontWeight: '600' as const,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    modalScrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700' as const,
      color: colors.text,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    modalInput: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 10,
      padding: 14,
      fontSize: 15,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    modalInputMultiline: {
      minHeight: 70,
      textAlignVertical: 'top',
    },
    scanButtonInModal: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary + '15',
      borderRadius: 12,
      paddingVertical: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.primary + '30',
      marginBottom: 16,
    },
    scanButtonText: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.primary,
    },
    confirmButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      gap: 8,
    },
    confirmButtonDisabled: {
      opacity: 0.6,
    },
    confirmButtonText: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: '#FFFFFF',
    },
    scannerContainer: {
      flex: 1,
      backgroundColor: '#000000',
    },
    camera: {
      flex: 1,
    },
    scannerOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'space-between',
    },
    scannerTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    scannerCloseButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scannerTitle: {
      fontSize: 17,
      fontWeight: '600' as const,
      color: '#FFFFFF',
    },
    scannerFrameContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    scannerFrame: {
      width: 250,
      height: 250,
      position: 'relative',
    },
    corner: {
      position: 'absolute',
      width: 30,
      height: 30,
      borderColor: '#FFFFFF',
    },
    cornerTL: {
      top: 0,
      left: 0,
      borderTopWidth: 3,
      borderLeftWidth: 3,
      borderTopLeftRadius: 8,
    },
    cornerTR: {
      top: 0,
      right: 0,
      borderTopWidth: 3,
      borderRightWidth: 3,
      borderTopRightRadius: 8,
    },
    cornerBL: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderBottomLeftRadius: 8,
    },
    cornerBR: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: 8,
    },
    scannerBottomBar: {
      alignItems: 'center',
      paddingBottom: 80,
      paddingHorizontal: 24,
    },
    scannerHint: {
      fontSize: 15,
      color: 'rgba(255,255,255,0.8)',
      textAlign: 'center',
    },
  });
}
