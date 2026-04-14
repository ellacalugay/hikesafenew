import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_COLORS, LIGHT_COLORS } from '../constants/theme';

const ThemeContext = createContext();

const DARK_MODE_KEY = '@hikesafe_theme_dark_mode';
const LEGACY_DARK_MODE_KEY = 'darkMode';

// Theme palettes now live in `constants/theme.js`.

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
