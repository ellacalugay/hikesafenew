import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BREADCRUMBS_KEY = '@hikesafe_breadcrumbs';
export const BREADCRUMB_TASK_NAME = 'hikesafe-breadcrumbs-task';

const getLocalDayStamp = (ts = Date.now()) => {
  try {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
};

const haversineMeters = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const R = 6371e3;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * (Math.sin(Δλ / 2) ** 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
};

TaskManager.defineTask(BREADCRUMB_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.log('Breadcrumb task error:', error?.message || error);
    return;
  }

  const locations = data?.locations;
  if (!Array.isArray(locations) || locations.length === 0) return;

  try {
    const savedRaw = await AsyncStorage.getItem(BREADCRUMBS_KEY);
    const saved = savedRaw ? JSON.parse(savedRaw) : {};
    const isTracking = !!saved?.isTracking;
    if (!isTracking) return;

    const today = getLocalDayStamp(Date.now());
    const sessionDay = saved?.sessionDay || today;
    const points = Array.isArray(saved?.points) ? saved.points : [];

    // If it rolled over to a new day, start fresh.
    const effectiveSessionDay = sessionDay === today ? sessionDay : today;
    const filtered = effectiveSessionDay === sessionDay ? points : [];

    let next = filtered;
    const last = next.length > 0 ? next[next.length - 1] : null;

    for (const loc of locations) {
      const coords = loc?.coords;
      const lat = coords?.latitude;
      const lng = coords?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      if (lat === 0 || lng === 0) continue;

      const point = {
        lat,
        lng,
        altitude: typeof coords?.altitude === 'number' ? coords.altitude : null,
        timestamp: typeof loc?.timestamp === 'number' ? loc.timestamp : Date.now(),
      };

      const lastPoint = next.length > 0 ? next[next.length - 1] : last;
      if (lastPoint) {
        const dist = haversineMeters(lastPoint, point);
        if (dist < 10) continue;
      }

      next = [...next, point];
    }

    const MAX_POINTS_TO_STORE = 5000;
    const capped = next
      .filter(p => p && typeof p.timestamp === 'number' && getLocalDayStamp(p.timestamp) === today)
      .slice(-MAX_POINTS_TO_STORE);

    await AsyncStorage.setItem(
      BREADCRUMBS_KEY,
      JSON.stringify({
        points: capped,
        isTracking: true,
        sessionDay: effectiveSessionDay,
      })
    );
  } catch (e) {
    console.log('Breadcrumb task save failed:', e?.message || e);
  }
});

export const startBreadcrumbBackgroundUpdates = async () => {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!(fg?.granted || fg?.status === 'granted')) return false;

    // Android requires explicit background permission request for best reliability.
    const bg = await Location.requestBackgroundPermissionsAsync();
    // If bg is denied, we still try; some devices allow while a foreground service is running.

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK_NAME);
    if (hasStarted) return true;

    await Location.startLocationUpdatesAsync(BREADCRUMB_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000,
      distanceInterval: 10,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'HikeSafe trail tracking',
        notificationBody: 'Recording breadcrumbs in the background',
      },
    });

    return true;
  } catch (e) {
    console.log('Failed to start breadcrumb background updates:', e?.message || e);
    return false;
  }
};

export const stopBreadcrumbBackgroundUpdates = async () => {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK_NAME);
    if (!hasStarted) return true;
    await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK_NAME);
    return true;
  } catch (e) {
    console.log('Failed to stop breadcrumb background updates:', e?.message || e);
    return false;
  }
};
