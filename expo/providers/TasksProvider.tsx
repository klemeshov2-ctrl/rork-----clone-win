import { useCallback, useEffect, useMemo, useState } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { Task } from '@/types';
import { useDatabase } from './DatabaseProvider';
import { generateId } from '@/lib/utils';
import { scheduleTaskNotifications, cancelTaskNotifications } from '@/lib/notifications';

interface TasksContextType {
  tasks: Task[];
  isLoading: boolean;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'isCompleted' | 'completedAt'>) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  uncompleteTask: (id: string) => Promise<void>;
  getTasksByObject: (objectId: string) => Task[];
  getActiveTasks: () => Task[];
  getCompletedTasks: () => Task[];
  getOverdueTasks: () => Task[];
  getTodayTasks: () => Task[];
  getTomorrowTasks: () => Task[];
  getLaterTasks: () => Task[];
  getNoDateTasks: () => Task[];
  refreshData: () => Promise<void>;
  setGetObjectName: (resolver: (id: string) => string | undefined) => void;
}

function getStartOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function getEndOfDay(date: Date): number {
  return getStartOfDay(date) + 24 * 60 * 60 * 1000;
}

export const [TasksProvider, useTasks] = createContextHook<TasksContextType>(() => {
  const { db, isReady } = useDatabase();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [objectNameResolver, setObjectNameResolver] = useState<((id: string) => string | undefined) | null>(null);

  const setGetObjectName = useCallback((resolver: (id: string) => string | undefined) => {
    setObjectNameResolver(() => resolver);
  }, []);

  const loadTasks = useCallback(async () => {
    if (!db) return;
    console.log('[TasksProvider] Loading tasks...');
    const result = await db.getAllAsync<any>(
      `SELECT id, type, object_id as objectId, object_name as objectName, title, description, 
       due_date as dueDate, due_time as dueTime, is_completed as isCompleted, 
       completed_at as completedAt, created_at as createdAt 
       FROM tasks ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, created_at DESC`
    );
    const parsed: Task[] = result.map((row: any) => ({
      ...row,
      isCompleted: Boolean(row.isCompleted),
      objectId: row.objectId || undefined,
      objectName: row.objectName || undefined,
      dueDate: row.dueDate || undefined,
      dueTime: row.dueTime || undefined,
      completedAt: row.completedAt || undefined,
      description: row.description || undefined,
    }));
    console.log(`[TasksProvider] Loaded ${parsed.length} tasks`);
    setTasks(parsed);
  }, [db]);

  const refreshData = useCallback(async () => {
    if (!db) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      await loadTasks();
    } catch (error) {
      console.error('[TasksProvider] Error loading tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [db, loadTasks]);

  useEffect(() => {
    if (isReady) {
      void refreshData();
    }
  }, [isReady, refreshData]);

  const addTask = useCallback(async (task: Omit<Task, 'id' | 'createdAt' | 'isCompleted' | 'completedAt'>) => {
    if (!db) throw new Error('Database not ready');
    const id = generateId();
    const now = Date.now();
    console.log('[TasksProvider] Adding task:', { id, type: task.type, title: task.title });
    await db.runAsync(
      `INSERT INTO tasks (id, type, object_id, object_name, title, description, due_date, due_time, is_completed, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, task.type, task.objectId || null, task.objectName || null, task.title, task.description || null, task.dueDate || null, task.dueTime || null, 0, null, now]
    );
    await loadTasks();

    if (task.dueDate) {
      const newTask: Task = { id, ...task, isCompleted: false, createdAt: now };
      const objName = task.objectName || (task.objectId && objectNameResolver ? objectNameResolver(task.objectId) : undefined);
      void scheduleTaskNotifications(newTask, objName);
    }
  }, [db, loadTasks, objectNameResolver]);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    if (!db) throw new Error('Database not ready');
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.type !== undefined) { sets.push('type = ?'); values.push(updates.type); }
    if (updates.objectId !== undefined) { sets.push('object_id = ?'); values.push(updates.objectId || null); }
    if (updates.objectName !== undefined) { sets.push('object_name = ?'); values.push(updates.objectName || null); }
    if (updates.title !== undefined) { sets.push('title = ?'); values.push(updates.title); }
    if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description || null); }
    if ('dueDate' in updates) { sets.push('due_date = ?'); values.push(updates.dueDate || null); }
    if (updates.dueTime !== undefined) { sets.push('due_time = ?'); values.push(updates.dueTime || null); }
    if (updates.isCompleted !== undefined) { sets.push('is_completed = ?'); values.push(updates.isCompleted ? 1 : 0); }
    if (updates.completedAt !== undefined) { sets.push('completed_at = ?'); values.push(updates.completedAt || null); }

    if (sets.length === 0) return;
    values.push(id);

    await db.runAsync(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, values);
    await loadTasks();

    if ('dueDate' in updates || updates.dueTime !== undefined || updates.title !== undefined || updates.isCompleted !== undefined) {
      const updated = tasks.find(t => t.id === id);
      if (updated) {
        const merged: Task = { ...updated, ...updates };
        if (merged.isCompleted || !merged.dueDate) {
          void cancelTaskNotifications(id);
        } else {
          const objName = merged.objectName || (merged.objectId && objectNameResolver ? objectNameResolver(merged.objectId) : undefined);
          void scheduleTaskNotifications(merged, objName);
        }
      }
    }
  }, [db, loadTasks, tasks, objectNameResolver]);

  const deleteTask = useCallback(async (id: string) => {
    if (!db) throw new Error('Database not ready');
    void cancelTaskNotifications(id);
    await db.runAsync('DELETE FROM tasks WHERE id = ?', [id]);
    await loadTasks();
  }, [db, loadTasks]);

  const completeTask = useCallback(async (id: string) => {
    void cancelTaskNotifications(id);
    await updateTask(id, { isCompleted: true, completedAt: Date.now() });
  }, [updateTask]);

  const uncompleteTask = useCallback(async (id: string) => {
    await updateTask(id, { isCompleted: false, completedAt: undefined });
    const task = tasks.find(t => t.id === id);
    if (task && task.dueDate) {
      const objName = task.objectName || (task.objectId && objectNameResolver ? objectNameResolver(task.objectId) : undefined);
      void scheduleTaskNotifications({ ...task, isCompleted: false }, objName);
    }
  }, [updateTask, tasks, objectNameResolver]);

  const getTasksByObject = useCallback((objectId: string) => tasks.filter(t => t.objectId === objectId), [tasks]);

  const getActiveTasks = useCallback(() => tasks.filter(t => !t.isCompleted), [tasks]);
  const getCompletedTasks = useCallback(() => tasks.filter(t => t.isCompleted), [tasks]);

  const getNoDateTasks = useCallback(() => {
    return tasks.filter(t => !t.isCompleted && !t.dueDate);
  }, [tasks]);

  const getOverdueTasks = useCallback(() => {
    const todayStart = getStartOfDay(new Date());
    return tasks.filter(t => !t.isCompleted && t.dueDate != null && t.dueDate < todayStart);
  }, [tasks]);

  const getTodayTasks = useCallback(() => {
    const now = new Date();
    const start = getStartOfDay(now);
    const end = getEndOfDay(now);
    return tasks.filter(t => !t.isCompleted && t.dueDate != null && t.dueDate >= start && t.dueDate < end);
  }, [tasks]);

  const getTomorrowTasks = useCallback(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start = getStartOfDay(tomorrow);
    const end = getEndOfDay(tomorrow);
    return tasks.filter(t => !t.isCompleted && t.dueDate != null && t.dueDate >= start && t.dueDate < end);
  }, [tasks]);

  const getLaterTasks = useCallback(() => {
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const start = getStartOfDay(dayAfterTomorrow);
    return tasks.filter(t => !t.isCompleted && t.dueDate != null && t.dueDate >= start);
  }, [tasks]);

  return useMemo(() => ({
    tasks, isLoading,
    addTask, updateTask, deleteTask, completeTask, uncompleteTask,
    getTasksByObject, getActiveTasks, getCompletedTasks,
    getOverdueTasks, getTodayTasks, getTomorrowTasks, getLaterTasks, getNoDateTasks,
    refreshData, setGetObjectName,
  }), [tasks, isLoading, addTask, updateTask, deleteTask, completeTask, uncompleteTask, getTasksByObject, getActiveTasks, getCompletedTasks, getOverdueTasks, getTodayTasks, getTomorrowTasks, getLaterTasks, getNoDateTasks, refreshData, setGetObjectName]);
});
