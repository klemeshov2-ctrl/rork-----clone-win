export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  success: string;
  error: string;
  warning: string;
  info: string;
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
  overlay: string;
}

export interface AppTheme {
  id: string;
  name: string;
  preview: string[];
  colors: ThemeColors;
}

const darkColors: ThemeColors = {
  primary: '#FF6B00',
  secondary: '#FF8C3A',
  background: '#0A0A0F',
  surface: '#141418',
  surfaceElevated: '#1C1C24',
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#707070',
  border: '#2A2A35',
  success: '#66BB6A',
  error: '#EF5350',
  warning: '#FFA726',
  info: '#42A5F5',
  tint: '#FF6B00',
  tabIconDefault: '#606068',
  tabIconSelected: '#FF6B00',
  overlay: 'rgba(0,0,0,0.7)',
};

const lightColors: ThemeColors = {
  primary: '#FF6B00',
  secondary: '#FF8C3A',
  background: '#F5F5F5',
  surface: '#EEEEEE',
  surfaceElevated: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#4A4A4A',
  textMuted: '#8A8A8A',
  border: '#D8D8D8',
  success: '#2E7D32',
  error: '#C62828',
  warning: '#EF6C00',
  info: '#1565C0',
  tint: '#FF6B00',
  tabIconDefault: '#8A8A8A',
  tabIconSelected: '#FF6B00',
  overlay: 'rgba(0,0,0,0.5)',
};

const oceanColors: ThemeColors = {
  primary: '#22B8CF',
  secondary: '#3BC9DB',
  background: '#091B22',
  surface: '#0F2830',
  surfaceElevated: '#16343E',
  text: '#E8F6F8',
  textSecondary: '#8CC4D0',
  textMuted: '#4E8A96',
  border: '#1E4450',
  success: '#51CF66',
  error: '#FF6B6B',
  warning: '#FFD43B',
  info: '#22B8CF',
  tint: '#22B8CF',
  tabIconDefault: '#4E8A96',
  tabIconSelected: '#22B8CF',
  overlay: 'rgba(5,18,28,0.75)',
};

const emeraldColors: ThemeColors = {
  primary: '#40C057',
  secondary: '#69DB7C',
  background: '#0A1A0E',
  surface: '#112818',
  surfaceElevated: '#183420',
  text: '#E8F8EC',
  textSecondary: '#8CCCA0',
  textMuted: '#4E8A60',
  border: '#1E5030',
  success: '#40C057',
  error: '#FF6B6B',
  warning: '#FFD43B',
  info: '#339AF0',
  tint: '#40C057',
  tabIconDefault: '#4E8A60',
  tabIconSelected: '#40C057',
  overlay: 'rgba(5,18,8,0.75)',
};

const midnightColors: ThemeColors = {
  primary: '#7C8FFF',
  secondary: '#9AA8FF',
  background: '#080A14',
  surface: '#0E1225',
  surfaceElevated: '#151A32',
  text: '#E0E4F8',
  textSecondary: '#8890B8',
  textMuted: '#505878',
  border: '#1E2448',
  success: '#66BB6A',
  error: '#EF5350',
  warning: '#FFA726',
  info: '#7C8FFF',
  tint: '#7C8FFF',
  tabIconDefault: '#505878',
  tabIconSelected: '#7C8FFF',
  overlay: 'rgba(4,5,14,0.8)',
};

export const themes: AppTheme[] = [
  {
    id: 'dark',
    name: 'Тёмная (по умолчанию)',
    preview: ['#FF6B00', '#0A0A0F', '#1C1C24'],
    colors: darkColors,
  },
  {
    id: 'ocean',
    name: 'Океан',
    preview: ['#22B8CF', '#091B22', '#16343E'],
    colors: oceanColors,
  },
  {
    id: 'emerald',
    name: 'Изумруд',
    preview: ['#40C057', '#0A1A0E', '#183420'],
    colors: emeraldColors,
  },
  {
    id: 'midnight',
    name: 'Полночь',
    preview: ['#7C8FFF', '#080A14', '#151A32'],
    colors: midnightColors,
  },
  {
    id: 'light',
    name: 'Светлая',
    preview: ['#FF6B00', '#F5F5F5', '#FFFFFF'],
    colors: lightColors,
  },
];

export default {
  light: {
    text: lightColors.text,
    background: lightColors.background,
    tint: lightColors.tint,
    tabIconDefault: lightColors.tabIconDefault,
    tabIconSelected: lightColors.tabIconSelected,
  },
};
