import { useCallback, useEffect, useMemo, useState } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { ChecklistTemplate, ChecklistResult } from '@/types';
import { useDatabase } from './DatabaseProvider';
import { generateId } from '@/lib/utils';

interface ChecklistsContextType {
  templates: ChecklistTemplate[];
  results: ChecklistResult[];
  isLoading: boolean;
  addTemplate: (name: string, items: { text: string }[]) => Promise<void>;
  updateTemplate: (id: string, name: string, items: { text: string }[]) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  getTemplate: (id: string) => ChecklistTemplate | undefined;
  
  addResult: (result: Omit<ChecklistResult, 'id'>) => Promise<void>;
  updateResult: (id: string, updates: Partial<ChecklistResult>) => Promise<void>;
  deleteResult: (id: string) => Promise<void>;
  getResultsByObject: (objectId: string) => ChecklistResult[];
  getResult: (id: string) => ChecklistResult | undefined;
  
  refreshData: () => Promise<void>;
}

export const [ChecklistsProvider, useChecklists] = createContextHook<ChecklistsContextType>(() => {
  const { db, isReady } = useDatabase();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [results, setResults] = useState<ChecklistResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTemplates = useCallback(async () => {
    if (!db) return;
    const rows = await db.getAllAsync<any>(
      `SELECT id, name, items, is_default as isDefault, created_at as createdAt FROM checklist_templates ORDER BY created_at`
    );
    const parsed: ChecklistTemplate[] = rows.map(row => ({
      ...row,
      isDefault: Boolean(row.isDefault),
      items: JSON.parse(row.items),
    }));
    setTemplates(parsed);
  }, [db]);

  const loadResults = useCallback(async () => {
    if (!db) return;
    const rows = await db.getAllAsync<any>(
      `SELECT id, template_id as templateId, object_id as objectId, items, completed_at as completedAt, 
       pdf_instruction_id as pdfInstructionId, sync_status as syncStatus FROM checklist_results ORDER BY completed_at DESC`
    );
    const parsed: ChecklistResult[] = rows.map(row => ({
      ...row,
      items: JSON.parse(row.items),
    }));
    setResults(parsed);
  }, [db]);

  const refreshData = useCallback(async () => {
    if (!db) return;
    setIsLoading(true);
    await Promise.all([loadTemplates(), loadResults()]);
    setIsLoading(false);
  }, [db, loadTemplates, loadResults]);

  useEffect(() => {
    if (isReady) {
      void refreshData();
    }
  }, [isReady, refreshData]);

  const addTemplate = useCallback(async (name: string, items: { text: string }[]) => {
    if (!db) throw new Error('Database not ready');
    const id = generateId();
    const templateItems = items.map((item, index) => ({
      id: `${id}_item_${index}`,
      text: item.text,
    }));
    await db.runAsync(
      'INSERT INTO checklist_templates (id, name, items, is_default, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, JSON.stringify(templateItems), 0, Date.now()]
    );
    await loadTemplates();
  }, [db, loadTemplates]);

  const updateTemplate = useCallback(async (id: string, name: string, items: { text: string }[]) => {
    if (!db) throw new Error('Database not ready');
    const templateItems = items.map((item, index) => ({
      id: `${id}_item_${index}`,
      text: item.text,
    }));
    await db.runAsync(
      'UPDATE checklist_templates SET name = ?, items = ? WHERE id = ?',
      [name, JSON.stringify(templateItems), id]
    );
    await loadTemplates();
  }, [db, loadTemplates]);

  const deleteTemplate = useCallback(async (id: string) => {
    if (!db) throw new Error('Database not ready');
    await db.runAsync('DELETE FROM checklist_templates WHERE id = ?', [id]);
    await loadTemplates();
  }, [db, loadTemplates]);

  const getTemplate = useCallback((id: string) => templates.find(t => t.id === id), [templates]);

  const addResult = useCallback(async (result: Omit<ChecklistResult, 'id'>) => {
    if (!db) throw new Error('Database not ready');
    const id = generateId();
    const params: (string | number | null)[] = [
      id, 
      result.templateId, 
      result.objectId || null, 
      JSON.stringify(result.items), 
      result.completedAt, 
      result.pdfInstructionId || null, 
      'pending'
    ];
    await db.runAsync(
      'INSERT INTO checklist_results (id, template_id, object_id, items, completed_at, pdf_instruction_id, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      params
    );
    await loadResults();
  }, [db, loadResults]);

  const updateResult = useCallback(async (id: string, updates: Partial<ChecklistResult>) => {
    if (!db) throw new Error('Database not ready');
    const sets: string[] = [];
    const values: any[] = [];
    if (updates.completedAt !== undefined) { sets.push('completed_at = ?'); values.push(updates.completedAt); }
    if (updates.items !== undefined) { sets.push('items = ?'); values.push(JSON.stringify(updates.items)); }
    if (sets.length === 0) return;
    sets.push('sync_status = ?'); values.push('pending');
    values.push(id);
    await db.runAsync(`UPDATE checklist_results SET ${sets.join(', ')} WHERE id = ?`, values);
    await loadResults();
  }, [db, loadResults]);

  const deleteResult = useCallback(async (id: string) => {
    if (!db) throw new Error('Database not ready');
    await db.runAsync('DELETE FROM checklist_results WHERE id = ?', [id]);
    await loadResults();
  }, [db, loadResults]);

  const getResultsByObject = useCallback((objectId: string) => results.filter(r => r.objectId === objectId), [results]);
  const getResult = useCallback((id: string) => results.find(r => r.id === id), [results]);

  return useMemo(() => ({
    templates,
    results,
    isLoading,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplate,
    addResult,
    updateResult,
    deleteResult,
    getResultsByObject,
    getResult,
    refreshData,
  }), [
    templates, results, isLoading,
    addTemplate, updateTemplate, deleteTemplate, getTemplate,
    addResult, updateResult, deleteResult, getResultsByObject, getResult,
    refreshData,
  ]);
});
