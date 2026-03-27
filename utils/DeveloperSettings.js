/**
 * DeveloperSettings - Dev-only tweaks and debug controls
 * This file manages development features like:
 * - Performance monitor toggle
 * - Memory leak detection toggle
 * - Performance report logging
 * - Reset debug data
 */

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@hikesafe_dev_settings';

export const DEV_SETTINGS = {
  SHOW_PERFORMANCE_MONITOR: 'showPerformanceMonitor',
  SHOW_RENDER_PROFILER: 'showRenderProfiler',
  LOG_MEMORY_DEBUG: 'logMemoryDebug',
  ENABLE_SLOW_ANIMATIONS: 'enableSlowAnimations', // Slow down animations for debugging
};

// Default settings
const DEFAULT_SETTINGS = {
  [DEV_SETTINGS.SHOW_PERFORMANCE_MONITOR]: false,
  [DEV_SETTINGS.SHOW_RENDER_PROFILER]: false,
  [DEV_SETTINGS.LOG_MEMORY_DEBUG]: false,
  [DEV_SETTINGS.ENABLE_SLOW_ANIMATIONS]: false,
};

/**
 * Get all developer settings
 */
export const getDeveloperSettings = async () => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
  } catch (error) {
    console.warn('Failed to load developer settings:', error);
    return DEFAULT_SETTINGS;
  }
};

/**
 * Get a single developer setting
 */
export const getDeveloperSetting = async (key) => {
  const settings = await getDeveloperSettings();
  return settings[key] ?? DEFAULT_SETTINGS[key];
};

/**
 * Set a developer setting
 */
export const setDeveloperSetting = async (key, value) => {
  try {
    const settings = await getDeveloperSettings();
    settings[key] = value;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.warn('Failed to save developer setting:', error);
    return false;
  }
};

/**
 * Toggle a developer setting
 */
export const toggleDeveloperSetting = async (key) => {
  const current = await getDeveloperSetting(key);
  return setDeveloperSetting(key, !current);
};

/**
 * Reset all developer settings to defaults
 */
export const resetDeveloperSettings = async () => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
    return true;
  } catch (error) {
    console.warn('Failed to reset developer settings:', error);
    return false;
  }
};

/**
 * Hook to use a developer setting
 * Usage: const [showMonitor, setShowMonitor] = useDeveloperSetting(DEV_SETTINGS.SHOW_PERFORMANCE_MONITOR);
 */
export const useDeveloperSetting = (settingKey) => {
  const [value, setValue] = React.useState(DEFAULT_SETTINGS[settingKey]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadSetting = async () => {
      const loaded = await getDeveloperSetting(settingKey);
      setValue(loaded);
      setIsLoading(false);
    };
    loadSetting();
  }, [settingKey]);

  const setSetting = async (newValue) => {
    setValue(newValue);
    await setDeveloperSetting(settingKey, newValue);
  };

  return [value, setSetting, isLoading];
};

export default {
  DEV_SETTINGS,
  getDeveloperSettings,
  getDeveloperSetting,
  setDeveloperSetting,
  toggleDeveloperSetting,
  resetDeveloperSettings,
  useDeveloperSetting,
};
