import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

// BLE Library - works with ESP32 BLE (NO system pairing required!)
let BleManager = null;
try {
  const blePlx = require('react-native-ble-plx');
  BleManager = blePlx.BleManager;
} catch (e) {
  console.log('BLE not available - using mock mode');
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
  // Connection state
  const [isEnabled, setIsEnabled] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [availableDevices, setAvailableDevices] = useState([]);
  
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
  
  const bleManagerRef = useRef(null);
  const deviceRef = useRef(null);
  const subscriptionRef = useRef(null);
  const healthCheckRef = useRef(null);
  const mockIntervalRef = useRef(null);
  const disconnectSubscriptionRef = useRef(null);

  // Initialize BLE Manager
  useEffect(() => {
    if (BleManager && !bleManagerRef.current) {
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
    setMyLocation({ lat: 0, lng: 0, satellites: 0, valid: false });
    
    setTimeout(() => setStatusMessage(''), 3000);
  }, []);

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
    if (!BleManager || !bleManagerRef.current) {
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
    if (!BleManager || !bleManagerRef.current) {
      // Mock devices for development
      setAvailableDevices([
        { id: 'mock-1', name: 'HikeSafe-D1', address: '00:00:00:00:00:01' },
        { id: 'mock-2', name: 'HikeSafe-D2', address: '00:00:00:00:00:02' },
      ]);
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
      
      // SELF:[LAT],[LON],[SATS] - Own GPS location from connected device
      if (trimmed.startsWith('SELF:')) {
        const parts = trimmed.substring(5).split(',');
        if (parts.length >= 3) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          const satellites = parseInt(parts[2], 10);
          const valid = lat !== 0 || lng !== 0;
          setMyLocation({ lat, lng, satellites, valid });
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
          setStatusMessage(`Device ${deviceId} is back ONLINE`);
          setTimeout(() => setStatusMessage(''), 3000);
          return;
        }
        
        // Standard alerts with coordinates (SOS, MORSE, OK)
        if (parts.length >= 4) {
          const lat = parseFloat(parts[2]);
          const lng = parseFloat(parts[3]);
          
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
          } else if (type === 'OK') {
            // OK received - clear any active alert from that device
            setActiveAlert(prev => {
              if (prev && prev.deviceId === deviceId) {
                console.log(`Clearing alert from Device ${deviceId} (received OK)`);
                return null;
              }
              return prev;
            });
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
            // Show status message
            setStatusMessage(`Device ${deviceId} is OK`);
            setTimeout(() => setStatusMessage(''), 3000);
          }
        }
      }
      
      // STATUS messages from own device
      else if (trimmed.startsWith('STATUS:')) {
        const status = trimmed.substring(7);
        setStatusMessage(status);
        setTimeout(() => setStatusMessage(''), 3000);
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
        }
      }
      
      // MSG_SENT confirmation
      else if (trimmed === 'MSG_SENT') {
        setStatusMessage('Message sent via LoRa');
        setTimeout(() => setStatusMessage(''), 2000);
      }
    });
  }, []);

  // Connect to a BLE device - direct connection, no pairing needed!
  const connectToDevice = useCallback(async (device) => {
    if (!BleManager || !bleManagerRef.current) {
      // Mock connection
      setIsConnecting(true);
      await new Promise(resolve => setTimeout(resolve, 1500));
      setConnectedDevice(device);
      setIsConnected(true);
      setIsConnecting(false);
      setLastDataReceived(Date.now());
      
      // Start mock data stream
      mockIntervalRef.current = setInterval(() => {
        const mockLat = 14.5995 + (Math.random() - 0.5) * 0.01;
        const mockLng = 120.9842 + (Math.random() - 0.5) * 0.01;
        parseBluetoothData(`SELF:${mockLat.toFixed(6)},${mockLng.toFixed(6)},8`);
      }, 2000);
      
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
      setLastDataReceived(Date.now());
      setConnectionHealth('good');
      
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
  }, [parseBluetoothData, handleConnectionLost]);

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
    setMyLocation({ lat: 0, lng: 0, satellites: 0, valid: false });
    setConnectionHealth('unknown');
    setLastDataReceived(null);
  }, []);

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

  // Convenience methods
  const sendSOS = useCallback(() => sendCommand('SOS'), [sendCommand]);
  const sendOK = useCallback(() => sendCommand('OK'), [sendCommand]);
  
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
      // Broadcast messages - messages to/from device 0 (broadcast)
      return messages.filter(msg => msg.to === 0 || msg.from === 0);
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
  }, []);
  
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
    };
  }, []);

  const value = {
    // State
    isEnabled,
    isScanning,
    isConnecting,
    isConnected,
    connectedDevice,
    availableDevices,
    myLocation,
    memberLocations,
    activeAlert,
    statusMessage,
    morseInput,
    messages,
    unreadCount,
    connectionHealth,
    lastDataReceived,
    
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
    
    // Messaging
    sendMessage,
    sendBroadcastMessage,
    getMessagesForDevice,
    getConversations,
    markMessagesAsRead,
  };

  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
};

export default BluetoothContext;
