import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { ChevronDown, Check, Database, Link2 } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useProfile } from '@/providers/ProfileProvider';
import type { AppProfile } from '@/types';

export function ProfileSelector() {
  const colors = useThemeColors();
  const { profiles, activeProfileId, switchProfile, isSubscriberProfile } = useProfile();
  const [showModal, setShowModal] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeProfile = profiles.find(p => p.id === activeProfileId) ?? profiles[0];

  const handleSelect = useCallback(async (profile: AppProfile) => {
    if (profile.id !== activeProfileId) {
      await switchProfile(profile.id);
    }
    setShowModal(false);
  }, [activeProfileId, switchProfile]);

  if (profiles.length <= 1) return null;

  return (
    <>
      <TouchableOpacity
        style={[styles.selector, isSubscriberProfile && styles.selectorSubscriber]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
        testID="profile-selector"
      >
        {isSubscriberProfile ? (
          <Link2 size={14} color={colors.info} />
        ) : (
          <Database size={14} color={colors.primary} />
        )}
        <Text
          style={[styles.selectorText, isSubscriberProfile && { color: colors.info }]}
          numberOfLines={1}
        >
          {activeProfile?.name ?? 'Мои данные'}
        </Text>
        <ChevronDown size={14} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Выберите профиль</Text>
            <FlatList
              data={profiles}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const isActive = item.id === activeProfileId;
                const isSub = item.type === 'subscription';
                return (
                  <TouchableOpacity
                    style={[styles.profileItem, isActive && styles.profileItemActive]}
                    onPress={() => handleSelect(item)}
                  >
                    <View style={[styles.profileIcon, { backgroundColor: isSub ? colors.info + '15' : colors.primary + '15' }]}>
                      {isSub ? (
                        <Link2 size={16} color={colors.info} />
                      ) : (
                        <Database size={16} color={colors.primary} />
                      )}
                    </View>
                    <View style={styles.profileInfo}>
                      <Text style={[styles.profileName, isActive && styles.profileNameActive]}>
                        {item.name}
                      </Text>
                      <Text style={styles.profileType}>
                        {isSub ? 'Подписка' : 'Мастер'}
                      </Text>
                    </View>
                    {isActive && <Check size={18} color={colors.success} />}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
            {isSubscriberProfile && (
              <View style={styles.warningBanner}>
                <Text style={styles.warningText}>
                  Данные подписки обновляются от мастера. Локальные изменения будут заменены при синхронизации.
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    selector: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '12',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      gap: 5,
      maxWidth: 180,
    },
    selectorSubscriber: {
      backgroundColor: colors.info + '12',
    },
    selectorText: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.primary,
      flexShrink: 1,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      maxHeight: 400,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700' as const,
      color: colors.text,
      marginBottom: 16,
      textAlign: 'center',
    },
    profileItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
    },
    profileItemActive: {
      backgroundColor: colors.primary + '10',
    },
    profileIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    profileInfo: {
      flex: 1,
    },
    profileName: {
      fontSize: 15,
      fontWeight: '500' as const,
      color: colors.text,
    },
    profileNameActive: {
      fontWeight: '700' as const,
    },
    profileType: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 1,
    },
    separator: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 2,
    },
    warningBanner: {
      marginTop: 14,
      backgroundColor: 'rgba(255, 193, 7, 0.1)',
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: 'rgba(255, 193, 7, 0.25)',
    },
    warningText: {
      fontSize: 12,
      color: colors.warning,
      lineHeight: 17,
      textAlign: 'center',
    },
  });
}
