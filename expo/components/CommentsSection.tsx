import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MessageCircle, ChevronRight } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useComments } from '@/providers/CommentsProvider';
import type { CommentEntityType } from '@/types';
import { CommentsBottomSheet } from '@/components/CommentsBottomSheet';

interface CommentsSectionProps {
  entityType: CommentEntityType;
  entityId: string;
  title?: string;
}

export function CommentsSection({ entityType, entityId, title }: CommentsSectionProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    comments: commentsMap,
    loadComments,
  } = useComments();

  const [sheetVisible, setSheetVisible] = useState(false);

  const key = `${entityType}:${String(entityId)}`;
  const comments = commentsMap[key] || [];

  useEffect(() => {
    console.log('[CommentsSection] Loading comments for', entityType, entityId);
    loadComments(entityType, String(entityId));
  }, [entityType, entityId, loadComments]);

  const handleOpen = useCallback(() => {
    setSheetVisible(true);
  }, []);

  const handleClose = useCallback(() => {
    setSheetVisible(false);
  }, []);

  const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
  const lastText = lastComment?.text || '';
  const previewText = lastText.length > 60 ? lastText.slice(0, 60) + '...' : lastText;

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={handleOpen}
        activeOpacity={0.7}
        testID="comments-trigger"
      >
        <View style={styles.triggerIcon}>
          <MessageCircle size={18} color={colors.primary} />
        </View>
        <View style={styles.triggerContent}>
          <View style={styles.triggerTop}>
            <Text style={styles.triggerTitle}>Комментарии</Text>
            {comments.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{comments.length}</Text>
              </View>
            )}
          </View>
          {lastComment ? (
            <Text style={styles.triggerPreview} numberOfLines={1}>
              {previewText}
            </Text>
          ) : (
            <Text style={styles.triggerEmpty}>Нажмите, чтобы добавить</Text>
          )}
        </View>
        <ChevronRight size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <CommentsBottomSheet
        visible={sheetVisible}
        onClose={handleClose}
        entityType={entityType}
        entityId={entityId}
        title={title}
      />
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginTop: 16,
      gap: 12,
    },
    triggerIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
    },
    triggerContent: {
      flex: 1,
      gap: 3,
    },
    triggerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    triggerTitle: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.text,
    },
    badge: {
      backgroundColor: colors.primary,
      borderRadius: 9,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700' as const,
    },
    triggerPreview: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    triggerEmpty: {
      fontSize: 13,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
  });
}
