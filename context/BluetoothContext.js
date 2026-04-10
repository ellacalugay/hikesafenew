import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Platform, PermissionsAndroid, Vibration, NativeModules } from 'react-native';
import { Buffer } from 'buffer';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { v4 as uuidv4 } from 'uuid';
import { useLobby } from './LobbyContext';
import { startAndroidMonitorService, stopAndroidMonitorService } from '../utils/AndroidMonitorService';
import { startBreadcrumbBackgroundUpdates, stopBreadcrumbBackgroundUpdates } from '../utils/BreadcrumbBackgroundTask';
import { calculateDistance } from '../utils/math';

// Storage keys
const CHAT_HISTORY_KEY = '@hikesafe_chat_history';
const BREADCRUMBS_KEY = '@hikesafe_breadcrumbs';
const PHONE_TOKEN_KEY = '@hikesafe_phone_token';
const PHONE_MOBILE_ID_KEY = '@hikesafe_phone_mobile_id';

// Keep runtime memory bounded (storage already caps at 200).
const MAX_MESSAGES_IN_MEMORY = 300;

// Vibration patterns (milliseconds)
const VIBRATION_PATTERNS = {
  SOS: [0, 500, 200, 500, 200, 500, 400, 1000, 400, 1000, 400, 1000, 400, 500, 200, 500, 200, 500], // ...---...
  ALERT: [0, 1000, 500, 1000, 500, 1000], // Long pulses
  OK: [0, 200, 100, 200], // Short double pulse
  MESSAGE: [0, 100, 50, 100], // Quick notification
};

// BLE Library - works with ESP32 BLE (NO system pairing required!)
// Note: react-native-ble-plx requires a development build, won't work in Expo Go
let BleManager = null;
let bleAvailable = false;

// Do not rely on appOwnership to decide BLE availability.
// The reliable signal is whether the native module exists in this binary.
// If NativeModules.BlePlx is missing, importing react-native-ble-plx can crash on some setups.
const hasBleNativeModule = !!NativeModules?.BlePlx;

if (!hasBleNativeModule) {
  const ownership = Constants?.appOwnership;
  console.log('BLE native module missing (using mock mode). appOwnership=', ownership);
  bleAvailable = false;
} else {
  try {
    const blePlx = require('react-native-ble-plx');
    BleManager = blePlx.BleManager;
    bleAvailable = typeof BleManager === 'function';
    console.log('BLE module loaded successfully');
  } catch (e) {
    const ownership = Constants?.appOwnership;
    console.log('BLE not available (using mock mode). appOwnership=', ownership, 'error=', e?.message || e);
    bleAvailable = false;
  }
}

// Nordic UART Service UUIDs (must match ESP32 code)
const NUS_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const NUS_RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; // Write to this (app → device)
const NUS_TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // Notifications from this (device → app)

const BluetoothContext = createContext();

// Android notification channels: channel settings (especially sound) are immutable after creation.
// Use versioned IDs so updates reliably take effect on existing installs.
const EMERGENCY_CHANNEL_ID = 'emergency-alerts-v2';
const MESSAGES_CHANNEL_ID = 'messages-v2';

export const useBluetoothDevice = () => {
  const context = useContext(BluetoothContext);
  if (!context) {
    throw new Error('useBluetoothDevice must be used within BluetoothProvider');
  }
  return context;
};

export const BluetoothProvider = ({ children }) => {
  const {
    isInLobby,
    registerMemberSync,
    setMemberOffline,
    setMyDeviceId,
    registerBleCommandSender,
    syncLobbyToDevice,
    lobbyCode,
    pendingDeviceLobbySyncCode,
    clearPendingDeviceLobbySync,
    myNickname,
    myDeviceId,
    setMemberNickname,
    getMemberNickname,
    myEmergencyContact,
    setEmergencyContactForDevice,
  } = useLobby();

  // Live refs for BLE listeners (prevents stale-closure bugs in long-lived subscriptions).
  const isInLobbyRef = useRef(isInLobby);
  const lobbyCodeRef = useRef(lobbyCode);

  useEffect(() => {
    isInLobbyRef.current = isInLobby;
    lobbyCodeRef.current = lobbyCode;
  }, [isInLobby, lobbyCode]);

  // Connection state - MULTI-DEVICE SUPPORT
  const [isEnabled, setIsEnabled] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedDevicesList, setConnectedDevicesList] = useState([]); // Array of { id, name, address, bleDevice, subscription, currentId, remoteDevice }
  const [availableDevices, setAvailableDevices] = useState([]);
  const [connectedDevicesCount, setConnectedDevicesCount] = useState(0); // Number of phones connected to LoRa device via BLE
  const [isDeviceReachable, setIsDeviceReachable] = useState(false); // True if ANY connected device has LoRa link
  
  // For backward compatibility, expose first connected device as "connectedDevice"
  const connectedDevice = connectedDevicesList.length > 0 ? connectedDevicesList[0] : null;
  const isConnected = connectedDevicesList.length > 0;

  // Live refs for connection state (prevents stale-closure bugs in delayed sends / retries).
  const isConnectedRef = useRef(isConnected);
  const connectedDevicesListRef = useRef(connectedDevicesList);

  useEffect(() => {
    isConnectedRef.current = isConnected;
    connectedDevicesListRef.current = connectedDevicesList;
  }, [isConnected, connectedDevicesList]);

  // Android: keep BLE monitoring alive in background via a Foreground Service.
  // This is required for offline SOS listening while the app is backgrounded.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!bleAvailable) return;

    if (isConnected || isTrackingBreadcrumbs) {
      startAndroidMonitorService({
        title: 'HikeSafe monitoring active',
        desc: isInLobby
          ? (isTrackingBreadcrumbs ? 'Listening for SOS + recording breadcrumbs' : 'Listening for SOS alerts (Lobby active)')
          : (isTrackingBreadcrumbs ? 'Listening for SOS + recording breadcrumbs' : 'Listening for SOS alerts'),
      });
      return () => {
        // Best-effort stop when provider unmounts.
        stopAndroidMonitorService();
      };
    }

    stopAndroidMonitorService();
  }, [isConnected, isInLobby, isTrackingBreadcrumbs]);
  
  // GPS and Location data
  const [myLocation, setMyLocation] = useState({ lat: 0, lng: 0, satellites: 0, valid: false });
  const [memberLocations, setMemberLocations] = useState([]);
  // SOS-only trail sharing
  const [isSosTrailSharingActive, setIsSosTrailSharingActive] = useState(false);
  const memberLocationsRef = useRef([]);
  const isSosTrailSharingActiveRef = useRef(false);
  const lastSosTrailRequestRef = useRef({});
  const lastSosTrailSnapshotSentRef = useRef({ ts: 0 });
  
  // Alerts
  const [activeAlert, setActiveAlert] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Phone-as-sensor (many-to-one): each phone claims a mobileID (1..4) and relays its own GPS to the LoRa hub.
  const [phoneToken, setPhoneToken] = useState(null);
  const [myMobileId, setMyMobileId] = useState(null);
  const myMobileIdRef = useRef(null);
  useEffect(() => {
    myMobileIdRef.current = myMobileId;
  }, [myMobileId]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [storedToken, storedMobileIdRaw] = await Promise.all([
          AsyncStorage.getItem(PHONE_TOKEN_KEY),
          AsyncStorage.getItem(PHONE_MOBILE_ID_KEY),
        ]);

        if (!alive) return;

        let nextToken = storedToken;
        if (!nextToken) {
          nextToken = uuidv4();
          await AsyncStorage.setItem(PHONE_TOKEN_KEY, nextToken);
        }

        setPhoneToken(nextToken);

        const parsed = storedMobileIdRaw ? parseInt(storedMobileIdRaw, 10) : NaN;
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 4) {
          setMyMobileId(parsed);
        }
      } catch (e) {
        // Best-effort only
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Prevent status banner race conditions when multiple events arrive close together.
  const statusTimeoutRef = useRef(null);
  const showTemporaryStatus = useCallback((message, duration = 3000) => {
    setStatusMessage(message);
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = setTimeout(() => {
      setStatusMessage('');
    }, duration);
  }, []);

  const persistMyMobileId = useCallback(async (id) => {
    try {
      if (!id) {
        await AsyncStorage.removeItem(PHONE_MOBILE_ID_KEY);
        return;
      }
      await AsyncStorage.setItem(PHONE_MOBILE_ID_KEY, String(id));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  // Lobby verification (LoRa handshake)
  const [lastLobbyVerification, setLastLobbyVerification] = useState(null); // { nonce, fromId, timestamp }
  
  // Morse input feedback
  const [morseInput, setMorseInput] = useState('');
  
  // Messages
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Connection health monitoring
  const [lastDataReceived, setLastDataReceived] = useState(null);
  const [connectionHealth, setConnectionHealth] = useState('unknown'); // 'good', 'warning', 'lost'
  const [loraSignalStrength, setLoraSignalStrength] = useState(null); // RSSI in dBm from device

  // Track whether the BLE link *actually* dropped (vs. screen navigation/rerender).
  const wasEverConnectedRef = useRef(false);
  const lastDisconnectAtRef = useRef(null);

  // Multi-device refs: key = device.id, value = { subscriptionRef, disconnectSubRef }
  const deviceConnectionsRef = useRef(new Map()); // Map<deviceId, { subscription, disconnectSubscription, device }>

  // Serialize BLE writes to avoid overlapping GATT operations (common cause of flakiness).
  const writeQueueRef = useRef(Promise.resolve());
  
  // Activity log for real-time updates
  const [activityLog, setActivityLog] = useState([]);
  const knownMembersRef = useRef(new Set());
  
  // Trail breadcrumbs for tracking path
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [isTrackingBreadcrumbs, setIsTrackingBreadcrumbs] = useState(false);
  const lastBreadcrumbRef = useRef(null);
  const [breadcrumbSessionDay, setBreadcrumbSessionDay] = useState(null); // e.g. "2026-04-09"
  const breadcrumbSessionDayRef = useRef(null);
  const [remoteBreadcrumbs, setRemoteBreadcrumbs] = useState({}); // { [deviceId]: Array<{lat,lng,timestamp}> }
  const lastBreadcrumbBroadcastRef = useRef({ ts: 0, lat: null, lng: null });

  useEffect(() => {
    memberLocationsRef.current = memberLocations;
  }, [memberLocations]);

  useEffect(() => {
    isSosTrailSharingActiveRef.current = isSosTrailSharingActive;
  }, [isSosTrailSharingActive]);

  useEffect(() => {
    breadcrumbSessionDayRef.current = breadcrumbSessionDay;
  }, [breadcrumbSessionDay]);

  const getLocalDayStamp = useCallback((ts = Date.now()) => {
    try {
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch (e) {
      return null;
    }
  }, []);

  const filterTrailToSessionDay = useCallback((points) => {
    const sessionDay = breadcrumbSessionDayRef.current;
    const arr = Array.isArray(points) ? points : [];
    if (!sessionDay) return arr;
    return arr.filter(p => p && typeof p.timestamp === 'number' && getLocalDayStamp(p.timestamp) === sessionDay);
  }, [getLocalDayStamp]);

  const isDeviceSosActive = useCallback((deviceId) => {
    if (deviceId === null || deviceId === undefined) return false;
    const list = memberLocationsRef.current;
    if (!Array.isArray(list) || list.length === 0) return false;
    const entry = list.find(m => m && m.deviceId === deviceId);
    return !!(entry && entry.alertType === 'SOS');
  }, []);

  const requestSosTrailSnapshot = useCallback((deviceId) => {
    if (!isConnectedRef.current || (connectedDevicesListRef.current?.length || 0) === 0) return;
    if (!isInLobbyRef.current || !lobbyCodeRef.current) return;
    if (Number.isNaN(deviceId)) return;

    const now = Date.now();
    const lastTs = lastSosTrailRequestRef.current?.[deviceId] || 0;
    // SOS is rebroadcast periodically from firmware; throttle requests.
    if (now - lastTs < 30000) return;
    lastSosTrailRequestRef.current = { ...(lastSosTrailRequestRef.current || {}), [deviceId]: now };

    const nonce = `${now}`;
    // Target the SOS device so only they receive the request.
    sendCommand(`MSG:${deviceId},__TRAIL_REQ__:${nonce}`);

    // A couple retries helps with LoRa loss.
    setTimeout(() => {
      if (!isConnectedRef.current || (connectedDevicesListRef.current?.length || 0) === 0) return;
      if (!isInLobbyRef.current || !lobbyCodeRef.current) return;
      const retryNow = Date.now();
      const retryLast = lastSosTrailRequestRef.current?.[deviceId] || 0;
      if (retryNow - retryLast < 5000) return;
      lastSosTrailRequestRef.current = { ...(lastSosTrailRequestRef.current || {}), [deviceId]: retryNow };
      sendCommand(`MSG:${deviceId},__TRAIL_REQ__:${nonce}`);
    }, 5000);
  }, [sendCommand]);

  const sendSosTrailSnapshot = useCallback((nonce, toDeviceId = 0) => {
    if (!isConnectedRef.current || (connectedDevicesListRef.current?.length || 0) === 0) return;
    if (!isInLobbyRef.current || !lobbyCodeRef.current) return;

    // Firmware LoRaTextMessage payload is MAX_TEXT_LEN=50, so we must send one point per message.
    // Cap high enough for an entire day hike (typical: <= ~2500 points at ~10m spacing).
    const MAX_SNAPSHOT_POINTS = 2500;
    const SEND_GAP_MS = 120;

    const arr = filterTrailToSessionDay(breadcrumbs);
    const points = arr.slice(-MAX_SNAPSHOT_POINTS);
    if (points.length === 0) return;

    // Avoid re-sending huge snapshots too frequently.
    const now = Date.now();
    const last = lastSosTrailSnapshotSentRef.current?.ts || 0;
    if (now - last < 15000) return;
    lastSosTrailSnapshotSentRef.current = { ts: now };

    points.forEach((p, idx) => {
      if (!p || !p.lat || !p.lng) return;
      const latE5 = Math.round(p.lat * 1e5);
      const lngE5 = Math.round(p.lng * 1e5);
      const tsS = Math.floor((p.timestamp || Date.now()) / 1000);
      const cmd = `MSG:${toDeviceId},__BREAD__:${latE5},${lngE5},${tsS}`;
      setTimeout(() => {
        if (!isConnectedRef.current || (connectedDevicesListRef.current?.length || 0) === 0) return;
        if (!isInLobbyRef.current || !lobbyCodeRef.current) return;
        sendCommand(cmd);
      }, idx * SEND_GAP_MS);
    });
  }, [filterTrailToSessionDay, breadcrumbs, sendCommand]);
  
  // Vibration control
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const emergencyAlarmActiveRef = useRef(false);
  const emergencySoundRef = useRef(null);
  const emergencyThrottleRef = useRef(new Map());
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const audioModeConfiguredRef = useRef(false);

  const ensureAudioModeConfigured = useCallback(async () => {
    if (audioModeConfiguredRef.current) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
      });
    } catch (error) {
      // If audio mode config fails, playback may still work depending on platform.
      console.log('Audio mode config failed:', error?.message || error);
    } finally {
      audioModeConfiguredRef.current = true;
    }
  }, []);
  
  // Trigger vibration pattern
  const triggerVibration = useCallback((patternName) => {
    if (!vibrationEnabled) return;
    
    const pattern = VIBRATION_PATTERNS[patternName];
    if (pattern) {
      Vibration.vibrate(pattern);
    }
  }, [vibrationEnabled]);

  const startEmergencyAlarm = useCallback(() => {
    if (!vibrationEnabled || emergencyAlarmActiveRef.current) return;
    emergencyAlarmActiveRef.current = true;
    Vibration.vibrate(VIBRATION_PATTERNS.SOS, true);
  }, [vibrationEnabled]);

  const stopEmergencyAlarm = useCallback(() => {
    emergencyAlarmActiveRef.current = false;
    Vibration.cancel();
  }, []);

  const shouldThrottleEmergency = useCallback((key, windowMs = 10000) => {
    const now = Date.now();
    const lastTime = emergencyThrottleRef.current.get(key) || 0;
    if (now - lastTime < windowMs) {
      return true;
    }
    emergencyThrottleRef.current.set(key, now);
    return false;
  }, []);

  const startEmergencySiren = useCallback(async () => {
    try {
      await ensureAudioModeConfigured();

      if (emergencySoundRef.current) {
        emergencySoundRef.current.play();
        return;
      }

      const player = createAudioPlayer('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==');
      player.loop = true;
      player.volume = 1.0;
      player.play();
      emergencySoundRef.current = player;
    } catch (error) {
      console.log('Emergency siren unavailable:', error?.message || error);
    }
  }, [ensureAudioModeConfigured]);

  const stopEmergencySiren = useCallback(async () => {
    if (!emergencySoundRef.current) return;
    try {
      const player = emergencySoundRef.current;
      player.pause();

      // Free native resources; API name differs across versions.
      if (typeof player.remove === 'function') {
        player.remove();
      } else if (typeof player.release === 'function') {
        player.release();
      }
    } catch (error) {
      console.log('Failed to stop emergency siren:', error?.message || error);
    } finally {
      emergencySoundRef.current = null;
    }
  }, []);

  const startEmergencySignals = useCallback(async () => {
    startEmergencyAlarm();
    await startEmergencySiren();
  }, [startEmergencyAlarm, startEmergencySiren]);

  const stopEmergencySignals = useCallback(async () => {
    stopEmergencyAlarm();
    await stopEmergencySiren();
  }, [stopEmergencyAlarm, stopEmergencySiren]);

  const pushEmergencyNotification = useCallback(async (title, body, eventKey) => {
    try {
      if (!notificationsEnabled) {
        return;
      }
      if (shouldThrottleEmergency(`notif-${eventKey}`, 15000)) {
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          channelId: EMERGENCY_CHANNEL_ID,
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { type: 'emergency', eventKey },
        },
        trigger: null,
      });
    } catch (error) {
      console.log('Emergency notification failed:', error?.message || error);
    }
  }, [notificationsEnabled, shouldThrottleEmergency]);

  const pushMessageNotification = useCallback(async (title, body, eventKey) => {
    try {
      if (!notificationsEnabled) {
        return;
      }
      if (shouldThrottleEmergency(`msg-notif-${eventKey}`, 5000)) {
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          channelId: MESSAGES_CHANNEL_ID,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { type: 'message', eventKey },
        },
        trigger: null,
      });
    } catch (error) {
      console.log('Message notification failed:', error?.message || error);
    }
  }, [notificationsEnabled, shouldThrottleEmergency]);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const setupNotifications = async () => {
      try {
        const perm = await Notifications.requestPermissionsAsync();
        const granted = perm?.granted === true || perm?.status === 'granted';
        setNotificationsEnabled(granted);

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(EMERGENCY_CHANNEL_ID, {
            name: 'Emergency Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 200, 500, 200, 500],
            sound: 'default',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });

          await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL_ID, {
            name: 'Messages',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
          });
        }
      } catch (error) {
        console.log('Notification setup failed:', error?.message || error);
        setNotificationsEnabled(false);
      }
    };

    setupNotifications();
  }, []);

  // Android: background breadcrumbs via expo-location task.
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    if (isTrackingBreadcrumbs) {
      startBreadcrumbBackgroundUpdates();
      return;
    }

    stopBreadcrumbBackgroundUpdates();
  }, [isTrackingBreadcrumbs]);

  // Play connection success sound
  const playConnectionSound = useCallback(async () => {
    try {
      await ensureAudioModeConfigured();
      const player = createAudioPlayer('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==');
      player.volume = 1.0;
      player.play();

      // One-shot cleanup (data URI is very short; this just prevents leaks).
      setTimeout(() => {
        try {
          player.pause();
          if (typeof player.remove === 'function') {
            player.remove();
          } else if (typeof player.release === 'function') {
            player.release();
          }
        } catch {
          // ignore
        }
      }, 3000);
    } catch (error) {
      console.log('Connection sound disabled or unavailable');
    }
  }, [ensureAudioModeConfigured]);

  // Log activity
  // Supports both call styles:
  // - addActivity(type, details)
  // - addActivity(type, deviceId, details)
  const addActivity = useCallback((type, deviceIdOrDetails, maybeDetails) => {
    const details = maybeDetails !== undefined ? maybeDetails : deviceIdOrDetails;
    const activity = {
      id: Date.now(),
      type,
      details,
      timestamp: new Date().toISOString(),
    };
    setActivityLog(prev => [activity, ...prev].slice(0, 50)); // Keep last 50 activities
  }, []);
  
  // Load chat history from storage on mount
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const savedMessages = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
        if (savedMessages) {
          const parsed = JSON.parse(savedMessages);
          setMessages(parsed);
          console.log(`Loaded ${parsed.length} messages from storage`);
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };
    loadChatHistory();
  }, []);
  
  // Save chat history when messages change
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  // Debounced save to avoid too many writes
  const saveTimeoutRef = useRef(null);
  useEffect(() => {
    if (messages.length === 0) return;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Save after 1 second of no changes
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Keep only last 200 messages to avoid storage bloat
        const messagesToSave = messages.slice(-200);
        await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messagesToSave));
        console.log(`Saved ${messagesToSave.length} messages to storage`);
      } catch (error) {
        console.error('Failed to save chat history:', error);
      }
    }, 1000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [messages]);
  
  // Clear all chat history
  const clearChatHistory = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(CHAT_HISTORY_KEY);
      setMessages([]);
      setUnreadCount(0);
      console.log('Chat history cleared');
      return true;
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      return false;
    }
  }, []);
  
  // --- BREADCRUMB TRACKING ---
  
  // Load breadcrumbs from storage on mount
  useEffect(() => {
    const loadBreadcrumbs = async () => {
      try {
        const saved = await AsyncStorage.getItem(BREADCRUMBS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const today = getLocalDayStamp(Date.now());
          const savedDay = parsed.sessionDay || null;
          const sessionDay = savedDay || today;
          setBreadcrumbSessionDay(sessionDay);

          const points = Array.isArray(parsed.points) ? parsed.points : [];
          // If stored session is from a prior day, start fresh.
          setBreadcrumbs(sessionDay === today ? points : []);
          setIsTrackingBreadcrumbs(parsed.isTracking || false);
          console.log(`Loaded ${parsed.points?.length || 0} breadcrumbs`);
        }
      } catch (error) {
        console.error('Failed to load breadcrumbs:', error);
      }
    };
    loadBreadcrumbs();
  }, [getLocalDayStamp]);
  
  // Save breadcrumbs when they change
  const breadcrumbSaveRef = useRef(null);
  useEffect(() => {
    if (breadcrumbs.length === 0 && !isTrackingBreadcrumbs) return;
    
    if (breadcrumbSaveRef.current) {
      clearTimeout(breadcrumbSaveRef.current);
    }
    
    breadcrumbSaveRef.current = setTimeout(async () => {
      try {
        const sessionDay = breadcrumbSessionDayRef.current || getLocalDayStamp(Date.now());
        if (!breadcrumbSessionDayRef.current) {
          setBreadcrumbSessionDay(sessionDay);
        }

        const MAX_POINTS_TO_STORE = 5000;
        const pointsToSave = filterTrailToSessionDay(breadcrumbs).slice(-MAX_POINTS_TO_STORE);
        await AsyncStorage.setItem(BREADCRUMBS_KEY, JSON.stringify({
          points: pointsToSave,
          isTracking: isTrackingBreadcrumbs,
          sessionDay,
        }));
      } catch (error) {
        console.error('Failed to save breadcrumbs:', error);
      }
    }, 2000);
    
    return () => {
      if (breadcrumbSaveRef.current) {
        clearTimeout(breadcrumbSaveRef.current);
      }
    };
  }, [breadcrumbs, filterTrailToSessionDay, getLocalDayStamp, isTrackingBreadcrumbs]);
  
  // Add a breadcrumb point (call when location updates)
  const addBreadcrumb = useCallback((lat, lng, altitude = null) => {
    if (!isTrackingBreadcrumbs) return;
    if (!lat || !lng || lat === 0 || lng === 0) return;

    const today = getLocalDayStamp(Date.now());
    const sessionDay = breadcrumbSessionDayRef.current;
    if (!sessionDay) {
      setBreadcrumbSessionDay(today);
    } else if (sessionDay !== today) {
      // New day rollover: start a fresh trail.
      setBreadcrumbSessionDay(today);
      setBreadcrumbs([]);
      lastBreadcrumbRef.current = null;
    }
    
    // Check minimum distance from last point (10 meters)
    if (lastBreadcrumbRef.current) {
      const lastLat = lastBreadcrumbRef.current.lat;
      const lastLng = lastBreadcrumbRef.current.lng;

      const distance = calculateDistance(lastLat, lastLng, lat, lng);
      if (distance !== null && distance < 10) return; // Skip if less than 10m
    }
    
    const point = {
      lat,
      lng,
      altitude,
      timestamp: Date.now(),
    };
    
    lastBreadcrumbRef.current = point;
    setBreadcrumbs(prev => {
      const next = [...(Array.isArray(prev) ? prev : []), point];
      const filtered = next.filter(p => p && typeof p.timestamp === 'number' && getLocalDayStamp(p.timestamp) === today);
      return filtered.slice(-5000);
    });
  }, [getLocalDayStamp, isTrackingBreadcrumbs]);
  
  // Start tracking breadcrumbs
  const startBreadcrumbTracking = useCallback(() => {
    setIsTrackingBreadcrumbs(true);
    lastBreadcrumbRef.current = null;
    const sessionDay = getLocalDayStamp(Date.now());
    setBreadcrumbSessionDay(sessionDay);

    // Persist immediately so the background task can start recording right away.
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(BREADCRUMBS_KEY);
        const parsed = saved ? JSON.parse(saved) : {};
        const points = Array.isArray(parsed?.points) ? parsed.points : [];
        await AsyncStorage.setItem(BREADCRUMBS_KEY, JSON.stringify({
          points,
          isTracking: true,
          sessionDay,
        }));
      } catch (e) {
        // ignore
      }
    })();
    console.log('Breadcrumb tracking started');
  }, [getLocalDayStamp]);
  
  // Stop tracking breadcrumbs
  const stopBreadcrumbTracking = useCallback(() => {
    setIsTrackingBreadcrumbs(false);

    // Persist immediately so the background task stops recording even before debounced save runs.
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(BREADCRUMBS_KEY);
        const parsed = saved ? JSON.parse(saved) : {};
        const points = Array.isArray(parsed?.points) ? parsed.points : [];
        const sessionDay = parsed?.sessionDay || getLocalDayStamp(Date.now());
        await AsyncStorage.setItem(BREADCRUMBS_KEY, JSON.stringify({
          points,
          isTracking: false,
          sessionDay,
        }));
      } catch (e) {
        // ignore
      }
    })();
    console.log('Breadcrumb tracking stopped');
  }, [getLocalDayStamp]);
  
  // Clear all breadcrumbs
  const clearBreadcrumbs = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(BREADCRUMBS_KEY);
      setBreadcrumbs([]);
      lastBreadcrumbRef.current = null;
      setBreadcrumbSessionDay(getLocalDayStamp(Date.now()));
      console.log('Breadcrumbs cleared');
      return true;
    } catch (error) {
      console.error('Failed to clear breadcrumbs:', error);
      return false;
    }
  }, [getLocalDayStamp]);
  
  // Calculate total trail distance
  const getTrailDistance = useCallback(() => {
    if (breadcrumbs.length < 2) return 0;
    
    let total = 0;
    for (let i = 1; i < breadcrumbs.length; i++) {
      const prev = breadcrumbs[i - 1];
      const curr = breadcrumbs[i];

      total += calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng) || 0;
    }
    
    return total; // meters
  }, [breadcrumbs]);
  
  // Auto-record breadcrumbs when myLocation changes
  useEffect(() => {
    if (!isTrackingBreadcrumbs) return;
    if (!myLocation.valid || myLocation.lat === 0) return;
    
    addBreadcrumb(myLocation.lat, myLocation.lng);
  }, [myLocation, isTrackingBreadcrumbs, addBreadcrumb]);
  
  const bleManagerRef = useRef(null);
  const deviceRef = useRef(null);
  const subscriptionRef = useRef(null);
  const healthCheckRef = useRef(null);
  const mockIntervalRef = useRef(null);
  const disconnectSubscriptionRef = useRef(null);
  const commandQueueRef = useRef(Promise.resolve());

  const delay = useCallback((ms) => new Promise((resolve) => setTimeout(resolve, ms)), []);

  const parseDeviceId = useCallback((deviceLike) => {
    const source = `${deviceLike?.name || ''} ${deviceLike?.id || ''}`;
    const match = source.match(/(?:HikeSafe-D|SOS-Device)(\d+)/i);
    if (!match) return null;

    const parsed = parseInt(match[1], 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, []);

  // Initialize BLE Manager
  useEffect(() => {
    if (bleAvailable && BleManager && !bleManagerRef.current) {
      try {
        bleManagerRef.current = new BleManager();
        
        // Listen for BLE state changes
        const subscription = bleManagerRef.current.onStateChange((state) => {
          console.log('BLE state changed:', state);
          if (state === 'PoweredOn') {
            setIsEnabled(true);
            return;
          }

          // Only show "disabled" when we're sure Bluetooth is off/blocked.
          // Many Android devices emit transient states (e.g. Resetting/Unknown) during prompts.
          if (state === 'PoweredOff' || state === 'Unauthorized' || state === 'Unsupported') {
            setIsEnabled(false);
          }
        }, true);
        
        return () => {
          subscription.remove();
          if (bleManagerRef.current) {
            bleManagerRef.current.destroy();
            bleManagerRef.current = null;
          }
        };
      } catch (e) {
        console.log('BLE Manager initialization failed - running in mock mode:', e.message);
        // BLE not available (e.g., Expo Go), mock mode will be used
        setIsEnabled(true); // Pretend BT is on for mock mode
      }
    } else if (!bleAvailable) {
      // Mock mode - pretend Bluetooth is enabled
      console.log('Running in mock mode (BLE not available)');
      setIsEnabled(true);
    }
  }, []);

  // Connection health monitor - detects device shutdown/timeout
  useEffect(() => {
    if (isConnected) {
      healthCheckRef.current = setInterval(() => {
        if (lastDataReceived) {
          const timeSinceData = Date.now() - lastDataReceived;
          if (timeSinceData < 5000) {
            setConnectionHealth('good');
          } else if (timeSinceData < 10000) {
            setConnectionHealth('warning');
          } else {
            setConnectionHealth('lost');
          }
        }
      }, 2000);
      
      return () => {
        if (healthCheckRef.current) {
          clearInterval(healthCheckRef.current);
        }
      };
    } else {
      setConnectionHealth('unknown');
    }
  }, [isConnected, lastDataReceived]);

  const handleConnectionLost = useCallback(async () => {
    // Legacy single-device disconnect handler; keep it safe under the multi-device model.
    setConnectionHealth('lost');
    showTemporaryStatus('Device disconnected', 3000);

    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }

    if (disconnectSubscriptionRef.current) {
      disconnectSubscriptionRef.current.remove();
      disconnectSubscriptionRef.current = null;
    }

    if (deviceRef.current) {
      try {
        await deviceRef.current.cancelConnection();
      } catch (e) {
        // Ignore errors during cleanup
      }
      deviceRef.current = null;
    }

    // Multi-device: clear all connected devices and reset derived flags.
    setConnectedDevicesList([]);
    setConnectedDevicesCount(0);
    setIsDeviceReachable(false);
    commandQueueRef.current = Promise.resolve();
    await stopEmergencySignals();
    setMyLocation({ lat: 0, lng: 0, satellites: 0, valid: false });
    setLastDataReceived(null);
    setLoraSignalStrength(null);

  }, [showTemporaryStatus, stopEmergencySignals]);

  // Request permissions (Android 12+)
  const requestPermissions = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const apiLevel = Platform.Version;
        
        if (apiLevel >= 31) {
          // Android 12+
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            // Location is not required for BLE scanning on Android 12+, but some OEMs still prompt.
            // Request it opportunistically, but do not block BLE if the user denies it.
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);

          const scanGranted = granted?.[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
          const connectGranted = granted?.[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

          console.log('BLE permission results (API>=31):', granted);
          return scanGranted && connectGranted;
        } else {
          // Android 11 and below
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          console.log('BLE permission result (API<31):', granted);
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (error) {
        console.error('Permission error:', error);
        return false;
      }
    }
    return true; // iOS handles permissions automatically
  }, []);

  const getBlePowerStateSafe = useCallback(async () => {
    if (!bleAvailable || !bleManagerRef.current) return null;
    try {
      const state = await bleManagerRef.current.state();
      return state;
    } catch (e) {
      // On Android 12+ this can throw if BLUETOOTH_CONNECT isn't granted yet.
      return 'Unknown';
    }
  }, []);

  const warnIfLocationServicesOffForBle = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    const apiLevel = Platform.Version;
    // Android 11 and below commonly require Location Services ON for BLE scanning.
    if (typeof apiLevel === 'number' && apiLevel >= 31) return;

    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        Alert.alert(
          'Location Services Required',
          'On some Android devices, BLE scanning won\'t find devices unless Location Services (GPS) is turned on.'
        );
      }
    } catch {
      // best-effort only
    }
  }, []);

  // Request to enable Bluetooth
  const requestEnable = useCallback(async () => {
    if (!bleAvailable || !bleManagerRef.current) {
      console.log('Mock mode: Bluetooth enabled');
      setIsEnabled(true); // Mock mode
      return true;
    }
    
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      Alert.alert(
        'Permissions Required',
        'Bluetooth permissions are required to connect to devices. Please allow Nearby devices/Bluetooth permissions.'
      );
      setIsEnabled(false);
      return false;
    }

    // On Android, programmatically toggling Bluetooth is unreliable/unsupported on many devices.
    // Treat this button as a permission + state check.
    const currentState = await getBlePowerStateSafe();
    if (currentState === 'PoweredOn') {
      setIsEnabled(true);
      return true;
    }

    if (currentState === 'PoweredOff') {
      setIsEnabled(false);
      Alert.alert('Bluetooth Required', 'Please turn on Bluetooth in your device settings.');
      return false;
    }

    if (currentState === 'Unauthorized') {
      setIsEnabled(false);
      Alert.alert(
        'Permissions Required',
        'Bluetooth permission is required. Please allow Nearby devices/Bluetooth permissions in Settings.'
      );
      return false;
    }

    // "Unknown" / transient states: don't claim it's disabled; scanning can still work.
    setIsEnabled(true);
    return true;
  }, [getBlePowerStateSafe, isEnabled, requestPermissions]);

  // Scan for BLE devices - NO SYSTEM PAIRING REQUIRED!
  // This is why you can connect directly from the app
  const scanForDevices = useCallback(async () => {
    if (!bleAvailable || !bleManagerRef.current) {
      // Mock devices for development/Expo Go
      console.log('Using mock device scan (BLE not available)');
      setIsScanning(true);
      setTimeout(() => {
        setAvailableDevices([
          { id: 'mock-1', name: 'HikeSafe-D1', address: '00:00:00:00:00:01' },
          { id: 'mock-2', name: 'HikeSafe-D2', address: '00:00:00:00:00:02' },
        ]);
        setIsScanning(false);
      }, 2000);
      return;
    }

    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      Alert.alert('Permissions Required', 'Bluetooth and Location permissions are required to scan for devices.');
      return;
    }

    await warnIfLocationServicesOffForBle();

    const state = await getBlePowerStateSafe();
    // Only block scanning when we are sure BLE is not powered on.
    // "Unknown" can happen briefly during permission prompts or OEM quirks.
    if (state && state !== 'PoweredOn' && state !== 'Unknown') {
      Alert.alert('Bluetooth Required', 'Please turn on Bluetooth to scan for devices.');
      return;
    }

    console.log('Starting BLE scan. state=', state, 'apiLevel=', Platform.Version);

    setIsScanning(true);
    setAvailableDevices([]);
    
    const foundDevices = new Map();

    try {
      // Scan for all BLE devices, filter by name
      bleManagerRef.current.startDeviceScan(
        null, // null = scan for all services
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            const errCode = error?.errorCode ?? error?.code;
            const errMsg = error?.message || `${error}`;
            console.error('Scan error:', errCode, errMsg);
            Alert.alert('Scan Error', `${errMsg}${errCode ? `\n(code: ${errCode})` : ''}`);
            setIsScanning(false);
            return;
          }

          const deviceName = device?.name || device?.localName;
          // Filter for HikeSafe devices by name (also accept legacy SOS-Device names)
          if (device && deviceName && (deviceName.startsWith('HikeSafe-D') || deviceName.startsWith('SOS-Device'))) {
            if (!foundDevices.has(device.id)) {
              foundDevices.set(device.id, {
                id: device.id,
                name: deviceName,
                address: device.id,
                rssi: device.rssi,
              });
              setAvailableDevices(Array.from(foundDevices.values()));
            }
          }
        }
      );

      // Stop scanning after 10 seconds
      setTimeout(() => {
        if (bleManagerRef.current) {
          bleManagerRef.current.stopDeviceScan();
        }
        setIsScanning(false);
      }, 10000);

    } catch (error) {
      console.error('Scan error:', error);
      setIsScanning(false);
    }
  }, [getBlePowerStateSafe, requestPermissions, warnIfLocationServicesOffForBle]);

  // Parse incoming BLE data from device
  const parseBluetoothData = useCallback((data) => {
    if (!data) return;

    setLastDataReceived(Date.now());

    const lines = data.split('\n').filter(line => line.trim());

    lines.forEach(line => {
      try {
        const trimmed = line.trim();
      
      // SELF:[LAT],[LON],[SATS],[RSSI],[CONN_DEVICES] - Own GPS location and LoRa signal from connected device
      if (trimmed.startsWith('SELF:')) {
        const parts = trimmed.substring(5).split(',');
        if (parts.length >= 3) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          const satellites = parseInt(parts[2], 10);
          const valid = lat !== 0 || lng !== 0;
          setMyLocation({ lat, lng, satellites, valid });
          
          // Parse RSSI if provided (4th parameter)
          if (parts.length >= 4) {
            const rssi = parseInt(parts[3], 10);
            if (!isNaN(rssi) && rssi !== 0) {
              setLoraSignalStrength(rssi);
            }
          }
          
          // Parse connected devices count if provided (5th parameter)
          if (parts.length >= 5) {
            const connCount = parseInt(parts[4], 10);
            if (!isNaN(connCount) && connCount >= 0) {
              setConnectedDevicesCount(connCount);
              setIsDeviceReachable(connCount > 0);
            }
          }
        }
      }
      
      // ALERT:[TYPE],[ID],[LAT],[LON] - Alert from another device via LoRa
      // Also handles ALERT:OFFLINE,ID and ALERT:ONLINE,ID (no lat/lng)
      else if (trimmed.startsWith('ALERT:')) {
        // Only process LoRa lobby traffic when this phone is actually in a lobby.
        // The LoRa device lobby is shared across multiple phones; a phone that leaves locally
        // should not keep receiving/processing group traffic.
        if (!isInLobbyRef.current) {
          return;
        }
        const parts = trimmed.substring(6).split(',');
        const type = parts[0]; // SOS, MORSE, OK, OFFLINE, ONLINE
        const deviceId = parseInt(parts[1], 10);
        
        console.log(`Received ALERT: ${type} from Device ${deviceId}`);
        
        // Handle OFFLINE/ONLINE alerts (only have deviceId, no coordinates)
        if (type === 'OFFLINE') {
          setMemberLocations(prev => {
            const existing = prev.findIndex(m => m.deviceId === deviceId);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = { ...updated[existing], isOffline: true, alertType: 'OFFLINE', lastUpdate: Date.now() };
              return updated;
            }
            return [...prev, { deviceId, isOffline: true, alertType: 'OFFLINE', lastUpdate: Date.now() }];
          });
          setActiveAlert({ type: 'OFFLINE', deviceId, timestamp: Date.now() });
          if (isInLobbyRef.current) {
            setMemberOffline(deviceId, true);
          }
          addActivity('offline', deviceId, `Device ${deviceId} went offline`);
          showTemporaryStatus(`Device ${deviceId} went OFFLINE`, 5000);
          return;
        }
        
        if (type === 'ONLINE') {
          setMemberLocations(prev => {
            const existing = prev.findIndex(m => m.deviceId === deviceId);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = { ...updated[existing], isOffline: false, alertType: null };
              return updated;
            }
            return prev;
          });
          // Clear any offline alert for this device
          setActiveAlert(prev => {
            if (prev && prev.deviceId === deviceId && prev.type === 'OFFLINE') {
              return null;
            }
            return prev;
          });
          if (isInLobbyRef.current) {
            setMemberOffline(deviceId, false);
            registerMemberSync(deviceId, Date.now(), { source: 'online' });
          }
          addActivity('online', deviceId, `Device ${deviceId} is back online`);
          showTemporaryStatus(`Device ${deviceId} is back ONLINE`, 3000);
          return;
        }

        // Separation alerts (no coordinates)
        // Firmware format:
        // - ALERT:TOO_FAR,<deviceId>,<distanceMeters>
        // - ALERT:REGROUPED,<deviceId>,<distanceMeters>
        if (type === 'TOO_FAR' || type === 'REGROUPED') {
          const dist = parts.length >= 3 ? parseFloat(parts[2]) : 0;
          const displayName = getMemberNickname ? getMemberNickname(deviceId) : `Device ${deviceId}`;

          if (type === 'TOO_FAR') {
            showTemporaryStatus(
              `Warning: ${displayName} is ${Number.isFinite(dist) ? dist.toFixed(0) : '?'}m away`,
              6000
            );
            triggerVibration('ALERT');
            addActivity('separation', deviceId, `Separation warning: ${displayName} is ${Number.isFinite(dist) ? dist.toFixed(1) : '?'}m away`);
          } else {
            showTemporaryStatus(`${displayName} is back in range`, 3500);
            triggerVibration('OK');
            addActivity('separation', deviceId, `Regrouped: ${displayName} is back in range`);
          }

          return;
        }
        
        // Standard alerts with coordinates (SOS, MORSE, OK)
        if (parts.length >= 4) {
          const lat = parseFloat(parts[2]);
          const lng = parseFloat(parts[3]);
          
          // Track new member joins and announce with nickname when available
          const isNewMember = !knownMembersRef.current.has(deviceId);
          if (isNewMember) {
            knownMembersRef.current.add(deviceId);
            const nick = (typeof getMemberNickname === 'function') ? getMemberNickname(deviceId) : '';
            const displayName = nick && nick.trim().length > 0 ? nick : `Device ${deviceId}`;
            addActivity('join', `${displayName} joined the group`);

            // Also add a system chat message so group chat shows "<name> joined"
            const joinMsg = {
              id: `join-${deviceId}-${Date.now()}`,
              from: deviceId,
              to: 'me',
              text: `${displayName} joined`,
              timestamp: Date.now(),
              isMine: false,
              system: true,
            };
            setMessages(prev => [...prev, joinMsg].slice(-MAX_MESSAGES_IN_MEMORY));
            setUnreadCount(prev => prev + 1);
          }
          if (isInLobbyRef.current) {
            registerMemberSync(deviceId, Date.now(), { source: isNewMember ? 'first-signal' : 'signal-update' });
          }
          
          // Update member location
          setMemberLocations(prev => {
            const existing = prev.findIndex(m => m.deviceId === deviceId);
            const newLoc = { deviceId, lat, lng, lastUpdate: Date.now(), alertType: type, isOffline: false };
            
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = newLoc;
              return updated;
            }
            return [...prev, newLoc];
          });
          
          // Handle different alert types
          if (type === 'SOS' || type === 'MORSE') {
            setActiveAlert({ type, deviceId, lat, lng, timestamp: Date.now() });
            addActivity('sos', deviceId, `Device ${deviceId} triggered ${type} alert!`);
            
            // Vibrate with SOS pattern
            triggerVibration('SOS');
            startEmergencySignals();

            const emergencyKey = `${type}-${deviceId}`;
            const displayName = getMemberNickname ? getMemberNickname(deviceId) : `Device ${deviceId}`;
            pushEmergencyNotification(
              'Emergency Alert',
              `${displayName} triggered ${type}. Check immediately.`,
              emergencyKey
            );

            if (!shouldThrottleEmergency(`popup-${emergencyKey}`, 12000)) {
              Alert.alert(
                '🚨 EMERGENCY ALERT',
                `${displayName} has triggered a ${type} alert!\n\nLocation: ${lat.toFixed(5)}, ${lng.toFixed(5)}\n\nCheck on this member immediately!`,
                [{ text: 'View Location', style: 'default' }],
                { cancelable: true }
              );
            }

            // SOS-only: request their full trail snapshot so late joiners can catch up.
            if (type === 'SOS') {
              // Clear any prior stored trail so the snapshot is clean/full.
              setRemoteBreadcrumbs(prev => {
                if (!prev) return prev;
                const key = String(deviceId);
                if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
              });
              requestSosTrailSnapshot(deviceId);
            }
          } else if (type === 'OK') {
            // OK received - clear any active alert from that device
            setActiveAlert(prev => {
              if (prev && prev.deviceId === deviceId) {
                console.log(`Clearing alert from Device ${deviceId} (received OK)`);
                return null;
              }
              return prev;
            });
            stopEmergencySignals();
            // Update member to clear alert indicator
            setMemberLocations(prev => {
              const existing = prev.findIndex(m => m.deviceId === deviceId);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = { ...updated[existing], alertType: null };
                return updated;
              }
              return prev;
            });

            // Drop their remote trail once SOS is cleared.
            setRemoteBreadcrumbs(prev => {
              if (!prev) return prev;
              const key = String(deviceId);
              if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
              const next = { ...prev };
              delete next[key];
              return next;
            });

            addActivity('ok', deviceId, `Device ${deviceId} cancelled alert`);
            // Show status message
            showTemporaryStatus(`Device ${deviceId} is OK`, 3000);
            
            // Vibrate with OK pattern
            triggerVibration('OK');
            
            // Show notification that alert was cancelled
            Alert.alert(
              '✅ Alert Cancelled',
              `Device ${deviceId} has signaled they are OK.`,
              [{ text: 'Dismiss' }],
              { cancelable: true }
            );
          } else if (type === 'ON_MY_WAY') {
            // Device is coming to help - keep SOS active but notify sender
            addActivity('on_my_way', deviceId, `Device ${deviceId} is on the way to help`);
            
            // Show status message
            showTemporaryStatus(`Device ${deviceId} is on the way`, 3000);
            
            // Vibrate with different pattern
            triggerVibration('OK');
            
            // Show notification
            pushEmergencyNotification(
              'Help Coming',
              `Device ${deviceId} is on the way to help you.`,
              `on_my_way-${deviceId}`
            );
            
            Alert.alert(
              '✅ Help on the Way',
              `Device ${deviceId} is coming to help!`,
              [{ text: 'Dismiss' }],
              { cancelable: true }
            );
          }
        }
      }

      // LOC:[ID],[LAT],[LON],[SATS],[RSSI] - Regular location heartbeat forwarded from LoRa
      else if (trimmed.startsWith('LOC:')) {
        if (!isInLobbyRef.current) {
          return;
        }
        const parts = trimmed.substring(4).split(',');
        if (parts.length >= 3) {
          const deviceId = parseInt(parts[0], 10);
          const lat = parseFloat(parts[1]);
          const lng = parseFloat(parts[2]);
          const satellites = parts.length >= 4 ? parseInt(parts[3], 10) : 0;
          const rssi = parts.length >= 5 ? parseInt(parts[4], 10) : null;

          if (!Number.isNaN(deviceId)) {
            // Track new member joins
            const isNewMember = !knownMembersRef.current.has(deviceId);
            if (isNewMember) {
              knownMembersRef.current.add(deviceId);
              addActivity('join', deviceId, `Device ${deviceId} joined the group`);
            }
            if (isInLobbyRef.current) {
              registerMemberSync(deviceId, Date.now(), { source: isNewMember ? 'first-location' : 'location-update' });
            }

            // Update RSSI if present
            if (rssi !== null && !Number.isNaN(rssi) && rssi !== 0) {
              setLoraSignalStrength(rssi);
            }

            const valid = (lat !== 0 || lng !== 0);
            if (!valid) return;

            setMemberLocations(prev => {
              const existing = prev.findIndex(m => m.deviceId === deviceId);
              const nextLoc = {
                deviceId,
                lat,
                lng,
                satellites: Number.isNaN(satellites) ? 0 : satellites,
                lastUpdate: Date.now(),
                alertType: null,
                isOffline: false,
              };

              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = { ...updated[existing], ...nextLoc };
                return updated;
              }
              return [...prev, nextLoc];
            });
          }
        }
      }
      
      // STATUS messages from own device
      else if (trimmed.startsWith('STATUS:')) {
        const status = trimmed.substring(7);
        
        // Handle lobby confirmation: STATUS:LOBBY_SET,XXXX
        if (status.startsWith('LOBBY_SET,')) {
          const lobbyCode = status.substring(10);
          console.log(`Lobby code set on device: ${lobbyCode}`);
          showTemporaryStatus(`Lobby ${lobbyCode} synced to device`, 3000);

          // If we were retrying a pending lobby sync, clear it once confirmed.
          const confirmed = parseInt(lobbyCode, 10);
          if (pendingDeviceLobbySyncCode && !Number.isNaN(confirmed) && confirmed === pendingDeviceLobbySyncCode) {
            clearPendingDeviceLobbySync && clearPendingDeviceLobbySync();
          }

          const localDeviceId = parseDeviceId(connectedDevice || deviceRef.current);
          if (isInLobbyRef.current && localDeviceId !== null) {
            setMyDeviceId(localDeviceId);
            registerMemberSync(localDeviceId, Date.now(), { isSelf: true, source: 'lobby-sync' });
          }
        } else if (status === 'SENDING_SOS' || status === 'SENDING_MORSE_SOS') {
          const localDeviceId = parseDeviceId(connectedDevice || deviceRef.current);
          const emergencyType = status === 'SENDING_SOS' ? 'SOS' : 'MORSE';
          const deviceLabel = localDeviceId !== null ? `Device ${localDeviceId}` : 'connected device';

          setActiveAlert({
            type: emergencyType,
            deviceId: localDeviceId !== null ? localDeviceId : 0,
            timestamp: Date.now(),
            localEmergency: true,
          });

          addActivity('sos', localDeviceId !== null ? localDeviceId : 0, `${deviceLabel} triggered ${emergencyType}`);
          triggerVibration('SOS');
          startEmergencySignals();

          const emergencyKey = `${emergencyType}-${localDeviceId !== null ? localDeviceId : 0}`;
          pushEmergencyNotification(
            'Emergency Triggered',
            `${deviceLabel} triggered ${emergencyType}.`,
            emergencyKey
          );

          if (!shouldThrottleEmergency(`popup-${emergencyKey}`, 12000)) {
            Alert.alert(
              '🚨 EMERGENCY ALERT',
              `${deviceLabel} triggered ${emergencyType}.`,
              [{ text: 'Dismiss' }],
              { cancelable: true }
            );
          }

          setStatusMessage(`${emergencyType} active on ${deviceLabel}`);

          // Only enable trail sharing for true SOS (not MORSE), per spec.
          if (status === 'SENDING_SOS') {
            setIsSosTrailSharingActive(true);
          }
        } else if (status === 'SENDING_OK') {
          // Clear active emergency state for this connected device when OK is sent.
          setActiveAlert(prev => {
            if (!prev) return null;
            if (prev.type === 'SOS' || prev.type === 'MORSE') {
              return null;
            }
            return prev;
          });
          stopEmergencySignals();
          setStatusMessage('Emergency cleared (OK sent)');
          setIsSosTrailSharingActive(false);
        } else {
          setStatusMessage(status);
        }
        showTemporaryStatus(status, 3000);
      }

      // Nickname sync from device: NICK:[DEVICE_ID],[NICKNAME]
      else if (trimmed.startsWith('NICK:')) {
        const payload = trimmed.substring(5);
        const firstComma = payload.indexOf(',');
        if (firstComma > 0) {
          const deviceId = parseInt(payload.substring(0, firstComma), 10);
          const nickname = payload.substring(firstComma + 1).trim();
          if (!Number.isNaN(deviceId) && nickname.length > 0 && setMemberNickname) {
            setMemberNickname(deviceId, nickname);
            showTemporaryStatus(`Name synced: ${nickname}`, 2000);
            // Update any existing "joined" system messages for this device to use the new nickname
            setMessages(prev => prev.map(m => {
              if (m && m.system && m.from === deviceId && typeof m.text === 'string' && m.text.toLowerCase().includes('joined')) {
                return { ...m, text: `${nickname} joined` };
              }
              return m;
            }));
          }
        }
      }

      // Emergency contact sync from device: EC:[DEVICE_ID],[NAME],[PHONE]
      else if (trimmed.startsWith('EC:')) {
        const payload = trimmed.substring(3).trim();
        const firstComma = payload.indexOf(',');
        const lastComma = payload.lastIndexOf(',');

        // Expected: "<deviceId>,<name>,<phone>".
        // Use first+last comma so we can tolerate commas inside the name.
        if (firstComma > 0 && lastComma > firstComma) {
          const deviceId = parseInt(payload.substring(0, firstComma).trim(), 10);
          const name = payload.substring(firstComma + 1, lastComma).trim();
          const phone = payload.substring(lastComma + 1).trim();
          if (!Number.isNaN(deviceId) && setEmergencyContactForDevice) {
            setEmergencyContactForDevice(deviceId, { name, phone });
          }
        }
      }
      
      // MORSE input feedback
      else if (trimmed === 'MORSE_DOT') {
        setMorseInput(prev => prev + '.');
      }
      else if (trimmed === 'MORSE_DASH') {
        setMorseInput(prev => prev + '-');
      }
      
      // MSG:[FROM_ID],M[MOBILE_ID],[TEXT],...,RSSI:[VALUE] - Incoming text message via LoRa
      else if (trimmed.startsWith('MSG:')) {
        if (!isInLobbyRef.current) {
          return;
        }
        const firstComma = trimmed.indexOf(',');
        if (firstComma > 4) {
          const fromId = parseInt(trimmed.substring(4, firstComma), 10);
          const remaining = trimmed.substring(firstComma + 1);
          
          // Parse mobile ID (Mx format) if present
          let mobileId = 0;
          let textWithMeta = remaining;
          let rssiValue = null;
          
          if (remaining.startsWith('M')) {
            const mobileMatch = remaining.match(/^M(\d+),(.*)$/);
            if (mobileMatch) {
              mobileId = parseInt(mobileMatch[1], 10);
              textWithMeta = mobileMatch[2];
            }
          }
          
          // Extract RSSI if present (format: ...,RSSI:-75)
          const rssiMatch = textWithMeta.match(/,RSSI:(-?\d+)$/);
          let text = textWithMeta;
          if (rssiMatch) {
            text = textWithMeta.substring(0, rssiMatch.index);
            rssiValue = parseInt(rssiMatch[1], 10);
          }

          const isJoinTsMessage =
            text.startsWith('__JOINED_TS__:') ||
            text.startsWith('__JOIN_TS__:') ||
            text.startsWith('JOIN_TS:') ||
            text.startsWith('JOIN TS:') ||
            text === '__JOINED_TS__' ||
            text === '__JOIN_TS__' ||
            text === 'JOIN_TS' ||
            text === 'JOIN TS';

          if (isJoinTsMessage) {
            const tsPart = text.includes(':') ? text.split(':').pop() : '';
            const ts = parseInt(tsPart, 10);
            if (isInLobbyRef.current && !Number.isNaN(fromId)) {
              registerMemberSync(fromId, Number.isNaN(ts) ? Date.now() : ts, { source: 'join-broadcast' });
            }
            return;
          }

          // Ignore lobby verification traffic in chat, but capture ACK for join gating.
          if (text.startsWith('__LOBBY_VERIFY__:')) {
            return;
          }
          if (text.startsWith('__LOBBY_ACK__:')) {
            const nonce = text.substring('__LOBBY_ACK__:'.length).trim();
            if (nonce && !Number.isNaN(fromId)) {
              setLastLobbyVerification({ nonce, fromId, timestamp: Date.now() });
            }
            return;
          }

          // Trail snapshot request (SOS-only) - do not show in chat.
          if (text.startsWith('__TRAIL_REQ__:')) {
            if (Number.isNaN(fromId)) return;

            const nonce = text.substring('__TRAIL_REQ__:'.length).trim();
            // Only respond when *we* are in SOS mode.
            if (!isSosTrailSharingActiveRef.current) return;
            sendSosTrailSnapshot(nonce || `${Date.now()}`, 0);
            return;
          }

          // Shared breadcrumbs (trail) - do not show in chat.
          if (text.startsWith('__BREAD__:')) {
            if (Number.isNaN(fromId)) return;
            // Only accept trails for devices currently in SOS.
            if (!isDeviceSosActive(fromId)) return;
            const payload = text.substring('__BREAD__:'.length).trim();
            const parts = payload.split(',').map(p => p.trim());
            if (parts.length < 2) return;

            const latE5 = parseInt(parts[0], 10);
            const lngE5 = parseInt(parts[1], 10);
            const tsS = parts.length >= 3 ? parseInt(parts[2], 10) : null;
            if (Number.isNaN(latE5) || Number.isNaN(lngE5)) return;

            const lat = latE5 / 1e5;
            const lng = lngE5 / 1e5;
            const timestamp = tsS && !Number.isNaN(tsS) ? tsS * 1000 : Date.now();

            setRemoteBreadcrumbs(prev => {
              const key = String(fromId);
              const existing = Array.isArray(prev?.[key]) ? prev[key] : [];
              const last = existing.length > 0 ? existing[existing.length - 1] : null;
              if (last && last.lat === lat && last.lng === lng && last.timestamp === timestamp) return prev;

              const nextArr = [...existing, { lat, lng, timestamp }].slice(-5000);
              return { ...(prev || {}), [key]: nextArr };
            });
            return;
          }

          // Batched trail points (snapshot) - do not show in chat.
          if (text.startsWith('__BREADS__:')) {
            // Legacy format was too long for firmware MAX_TEXT_LEN=50 and may arrive truncated.
            // Ignore to avoid corrupt/partial points.
            return;
          }
          
          console.log(`Received MSG from Device ${fromId}${mobileId > 0 ? ` Mobile ${mobileId}` : ''}: ${text}`);
          
          const newMessage = {
            id: `msg-${Date.now()}-${fromId}-${mobileId}`,
            from: fromId,
            mobileId: mobileId,
            to: 'me',
            text: text,
            timestamp: Date.now(),
            isMine: false,
            rssi: rssiValue,
          };
          
          setMessages(prev => [...prev, newMessage].slice(-MAX_MESSAGES_IN_MEMORY));
          setUnreadCount(prev => prev + 1);
          
          // Vibrate for incoming message (respects vibrationEnabled)
          triggerVibration('MESSAGE');

          // Background-friendly notification for normal messages
          const fromName = getMemberNickname ? getMemberNickname(fromId) : `Device ${fromId}`;
          pushMessageNotification(
            `Message from ${fromName}${mobileId > 0 ? ` (M${mobileId})` : ''}`,
            text,
            `${fromId}-${mobileId}-${newMessage.timestamp}`
          );
        }
      }

      // ECHO_MSG:[DEVICE_ID],[TEXT] - Echoed local message from ESP32 to all connected phones
      else if (trimmed.startsWith('ECHO_MSG:')) {
        const firstComma = trimmed.indexOf(',');
        if (firstComma > 9) {
          const deviceId = parseInt(trimmed.substring(9, firstComma), 10);
          const text = trimmed.substring(firstComma + 1);

          // Don't surface internal control traffic as chat.
          if (
            text.startsWith('__JOINED_TS__:') ||
            text.startsWith('__LEFT_TS__:') ||
            text.startsWith('__JOIN_TS__:') ||
            text.startsWith('JOIN_TS:') ||
            text.startsWith('JOIN TS:') ||
            text === '__JOINED_TS__' ||
            text === '__LEFT_TS__' ||
            text === '__JOIN_TS__' ||
            text === 'JOIN_TS' ||
            text === 'JOIN TS' ||
            text.startsWith('__LOBBY_VERIFY__:') ||
            text.startsWith('__LOBBY_ACK__:') ||
            text.startsWith('__BREAD__:') ||
            text.startsWith('__BREADS__:') ||
            text.startsWith('__TRAIL_REQ__:')
          ) {
            return;
          }

          const now = Date.now();
          let shouldIncrementUnread = true;

          setMessages(prev => {
            // If this phone already added the outgoing message, avoid duplicates and just clear pending state.
            const existingMineIdx = prev.findIndex(msg =>
              msg.isMine &&
              msg.to === deviceId &&
              msg.text === text &&
              now - msg.timestamp < 15000
            );

            if (existingMineIdx >= 0) {
              shouldIncrementUnread = false;
              const updated = [...prev];
              updated[existingMineIdx] = {
                ...updated[existingMineIdx],
                pending: false,
                failed: false,
              };
              return updated;
            }

            // For other connected phones, add to chat history so everyone sees the local relay.
            return [
              ...prev,
              {
                id: `echo-${now}-${deviceId}`,
                from: Number.isNaN(deviceId) ? 0 : deviceId,
                to: 'me',
                text,
                timestamp: now,
                isMine: false,
                echoed: true,
              },
            ];
          });

          if (shouldIncrementUnread) {
            setUnreadCount(prev => prev + 1);
            const fromName = getMemberNickname ? getMemberNickname(deviceId) : `Device ${deviceId}`;
            pushMessageNotification(
              `Message from ${fromName}`,
              text,
              `echo-${deviceId}-${now}`
            );
          }
          showTemporaryStatus('Message synced to connected phones', 2000);
        }
      }
      
      // MOBILE: Mobile device location with RSSI tracking
      // Format: MOBILE:[mobileID],[lat],[lng],[rssi],[estimatedDistance]
      else if (trimmed.startsWith('MOBILE:')) {
        const parts = trimmed.substring(7).split(',');
        if (parts.length >= 5) {
          const mobileId = parseInt(parts[0], 10);
          const lat = parseFloat(parts[1]);
          const lng = parseFloat(parts[2]);
          const rssi = parseInt(parts[3], 10);
          const estimatedDistance = parseInt(parts[4], 10);
          
          // Mobile devices are associated with the connected device
          const localDeviceId = myDeviceId ?? (connectedDevice ? parseDeviceId(connectedDevice) : null);
          if (localDeviceId !== null && localDeviceId !== undefined && !Number.isNaN(localDeviceId)) {
            setMemberLocations(prev => {
              const existing = prev.findIndex(m => m.deviceId === localDeviceId);
              
              if (existing >= 0) {
                // Device already in memberLocations, update its mobile data
                const updated = [...prev];
                const mobiles = updated[existing].mobiles || [];
                const mobileIdx = mobiles.findIndex(m => m.mobileId === mobileId);
                
                if (mobileIdx >= 0) {
                  // Update existing mobile
                  mobiles[mobileIdx] = {
                    ...mobiles[mobileIdx],
                    lat,
                    lng,
                    rssi,
                    estimatedDistance,
                    lastUpdate: Date.now()
                  };
                } else {
                  // Add new mobile
                  mobiles.push({
                    mobileId,
                    lat,
                    lng,
                    rssi,
                    estimatedDistance,
                    lastUpdate: Date.now()
                  });
                }
                
                updated[existing] = {
                  ...updated[existing],
                  mobiles: mobiles.slice().sort((a, b) => a.mobileId - b.mobileId)
                };
                return updated;
              } else {
                // Device not in memberLocations yet, add it with mobile data
                return [...prev, {
                  deviceId: localDeviceId,
                  lat: null,
                  lng: null,
                  lastUpdate: Date.now(),
                  alertType: null,
                  isOffline: false,
                  mobiles: [{
                    mobileId,
                    lat,
                    lng,
                    rssi,
                    estimatedDistance,
                    lastUpdate: Date.now()
                  }]
                }];
              }
            });
            
            addActivity('mobile', localDeviceId, `Mobile device ${mobileId} location updated (RSSI: ${rssi} dBm, Distance: ${estimatedDistance}m)`);
          }
        }
      }

      // MOBILELOC: Mobile location associated with a specific LoRa device
      // Format: MOBILELOC:<deviceId>,<mobileId>,<lat>,<lng>,<rssi>,<estimatedDistance>
      else if (trimmed.startsWith('MOBILELOC:')) {
        const parts = trimmed.substring(10).split(',');
        if (parts.length >= 4) {
          const deviceId = parseInt(parts[0], 10);
          const mobileId = parseInt(parts[1], 10);
          const lat = parseFloat(parts[2]);
          const lng = parseFloat(parts[3]);
          const rssi = parts.length >= 5 ? parseInt(parts[4], 10) : 0;
          const estimatedDistance = parts.length >= 6 ? parseInt(parts[5], 10) : -1;

          if (!Number.isNaN(deviceId) && !Number.isNaN(mobileId)) {
            setMemberLocations(prev => {
              const existing = prev.findIndex(m => m.deviceId === deviceId);

              const upsertMobiles = (entry) => {
                const prevMobiles = Array.isArray(entry.mobiles) ? entry.mobiles : [];
                const mobileIdx = prevMobiles.findIndex(m => m.mobileId === mobileId);
                const nextMobile = {
                  mobileId,
                  lat,
                  lng,
                  rssi,
                  estimatedDistance,
                  lastUpdate: Date.now(),
                };

                const nextMobiles = mobileIdx >= 0
                  ? prevMobiles.map((m, idx) => (idx === mobileIdx ? { ...m, ...nextMobile } : m))
                  : [...prevMobiles, nextMobile];

                return {
                  ...entry,
                  mobiles: nextMobiles.slice().sort((a, b) => a.mobileId - b.mobileId),
                };
              };

              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = upsertMobiles(updated[existing]);
                return updated;
              }

              // Create a new member entry if we haven't seen this device yet.
              return [...prev, upsertMobiles({
                deviceId,
                lat: null,
                lng: null,
                satellites: 0,
                lastUpdate: Date.now(),
                alertType: null,
                isOffline: false,
                mobiles: [],
              })];
            });
          }
        }
      }

      // CLAIMED: Response to CLAIM handshake
      // Format: CLAIMED:<token>,<mobileId>
      else if (trimmed.startsWith('CLAIMED:')) {
        const rest = trimmed.substring(8);
        const comma = rest.indexOf(',');
        if (comma > 0) {
          const token = rest.substring(0, comma).trim();
          const mobileId = parseInt(rest.substring(comma + 1).trim(), 10);

          if (phoneToken && token === phoneToken) {
            if (!Number.isNaN(mobileId) && mobileId >= 1 && mobileId <= 4) {
              if (myMobileIdRef.current !== mobileId) {
                setMyMobileId(mobileId);
                persistMyMobileId(mobileId);
                showTemporaryStatus(`Mobile slot assigned: M${mobileId}`, 2500);
              }
            }
          }
        }
      }
      
        // MSG_SENT confirmation
        else if (trimmed === 'MSG_SENT') {
          showTemporaryStatus('Message sent via LoRa', 2000);
        }
      } catch (e) {
        console.error('parseBluetoothData line error:', e);
      }
    });
  }, [addActivity, clearPendingDeviceLobbySync, connectedDevice, getMemberNickname, isDeviceSosActive, parseDeviceId, pendingDeviceLobbySyncCode, pushEmergencyNotification, pushMessageNotification, registerMemberSync, requestSosTrailSnapshot, sendSosTrailSnapshot, setEmergencyContactForDevice, setMemberNickname, setMemberOffline, setMyDeviceId, shouldThrottleEmergency, showTemporaryStatus, startEmergencySignals, stopEmergencySignals, triggerVibration]);

  const sendMyNicknameToDevice = useCallback(async () => {
    if (!isConnected) return false;
    const nick = (myNickname || '').trim();
    if (!nick) return false;
    // Firmware-side suggestion: accept `NICK:<name>` and broadcast it via LoRa.
    return sendCommand(`NICK:${nick}`);
  }, [isConnected, myNickname, sendCommand]);

  const sendMyEmergencyContactToDevice = useCallback(async () => {
    if (!isConnected) return false;
    const name = (myEmergencyContact?.name || '').trim();
    const phone = (myEmergencyContact?.phone || '').trim();
    if (!name || !phone) return false;
    // Firmware-side suggestion: accept `EC:<name>,<phone>` and broadcast it via LoRa.
    return sendCommand(`EC:${name},${phone}`);
  }, [isConnected, myEmergencyContact, sendCommand]);

  // Connect to a BLE device - MULTI-DEVICE SUPPORT - no pairing needed!
  // Now supports multiple simultaneous connections (3-4 phones to same device)
  const connectToDevice = useCallback(async (device) => {
    if (!bleAvailable || !bleManagerRef.current) {
      Alert.alert(
        'Bluetooth Not Available',
        'Bluetooth is required to connect to your HikeSafe device. Please use a native build (not Expo Go) and ensure Bluetooth is enabled.',
        [{ text: 'OK' }]
      );
      return false;
    }

    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      Alert.alert('Permissions Required', 'Bluetooth permissions are required to connect.');
      return false;
    }

    // Check if already connected to this specific device
    if (connectedDevicesList.some(d => d.id === device.id)) {
      console.log(`Already connected to device ${device.id}`);
      return true;
    }

    // Stop scanning if still running
    bleManagerRef.current.stopDeviceScan();
    setIsConnecting(true);

    try {
      // Connect to the BLE device
      const connectedDev = await bleManagerRef.current.connectToDevice(device.id, {
        timeout: 10000,
      });

      // Improve write reliability on Android by negotiating a larger MTU when possible.
      if (Platform.OS === 'android' && typeof connectedDev.requestMTU === 'function') {
        try {
          await connectedDev.requestMTU(185);
        } catch (mtuError) {
          console.log('MTU request skipped:', mtuError?.message || mtuError);
        }
      }
      
      // Discover services and characteristics
      await connectedDev.discoverAllServicesAndCharacteristics();
      
      // Subscribe to TX characteristic for notifications (device → app)
      const subscription = connectedDev.monitorCharacteristicForService(
        NUS_SERVICE_UUID,
        NUS_TX_CHAR_UUID,
        (error, characteristic) => {
          try {
            if (error) {
              console.error('Notification error:', error);
              const msg = error?.message || '';
              if (msg.includes('disconnected') || msg.includes('cancel')) {
                // Handle disconnection for this specific device
                Promise.resolve(disconnectFromDevice(device.id)).catch(() => {});
              }
              return;
            }

            if (characteristic?.value) {
              try {
                const decoded = Buffer.from(characteristic.value, 'base64').toString('utf-8');
                parseBluetoothData(decoded);
              } catch (e) {
                console.error('Decode error:', e);
              }
            }
          } catch (e) {
            console.error('BLE notify handler crashed:', e);
          }
        }
      );
      
      // Listen for disconnection events
      const disconnectSubscription = connectedDev.onDisconnected((error, disconnectedDevice) => {
        console.log('Device disconnected:', error?.message || 'Connection closed');
        disconnectFromDevice(device.id);
      });
      
      // Store device connection info
      const newDeviceInfo = {
        ...device,
        bleDevice: connectedDev,
      };
      
      // Store subscription refs for this device
      deviceConnectionsRef.current.set(device.id, {
        subscription,
        disconnectSubscription,
        device: connectedDev,
      });
      
      // Add to connected devices list and update state
      setConnectedDevicesList(prev => [...prev, newDeviceInfo]);
      wasEverConnectedRef.current = true;
      setLastDataReceived(Date.now());
      setConnectionHealth('good');

      const localDeviceId = parseDeviceId(device);
      if (localDeviceId !== null) {
        setMyDeviceId(localDeviceId);
        if (isInLobbyRef.current) {
          registerMemberSync(localDeviceId, Date.now(), { isSelf: true, source: 'ble-connect' });
        }
      }
      
      // Play connection success sound
      playConnectionSound();
      
      console.log(`Successfully connected to device ${device.id}. Total connected: ${connectedDevicesList.length + 1}`);
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      Alert.alert(
        'Connection Failed', 
        'Could not connect to the device. Make sure it is powered on and in range.\n\nError: ' + error.message
      );
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [connectedDevicesList, isInLobby, parseBluetoothData, parseDeviceId, playConnectionSound, registerMemberSync, requestPermissions, setMyDeviceId]);

  // Disconnect from a specific device (multi-device support)
  const disconnectFromDevice = useCallback(async (deviceId) => {
    const connInfo = deviceConnectionsRef.current.get(deviceId);
    
    if (connInfo) {
      // Clean up subscriptions
      if (connInfo.subscription) {
        connInfo.subscription.remove();
      }
      if (connInfo.disconnectSubscription) {
        connInfo.disconnectSubscription.remove();
      }
      
      // Close BLE connection
      if (connInfo.device) {
        try {
          await connInfo.device.cancelConnection();
        } catch (error) {
          console.error('Error canceling connection:', error);
        }
      }
      
      deviceConnectionsRef.current.delete(deviceId);
    }
    
    // Remove from connected devices list
    setConnectedDevicesList(prev => prev.filter(d => d.id !== deviceId));
    
    // If no more connected devices, clear flags
    if ((connectedDevicesListRef.current?.length || 0) <= 1) {
      setConnectedDevicesCount(0);
      setIsDeviceReachable(false);
      setMyLocation({ lat: 0, lng: 0, satellites: 0, valid: false });
      setLastDataReceived(null);
      setLoraSignalStrength(null);
      setConnectionHealth('unknown');
    }
    
    console.log(`Disconnected from device ${deviceId}`);
  }, []);

  // Disconnect from all devices
  const disconnect = useCallback(async () => {
    // Disconnect from all connected devices
    const ids = (connectedDevicesListRef.current || []).map(d => d.id);
    for (const deviceId of ids) {
      await disconnectFromDevice(deviceId);
    }
    
    setConnectedDevicesList([]);
    setConnectedDevicesCount(0);
    setIsDeviceReachable(false);
    setMyLocation({ lat: 0, lng: 0, satellites: 0, valid: false });
    setConnectionHealth('unknown');
    setLastDataReceived(null);
    setLoraSignalStrength(null);
    commandQueueRef.current = Promise.resolve();
    lastDisconnectAtRef.current = Date.now();
    stopEmergencySignals();
    
    // Also cleanup old single-device refs for backward compatibility
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }
  }, [disconnectFromDevice, stopEmergencySignals]);

  // Send command to ALL connected devices via BLE (MULTI-DEVICE BROADCAST)
  const sendCommand = useCallback(async (command) => {
    const devicesSnapshot = Array.isArray(connectedDevicesListRef.current)
      ? connectedDevicesListRef.current
      : [];

    if (!isConnectedRef.current || devicesSnapshot.length === 0) {
      Alert.alert('Not Connected', 'Please connect to a device first.');
      return false;
    }
    
    const cmdWithNewline = command.endsWith('\n') ? command : command + '\n';
    
    if (!BleManager || devicesSnapshot.length === 0) {
      // Mock command handling
      console.log('Mock sending:', cmdWithNewline);
      if (command === 'SOS') {
        showTemporaryStatus('SENDING_SOS', 2000);
      } else if (command === 'OK') {
        showTemporaryStatus('SENDING_OK', 2000);
      }
      return true;
    }

    const encoded = Buffer.from(cmdWithNewline, 'utf-8').toString('base64');
    let successCount = 0;
    let failureCount = 0;

    // Send to all connected devices in parallel
    const sendPromises = devicesSnapshot.map(async (deviceInfo) => {
      if (!isConnectedRef.current) {
        failureCount++;
        return false;
      }
      const connInfo = deviceConnectionsRef.current.get(deviceInfo.id);
      if (!connInfo || !connInfo.device) {
        failureCount++;
        return false;
      }

      try {
        const dev = connInfo.device;
        
        // Defensive: check if connection is still valid
        try {
          const stillConnected = await dev.isConnected();
          if (!stillConnected) {
            failureCount++;
            await disconnectFromDevice(deviceInfo.id);
            return false;
          }
        } catch (e) {
          failureCount++;
          await disconnectFromDevice(deviceInfo.id);
          return false;
        }

        // Try write with response first
        try {
          await dev.writeCharacteristicWithResponseForService(
            NUS_SERVICE_UUID,
            NUS_RX_CHAR_UUID,
            encoded
          );
          console.log(`Command sent to device ${deviceInfo.id}`);
          successCount++;
          return true;
        } catch (writeError) {
          const message = (writeError?.message || '').toLowerCase();
          
          // If disconnected, handle removal
          if (message.includes('disconnected') || message.includes('cancel')) {
            await disconnectFromDevice(deviceInfo.id);
            failureCount++;
            return false;
          }
          
          // Try write without response as fallback
          if (typeof dev.writeCharacteristicWithoutResponseForService === 'function') {
            try {
              await delay(80);
              if (!isConnectedRef.current) {
                failureCount++;
                return false;
              }
              await dev.writeCharacteristicWithoutResponseForService(
                NUS_SERVICE_UUID,
                NUS_RX_CHAR_UUID,
                encoded
              );
              console.log(`Command sent to device ${deviceInfo.id} (no response)`);
              successCount++;
              return true;
            } catch (fallbackError) {
              failureCount++;
              return false;
            }
          }
          
          failureCount++;
          return false;
        }
      } catch (error) {
        console.error(`Error sending to device ${deviceInfo.id}:`, error);
        failureCount++;
        return false;
      }
    });

    // Wait for all sends to complete
    await Promise.all(sendPromises);

    // Provide feedback
    if (successCount > 0) {
      if (successCount === devicesSnapshot.length) {
        // All succeeded
        console.log(`Command delivered to all ${successCount} devices`);
        return true;
      } else {
        // Partial success
        console.warn(`Command sent to ${successCount}/${devicesSnapshot.length} devices`);
        showTemporaryStatus(`Sent to ${successCount}/${devicesSnapshot.length} devices`, 3000);
        return true; // Consider partial success as OK
      }
    } else {
      // All failed
      console.error('Command failed on all devices');
      Alert.alert('Send Failed', 'Could not send command to any device.');
      return false;
    }
  }, [delay, disconnectFromDevice, showTemporaryStatus]);

  // Expose BLE command sender to LobbyContext so it can sync lobby code to device.
  useEffect(() => {
    if (registerBleCommandSender) {
      registerBleCommandSender(sendCommand);
    }
  }, [registerBleCommandSender, sendCommand]);

  // Retry device lobby sync only when explicitly marked as pending.
  // This prevents other phones from overwriting the device lobby just because they have a saved lobbyCode.
  useEffect(() => {
    if (!isConnected) return;
    if (!pendingDeviceLobbySyncCode) return;
    if (!syncLobbyToDevice) return;

    // Fire-and-forget; LobbyContext handles persistence + failures.
    syncLobbyToDevice(sendCommand, pendingDeviceLobbySyncCode);
  }, [isConnected, pendingDeviceLobbySyncCode, syncLobbyToDevice, sendCommand]);

  // Clear remote trails when leaving/resetting lobby.
  useEffect(() => {
    if (isInLobby && lobbyCode) return;
    setRemoteBreadcrumbs({});
    lastBreadcrumbBroadcastRef.current = { ts: 0, lat: null, lng: null };
    setIsSosTrailSharingActive(false);
  }, [isInLobby, lobbyCode]);

  // Broadcast breadcrumb points at a low rate so other members can see your trail.
  // Throttles to reduce LoRa traffic.
  useEffect(() => {
    if (!isTrackingBreadcrumbs) return;
    if (!isConnected) return;
    if (!isInLobby || !lobbyCode) return;
    // Only share trail points when SOS is active.
    if (!isSosTrailSharingActive) return;
    if (!myLocation.valid || myLocation.lat === 0) return;

    const now = Date.now();
    const last = lastBreadcrumbBroadcastRef.current || { ts: 0, lat: null, lng: null };
    if (now - (last.ts || 0) < 60000) return; // 60s minimum interval

    const moved = last.lat === null
      ? 999999
      : (calculateDistance(last.lat, last.lng, myLocation.lat, myLocation.lng) || 0);
    if (moved < 25) return; // at least 25m from last broadcast

    const latE5 = Math.round(myLocation.lat * 1e5);
    const lngE5 = Math.round(myLocation.lng * 1e5);
    const tsS = Math.floor(now / 1000);
    sendCommand(`MSG:0,__BREAD__:${latE5},${lngE5},${tsS}`);
    lastBreadcrumbBroadcastRef.current = { ts: now, lat: myLocation.lat, lng: myLocation.lng };
  }, [isTrackingBreadcrumbs, isConnected, isInLobby, lobbyCode, isSosTrailSharingActive, myLocation, sendCommand]);

  // Auto-send our nickname after connection and when entering a lobby.
  useEffect(() => {
    if (!isConnected) return;
    if (!isInLobby) return;
    sendMyNicknameToDevice();
    sendMyEmergencyContactToDevice();
  }, [isConnected, isInLobby, sendMyNicknameToDevice, sendMyEmergencyContactToDevice]);

  // Many-to-one tracking: claim a stable per-phone mobileID (1..4) from the hub.
  useEffect(() => {
    if (!isConnected) return;
    if (!phoneToken) return;
    if (myMobileId) return;
    if (connectedDevicesCount !== 1) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (!isConnectedRef.current) return;
      if (myMobileIdRef.current) return;
      try {
        await sendCommand(`CLAIM:${phoneToken}`);
      } catch {
        // ignore
      }
    };

    // Try immediately + retry until we get CLAIMED.
    tick();
    const id = setInterval(tick, 4000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connectedDevicesCount, isConnected, phoneToken, myMobileId, sendCommand]);

  // Many-to-one tracking: periodically send this phone's GPS to the hub.
  useEffect(() => {
    if (!isConnected) return;
    if (!phoneToken) return;
    if (!myMobileId) return;
    if (connectedDevicesCount !== 1) return;

    let cancelled = false;

    const sendOnce = async () => {
      if (cancelled) return;
      if (!isConnectedRef.current) return;

      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;

        const cmd = `PLOC:${phoneToken},${myMobileId},${lat},${lng}`;
        await sendCommand(cmd);
      } catch {
        // ignore (best-effort telemetry)
      }
    };

    // Send immediately, then at a low cadence.
    sendOnce();
    const id = setInterval(sendOnce, 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connectedDevicesCount, isConnected, phoneToken, myMobileId, sendCommand]);

  // Convenience methods
  const sendSOS = useCallback(() => sendCommand('SOS'), [sendCommand]);
  const sendOK = useCallback(() => sendCommand('OK'), [sendCommand]);
  
  // Remove a member from the local tracking (host kick from lobby)
  const removeMemberLocation = useCallback((deviceId) => {
    setMemberLocations(prev => prev.filter(m => m.deviceId !== deviceId));
  }, []);
  
  // Send a text message via LoRa (through BLE to device, then LoRa to other devices)
  // Format: MSG:[TO_ID],[TEXT]
  const sendMessage = useCallback(async (toDeviceId, text) => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to a device first.');
      return false;
    }
    
    // Device MAX_TEXT_LEN = 50
    const truncatedText = text.substring(0, 50);
    const command = `MSG:${toDeviceId},${truncatedText}`;
    
    const newMessage = {
      id: `msg-${Date.now()}-me`,
      from: 'me',
      to: toDeviceId,
      text: truncatedText,
      timestamp: Date.now(),
      isMine: true,
      pending: true,
    };
    
    setMessages(prev => [...prev, newMessage].slice(-MAX_MESSAGES_IN_MEMORY));
    
    const success = await sendCommand(command);
    
    setMessages(prev => prev.map(msg => 
      msg.id === newMessage.id 
        ? { ...msg, pending: false, failed: !success }
        : msg
    ));
    
    return success;
  }, [isConnected, sendCommand]);
  
  // Send broadcast message (targetID = 0 means all devices)
  const sendBroadcastMessage = useCallback(async (text) => {
    return sendMessage(0, text);
  }, [sendMessage]);
  
  // Get messages for a specific conversation
  const getMessagesForDevice = useCallback((deviceId) => {
    if (deviceId === 0) {
      // Broadcast/Group chat - show ALL messages (sent and received)
      // Since firmware doesn't distinguish broadcast from direct, show everything in group
      return messages;
    }
    return messages.filter(msg => 
      (msg.from === deviceId && msg.to === 'me') ||
      (msg.from === 'me' && msg.to === deviceId)
    );
  }, [messages]);
  
  // Get unique conversations
  const getConversations = useCallback(() => {
    const deviceIds = new Set();
    messages.forEach(msg => {
      if (msg.from !== 'me' && msg.from !== 0) deviceIds.add(msg.from);
      if (msg.to !== 'me' && msg.to !== 0) deviceIds.add(msg.to);
    });
    
    return Array.from(deviceIds).map(deviceId => {
      const deviceMsgs = messages.filter(msg => 
        (msg.from === deviceId) || (msg.to === deviceId)
      );
      const lastMsg = deviceMsgs[deviceMsgs.length - 1];
      const unread = deviceMsgs.filter(msg => msg.from === deviceId && !msg.read).length;
      
      return {
        deviceId,
        name: getMemberNickname ? getMemberNickname(deviceId) : `Device ${deviceId}`,
        lastMessage: lastMsg?.text || '',
        lastTimestamp: lastMsg?.timestamp || 0,
        unreadCount: unread,
      };
    }).sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }, [getMemberNickname, messages]);
  
  // Mark messages as read
  const markMessagesAsRead = useCallback((deviceId) => {
    setMessages(prev => prev.map(msg =>
      msg.from === deviceId ? { ...msg, read: true } : msg
    ));
    setUnreadCount(prev => {
      const unreadFromDevice = messages.filter(msg => msg.from === deviceId && !msg.read).length;
      return Math.max(0, prev - unreadFromDevice);
    });
  }, [messages]);
  
  // Clear active alert
  const dismissAlert = useCallback(() => {
    setActiveAlert(null);
    stopEmergencySignals();
  }, [stopEmergencySignals]);
  
  // Clear morse input
  const clearMorseInput = useCallback(() => {
    setMorseInput('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mockIntervalRef.current) {
        clearInterval(mockIntervalRef.current);
      }
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
      }
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
      }
      if (disconnectSubscriptionRef.current) {
        disconnectSubscriptionRef.current.remove();
      }
      stopEmergencySignals();
    };
  }, [stopEmergencySignals]);

  const value = {
    // State
    isEnabled,
    isScanning,
    isConnecting,
    isConnected,
    isDeviceReachable,
    connectedDevice,
    connectedDevicesList,  // Multi-device list
    availableDevices,
    connectedDevicesCount,
    myLocation,
    memberLocations,
    activeAlert,
    statusMessage,
    lastLobbyVerification,
    morseInput,
    messages,
    unreadCount,
    connectionHealth,
    lastDataReceived,
    loraSignalStrength,
    activityLog,
    
    // Breadcrumbs / Trail tracking
    breadcrumbs,
    remoteBreadcrumbs,
    isTrackingBreadcrumbs,
    startBreadcrumbTracking,
    stopBreadcrumbTracking,
    clearBreadcrumbs,
    getTrailDistance,
    
    // Vibration settings
    vibrationEnabled,
    setVibrationEnabled,
    
    // Actions
    requestEnable,
    scanForDevices,
    connectToDevice,
    disconnect,
    disconnectFromDevice,  // Multi-device disconnect
    sendCommand,
    sendSOS,
    sendOK,
    dismissAlert,
    clearMorseInput,
    removeMemberLocation,
    addActivity,
    
    // Messaging
    sendMessage,
    sendBroadcastMessage,
    getMessagesForDevice,
    getConversations,
    markMessagesAsRead,
    clearChatHistory,
  };

  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
};

export default BluetoothContext;
