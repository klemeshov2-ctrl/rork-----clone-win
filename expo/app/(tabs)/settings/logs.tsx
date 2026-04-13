import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { Trash2, Copy, AlertCircle, ShieldAlert, AlertTriangle, Info, Bug } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { getLogs, clearLogs, getLogsAsText, subscribe, LogEntry, LogLevel, clearLogsByLevel } from '@/lib/logger';

type FilterLevel = 'all' | LogLevel;

const LEVEL_CONFIG: Record<LogLevel, { label: string; icon: typeof AlertCircle; colorKey: keyof ThemeColors }> = {
  error: { label: 'Ошибки', icon: AlertCircle, colorKey: 'error' },
  warn: { label: 'Предупр.', icon: AlertTriangle, colorKey: 'warning' },
  info: { label: 'Инфо', icon: Info, colorKey: 'info' },
  debug: { label: 'Отладка', icon: Bug, colorKey: 'textMuted' },
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month} ${hours}:${minutes}:${seconds}`;
}

function getLevelColor(level: LogLevel, colors: ThemeColors): string {
  switch (level) {
    case 'error': return colors.error;
    case 'warn': return colors.warning;
    case 'info': return colors.info;
    case 'debug': return colors.textMuted;
    default: return colors.textMuted;
  }
}

function getLevelLabel(level: LogLevel): string {
  switch (level) {
    case 'error': return 'ошибка';
    case 'warn': return 'предупр';
    case 'info': return 'инфо';
    case 'debug': return 'отладка';
    default: return level;
  }
}

function LogEntryCard({ entry, colors }: { entry: LogEntry; colors: ThemeColors }) {
  const [expanded, setExpanded] = useState(false);
  const levelColor = getLevelColor(entry.level, colors);
  const LevelIcon = LEVEL_CONFIG[entry.level]?.icon || Info;

  return (
    <TouchableOpacity
      style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: levelColor + '25',
        borderLeftWidth: 3,
        borderLeftColor: levelColor,
      }}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 6 }}>
        <View style={{
          backgroundColor: levelColor + '15',
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 2,
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: 4,
          marginRight: 8,
        }}>
          <LevelIcon size={12} color={levelColor} />
          <Text style={{ fontSize: 10, fontWeight: '700' as const, color: levelColor, textTransform: 'uppercase' as const }}>
            {getLevelLabel(entry.level)}
          </Text>
        </View>
        {entry.source && (
          <View style={{
            backgroundColor: colors.primary + '15',
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
            marginRight: 8,
          }}>
            <Text style={{ fontSize: 9, fontWeight: '600' as const, color: colors.primary }}>
              {entry.source}
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums' as const] }}>
          {formatTimestamp(entry.timestamp)}
        </Text>
      </View>
      <Text
        style={{ fontSize: 13, color: colors.text, lineHeight: 18 }}
        numberOfLines={expanded ? undefined : 3}
      >
        {entry.message}
      </Text>
      {expanded && entry.originalMessage && entry.originalMessage !== entry.message && (
        <View style={{ marginTop: 8, backgroundColor: colors.surface, borderRadius: 8, padding: 8 }}>
          <Text style={{ fontSize: 10, color: colors.textMuted, marginBottom: 4, fontWeight: '600' as const }}>
            Оригинал:
          </Text>
          <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
            {entry.originalMessage}
          </Text>
        </View>
      )}
      {entry.stack && expanded && (
        <View style={{ marginTop: 8, backgroundColor: colors.surface, borderRadius: 8, padding: 8 }}>
          <Text style={{ fontSize: 10, color: colors.textMuted, marginBottom: 4, fontWeight: '600' as const }}>
            Стек вызовов:
          </Text>
          <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
            {entry.stack}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function LogsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [allLogs, setAllLogs] = useState<LogEntry[]>(getLogs());
  const [filter, setFilter] = useState<FilterLevel>('all');

  useEffect(() => {
    const unsub = subscribe(() => {
      setAllLogs([...getLogs()]);
    });
    return unsub;
  }, []);

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return allLogs;
    return allLogs.filter(e => e.level === filter);
  }, [allLogs, filter]);

  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0, debug: 0 };
    allLogs.forEach(e => { c[e.level] = (c[e.level] || 0) + 1; });
    return c;
  }, [allLogs]);

  const handleClear = useCallback(() => {
    const label = filter === 'all' ? 'все записи' : `записи "${getLevelLabel(filter as LogLevel)}"`;
    Alert.alert('Очистить журнал', `Удалить ${label}?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          if (filter === 'all') {
            await clearLogs();
          } else {
            await clearLogsByLevel(filter as LogLevel);
          }
          setAllLogs([...getLogs()]);
        },
      },
    ]);
  }, [filter]);

  const handleCopy = useCallback(async () => {
    try {
      const text = getLogsAsText(filter === 'all' ? undefined : filter as LogLevel);
      if (!text) {
        Alert.alert('Пусто', 'Нет записей для копирования');
        return;
      }
      if (Platform.OS !== 'web') {
        const Clipboard = await import('expo-clipboard');
        await Clipboard.setStringAsync(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      Alert.alert('Скопировано', 'Журнал скопирован в буфер обмена');
    } catch {
      Alert.alert('Ошибка', 'Не удалось скопировать');
    }
  }, [filter]);

  const renderItem = useCallback(({ item }: { item: LogEntry }) => (
    <LogEntryCard entry={item} colors={colors} />
  ), [colors]);

  const keyExtractor = useCallback((item: LogEntry) => item.id, []);

  const filterOptions: { key: FilterLevel; label: string; color: string; count: number }[] = [
    { key: 'all', label: 'Все', color: colors.primary, count: allLogs.length },
    { key: 'error', label: 'Ошибки', color: colors.error, count: counts.error },
    { key: 'warn', label: 'Предупр.', color: colors.warning, count: counts.warn },
    { key: 'info', label: 'Инфо', color: colors.info, count: counts.info },
    { key: 'debug', label: 'Отладка', color: colors.textMuted, count: counts.debug },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Журнал отладки' }} />

      <View style={styles.filterRow}>
        {filterOptions.map(opt => {
          const isActive = filter === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isActive ? opt.color + '20' : colors.surfaceElevated,
                  borderColor: isActive ? opt.color : colors.border,
                },
              ]}
              onPress={() => setFilter(opt.key)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.filterChipText,
                { color: isActive ? opt.color : colors.textSecondary },
              ]}
                numberOfLines={1}
              >
                {opt.label}
              </Text>
              {opt.count > 0 && (
                <View style={[styles.filterBadge, { backgroundColor: isActive ? opt.color : colors.textMuted + '40' }]}>
                  <Text style={styles.filterBadgeText}>{opt.count > 99 ? '99+' : opt.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} activeOpacity={0.7}>
          <Copy size={16} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.primary }]}>Копировать</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.error + '30' }]} onPress={handleClear} activeOpacity={0.7}>
          <Trash2 size={16} color={colors.error} />
          <Text style={[styles.actionText, { color: colors.error }]}>Очистить</Text>
        </TouchableOpacity>
      </View>

      {filteredLogs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ShieldAlert size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Записей нет</Text>
          <Text style={styles.emptySubtext}>
            {filter === 'all'
              ? 'Все логи будут отображаться здесь для отладки'
              : `Нет записей типа "${getLevelLabel(filter as LogLevel)}"`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
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
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: '600',
    },
    filterBadge: {
      minWidth: 20,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    filterBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 10,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionText: {
      fontSize: 13,
      fontWeight: '600',
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    emptySubtext: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
    },
    listContent: {
      padding: 16,
      paddingTop: 4,
    },
  });
}
