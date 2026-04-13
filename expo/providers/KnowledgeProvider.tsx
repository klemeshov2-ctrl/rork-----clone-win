import { useCallback, useEffect, useMemo, useState } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { KnowledgeItem, KnowledgeCategory } from '@/types';
import { useDatabase } from './DatabaseProvider';
import { generateId } from '@/lib/utils';
import { deleteFilesFromUnifiedDir } from '@/lib/fileManager';

interface KnowledgeContextType {
  items: KnowledgeItem[];
  categories: KnowledgeCategory[];
  isLoading: boolean;
  addItem: (item: Omit<KnowledgeItem, 'id' | 'createdAt'>) => Promise<void>;
  updateItem: (id: string, updates: Partial<KnowledgeItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  searchItems: (query: string) => KnowledgeItem[];
  getItemsByCategory: (categoryId: string) => KnowledgeItem[];
  getItemsByCategoryId: (categoryId: string | null) => KnowledgeItem[];
  addCategory: (name: string) => Promise<KnowledgeCategory>;
  updateCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  moveItemToCategory: (itemId: string, categoryId: string | null) => Promise<void>;
  refreshData: () => Promise<void>;
}

export const [KnowledgeProvider, useKnowledge] = createContextHook<KnowledgeContextType>(() => {
  const { db, isReady } = useDatabase();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadCategories = useCallback(async () => {
    if (!db) return;
    const result = await db.getAllAsync<KnowledgeCategory>(
      `SELECT id, name, created_at as createdAt FROM knowledge_categories ORDER BY name`
    );
    setCategories(result);
  }, [db]);

  const loadItems = useCallback(async () => {
    if (!db) return;
    const result = await db.getAllAsync<any>(
      `SELECT id, type, title, category, category_id as categoryId, content, file_path as filePath, file_url as fileUrl, file_size as fileSize, created_at as createdAt 
       FROM knowledge_items ORDER BY created_at DESC`
    );
    const parsed: KnowledgeItem[] = result.map((row: any) => ({
      ...row,
      categoryId: row.categoryId || undefined,
      fileUrl: row.fileUrl || undefined,
    }));
    setItems(parsed);
  }, [db]);

  const refreshData = useCallback(async () => {
    if (!db) return;
    setIsLoading(true);
    await Promise.all([loadItems(), loadCategories()]);
    setIsLoading(false);
  }, [db, loadItems, loadCategories]);

  useEffect(() => {
    if (isReady) {
      void refreshData();
    }
  }, [isReady, refreshData]);

  const addCategory = useCallback(async (name: string): Promise<KnowledgeCategory> => {
    if (!db) throw new Error('Database not ready');
    const id = generateId();
    const now = Date.now();
    await db.runAsync(
      'INSERT INTO knowledge_categories (id, name, created_at) VALUES (?, ?, ?)',
      [id, name, now]
    );
    await loadCategories();
    return { id, name, createdAt: now };
  }, [db, loadCategories]);

  const updateCategory = useCallback(async (id: string, name: string) => {
    if (!db) throw new Error('Database not ready');
    await db.runAsync('UPDATE knowledge_categories SET name = ? WHERE id = ?', [name, id]);
    await loadCategories();
  }, [db, loadCategories]);

  const deleteCategory = useCallback(async (id: string) => {
    if (!db) throw new Error('Database not ready');
    await db.runAsync('UPDATE knowledge_items SET category_id = NULL WHERE category_id = ?', [id]);
    await db.runAsync('DELETE FROM knowledge_categories WHERE id = ?', [id]);
    await Promise.all([loadCategories(), loadItems()]);
  }, [db, loadCategories, loadItems]);

  const moveItemToCategory = useCallback(async (itemId: string, categoryId: string | null) => {
    if (!db) throw new Error('Database not ready');
    await db.runAsync(
      'UPDATE knowledge_items SET category_id = ? WHERE id = ?',
      [categoryId, itemId]
    );
    await loadItems();
  }, [db, loadItems]);

  const addItem = useCallback(async (item: Omit<KnowledgeItem, 'id' | 'createdAt'>) => {
    if (!db) throw new Error('Database not ready');
    const id = generateId();
    await db.runAsync(
      'INSERT INTO knowledge_items (id, type, title, category, category_id, content, file_path, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, item.type, item.title, item.category || 'other', item.categoryId || null, item.content || null, item.filePath || null, item.fileSize || null, Date.now()]
    );
    await loadItems();
  }, [db, loadItems]);

  const updateItem = useCallback(async (id: string, updates: Partial<KnowledgeItem>) => {
    if (!db) throw new Error('Database not ready');
    const sets: string[] = [];
    const values: any[] = [];
    if (updates.title !== undefined) { sets.push('title = ?'); values.push(updates.title); }
    if (updates.category !== undefined) { sets.push('category = ?'); values.push(updates.category); }
    if (updates.categoryId !== undefined) { sets.push('category_id = ?'); values.push(updates.categoryId || null); }
    if (updates.content !== undefined) { sets.push('content = ?'); values.push(updates.content); }
    if (sets.length === 0) return;
    values.push(id);
    await db.runAsync(`UPDATE knowledge_items SET ${sets.join(', ')} WHERE id = ?`, values);
    await loadItems();
  }, [db, loadItems]);

  const deleteItem = useCallback(async (id: string) => {
    if (!db) throw new Error('Database not ready');

    const item = await db.getFirstAsync<{ file_path: string | null }>(
      'SELECT file_path FROM knowledge_items WHERE id = ?', [id]
    );
    if (item?.file_path) {
      console.log('[KnowledgeProvider] deleteItem', id, '- deleting file:', item.file_path);
      await deleteFilesFromUnifiedDir([item.file_path]);
    }

    await db.runAsync('DELETE FROM knowledge_items WHERE id = ?', [id]);
    await loadItems();
  }, [db, loadItems]);

  const searchItems = useCallback((query: string) => {
    const q = query.toLowerCase();
    return items.filter(i => 
      i.title.toLowerCase().includes(q) || 
      (i.content && i.content.toLowerCase().includes(q))
    );
  }, [items]);

  const getItemsByCategory = useCallback((category: string) => 
    items.filter(i => i.category === category), [items]);

  const getItemsByCategoryId = useCallback((categoryId: string | null) => 
    categoryId ? items.filter(i => i.categoryId === categoryId) : items.filter(i => !i.categoryId), [items]);

  return useMemo(() => ({
    items, categories, isLoading,
    addItem, updateItem, deleteItem, searchItems,
    getItemsByCategory, getItemsByCategoryId,
    addCategory, updateCategory, deleteCategory, moveItemToCategory,
    refreshData,
  }), [items, categories, isLoading, addItem, updateItem, deleteItem, searchItems, getItemsByCategory, getItemsByCategoryId, addCategory, updateCategory, deleteCategory, moveItemToCategory, refreshData]);
});
