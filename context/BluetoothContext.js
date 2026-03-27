import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Platform, PermissionsAndroid, Vibration } from 'react-native';
import { Buffer } from 'buffer';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { useLobby } from './LobbyContext';

// Storage keys
const CHAT_HISTORY_KEY = '@hikesafe_chat_history';
const BREADCRUMBS_KEY = '@hikesafe_breadcrumbs';

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

// Check if we're running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

if (isExpoGo) {
  console.log('Running in Expo Go - BLE not available, using mock mode');
  bleAvailable = false;
} else {
  // Only try to load BLE in development builds or standalone apps
  try {
    const blePlx = require('react-native-ble-plx');
    BleManager = blePlx.BleManager;
    bleAvailable = true;
    console.log('BLE module loaded successfully');
  } catch (e) {
    console.log('BLE library load failed:', e.message);
    bleAvailable = false;
  }
}

// Nordic UART Service UUIDs (must match ESP32 code)
const NUS_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const NUS_RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; // Write to this (app → device)
const NUS_TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // Notifications from this (device → app)

const BluetoothContext = createContext();

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
    myNickname,
    setMemberNickname,
    myEmergencyContact,
    setEmergencyContactForDevice,
  } = useLobby();

  // Connection state
  const [isEnabled, setIsEnabled] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [connectedDevicesCount, setConnectedDevicesCount] = useState(0); // Number of phones connected to device via BLE
  const [isDeviceReachable, setIsDeviceReachable] = useState(false); // True if ANY phone can reach the device
  
  // GPS and Location data
  const [myLocation, setMyLocation] = useState({ lat: 0, lng: 0, satellites: 0, valid: false });
  const [memberLocations, setMemberLocations] = useState([]);
  
  // Alerts
  const [activeAlert, setActiveAlert] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  
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
  
  // Activity log for real-time updates
  const [activityLog, setActivityLog] = useState([]);
  const knownMembersRef = useRef(new Set());
  
  // Trail breadcrumbs for tracking path
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [isTrackingBreadcrumbs, setIsTrackingBreadcrumbs] = useState(false);
  const lastBreadcrumbRef = useRef(null);
  
  // Vibration control
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const emergencyAlarmActiveRef = useRef(false);
  const emergencySoundRef = useRef(null);
  const emergencyThrottleRef = useRef(new Map());
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  
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
      if (emergencySoundRef.current) {
        await emergencySoundRef.current.playAsync();
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==' },
        {
          shouldPlay: true,
          isLooping: true,
          volume: 1.0,
          progressUpdateIntervalMillis: 250,
        }
      );
      emergencySoundRef.current = sound;
    } catch (error) {
      console.log('Emergency siren unavailable:', error?.message || error);
    }
  }, []);

  const stopEmergencySiren = useCallback(async () => {
    if (!emergencySoundRef.current) return;
    try {
      await emergencySoundRef.current.stopAsync();
      await emergencySoundRef.current.unloadAsync();
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
          sound: true,
          channelId: 'emergency-alerts',
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { type: 'emergency', eventKey },
        },
        trigger: null,
      });
    } catch (error) {
      console.log('Emergency notification failed:', error?.message || error);
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
          await Notifications.setNotificationChannelAsync('emergency-alerts', {
            name: 'Emergency Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 200, 500, 200, 500],
            sound: 'default',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
        }
      } catch (error) {
        console.log('Notification setup failed:', error?.message || error);
        setNotificationsEnabled(false);
      }
    };

    setupNotifications();
  }, []);

  // Play connection success sound
  const playConnectionSound = useCallback(async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==' },
        { shouldPlay: true }
      );
      await sound.playAsync();
      sound.unloadAsync();
    } catch (error) {
      console.log('Connection sound disabled or unavailable');
    }
  }, []);

  // Log activity
  const addActivity = useCallback((type, details) => {
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
          setBreadcrumbs(parsed.points || []);
          setIsTrackingBreadcrumbs(parsed.isTracking || false);
          console.log(`Loaded ${parsed.points?.length || 0} breadcrumbs`);
        }
      } catch (error) {
        console.error('Failed to load breadcrumbs:', error);
      }
    };
    loadBreadcrumbs();
  }, []);
  
  // Save breadcrumbs when they change
  const breadcrumbSaveRef = useRef(null);
  useEffect(() => {
    if (breadcrumbs.length === 0 && !isTrackingBreadcrumbs) return;
    
    if (breadcrumbSaveRef.current) {
      clearTimeout(breadcrumbSaveRef.current);
    }
    
    breadcrumbSaveRef.current = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(BREADCRUMBS_KEY, JSON.stringify({
          points: breadcrumbs.slice(-500), // Keep last 500 points
          isTracking: isTrackingBreadcrumbs,
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
  }, [breadcrumbs, isTrackingBreadcrumbs]);
  
  // Add a breadcrumb point (call when location updates)
  const addBreadcrumb = useCallback((lat, lng, altitude = null) => {
    if (!isTrackingBreadcrumbs) return;
    if (!lat || !lng || lat === 0 || lng === 0) return;
    
    // Check minimum distance from last point (10 meters)
    if (lastBreadcrumbRef.current) {
      const lastLat = lastBreadcrumbRef.current.lat;
      const lastLng = lastBreadcrumbRef.current.lng;
      
      // Haversine distance calculation
      const R = 6371e3;
      const φ1 = lastLat * Math.PI / 180;
      const φ2 = lat * Math.PI / 180;
      const Δφ = (lat - lastLat) * Math.PI / 180;
      const Δλ = (lng - lastLng) * Math.PI / 180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      if (distance < 10) return; // Skip if less than 10m
    }
    
    const point = {
      lat,
      lng,
      altitude,
      timestamp: Date.now(),
    };
    
    lastBreadcrumbRef.current = point;
    setBreadcrumbs(prev => [...prev, point]);
  }, [isTrackingBreadcrumbs]);
  
  // Start tracking breadcrumbs
  const startBreadcrumbTracking = useCallback(() => {
    setIsTrackingBreadcrumbs(true);
    lastBreadcrumbRef.current = null;
    console.log('Breadcrumb tracking started');
  }, []);
  
  // Stop tracking breadcrumbs
  const stopBreadcrumbTracking = useCallback(() => {
    setIsTrackingBreadcrumbs(false);
    console.log('Breadcrumb tracking stopped');
  }, []);
  
  // Clear all breadcrumbs
  const clearBreadcrumbs = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(BREADCRUMBS_KEY);
      setBreadcrumbs([]);
      lastBreadcrumbRef.current = null;
      console.log('Breadcrumbs cleared');
      return true;
    } catch (error) {
      console.error('Failed to clear breadcrumbs:', error);
      return false;
    }
  }, []);
  
  // Calculate total trail distance
  const getTrailDistance = useCallback(() => {
    if (breadcrumbs.length < 2) return 0;
    
    let total = 0;
    for (let i = 1; i < breadcrumbs.length; i++) {
      const prev = breadcrumbs[i - 1];
      const curr = breadcrumbs[i];
      
      const R = 6371e3;
      const φ1 = prev.lat * Math.PI / 180;
      const φ2 = curr.lat * Math.PI / 180;
      const Δφ = (curr.lat - prev.lat) * Math.PI / 180;
      const Δλ = (curr.lng - prev.lng) * Math.PI / 180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      total += R * c;
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
          setIsEnabled(state === 'PoweredOn');
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
            // Auto-disconnect after 15 seconds of no data (device likely off)
            if (timeSinceData > 15000) {
              console.log('Connection timeout - device may be powered off');
              handleConnectionLost();
            }
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
    setConnectionHealth('lost');
    setStatusMessage('Device disconnected');
    
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
    
    setConnectedDevice(null);
    setIsConnected(false);
    await stopEmergencySignals();
    setMyLocation({ lat: 0, lng: 0, satellites: 0, valid: false });
    
    setTimeout(() => setStatusMessage(''), 3000);
  }, [stopEmergencySignals]);

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
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          
          return Object.values(granted).every(
            status => status === PermissionsAndroid.RESULTS.GRANTED
          );
        } else {
          // Android 11 and below
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (error) {
        console.error('Permission error:', error);
        return false;
      }
    }
    return true; // iOS handles permissions automatically
  }, []);

  // Request to enable Bluetooth
  const requestEnable = useCallback(async () => {
    if (!bleAvailable || !bleManagerRef.current) {
      console.log('Mock mode: Bluetooth enabled');
      setIsEnabled(true); // Mock mode
      return true;
    }
    
    await requestPermissions();
    
    if (Platform.OS === 'android') {
      try {
        await bleManagerRef.current.enable();
        setIsEnabled(true);
        return true;
      } catch (error) {
        Alert.alert('Bluetooth Required', 'Please enable Bluetooth in your device settings.');
        return false;
      }
    }
    return isEnabled;
  }, [isEnabled, requestPermissions]);

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
            console.error('Scan error:', error);
            setIsScanning(false);
            return;
          }

          // Filter for HikeSafe devices by name (also accept legacy SOS-Device names)
          if (device && device.name && (device.name.startsWith('HikeSafe-D') || device.name.startsWith('SOS-Device'))) {
            if (!foundDevices.has(device.id)) {
              foundDevices.set(device.id, {
                id: device.id,
                name: device.name,
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
  }, [requestPermissions]);

  // Parse incoming BLE data from device
  const parseBluetoothData = useCallback((data) => {
    if (!data) return;
    
    setLastDataReceived(Date.now());
    
    const lines = data.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
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
            }
          }
        }
      }
      
      // ALERT:[TYPE],[ID],[LAT],[LON] - Alert from another device via LoRa
      // Also handles ALERT:OFFLINE,ID and ALERT:ONLINE,ID (no lat/lng)
      else if (trimmed.startsWith('ALERT:')) {
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
          if (isInLobby) {
            setMemberOffline(deviceId, true);
          }
          addActivity('offline', deviceId, `Device ${deviceId} went offline`);
          setStatusMessage(`Device ${deviceId} went OFFLINE`);
          setTimeout(() => setStatusMessage(''), 5000);
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
          if (isInLobby) {
            setMemberOffline(deviceId, false);
            registerMemberSync(deviceId, Date.now(), { source: 'online' });
          }
          addActivity('online', deviceId, `Device ${deviceId} is back online`);
          setStatusMessage(`Device ${deviceId} is back ONLINE`);
          setTimeout(() => setStatusMessage(''), 3000);
          return;
        }
        
        // Standard alerts with coordinates (SOS, MORSE, OK)
        if (parts.length >= 4) {
          const lat = parseFloat(parts[2]);
          const lng = parseFloat(parts[3]);
          
          // Track new member joins
          const isNewMember = !knownMembersRef.current.has(deviceId);
          if (isNewMember) {
            knownMembersRef.current.add(deviceId);
            addActivity('join', deviceId, `Device ${deviceId} joined the group`);
          }
          if (isInLobby) {
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
            pushEmergencyNotification(
              'Emergency Alert',
              `Device ${deviceId} triggered ${type}. Check immediately.`,
              emergencyKey
            );

            if (!shouldThrottleEmergency(`popup-${emergencyKey}`, 12000)) {
              Alert.alert(
                '🚨 EMERGENCY ALERT',
                `Device ${deviceId} has triggered a ${type} alert!\n\nLocation: ${lat.toFixed(5)}, ${lng.toFixed(5)}\n\nCheck on this member immediately!`,
                [{ text: 'View Location', style: 'default' }],
                { cancelable: true }
              );
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
            addActivity('ok', deviceId, `Device ${deviceId} cancelled alert`);
            // Show status message
            setStatusMessage(`Device ${deviceId} is OK`);
            setTimeout(() => setStatusMessage(''), 3000);
            
            // Vibrate with OK pattern
            triggerVibration('OK');
            
            // Show notification that alert was cancelled
            Alert.alert(
              '✅ Alert Cancelled',
              `Device ${deviceId} has signaled they are OK.`,
              [{ text: 'Dismiss' }],
              { cancelable: true }
            );
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
          setStatusMessage(`Lobby ${lobbyCode} synced to device`);

          const localDeviceId = parseDeviceId(connectedDevice || deviceRef.current);
          if (isInLobby && localDeviceId !== null) {
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
        } else {
          setStatusMessage(status);
        }
        setTimeout(() => setStatusMessage(''), 3000);
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
            setStatusMessage(`Name synced: ${nickname}`);
            setTimeout(() => setStatusMessage(''), 2000);
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
      
      // MSG:[FROM_ID],[TEXT] - Incoming text message via LoRa
      else if (trimmed.startsWith('MSG:')) {
        const firstComma = trimmed.indexOf(',');
        if (firstComma > 4) {
          const fromId = parseInt(trimmed.substring(4, firstComma), 10);
          const text = trimmed.substring(firstComma + 1);

          if (text.startsWith('__JOINED_TS__:')) {
            const ts = parseInt(text.substring(14), 10);
            if (isInLobby && !Number.isNaN(fromId)) {
              registerMemberSync(fromId, Number.isNaN(ts) ? Date.now() : ts, { source: 'join-broadcast' });
            }
            return;
          }
          
          console.log(`Received MSG from Device ${fromId}: ${text}`);
          
          const newMessage = {
            id: `msg-${Date.now()}-${fromId}`,
            from: fromId,
            to: 'me',
            text: text,
            timestamp: Date.now(),
            isMine: false,
          };
          
          setMessages(prev => [...prev, newMessage]);
          setUnreadCount(prev => prev + 1);
          
          // Vibrate for incoming message (respects vibrationEnabled)
          triggerVibration('MESSAGE');
        }
      }

      // ECHO_MSG:[DEVICE_ID],[TEXT] - Echoed local message from ESP32 to all connected phones
      else if (trimmed.startsWith('ECHO_MSG:')) {
        const firstComma = trimmed.indexOf(',');
        if (firstComma > 9) {
          const deviceId = parseInt(trimmed.substring(9, firstComma), 10);
          const text = trimmed.substring(firstComma + 1);
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
          }
          setStatusMessage('Message synced to connected phones');
          setTimeout(() => setStatusMessage(''), 2000);
        }
      }
      
      // MSG_SENT confirmation
      else if (trimmed === 'MSG_SENT') {
        setStatusMessage('Message sent via LoRa');
        setTimeout(() => setStatusMessage(''), 2000);
      }
    });
  }, [addActivity, connectedDevice, isInLobby, parseDeviceId, pushEmergencyNotification, registerMemberSync, setEmergencyContactForDevice, setMemberNickname, setMemberOffline, setMyDeviceId, shouldThrottleEmergency, startEmergencySignals, stopEmergencySignals, triggerVibration]);

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

  // Connect to a BLE device - direct connection, no pairing needed!
  const connectToDevice = useCallback(async (device) => {
    if (!bleAvailable || !bleManagerRef.current) {
      // BLE not available - cannot connect
      Alert.alert(
        'Bluetooth Not Available',
        'Bluetooth is required to connect to your HikeSafe device. Please use a native build (not Expo Go) and ensure Bluetooth is enabled.',
        [{ text: 'OK' }]
      );
      return false;
    }

    // Stop scanning if still running
    bleManagerRef.current.stopDeviceScan();
    setIsConnecting(true);

    try {
      // Connect to the BLE device
      const connectedDev = await bleManagerRef.current.connectToDevice(device.id, {
        timeout: 10000,
      });
      
      // Discover services and characteristics
      await connectedDev.discoverAllServicesAndCharacteristics();
      
      // Subscribe to TX characteristic for notifications (device → app)
      const subscription = connectedDev.monitorCharacteristicForService(
        NUS_SERVICE_UUID,
        NUS_TX_CHAR_UUID,
        (error, characteristic) => {
          if (error) {
            console.error('Notification error:', error);
            if (error.message?.includes('disconnected') || error.message?.includes('cancel')) {
              handleConnectionLost();
            }
            return;
          }
          
          if (characteristic?.value) {
            // Decode base64 value from BLE
            try {
              const decoded = Buffer.from(characteristic.value, 'base64').toString('utf-8');
              parseBluetoothData(decoded);
            } catch (e) {
              console.error('Decode error:', e);
            }
          }
        }
      );
      
      // Listen for disconnection events
      disconnectSubscriptionRef.current = connectedDev.onDisconnected((error, disconnectedDevice) => {
        console.log('Device disconnected:', error?.message || 'Connection closed');
        handleConnectionLost();
      });
      
      deviceRef.current = connectedDev;
      subscriptionRef.current = subscription;
      setConnectedDevice({ ...device, bleDevice: connectedDev });
      setIsConnected(true);
      wasEverConnectedRef.current = true;
      setLastDataReceived(Date.now());
      setConnectionHealth('good');

      const localDeviceId = parseDeviceId(device);
      if (localDeviceId !== null) {
        setMyDeviceId(localDeviceId);
        if (isInLobby) {
          registerMemberSync(localDeviceId, Date.now(), { isSelf: true, source: 'ble-connect' });
        }
      }
      
      // Play connection success sound
      playConnectionSound();
      
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
  }, [isInLobby, parseBluetoothData, handleConnectionLost, parseDeviceId, playConnectionSound, registerMemberSync, setMyDeviceId]);

  // Disconnect from device
  const disconnect = useCallback(async () => {
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }
    
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
      } catch (error) {
        console.error('Disconnect error:', error);
      }
      deviceRef.current = null;
    }
    
    setConnectedDevice(null);
    setIsConnected(false);
    lastDisconnectAtRef.current = Date.now();
    stopEmergencySignals();
    setMyLocation({ lat: 0, lng: 0, satellites: 0, valid: false });
    setConnectionHealth('unknown');
    setLastDataReceived(null);
    setLoraSignalStrength(null);
  }, [stopEmergencySignals]);

  // Send command to device via BLE
  const sendCommand = useCallback(async (command) => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to a device first.');
      return false;
    }
    
    const cmdWithNewline = command.endsWith('\n') ? command : command + '\n';
    
    if (!BleManager || !deviceRef.current) {
      // Mock command handling
      console.log('Mock sending:', cmdWithNewline);
      if (command === 'SOS') {
        setStatusMessage('SENDING_SOS');
      } else if (command === 'OK') {
        setStatusMessage('SENDING_OK');
      }
      setTimeout(() => setStatusMessage(''), 2000);
      return true;
    }
    
    try {
      // Encode to base64 for BLE transmission
      const encoded = Buffer.from(cmdWithNewline, 'utf-8').toString('base64');
      
      // Write to RX characteristic (app → device)
      await deviceRef.current.writeCharacteristicWithResponseForService(
        NUS_SERVICE_UUID,
        NUS_RX_CHAR_UUID,
        encoded
      );
      return true;
    } catch (error) {
      console.error('Send error:', error);
      if (error.message?.includes('disconnected') || error.message?.includes('cancel')) {
        handleConnectionLost();
      } else {
        Alert.alert('Send Failed', 'Could not send command to device.');
      }
      return false;
    }
  }, [isConnected, handleConnectionLost]);

  // Expose BLE command sender to LobbyContext so it can sync lobby code to device.
  useEffect(() => {
    if (registerBleCommandSender) {
      registerBleCommandSender(sendCommand);
    }
  }, [registerBleCommandSender, sendCommand]);

  // Auto-sync lobby to device whenever lobbyCode changes while connected.
  useEffect(() => {
    if (!isConnected) return;
    if (!lobbyCode) return;
    if (!syncLobbyToDevice) return;
    // Fire-and-forget; LobbyContext already handles missing sender.
    syncLobbyToDevice(sendCommand);
  }, [isConnected, lobbyCode, syncLobbyToDevice, sendCommand]);

  // Auto-send our nickname after connection and when entering a lobby.
  useEffect(() => {
    if (!isConnected) return;
    if (!isInLobby) return;
    sendMyNicknameToDevice();
    sendMyEmergencyContactToDevice();
  }, [isConnected, isInLobby, sendMyNicknameToDevice, sendMyEmergencyContactToDevice]);

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
    
    setMessages(prev => [...prev, newMessage]);
    
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
        name: `Device ${deviceId}`,
        lastMessage: lastMsg?.text || '',
        lastTimestamp: lastMsg?.timestamp || 0,
        unreadCount: unread,
      };
    }).sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }, [messages]);
  
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
    availableDevices,
    connectedDevicesCount,
    myLocation,
    memberLocations,
    activeAlert,
    statusMessage,
    morseInput,
    messages,
    unreadCount,
    connectionHealth,
    lastDataReceived,
    loraSignalStrength,
    activityLog,
    
    // Breadcrumbs / Trail tracking
    breadcrumbs,
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
