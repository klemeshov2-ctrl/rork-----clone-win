import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { themes, ThemeColors, AppTheme } from '@/constants/colors';

const THEME_KEY = '@master_journal_theme';

export const [ThemeProvider, useTheme] = createContextHook(() => {
  const [themeId, setThemeId] = useState<string>('light');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(stored => {
      if (stored && themes.find(t => t.id === stored)) {
        setThemeId(stored);
      }
      setIsLoaded(true);
    }).catch(() => {
      setIsLoaded(true);
    });
  }, []);

  const setTheme = useCallback(async (id: string) => {
    setThemeId(id);
    await AsyncStorage.setItem(THEME_KEY, id);
  }, []);

  const currentTheme: AppTheme = themes.find(t => t.id === themeId) || themes[0];
  const colors: ThemeColors = currentTheme.colors;

  return useMemo(() => ({ themeId, setTheme, colors, currentTheme, themes, isLoaded }), [themeId, setTheme, colors, currentTheme, isLoaded]);
});

export function useThemeColors(): ThemeColors {
  const { colors } = useTheme();
  return colors;
}
