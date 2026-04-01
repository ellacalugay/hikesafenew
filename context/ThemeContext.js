import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

const DARK_MODE_KEY = '@hikesafe_theme_dark_mode';
const LEGACY_DARK_MODE_KEY = 'darkMode';

export const LIGHT_COLORS = {
  primary: '#4d7c0f',
  primaryLight: '#65a30d',
  accent: '#a3e635',
  background: '#f7fee7',
  textDark: '#1a2e05',
  textLight: '#ffffff',
  gray: '#9ca3af',
  cardBg: 'white',
  overlay: 'rgba(255,255,255,0)',
  headerBg: '#9dc5a9',
  inputBg: '#f3f4f6',
  borderColor: '#e5e7eb',
  modalBg: 'white',
  surfaceBg: 'white',
  greetBn: ['#2e7d32', '#4caf50', '#7db241', '#a5de0a'],
  profileBg: "#E8E8E8",
  messageBg: "#B5D5A0",
  locationBg: "#C5DDB5",
  compassBg: "#F0C87A",

};

export const DARK_COLORS = {
  primary: '#65a30d',
  primaryLight: '#4d7c0f',
  accent: '#84cc16',
  background: '#1a1a1a',
  textDark: '#f5f5f5',
  textLight: '#ffffff',
  gray: '#9ca3af',
  cardBg: 'rgba(45, 45, 45, 0.95)',
  overlay: 'rgba(0,0,0,0.425)',
  headerBg: '#252525',
  inputBg: '#333333',
  borderColor: '#404040',
  modalBg: '#2d2d2d',
  surfaceBg: '#252525',
  // Dark-mode service background colors - muted/darker variants
  greetBn: ['#1a431c9e', '#2d5e2e62', '#4b6a277e', '#57720b7b'],
  profileBg: '#424141',
  messageBg: '#52684a',
  locationBg: '#3f4f3f',
  compassBg: '#6b5a2f',
};

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const [savedTheme, legacySavedTheme] = await Promise.all([
        AsyncStorage.getItem(DARK_MODE_KEY),
        AsyncStorage.getItem(LEGACY_DARK_MODE_KEY),
      ]);

      const effective = savedTheme ?? legacySavedTheme;
      if (effective !== null) {
        const nextIsDark = effective === 'true';
        setIsDarkMode(nextIsDark);
      }

      // One-time migration from legacy key -> namespaced key
      if (savedTheme === null && legacySavedTheme !== null) {
        await AsyncStorage.setItem(DARK_MODE_KEY, legacySavedTheme);
        await AsyncStorage.removeItem(LEGACY_DARK_MODE_KEY);
      }
    } catch (e) {
      console.log('Error loading theme preference');
    }
    setIsLoaded(true);
  };

  const toggleDarkMode = async (value) => {
    setIsDarkMode(value);
    try {
      await AsyncStorage.setItem(DARK_MODE_KEY, value.toString());
    } catch (e) {
      console.log('Error saving theme preference');
    }
  };

  const colors = isDarkMode ? DARK_COLORS : LIGHT_COLORS;

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode, colors, isLoaded }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
