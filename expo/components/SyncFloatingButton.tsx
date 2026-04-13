import React, { useMemo, useRef, useCallback } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  Animated,
  View,
} from 'react-native';
import { Cloud, CloudOff, ArrowUpDown } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSyncPanel } from '@/providers/SyncPanelProvider';
import { useBackup } from '@/providers/BackupProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';

export function SyncFloatingButton() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { open } = useSyncPanel();
  const { isConnected, isPublishing, isMasterSyncing, isSyncingSubscription, isRestoring, syncProgress } = useBackup();
  const { isSubscriberProfile, activeProfileId, profiles } = useProfile();

  const activeSubscriptionLetter = useMemo(() => {
    if (!isSubscriberProfile) return null;
    const profile = profiles.find(p => p.id === activeProfileId);
    if (!profile || !profile.name) return null;
    return profile.name.substring(0, 2).toUpperCase();
  }, [isSubscriberProfile, activeProfileId, profiles]);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const isBusy = isPublishing || isMasterSyncing || !!isSyncingSubscription || isRestoring || !!syncProgress;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.88,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: insets.bottom + 58,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.button, isBusy && styles.buttonBusy]}
        onPress={open}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.8}
        testID="sync-floating-btn"
      >
        {syncProgress ? (
          <ArrowUpDown size={18} color={colors.info} />
        ) : isConnected ? (
          <Cloud size={18} color={isBusy ? colors.warning : colors.primary} />
        ) : (
          <CloudOff size={18} color={colors.textMuted} />
        )}
        {isBusy && <View style={styles.busyDot} />}
        {activeSubscriptionLetter && !isBusy && (
          <View style={styles.subscriptionBadge}>
            <Animated.Text style={styles.subscriptionLetter}>{activeSubscriptionLetter}</Animated.Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      position: 'absolute',
      right: 16,
      zIndex: 999,
    },
    button: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
    },
    buttonBusy: {
      borderColor: colors.warning + '50',
    },
    busyDot: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.warning,
    },
    subscriptionBadge: {
      position: 'absolute',
      bottom: -6,
      right: -8,
      minWidth: 28,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.surface,
      paddingHorizontal: 4,
    },
    subscriptionLetter: {
      fontSize: 12,
      fontWeight: '800' as const,
      color: '#FFFFFF',
      lineHeight: 18,
      letterSpacing: -0.3,
    },
  });
}
