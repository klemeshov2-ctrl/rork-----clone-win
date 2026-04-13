import React, { useMemo, useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  Alert,
  Modal,
} from 'react-native';
import { Check, ChevronRight, MessageCircle, MessageSquare, Plus, Trash2, Users, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useComments } from '@/providers/CommentsProvider';
import { useChat } from '@/providers/ChatProvider';
import { useObjects } from '@/providers/ObjectsProvider';
import { useBackup } from '@/providers/BackupProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useAccessCode } from '@/providers/AccessCodeProvider';
import { KeyRound } from 'lucide-react-native';
import type { Comment, CommentEntityType, ChatDialog, MasterSubscription, FirestoreSubscription } from '@/types';

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const time = `${hours}:${minutes}`;
  if (isToday) return `Сегодня, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) return `Вчера, ${time}`;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()}, ${time}`;
}

function getEntityLabel(type: CommentEntityType): string {
  switch (type) {
    case 'work_entry': return 'Запись работ';
    case 'inventory': return 'Склад';
    case 'task': return 'Задача';
    default: return 'Комментарий';
  }
}

function UnreadCommentCard({
  comment,
  colors,
  onPress,
}: {
  comment: Comment;
  colors: ThemeColors;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.primary + '25',
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
      }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 8 }}>
        <View style={{
          backgroundColor: colors.primary + '15',
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 3,
          marginRight: 8,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '600' as const, color: colors.primary }}>
            {getEntityLabel(comment.entityType)}
          </Text>
        </View>
        <Text style={{ fontSize: 11, color: colors.textMuted, flex: 1 }} numberOfLines={1}>
          {formatDate(comment.createdAt)}
        </Text>
        <ChevronRight size={16} color={colors.textMuted} />
      </View>
      <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 4 }} numberOfLines={3}>
        {comment.text}
      </Text>
      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
        {comment.authorName || comment.userName || comment.userEmail || 'Аноним'}
      </Text>
    </TouchableOpacity>
  );
}

function ChatCard({
  chat,
  colors,
  userId,
  onPress,
  onDelete,
  isMasterUser,
}: {
  chat: ChatDialog;
  colors: ThemeColors;
  userId: string | null;
  onPress: () => void;
  onDelete?: () => void;
  isMasterUser: boolean;
}) {
  const isMaster = chat.masterId === userId;
  const partnerName = isMaster ? chat.subscriberName : chat.masterName;
  const myUnread = isMaster ? chat.unreadForMaster : chat.unreadForSubscriber;
  const hasUnread = myUnread > 0;

  return (
    <TouchableOpacity
      style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: hasUnread ? colors.info + '40' : colors.border,
        borderLeftWidth: hasUnread ? 3 : 1,
        borderLeftColor: hasUnread ? colors.info : colors.border,
      }}
      onPress={onPress}
      onLongPress={isMasterUser && onDelete ? onDelete : undefined}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 6 }}>
        <View style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.info + '20',
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          marginRight: 10,
        }}>
          <MessageCircle size={18} color={colors.info} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const }}>
            <Text style={{ fontSize: 15, fontWeight: '600' as const, color: colors.text }} numberOfLines={1}>
              {partnerName}
            </Text>
            <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 }}>
              {hasUnread && (
                <View style={{
                  backgroundColor: colors.info,
                  borderRadius: 10,
                  minWidth: 20,
                  height: 20,
                  alignItems: 'center' as const,
                  justifyContent: 'center' as const,
                  paddingHorizontal: 6,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700' as const, color: '#fff' }}>
                    {myUnread > 99 ? '99+' : myUnread}
                  </Text>
                </View>
              )}
              {isMasterUser && onDelete && (
                <TouchableOpacity
                  onPress={onDelete}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.error + '15',
                    alignItems: 'center' as const,
                    justifyContent: 'center' as const,
                  }}
                >
                  <Trash2 size={14} color={colors.error} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
            {chat.lastMessage || 'Нет сообщений'}
          </Text>
        </View>
        <ChevronRight size={16} color={colors.textMuted} style={{ marginLeft: 8 }} />
      </View>
      <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: 'right' as const }}>
        {formatDate(chat.lastMessageTime)}
      </Text>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { unreadComments, markAsRead, markAllAsRead, unreadCount: commentUnreadCount, userId: commentsUserId } = useComments();
  const { chats, unreadMessagesCount, userId: chatUserId, sendMessage, deleteChat, isDeleting } = useChat();
  const { getWorkEntry } = useObjects();
  const { subscriptions, masterId: backupMasterId } = useBackup();
  const { isSubscriberProfile, activeProfileId } = useProfile();
  const { isAccessGranted } = useAccessCode();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'comments' | 'chats'>('comments');

  const slideAnim = useRef(new Animated.Value(0)).current;

  const switchTab = useCallback((tab: 'comments' | 'chats') => {
    setActiveTab(tab);
    Animated.spring(slideAnim, {
      toValue: tab === 'comments' ? 0 : 1,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [slideAnim]);

  const navigateToComment = useCallback((comment: Comment) => {
    markAsRead(comment.id);
    console.log('[Notifications] Navigating to comment:', comment.entityType, comment.entityId);
    switch (comment.entityType) {
      case 'work_entry': {
        const entry = getWorkEntry(comment.entityId);
        if (entry) {
          router.push({
            pathname: '/(home)/object-detail' as any,
            params: { id: entry.objectId, highlightComment: comment.entityId },
          });
        }
        break;
      }
      case 'inventory': {
        router.navigate('/(tabs)/inventory' as any);
        break;
      }
      case 'task': {
        router.push({
          pathname: '/reminders/create' as any,
          params: { editId: comment.entityId },
        });
        break;
      }
      default:
        break;
    }
  }, [markAsRead, getWorkEntry, router]);

  const navigateToChat = useCallback((chat: ChatDialog) => {
    router.push({
      pathname: '/chat' as any,
      params: {
        masterId: chat.masterId,
        subscriberId: chat.subscriberId,
        partnerName: chat.masterId === chatUserId ? chat.subscriberName : chat.masterName,
      },
    });
  }, [router, chatUserId]);

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead();
  }, [markAllAsRead]);

  const currentUserId = chatUserId || commentsUserId;
  const { firestoreSubscribers } = useBackup();
  const [subscriberPickerVisible, setSubscriberPickerVisible] = useState(false);

  const activeSubscription = useMemo(() => {
    if (isSubscriberProfile) {
      return subscriptions.find(s => s.id === activeProfileId) || null;
    }
    return null;
  }, [isSubscriberProfile, activeProfileId, subscriptions]);

  const handleStartNewChat = useCallback(() => {
    if (!isAccessGranted) {
      Alert.alert('Доступ ограничен', 'Введите код доступа в настройках');
      return;
    }
    if (!currentUserId) {
      Alert.alert('Ошибка', 'Авторизация не завершена');
      return;
    }
    if (isSubscriberProfile) {
      const activeSub = activeSubscription;
      if (activeSub?.masterId) {
        router.push({
          pathname: '/chat' as any,
          params: {
            masterId: activeSub.masterId,
            subscriberId: currentUserId,
            partnerName: activeSub.name || 'Мастер',
          },
        });
      } else {
        Alert.alert('Ошибка', 'Недействительная ссылка мастера. Проверьте подписку и попробуйте снова.');
      }
    } else {
      if (!firestoreSubscribers || firestoreSubscribers.length === 0) {
        Alert.alert('Нет подписчиков', 'Вы не можете начать чат, пока у вас нет подписчиков.');
        return;
      }
      setSubscriberPickerVisible(true);
    }
  }, [currentUserId, isSubscriberProfile, activeSubscription, router, firestoreSubscribers]);

  const handleSelectSubscriber = useCallback((subscriber: FirestoreSubscription) => {
    setSubscriberPickerVisible(false);
    if (!currentUserId) return;
    router.push({
      pathname: '/chat' as any,
      params: {
        masterId: currentUserId,
        subscriberId: subscriber.subscriberId,
        partnerName: subscriber.subscriberName || 'Подписчик',
      },
    });
  }, [currentUserId, router]);

  const handleDeleteChat = useCallback((chat: ChatDialog) => {
    const pName = chat.masterId === chatUserId ? chat.subscriberName : chat.masterName;
    Alert.alert(
      'Удалить чат',
      `Удалить чат с ${pName}? Все сообщения будут удалены.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            deleteChat(chat.masterId, chat.subscriberId);
          },
        },
      ]
    );
  }, [chatUserId, deleteChat]);

  const isMasterUser = !isSubscriberProfile;

  const renderCommentItem = useCallback(({ item }: { item: Comment }) => (
    <UnreadCommentCard
      comment={item}
      colors={colors}
      onPress={() => navigateToComment(item)}
    />
  ), [colors, navigateToComment]);

  const renderChatItem = useCallback(({ item }: { item: ChatDialog }) => (
    <ChatCard
      chat={item}
      colors={colors}
      userId={chatUserId}
      onPress={() => navigateToChat(item)}
      onDelete={isMasterUser ? () => handleDeleteChat(item) : undefined}
      isMasterUser={isMasterUser}
    />
  ), [colors, chatUserId, navigateToChat, isMasterUser, handleDeleteChat]);

  const commentKeyExtractor = useCallback((item: Comment) => item.id, []);
  const chatKeyExtractor = useCallback((item: ChatDialog) => item.id, []);

  const tabIndicatorTranslate = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Уведомления' }} />

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'comments' && styles.tabActive]}
          onPress={() => switchTab('comments')}
          activeOpacity={0.7}
        >
          <MessageSquare size={16} color={activeTab === 'comments' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'comments' && styles.tabTextActive]}>
            Комментарии
          </Text>
          {commentUnreadCount > 0 && (
            <View style={[styles.tabBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.tabBadgeText}>
                {commentUnreadCount > 99 ? '99+' : commentUnreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chats' && styles.tabActive]}
          onPress={() => switchTab('chats')}
          activeOpacity={0.7}
        >
          <MessageCircle size={16} color={activeTab === 'chats' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'chats' && styles.tabTextActive]}>
            Чаты
          </Text>
          {unreadMessagesCount > 0 && (
            <View style={[styles.tabBadge, { backgroundColor: colors.info }]}>
              <Text style={styles.tabBadgeText}>
                {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {activeTab === 'comments' ? (
        <>
          {unreadComments.length > 0 && (
            <View style={styles.headerActions}>
              <Text style={styles.countText}>
                {unreadComments.length} непрочитанных
              </Text>
              <TouchableOpacity
                style={styles.markAllBtn}
                onPress={handleMarkAllRead}
                activeOpacity={0.7}
              >
                <Check size={14} color={colors.primary} />
                <Text style={styles.markAllText}>Прочитать все</Text>
              </TouchableOpacity>
            </View>
          )}

          {unreadComments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MessageSquare size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Нет комментариев</Text>
              <Text style={styles.emptySubtext}>
                Новые комментарии будут отображаться здесь
              </Text>
            </View>
          ) : (
            <FlatList
              data={unreadComments}
              renderItem={renderCommentItem}
              keyExtractor={commentKeyExtractor}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      ) : (
        <>
          <Modal
            visible={subscriberPickerVisible}
            animationType="slide"
            transparent
            onRequestClose={() => setSubscriberPickerVisible(false)}
          >
            <View style={styles.pickerOverlay}>
              <View style={styles.pickerSheet}>
                <View style={styles.pickerHeader}>
                  <View style={styles.pickerHeaderLeft}>
                    <Users size={18} color={colors.primary} />
                    <Text style={styles.pickerTitle}>Выберите подписчика</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.pickerCloseBtn}
                    onPress={() => setSubscriberPickerVisible(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={firestoreSubscribers}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.subscriberItem}
                      onPress={() => handleSelectSubscriber(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.subscriberAvatar}>
                        <Text style={styles.subscriberAvatarText}>
                          {(item.subscriberName?.[0] || '?').toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subscriberName}>{item.subscriberName || 'Подписчик'}</Text>
                      </View>
                      <ChevronRight size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptySubtext}>Нет подписчиков</Text>
                    </View>
                  }
                />
              </View>
            </View>
          </Modal>

          {chats.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MessageCircle size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Нет чатов</Text>
              <Text style={styles.emptySubtext}>
                {isSubscriberProfile
                  ? 'Напишите мастеру, чтобы начать общение'
                  : 'Выберите подписчика, чтобы начать чат'}
              </Text>
              <TouchableOpacity
                style={styles.startChatBtn}
                onPress={handleStartNewChat}
                activeOpacity={0.7}
              >
                <Plus size={18} color="#fff" />
                <Text style={styles.startChatBtnText}>Начать чат</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <FlatList
                data={chats}
                renderItem={renderChatItem}
                keyExtractor={chatKeyExtractor}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
              <TouchableOpacity
                style={styles.fab}
                onPress={handleStartNewChat}
                activeOpacity={0.7}
              >
                <Plus size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
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
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: 8,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: {
      borderBottomColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '500' as const,
      color: colors.textMuted,
    },
    tabTextActive: {
      color: colors.primary,
      fontWeight: '600' as const,
    },
    tabBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      marginLeft: 2,
    },
    tabBadgeText: {
      fontSize: 10,
      fontWeight: '700' as const,
      color: '#fff',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    countText: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.textSecondary,
    },
    markAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    markAllText: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.primary,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600' as const,
      color: colors.textSecondary,
      marginTop: 4,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
    },
    listContent: {
      padding: 16,
    },
    startChatBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 16,
    },
    startChatBtnText: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: '#fff',
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      zIndex: 100,
    },
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    pickerSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '60%',
      paddingTop: 16,
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: 8,
    },
    pickerHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    pickerTitle: {
      fontSize: 17,
      fontWeight: '700' as const,
      color: colors.text,
    },
    pickerCloseBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subscriberItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    subscriberAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    subscriberAvatarText: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: colors.primary,
    },
    subscriberName: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.text,
    },
  });
}
