import { Platform } from 'react-native';

let BackgroundService = null;

// This module is Android-only and requires a native build (dev-client / standalone).
try {
  // `react-native-background-actions` exports default.
  // We require lazily to avoid breaking Expo Go / unsupported runtimes.
  // eslint-disable-next-line global-require
  BackgroundService = require('react-native-background-actions').default;
} catch {
  BackgroundService = null;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const defaultOptions = {
  taskName: 'HikeSafe',
  taskTitle: 'HikeSafe monitoring active',
  taskDesc: 'Listening for SOS alerts in the background',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#2E7D32',
  linkingURI: 'exp+hsafenew://',
  parameters: {
    intervalMs: 30000,
  },
};

const backgroundTask = async (taskDataArguments) => {
  const intervalMs = taskDataArguments?.intervalMs ?? 30000;
  // Keep JS alive with a low-frequency loop.
  // BLE notifications and expo-notifications scheduling can run while the service is active.
  // Note: if Android kills the process due to OEM/battery settings, users must disable battery optimizations.
  while (BackgroundService?.isRunning?.()) {
    // If you ever want to add keepalives, do it here.
    // Avoid tight loops to prevent battery drain.
    // eslint-disable-next-line no-await-in-loop
    await sleep(intervalMs);
  }
};

export const startAndroidMonitorService = async ({ title, desc } = {}) => {
  if (Platform.OS !== 'android') return false;
  if (!BackgroundService?.start) return false;

  try {
    if (BackgroundService.isRunning()) {
      if (BackgroundService.updateNotification && (title || desc)) {
        await BackgroundService.updateNotification({
          taskTitle: title || defaultOptions.taskTitle,
          taskDesc: desc || defaultOptions.taskDesc,
        });
      }
      return true;
    }

    const options = {
      ...defaultOptions,
      taskTitle: title || defaultOptions.taskTitle,
      taskDesc: desc || defaultOptions.taskDesc,
    };

    await BackgroundService.start(backgroundTask, options);
    return true;
  } catch (e) {
    console.log('Failed to start Android monitor service:', e?.message || e);
    return false;
  }
};

export const stopAndroidMonitorService = async () => {
  if (Platform.OS !== 'android') return false;
  if (!BackgroundService?.stop) return false;

  try {
    if (!BackgroundService.isRunning()) return true;
    await BackgroundService.stop();
    return true;
  } catch (e) {
    console.log('Failed to stop Android monitor service:', e?.message || e);
    return false;
  }
};
