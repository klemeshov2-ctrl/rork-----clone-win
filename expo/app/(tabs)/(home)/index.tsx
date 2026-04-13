import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Search, MapPin, ChevronDown, ChevronRight, FolderPlus, Folder, Pencil, Trash2, MoveRight, ChevronsUpDown } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { useObjects } from '@/providers/ObjectsProvider';
import { ObjectItem, ObjectGroup } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

import { NotificationBell } from '@/components/NotificationBell';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { parseObjectVoice } from '@/lib/voiceParser';
import { useSubscriberGuard } from '@/providers/ProfileProvider';

type SortOrder = 'asc' | 'desc';

function ObjectCard({ object, colors, onMoveToGroup, groups }: { object: ObjectItem; colors: ThemeColors; onMoveToGroup: (objectId: string) => void; groups: ObjectGroup[] }) {
  const router = useRouter();
  return (
    <Card
      style={{ marginBottom: 10 }}
      onPress={() => router.push({ pathname: '/(home)/object-detail' as any, params: { id: object.id } })}
    >
      <View style={{ flexDirection: 'row' as const, alignItems: 'flex-start' as const }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '600' as const, color: colors.text, marginBottom: 6 }}>{object.name}</Text>
          {object.address ? (
            <View style={{ flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 5 }}>
              <MapPin size={14} color={colors.textMuted} style={{ marginTop: 2 }} />
              <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 }} numberOfLines={2}>
                {object.address}
              </Text>
            </View>
          ) : null}
          {object.systems && object.systems.length > 0 && (
            <View style={{ flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4, marginTop: 6 }}>
              {object.systems.slice(0, 4).map((sys, idx) => (
                <View key={idx} style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '600' as const }}>{sys}</Text>
                </View>
              ))}
              {object.systems.length > 4 && (
                <Text style={{ fontSize: 10, color: colors.textMuted, alignSelf: 'center' as const }}>+{object.systems.length - 4}</Text>
              )}
            </View>
          )}
        </View>
        {groups.length > 0 && (
          <TouchableOpacity onPress={() => onMoveToGroup(object.id)} style={{ padding: 6, marginLeft: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MoveRight size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
}

function GroupSection({ group, objects, colors, isExpanded, onToggle, onEdit, onDelete, onMoveToGroup, allGroups }: {
  group: ObjectGroup | null;
  objects: ObjectItem[];
  colors: ThemeColors;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMoveToGroup: (objectId: string) => void;
  allGroups: ObjectGroup[];
}) {
  const title = group ? group.name : 'Без группы';
  return (
    <View style={{ marginBottom: 8 }}>
      <TouchableOpacity
        onPress={onToggle}
        style={{
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          paddingVertical: 10,
          paddingHorizontal: 4,
          gap: 8,
        }}
      >
        {isExpanded ? <ChevronDown size={18} color={colors.textSecondary} /> : <ChevronRight size={18} color={colors.textSecondary} />}
        <Folder size={16} color={group ? colors.primary : colors.textMuted} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700' as const, color: colors.text, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginRight: 4 }}>{objects.length}</Text>
        {group && onEdit && (
          <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
            <Pencil size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
        {group && onDelete && (
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
            <Trash2 size={14} color={colors.error} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      {isExpanded && objects.map(obj => (
        <ObjectCard key={obj.id} object={obj} colors={colors} onMoveToGroup={onMoveToGroup} groups={allGroups} />
      ))}
      {isExpanded && objects.length === 0 && (
        <Text style={{ fontSize: 13, color: colors.textMuted, paddingLeft: 42, paddingVertical: 8 }}>Нет объектов</Text>
      )}
    </View>
  );
}

export default function ObjectsScreen() {
  const colors = useThemeColors();
  const { objects, groups, isLoading, addObject, addGroup, updateGroup, deleteGroup, moveObjectToGroup } = useObjects();
  const { guardEdit } = useSubscriberGuard();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ ungrouped: true });
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [moveObjectId, setMoveObjectId] = useState<string | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);

  const filteredObjects = useMemo(() => {
    let filtered = searchQuery
      ? objects.filter(o =>
          o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.address.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : objects;

    filtered = [...filtered].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, 'ru');
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [objects, searchQuery, sortOrder]);

  const groupedData = useMemo(() => {
    const grouped: { group: ObjectGroup | null; objects: ObjectItem[] }[] = [];
    const ungrouped = filteredObjects.filter(o => !o.groupId);
    
    groups.forEach(g => {
      const groupObjs = filteredObjects.filter(o => o.groupId === g.id);
      grouped.push({ group: g, objects: groupObjs });
    });
    
    grouped.push({ group: null, objects: ungrouped });
    return grouped;
  }, [filteredObjects, groups]);

  const hasGroups = groups.length > 0;

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const handleVoiceObjectResult = useCallback((text: string) => {
    console.log('[VoiceObject] Recognized:', text);
    const parsed = parseObjectVoice(text);
    console.log('[VoiceObject] Parsed:', parsed);

    if (!isAdding) setIsAdding(true);
    if (parsed.name) setNewName(parsed.name);
    if (parsed.address) setNewAddress(parsed.address);


  }, [isAdding]);

  const handleAddObject = async () => {
    if (!newName.trim()) return;
    const ok = await guardEdit();
    if (!ok) return;
    await addObject(newName.trim(), newAddress.trim());
    setNewName('');
    setNewAddress('');
    setIsAdding(false);
  };

  const handleAddGroup = async () => {
    if (!groupNameInput.trim()) return;
    const ok = await guardEdit();
    if (!ok) return;
    if (editingGroupId) {
      await updateGroup(editingGroupId, groupNameInput.trim());
    } else {
      const g = await addGroup(groupNameInput.trim());
      setExpandedGroups(prev => ({ ...prev, [g.id]: true }));
    }
    setGroupNameInput('');
    setEditingGroupId(null);
    setShowGroupModal(false);
  };

  const handleEditGroup = (group: ObjectGroup) => {
    setEditingGroupId(group.id);
    setGroupNameInput(group.name);
    setShowGroupModal(true);
  };

  const handleDeleteGroup = (group: ObjectGroup) => {
    Alert.alert('Удалить группу?', `Объекты из "${group.name}" будут перемещены в "Без группы"`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => deleteGroup(group.id) },
    ]);
  };

  const handleMoveToGroup = (objectId: string) => {
    setMoveObjectId(objectId);
    setShowMoveModal(true);
  };

  const handleSelectGroup = async (groupId: string | null) => {
    if (!moveObjectId) return;
    await moveObjectToGroup(moveObjectId, groupId);
    setMoveObjectId(null);
    setShowMoveModal(false);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Объекты</Text>
        </View>
        <NotificationBell />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.smallButton} onPress={() => setShowGroupModal(true)}>
          <FolderPlus size={20} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={() => setIsAdding(true)}>
          <Plus size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Search size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по названию или адресу..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
        >
          <Text style={{ fontSize: 12, fontWeight: '700' as const, color: colors.primary }}>{sortOrder === 'asc' ? 'А-Я' : 'Я-А'}</Text>
        </TouchableOpacity>
        {hasGroups && (
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => {
              const allExpanded = groupedData.every(g => expandedGroups[g.group?.id || 'ungrouped'] !== false);
              const newState: Record<string, boolean> = {};
              groupedData.forEach(g => { newState[g.group?.id || 'ungrouped'] = !allExpanded; });
              setExpandedGroups(newState);
            }}
          >
            <ChevronsUpDown size={18} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {isAdding && (
        <Card style={{ marginHorizontal: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600' as const, color: colors.text }}>Новый объект</Text>
            <VoiceInputButton onResult={handleVoiceObjectResult} size={36} />
          </View>
          <Input label="Название" value={newName} onChangeText={setNewName} placeholder="Например: ТЦ Мега" />
          <Input label="Адрес" value={newAddress} onChangeText={setNewAddress} placeholder="Например: ул. Ленина, 1" />
          <View style={{ flexDirection: 'row' as const, gap: 12, marginTop: 8 }}>
            <Button title="Отмена" variant="ghost" onPress={() => { setIsAdding(false); setNewName(''); setNewAddress(''); }} style={{ flex: 1 }} />
            <Button title="Добавить" onPress={handleAddObject} disabled={!newName.trim()} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={{ color: colors.textSecondary, fontSize: 16 }}>Загрузка...</Text>
        </View>
      ) : hasGroups ? (
        <FlatList
          data={groupedData}
          keyExtractor={(item) => item.group?.id || 'ungrouped'}
          renderItem={({ item }) => (
            <GroupSection
              group={item.group}
              objects={item.objects}
              colors={colors}
              isExpanded={expandedGroups[item.group?.id || 'ungrouped'] !== false}
              onToggle={() => toggleGroup(item.group?.id || 'ungrouped')}
              onEdit={item.group ? () => handleEditGroup(item.group!) : undefined}
              onDelete={item.group ? () => handleDeleteGroup(item.group!) : undefined}
              onMoveToGroup={handleMoveToGroup}
              allGroups={groups}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 18, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 8 }}>Нет объектов</Text>
              <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' as const }}>Нажмите + чтобы добавить первый объект</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredObjects}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ObjectCard object={item} colors={colors} onMoveToGroup={handleMoveToGroup} groups={groups} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 18, fontWeight: '600' as const, color: colors.textSecondary, marginBottom: 8 }}>
                {searchQuery ? 'Ничего не найдено' : 'Нет объектов'}
              </Text>
              <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' as const }}>
                {searchQuery ? 'Попробуйте изменить запрос' : 'Нажмите + чтобы добавить первый объект'}
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={showGroupModal} animationType="slide" transparent onRequestClose={() => { setShowGroupModal(false); setEditingGroupId(null); setGroupNameInput(''); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingGroupId ? 'Переименовать группу' : 'Новая группа'}</Text>
            <TextInput
              style={styles.modalInput}
              value={groupNameInput}
              onChangeText={setGroupNameInput}
              placeholder="Название группы"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <View style={{ flexDirection: 'row' as const, gap: 12 }}>
              <Button title="Отмена" variant="ghost" onPress={() => { setShowGroupModal(false); setEditingGroupId(null); setGroupNameInput(''); }} style={{ flex: 1 }} />
              <Button title={editingGroupId ? 'Сохранить' : 'Создать'} onPress={handleAddGroup} disabled={!groupNameInput.trim()} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showMoveModal} animationType="slide" transparent onRequestClose={() => { setShowMoveModal(false); setMoveObjectId(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Переместить в группу</Text>
            <TouchableOpacity
              style={styles.groupOption}
              onPress={() => handleSelectGroup(null)}
            >
              <Folder size={18} color={colors.textMuted} />
              <Text style={styles.groupOptionText}>Без группы</Text>
            </TouchableOpacity>
            {groups.map(g => (
              <TouchableOpacity
                key={g.id}
                style={styles.groupOption}
                onPress={() => handleSelectGroup(g.id)}
              >
                <Folder size={18} color={colors.primary} />
                <Text style={styles.groupOptionText}>{g.name}</Text>
              </TouchableOpacity>
            ))}
            <Button title="Отмена" variant="ghost" onPress={() => { setShowMoveModal(false); setMoveObjectId(null); }} style={{ marginTop: 12 }} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    headerLeft: {
      flex: 1,
      gap: 6,
      marginRight: 12,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
    },
    smallButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 12,
      gap: 8,
    },
    searchContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 11,
      color: colors.text,
      fontSize: 15,
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 8,
      gap: 8,
    },
    sortButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalContent: {
      width: '100%',
      backgroundColor: colors.surfaceElevated,
      borderRadius: 16,
      padding: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600' as const,
      color: colors.text,
      marginBottom: 16,
    },
    modalInput: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    groupOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.surface,
      marginBottom: 8,
    },
    groupOptionText: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '500' as const,
    },
  });
}
