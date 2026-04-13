import React, { useCallback, useEffect, useState } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { Reminder } from '@/types';
import { useDatabase } from './DatabaseProvider';
import { generateId } from '@/lib/utils';

interface RemindersContextType {
  reminders: Reminder[];
  isLoading: boolean;
  addReminder: (reminder: Omit<Reminder, 'id' | 'createdAt' | 'isCompleted'>) => Promise<void>;
  updateReminder: (id: string, updates: Partial<Reminder>) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  completeReminder: (id: string) => Promise<void>;
  getRemindersByObject: (objectId: string) => Reminder[];
  getOverdueReminders: () => Reminder[];
  getTodayReminders: () => Reminder[];
  refreshData: () => Promise<void>;
}

export const [RemindersProvider, useReminders] = createContextHook<RemindersContextType>(() => {
  const { db, isReady } = useDatabase();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadReminders = useCallback(async () => {
    if (!db) return;
    const result = await db.getAllAsync<any>(
      `SELECT id, object_id as objectId, title, description, due_date as dueDate, 
       is_completed as isCompleted, created_at as createdAt 
       FROM reminders ORDER BY due_date`
    );
    const parsed: Reminder[] = result.map(row => ({
      ...row,
      isCompleted: Boolean(row.isCompleted),
    }));
    setReminders(parsed);
  }, [db]);

  const refreshData = useCallback(async () => {
    if (!db) return;
    setIsLoading(true);
    await loadReminders();
    setIsLoading(false);
  }, [db, loadReminders]);

  useEffect(() => {
    if (isReady) {
      refreshData();
    }
  }, [isReady, refreshData]);

  const addReminder = async (reminder: Omit<Reminder, 'id' | 'createdAt' | 'isCompleted'>) => {
    if (!db) throw new Error('Database not ready');
    const id = generateId();
    await db.runAsync(
      'INSERT INTO reminders (id, object_id, title, description, due_date, is_completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, reminder.objectId || null, reminder.title, reminder.description || null, reminder.dueDate, 0, Date.now()]
    );
    await loadReminders();
  };

  const updateReminder = async (id: string, updates: Partial<Reminder>) => {
    if (!db) throw new Error('Database not ready');
    const sets: string[] = [];
    const values: any[] = [];
    
    if (updates.title !== undefined) { sets.push('title = ?'); values.push(updates.title); }
    if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
    if (updates.dueDate !== undefined) { sets.push('due_date = ?'); values.push(updates.dueDate); }
    if (updates.isCompleted !== undefined) { sets.push('is_completed = ?'); values.push(updates.isCompleted ? 1 : 0); }
    values.push(id);
    
    await db.runAsync(
      `UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`,
      values
    );
    await loadReminders();
  };

  const deleteReminder = async (id: string) => {
    if (!db) throw new Error('Database not ready');
    await db.runAsync('DELETE FROM reminders WHERE id = ?', [id]);
    await loadReminders();
  };

  const completeReminder = async (id: string) => {
    await updateReminder(id, { isCompleted: true });
  };

  const getRemindersByObject = (objectId: string) => reminders.filter(r => r.objectId === objectId);
  
  const getOverdueReminders = () => {
    const now = Date.now();
    return reminders.filter(r => !r.isCompleted && r.dueDate < now);
  };
  
  const getTodayReminders = () => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
    return reminders.filter(r => !r.isCompleted && r.dueDate >= startOfDay && r.dueDate < endOfDay);
  };

  return {
    reminders,
    isLoading,
    addReminder,
    updateReminder,
    deleteReminder,
    completeReminder,
    getRemindersByObject,
    getOverdueReminders,
    getTodayReminders,
    refreshData,
  };
});
