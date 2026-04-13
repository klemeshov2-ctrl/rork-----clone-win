import { useCallback, useEffect, useMemo, useState } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { InventoryItem, InventoryCategory } from '@/types';
import { useDatabase } from './DatabaseProvider';
import { generateId } from '@/lib/utils';

interface InventoryContextType {
  items: InventoryItem[];
  categories: InventoryCategory[];
  isLoading: boolean;
  addItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<InventoryItem>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  consumeItem: (id: string, quantity: number) => Promise<boolean>;
  getLowStockItems: () => InventoryItem[];
  getItem: (id: string) => InventoryItem | undefined;
  addCategory: (name: string) => Promise<InventoryCategory>;
  updateCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

export const [InventoryProvider, useInventory] = createContextHook<InventoryContextType>(() => {
  const { db, isReady } = useDatabase();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadCategories = useCallback(async () => {
    if (!db) return;
    const result = await db.getAllAsync<InventoryCategory>(
      `SELECT id, name FROM inventory_categories ORDER BY name`
    );
    setCategories(result);
  }, [db]);

  const loadItems = useCallback(async () => {
    if (!db) return;
    const result = await db.getAllAsync<any>(
      `SELECT id, name, quantity, unit, min_quantity as minQuantity, category_id as categoryId, created_at as createdAt, updated_at as updatedAt 
       FROM inventory ORDER BY name`
    );
    const parsed: InventoryItem[] = result.map((row: any) => ({
      ...row,
      categoryId: row.categoryId || undefined,
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

  const addCategory = useCallback(async (name: string): Promise<InventoryCategory> => {
    if (!db) throw new Error('Database not ready');
    const id = generateId();
    await db.runAsync('INSERT INTO inventory_categories (id, name) VALUES (?, ?)', [id, name]);
    await loadCategories();
    return { id, name };
  }, [db, loadCategories]);

  const updateCategory = useCallback(async (id: string, name: string) => {
    if (!db) throw new Error('Database not ready');
    await db.runAsync('UPDATE inventory_categories SET name = ? WHERE id = ?', [name, id]);
    await loadCategories();
  }, [db, loadCategories]);

  const deleteCategory = useCallback(async (id: string) => {
    if (!db) throw new Error('Database not ready');
    await db.runAsync('UPDATE inventory SET category_id = NULL WHERE category_id = ?', [id]);
    await db.runAsync('DELETE FROM inventory_categories WHERE id = ?', [id]);
    await Promise.all([loadCategories(), loadItems()]);
  }, [db, loadCategories, loadItems]);

  const addItem = useCallback(async (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<InventoryItem> => {
    if (!db) throw new Error('Database not ready');
    const id = generateId();
    const now = Date.now();
    await db.runAsync(
      'INSERT INTO inventory (id, name, quantity, unit, min_quantity, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, item.name, item.quantity, item.unit, item.minQuantity, item.categoryId || null, now, now]
    );
    await loadItems();
    return { id, ...item, createdAt: now, updatedAt: now };
  }, [db, loadItems]);

  const updateItem = useCallback(async (id: string, updates: Partial<InventoryItem>) => {
    if (!db) throw new Error('Database not ready');
    const sets: string[] = [];
    const values: any[] = [];
    if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
    if (updates.quantity !== undefined) { sets.push('quantity = ?'); values.push(updates.quantity); }
    if (updates.unit !== undefined) { sets.push('unit = ?'); values.push(updates.unit); }
    if (updates.minQuantity !== undefined) { sets.push('min_quantity = ?'); values.push(updates.minQuantity); }
    if (updates.categoryId !== undefined) { sets.push('category_id = ?'); values.push(updates.categoryId || null); }
    sets.push('updated_at = ?'); values.push(Date.now());
    values.push(id);
    await db.runAsync(`UPDATE inventory SET ${sets.join(', ')} WHERE id = ?`, values);
    await loadItems();
  }, [db, loadItems]);

  const deleteItem = useCallback(async (id: string) => {
    if (!db) throw new Error('Database not ready');
    await db.runAsync('DELETE FROM inventory WHERE id = ?', [id]);
    await loadItems();
  }, [db, loadItems]);

  const consumeItem = useCallback(async (id: string, quantity: number): Promise<boolean> => {
    if (!db) throw new Error('Database not ready');
    const item = items.find(i => i.id === id);
    if (!item || item.quantity < quantity) return false;
    await db.runAsync(
      'UPDATE inventory SET quantity = ?, updated_at = ? WHERE id = ?',
      [item.quantity - quantity, Date.now(), id]
    );
    await loadItems();
    return true;
  }, [db, items, loadItems]);

  const getLowStockItems = useCallback(() => items.filter(item => item.quantity <= item.minQuantity), [items]);
  const getItem = useCallback((id: string) => items.find(i => i.id === id), [items]);

  return useMemo(() => ({
    items, categories, isLoading,
    addItem, updateItem, deleteItem, consumeItem, getLowStockItems, getItem,
    addCategory, updateCategory, deleteCategory,
    refreshData,
  }), [items, categories, isLoading, addItem, updateItem, deleteItem, consumeItem, getLowStockItems, getItem, addCategory, updateCategory, deleteCategory, refreshData]);
});
