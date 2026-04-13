import React, { useMemo, useState } from 'react';
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
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  Radio,
  Copy,
  Upload,
  Clock,
  CheckCircle2,
  Wifi,
  QrCode,
  RotateCcw,
  Users,
  UserPlus,
  Trash2,
  X,
} from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useBackup, SYNC_INTERVALS, SyncIntervalValue } from '@/providers/BackupProvider';
import { useAccessCode } from '@/providers/AccessCodeProvider';
import { Image } from 'expo-image';
import { RefreshCw } from 'lucide-react-native';
import { TextInput, Modal } from 'react-native';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Никогда';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const INTERVAL_OPTIONS: { label: string; value: SyncIntervalValue }[] = [
  { label: 'Каждый час', value: SYNC_INTERVALS.HOURLY },
  { label: 'Каждые 12 часов', value: SYNC_INTERVALS.TWELVE_HOURS },
  { label: 'Каждые 24 часа', value: SYNC_INTERVALS.DAILY },
];

export default function SyncMasterScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    isConnected,
    isMasterEnabled,
    masterInterval,
    masterPublicUrl,
    lastMasterPublish,
    isPublishing,
    toggleMasterMode,
    setMasterInterval,
    publishBackup,
    masterAutoSyncEnabled,
    masterAutoSyncInterval,
    lastMasterSync,
    isMasterSyncing,
    toggleMasterAutoSync,
    setMasterAutoSyncInterval,
    masterSyncNow,
    firestoreSubscribers,
    isLoadingSubscribers,
    removeFirestoreSubscriber,
  } = useBackup();

  const { isAccessGranted } = useAccessCode();
  const [showQr, setShowQr] = useState(false);


  const handleToggleMaster = async (value: boolean) => {
    if (value && !isConnected) {
      Alert.alert('Ошибка', 'Сначала подключите Яндекс.Диск в разделе "Синхронизация и подписки"');
      return;
    }
    await toggleMasterMode(value);
    if (value && isMasterEnabled && !masterPublicUrl) {
      try {
        await publishBackup();
      } catch (e: any) {
        Alert.alert('Ошибка', e?.message || 'Не удалось опубликовать');
      }
    }
  };

  const handleResetMaster = () => {
    Alert.alert(
      'Сбросить и начать заново',
      'Все локальные данные останутся, но данные на Яндекс.Диске будут перезаписаны текущими. Продолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          style: 'destructive',
          onPress: async () => {
            try {
              await publishBackup();
              Alert.alert('Готово', 'Данные перезаписаны на Яндекс.Диске.');
            } catch (e: any) {
              Alert.alert('Ошибка', e?.message || 'Не удалось перезаписать');
            }
          },
        },
      ]
    );
  };

  const handlePublish = async () => {
    try {
      await publishBackup();
      Alert.alert('Готово', 'Данные успешно опубликованы');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось опубликовать');
    }
  };

  const handleMasterSync = async () => {
    const result = await masterSyncNow();
    if (result.error) {
      Alert.alert('Ошибка', result.error);
    } else if (result.updated) {
      Alert.alert('Готово', 'Данные обновлены');
    } else {
      Alert.alert('Актуально', 'Новых данных нет');
    }
  };

  const handleCopyUrl = async () => {
    if (!masterPublicUrl) return;
    if (Platform.OS !== 'web') {
      await Clipboard.setStringAsync(masterPublicUrl);
    }
    Alert.alert('Скопировано', 'Ссылка скопирована в буфер обмена');
  };

  const qrUrl = masterPublicUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(masterPublicUrl)}`
    : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Режим мастера' }} />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <View style={[styles.heroIcon, { backgroundColor: isMasterEnabled ? 'rgba(76, 175, 80, 0.15)' : 'rgba(158, 158, 158, 0.15)' }]}>
            <Radio size={32} color={isMasterEnabled ? colors.success : colors.textMuted} />
          </View>
          <Text style={styles.heroTitle}>Режим мастера</Text>
          <Text style={styles.heroSubtitle}>
            Публикуйте данные для синхронизации с другими устройствами
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Включить режим мастера</Text>
              <Text style={styles.settingDescription}>
                Данные будут автоматически публиковаться
              </Text>
            </View>
            <Switch
              value={isMasterEnabled}
              onValueChange={handleToggleMaster}
              trackColor={{ false: colors.border, true: colors.success }}
              thumbColor={Platform.OS === 'android' ? colors.text : undefined}
            />
          </View>
        </View>

        {isMasterEnabled && (
          <>
            {masterPublicUrl && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Публичная ссылка</Text>
                <View style={styles.urlCard}>
                  <Text style={styles.urlText} numberOfLines={2} selectable>
                    {masterPublicUrl}
                  </Text>
                  <View style={styles.urlActions}>
                    <TouchableOpacity style={styles.urlActionBtn} onPress={handleCopyUrl}>
                      <Copy size={18} color={colors.info} />
                      <Text style={styles.urlActionText}>Копировать</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.urlActionBtn} onPress={() => setShowQr(!showQr)}>
                      <QrCode size={18} color={colors.secondary} />
                      <Text style={[styles.urlActionText, { color: colors.secondary }]}>QR-код</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {showQr && qrUrl && (
                  <View style={styles.qrContainer}>
                    <Image
                      source={{ uri: qrUrl }}
                      style={styles.qrImage}
                      contentFit="contain"
                    />
                    <Text style={styles.qrHint}>Отсканируйте QR-код на другом устройстве</Text>
                  </View>
                )}
              </View>
            )}

            {lastMasterPublish && (
              <View style={styles.section}>
                <View style={styles.lastPublishCard}>
                  <CheckCircle2 size={18} color={colors.success} />
                  <View style={styles.lastPublishInfo}>
                    <Text style={styles.lastPublishLabel}>Последняя публикация</Text>
                    <Text style={styles.lastPublishDate}>{formatDate(lastMasterPublish)}</Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Действия</Text>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handlePublish}
                disabled={isPublishing}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(76, 175, 80, 0.15)' }]}>
                  {isPublishing ? (
                    <ActivityIndicator size="small" color={colors.success} />
                  ) : (
                    <Upload size={20} color={colors.success} />
                  )}
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Опубликовать сейчас</Text>
                  <Text style={styles.actionSubtitle}>Обновить данные для подписчиков</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Авто-синхронизация</Text>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Авто-синхронизация</Text>
                  <Text style={styles.settingDescription}>
                    Проверять свой публичный бэкап и восстанавливать
                  </Text>
                </View>
                <Switch
                  value={masterAutoSyncEnabled}
                  onValueChange={toggleMasterAutoSync}
                  trackColor={{ false: colors.border, true: colors.info }}
                  thumbColor={Platform.OS === 'android' ? colors.text : undefined}
                />
              </View>
              {masterAutoSyncEnabled && (
                <View style={[styles.intervalCard, { marginTop: 10 }]}>
                  {INTERVAL_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={'sync_' + option.value}
                      style={[
                        styles.intervalOption,
                        masterAutoSyncInterval === option.value && styles.intervalOptionActive,
                      ]}
                      onPress={() => setMasterAutoSyncInterval(option.value)}
                    >
                      <View style={[
                        styles.radioCircle,
                        masterAutoSyncInterval === option.value && styles.radioCircleActive,
                      ]}>
                        {masterAutoSyncInterval === option.value && <View style={styles.radioInner} />}
                      </View>
                      <Clock size={16} color={masterAutoSyncInterval === option.value ? colors.info : colors.textMuted} />
                      <Text style={[
                        styles.intervalLabel,
                        masterAutoSyncInterval === option.value && styles.intervalLabelActive,
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity
                style={[styles.actionButton, { marginTop: 10 }]}
                onPress={handleMasterSync}
                disabled={isMasterSyncing || !masterPublicUrl}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(33, 150, 243, 0.15)' }]}>
                  {isMasterSyncing ? (
                    <ActivityIndicator size="small" color={colors.info} />
                  ) : (
                    <RefreshCw size={20} color={colors.info} />
                  )}
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Проверить сейчас</Text>
                  <Text style={styles.actionSubtitle}>Синхронизировать с публичным бэкапом</Text>
                </View>
              </TouchableOpacity>
              {lastMasterSync && (
                <View style={[styles.lastPublishCard, { marginTop: 10 }]}>
                  <CheckCircle2 size={18} color={colors.info} />
                  <View style={styles.lastPublishInfo}>
                    <Text style={styles.lastPublishLabel}>Последняя синхронизация</Text>
                    <Text style={styles.lastPublishDate}>{formatDate(lastMasterSync)}</Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Управление</Text>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleResetMaster}
                disabled={isPublishing}
              >
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(244, 67, 54, 0.12)' }]}>
                  {isPublishing ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <RotateCcw size={20} color={colors.error} />
                  )}
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionTitle}>Сбросить и начать заново</Text>
                  <Text style={styles.actionSubtitle}>Перезаписать данные на Диске текущими</Text>
                </View>
              </TouchableOpacity>
            </View>

            {isAccessGranted && <View style={styles.section}>
              <Text style={styles.sectionTitle}>Подписчики ({firestoreSubscribers.length})</Text>
              <View style={styles.subscribersCard}>
                {isLoadingSubscribers ? (
                  <View style={styles.subscribersEmpty}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.subscribersEmptyText}>Загрузка...</Text>
                  </View>
                ) : firestoreSubscribers.length === 0 ? (
                  <View style={styles.subscribersEmpty}>
                    <Users size={24} color={colors.textMuted} />
                    <Text style={styles.subscribersEmptyText}>Нет подписчиков</Text>
                    <Text style={styles.subscribersEmptyHint}>Когда кто-то добавит вашу ссылку, он автоматически появится здесь</Text>
                  </View>
                ) : (
                  firestoreSubscribers.map((sub) => {
                    const joinDate = new Date(sub.createdAt);
                    const dateStr = joinDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    return (
                      <View key={sub.id} style={styles.subscriberRow}>
                        <View style={styles.subscriberInfo}>
                          <View style={[styles.subscriberAvatar, { backgroundColor: colors.success + '20' }]}>
                            <Text style={[styles.subscriberAvatarText, { color: colors.success }]}>
                              {(sub.subscriberName[0] || '?').toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.subscriberEmail} numberOfLines={1}>{sub.subscriberName}</Text>
                            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>
                              Подписан с {dateStr}
                            </Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 }}>
                          <View style={[styles.subscriberStatusBadge, { backgroundColor: colors.success + '15' }]}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} />
                            <Text style={{ fontSize: 11, fontWeight: '600' as const, color: colors.success }}>Активен</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert(
                                'Удалить подписчика',
                                `Удалить ${sub.subscriberName}? Подписчик потеряет доступ к вашим данным.`,
                                [
                                  { text: 'Отмена', style: 'cancel' },
                                  {
                                    text: 'Удалить',
                                    style: 'destructive',
                                    onPress: () => removeFirestoreSubscriber(sub.subscriberId),
                                  },
                                ]
                              );
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 15,
                              backgroundColor: colors.error + '12',
                              alignItems: 'center' as const,
                              justifyContent: 'center' as const,
                            }}
                          >
                            <Trash2 size={14} color={colors.error} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Интервал автопубликации</Text>
              <View style={styles.intervalCard}>
                {INTERVAL_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.intervalOption,
                      masterInterval === option.value && styles.intervalOptionActive,
                    ]}
                    onPress={() => setMasterInterval(option.value)}
                  >
                    <View style={[
                      styles.radioCircle,
                      masterInterval === option.value && styles.radioCircleActive,
                    ]}>
                      {masterInterval === option.value && <View style={styles.radioInner} />}
                    </View>
                    <Clock size={16} color={masterInterval === option.value ? colors.primary : colors.textMuted} />
                    <Text style={[
                      styles.intervalLabel,
                      masterInterval === option.value && styles.intervalLabelActive,
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.intervalHint}>
                Данные будут автоматически публиковаться с выбранной периодичностью
              </Text>
            </View>
          </>
        )}

        {!isConnected && (
          <View style={styles.section}>
            <View style={styles.warningCard}>
              <Wifi size={20} color={colors.warning} />
              <Text style={styles.warningText}>
                Для использования режима мастера необходимо подключить Яндекс.Диск
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
      width: 72,
      height: 72,
      borderRadius: 36,
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
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 10,
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
    urlCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    urlText: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 12,
    },
    urlActions: {
      flexDirection: 'row',
      gap: 12,
    },
    urlActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceElevated,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
    },
    urlActionText: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.info,
    },
    qrContainer: {
      alignItems: 'center',
      marginTop: 16,
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      padding: 20,
    },
    qrImage: {
      width: 200,
      height: 200,
    },
    qrHint: {
      fontSize: 12,
      color: '#666',
      marginTop: 10,
      textAlign: 'center',
    },
    lastPublishCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    lastPublishInfo: {
      flex: 1,
    },
    lastPublishLabel: {
      fontSize: 13,
      color: colors.textMuted,
    },
    lastPublishDate: {
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
    intervalHint: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 8,
      textAlign: 'center',
    },
    warningCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: 'rgba(255, 193, 7, 0.1)',
      borderRadius: 14,
      padding: 16,
      gap: 12,
      borderWidth: 1,
      borderColor: 'rgba(255, 193, 7, 0.3)',
    },
    warningText: {
      flex: 1,
      fontSize: 14,
      color: colors.warning,
      lineHeight: 20,
    },
    subscribersCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden' as const,
    },
    subscribersEmpty: {
      alignItems: 'center' as const,
      paddingVertical: 24,
      paddingHorizontal: 16,
      gap: 6,
    },
    subscribersEmptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '500' as const,
    },
    subscribersEmptyHint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center' as const,
      lineHeight: 17,
    },
    subscriberRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    subscriberInfo: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      flex: 1,
      marginRight: 8,
    },
    subscriberAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary + '20',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: 10,
    },
    subscriberAvatarText: {
      fontSize: 13,
      fontWeight: '700' as const,
      color: colors.primary,
    },
    subscriberEmail: {
      fontSize: 14,
      color: colors.text,
      flex: 1,
    },

    subscriberStatusBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },

  });
}
