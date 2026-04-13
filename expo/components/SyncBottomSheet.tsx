import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  X,
  Cloud,
  Upload,
  RefreshCw,
  Copy,
  QrCode,
  ChevronDown,
  Database,
  Link2,
  Check,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { useSyncPanel } from '@/providers/SyncPanelProvider';
import { useBackup, SYNC_INTERVALS, SyncIntervalValue } from '@/providers/BackupProvider';
import { useProfile } from '@/providers/ProfileProvider';

import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import type { AppProfile, SyncIntervalKey } from '@/types';

const SCREEN_HEIGHT = (() => { try { return Dimensions.get('window').height; } catch { return 800; } })();

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

function formatTimestamp(ts: number | null): string {
  if (!ts) return 'Никогда';
  return formatDate(new Date(ts).toISOString());
}

const INTERVAL_OPTIONS: { label: string; shortLabel: string; value: SyncIntervalValue; key: SyncIntervalKey }[] = [
  { label: 'Каждый час', shortLabel: '1ч', value: SYNC_INTERVALS.HOURLY, key: 'hourly' },
  { label: 'Каждые 12ч', shortLabel: '12ч', value: SYNC_INTERVALS.TWELVE_HOURS, key: 'twelveHours' },
  { label: 'Каждые 24ч', shortLabel: '24ч', value: SYNC_INTERVALS.DAILY, key: 'daily' },
];

export function SyncBottomSheet() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isOpen, close } = useSyncPanel();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const {
    isConnected,
    isMasterEnabled,
    masterInterval,
    masterPublicUrl,
    lastMasterPublish,
    isPublishing,
    publishBackup,
    setMasterInterval,
    masterAutoSyncInterval,
    lastMasterSync,
    isMasterSyncing,
    setMasterAutoSyncInterval,
    masterSyncNow,
    subscriptions,
    syncSubscription,
    isSyncingSubscription,
    updateSubscriptionInterval,
    isRestoring,
    syncProgress,
  } = useBackup();

  const {
    profiles,
    activeProfileId,
    switchProfile,
    isSubscriberProfile,
  } = useProfile();

  const [showQr, setShowQr] = useState(false);
  const [showProfileList, setShowProfileList] = useState(false);

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? profiles[0];
  const activeSub = subscriptions.find(s => s.id === activeProfileId);
  const isMasterProfile = activeProfileId === 'master';

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen, slideAnim, backdropAnim]);

  const handlePublish = useCallback(async () => {
    try {
      await publishBackup();
    } catch (e: any) {
      console.log('[SyncBottomSheet] Publish error:', e?.message);
    }
  }, [publishBackup]);

  const handleSyncNow = useCallback(async () => {
    if (isMasterProfile) {
      const result = await masterSyncNow();
      if (result.error) {
        console.log('[SyncBottomSheet] Master sync error:', result.error);
      }
    } else if (activeSub) {
      const result = await syncSubscription(activeSub.id);
      if (result.error) {
        console.log('[SyncBottomSheet] Sub sync error:', result.error);
      }
    }
  }, [isMasterProfile, masterSyncNow, activeSub, syncSubscription]);

  const handleCopyUrl = useCallback(async () => {
    if (!masterPublicUrl) return;
    if (Platform.OS !== 'web') {
      await Clipboard.setStringAsync(masterPublicUrl);
    }
    Alert.alert('Скопировано', 'Ссылка скопирована');
  }, [masterPublicUrl]);

  const handleProfileSelect = useCallback(async (profile: AppProfile) => {
    if (profile.id !== activeProfileId) {
      await switchProfile(profile.id);
    }
    setShowProfileList(false);
  }, [activeProfileId, switchProfile]);

  const isSyncing = isMasterProfile
    ? isMasterSyncing
    : isSyncingSubscription === activeProfileId || isRestoring;

  const currentIntervalValue = isMasterProfile
    ? masterAutoSyncInterval
    : activeSub
      ? (activeSub.syncInterval === 'hourly' ? SYNC_INTERVALS.HOURLY : activeSub.syncInterval === 'twelveHours' ? SYNC_INTERVALS.TWELVE_HOURS : SYNC_INTERVALS.DAILY)
      : SYNC_INTERVALS.DAILY;

  const handleIntervalChange = useCallback(async (option: typeof INTERVAL_OPTIONS[number]) => {
    if (isMasterProfile) {
      await setMasterAutoSyncInterval(option.value);
    } else if (activeSub) {
      await updateSubscriptionInterval(activeSub.id, option.key);
    }
  }, [isMasterProfile, setMasterAutoSyncInterval, activeSub, updateSubscriptionInterval]);

  const qrUrl = masterPublicUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(masterPublicUrl)}`
    : null;

  if (!isOpen) return null;

  return (
    <Modal visible={isOpen} transparent animationType="none" onRequestClose={close}>
      <View style={styles.container}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropAnim }]}
        >
          <TouchableOpacity style={styles.backdropTouch} onPress={close} activeOpacity={1} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <Cloud size={22} color={colors.primary} />
            <Text style={styles.headerTitle}>Панель синхронизации</Text>
            <TouchableOpacity onPress={close} style={styles.closeBtn} testID="sync-panel-close">
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Текущий профиль</Text>
              <TouchableOpacity
                style={styles.profileCard}
                onPress={() => setShowProfileList(!showProfileList)}
                activeOpacity={0.7}
              >
                <View style={[styles.profileIcon, { backgroundColor: isSubscriberProfile ? colors.info + '15' : colors.primary + '15' }]}>
                  {isSubscriberProfile ? (
                    <Link2 size={18} color={colors.info} />
                  ) : (
                    <Database size={18} color={colors.primary} />
                  )}
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{activeProfile?.name ?? 'Мои данные'}</Text>
                  <Text style={styles.profileType}>
                    {isSubscriberProfile ? 'Подписка' : 'Мастер'}
                  </Text>
                </View>
                <ChevronDown size={18} color={colors.textMuted} />
              </TouchableOpacity>

              {showProfileList && profiles.length > 1 && (
                <View style={styles.profileList}>
                  {profiles.map(p => {
                    const isActive = p.id === activeProfileId;
                    const isSub = p.type === 'subscription';
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.profileListItem, isActive && styles.profileListItemActive]}
                        onPress={() => handleProfileSelect(p)}
                      >
                        {isSub ? (
                          <Link2 size={14} color={colors.info} />
                        ) : (
                          <Database size={14} color={colors.primary} />
                        )}
                        <Text style={[styles.profileListName, isActive && { color: colors.primary, fontWeight: '700' as const }]}>
                          {p.name}
                        </Text>
                        {isActive && <Check size={14} color={colors.success} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {syncProgress && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Прогресс синхронизации</Text>
                <View style={styles.progressCard}>
                  <View style={styles.progressHeader}>
                    <ActivityIndicator size="small" color={
                      syncProgress.phase === 'error' ? colors.error :
                      syncProgress.phase === 'complete' ? colors.success :
                      colors.info
                    } />
                    <Text style={styles.progressPhase}>
                      {syncProgress.phase === 'preparing' ? 'Подготовка...' :
                       syncProgress.phase === 'uploading' ? 'Загрузка на Диск' :
                       syncProgress.phase === 'downloading' ? 'Скачивание' :
                       syncProgress.phase === 'migrating' ? 'Миграция данных' :
                       syncProgress.phase === 'complete' ? 'Завершено' :
                       'Ошибка'}
                    </Text>
                  </View>
                  {syncProgress.total > 0 && (
                    <>
                      <View style={styles.progressBarBg}>
                        <View style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(100, Math.round((syncProgress.current / syncProgress.total) * 100))}%` as any,
                            backgroundColor: syncProgress.phase === 'error' ? colors.error :
                              syncProgress.phase === 'complete' ? colors.success : colors.info,
                          },
                        ]} />
                      </View>
                      <View style={styles.progressFooter}>
                        <Text style={styles.progressFile} numberOfLines={1}>
                          {syncProgress.currentFile}
                        </Text>
                        <Text style={styles.progressCount}>
                          {syncProgress.current}/{syncProgress.total}
                        </Text>
                      </View>
                    </>
                  )}
                  {syncProgress.total === 0 && syncProgress.currentFile ? (
                    <Text style={styles.progressFile} numberOfLines={1}>
                      {syncProgress.currentFile}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Действия</Text>
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, isSyncing && styles.actionBtnDisabled]}
                  onPress={handleSyncNow}
                  disabled={isSyncing}
                  testID="sync-now-btn"
                >
                  {isSyncing ? (
                    <ActivityIndicator size="small" color={colors.info} />
                  ) : (
                    <RefreshCw size={20} color={colors.info} />
                  )}
                  <Text style={[styles.actionBtnText, { color: colors.info }]}>
                    Обновить
                  </Text>
                </TouchableOpacity>

                {isMasterProfile && isMasterEnabled && isConnected && (
                  <TouchableOpacity
                    style={[styles.actionBtn, isPublishing && styles.actionBtnDisabled]}
                    onPress={handlePublish}
                    disabled={isPublishing}
                    testID="publish-now-btn"
                  >
                    {isPublishing ? (
                      <ActivityIndicator size="small" color={colors.success} />
                    ) : (
                      <Upload size={20} color={colors.success} />
                    )}
                    <Text style={[styles.actionBtnText, { color: colors.success }]}>
                      Опубликовать
                    </Text>
                  </TouchableOpacity>
                )}
              </View>


            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Информация</Text>
              <View style={styles.infoCard}>
                {isMasterProfile && lastMasterPublish && (
                  <View style={styles.infoRow}>
                    <Upload size={14} color={colors.textMuted} />
                    <Text style={styles.infoLabel}>Публикация:</Text>
                    <Text style={styles.infoValue}>{formatDate(lastMasterPublish)}</Text>
                  </View>
                )}
                <View style={styles.infoRow}>
                  <RefreshCw size={14} color={colors.textMuted} />
                  <Text style={styles.infoLabel}>Синхронизация:</Text>
                  <Text style={styles.infoValue}>
                    {isMasterProfile ? formatDate(lastMasterSync) : (activeSub ? formatTimestamp(activeSub.lastSyncTimestamp) : 'Никогда')}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Интервал синхронизации</Text>
              <View style={styles.intervalRow}>
                {INTERVAL_OPTIONS.map(option => {
                  const isSelected = currentIntervalValue === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.intervalChip, isSelected && styles.intervalChipActive]}
                      onPress={() => handleIntervalChange(option)}
                    >
                      <Text style={[styles.intervalChipText, isSelected && styles.intervalChipTextActive]}>
                        {option.shortLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {isMasterProfile && isMasterEnabled && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Интервал публикации</Text>
                  <View style={styles.intervalRow}>
                    {INTERVAL_OPTIONS.map(option => {
                      const isSelected = masterInterval === option.value;
                      return (
                        <TouchableOpacity
                          key={'pub_' + option.value}
                          style={[styles.intervalChip, isSelected && styles.intervalChipActivePub]}
                          onPress={() => setMasterInterval(option.value)}
                        >
                          <Text style={[styles.intervalChipText, isSelected && styles.intervalChipTextActivePub]}>
                            {option.shortLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </View>

            {isMasterProfile && masterPublicUrl && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Публичная ссылка</Text>
                <View style={styles.urlCard}>
                  <Text style={styles.urlText} numberOfLines={2} selectable>
                    {masterPublicUrl}
                  </Text>
                  <View style={styles.urlActions}>
                    <TouchableOpacity style={styles.urlBtn} onPress={handleCopyUrl}>
                      <Copy size={14} color={colors.info} />
                      <Text style={[styles.urlBtnText, { color: colors.info }]}>Копировать</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.urlBtn} onPress={() => setShowQr(!showQr)}>
                      <QrCode size={14} color={colors.secondary} />
                      <Text style={[styles.urlBtnText, { color: colors.secondary }]}>QR</Text>
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
                  </View>
                )}
              </View>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    backdropTouch: {
      flex: 1,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      height: SCREEN_HEIGHT * 0.75,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 6,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700' as const,
      color: colors.text,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: 16,
      paddingHorizontal: 20,
    },
    section: {
      marginBottom: 18,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '600' as const,
      color: colors.textMuted,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    profileIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: colors.text,
    },
    profileType: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 1,
    },
    profileList: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    profileListItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    profileListItemActive: {
      backgroundColor: colors.primary + '08',
    },
    profileListName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500' as const,
      color: colors.text,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      paddingVertical: 14,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionBtnDisabled: {
      opacity: 0.6,
    },
    actionBtnText: {
      fontSize: 14,
      fontWeight: '600' as const,
    },
    infoCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      padding: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    infoLabel: {
      fontSize: 13,
      color: colors.textMuted,
    },
    infoValue: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.text,
      textAlign: 'right' as const,
    },
    intervalRow: {
      flexDirection: 'row',
      gap: 8,
    },
    intervalChip: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    intervalChipActive: {
      backgroundColor: colors.info + '18',
      borderColor: colors.info,
    },
    intervalChipActivePub: {
      backgroundColor: colors.success + '18',
      borderColor: colors.success,
    },
    intervalChipText: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.textMuted,
    },
    intervalChipTextActive: {
      color: colors.info,
    },
    intervalChipTextActivePub: {
      color: colors.success,
    },
    urlCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    urlText: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 17,
      marginBottom: 10,
    },
    urlActions: {
      flexDirection: 'row',
      gap: 8,
    },
    urlBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.background,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    urlBtnText: {
      fontSize: 12,
      fontWeight: '600' as const,
    },
    qrContainer: {
      alignItems: 'center',
      marginTop: 12,
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: 16,
    },
    qrImage: {
      width: 160,
      height: 160,
    },
    progressCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
    },
    progressHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    progressPhase: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.text,
    },
    progressBarBg: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: 'hidden' as const,
    },
    progressBarFill: {
      height: 6,
      borderRadius: 3,
    },
    progressFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    progressFile: {
      fontSize: 12,
      color: colors.textMuted,
      flex: 1,
    },
    progressCount: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: colors.textSecondary,
      marginLeft: 8,
    },
  });
}
