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
const LORA_MAX_TEXT_LEN = 50;
const MESSAGE_ID_PREFIX = '__MID__:';
const MESSAGE_ACK_PREFIX = '__ACK__:';
const MESSAGE_ACK_TIMEOUT_MS = 14000;
const MESSAGE_ACK_MAX_RETRIES = 1;
const INBOUND_MESSAGE_CACHE_TTL_MS = 90000;
const ACK_SEND_COOLDOWN_MS = 5000;
const REMOTE_TRAIL_PER_KEY_MAX_POINTS = 5000;
const REMOTE_TRAIL_GLOBAL_MAX_POINTS = 20000;
const BLE_CONNECTION_CHECK_TIMEOUT_MS = 3000;
const BLE_WRITE_TIMEOUT_MS = 7000;
const DIAGNOSTICS_MAX_EVENTS = 300;

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
    isLoading,
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
  const deviceLobbyCodeRef = useRef(null);
  const hubReportsLobbyRef = useRef(false);
  const lastHubLobbySupportHintRef = useRef(0);
  const lastLobbyChangePromptRef = useRef({ code: null, ts: 0 });
  const lastLobbyMismatchDropRef = useRef({ ts: 0, desired: null, device: null });
  // Multi-hub safety: treat the first chosen hub as "active" and ignore others.
  // We keep this stable across list reorderings and reset lobby-confirmation state when it changes.
  const activeHubIdRef = useRef(null);
  const lastActiveHubIdRef = useRef(null);
  const [activeHubId, setActiveHubId] = useState(null);
  const duplicateHubIdWarnRef = useRef({ ts: 0, signature: '' });

  // Auto-clear chat history on lobby join/switch.
  // Keep refs to avoid clearing during initial hydration (e.g., persisted lobby on app start).
  const lobbyChatClearTrackerRef = useRef({
    ready: false,
    prevIsInLobby: false,
    prevLobbyCode: null,
    pendingClear: false,
  });

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

  // Keep a stable "active hub" selection. If the active hub disconnects, fall back to the first remaining.
  // Reset hub lobby confirmation state when switching hubs to avoid stale lobby mismatches.
  useEffect(() => {
    const list = Array.isArray(connectedDevicesList) ? connectedDevicesList : [];

    const currentActive = activeHubIdRef.current;
    const stillConnected = currentActive && list.some(d => d?.id === currentActive);

    if (!stillConnected) {
      activeHubIdRef.current = list.length > 0 ? list[0].id : null;
    }

    const previousActive = lastActiveHubIdRef.current;
    const nextActive = activeHubIdRef.current;
    if (previousActive !== nextActive) {
      lastActiveHubIdRef.current = nextActive;
      deviceLobbyCodeRef.current = null;
      hubReportsLobbyRef.current = false;
      lastHubLobbySupportHintRef.current = 0;
      lastLobbyChangePromptRef.current = { code: null, ts: 0 };
      lastLobbyMismatchDropRef.current = { ts: 0, desired: null, device: null };

      // Hub switch can leave stale members/messages from the previous active hub.
      // Reset volatile member/signal state so the next hub repopulates cleanly.
      setMemberLocations([]);
      knownMembersRef.current = new Set();
      setActiveAlert(null);
      setActiveAlertsByKey({});
      setConnectedDevicesCount(0);
      setIsDeviceReachable(false);
      setLocalMobileNicknames({});
      setRemoteMobileNicknames({});

      // Reset emergency silencing/throttle state when hopping across hubs.
      emergencyThrottleRef.current.clear();
      silencedEmergencyRef.current.clear();
    }

    setActiveHubId(nextActive || null);
  }, [connectedDevicesList]);
  
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
    if (__DEV__) return;

    if (isConnected || isTrackingBreadcrumbs) {
      void startAndroidMonitorService({
        title: 'HikeSafe monitoring active',
        desc: isInLobby
          ? (isTrackingBreadcrumbs ? 'Listening for SOS + recording breadcrumbs' : 'Listening for SOS alerts (Lobby active)')
          : (isTrackingBreadcrumbs ? 'Listening for SOS + recording breadcrumbs' : 'Listening for SOS alerts'),
      });
      return () => {
        // Best-effort stop when provider unmounts.
        void stopAndroidMonitorService();
      };
    }

    void stopAndroidMonitorService();
  }, [isConnected, isInLobby, isTrackingBreadcrumbs]);
  
  // GPS and Location data
  const [myLocation, setMyLocation] = useState({ lat: 0, lng: 0, satellites: 0, valid: false });
  // Phone GPS (separate from the LoRa device GPS reported via SELF:)
  const [phoneLocation, setPhoneLocation] = useState({ lat: 0, lng: 0, valid: false, lastUpdate: 0 });
  const [memberLocations, setMemberLocations] = useState([]);
  // SOS-only trail sharing
  const [isSosTrailSharingActive, setIsSosTrailSharingActive] = useState(false);
  const memberLocationsRef = useRef([]);
  const isSosTrailSharingActiveRef = useRef(false);
  const lastSosTrailRequestRef = useRef({});
  const lastSosTrailSnapshotSentRef = useRef({ ts: 0 });
  
  // Alerts
  const [activeAlert, setActiveAlert] = useState(null);
  const [activeAlertsByKey, setActiveAlertsByKey] = useState({});
  const activeAlertRef = useRef(null);
  const activeAlertsByKeyRef = useRef({});
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    activeAlertRef.current = activeAlert;
  }, [activeAlert]);

  useEffect(() => {
    activeAlertsByKeyRef.current = activeAlertsByKey || {};
  }, [activeAlertsByKey]);

  // Phone-as-sensor (many-to-one): each phone claims a mobileID (1..4) and relays its own GPS to the LoRa hub.
  const [phoneToken, setPhoneToken] = useState(null);
  const [myMobileId, setMyMobileId] = useState(null);
  const myMobileIdRef = useRef(null);
  const lastClaimedAtRef = useRef(0);
  const lastClaimFailureStatusAtRef = useRef({ ts: 0, reason: '' });
  useEffect(() => {
    myMobileIdRef.current = myMobileId;
  }, [myMobileId]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [storedToken] = await Promise.all([
          AsyncStorage.getItem(PHONE_TOKEN_KEY),
        ]);

        if (!alive) return;

        let nextToken = storedToken;
        if (!nextToken) {
          nextToken = uuidv4();
          await AsyncStorage.setItem(PHONE_TOKEN_KEY, nextToken);
        }

        setPhoneToken(nextToken);

        // Slot IDs are hub-assigned and can change between sessions.
        // Never restore/persist them; force a fresh CLAIM handshake after reconnect.
        try {
          await AsyncStorage.removeItem(PHONE_MOBILE_ID_KEY);
        } catch {
          // ignore
        }
        setMyMobileId(null);
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
      // No-op: slot IDs are not stable and should not be persisted.
      if (!id) return;
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

  // Morse input feedback
  const [morseInput, setMorseInput] = useState('');
  
  // Messages
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatHistoryHydrated, setChatHistoryHydrated] = useState(false);
  const chatHistoryHydratedRef = useRef(false);

  // Many-to-one: nicknames for local phone slots (M1–M4) on the currently connected hub.
  const [localMobileNicknames, setLocalMobileNicknames] = useState({}); // { [mobileId: number]: string }
  const localMobileNicknamesRef = useRef({});
  useEffect(() => {
    localMobileNicknamesRef.current = localMobileNicknames || {};
  }, [localMobileNicknames]);

  // Many-to-one: nicknames for remote phone slots learned over LoRa metadata.
  // Keyed by "<deviceId>-m<mobileId>".
  const [remoteMobileNicknames, setRemoteMobileNicknames] = useState({});
  const remoteMobileNicknamesRef = useRef({});
  useEffect(() => {
    remoteMobileNicknamesRef.current = remoteMobileNicknames || {};
  }, [remoteMobileNicknames]);
  
  // Connection health monitoring
  const [lastDataReceived, setLastDataReceived] = useState(null);
  const [connectionHealth, setConnectionHealth] = useState('unknown'); // 'good', 'warning', 'lost'
  const [loraSignalStrength, setLoraSignalStrength] = useState(null); // RSSI in dBm from device

  // Track whether the BLE link *actually* dropped (vs. screen navigation/rerender).
  const wasEverConnectedRef = useRef(false);
  const lastDisconnectAtRef = useRef(null);

  // Multi-device refs: key = device.id, value = { subscriptionRef, disconnectSubRef }
  const deviceConnectionsRef = useRef(new Map()); // Map<deviceId, { subscription, disconnectSubscription, device }>

  // BLE RX framing: notifications can split lines arbitrarily. Buffer per device until a full '\n'-terminated line arrives.
  const rxLineBufferRef = useRef(new Map()); // Map<deviceId, string>

  // Serialize BLE writes to avoid overlapping GATT operations (common cause of flakiness).
  const writeQueueRef = useRef(Promise.resolve());
  const lastBleTxRef = useRef({ ts: 0, cmd: null, silent: false });
  
  // Activity log for real-time updates
  const [activityLog, setActivityLog] = useState([]);
  const knownMembersRef = useRef(new Set());

  // Structured diagnostics (bounded in-memory ring buffer).
  const [diagnostics, setDiagnostics] = useState([]);
  const diagnosticsRef = useRef([]);
  const appendDiagnostic = useCallback((event, details = {}) => {
    const payload = (details && typeof details === 'object') ? details : { value: String(details ?? '') };
    const entry = {
      id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      event: String(event || 'event'),
      details: payload,
    };

    const next = [...(diagnosticsRef.current || []), entry].slice(-DIAGNOSTICS_MAX_EVENTS);
    diagnosticsRef.current = next;
    setDiagnostics(next);
  }, []);

  const getDiagnostics = useCallback(() => {
    return diagnosticsRef.current || [];
  }, []);

  const clearDiagnostics = useCallback(() => {
    diagnosticsRef.current = [];
    setDiagnostics([]);
  }, []);

  useEffect(() => {
    appendDiagnostic('active_hub_changed', { activeHubId: activeHubId || null });
  }, [activeHubId, appendDiagnostic]);

  useEffect(() => {
    const list = Array.isArray(connectedDevicesList) ? connectedDevicesList : [];
    if (list.length < 2) {
      duplicateHubIdWarnRef.current = { ts: 0, signature: '' };
      return;
    }

    const ids = list
      .map((device) => {
        const source = `${device?.name || ''} ${device?.id || ''}`;
        const match = source.match(/(?:HikeSafe-D|SOS-Device)(\d+)/i);
        const parsed = match ? parseInt(match[1], 10) : NaN;
        return Number.isNaN(parsed) ? null : parsed;
      })
      .filter((id) => typeof id === 'number');

    if (ids.length < 2) {
      return;
    }

    const counts = new Map();
    ids.forEach((id) => {
      counts.set(id, (counts.get(id) || 0) + 1);
    });

    const duplicates = Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id)
      .sort((a, b) => a - b);

    if (duplicates.length === 0) {
      return;
    }

    const signature = duplicates.join(',');
    const now = Date.now();
    const last = duplicateHubIdWarnRef.current || { ts: 0, signature: '' };
    const shouldWarn = last.signature !== signature || (now - (last.ts || 0) > 15000);

    if (!shouldWarn) {
      return;
    }

    duplicateHubIdWarnRef.current = { ts: now, signature };
    appendDiagnostic('duplicate_hub_device_id', { deviceIds: duplicates });
    showTemporaryStatus(
      `Duplicate hub DEVICE_ID (${signature}) detected. Use unique DEVICE_ID per hub to avoid mixed SOS/nickname data.`,
      5000
    );
  }, [appendDiagnostic, connectedDevicesList, showTemporaryStatus]);
  
  // Trail breadcrumbs for tracking path
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [isTrackingBreadcrumbs, setIsTrackingBreadcrumbs] = useState(false);
  const lastBreadcrumbRef = useRef(null);
  const [breadcrumbSessionDay, setBreadcrumbSessionDay] = useState(null); // e.g. "2026-04-09"
  const breadcrumbSessionDayRef = useRef(null);
  const [remoteBreadcrumbs, setRemoteBreadcrumbs] = useState({}); // { ["<deviceId>-m<mobileId>"]: Array<{lat,lng,timestamp,deviceId,mobileId}> }
  const lastBreadcrumbBroadcastRef = useRef({ ts: 0, lat: null, lng: null });
  const remoteTrailLobbyScopeRef = useRef('__init__');

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

  const enforceRemoteTrailMemoryCap = useCallback((trailMap) => {
    if (!trailMap || typeof trailMap !== 'object') return {};

    const normalized = {};
    let totalPoints = 0;

    Object.keys(trailMap).forEach((key) => {
      const arr = Array.isArray(trailMap[key]) ? trailMap[key].slice(-REMOTE_TRAIL_PER_KEY_MAX_POINTS) : [];
      if (arr.length > 0) {
        normalized[key] = arr;
        totalPoints += arr.length;
      }
    });

    if (totalPoints <= REMOTE_TRAIL_GLOBAL_MAX_POINTS) {
      return normalized;
    }

    let overflow = totalPoints - REMOTE_TRAIL_GLOBAL_MAX_POINTS;
    const keysByOldestPoint = Object.keys(normalized).sort((a, b) => {
      const aTs = normalized[a]?.[0]?.timestamp ?? Number.MAX_SAFE_INTEGER;
      const bTs = normalized[b]?.[0]?.timestamp ?? Number.MAX_SAFE_INTEGER;
      return aTs - bTs;
    });

    for (let i = 0; i < keysByOldestPoint.length && overflow > 0; i++) {
      const key = keysByOldestPoint[i];
      const arr = normalized[key];
      if (!Array.isArray(arr) || arr.length === 0) {
        delete normalized[key];
        continue;
      }

      const dropCount = Math.min(overflow, arr.length);
      const nextArr = arr.slice(dropCount);
      if (nextArr.length > 0) {
        normalized[key] = nextArr;
      } else {
        delete normalized[key];
      }
      overflow -= dropCount;
    }

    return normalized;
  }, []);

  const clearRemoteTrailsForDevice = useCallback((deviceId) => {
    if (deviceId === null || deviceId === undefined || Number.isNaN(deviceId)) return;
    const devicePrefix = `${deviceId}-m`;

    setRemoteBreadcrumbs(prev => {
      if (!prev || typeof prev !== 'object') return prev;

      let changed = false;
      const next = { ...(prev || {}) };
      Object.keys(next).forEach((key) => {
        if (key === String(deviceId) || key.startsWith(devicePrefix)) {
          delete next[key];
          changed = true;
        }
      });

      return changed ? enforceRemoteTrailMemoryCap(next) : prev;
    });
  }, [enforceRemoteTrailMemoryCap]);

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
    sendCommand(`MSG:${deviceId},__TRAIL_REQ__:${nonce}`, { silent: true });

    // A couple retries helps with LoRa loss.
    setTimeout(() => {
      if (!isConnectedRef.current || (connectedDevicesListRef.current?.length || 0) === 0) return;
      if (!isInLobbyRef.current || !lobbyCodeRef.current) return;
      const retryNow = Date.now();
      const retryLast = lastSosTrailRequestRef.current?.[deviceId] || 0;
      if (retryNow - retryLast < 5000) return;
      lastSosTrailRequestRef.current = { ...(lastSosTrailRequestRef.current || {}), [deviceId]: retryNow };
      sendCommand(`MSG:${deviceId},__TRAIL_REQ__:${nonce}`, { silent: true });
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
        sendCommand(cmd, { silent: true });
      }, idx * SEND_GAP_MS);
    });
  }, [filterTrailToSessionDay, breadcrumbs, sendCommand]);
  
  // Vibration control
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const emergencyAlarmActiveRef = useRef(false);
  const emergencySoundRef = useRef(null);
  const emergencyThrottleRef = useRef(new Map());
  const silencedEmergencyRef = useRef(new Map());
  const EMERGENCY_SILENCE_WINDOW_MS = 10 * 60 * 1000;

  const isTrackedAlertType = useCallback((type) => {
    return type === 'SOS' || type === 'MORSE' || type === 'OFFLINE';
  }, []);

  const getTrackedAlertKey = useCallback((type, deviceId) => {
    const normalizedType = String(type || '').toUpperCase();
    if (!normalizedType) return null;

    const normalizedDeviceId =
      (typeof deviceId === 'number' && !Number.isNaN(deviceId) && deviceId > 0)
        ? deviceId
        : 'local';

    return `${normalizedType}-${normalizedDeviceId}`;
  }, []);

  const pickFocusedAlert = useCallback((alertMap, preferredKey = null) => {
    const map = (alertMap && typeof alertMap === 'object') ? alertMap : {};

    if (preferredKey && map[preferredKey]) {
      return map[preferredKey];
    }

    const entries = Object.entries(map).filter(([, alert]) => {
      if (!alert) return false;
      return isTrackedAlertType(String(alert.type || '').toUpperCase());
    });

    if (entries.length === 0) {
      return null;
    }

    const current = activeAlertRef.current;
    const currentKey = current ? getTrackedAlertKey(current.type, current.deviceId) : null;
    if (currentKey && map[currentKey]) {
      const currentEntry = map[currentKey];
      if (!currentEntry.silenced) {
        return currentEntry;
      }
    }

    const typeRank = (alert) => {
      const t = String(alert?.type || '').toUpperCase();
      if (t === 'SOS' || t === 'MORSE') return 0;
      if (t === 'OFFLINE') return 1;
      return 2;
    };

    entries.sort((a, b) => {
      const aAlert = a[1];
      const bAlert = b[1];

      const aRank = typeRank(aAlert);
      const bRank = typeRank(bAlert);
      if (aRank !== bRank) return aRank - bRank;

      const aSilenced = aAlert?.silenced ? 1 : 0;
      const bSilenced = bAlert?.silenced ? 1 : 0;
      if (aSilenced !== bSilenced) return aSilenced - bSilenced;

      const aTs = Number(aAlert?.timestamp || 0);
      const bTs = Number(bAlert?.timestamp || 0);
      return bTs - aTs;
    });

    return entries[0][1] || null;
  }, [getTrackedAlertKey, isTrackedAlertType]);

  const updateTrackedAlerts = useCallback((updater, options = {}) => {
    const preferredKey = options?.preferredKey || null;

    setActiveAlertsByKey(prev => {
      const base = (prev && typeof prev === 'object') ? prev : {};
      const updated = typeof updater === 'function' ? updater(base) : base;
      const candidate = (updated && typeof updated === 'object') ? updated : {};
      const next = {};

      Object.keys(candidate).forEach((key) => {
        const value = candidate[key];
        if (!value) return;
        const normalizedType = String(value.type || '').toUpperCase();
        if (!isTrackedAlertType(normalizedType)) return;
        next[key] = {
          ...value,
          type: normalizedType,
        };
      });

      setActiveAlert(pickFocusedAlert(next, preferredKey));
      return next;
    });
  }, [isTrackedAlertType, pickFocusedAlert]);

  const upsertTrackedAlert = useCallback((alertLike, options = {}) => {
    if (!alertLike) return;

    const normalizedType = String(alertLike.type || '').toUpperCase();
    if (!isTrackedAlertType(normalizedType)) return;

    const key = getTrackedAlertKey(normalizedType, alertLike.deviceId);
    if (!key) return;

    updateTrackedAlerts((prev) => {
      const existing = prev[key] || {};
      const normalizedDeviceId =
        (typeof alertLike.deviceId === 'number' && !Number.isNaN(alertLike.deviceId) && alertLike.deviceId > 0)
          ? alertLike.deviceId
          : (typeof existing.deviceId === 'number' ? existing.deviceId : null);

      const nextAlert = {
        ...existing,
        ...alertLike,
        type: normalizedType,
        deviceId: normalizedDeviceId,
        timestamp: typeof alertLike.timestamp === 'number'
          ? alertLike.timestamp
          : (typeof existing.timestamp === 'number' ? existing.timestamp : Date.now()),
      };

      return {
        ...prev,
        [key]: nextAlert,
      };
    }, {
      preferredKey: options?.preferFocus ? key : null,
    });
  }, [getTrackedAlertKey, isTrackedAlertType, updateTrackedAlerts]);

  const removeTrackedAlerts = useCallback((predicate, options = {}) => {
    if (typeof predicate !== 'function') return;

    updateTrackedAlerts((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (predicate(next[key], key)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    }, options);
  }, [updateTrackedAlerts]);

  const clearTrackedAlerts = useCallback(() => {
    setActiveAlertsByKey({});
    setActiveAlert(null);
  }, []);

  const unsilenceEmergencyForDevice = useCallback((type, deviceId, options = {}) => {
    const normalizedType = String(type || '').toUpperCase();
    if (!normalizedType) return;
    if (typeof deviceId !== 'number' || Number.isNaN(deviceId) || deviceId <= 0) return;

    const key = `${normalizedType}-${deviceId}`;
    silencedEmergencyRef.current.delete(key);

    updateTrackedAlerts((prev) => {
      const existing = prev[key];
      if (!existing) return prev;

      return {
        ...prev,
        [key]: {
          ...existing,
          silenced: false,
          silencedAt: null,
          silencedByDeviceId: null,
          helperName: null,
          rearmPending: options?.markRearm === true,
        },
      };
    }, {
      preferredKey: key,
    });
  }, [updateTrackedAlerts]);

  // Multi-phone-to-one-hub: the hub can broadcast STATUS:SENDING_SOS to all phones.
  // Track whether *this* phone initiated SOS recently so only the sender gets localEmergency UI.
  const lastLocalEmergencyRequestRef = useRef({ type: null, ts: 0 });
  const LOCAL_EMERGENCY_INTENT_WINDOW_MS = 15000;

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
        shouldShowBanner: true,
        shouldShowList: true,
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
    let alive = true;

    const loadChatHistory = async () => {
      try {
        const savedMessages = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
        if (savedMessages) {
          const parsed = JSON.parse(savedMessages);
          if (alive) {
            setMessages(Array.isArray(parsed) ? parsed : []);
            console.log(`Loaded ${Array.isArray(parsed) ? parsed.length : 0} messages from storage`);
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      } finally {
        if (alive) {
          chatHistoryHydratedRef.current = true;
          setChatHistoryHydrated(true);
        }
      }
    };

    void loadChatHistory();

    return () => {
      alive = false;
    };
  }, []);
  
  // Save chat history when messages change
  const messagesRef = useRef(messages);
  const messageAckTimeoutsRef = useRef(new Map());
  const recentInboundMessageIdsRef = useRef(new Map());
  const recentSentAcksRef = useRef(new Map());
  const queueDeliveryAckRef = useRef(null);
  const armRecipientAckFallbackRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      const timers = messageAckTimeoutsRef.current;
      timers.forEach((timerId) => clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  const createShortMessageId = useCallback(() => {
    const ts = Date.now().toString(36).slice(-6);
    const rand = Math.random().toString(36).slice(2, 5);
    return `${ts}${rand}`;
  }, []);

  const encodeMessageEnvelope = useCallback((text, messageId = null) => {
    const body = String(text || '');
    if (!messageId) return body;
    return `${MESSAGE_ID_PREFIX}${messageId}:${body}`;
  }, []);

  const decodeMessageEnvelope = useCallback((rawText) => {
    const value = String(rawText || '');
    if (!value.startsWith(MESSAGE_ID_PREFIX)) {
      return { messageId: null, text: value };
    }

    const payload = value.substring(MESSAGE_ID_PREFIX.length);
    const separator = payload.indexOf(':');
    if (separator <= 0) {
      return { messageId: null, text: value };
    }

    const candidateId = payload.substring(0, separator).trim();
    if (!/^[a-z0-9_-]{4,24}$/i.test(candidateId)) {
      return { messageId: null, text: value };
    }

    return {
      messageId: candidateId,
      text: payload.substring(separator + 1),
    };
  }, []);

  const decodeAckPayload = useCallback((rawText) => {
    const value = String(rawText || '');
    if (!value.startsWith(MESSAGE_ACK_PREFIX)) {
      return null;
    }

    const ackId = value.substring(MESSAGE_ACK_PREFIX.length).trim();
    if (!/^[a-z0-9_-]{4,24}$/i.test(ackId)) {
      return null;
    }

    return ackId;
  }, []);

  const clearMessageAckTimer = useCallback((messageId) => {
    if (!messageId) return;
    const timers = messageAckTimeoutsRef.current;
    const existing = timers.get(messageId);
    if (existing) {
      clearTimeout(existing);
      timers.delete(messageId);
    }
  }, []);

  const wasInboundMessageRecentlySeen = useCallback((fromDeviceId, messageId) => {
    if (typeof fromDeviceId !== 'number' || Number.isNaN(fromDeviceId) || !messageId) {
      return false;
    }

    const now = Date.now();
    const cache = recentInboundMessageIdsRef.current;
    for (const [key, ts] of cache.entries()) {
      if (now - ts > INBOUND_MESSAGE_CACHE_TTL_MS) {
        cache.delete(key);
      }
    }

    const cacheKey = `${fromDeviceId}:${messageId}`;
    const last = cache.get(cacheKey);
    cache.set(cacheKey, now);
    return typeof last === 'number' && (now - last) <= INBOUND_MESSAGE_CACHE_TTL_MS;
  }, []);

  const shouldThrottleAckSend = useCallback((targetDeviceId, messageId) => {
    if (typeof targetDeviceId !== 'number' || Number.isNaN(targetDeviceId) || !messageId) {
      return true;
    }

    const now = Date.now();
    const cache = recentSentAcksRef.current;
    for (const [key, ts] of cache.entries()) {
      if (now - ts > INBOUND_MESSAGE_CACHE_TTL_MS) {
        cache.delete(key);
      }
    }

    const ackKey = `${targetDeviceId}:${messageId}`;
    const last = cache.get(ackKey);
    if (typeof last === 'number' && (now - last) < ACK_SEND_COOLDOWN_MS) {
      return true;
    }

    cache.set(ackKey, now);
    return false;
  }, []);
  
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
      messageAckTimeoutsRef.current.forEach((timerId) => clearTimeout(timerId));
      messageAckTimeoutsRef.current.clear();
      setMessages([]);
      setUnreadCount(0);
      console.log('Chat history cleared');
      return true;
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      return false;
    }
  }, []);

  // If a lobby change happened before chat history hydration finished, clear once hydration completes.
  useEffect(() => {
    if (!chatHistoryHydrated) return;
    const tracker = lobbyChatClearTrackerRef.current;
    if (tracker.pendingClear) {
      tracker.pendingClear = false;
      void clearChatHistory();

      // Lobby-scoped caches should not leak across a restored/joined lobby.
      setLocalMobileNicknames({});
      setRemoteMobileNicknames({});
    }
  }, [chatHistoryHydrated, clearChatHistory]);

  // Auto-clear chat history whenever the user joins/switches lobbies.
  useEffect(() => {
    if (isLoading) return;

    const tracker = lobbyChatClearTrackerRef.current;

    if (!tracker.ready) {
      tracker.ready = true;
      tracker.prevIsInLobby = !!isInLobby;
      tracker.prevLobbyCode = lobbyCode ?? null;

      // If the lobby was restored from storage on app start, treat it like a join.
      // This prevents old saved chats from reappearing when entering a lobby.
      if (!!isInLobby) {
        if (chatHistoryHydratedRef.current) {
          void clearChatHistory();
        } else {
          tracker.pendingClear = true;
        }

        setLocalMobileNicknames({});
        setRemoteMobileNicknames({});
      }
      return;
    }

    const joinedLobby = !tracker.prevIsInLobby && !!isInLobby;
    const leftLobby = !!tracker.prevIsInLobby && !isInLobby;
    const switchedLobby =
      !!isInLobby &&
      tracker.prevLobbyCode !== null &&
      lobbyCode !== null &&
      lobbyCode !== undefined &&
      tracker.prevLobbyCode !== lobbyCode;

    if (joinedLobby || switchedLobby) {
      if (chatHistoryHydratedRef.current) {
        void clearChatHistory();
      } else {
        tracker.pendingClear = true;
      }
    }

    if (joinedLobby || switchedLobby || leftLobby) {
      setLocalMobileNicknames({});
      setRemoteMobileNicknames({});
    }

    tracker.prevIsInLobby = !!isInLobby;
    tracker.prevLobbyCode = lobbyCode ?? null;
  }, [isLoading, isInLobby, lobbyCode, clearChatHistory]);
  
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
  
  // Auto-record breadcrumbs when phone GPS changes.
  useEffect(() => {
    if (!isTrackingBreadcrumbs) return;
    if (!phoneLocation.valid || phoneLocation.lat === 0 || phoneLocation.lng === 0) return;
    
    addBreadcrumb(phoneLocation.lat, phoneLocation.lng);
  }, [phoneLocation, isTrackingBreadcrumbs, addBreadcrumb]);
  
  const bleManagerRef = useRef(null);
  const bleStateSubscriptionRef = useRef(null);
  const lastBleStateRef = useRef('Unknown');
  const deviceRef = useRef(null);
  const subscriptionRef = useRef(null);
  const healthCheckRef = useRef(null);
  const mockIntervalRef = useRef(null);
  const disconnectSubscriptionRef = useRef(null);
  const commandQueueRef = useRef(Promise.resolve());
  const scanStopTimeoutRef = useRef(null);
  const permissionCacheRef = useRef({ granted: false, ts: 0 });

  const delay = useCallback((ms) => new Promise((resolve) => setTimeout(resolve, ms)), []);

  const parseDeviceId = useCallback((deviceLike) => {
    const source = `${deviceLike?.name || ''} ${deviceLike?.id || ''}`;
    const match = source.match(/(?:HikeSafe-D|SOS-Device)(\d+)/i);
    if (!match) return null;

    const parsed = parseInt(match[1], 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, []);

  const cleanupBleManager = useCallback(() => {
    try {
      if (scanStopTimeoutRef.current) {
        clearTimeout(scanStopTimeoutRef.current);
        scanStopTimeoutRef.current = null;
      }

      if (bleStateSubscriptionRef.current) {
        bleStateSubscriptionRef.current.remove();
        bleStateSubscriptionRef.current = null;
      }

      if (bleManagerRef.current) {
        try {
          bleManagerRef.current.stopDeviceScan();
        } catch {
          // ignore
        }
        bleManagerRef.current.destroy();
        bleManagerRef.current = null;
      }
    } catch (e) {
      console.log('BLE manager cleanup failed:', e?.message || e);
    }
  }, []);

  const ensureBleManagerReady = useCallback(() => {
    if (!bleAvailable || !BleManager) {
      return false;
    }

    if (bleManagerRef.current) {
      return true;
    }

    try {
      const manager = new BleManager();
      bleManagerRef.current = manager;
      bleStateSubscriptionRef.current = manager.onStateChange((state) => {
        lastBleStateRef.current = state;
        setIsEnabled(state === 'PoweredOn');
      }, true);
      return true;
    } catch (e) {
      console.log('BLE Manager initialization failed:', e?.message || e);
      return false;
    }
  }, []);

  // Initialize BLE Manager
  useEffect(() => {
    if (!bleAvailable) {
      // Mock mode - pretend Bluetooth is enabled
      console.log('Running in mock mode (BLE not available)');
      setIsEnabled(true);
      return;
    }

    ensureBleManagerReady();

    return () => {
      cleanupBleManager();
    };
  }, [cleanupBleManager, ensureBleManagerReady]);

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
    const now = Date.now();
    const cache = permissionCacheRef.current || { granted: false, ts: 0 };
    if (cache.granted && now - (cache.ts || 0) < 15000) {
      return true;
    }

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
          const ok = scanGranted && connectGranted;
          permissionCacheRef.current = { granted: ok, ts: Date.now() };
          return ok;
        } else {
          // Android 11 and below
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          console.log('BLE permission result (API<31):', granted);
          const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
          permissionCacheRef.current = { granted: ok, ts: Date.now() };
          return ok;
        }
      } catch (error) {
        console.error('Permission error:', error);
        permissionCacheRef.current = { granted: false, ts: Date.now() };
        return false;
      }
    }
    permissionCacheRef.current = { granted: true, ts: Date.now() };
    return true; // iOS handles permissions automatically
  }, []);

  const getBlePowerStateSafe = useCallback(async () => {
    if (!bleAvailable || !bleManagerRef.current) return null;
    try {
      const state = await bleManagerRef.current.state();
      return state;
    } catch (e) {
      // On some OEM builds, state() can throw even when onStateChange already reported PoweredOn.
      return lastBleStateRef.current || 'Unknown';
    }
  }, []);

  const warnIfLocationServicesOffForBle = useCallback(async () => {
    if (Platform.OS !== 'android') return true;

    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        Alert.alert(
          'Turn On Location Services',
          'BLE scan may return no devices on this phone until Location Services (GPS) is enabled.'
        );
        return false;
      }
    } catch {
      // best-effort only
    }
    return true;
  }, []);

  // Request to enable Bluetooth
  const requestEnable = useCallback(async () => {
    if (!bleAvailable) {
      console.log('Mock mode: Bluetooth enabled');
      setIsEnabled(true); // Mock mode
      return true;
    }

    if (!ensureBleManagerReady()) {
      showTemporaryStatus('Bluetooth service is not ready. Please restart Bluetooth and try again.', 4000);
      return false;
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
    if (!bleAvailable) {
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

    if (!ensureBleManagerReady() || !bleManagerRef.current) {
      showTemporaryStatus('Bluetooth scanner is unavailable. Please try again.', 3000);
      return;
    }

    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      Alert.alert('Permissions Required', 'Bluetooth and Location permissions are required to scan for devices.');
      return;
    }

    const locationServicesOn = await warnIfLocationServicesOffForBle();
    if (!locationServicesOn) {
      return;
    }

    let state = await getBlePowerStateSafe();

    // OEM recovery: if state is Unknown and no active connection exists,
    // rebuild manager once and retry state before scanning.
    if (state === 'Unknown' && (connectedDevicesListRef.current?.length || 0) === 0) {
      cleanupBleManager();
      if (ensureBleManagerReady()) {
        await delay(300);
        state = await getBlePowerStateSafe();
      }
    }

    // Only block scanning when we are sure BLE is not powered on.
    // "Unknown" can happen briefly during permission prompts or OEM quirks.
    if (state && state !== 'PoweredOn' && state !== 'Unknown') {
      Alert.alert('Bluetooth Required', 'Please turn on Bluetooth to scan for devices.');
      return;
    }

    if (state === 'Unknown') {
      showTemporaryStatus('Bluetooth state is unstable on this phone. Scanning anyway...', 2500);
    }

    console.log('Starting BLE scan. state=', state, 'apiLevel=', Platform.Version);

    if (scanStopTimeoutRef.current) {
      clearTimeout(scanStopTimeoutRef.current);
      scanStopTimeoutRef.current = null;
    }

    const foundDevices = new Map();
    const allNearbyCandidates = new Map();

    const scheduleStopScan = (delayMs) => {
      if (scanStopTimeoutRef.current) {
        clearTimeout(scanStopTimeoutRef.current);
      }
      scanStopTimeoutRef.current = setTimeout(() => {
        try {
          if (bleManagerRef.current) {
            bleManagerRef.current.stopDeviceScan();
          }
        } catch {
          // ignore
        }

        console.log('[BLE] Scan complete', {
          verifiedCandidates: foundDevices.size,
          nearbyCandidates: allNearbyCandidates.size,
        });

        // Fallback: if no verified HikeSafe signature was detected, show nearby BLE candidates
        // so users can still attempt connecting on OEMs that suppress advertisement names.
        if (foundDevices.size === 0 && allNearbyCandidates.size > 0) {
          const fallback = Array.from(allNearbyCandidates.values())
            .sort((a, b) => {
              const ar = Number.isFinite(a?.rssi) ? a.rssi : -999;
              const br = Number.isFinite(b?.rssi) ? b.rssi : -999;
              return br - ar;
            })
            .slice(0, 12);

          if (fallback.length > 0) {
            setAvailableDevices(fallback);
            showTemporaryStatus('No HikeSafe signature found. Showing nearby BLE devices to try.', 3500);
          }
        } else if (foundDevices.size === 0) {
          showTemporaryStatus('No BLE advertisements found. Move closer and reboot the hub, then rescan.', 3500);
        }

        setIsScanning(false);
        scanStopTimeoutRef.current = null;
      }, Math.max(0, delayMs || 0));
    };

    setIsScanning(true);
    setAvailableDevices([]);
    
    const normalizeUuid = (value) => String(value || '').trim().toUpperCase();
    const isLikelyHikeSafeDevice = (device) => {
      if (!device) return false;

      const advName = `${device.name || ''}`.trim();
      const localName = `${device.localName || ''}`.trim();
      const id = `${device.id || ''}`.trim();

      const looksLikeName =
        advName.startsWith('HikeSafe-D') ||
        advName.startsWith('SOS-Device') ||
        localName.startsWith('HikeSafe-D') ||
        localName.startsWith('SOS-Device');

      if (looksLikeName) return true;

      const serviceUuids = Array.isArray(device.serviceUUIDs) ? device.serviceUUIDs : [];
      const hasNusService = serviceUuids.some((uuid) => normalizeUuid(uuid) === NUS_SERVICE_UUID);

      if (hasNusService) return true;

      // Fallback for minor naming variations.
      const combined = `${advName} ${localName} ${id}`.toLowerCase();
      return combined.includes('hikesafe') || combined.includes('sos-device');
    };

    try {
      try {
        bleManagerRef.current.stopDeviceScan();
      } catch {
        // ignore stale scans
      }

      // Scan for all BLE devices, filter by name
      bleManagerRef.current.startDeviceScan(
        null, // null = scan for all services
        {
          allowDuplicates: false,
          // Low-latency scan improves discovery reliability on some Android OEM stacks.
          scanMode: 2,
        },
        (error, device) => {
          if (error) {
            const errCode = error?.errorCode ?? error?.code;
            const errMsg = error?.message || `${error}`;
            console.error('Scan error:', errCode, errMsg);
            Alert.alert('Scan Error', `${errMsg}${errCode ? `\n(code: ${errCode})` : ''}`);
            scheduleStopScan(0);
            return;
          }

          if (device && !foundDevices.has(device.id) && !allNearbyCandidates.has(device.id)) {
            const advName = `${device.name || ''}`.trim();
            const localName = `${device.localName || ''}`.trim();
            const display = advName || localName;
            const serviceUuids = Array.isArray(device.serviceUUIDs) ? device.serviceUUIDs : [];
            const looksUsable = !!(device.id || display || serviceUuids.length > 0);

            if (looksUsable) {
              allNearbyCandidates.set(device.id, {
                id: device.id,
                name: display || `Nearby BLE (${String(device.id || '').slice(-4)})`,
                address: device.id,
                rssi: device.rssi,
                unverified: true,
              });
            }
          }

          if (device && isLikelyHikeSafeDevice(device)) {
            if (!foundDevices.has(device.id)) {
              const displayName = device.name || device.localName || 'HikeSafe Device';
              allNearbyCandidates.delete(device.id);
              foundDevices.set(device.id, {
                id: device.id,
                name: displayName,
                address: device.id,
                rssi: device.rssi,
              });

              console.log('[BLE] Verified candidate found', {
                id: device.id,
                name: displayName,
                rssi: device.rssi,
              });

              setAvailableDevices(Array.from(foundDevices.values()));

              // Fast path: once a candidate appears, stop scanning soon for quicker connect UX.
              if (foundDevices.size === 1) {
                scheduleStopScan(3500);
              }
            }
          }
        }
      );

      // Stop scanning after 10 seconds
      scheduleStopScan(10000);

    } catch (error) {
      console.error('Scan error:', error);
      scheduleStopScan(0);
      setIsScanning(false);
    }
  }, [cleanupBleManager, delay, ensureBleManagerReady, getBlePowerStateSafe, requestPermissions, showTemporaryStatus, warnIfLocationServicesOffForBle]);

  // Parse incoming BLE data from device
  const parseBluetoothData = useCallback((data, sourceDeviceId = null) => {
    if (!data) return;

    // When multiple hubs are connected, this app does not support routing messages per-hub.
    // Treat the first connected hub as the "active" hub and ignore notifications from others,
    // otherwise secondary hubs can overwrite lobby confirmation and block chat.
    const activeHubId = activeHubIdRef.current || connectedDevicesListRef.current?.[0]?.id || null;
    if (sourceDeviceId && activeHubId && sourceDeviceId !== activeHubId) {
      return;
    }

    setLastDataReceived(Date.now());

    const bufferKey = sourceDeviceId || '__default__';
    const prev = rxLineBufferRef.current.get(bufferKey) || '';
    let combined = prev + data;
    // Prevent unbounded growth if a device sends garbage without newlines.
    if (combined.length > 8192) {
      combined = combined.slice(-8192);
    }

    const chunks = combined.split('\n');
    const remainder = chunks.length > 0 ? chunks[chunks.length - 1] : '';
    rxLineBufferRef.current.set(bufferKey, remainder);
    const lines = chunks
      .slice(0, -1)
      .map(l => l.replace(/\r/g, ''))
      .filter(line => line.trim());

    lines.forEach(line => {
      let trimmed = '';
      try {
        trimmed = line.trim();
      
            // SELF:[LAT],[LON],[SATS],[RSSI],[CONN_DEVICES],[LOBBY_CODE]
            if (trimmed.startsWith('SELF:')) {
              const parts = trimmed.substring(5).split(',');
              if (parts.length >= 3) {
                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);
                const satellites = parseInt(parts[2], 10);
                const valid = (lat !== 0 || lng !== 0) && !Number.isNaN(lat) && !Number.isNaN(lng);
                setMyLocation({ lat: Number.isNaN(lat) ? 0 : lat, lng: Number.isNaN(lng) ? 0 : lng, satellites: Number.isNaN(satellites) ? 0 : satellites, valid });
          
                // Parse RSSI
                if (parts.length >= 4) {
                  const rssi = parseInt(parts[3], 10);
                  if (!isNaN(rssi) && rssi !== 0) setLoraSignalStrength(rssi);
                }
          
                // Parse connected devices
                if (parts.length >= 5) {
                  const connCount = parseInt(parts[4], 10);
                  if (!isNaN(connCount)) {
                    setConnectedDevicesCount(connCount);
                    setIsDeviceReachable(connCount > 0);
                  }
                }

                // FIX: Passive Sync - Update app lobby code if hardware says we are in one
                if (parts.length >= 6) {
                  const rawLobbyField = (parts[5] || '').toString().trim();
                  const deviceLobby = parseInt(rawLobbyField, 10);
                  const isValidLobbyOrZero =
                    !Number.isNaN(deviceLobby) && (deviceLobby === 0 || (deviceLobby >= 1000 && deviceLobby <= 9999));

                  if (isValidLobbyOrZero) {
                    deviceLobbyCodeRef.current = deviceLobby;
                    hubReportsLobbyRef.current = true;
                  } else {
                    // Legacy firmware may send SELF without lobby (part[5] is distance).
                    // Don't overwrite the hub lobby ref with small numbers like 3.
                    const now = Date.now();
                    if (now - (lastHubLobbySupportHintRef.current || 0) > 15000) {
                      lastHubLobbySupportHintRef.current = now;
                      // Best-effort hint; avoid spamming.
                      // showTemporaryStatus is defined in this file; safe to call here.
                      showTemporaryStatus('Hub firmware may be outdated (no lobby in SELF). Please flash latest firmware.', 4000);
                    }
                  }

                  if (isValidLobbyOrZero && deviceLobby >= 1000 && deviceLobby <= 9999 && !isInLobbyRef.current) {
                    // The device is in a lobby but the app isn't. Passively join.
                    console.log(`[Passive Sync] Device is in Lobby ${deviceLobby}. Syncing app...`);

                    if (typeof joinLobby === 'function') {
                      joinLobby(deviceLobby, (myNickname || 'Hiker')).then(() => {
                        if (typeof onPassiveJoin === 'function') {
                          onPassiveJoin();
                        }
                      }).catch(() => {});
                    }

                    const connectedDeviceObj = (() => {
                      const list = connectedDevicesListRef.current || [];
                      const activeId = activeHubIdRef.current;
                      return (activeId ? list.find(d => d?.id === activeId) : list[0]) || null;
                    })();
                    const currentLocalDeviceId = myDeviceId || (connectedDeviceObj ? parseDeviceId(connectedDeviceObj) : null);
                    if (currentLocalDeviceId !== null) {
                      registerMemberSync(currentLocalDeviceId, Date.now(), { isSelf: true, source: 'passive-sync' });
                    }
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

        if (Number.isNaN(deviceId) || deviceId <= 0) {
          return;
        }

        console.log(`Received ALERT: ${type} from Device ${deviceId}`);
        
        // Handle OFFLINE/ONLINE alerts (only have deviceId, no coordinates)
        if (type === 'OFFLINE') {
          const displayName = (typeof getMemberNickname === 'function') ? getMemberNickname(deviceId) : `Device ${deviceId}`;
          setMemberLocations(prev => {
            const existing = prev.findIndex(m => m.deviceId === deviceId);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = { ...updated[existing], isOffline: true, alertType: 'OFFLINE', lastUpdate: Date.now() };
              return updated;
            }
            return [...prev, { deviceId, isOffline: true, alertType: 'OFFLINE', lastUpdate: Date.now() }];
          });
          upsertTrackedAlert({
            type: 'OFFLINE',
            deviceId,
            timestamp: Date.now(),
            displayName,
            isOffline: true,
          });
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
          // Clear any offline alert for this device.
          removeTrackedAlerts(alert => {
            return !!alert && alert.deviceId === deviceId && alert.type === 'OFFLINE';
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
        // - ALERT:TOO_FAR,<deviceId>,<distanceMeters>,<WARN|CRITICAL>
        // - ALERT:REGROUPED,<deviceId>,<distanceMeters>
        if (type === 'TOO_FAR' || type === 'REGROUPED') {
          const dist = parts.length >= 3 ? parseFloat(parts[2]) : 0;
          const level = parts.length >= 4
            ? String(parts[3] || '').toUpperCase()
            : (Number.isFinite(dist) && dist > 300 ? 'CRITICAL' : 'WARN');
          const displayName = getMemberNickname ? getMemberNickname(deviceId) : `Device ${deviceId}`;

          if (type === 'TOO_FAR') {
            if (level === 'CRITICAL') {
              showTemporaryStatus(
                `Critical: ${displayName} is ${Number.isFinite(dist) ? dist.toFixed(0) : '?'}m away`,
                7000
              );
              triggerVibration('SOS');
              pushEmergencyNotification(
                'Critical Separation Alert',
                `${displayName} is ${Number.isFinite(dist) ? dist.toFixed(0) : '?'}m away`,
                `sep-critical-${deviceId}-${Math.round(dist || 0)}`
              );
              addActivity('separation', deviceId, `Critical separation: ${displayName} is ${Number.isFinite(dist) ? dist.toFixed(1) : '?'}m away`);
            } else {
              showTemporaryStatus(
                `Warning: ${displayName} is ${Number.isFinite(dist) ? dist.toFixed(0) : '?'}m away`,
                6000
              );
              triggerVibration('ALERT');
              addActivity('separation', deviceId, `Separation warning: ${displayName} is ${Number.isFinite(dist) ? dist.toFixed(1) : '?'}m away`);
            }
          } else {
            showTemporaryStatus(`${displayName} is back in range`, 3500);
            triggerVibration('OK');
            addActivity('separation', deviceId, `Regrouped: ${displayName} is back in range`);
          }

          return;
        }

        // Acknowledgement alerts (no coordinates)
        // Firmware format: ALERT:ON_MY_WAY,<deviceId>
        if (type === 'ON_MY_WAY') {
          const helperName = (typeof getMemberNickname === 'function') ? getMemberNickname(deviceId) : `Device ${deviceId}`;
          addActivity('on_my_way', `${helperName} is on the way`);

          let shouldNotifySender = false;
          const now = Date.now();

          // One acknowledgement silences ringing/prompts for everyone with active SOS/MORSE.
          updateTrackedAlerts((prev) => {
            let changed = false;
            const next = { ...prev };

            Object.keys(next).forEach((key) => {
              const alert = next[key];
              if (!alert) return;
              if (alert.type !== 'SOS' && alert.type !== 'MORSE') return;

              // Ignore accidental self-ack loops.
              if (typeof alert.deviceId === 'number' && alert.deviceId === deviceId) {
                return;
              }

              shouldNotifySender = shouldNotifySender || !!alert.localEmergency;
              silencedEmergencyRef.current.set(key, { ts: now, byDeviceId: deviceId });
              next[key] = {
                ...alert,
                silenced: true,
                silencedAt: now,
                silencedByDeviceId: deviceId,
                helperName,
              };
              changed = true;
            });

            return changed ? next : prev;
          });

          stopEmergencySignals();
          showTemporaryStatus(`${helperName} is on the way`, 3000);

          // Only the SOS sender needs the popup/notification.
          if (shouldNotifySender) {
            pushEmergencyNotification(
              'Help Coming',
              `${helperName} is on the way to help you.`,
              `on_my_way-${deviceId}`
            );

            if (!shouldThrottleEmergency(`popup-onmyway-${deviceId}`, 12000)) {
              Alert.alert(
                '✅ Help on the Way',
                `${helperName} is coming to help!`,
                [{ text: 'Dismiss' }],
                { cancelable: true }
              );
            }
          }

          return;
        }
        
                // Standard alerts with coordinates (SOS, MORSE, OK)
        if (parts.length >= 4) {
          const lat = parseFloat(parts[2]);
          const lng = parseFloat(parts[3]);

          if (Number.isNaN(lat) || Number.isNaN(lng)) {
            console.log(`Skipping alert from ${deviceId} due to invalid coordinates: ${parts[2]}, ${parts[3]}`);
            return;
          }
          
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
              updated[existing] = { ...updated[existing], ...newLoc };
              return updated;
            }
            return [...prev, newLoc];
          });
          
          // Handle different alert types
          if (type === 'SOS' || type === 'MORSE') {
            const emergencyKey = `${type}-${deviceId}`;
            const displayName = (typeof getMemberNickname === 'function') ? getMemberNickname(deviceId) : `Device ${deviceId}`;

            const now = Date.now();
            const silencedEntry = silencedEmergencyRef.current.get(emergencyKey);
            const isSilenced = !!(silencedEntry && (now - (silencedEntry.ts || 0)) < EMERGENCY_SILENCE_WINDOW_MS);
            const existingEmergency = activeAlertsByKeyRef.current[emergencyKey] || null;

            const isLocalEmergency = !!(existingEmergency && existingEmergency.localEmergency);
            const isRepeatEmergency = !!(
              existingEmergency &&
              !existingEmergency.silenced &&
              !isSilenced &&
              !existingEmergency.rearmPending
            );

            // Preserve localEmergency (sender) and helperName (when silenced) across repeated SOS packets.
            upsertTrackedAlert({
              ...(existingEmergency || {}),
              type,
              deviceId,
              lat,
              lng,
              timestamp: now,
              displayName,
              localEmergency: isLocalEmergency,
              silenced: isSilenced,
              silencedAt: isSilenced ? (silencedEntry.ts || null) : null,
              silencedByDeviceId: isSilenced ? (silencedEntry.byDeviceId ?? null) : null,
              helperName: isSilenced ? (existingEmergency?.helperName ?? null) : null,
              rearmPending: false,
            }, {
              preferFocus: true,
            });

            if (!isRepeatEmergency) {
              addActivity('sos', `${displayName} triggered ${type} alert!`);
            }

            // Don't self-notify (sender), and don't re-trigger vibration/audio on every repeated SOS packet.
            if (!isSilenced && !isLocalEmergency && !isRepeatEmergency) {
              // Vibrate with SOS pattern
              triggerVibration('SOS');
              startEmergencySignals();

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
            }

            // SOS-only: request their full trail snapshot so late joiners can catch up.
            if (type === 'SOS' && !isRepeatEmergency) {
              // Clear any prior stored trail so the snapshot is clean/full.
              clearRemoteTrailsForDevice(deviceId);
              requestSosTrailSnapshot(deviceId);
            }
          } else if (type === 'OK') {
            const displayName = (typeof getMemberNickname === 'function') ? getMemberNickname(deviceId) : `Device ${deviceId}`;

            // Clear any active emergency state for this device.
            silencedEmergencyRef.current.delete(`SOS-${deviceId}`);
            silencedEmergencyRef.current.delete(`MORSE-${deviceId}`);

            // OK received - clear any active alert from that device
            removeTrackedAlerts(alert => {
              return !!alert && alert.deviceId === deviceId;
            });
            console.log(`Clearing alert from Device ${deviceId} (received OK)`);
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
            clearRemoteTrailsForDevice(deviceId);

            addActivity('ok', `${displayName} cancelled alert`);
            showTemporaryStatus(`${displayName} is OK`, 3000);

            // Vibrate with OK pattern
            triggerVibration('OK');

            Alert.alert(
              '✅ Alert Cancelled',
              `${displayName} has signaled they are OK.`,
              [{ text: 'Dismiss' }],
              { cancelable: true }
            );
          } else if (type === 'ON_MY_WAY') {
            const helperName = (typeof getMemberNickname === 'function') ? getMemberNickname(deviceId) : `Device ${deviceId}`;
            addActivity('on_my_way', `${helperName} is on the way`);

            let shouldNotifySender = false;
            const now = Date.now();

            // One acknowledgement silences ringing/prompts for everyone with active SOS/MORSE.
            updateTrackedAlerts((prev) => {
              let changed = false;
              const next = { ...prev };

              Object.keys(next).forEach((key) => {
                const alert = next[key];
                if (!alert) return;
                if (alert.type !== 'SOS' && alert.type !== 'MORSE') return;

                // Ignore accidental self-ack loops.
                if (typeof alert.deviceId === 'number' && alert.deviceId === deviceId) {
                  return;
                }

                shouldNotifySender = shouldNotifySender || !!alert.localEmergency;
                silencedEmergencyRef.current.set(key, { ts: now, byDeviceId: deviceId });
                next[key] = {
                  ...alert,
                  silenced: true,
                  silencedAt: now,
                  silencedByDeviceId: deviceId,
                  helperName,
                };
                changed = true;
              });

              return changed ? next : prev;
            });

            stopEmergencySignals();
            showTemporaryStatus(`${helperName} is on the way`, 3000);

            if (shouldNotifySender) {
              pushEmergencyNotification(
                'Help Coming',
                `${helperName} is on the way to help you.`,
                `on_my_way-${deviceId}`
              );

              if (!shouldThrottleEmergency(`popup-onmyway-${deviceId}`, 12000)) {
                Alert.alert(
                  '✅ Help on the Way',
                  `${helperName} is coming to help!`,
                  [{ text: 'Dismiss' }],
                  { cancelable: true }
                );
              }
            }
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

          if (!Number.isNaN(deviceId) && !Number.isNaN(lat) && !Number.isNaN(lng)) {
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
      
            // Handle errors from device
            else if (trimmed.startsWith('ERROR:')) {
              const error = trimmed.substring(6);
              // Legacy lobby discovery/verification errors are no longer used.
              console.log('[BLE] Device error', { error });
            }
      
      // STATUS messages from own device
      else if (trimmed.startsWith('STATUS:')) {
        const status = trimmed.substring(7);

        // STATUS:INVALID_LOBBY,<code>
        if (status.startsWith('INVALID_LOBBY,')) {
          const parts = status.split(',').map(p => p.trim());
          const bad = parts.length >= 2 ? parts[1] : '';
          showTemporaryStatus(`Invalid lobby code: ${bad}. Use 4 digits (1000–9999).`, 4000);
          return;
        }

        // STATUS:JOIN_LOBBY_FIRST
        if (status === 'JOIN_LOBBY_FIRST') {
          showTemporaryStatus('Join a lobby first (enter a 4-digit code).', 3500);
          return;
        }

        // STATUS:INVALID_DM_TARGET,<mobileId>
        if (status.startsWith('INVALID_DM_TARGET,')) {
          const parts = status.split(',').map(p => p.trim());
          const bad = parts.length >= 2 ? parts[1] : '';
          showTemporaryStatus(`Invalid recipient: ${bad}.`, 4000);
          return;
        }

        // STATUS:LOBBY,<code> (silent heartbeat used for lobby confirmation)
        if (status.startsWith('LOBBY,')) {
          const parts = status.split(',').map(p => p.trim());
          const code = parts.length >= 2 ? parseInt(parts[1], 10) : NaN;
          const isValidLobbyOrZero =
            !Number.isNaN(code) && (code === 0 || (code >= 1000 && code <= 9999));
          if (isValidLobbyOrZero) {
            deviceLobbyCodeRef.current = code;
            hubReportsLobbyRef.current = true;
          }
          return;
        }
        
        // STATUS:LOBBY_SET,<code>
        if (status.startsWith('LOBBY_SET,')) {
          const parts = status.split(',').map(p => p.trim());
          const code = parts.length >= 2 ? parseInt(parts[1], 10) : NaN;

          const isValidLobbyCode = !Number.isNaN(code) && code >= 1000 && code <= 9999;

          const prevHubLobby = deviceLobbyCodeRef.current;

          if (!Number.isNaN(code) && code > 0 && !isValidLobbyCode) {
            // Keep the value for safety gating (prevents cross-lobby leaks),
            // but do not prompt/sync to an invalid lobby code.
            deviceLobbyCodeRef.current = code;
            showTemporaryStatus(`Ignoring invalid hub lobby: ${code}`, 3000);
            return;
          }

          if (isValidLobbyCode) {
            deviceLobbyCodeRef.current = code;
            hubReportsLobbyRef.current = true;
            showTemporaryStatus(`Lobby set: ${code}`, 3000);

            // Multi-phone-on-one-hub behavior: the hub has a single active lobby.
            // If another phone overwrote it, prompt the user to switch locally.
            const localLobby = lobbyCodeRef.current;
            if (
              isInLobbyRef.current &&
              typeof localLobby === 'number' &&
              localLobby > 0 &&
              localLobby !== code &&
              typeof prevHubLobby === 'number' &&
              prevHubLobby > 0 &&
              prevHubLobby !== code
            ) {
              const now = Date.now();
              const last = lastLobbyChangePromptRef.current || { code: null, ts: 0 };
              const shouldPrompt = last.code !== code || (now - (last.ts || 0)) > 8000;

              if (shouldPrompt) {
                lastLobbyChangePromptRef.current = { code, ts: now };
                Alert.alert(
                  'Hub lobby changed',
                  `Another phone changed the hub to lobby ${code}. Switch your app to match?`,
                  [
                    { text: 'Stay', style: 'cancel' },
                    {
                      text: 'Switch',
                      onPress: () => {
                        if (typeof joinLobby === 'function') {
                          joinLobby(code, (myNickname || 'Hiker')).then(() => {
                            const connectedDeviceObj = (() => {
                              const list = connectedDevicesListRef.current || [];
                              const activeId = activeHubIdRef.current;
                              return (activeId ? list.find(d => d?.id === activeId) : list[0]) || null;
                            })();
                            const currentLocalDeviceId = myDeviceId || (connectedDeviceObj ? parseDeviceId(connectedDeviceObj) : null);
                            if (currentLocalDeviceId !== null) {
                              registerMemberSync(currentLocalDeviceId, Date.now(), { isSelf: true, source: 'lobby-change-prompt' });
                            }
                          }).catch(() => {});
                        }
                      },
                    },
                  ],
                  { cancelable: true }
                );
              }
            }

            // If the hardware indicates we're in a lobby but the app isn't, sync locally.
            if (!isInLobbyRef.current && typeof joinLobby === 'function') {
              joinLobby(code, (myNickname || 'Hiker')).then(() => {
                if (typeof onPassiveJoin === 'function') {
                  onPassiveJoin();
                }
              }).catch(() => {});

              const connectedDeviceObj = (() => {
                const list = connectedDevicesListRef.current || [];
                const activeId = activeHubIdRef.current;
                return (activeId ? list.find(d => d?.id === activeId) : list[0]) || null;
              })();
              const currentLocalDeviceId = myDeviceId || (connectedDeviceObj ? parseDeviceId(connectedDeviceObj) : null);
              if (currentLocalDeviceId !== null) {
                registerMemberSync(currentLocalDeviceId, Date.now(), { isSelf: true, source: 'status-lobby-set' });
              }
            }

            // If a sync was pending, this confirms the device stored the code.
            clearPendingDeviceLobbySync();
          } else if (code === 0) {
            deviceLobbyCodeRef.current = 0;
            hubReportsLobbyRef.current = true;
            showTemporaryStatus('Device lobby cleared', 2500);
            clearPendingDeviceLobbySync();
            if (typeof clearLobbyLocalOnly === 'function') {
              setTimeout(() => {
                clearLobbyLocalOnly();
              }, 50);
            }
          } else {
            showTemporaryStatus(status, 3000);
          }
          return;
        } else if (status === 'LOBBY_CLEARED') {
          deviceLobbyCodeRef.current = 0;
          showTemporaryStatus('Device lobby memory cleared', 3000);
        } else if (status === 'SENDING_SOS' || status === 'SENDING_MORSE_SOS') {
          const emergencyType = status === 'SENDING_SOS' ? 'SOS' : 'MORSE';
          const now = Date.now();

          const lastReq = lastLocalEmergencyRequestRef.current || { type: null, ts: 0 };
          const hasRecentLocalIntent =
            lastReq.type === emergencyType &&
            (now - (lastReq.ts || 0)) < LOCAL_EMERGENCY_INTENT_WINDOW_MS;

          // STATUS:SENDING_* is emitted by the hub and broadcast to all connected phones.
          // Recent local intent marks the sender phone; other phones should treat this as a receiver alert.
          const treatAsLocal = hasRecentLocalIntent;

          if (hasRecentLocalIntent) {
            lastLocalEmergencyRequestRef.current = { type: null, ts: 0 };
          }

          const localDeviceId = (typeof myDeviceId === 'number' && !Number.isNaN(myDeviceId))
            ? myDeviceId
            : parseDeviceId(connectedDevice || deviceRef.current);

          const displayName =
            (typeof getMemberNickname === 'function' && typeof localDeviceId === 'number')
              ? getMemberNickname(localDeviceId)
              : ((myNickname || '').trim() ? myNickname : 'Your phone');

          const localLat = (myLocation?.valid && Number.isFinite(myLocation?.lat) && Number.isFinite(myLocation?.lng))
            ? myLocation.lat
            : null;
          const localLng = (myLocation?.valid && Number.isFinite(myLocation?.lat) && Number.isFinite(myLocation?.lng))
            ? myLocation.lng
            : null;

          const emergencyKey = `${emergencyType}-${typeof localDeviceId === 'number' ? localDeviceId : 'local'}`;

          upsertTrackedAlert({
            type: emergencyType,
            deviceId: (typeof localDeviceId === 'number' ? localDeviceId : null),
            lat: localLat,
            lng: localLng,
            timestamp: now,
            localEmergency: treatAsLocal,
            displayName,
            silenced: false,
            rearmPending: false,
          }, {
            preferFocus: true,
          });

          addActivity('sos', `${displayName} triggered ${emergencyType}`);
          if (!treatAsLocal) {
            triggerVibration('SOS');
            startEmergencySignals();

            pushEmergencyNotification(
              'Emergency Alert',
              `${displayName} triggered ${emergencyType}. Check immediately.`,
              emergencyKey
            );

            if (!shouldThrottleEmergency(`popup-${emergencyKey}`, 12000)) {
              const locationLine =
                (Number.isFinite(localLat) && Number.isFinite(localLng))
                  ? `\n\nLocation: ${localLat.toFixed(5)}, ${localLng.toFixed(5)}`
                  : '';
              Alert.alert(
                '🚨 EMERGENCY ALERT',
                `${displayName} triggered ${emergencyType}.${locationLine}`,
                [{ text: 'Dismiss' }],
                { cancelable: true }
              );
            }
          }

          setStatusMessage(`${emergencyType === 'MORSE' ? 'MC' : emergencyType} active for ${displayName}`);

          // Only enable trail sharing for true SOS (not MORSE), per spec.
          if (status === 'SENDING_SOS') {
            setIsSosTrailSharingActive(true);
          }

          // Status displayed via setStatusMessage below.
          return;
        } else if (status === 'SENDING_OK') {
          const localDeviceId = (typeof myDeviceId === 'number' && !Number.isNaN(myDeviceId))
            ? myDeviceId
            : parseDeviceId(connectedDevice || deviceRef.current);

          // Clear local active emergency state when this hub reports OK sent.
          removeTrackedAlerts((alert) => {
            if (!alert) return false;
            if (alert.type !== 'SOS' && alert.type !== 'MORSE') return false;

            if (typeof localDeviceId === 'number' && localDeviceId > 0) {
              return alert.deviceId === localDeviceId;
            }

            return !!alert.localEmergency;
          });
          if (typeof localDeviceId === 'number' && localDeviceId > 0) {
            silencedEmergencyRef.current.delete(`SOS-${localDeviceId}`);
            silencedEmergencyRef.current.delete(`MORSE-${localDeviceId}`);
          }
          stopEmergencySignals();
          setStatusMessage('Emergency cleared (OK sent)');
          setIsSosTrailSharingActive(false);

          // Keep the friendly message; don't overwrite with the raw status token.
          showTemporaryStatus('Emergency cleared (OK sent)', 3000);
          return;
        } else {
          // Default: display raw status string briefly.
          showTemporaryStatus(status, 3000);
          return;
        }
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

            // Treat nickname packets as presence so late-joining devices appear in Members/Message tabs.
            if (isInLobbyRef.current && typeof registerMemberSync === 'function') {
              if (!knownMembersRef.current.has(deviceId)) {
                knownMembersRef.current.add(deviceId);
              }
              registerMemberSync(deviceId, Date.now(), { source: 'nickname' });
            }

            // Keep tracked alerts aligned to latest nickname.
            updateTrackedAlerts((prev) => {
              let changed = false;
              const next = { ...prev };

              Object.keys(next).forEach((key) => {
                const alert = next[key];
                if (!alert) return;
                if (alert.deviceId !== deviceId) return;
                next[key] = { ...alert, displayName: nickname };
                changed = true;
              });

              return changed ? next : prev;
            });

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
            if (typeof myDeviceId === 'number' && deviceId === myDeviceId) {
              return;
            }
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

        // Guard against lobby mismatch between phone state and device state.
        // This prevents cross-lobby leaks if the phone joined a new code but the device is still on an old/empty code.
        const desiredLobby = lobbyCodeRef.current;
        const deviceLobby = deviceLobbyCodeRef.current;
        if (desiredLobby && deviceLobby !== null && deviceLobby !== undefined && desiredLobby !== deviceLobby) {
          const now = Date.now();
          const last = lastLobbyMismatchDropRef.current || { ts: 0 };
          if (now - (last.ts || 0) > 4000 || last.desired !== desiredLobby || last.device !== deviceLobby) {
            lastLobbyMismatchDropRef.current = { ts: now, desired: desiredLobby, device: deviceLobby };
            showTemporaryStatus(`Ignoring chat (lobby mismatch: phone ${desiredLobby}, hub ${deviceLobby})`, 2500);
          }
          return;
        }
        const firstComma = trimmed.indexOf(',');
        if (firstComma > 4) {
          const fromId = parseInt(trimmed.substring(4, firstComma), 10);
          const remaining = trimmed.substring(firstComma + 1);

          if (!Number.isNaN(fromId) && isInLobbyRef.current) {
            registerMemberSync(fromId, Date.now(), { source: 'incoming-msg' });
          }
          
          // Parse optional target prefix: T<targetDeviceId>,...
          // Newer firmware sends: MSG:<from>,T<target>,M<mobile>,<text>,RSSI:<rssi>
          // Older firmware: MSG:<from>,M<mobile>,<text>,RSSI:<rssi>
          let targetDeviceId = null;
          let afterTarget = remaining;
          if (remaining.startsWith('T')) {
            const targetMatch = remaining.match(/^T(\d+),(.*)$/);
            if (targetMatch) {
              const parsedTarget = parseInt(targetMatch[1], 10);
              if (!Number.isNaN(parsedTarget)) {
                targetDeviceId = parsedTarget;
              }
              afterTarget = targetMatch[2] || '';
            }
          }

          // Parse mobile ID (Mx format) if present
          let mobileId = 0;
          let textWithMeta = afterTarget;
          let rssiValue = null;
          
          if (afterTarget.startsWith('M')) {
            const mobileMatch = afterTarget.match(/^M(\d+),(.*)$/);
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

          // If firmware didn't provide target, assume broadcast (safest: prevents mixing into direct threads).
          const normalizedTarget = (typeof targetDeviceId === 'number') ? targetDeviceId : 0;
          const localDeviceId = (() => {
            if (typeof myDeviceId === 'number' && !Number.isNaN(myDeviceId)) return myDeviceId;
            const parsed = connectedDevice ? parseDeviceId(connectedDevice) : null;
            return (typeof parsed === 'number' && !Number.isNaN(parsed)) ? parsed : 0;
          })();

          // Phone-targeted DM tagging.
          // Format in text: __DM__:<toMobileId>:<fromMobileId>:<text>
          // (Older/partial forms may omit fromMobileId; tolerate gracefully.)
          let dmToMobileId = null;
          let dmFromMobileId = null;
          if (typeof text === 'string' && text.startsWith('__DM__:')) {
            const dmRest = text.substring('__DM__:'.length);
            const firstSep = dmRest.indexOf(':');
            if (firstSep > 0) {
              const toStr = dmRest.substring(0, firstSep).trim();
              const afterTo = dmRest.substring(firstSep + 1);
              const secondSep = afterTo.indexOf(':');
              const fromStr = secondSep >= 0 ? afterTo.substring(0, secondSep).trim() : '';
              const body = secondSep >= 0 ? afterTo.substring(secondSep + 1) : afterTo;

              const parsedTo = parseInt(toStr, 10);
              const parsedFrom = fromStr ? parseInt(fromStr, 10) : NaN;

              if (!Number.isNaN(parsedTo) && parsedTo >= 1 && parsedTo <= 4) {
                dmToMobileId = parsedTo;
                if (!Number.isNaN(parsedFrom) && parsedFrom >= 0 && parsedFrom <= 4) {
                  dmFromMobileId = parsedFrom;
                  // Prefer the explicit DM sender mobile ID.
                  if (parsedFrom > 0) {
                    mobileId = parsedFrom;
                  }
                }

                // If this phone has a claimed mobile slot, only show DMs intended for it.
                const myMobile = myMobileIdRef.current;
                if (typeof myMobile === 'number' && myMobile >= 1 && myMobile <= 4 && myMobile !== dmToMobileId) {
                  return;
                }

                text = body;
              }
            }
          }

          const ackId = decodeAckPayload(text);
          if (ackId) {
            let deliveredMessageId = null;
            setMessages(prev => prev.map(msg => {
              if (msg?.isMine && msg?.ackId === ackId) {
                deliveredMessageId = msg.id;
                return {
                  ...msg,
                  pending: false,
                  awaitingAck: false,
                  failed: false,
                  deliveryUnconfirmed: false,
                  delivered: true,
                  deliveredAt: Date.now(),
                };
              }
              return msg;
            }));

            if (deliveredMessageId) {
              clearMessageAckTimer(deliveredMessageId);
              appendDiagnostic('message_ack_received', {
                messageId: deliveredMessageId,
                ackId,
                fromDeviceId: fromId,
              });
              showTemporaryStatus('Message delivered', 2000);
            }
            return;
          }

          const decodedEnvelope = decodeMessageEnvelope(text);
          const inboundMessageId = decodedEnvelope.messageId;
          text = decodedEnvelope.text;

          const shouldSendDeliveryAck =
            !!inboundMessageId &&
            typeof fromId === 'number' && !Number.isNaN(fromId) && fromId > 0 &&
            typeof normalizedTarget === 'number' && normalizedTarget > 0 &&
            typeof localDeviceId === 'number' && localDeviceId > 0 &&
            normalizedTarget === localDeviceId;

          if (shouldSendDeliveryAck && !shouldThrottleAckSend(fromId, inboundMessageId)) {
            const queueAck = queueDeliveryAckRef.current;
            if (typeof queueAck === 'function') {
              queueAck(fromId, inboundMessageId);
            }
          }

          if (inboundMessageId && wasInboundMessageRecentlySeen(fromId, inboundMessageId)) {
            appendDiagnostic('message_duplicate_dropped', {
              fromDeviceId: fromId,
              messageId: inboundMessageId,
            });
            return;
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

          if (text === '__SOS_REARM__' || text === '__MORSE_REARM__') {
            if (Number.isNaN(fromId)) return;
            const rearmType = text === '__SOS_REARM__' ? 'SOS' : 'MORSE';
            unsilenceEmergencyForDevice(rearmType, fromId, { markRearm: true });
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
            const senderMobileId = (Number.isInteger(mobileId) && mobileId >= 1 && mobileId <= 4) ? mobileId : 0;

            setRemoteBreadcrumbs(prev => {
              const key = `${fromId}-m${senderMobileId}`;
              const existing = Array.isArray(prev?.[key]) ? prev[key] : [];
              const last = existing.length > 0 ? existing[existing.length - 1] : null;
              if (last && last.lat === lat && last.lng === lng && last.timestamp === timestamp) return prev;

              const nextArr = [...existing, { lat, lng, timestamp, deviceId: fromId, mobileId: senderMobileId }]
                .slice(-REMOTE_TRAIL_PER_KEY_MAX_POINTS);
              const merged = { ...(prev || {}), [key]: nextArr };
              return enforceRemoteTrailMemoryCap(merged);
            });
            return;
          }

          // Batched trail points (snapshot) - do not show in chat.
          if (text.startsWith('__BREADS__:')) {
            // Legacy format was too long for firmware MAX_TEXT_LEN=50 and may arrive truncated.
            // Ignore to avoid corrupt/partial points.
            return;
          }

          // Remote mobile nickname metadata (cross-hub) - do not show in chat.
          // Format: __MNICK__:<mobileId>:<nickname>
          if (text.startsWith('__MNICK__:')) {
            if (Number.isNaN(fromId)) return;

            if (typeof myDeviceId === 'number' && fromId === myDeviceId) {
              return;
            }

            const payload = text.substring('__MNICK__:'.length);
            const sep = payload.indexOf(':');

            const parsedMobile = sep > 0 ? parseInt(payload.substring(0, sep).trim(), 10) : mobileId;
            const nicknameRaw = (sep > 0 ? payload.substring(sep + 1) : payload).trim();
            const nickname = /^mobile\s*\d+$/i.test(nicknameRaw) ? '' : nicknameRaw;

            if (!Number.isNaN(parsedMobile) && parsedMobile >= 1 && parsedMobile <= 4 && nickname.length > 0) {
              const key = `${fromId}-m${parsedMobile}`;
              setRemoteMobileNicknames(prev => ({ ...(prev || {}), [key]: nickname }));

              // Treat remote phone nickname as presence and attach it to memberLocations so Map/Radar details can show it.
              if (isInLobbyRef.current && typeof registerMemberSync === 'function') {
                if (!knownMembersRef.current.has(fromId)) {
                  knownMembersRef.current.add(fromId);
                }
                registerMemberSync(fromId, Date.now(), { source: 'mnick' });
              }

              setMemberLocations(prev => {
                const existingIdx = (prev || []).findIndex(m => m && m.deviceId === fromId);
                const now = Date.now();

                const upsert = (entry) => {
                  const prevMobiles = Array.isArray(entry.mobiles) ? entry.mobiles : [];
                  const idx = prevMobiles.findIndex(m => m && m.mobileId === parsedMobile);
                  const nextMobile = { mobileId: parsedMobile, nickname, lastUpdate: now };

                  const nextMobiles = idx >= 0
                    ? prevMobiles.map((m, i) => (i === idx ? { ...m, ...nextMobile } : m))
                    : [...prevMobiles, nextMobile];

                  return {
                    ...entry,
                    mobiles: nextMobiles.slice().sort((a, b) => a.mobileId - b.mobileId),
                  };
                };

                if (existingIdx >= 0) {
                  const updated = [...prev];
                  updated[existingIdx] = upsert(updated[existingIdx]);
                  return updated;
                }

                return [...(prev || []), upsert({
                  deviceId: fromId,
                  lat: null,
                  lng: null,
                  satellites: 0,
                  lastUpdate: now,
                  alertType: null,
                  isOffline: false,
                  mobiles: [],
                })];
              });
            }
            return;
          }
          
          console.log(`Received MSG from Device ${fromId}: ${text}`);
          
          const newMessage = {
            id: `msg-${Date.now()}-${fromId}-${mobileId}${dmToMobileId ? `-dm-${dmToMobileId}` : ''}`,
            from: fromId,
            mobileId: mobileId,
            to: 'me',
            targetDeviceId: normalizedTarget,
            text: text,
            timestamp: Date.now(),
            isMine: false,
            rssi: rssiValue,
            dmToMobileId: dmToMobileId,
            dmFromMobileId: dmFromMobileId,
            incomingMessageId: inboundMessageId,
          };
          
          setMessages(prev => [...prev, newMessage].slice(-MAX_MESSAGES_IN_MEMORY));
          setUnreadCount(prev => prev + 1);
          
          // Vibrate for incoming message (respects vibrationEnabled)
          triggerVibration('MESSAGE');

          // Background-friendly notification for normal messages.
          // Prefer per-phone nickname when available; otherwise fall back to device nickname.
          const isSelfMsg =
            (typeof myDeviceId === 'number' && fromId === myDeviceId) &&
            (typeof myMobileIdRef.current === 'number' && myMobileIdRef.current >= 1 && myMobileIdRef.current <= 4) &&
            (typeof mobileId === 'number' && mobileId === myMobileIdRef.current);

          if (!isSelfMsg) {
            const nickKey = (typeof mobileId === 'number' && mobileId >= 1 && mobileId <= 4)
              ? `${fromId}-m${mobileId}`
              : null;
            const rawNick = nickKey ? (remoteMobileNicknamesRef.current?.[nickKey] || '') : '';
            const phoneNick = /^mobile\s*\d+$/i.test(String(rawNick).trim()) ? '' : String(rawNick).trim();
            const fromName = phoneNick || (getMemberNickname ? getMemberNickname(fromId) : '') || `Device ${fromId}`;

            pushMessageNotification(
              `Message from ${fromName}`,
              text,
              `${fromId}-${mobileId}-${newMessage.timestamp}`
            );
          }
        }
      }

      // ECHO_MSG:[DEVICE_ID],[TEXT] - Echoed local message from ESP32 to all connected phones
      else if (trimmed.startsWith('ECHO_MSG:')) {
        if (!isInLobbyRef.current) {
          return;
        }

        // Guard against lobby mismatch between phone state and device state.
        const desiredLobby = lobbyCodeRef.current;
        const deviceLobby = deviceLobbyCodeRef.current;
        if (desiredLobby && deviceLobby !== null && deviceLobby !== undefined && desiredLobby !== deviceLobby) {
          const now = Date.now();
          const last = lastLobbyMismatchDropRef.current || { ts: 0 };
          if (now - (last.ts || 0) > 4000 || last.desired !== desiredLobby || last.device !== deviceLobby) {
            lastLobbyMismatchDropRef.current = { ts: now, desired: desiredLobby, device: deviceLobby };
            showTemporaryStatus(`Ignoring chat (lobby mismatch: phone ${desiredLobby}, hub ${deviceLobby})`, 2500);
          }
          return;
        }
        const firstComma = trimmed.indexOf(',');
        if (firstComma > 9) {
          // NOTE: The numeric field is the *target device id* for the relay (0=broadcast).
          // It is not the sender device id.
          const targetDeviceId = parseInt(trimmed.substring(9, firstComma), 10);
          const rawText = trimmed.substring(firstComma + 1);

          const localDeviceId = (() => {
            if (typeof myDeviceId === 'number' && !Number.isNaN(myDeviceId)) return myDeviceId;
            const parsed = connectedDevice ? parseDeviceId(connectedDevice) : null;
            return (typeof parsed === 'number' && !Number.isNaN(parsed)) ? parsed : 0;
          })();

          let text = rawText;
          let localOnly = false;
          let dmToMobileId = null;
          let dmFromMobileId = null;

          // Local-only broadcast sentinel prefix.
          if (typeof text === 'string' && text.startsWith('__LOCAL__:')) {
            localOnly = true;
            text = text.substring('__LOCAL__:'.length);
          }

          if (typeof rawText === 'string' && rawText.startsWith('__DM__:')) {
            const dmRest = rawText.substring('__DM__:'.length);
            const firstSep = dmRest.indexOf(':');
            if (firstSep > 0) {
              const toStr = dmRest.substring(0, firstSep).trim();
              const afterTo = dmRest.substring(firstSep + 1);
              const secondSep = afterTo.indexOf(':');
              const fromStr = secondSep >= 0 ? afterTo.substring(0, secondSep).trim() : '';
              const body = secondSep >= 0 ? afterTo.substring(secondSep + 1) : afterTo;

              const parsedTo = parseInt(toStr, 10);
              const parsedFrom = fromStr ? parseInt(fromStr, 10) : NaN;
              if (!Number.isNaN(parsedTo) && parsedTo >= 1 && parsedTo <= 4) {
                dmToMobileId = parsedTo;
                if (!Number.isNaN(parsedFrom) && parsedFrom >= 0 && parsedFrom <= 4) {
                  dmFromMobileId = parsedFrom;
                }
                text = body;

                // Only the DM sender or recipient should surface local-echo DMs.
                const myMobile = myMobileIdRef.current;
                if (typeof myMobile === 'number' && myMobile >= 1 && myMobile <= 4) {
                  const isRecipient = myMobile === dmToMobileId;
                  const isSender = dmFromMobileId !== null && myMobile === dmFromMobileId;
                  if (!isRecipient && !isSender) {
                    return;
                  }
                }
              }
            }
          }

          const decodedEchoEnvelope = decodeMessageEnvelope(text);
          const echoMessageId = decodedEchoEnvelope.messageId;
          text = decodedEchoEnvelope.text;

          if (text === '__SOS_REARM__' || text === '__MORSE_REARM__') {
            const rearmType = text === '__SOS_REARM__' ? 'SOS' : 'MORSE';
            if (typeof localDeviceId === 'number' && localDeviceId > 0) {
              unsilenceEmergencyForDevice(rearmType, localDeviceId, { markRearm: true });
            }
            return;
          }

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
            text.startsWith('__BREAD__:') ||
            text.startsWith('__BREADS__:') ||
            text.startsWith('__TRAIL_REQ__:') ||
            text.startsWith('__MNICK__:')
          ) {
            return;
          }

          const now = Date.now();
          let shouldIncrementUnread = true;
          let ackWaitTarget = null;
          const isFromMeDm =
            (typeof dmFromMobileId === 'number' && dmFromMobileId >= 1 && dmFromMobileId <= 4) &&
            (typeof myMobileIdRef.current === 'number' && myMobileIdRef.current >= 1 && myMobileIdRef.current <= 4) &&
            (dmFromMobileId === myMobileIdRef.current);

          setMessages(prev => {
            // If this phone already added the outgoing message, avoid duplicates and just clear pending state.
            const existingMineIdx = prev.findIndex(msg =>
              msg.isMine &&
              (
                (echoMessageId && msg.ackId === echoMessageId) ||
                (
                  msg.to === targetDeviceId &&
                  msg.text === text &&
                  (!!msg.localOnly === !!localOnly) &&
                  (dmToMobileId ? msg.dmToMobileId === dmToMobileId : !msg.dmToMobileId) &&
                  now - msg.timestamp < 15000
                )
              )
            );

            if (existingMineIdx >= 0) {
              shouldIncrementUnread = false;
              const updated = [...prev];
              const existing = updated[existingMineIdx];
              const shouldAwaitRecipientAck = !!existing?.requiresDeliveryAck && !existing?.delivered;
              updated[existingMineIdx] = {
                ...existing,
                pending: false,
                awaitingAck: shouldAwaitRecipientAck,
                failed: false,
                deliveryUnconfirmed: false,
                delivered: existing?.delivered ? true : !existing?.requiresDeliveryAck,
                hubConfirmedAt: now,
              };

              ackWaitTarget = {
                messageId: updated[existingMineIdx].id,
                requiresDeliveryAck: shouldAwaitRecipientAck,
                label: dmToMobileId ? 'Direct message' : 'Message',
              };
              return updated;
            }

            // For other connected phones, add to chat history so everyone sees the local relay.
            return [
              ...prev,
              {
                id: `echo-${now}-${targetDeviceId}${dmToMobileId ? `-dm-${dmToMobileId}` : ''}`,
                from: localDeviceId,
                mobileId: dmFromMobileId || 0,
                to: Number.isNaN(targetDeviceId) ? 0 : targetDeviceId,
                targetDeviceId: Number.isNaN(targetDeviceId) ? 0 : targetDeviceId,
                text,
                timestamp: now,
                isMine: false,
                echoed: true,
                localOnly,
                dmToMobileId: dmToMobileId,
                dmFromMobileId: dmFromMobileId,
                incomingMessageId: echoMessageId,
              },
            ];
          });

          if (ackWaitTarget?.messageId) {
            clearMessageAckTimer(ackWaitTarget.messageId);
            if (ackWaitTarget.requiresDeliveryAck) {
              const armAckFallback = armRecipientAckFallbackRef.current;
              if (typeof armAckFallback === 'function') {
                armAckFallback(ackWaitTarget.messageId, ackWaitTarget.label);
              }
            }
          }

          if (shouldIncrementUnread && !isFromMeDm) {
            setUnreadCount(prev => prev + 1);

            // For local-echo DMs we know the sender mobile slot; use its nickname.
            let fromName = '';
            if (typeof dmFromMobileId === 'number' && dmFromMobileId >= 1 && dmFromMobileId <= 4) {
              const rawNick = localMobileNicknamesRef.current?.[dmFromMobileId] || '';
              const cleanNick = /^mobile\s*\d+$/i.test(String(rawNick).trim()) ? '' : String(rawNick).trim();
              fromName = cleanNick || `M${dmFromMobileId}`;
            } else {
              fromName = 'This Hub';
            }

            pushMessageNotification(
              `Message from ${fromName}`,
              text,
              `echo-${targetDeviceId}-${now}`
            );
          }
          showTemporaryStatus('Message synced to connected phones', 2000);
        }
      }

      // MNICK: nickname for a local mobile slot on this hub
      // Format: MNICK:<mobileId>,<nickname>
      else if (trimmed.startsWith('MNICK:')) {
        const rest = trimmed.substring(6);
        const comma = rest.indexOf(',');
        if (comma > 0) {
          const mobileId = parseInt(rest.substring(0, comma).trim(), 10);
          const nickname = (rest.substring(comma + 1) || '').trim();
          if (!Number.isNaN(mobileId) && mobileId >= 1 && mobileId <= 4 && nickname.length > 0) {
            // Ignore legacy/default placeholders like "Mobile 2".
            if (/^mobile\s*\d+$/i.test(nickname)) {
              return;
            }
            setLocalMobileNicknames(prev => ({ ...(prev || {}), [mobileId]: nickname }));

            // Attach nickname to our local hub's mobiles list when possible (helps MessageTab label).
            const localDeviceId = myDeviceId ?? (connectedDevice ? parseDeviceId(connectedDevice) : null);
            if (typeof localDeviceId === 'number' && !Number.isNaN(localDeviceId)) {
              setMemberLocations(prev => {
                const existingIdx = prev.findIndex(m => m && m.deviceId === localDeviceId);

                const upsert = (entry) => {
                  const prevMobiles = Array.isArray(entry.mobiles) ? entry.mobiles : [];
                  const idx = prevMobiles.findIndex(m => m && m.mobileId === mobileId);
                  const nextMobile = { mobileId, nickname, lastUpdate: Date.now() };
                  const nextMobiles = idx >= 0
                    ? prevMobiles.map((m, i) => (i === idx ? { ...m, ...nextMobile } : m))
                    : [...prevMobiles, nextMobile];
                  return { ...entry, mobiles: nextMobiles.slice().sort((a, b) => a.mobileId - b.mobileId) };
                };

                if (existingIdx >= 0) {
                  const updated = [...prev];
                  updated[existingIdx] = upsert(updated[existingIdx]);
                  return updated;
                }

                return [...prev, upsert({
                  deviceId: localDeviceId,
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
        if (!isInLobbyRef.current) {
          return;
        }

        // Guard against lobby mismatch between phone state and device state.
        const desiredLobby = lobbyCodeRef.current;
        const deviceLobby = deviceLobbyCodeRef.current;
        if (desiredLobby && deviceLobby !== null && deviceLobby !== undefined && desiredLobby !== deviceLobby) {
          const now = Date.now();
          const last = lastLobbyMismatchDropRef.current || { ts: 0 };
          if (now - (last.ts || 0) > 4000 || last.desired !== desiredLobby || last.device !== deviceLobby) {
            lastLobbyMismatchDropRef.current = { ts: now, desired: desiredLobby, device: deviceLobby };
            showTemporaryStatus(`Ignoring mobile location (lobby mismatch: phone ${desiredLobby}, hub ${deviceLobby})`, 2500);
          }
          return;
        }

        const parts = trimmed.substring(10).split(',');
        if (parts.length >= 4) {
          const deviceId = parseInt(parts[0], 10);
          const mobileId = parseInt(parts[1], 10);
          const lat = parseFloat(parts[2]);
          const lng = parseFloat(parts[3]);
          const rssi = parts.length >= 5 ? parseInt(parts[4], 10) : 0;
          const estimatedDistance = parts.length >= 6 ? parseInt(parts[5], 10) : -1;

          if (!Number.isNaN(deviceId) && !Number.isNaN(mobileId) && !Number.isNaN(lat) && !Number.isNaN(lng)) {
            // Treat mobile telemetry as presence so late joiners show up in Members/Message tabs.
            if (isInLobbyRef.current && typeof registerMemberSync === 'function') {
              if (!knownMembersRef.current.has(deviceId)) {
                knownMembersRef.current.add(deviceId);
              }
              registerMemberSync(deviceId, Date.now(), { source: 'mobileloc' });
            }

            setMemberLocations(prev => {
              const existing = prev.findIndex(m => m.deviceId === deviceId);

              const upsertMobiles = (entry) => {
                const prevMobiles = Array.isArray(entry.mobiles) ? entry.mobiles : [];
                const mobileIdx = prevMobiles.findIndex(m => m.mobileId === mobileId);
                const now = Date.now();
                const nextMobile = {
                  mobileId,
                  lat,
                  lng,
                  rssi,
                  estimatedDistance,
                  lastUpdate: now,
                };

                const nextMobiles = mobileIdx >= 0
                  ? prevMobiles.map((m, idx) => (idx === mobileIdx ? { ...m, ...nextMobile } : m))
                  : [...prevMobiles, nextMobile];

                return {
                  ...entry,
                  // Treat mobile updates as "device is alive" for the Members list.
                  lastUpdate: now,
                  isOffline: false,
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

            // Mobile breadcrumbs are keyed by device+mobile so trails follow each phone GPS stream.
            const trailKey = `${deviceId}-m${mobileId}`;
            const pointTs = Date.now();
            setRemoteBreadcrumbs(prev => {
              const existing = Array.isArray(prev?.[trailKey]) ? prev[trailKey] : [];
              const last = existing.length > 0 ? existing[existing.length - 1] : null;
              if (last && last.lat === lat && last.lng === lng) {
                return prev;
              }

              const nextArr = [...existing, { lat, lng, timestamp: pointTs, deviceId, mobileId }]
                .slice(-REMOTE_TRAIL_PER_KEY_MAX_POINTS);
              const merged = { ...(prev || {}), [trailKey]: nextArr };
              return enforceRemoteTrailMemoryCap(merged);
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
                showTemporaryStatus('Phone slot assigned', 2500);
              }
              lastClaimedAtRef.current = Date.now();
              lastClaimFailureStatusAtRef.current = { ts: 0, reason: '' };
              appendDiagnostic('claim_assigned', {
                mobileId,
              });
            }
          }
        }
      }

      // CLAIM_FAILED: hub could not assign a slot yet.
      // Format: CLAIM_FAILED:<token>,<reason>
      else if (trimmed.startsWith('CLAIM_FAILED:')) {
        const rest = trimmed.substring(13);
        const comma = rest.indexOf(',');
        const token = (comma > 0 ? rest.substring(0, comma) : rest).trim();
        const reason = (comma > 0 ? rest.substring(comma + 1) : 'UNKNOWN').trim() || 'UNKNOWN';

        if (phoneToken && token === phoneToken) {
          appendDiagnostic('claim_failed', { reason });
          const now = Date.now();
          const last = lastClaimFailureStatusAtRef.current || { ts: 0, reason: '' };
          const shouldSurface = (now - (last.ts || 0) > 5000) || last.reason !== reason;

          if (shouldSurface) {
            lastClaimFailureStatusAtRef.current = { ts: now, reason };
            if (reason === 'FULL_OR_STALE') {
              showTemporaryStatus('Phone slots are busy. Retry in a few seconds...', 3000);
            } else if (reason === 'NO_CONNECTED_SLOT') {
              showTemporaryStatus('Waiting for hub slot registration...', 2500);
            } else {
              showTemporaryStatus('Waiting for phone slot assignment...', 2500);
            }
          }
        }
      }
      
        // MSG_SENT confirmation
        else if (trimmed === 'MSG_SENT') {
          showTemporaryStatus('Message sent via LoRa', 2000);
        }
      } catch (e) {
        console.error('parseBluetoothData line error:', {
          line: trimmed,
          message: e?.message,
          error: e,
        });
      }
    });
  }, [addActivity, appendDiagnostic, clearMessageAckTimer, clearPendingDeviceLobbySync, clearRemoteTrailsForDevice, connectedDevice, decodeAckPayload, decodeMessageEnvelope, enforceRemoteTrailMemoryCap, getMemberNickname, isDeviceSosActive, myDeviceId, myLocation?.lat, myLocation?.lng, myLocation?.valid, parseDeviceId, pendingDeviceLobbySyncCode, pushEmergencyNotification, pushMessageNotification, registerMemberSync, removeTrackedAlerts, requestSosTrailSnapshot, sendSosTrailSnapshot, setEmergencyContactForDevice, setMemberNickname, setMemberOffline, setMyDeviceId, shouldThrottleAckSend, shouldThrottleEmergency, showTemporaryStatus, startEmergencySignals, stopEmergencySignals, triggerVibration, unsilenceEmergencyForDevice, updateTrackedAlerts, upsertTrackedAlert, wasInboundMessageRecentlySeen]);

  const sendMyNicknameToDevice = useCallback(async () => {
    if (!isConnected) return false;
    const nick = (myNickname || '').trim();
    if (!nick) return false;
    // Firmware-side suggestion: accept `NICK:<name>` and broadcast it via LoRa.
    return sendCommand(`NICK:${nick}`, { silent: true });
  }, [isConnected, myNickname, sendCommand]);

  const sendMyEmergencyContactToDevice = useCallback(async () => {
    if (!isConnected) return false;
    const name = (myEmergencyContact?.name || '').trim();
    const phone = (myEmergencyContact?.phone || '').trim();
    if (!name || !phone) return false;
    // Firmware-side suggestion: accept `EC:<name>,<phone>` and broadcast it via LoRa.
    return sendCommand(`EC:${name},${phone}`, { silent: true });
  }, [isConnected, myEmergencyContact, sendCommand]);

  // Connect to a BLE device - MULTI-DEVICE SUPPORT - no pairing needed!
  // Now supports multiple simultaneous connections (3-4 phones to same device)
  const connectToDevice = useCallback(async (device) => {
    if (!bleAvailable) {
      Alert.alert(
        'Bluetooth Not Available',
        'Bluetooth is required to connect to your HikeSafe device. Please use a native build (not Expo Go) and ensure Bluetooth is enabled.',
        [{ text: 'OK' }]
      );
      return false;
    }

    if (!device || typeof device.id !== 'string' || !device.id.trim()) {
      Alert.alert('Connection Failed', 'Invalid device selected. Please rescan and try again.');
      return false;
    }

    console.log('[BLE] connectToDevice: tapped', {
      id: device.id,
      name: device.name,
      platform: Platform.OS,
      apiLevel: Platform.OS === 'android' ? Platform.Version : undefined,
    });

    if (!ensureBleManagerReady() || !bleManagerRef.current) {
      Alert.alert('Bluetooth Unavailable', 'Bluetooth service is not ready yet. Please try again.');
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
    try {
      bleManagerRef.current.stopDeviceScan();
    } catch {
      // best-effort
    }
    setIsConnecting(true);

    try {
      // Connect to the BLE device
      console.log('[BLE] Step: connectToDevice() start', { id: device.id });
      const connectedDev = await bleManagerRef.current.connectToDevice(device.id, {
        timeout: 10000,
      });
      console.log('[BLE] Step: connectToDevice() ok', { id: device.id });

      // MTU negotiation is optional and has caused native instability on some Android devices.
      // Keep default MTU for connection stability.
      
      // Discover services and characteristics
      console.log('[BLE] Step: discoverAllServicesAndCharacteristics() start', { id: device.id });
      await connectedDev.discoverAllServicesAndCharacteristics();
      console.log('[BLE] Step: discoverAllServicesAndCharacteristics() ok', { id: device.id });
      
      // Subscribe to TX characteristic for notifications (device → app)
      console.log('[BLE] Step: monitorCharacteristicForService() start', { id: device.id });
      const subscription = connectedDev.monitorCharacteristicForService(
        NUS_SERVICE_UUID,
        NUS_TX_CHAR_UUID,
        (error, characteristic) => {
          try {
            if (error) {
              const msg = (error?.message || '').toLowerCase();
              const isExpectedDisconnect =
                msg.includes('operation was cancelled') ||
                msg.includes('operation was canceled') ||
                msg.includes('cancelled') ||
                msg.includes('canceled') ||
                msg.includes('disconnected') ||
                msg.includes('not connected');

              if (!isExpectedDisconnect) {
                console.error('Notification error:', error);
              }
              return;
            }

            if (characteristic?.value) {
              try {
                const decoded = Buffer.from(characteristic.value, 'base64').toString('utf-8');
                parseBluetoothData(decoded, device.id);
              } catch (e) {
                console.error('Decode error:', e);
              }
            }
          } catch (e) {
            console.error('BLE notify handler crashed:', e);
          }
        }
      );
      console.log('[BLE] Step: monitorCharacteristicForService() ok', { id: device.id });
      
      // Listen for disconnection events
      console.log('[BLE] Step: onDisconnected() subscribe', { id: device.id });
      const disconnectSubscription = connectedDev.onDisconnected((error) => {
        const lastTx = lastBleTxRef.current || {};
        const ageMs = lastTx.ts ? (Date.now() - lastTx.ts) : null;

        const rawMsg = (error?.message || '').toString();
        const msg = rawMsg.toLowerCase();
        const code = error?.errorCode ?? error?.code ?? null;

        let reason = 'Device disconnected';
        if (msg.includes('operation was cancelled') || msg.includes('operation was canceled') || msg.includes('cancelled') || msg.includes('canceled')) {
          reason = 'Disconnected (cancelled)';
        } else if (msg.includes('bluetooth') && (msg.includes('powered off') || msg.includes('turned off') || msg.includes('off'))) {
          reason = 'Disconnected (Bluetooth off)';
        } else if (msg.includes('timeout')) {
          reason = 'Disconnected (timeout)';
        } else if (msg.includes('gatt') && msg.includes('133')) {
          reason = 'Disconnected (Android GATT 133)';
        } else if (msg.includes('not connected') || msg.includes('device disconnected') || msg.includes('disconnected')) {
          reason = 'Device disconnected';
        }

        const status = `${reason}${code !== null && code !== undefined ? ` (code: ${code})` : ''}`;
        showTemporaryStatus(status, 4500);

        console.log('Device disconnected:', rawMsg || 'Connection closed', {
          code,
          lastTx: lastTx.cmd,
          lastTxSilent: lastTx.silent,
          lastTxAgeMs: ageMs,
        });

        lastDisconnectAtRef.current = Date.now();
        disconnectFromDevice(device.id, { skipCancel: true });
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
      appendDiagnostic('ble_connect_ok', {
        deviceId: device.id,
        totalConnected: connectedDevicesList.length + 1,
      });
      
      console.log(`Successfully connected to device ${device.id}. Total connected: ${connectedDevicesList.length + 1}`);
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      appendDiagnostic('ble_connect_failed', {
        deviceId: device?.id || null,
        message: error?.message || 'unknown',
      });
      Alert.alert(
        'Connection Failed', 
        'Could not connect to the device. Make sure it is powered on and in range.\n\nError: ' + error.message
      );
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [appendDiagnostic, connectedDevicesList, ensureBleManagerReady, isInLobby, parseBluetoothData, parseDeviceId, playConnectionSound, registerMemberSync, requestPermissions, setMyDeviceId]);

  // Disconnect from a specific device (multi-device support)
  const disconnectFromDevice = useCallback(async (deviceId, options = {}) => {
    const connInfo = deviceConnectionsRef.current.get(deviceId);

    // If this is the last connected hub, immediately flip refs so background intervals/timeouts stop
    // attempting to write while the disconnect is in progress.
    const isLastDevice = (connectedDevicesListRef.current?.length || 0) <= 1;
    if (isLastDevice) {
      isConnectedRef.current = false;
      connectedDevicesListRef.current = [];
      activeHubIdRef.current = null;
    }
    
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
          if (!options?.skipCancel) {
            await connInfo.device.cancelConnection();
          }
        } catch (error) {
          const msg = (error?.message || '').toLowerCase();
          const isExpected = msg.includes('not connected') || msg.includes('cancelled') || msg.includes('canceled');
          if (!isExpected) {
            console.error('Error canceling connection:', error);
          }
        }

        // Fallback: some Android stacks are more reliable when cancelling via the manager.
        if (!options?.skipCancel) {
          try {
            if (bleManagerRef.current && typeof bleManagerRef.current.cancelDeviceConnection === 'function') {
              await bleManagerRef.current.cancelDeviceConnection(deviceId);
            }
          } catch (error) {
            const msg = (error?.message || '').toLowerCase();
            const isExpected = msg.includes('not connected') || msg.includes('cancelled') || msg.includes('canceled');
            if (!isExpected) {
              console.error('Error canceling connection via manager:', error);
            }
          }
        }
      }
      
      deviceConnectionsRef.current.delete(deviceId);
    }
    
    // Remove from connected devices list
    setConnectedDevicesList(prev => prev.filter(d => d.id !== deviceId));

    // Clear RX buffer for this device
    try {
      rxLineBufferRef.current.delete(deviceId);
    } catch {
      // ignore
    }
    
    // If no more connected devices, clear flags
    if (isLastDevice) {
      setConnectedDevicesCount(0);
      setIsDeviceReachable(false);
      setMyLocation({ lat: 0, lng: 0, satellites: 0, valid: false });
      setPhoneLocation({ lat: 0, lng: 0, valid: false, lastUpdate: 0 });
      setLastDataReceived(null);
      setLoraSignalStrength(null);
      setConnectionHealth('unknown');
      setActiveAlertsByKey({});
      setActiveAlert(null);

      // Many-to-one: slot IDs and local nicknames are hub-assigned.
      // Reset on disconnect so we don't mis-label phones after reconnecting to a hub.
      setMyMobileId(null);
      lastClaimedAtRef.current = 0;
      lastClaimFailureStatusAtRef.current = { ts: 0, reason: '' };
      setLocalMobileNicknames({});
      setRemoteMobileNicknames({});
    }
    
    appendDiagnostic('ble_disconnected', {
      deviceId,
      isLastDevice,
    });
    console.log(`Disconnected from device ${deviceId}`);
  }, [appendDiagnostic]);

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
    setPhoneLocation({ lat: 0, lng: 0, valid: false, lastUpdate: 0 });
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

    // Clear RX buffers
    try {
      rxLineBufferRef.current.clear();
    } catch {
      // ignore
    }
  }, [disconnectFromDevice, stopEmergencySignals]);

  const clearRuntimeSessionData = useCallback(async (options = {}) => {
    const clearPersistedChat = options?.clearPersistedChat === true;
    const clearPersistedBreadcrumbs = options?.clearPersistedBreadcrumbs === true;

    setMemberLocations([]);
    setMessages([]);
    setUnreadCount(0);
    setActivityLog([]);
    setActiveAlert(null);
    setActiveAlertsByKey({});
    setStatusMessage('');
    setConnectedDevicesCount(0);
    setIsDeviceReachable(false);
    setMyLocation({ lat: 0, lng: 0, satellites: 0, valid: false });
    setPhoneLocation({ lat: 0, lng: 0, valid: false, lastUpdate: 0 });
    setRemoteBreadcrumbs({});
    setMyMobileId(null);
    setLocalMobileNicknames({});
    setRemoteMobileNicknames({});

    messageAckTimeoutsRef.current.forEach((timerId) => clearTimeout(timerId));
    messageAckTimeoutsRef.current.clear();
    recentInboundMessageIdsRef.current.clear();
    recentSentAcksRef.current.clear();

    knownMembersRef.current = new Set();
    emergencyThrottleRef.current.clear();
    silencedEmergencyRef.current.clear();
    lastClaimedAtRef.current = 0;
    lastClaimFailureStatusAtRef.current = { ts: 0, reason: '' };
    commandQueueRef.current = Promise.resolve();

    stopEmergencySignals();

    if (clearPersistedChat) {
      try {
        await AsyncStorage.removeItem(CHAT_HISTORY_KEY);
      } catch {
        // ignore
      }
    }

    if (clearPersistedBreadcrumbs) {
      try {
        await AsyncStorage.removeItem(BREADCRUMBS_KEY);
      } catch {
        // ignore
      }
      setBreadcrumbs([]);
      lastBreadcrumbRef.current = null;
      setBreadcrumbSessionDay(getLocalDayStamp(Date.now()));
    }

    appendDiagnostic('runtime_session_cleared', {
      clearPersistedChat,
      clearPersistedBreadcrumbs,
    });

    return true;
  }, [appendDiagnostic, getLocalDayStamp, stopEmergencySignals]);

  const setActiveHub = useCallback((deviceId) => {
    const list = Array.isArray(connectedDevicesListRef.current) ? connectedDevicesListRef.current : [];
    const exists = list.some(d => d?.id === deviceId);
    if (!exists) return false;

    if (activeHubIdRef.current === deviceId) {
      return true;
    }

    activeHubIdRef.current = deviceId;
    setActiveHubId(deviceId);
    appendDiagnostic('active_hub_selected', { deviceId });
    showTemporaryStatus('Active hub switched', 2000);
    return true;
  }, [appendDiagnostic, showTemporaryStatus]);

  // Send command to the ACTIVE connected device via BLE.
  // Note: the app UI doesn't support per-hub routing, so broadcasting to multiple hubs
  // can break lobby sync and message delivery.
  const sendCommand = useCallback(async (command, options = {}) => {
    const silent = options?.silent === true;
    const preferNoResponse = options?.preferNoResponse === true;
    const list = Array.isArray(connectedDevicesListRef.current) ? connectedDevicesListRef.current : [];
    const activeId = activeHubIdRef.current;
    const activeDevice = (activeId ? list.find(d => d?.id === activeId) : list[0]) || null;
    const devicesSnapshot = activeDevice ? [activeDevice] : [];

    const run = async () => {
      if (!isConnectedRef.current || devicesSnapshot.length === 0) {
        appendDiagnostic('ble_send_blocked_not_connected', {
          command: String(command || ''),
        });
        if (!silent) {
          Alert.alert('Not Connected', 'Please connect to a device first.');
        }
        return false;
      }

      try {
        const cmdStr = String(command);
        const safeCmd = cmdStr.length > 80 ? `${cmdStr.slice(0, 80)}…` : cmdStr;
        lastBleTxRef.current = { ts: Date.now(), cmd: safeCmd, silent };
      } catch {
        lastBleTxRef.current = { ts: Date.now(), cmd: null, silent };
      }

      const cmdWithNewline = command.endsWith('\n') ? command : command + '\n';

      if (!BleManager || devicesSnapshot.length === 0) {
        // Mock command handling
        console.log('Mock sending:', cmdWithNewline);
        appendDiagnostic('ble_send_mock', {
          command: String(command || ''),
        });
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

      const withTimeout = async (promise, timeoutMs, label) => {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`${label} timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        });

        try {
          return await Promise.race([promise, timeoutPromise]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      };

      // Send to the active connected device
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
          const writeTimeoutMs = preferNoResponse ? Math.min(BLE_WRITE_TIMEOUT_MS, 2500) : BLE_WRITE_TIMEOUT_MS;

          // Defensive: check if connection is still valid
          try {
            const stillConnected = await withTimeout(
              dev.isConnected(),
              BLE_CONNECTION_CHECK_TIMEOUT_MS,
              'BLE connection check'
            );
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

          // Emergency commands benefit from lower-latency writes. Try no-response first when requested.
          if (preferNoResponse && typeof dev.writeCharacteristicWithoutResponseForService === 'function') {
            try {
              await withTimeout(
                dev.writeCharacteristicWithoutResponseForService(
                  NUS_SERVICE_UUID,
                  NUS_RX_CHAR_UUID,
                  encoded
                ),
                writeTimeoutMs,
                'BLE preferred write without response'
              );
              console.log(`Command sent to device ${deviceInfo.id} (preferred no response)`);
              successCount++;
              return true;
            } catch (preferredWriteError) {
              const msg = (preferredWriteError?.message || '').toLowerCase();
              if (msg.includes('disconnected') || msg.includes('cancel')) {
                await disconnectFromDevice(deviceInfo.id);
                failureCount++;
                return false;
              }
              // Fall through to with-response attempt.
            }
          }

          // Try write with response first
          try {
            await withTimeout(
              dev.writeCharacteristicWithResponseForService(
                NUS_SERVICE_UUID,
                NUS_RX_CHAR_UUID,
                encoded
              ),
              writeTimeoutMs,
              'BLE write with response'
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
                await withTimeout(
                  dev.writeCharacteristicWithoutResponseForService(
                    NUS_SERVICE_UUID,
                    NUS_RX_CHAR_UUID,
                    encoded
                  ),
                  writeTimeoutMs,
                  'BLE write without response'
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
        console.log(`Command delivered to active device (${successCount} ok)`);
        appendDiagnostic('ble_send_ok', {
          command: String(command || ''),
          successCount,
          failureCount,
          activeHubId: activeHubIdRef.current || null,
        });
        return true;
      } else {
        // All failed
        if (!silent) {
          console.error('Command failed on all devices', { failureCount });
        }
        appendDiagnostic('ble_send_failed', {
          command: String(command || ''),
          successCount,
          failureCount,
          activeHubId: activeHubIdRef.current || null,
        });
        if (!silent) {
          Alert.alert('Send Failed', 'Could not send command to any device.');
        }
        return false;
      }
    };

    // Serialize writes to prevent overlapping GATT operations (common cause of random send failures).
    const queued = writeQueueRef.current.then(run, run);
    writeQueueRef.current = queued.catch(() => {});
    return queued;
  }, [appendDiagnostic, delay, disconnectFromDevice, showTemporaryStatus]);

  // Expose BLE command sender to LobbyContext so it can sync lobby code to device.
  useEffect(() => {
    if (registerBleCommandSender) {
      registerBleCommandSender(sendCommand);
    }
  }, [registerBleCommandSender, sendCommand]);

  const queueDeliveryAck = useCallback((targetDeviceId, messageId) => {
    if (typeof targetDeviceId !== 'number' || Number.isNaN(targetDeviceId) || targetDeviceId <= 0) return;
    if (!messageId) return;

    const cmd = `ACKMSG:${targetDeviceId},${messageId}`;
    void (async () => {
      const ok = await sendCommand(cmd, { silent: true });
      appendDiagnostic(ok ? 'message_ack_sent' : 'message_ack_send_failed', {
        targetDeviceId,
        messageId,
      });
    })();
  }, [appendDiagnostic, sendCommand]);

  useEffect(() => {
    queueDeliveryAckRef.current = queueDeliveryAck;
    return () => {
      if (queueDeliveryAckRef.current === queueDeliveryAck) {
        queueDeliveryAckRef.current = null;
      }
    };
  }, [queueDeliveryAck]);

  // Retry device lobby sync only when explicitly marked as pending.
  // This prevents other phones from overwriting the device lobby just because they have a saved lobbyCode.
  useEffect(() => {
    if (!isConnected) return;
    if (!pendingDeviceLobbySyncCode) return;
    if (!syncLobbyToDevice) return;

    // Wait briefly for the hub to report its current lobby (STATUS:LOBBY).
    // Only auto-apply a pending lobby code when the hub is in lobby 0; never overwrite a non-zero lobby on connect.
    let cancelled = false;
    const id = setTimeout(() => {
      if (cancelled) return;

      const pending = pendingDeviceLobbySyncCode;
      const supportsLobby = hubReportsLobbyRef.current === true;
      const hubLobby = deviceLobbyCodeRef.current;

      if (supportsLobby && typeof hubLobby === 'number' && hubLobby >= 1000 && hubLobby <= 9999) {
        // Hub already has a real lobby selected; do not auto-switch it.
        if (hubLobby !== pending) {
          void clearPendingDeviceLobbySync();
          showTemporaryStatus(`Hub already in lobby ${hubLobby}. Pending lobby sync (${pending}) skipped.`, 4500);
        } else {
          void clearPendingDeviceLobbySync();
        }
        return;
      }

      if (supportsLobby && hubLobby === 0) {
        // Fire-and-forget; LobbyContext handles persistence + failures.
        syncLobbyToDevice((cmd) => sendCommand(cmd, { silent: true }), pending);
      }
      // If the hub hasn't reported lobby support yet, do nothing here.
      // The user can always re-sync explicitly from the Lobby screen.
    }, 2500);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [isConnected, pendingDeviceLobbySyncCode, syncLobbyToDevice, sendCommand, clearPendingDeviceLobbySync, showTemporaryStatus]);

  // Keep remote trails strictly scoped to the currently active lobby.
  useEffect(() => {
    const scopedLobby = (isInLobby && lobbyCode) ? String(lobbyCode) : '';
    if (remoteTrailLobbyScopeRef.current === scopedLobby) return;

    remoteTrailLobbyScopeRef.current = scopedLobby;
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
    if (!phoneLocation.valid || phoneLocation.lat === 0 || phoneLocation.lng === 0) return;

    const now = Date.now();
    const last = lastBreadcrumbBroadcastRef.current || { ts: 0, lat: null, lng: null };
    if (now - (last.ts || 0) < 60000) return; // 60s minimum interval

    const moved = last.lat === null
      ? 999999
      : (calculateDistance(last.lat, last.lng, phoneLocation.lat, phoneLocation.lng) || 0);
    if (moved < 25) return; // at least 25m from last broadcast

    const latE5 = Math.round(phoneLocation.lat * 1e5);
    const lngE5 = Math.round(phoneLocation.lng * 1e5);
    const tsS = Math.floor(now / 1000);
    void sendCommand(`MSG:0,__BREAD__:${latE5},${lngE5},${tsS}`, { silent: true });
    lastBreadcrumbBroadcastRef.current = { ts: now, lat: phoneLocation.lat, lng: phoneLocation.lng };
  }, [isTrackingBreadcrumbs, isConnected, isInLobby, lobbyCode, isSosTrailSharingActive, phoneLocation, sendCommand]);

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

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (!isConnectedRef.current) return;
      // If we recently received a CLAIMED response, stop retrying.
      if (lastClaimedAtRef.current && Date.now() - lastClaimedAtRef.current < 12000) return;
      try {
        const ok = await sendCommand(`CLAIM:${phoneToken}`, { silent: true });
        if (ok) {
          // We still wait for CLAIMED to confirm assignment.
          appendDiagnostic('claim_attempt_sent', { tokenTail: String(phoneToken).slice(-6) });
        }
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
  }, [appendDiagnostic, isConnected, phoneToken, myMobileId, sendCommand]);

  // Many-to-one: share this phone's nickname with the hub so other local phones can label M1–M4.
  const lastSentMobileNickRef = useRef({ token: null, mobileId: null, nick: null, ts: 0 });
  useEffect(() => {
    if (!isConnected) return;
    if (!isInLobby) return;
    if (!phoneToken) return;
    if (typeof myMobileId !== 'number' || myMobileId < 1 || myMobileId > 4) return;

    const nickRaw = (myNickname || '').toString().trim();
    if (!nickRaw) return;

    // Avoid commas/newlines breaking the simple CSV protocol.
    const nick = nickRaw.replace(/[\r\n,]/g, ' ').trim().substring(0, 24);
    if (!nick) return;

    const last = lastSentMobileNickRef.current || {};
    const now = Date.now();
    const same = last.token === phoneToken && last.mobileId === myMobileId && last.nick === nick;
    if (same && now - (last.ts || 0) < 15000) return;

    lastSentMobileNickRef.current = { token: phoneToken, mobileId: myMobileId, nick, ts: now };
    void sendCommand(`MNICK:${phoneToken},${nick}`, { silent: true });
  }, [isConnected, isInLobby, phoneToken, myMobileId, myNickname, sendCommand]);

  // Many-to-one tracking: periodically send this phone's GPS to the hub.
  const lastSentPlocRef = useRef({ ts: 0, lat: null, lng: null });
  const phoneLocGateRef = useRef({ ts: 0, granted: null, servicesEnabled: null });
  useEffect(() => {
    if (!isConnected) return;
    if (!phoneToken) return;
    if (!myMobileId) return;
    if (typeof connectedDevicesCount !== 'number' || connectedDevicesCount < 1) return;

    let cancelled = false;

    const sendOnce = async () => {
      if (cancelled) return;
      if (!isConnectedRef.current) return;

      const now = Date.now();

      // Gate expensive checks (permissions/services) so we don't do them every 5s.
      const gate = phoneLocGateRef.current || { ts: 0, granted: null, servicesEnabled: null };
      if (!gate.ts || now - (gate.ts || 0) > 30000) {
        try {
          const servicesEnabled = await Location.hasServicesEnabledAsync();
          const perm = await Location.getForegroundPermissionsAsync();
          phoneLocGateRef.current = {
            ts: now,
            servicesEnabled,
            granted: perm?.status === 'granted',
          };
        } catch {
          phoneLocGateRef.current = { ts: now, servicesEnabled: null, granted: null };
        }
      }

      const gateNow = phoneLocGateRef.current || {};
      if (gateNow.servicesEnabled === false) return;
      if (gateNow.granted === false) return;

      try {
        // Prefer last-known for speed; fall back to current position when stale/missing.
        let pos = null;
        try {
          pos = await Location.getLastKnownPositionAsync({ maxAge: 20000 });
        } catch {
          // ignore
        }

        const isStale = pos?.timestamp ? (now - pos.timestamp > 45000) : true;
        if (!pos || isStale) {
          pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        }

        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;

        setPhoneLocation({ lat, lng, valid: true, lastUpdate: now });

        // Throttle when not moving to reduce BLE write spam.
        const last = lastSentPlocRef.current || { ts: 0, lat: null, lng: null };
        if (
          typeof last.lat === 'number' &&
          typeof last.lng === 'number' &&
          now - (last.ts || 0) < 15000
        ) {
          const moved = calculateDistance(last.lat, last.lng, lat, lng);
          if (Number.isFinite(moved) && moved < 8) {
            return;
          }
        }

        const cmd = `PLOC:${phoneToken},${myMobileId},${lat},${lng}`;
        await sendCommand(cmd, { silent: true });
        lastSentPlocRef.current = { ts: now, lat, lng };
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

  // Update SOS handling logic to meet the requirements
  const handleSosTrigger = useCallback(async (deviceId, lat, lng) => {
    const emergencyKey = `SOS-${deviceId}`;
    const displayName = getMemberNickname ? getMemberNickname(deviceId) : `Device ${deviceId}`;
    const emergencyContact = myEmergencyContact ? `${myEmergencyContact.name} (${myEmergencyContact.phone})` : 'No emergency contact set';

    // Sender: Show "I am okay" button only
    if (deviceId === myDeviceId) {
      setActiveAlert({
        type: 'SOS',
        deviceId,
        lat,
        lng,
        timestamp: Date.now(),
        buttons: ['I am okay'],
      });
    } else {
      // Receiver: Show "View Location" and "Help on the Way" buttons only
      setActiveAlert({
        type: 'SOS',
        deviceId,
        lat,
        lng,
        timestamp: Date.now(),
        buttons: ['View Location', 'Help on the Way'],
      });

      // Include emergency contact in the notification
      pushEmergencyNotification(
        'Emergency Alert',
        `${displayName} triggered SOS. Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}. Emergency Contact: ${emergencyContact}`,
        emergencyKey
      );
    }

    // Start emergency signals
    startEmergencySignals();
  }, [getMemberNickname, myDeviceId, myEmergencyContact, pushEmergencyNotification, startEmergencySignals]);

  // Handle "Help on the Way" button click
  const handleHelpOnTheWay = useCallback((deviceId) => {
    const displayName = getMemberNickname ? getMemberNickname(deviceId) : `Device ${deviceId}`;

    // Notify the sender
    pushEmergencyNotification(
      'Help on the Way',
      `${displayName} is on the way to help you!`,
      `help-${deviceId}`
    );

    // Update activity log
    addActivity('on_my_way', deviceId, `${displayName} is on the way to help`);
  }, [getMemberNickname, pushEmergencyNotification, addActivity]);

  // Update alert handling logic
  useEffect(() => {
    if (activeAlert?.type === 'SOS' && activeAlert.buttons.includes('Help on the Way')) {
      // Attach "Help on the Way" button handler
      Alert.alert(
        '🚨 EMERGENCY ALERT',
        `Device ${activeAlert.deviceId} triggered SOS!\n\nLocation: ${activeAlert.lat.toFixed(5)}, ${activeAlert.lng.toFixed(5)}`,
        [
          { text: 'View Location', onPress: () => {/* Navigate to location */} },
          { text: 'Help on the Way', onPress: () => handleHelpOnTheWay(activeAlert.deviceId) },
        ],
        { cancelable: true }
      );
    }
  }, [activeAlert, handleHelpOnTheWay]);

  // Convenience methods
  const sendSOS = useCallback(async () => {
    lastLocalEmergencyRequestRef.current = { type: 'SOS', ts: Date.now() };

    const localDeviceId = (typeof myDeviceId === 'number' && !Number.isNaN(myDeviceId))
      ? myDeviceId
      : parseDeviceId(connectedDevice || deviceRef.current);

    if (typeof localDeviceId === 'number' && localDeviceId > 0) {
      unsilenceEmergencyForDevice('SOS', localDeviceId, { markRearm: true });
    }

    // Send SOS immediately; re-arm marker is best-effort and should not delay the emergency command.
    const ok = await sendCommand('SOS', { preferNoResponse: true });
    if (ok) {
      sendCommand('MSG:0,__SOS_REARM__', { silent: true, preferNoResponse: true }).catch(() => {});
    }
    return ok;
  }, [connectedDevice, myDeviceId, parseDeviceId, sendCommand, unsilenceEmergencyForDevice]);
  const sendOK = useCallback(() => sendCommand('OK'), [sendCommand]);

  const armHubEchoFallback = useCallback((messageId, label = 'Message') => {
    const timeoutMs = 12000;
    setTimeout(() => {
      const snapshot = Array.isArray(messagesRef.current)
        ? messagesRef.current.find((m) => m && m.id === messageId)
        : null;

      if (!snapshot || !snapshot.pending) {
        return;
      }

      clearMessageAckTimer(messageId);

      setMessages(prev => prev.map(msg => (
        msg.id === messageId && msg.pending
          ? {
            ...msg,
            pending: false,
            awaitingAck: false,
            failed: true,
            deliveryUnconfirmed: true,
          }
          : msg
      )));

      showTemporaryStatus(`${label} not confirmed by hub. Tap Retry.`, 3500);
      appendDiagnostic('message_delivery_unconfirmed', {
        messageId,
        label,
      });
    }, timeoutMs);
  }, [appendDiagnostic, clearMessageAckTimer, showTemporaryStatus]);

  const armRecipientAckFallback = useCallback((messageId, label = 'Message') => {
    if (!messageId) return;

    clearMessageAckTimer(messageId);

    const timerId = setTimeout(async () => {
      messageAckTimeoutsRef.current.delete(messageId);

      const snapshot = Array.isArray(messagesRef.current)
        ? messagesRef.current.find((m) => m && m.id === messageId)
        : null;

      if (!snapshot || !snapshot.awaitingAck || !snapshot.requiresDeliveryAck) {
        return;
      }

      const retryCount = Number(snapshot.ackRetryCount || 0);
      if (retryCount < MESSAGE_ACK_MAX_RETRIES && snapshot.resendCommand) {
        const nextRetry = retryCount + 1;

        setMessages(prev => prev.map(msg => (
          msg.id === messageId
            ? {
              ...msg,
              pending: true,
              awaitingAck: false,
              failed: false,
              deliveryUnconfirmed: false,
              ackRetryCount: nextRetry,
            }
            : msg
        )));

        appendDiagnostic('message_ack_retry', {
          messageId,
          ackId: snapshot.ackId || null,
          retryCount: nextRetry,
        });

        const ok = await sendCommand(snapshot.resendCommand, { silent: true });
        if (ok) {
          armHubEchoFallback(messageId, label);
          showTemporaryStatus(`${label} retrying…`, 1800);
          return;
        }

        setMessages(prev => prev.map(msg => (
          msg.id === messageId
            ? {
              ...msg,
              pending: false,
              awaitingAck: false,
              failed: true,
              deliveryUnconfirmed: true,
            }
            : msg
        )));

        showTemporaryStatus(`${label} retry failed. Tap Retry.`, 3000);
        return;
      }

      setMessages(prev => prev.map(msg => (
        msg.id === messageId
          ? {
            ...msg,
            pending: false,
            awaitingAck: false,
            failed: true,
            deliveryUnconfirmed: true,
          }
          : msg
      )));

      appendDiagnostic('message_ack_timeout', {
        messageId,
        ackId: snapshot.ackId || null,
        retryCount,
      });
      showTemporaryStatus(`${label} not confirmed by recipient. Tap Retry.`, 3500);
    }, MESSAGE_ACK_TIMEOUT_MS);

    messageAckTimeoutsRef.current.set(messageId, timerId);
  }, [appendDiagnostic, armHubEchoFallback, clearMessageAckTimer, sendCommand, showTemporaryStatus]);

  useEffect(() => {
    armRecipientAckFallbackRef.current = armRecipientAckFallback;
    return () => {
      if (armRecipientAckFallbackRef.current === armRecipientAckFallback) {
        armRecipientAckFallbackRef.current = null;
      }
    };
  }, [armRecipientAckFallback]);
  
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

    // Prevent "global" lobby-0 broadcasts and cross-lobby sends.
    // The LoRa device's lobby code is what actually gates radio traffic.
    const desiredLobby = lobbyCodeRef.current;
    const isValidLobby = typeof desiredLobby === 'number' && desiredLobby >= 1000 && desiredLobby <= 9999;

    if (!isValidLobby) {
      Alert.alert('No Lobby', 'Enter a 4-digit lobby code first.');
      return false;
    }

    const trimmedText = String(text || '').trim();
    if (!trimmedText) {
      return false;
    }

    const parsedTargetDevice = (typeof toDeviceId === 'string') ? parseInt(toDeviceId, 10) : toDeviceId;
    if (typeof parsedTargetDevice !== 'number' || Number.isNaN(parsedTargetDevice) || parsedTargetDevice < 0) {
      Alert.alert('Invalid Target', 'Choose a valid device target.');
      return false;
    }

    const targetDevice = parsedTargetDevice;
    const localDeviceId = (typeof myDeviceId === 'number' && !Number.isNaN(myDeviceId))
      ? myDeviceId
      : parseDeviceId(connectedDevice || deviceRef.current);
    const requiresDeliveryAck =
      targetDevice > 0 &&
      !(typeof localDeviceId === 'number' && localDeviceId > 0 && targetDevice === localDeviceId);
    const ackId = requiresDeliveryAck ? createShortMessageId() : null;
    const payloadText = encodeMessageEnvelope(trimmedText, ackId);

    if (payloadText.length > LORA_MAX_TEXT_LEN) {
      const envelopeOverhead = ackId ? `${MESSAGE_ID_PREFIX}${ackId}:`.length : 0;
      const maxBodyLen = Math.max(0, LORA_MAX_TEXT_LEN - envelopeOverhead);
      Alert.alert('Message Too Long', `Message limit is ${maxBodyLen} characters.`);
      return false;
    }

    const command = `MSG:${targetDevice},${payloadText}`;
    
    const newMessage = {
      id: `msg-${Date.now()}-me-${targetDevice}-${ackId || 'plain'}`,
      from: 'me',
      to: targetDevice,
      targetDeviceId: targetDevice,
      text: trimmedText,
      timestamp: Date.now(),
      isMine: true,
      pending: true,
      awaitingAck: false,
      failed: false,
      deliveryUnconfirmed: false,
      delivered: !requiresDeliveryAck,
      requiresDeliveryAck,
      ackId,
      ackRetryCount: 0,
      resendCommand: command,
    };
    
    setMessages(prev => [...prev, newMessage].slice(-MAX_MESSAGES_IN_MEMORY));

    const waitForDeviceLobby = (expectedLobby, timeoutMs = 9000) => new Promise((resolve) => {
      const start = Date.now();
      const intervalId = setInterval(() => {
        const current = deviceLobbyCodeRef.current;
        if (typeof current === 'number' && current === expectedLobby) {
          clearInterval(intervalId);
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(intervalId);
          resolve(false);
        }
      }, 150);
    });

    // Ensure the device lobby matches this phone lobby before sending.
    // Auto-sync + wait for `STATUS:LOBBY_SET,<code>` (or SELF lobby field) so the user doesn't have to retry manually.
    const beforeLobby = deviceLobbyCodeRef.current;
    if (typeof beforeLobby !== 'number' || beforeLobby !== desiredLobby) {
      let syncWriteOk = false;
      try {
        showTemporaryStatus('Syncing lobby to device…', 2500);
        if (typeof syncLobbyToDevice === 'function') {
          syncWriteOk = await syncLobbyToDevice(sendCommand, desiredLobby);
        }
      } catch {
        // ignore
      }

      let synced = await waitForDeviceLobby(desiredLobby, 6500);

      // One retry helps when BLE notifications are delayed or the first write was flaky.
      if (!synced) {
        try {
          if (typeof syncLobbyToDevice === 'function') {
            await syncLobbyToDevice(sendCommand, desiredLobby);
          }
        } catch {
          // ignore
        }
        synced = await waitForDeviceLobby(desiredLobby, 3500);
      }

      if (!synced) {
        const afterLobby = deviceLobbyCodeRef.current;
        const isValidAfter =
          typeof afterLobby === 'number' && (afterLobby === 0 || (afterLobby >= 1000 && afterLobby <= 9999));
        const deviceLabel = isValidAfter ? String(afterLobby) : 'unknown';

        const supportsLobby = hubReportsLobbyRef.current === true;

        // If the hub has explicitly reported a different valid lobby, do NOT allow sending.
        const afterIsValidLobby = typeof afterLobby === 'number' && afterLobby >= 1000 && afterLobby <= 9999;
        const hardMismatch = afterIsValidLobby && afterLobby !== desiredLobby;

        setMessages(prev => prev.map(msg =>
          msg.id === newMessage.id
            ? { ...msg, pending: false, awaitingAck: false, failed: true }
            : msg
        ));

        // If we likely wrote the lobby change but can't confirm (older firmware / missed notifications),
        // allow the user to send anyway with an explicit warning.
        if (!hardMismatch && syncWriteOk) {
          const message = supportsLobby
            ? `Could not confirm the hub switched to lobby ${desiredLobby} (device is ${deviceLabel}).

Send anyway? (May deliver to the wrong group if the hub did not switch.)`
            : `Could not confirm the hub switched to lobby ${desiredLobby}.

This hub may be running older firmware (no lobby confirmation). If you already flashed the latest firmware, wait ~5s and try again.

Send anyway? (May deliver to the wrong group if the hub did not switch.)`;

          return await new Promise((resolve) => {
            Alert.alert(
              'Lobby Not Synced',
              message,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                {
                  text: 'Send anyway',
                  style: 'destructive',
                  onPress: async () => {
                    // Re-add the message as pending and attempt the send.
                    setMessages(prev => prev.map(msg =>
                      msg.id === newMessage.id
                        ? { ...msg, pending: true, awaitingAck: false, failed: false }
                        : msg
                    ));

                    const ok = await sendCommand(command);
                    if (ok) {
                      setMessages(prev => prev.map(msg =>
                        msg.id === newMessage.id
                          ? (msg.pending
                            ? {
                              ...msg,
                              pending: true,
                              awaitingAck: false,
                              failed: false,
                              deliveryUnconfirmed: false,
                              delivered: false,
                            }
                            : msg)
                          : msg
                      ));
                      armHubEchoFallback(newMessage.id, 'Message');
                    } else {
                      setMessages(prev => prev.map(msg =>
                        msg.id === newMessage.id
                          ? { ...msg, pending: false, awaitingAck: false, failed: true }
                          : msg
                      ));
                    }

                    if (ok) {
                      showTemporaryStatus('Sent without lobby confirmation', 3000);
                    }
                    resolve(ok);
                  },
                },
              ],
              { cancelable: true }
            );
          });
        }

        Alert.alert(
          'Lobby Not Synced',
          supportsLobby
            ? `Could not confirm the hub switched to lobby ${desiredLobby} (device is ${deviceLabel}). Please wait a moment and try again.`
            : `Could not confirm the hub switched to lobby ${desiredLobby}. This hub may be running older firmware (no lobby confirmation). Please flash the latest hub firmware and try again.`
        );
        return false;
      }
    }
    
    const success = await sendCommand(command);

    if (success) {
      setMessages(prev => prev.map(msg =>
        msg.id === newMessage.id
          ? (msg.pending
            ? {
              ...msg,
              pending: true,
              awaitingAck: false,
              failed: false,
              deliveryUnconfirmed: false,
              delivered: false,
            }
            : msg)
          : msg
      ));
      armHubEchoFallback(newMessage.id, 'Message');
    } else {
      setMessages(prev => prev.map(msg =>
        msg.id === newMessage.id
          ? { ...msg, pending: false, awaitingAck: false, failed: true }
          : msg
      ));
    }

    appendDiagnostic(success ? 'msg_send_enqueued' : 'msg_send_failed', {
      toDeviceId: targetDevice,
      ackId,
      requiresDeliveryAck,
    });
    
    return success;
  }, [appendDiagnostic, armHubEchoFallback, connectedDevice, createShortMessageId, encodeMessageEnvelope, isConnected, myDeviceId, parseDeviceId, sendCommand, showTemporaryStatus, syncLobbyToDevice]);

  // Send a phone-targeted direct message.
  // This routes through the hub, and is filtered on each phone using the claimed mobile slot (M1..M4).
  // Format: DM:<targetDevice>,<fromMobileId>,<toMobileId>,<text>
  const sendDirectMessage = useCallback(async (toDeviceId, toMobileId, text) => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to a device first.');
      return false;
    }

    const desiredLobby = lobbyCodeRef.current;
    const isValidLobby = typeof desiredLobby === 'number' && desiredLobby >= 1000 && desiredLobby <= 9999;
    if (!isValidLobby) {
      Alert.alert('No Lobby', 'Enter a 4-digit lobby code first.');
      return false;
    }

    const targetMobile = typeof toMobileId === 'string' ? parseInt(toMobileId, 10) : toMobileId;
    if (Number.isNaN(targetMobile) || targetMobile < 1 || targetMobile > 4) {
    Alert.alert('Invalid Recipient', 'Choose a recipient phone.');
      return false;
    }

    const parsedTargetDevice = (typeof toDeviceId === 'string') ? parseInt(toDeviceId, 10) : toDeviceId;
    if (typeof parsedTargetDevice !== 'number' || Number.isNaN(parsedTargetDevice) || parsedTargetDevice <= 0) {
      Alert.alert('Invalid Target', 'Choose a valid target device.');
      return false;
    }
    const targetDevice = parsedTargetDevice;

    let fromMobileId = (typeof myMobileIdRef.current === 'number' && myMobileIdRef.current >= 1 && myMobileIdRef.current <= 4)
      ? myMobileIdRef.current
      : 0;

    // Prevent DM-to-self on the same hub.
    if (
      typeof myDeviceId === 'number' &&
      typeof targetMobile === 'number' &&
      typeof myMobileIdRef.current === 'number' &&
      targetDevice === myDeviceId &&
      targetMobile === myMobileIdRef.current
    ) {
      Alert.alert("Can't Message Yourself", 'Choose a different phone on this hub.');
      return false;
    }

    const isSameHubDirect = (typeof myDeviceId === 'number' && targetDevice === myDeviceId);
    const requiresDeliveryAck = !isSameHubDirect;
    const ackId = requiresDeliveryAck ? createShortMessageId() : null;

    // Device MAX_TEXT_LEN = 50, and firmware tags DM payloads as:
    // __DM__:<toMobileId>:<fromMobileId>:<text>
    const fromMobileForLimit = fromMobileId === 0 ? 1 : fromMobileId;
    const dmPrefix = `__DM__:${targetMobile}:${fromMobileForLimit}:`;
    const envelopeOverhead = ackId ? `${MESSAGE_ID_PREFIX}${ackId}:`.length : 0;
    const maxBodyLen = Math.max(0, LORA_MAX_TEXT_LEN - dmPrefix.length - envelopeOverhead);
    const trimmedText = String(text || '').trim();
    if (!trimmedText) {
      return false;
    }
    if (trimmedText.length > maxBodyLen) {
      Alert.alert('Message Too Long', `Direct message limit is ${maxBodyLen} characters.`);
      return false;
    }

    const payloadText = encodeMessageEnvelope(trimmedText, ackId);

    const messageId = `dm-${Date.now()}-me-${targetDevice}-${targetMobile}-${ackId || 'plain'}`;

    const newMessage = {
      id: messageId,
      from: 'me',
      to: targetDevice,
      targetDeviceId: targetDevice,
      text: trimmedText,
      timestamp: Date.now(),
      isMine: true,
      pending: true,
      awaitingAck: false,
      failed: false,
      deliveryUnconfirmed: false,
      delivered: !requiresDeliveryAck,
      requiresDeliveryAck,
      ackId,
      ackRetryCount: 0,
      resendCommand: null,
      dmToMobileId: targetMobile,
      dmFromMobileId: fromMobileId || null,
      waitingForClaim: fromMobileId === 0,
    };

    setMessages(prev => [...prev, newMessage].slice(-MAX_MESSAGES_IN_MEMORY));

    const waitForClaimAssignment = (timeoutMs = 9000) => new Promise((resolve) => {
      const start = Date.now();
      const intervalId = setInterval(() => {
        const claimed = myMobileIdRef.current;
        if (typeof claimed === 'number' && claimed >= 1 && claimed <= 4) {
          clearInterval(intervalId);
          resolve(claimed);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(intervalId);
          resolve(null);
        }
      }, 150);
    });

    if (fromMobileId === 0) {
      appendDiagnostic('dm_wait_claim_started', {
        toDeviceId: targetDevice,
        targetMobile,
      });

      try {
        if (phoneToken) {
          await sendCommand(`CLAIM:${phoneToken}`, { silent: true });
        }
      } catch {
        // ignore
      }

      showTemporaryStatus('Waiting for phone slot assignment...', 2500);
      const claimedMobileId = await waitForClaimAssignment(9000);

      if (!claimedMobileId) {
        const reason = (lastClaimFailureStatusAtRef.current?.reason || '').trim();
        setMessages(prev => prev.map(msg =>
          msg.id === messageId
            ? { ...msg, pending: false, awaitingAck: false, failed: true, waitingForClaim: false }
            : msg
        ));

        appendDiagnostic('dm_wait_claim_timeout', {
          toDeviceId: targetDevice,
          targetMobile,
          reason: reason || 'TIMEOUT',
        });

        let reasonText = "This phone couldn't claim a slot yet.";
        if (reason === 'FULL_OR_STALE') {
          reasonText = 'Phone slots on this hub are currently busy.';
        } else if (reason === 'NO_CONNECTED_SLOT') {
          reasonText = 'Hub is still registering connected phone slots.';
        } else if (reason) {
          reasonText = 'Hub is still assigning a phone slot.';
        }

        Alert.alert('Phone Slot Not Ready', `${reasonText} Please wait a few seconds and try again.`);
        return false;
      }

      fromMobileId = claimedMobileId;
      setMessages(prev => prev.map(msg =>
        msg.id === messageId
          ? { ...msg, dmFromMobileId: fromMobileId, waitingForClaim: false }
          : msg
      ));

      appendDiagnostic('dm_wait_claim_resolved', {
        toDeviceId: targetDevice,
        targetMobile,
        fromMobileId,
      });
      showTemporaryStatus(`Phone slot ready (M${fromMobileId})`, 2000);
    }

    const command = `DM:${targetDevice},${fromMobileId},${targetMobile},${payloadText}`;
    setMessages(prev => prev.map(msg => (
      msg.id === newMessage.id
        ? {
          ...msg,
          dmFromMobileId: fromMobileId || null,
          resendCommand: command,
        }
        : msg
    )));

    const waitForDeviceLobby = (expectedLobby, timeoutMs = 9000) => new Promise((resolve) => {
      const start = Date.now();
      const intervalId = setInterval(() => {
        const current = deviceLobbyCodeRef.current;
        if (typeof current === 'number' && current === expectedLobby) {
          clearInterval(intervalId);
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(intervalId);
          resolve(false);
        }
      }, 150);
    });

    const beforeLobby = deviceLobbyCodeRef.current;
    if (typeof beforeLobby !== 'number' || beforeLobby !== desiredLobby) {
      let syncWriteOk = false;
      try {
        showTemporaryStatus('Syncing lobby to device…', 2500);
        if (typeof syncLobbyToDevice === 'function') {
          syncWriteOk = await syncLobbyToDevice(sendCommand, desiredLobby);
        }
      } catch {
        // ignore
      }

      let synced = await waitForDeviceLobby(desiredLobby, 6500);
      if (!synced) {
        try {
          if (typeof syncLobbyToDevice === 'function') {
            await syncLobbyToDevice(sendCommand, desiredLobby);
          }
        } catch {
          // ignore
        }
        synced = await waitForDeviceLobby(desiredLobby, 3500);
      }

      if (!synced) {
        const afterLobby = deviceLobbyCodeRef.current;
        const isValidAfter =
          typeof afterLobby === 'number' && (afterLobby === 0 || (afterLobby >= 1000 && afterLobby <= 9999));
        const deviceLabel = isValidAfter ? String(afterLobby) : 'unknown';

        const supportsLobby = hubReportsLobbyRef.current === true;

        const afterIsValidLobby = typeof afterLobby === 'number' && afterLobby >= 1000 && afterLobby <= 9999;
        const hardMismatch = afterIsValidLobby && afterLobby !== desiredLobby;

        setMessages(prev => prev.map(msg =>
          msg.id === newMessage.id
            ? { ...msg, pending: false, awaitingAck: false, failed: true }
            : msg
        ));

        if (!hardMismatch && syncWriteOk) {
          const message = supportsLobby
            ? `Could not confirm the hub switched to lobby ${desiredLobby} (device is ${deviceLabel}).

Send anyway? (May deliver to the wrong group if the hub did not switch.)`
            : `Could not confirm the hub switched to lobby ${desiredLobby}.

This hub may be running older firmware (no lobby confirmation). If you already flashed the latest firmware, wait ~5s and try again.

Send anyway? (May deliver to the wrong group if the hub did not switch.)`;

          return await new Promise((resolve) => {
            Alert.alert(
              'Lobby Not Synced',
              message,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                {
                  text: 'Send anyway',
                  style: 'destructive',
                  onPress: async () => {
                    setMessages(prev => prev.map(msg =>
                      msg.id === newMessage.id
                        ? { ...msg, pending: true, awaitingAck: false, failed: false }
                        : msg
                    ));

                    const ok = await sendCommand(command);
                    if (ok) {
                      setMessages(prev => prev.map(msg =>
                        msg.id === newMessage.id
                          ? (msg.pending
                            ? {
                              ...msg,
                              pending: true,
                              awaitingAck: false,
                              failed: false,
                              deliveryUnconfirmed: false,
                              delivered: false,
                            }
                            : msg)
                          : msg
                      ));
                      armHubEchoFallback(newMessage.id, 'Direct message');
                    } else {
                      setMessages(prev => prev.map(msg =>
                        msg.id === newMessage.id
                          ? { ...msg, pending: false, awaitingAck: false, failed: true }
                          : msg
                      ));
                    }

                    if (ok) {
                      showTemporaryStatus('Sent without lobby confirmation', 3000);
                    }
                    resolve(ok);
                  },
                },
              ],
              { cancelable: true }
            );
          });
        }

        Alert.alert(
          'Lobby Not Synced',
          supportsLobby
            ? `Could not confirm the hub switched to lobby ${desiredLobby} (device is ${deviceLabel}). Please wait a moment and try again.`
            : `Could not confirm the hub switched to lobby ${desiredLobby}. This hub may be running older firmware (no lobby confirmation). Please flash the latest hub firmware and try again.`
        );
        return false;
      }
    }

    const success = await sendCommand(command);

    if (success) {
      setMessages(prev => prev.map(msg =>
        msg.id === newMessage.id
          ? (msg.pending
            ? {
              ...msg,
              pending: true,
              awaitingAck: false,
              failed: false,
              deliveryUnconfirmed: false,
              delivered: false,
            }
            : msg)
          : msg
      ));
      armHubEchoFallback(newMessage.id, 'Direct message');
    } else {
      setMessages(prev => prev.map(msg =>
        msg.id === newMessage.id
          ? { ...msg, pending: false, awaitingAck: false, failed: true }
          : msg
      ));
    }

    appendDiagnostic(success ? 'dm_send_enqueued' : 'dm_send_failed', {
      toDeviceId: targetDevice,
      toMobileId: targetMobile,
      ackId,
      requiresDeliveryAck,
    });

    return success;
  }, [appendDiagnostic, armHubEchoFallback, createShortMessageId, encodeMessageEnvelope, isConnected, myDeviceId, sendCommand, showTemporaryStatus, syncLobbyToDevice]);
  
  // Send broadcast message (targetID = 0 means all devices)
  const sendBroadcastMessage = useCallback(async (text) => {
    return sendMessage(0, text);
  }, [sendMessage]);
  
  // Get messages for a specific conversation
  const getMessagesForDevice = useCallback((deviceId) => {
    const isBroadcastMsg = (msg) => {
      if (!msg) return false;
      if (typeof msg.targetDeviceId === 'number') {
        return msg.targetDeviceId === 0;
      }
      return typeof msg.to === 'number' && msg.to === 0;
    };

    if (deviceId === 0) {
      // Broadcast/Group chat - ONLY show broadcast-targeted messages.
      return messages.filter(isBroadcastMsg);
    }

    // Direct chat - show only direct-targeted messages for this peer.
    return messages.filter(msg => {
      if (!msg) return false;
      if (isBroadcastMsg(msg)) return false;
      // Multi-phone sync: include local relay echoes targeted at this device.
      if (msg.echoed && typeof msg.targetDeviceId === 'number' && msg.targetDeviceId === deviceId) {
        return true;
      }
      return (
        (msg.from === deviceId && msg.to === 'me') ||
        (msg.from === 'me' && msg.to === deviceId)
      );
    });
  }, [messages]);
  
  // Get unique conversations
  const getConversations = useCallback(() => {
    // Personal chat is treated as DM-to-mobile, not device-level.
    // Conversations are keyed by (deviceId, mobileId).
    const isBroadcastMsg = (msg) => {
      if (!msg) return false;
      if (typeof msg.targetDeviceId === 'number') {
        return msg.targetDeviceId === 0;
      }
      return typeof msg.to === 'number' && msg.to === 0;
    };

    const isDmMsg = (msg) => {
      if (!msg) return false;
      return typeof msg.dmToMobileId === 'number' || typeof msg.dmFromMobileId === 'number';
    };

    const getDmConversationKey = (msg) => {
      if (!msg) return null;
      if (!isDmMsg(msg)) return null;

      const deviceId = msg.isMine ? msg.to : msg.from;
      if (typeof deviceId !== 'number' || Number.isNaN(deviceId) || deviceId <= 0) return null;

      const mobileId = msg.isMine
        ? msg.dmToMobileId
        : (msg.dmFromMobileId || msg.mobileId);

      if (typeof mobileId !== 'number' || Number.isNaN(mobileId) || mobileId < 1 || mobileId > 4) return null;
      return `${deviceId}-m${mobileId}`;
    };

    const convByKey = new Map();

    messages.forEach((msg) => {
      if (!msg) return;
      if (isBroadcastMsg(msg)) return;
      const key = getDmConversationKey(msg);
      if (!key) return;

      const [deviceIdStr, mobileStr] = key.split('-m');
      const deviceId = parseInt(deviceIdStr, 10);
      const mobileId = parseInt(mobileStr, 10);

      const existing = convByKey.get(key);
      const lastTimestamp = typeof msg.timestamp === 'number' ? msg.timestamp : 0;
      const unreadInc = (!msg.isMine && !msg.read) ? 1 : 0;

      if (!existing) {
        const baseName = getMemberNickname ? getMemberNickname(deviceId) : `Device ${deviceId}`;
        const deviceName = `${baseName} (#${deviceId})`;
        const localNick =
          (typeof myDeviceId === 'number' && deviceId === myDeviceId && localMobileNicknames && localMobileNicknames[mobileId])
            ? String(localMobileNicknames[mobileId])
            : '';
        const remoteNick = (remoteMobileNicknames && remoteMobileNicknames[key]) ? String(remoteMobileNicknames[key]) : '';
        const rawNick = (localNick || remoteNick || '').toString().trim();
        const nick = /^mobile\s*\d+$/i.test(rawNick) ? '' : rawNick;
        const isSelfHub = (typeof myDeviceId === 'number' && deviceId === myDeviceId);
        convByKey.set(key, {
          deviceId,
          mobileId,
          name: isSelfHub
            ? (nick || `M${mobileId}`)
            : (nick ? `${deviceName} (${nick})` : `${deviceName} (M${mobileId})`),
          lastMessage: msg.text || '',
          lastTimestamp,
          unreadCount: unreadInc,
        });
        return;
      }

      const next = { ...existing };
      next.unreadCount = (existing.unreadCount || 0) + unreadInc;
      if (lastTimestamp >= (existing.lastTimestamp || 0)) {
        next.lastTimestamp = lastTimestamp;
        next.lastMessage = msg.text || '';
      }
      convByKey.set(key, next);
    });

    return Array.from(convByKey.values()).sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
  }, [getMemberNickname, localMobileNicknames, messages, myDeviceId, remoteMobileNicknames]);
  
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

  const activeAlerts = Object.values(activeAlertsByKey || {})
    .filter(alert => !!alert)
    .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));

  const activeEmergencyCount = activeAlerts.filter(alert => {
    return alert.type === 'SOS' || alert.type === 'MORSE';
  }).length;

  const unsilencedEmergencyCount = activeAlerts.filter(alert => {
    return (alert.type === 'SOS' || alert.type === 'MORSE') && !alert.silenced;
  }).length;
  
  const silenceActiveAlert = useCallback((byDeviceId = null) => {
    const focused = activeAlertRef.current;
    if (!focused) {
      stopEmergencySignals();
      return;
    }
    if (focused.type !== 'SOS' && focused.type !== 'MORSE') {
      stopEmergencySignals();
      return;
    }

    const now = Date.now();
    const key = getTrackedAlertKey(focused.type, focused.deviceId);

    if (key) {
      silencedEmergencyRef.current.set(key, { ts: now, byDeviceId });
      updateTrackedAlerts((prev) => {
        const existing = prev[key];
        if (!existing) return prev;
        return {
          ...prev,
          [key]: {
            ...existing,
            silenced: true,
            silencedAt: now,
            silencedByDeviceId: byDeviceId ?? existing.silencedByDeviceId ?? null,
          },
        };
      }, {
        preferredKey: key,
      });
    }

    stopEmergencySignals();
  }, [getTrackedAlertKey, stopEmergencySignals, updateTrackedAlerts]);

  // Clear active alert
  const dismissAlert = useCallback(() => {
    const focused = activeAlertRef.current;
    const key = focused ? getTrackedAlertKey(focused.type, focused.deviceId) : null;

    if (!key) {
      clearTrackedAlerts();
      stopEmergencySignals();
      return;
    }

    removeTrackedAlerts((_, alertKey) => alertKey === key);
    stopEmergencySignals();
  }, [clearTrackedAlerts, getTrackedAlertKey, removeTrackedAlerts, stopEmergencySignals]);
  
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
    activeHubId,
    availableDevices,
    connectedDevicesCount,
    myLocation,
    phoneLocation,
    memberLocations,
    myMobileId,
    localMobileNicknames,
    remoteMobileNicknames,
    activeAlert,
    activeAlerts,
    activeEmergencyCount,
    unsilencedEmergencyCount,
    statusMessage,
    morseInput,
    messages,
    unreadCount,
    connectionHealth,
    lastDataReceived,
    loraSignalStrength,
    activityLog,
    diagnostics,
    
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
    setActiveHub,
    sendCommand,
    sendSOS,
    sendOK,
    silenceActiveAlert,
    dismissAlert,
    clearMorseInput,
    removeMemberLocation,
    addActivity,
    
    // Messaging
    sendMessage,
    sendDirectMessage,
    sendBroadcastMessage,
    getMessagesForDevice,
    getConversations,
    markMessagesAsRead,
    clearChatHistory,
    clearRuntimeSessionData,
    getDiagnostics,
    clearDiagnostics,
  };

  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
};

export default BluetoothContext;
