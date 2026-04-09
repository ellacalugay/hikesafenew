import { Dimensions } from 'react-native';

export const { width, height } = Dimensions.get('window');

// Global spacing and sizing constants
export const SIZES = {
  base: 8,
  font: 14,
  radius: 16,
  padding: 24,
  largeTitle: 40,
  h1: 30,
  h2: 22,
  h3: 16,
  h4: 14,
};

// Theme palettes
// NOTE: Do not import these directly into component styles.
// Use `const { colors } = useTheme()` so dark mode can swap dynamically.
export const LIGHT_COLORS = {
  primary: '#4d7c0f',
  primaryLight: '#65a30d',
  accent: '#a3e635',
  danger: '#ef4444',
  background: '#f7fee7',
  textDark: '#1a2e05',
  textLight: '#ffffff',
  gray: '#9ca3af',
  cardBg: 'white',
  overlay: 'rgba(255,255,255,0)',
  glassTint: 'light',
  glassIntensity: 35,
  glassBorder: 'rgba(255,255,255,0.35)',
  glassOverlay: 'rgba(255,255,255,0.18)',
  headerBg: '#9dc5a9',
  inputBg: '#f3f4f6',
  borderColor: '#e5e7eb',
  modalBg: 'white',
  surfaceBg: 'white',
  greetBn: ['#2e7d32', '#4caf50', '#7db241', '#a5de0a'],
  profileBg: '#E8E8E8',
  messageBg: '#B5D5A0',
  locationBg: '#C5DDB5',
  compassBg: '#F0C87A',
};

export const DARK_COLORS = {
  primary: '#65a30d',
  primaryLight: '#4d7c0f',
  accent: '#84cc16',
  danger: '#ef4444',
  background: '#0f1115',
  textDark: '#f5f5f5',
  textLight: '#ffffff',
  gray: '#9ca3af',
  cardBg: '#1b1f27',
  overlay: 'rgba(0,0,0,0.55)',
  glassTint: 'dark',
  glassIntensity: 55,
  glassBorder: 'rgba(255,255,255,0.14)',
  glassOverlay: 'rgba(0,0,0,0.22)',
  headerBg: '#161a22',
  inputBg: '#1a1f2a',
  borderColor: '#2a3140',
  modalBg: '#161a22',
  surfaceBg: '#141821',
  greetBn: ['#1a431c9e', '#2d5e2e62', '#4b6a277e', '#57720b7b'],
  profileBg: '#424141',
  messageBg: '#52684a',
  locationBg: '#3f4f3f',
  compassBg: '#6b5a2f',
};
