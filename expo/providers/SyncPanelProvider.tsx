import { useState, useCallback, useMemo } from 'react';
import createContextHook from '@nkzw/create-context-hook';

interface SyncPanelContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const [SyncPanelProvider, useSyncPanel] = createContextHook<SyncPanelContextType>(() => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    console.log('[SyncPanel] Opening panel');
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    console.log('[SyncPanel] Closing panel');
    setIsOpen(false);
  }, []);

  return useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
});
