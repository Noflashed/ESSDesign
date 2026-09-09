// Derived from ESSApp/src/theme/appTheme.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
export const Colors = {
  primary: '#1976D2',
  primaryDark: '#1565C0',
  accent: '#42A5F5',
  error: '#D32F2F',
  success: '#388E3C',
  warning: '#F57C00',

  // Light theme
  light: {
    background: '#F5F5F5',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    text: '#212121',
    textSecondary: '#757575',
    border: '#E0E0E0',
    divider: '#EEEEEE',
    inputBackground: '#F5F5F5',
    appBar: '#1976D2',
    appBarText: '#FFFFFF',
    placeholder: '#9E9E9E',
    chip: '#E3F2FD',
    chipText: '#1565C0',
  },

  // Dark theme
  dark: {
    background: '#121212',
    surface: '#1E1E1E',
    card: '#2C2C2C',
    text: '#FFFFFF',
    textSecondary: '#AAAAAA',
    border: '#333333',
    divider: '#2A2A2A',
    inputBackground: '#2C2C2C',
    appBar: '#1E1E1E',
    appBarText: '#FFFFFF',
    placeholder: '#666666',
    chip: '#1A3A5C',
    chipText: '#90CAF9',
  },

  folderColor: '#FFC107',
  documentColor: '#1976D2',
  essColor: '#D32F2F',
  thirdPartyColor: '#F57C00',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  xxxl: 32,
} as const;

export type ThemeMode = 'light' | 'dark';

export function getTheme(_mode: ThemeMode) {
  return Colors.light;
}
