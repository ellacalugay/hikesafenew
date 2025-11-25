import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
// BLE imports - uncomment when ready for native build
// import bleService from '../services/BleService';

// LoRa Connection States
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  SCANNING: 'scanning',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
};

// Create the context
const LoRaContext = createContext(null);

// Provider component
export const LoRaProvider = ({ children }) => {
  // Connection state
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.DISCONNECTED);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [error, setError] = useState(null);
  
  // Lobby state
  const [currentLobby, setCurrentLobby] = useState(null);
  const [lobbyMembers, setLobbyMembers] = useState([]);
  
  // Message state
  const [messages, setMessages] = useState([]);
  const messageListeners = useRef([]);

  // Scan for devices
  const scanForDevices = useCallback(async (timeoutMs = 8000) => {
    try {
      setConnectionState(CONNECTION_STATES.SCANNING);
      setError(null);
      
      // TODO: Uncomment when BLE is ready
      // const devices = await bleService.scanOnce(timeoutMs);
      // setAvailableDevices(devices.map(d => ({
      //   id: d.id,
      //   name: d.name || 'Unknown Device',
      //   rssi: d.rssi,
      // })));
      
      // Mock devices for UI testing
      const mockDevices = [
        { id: '1', name: 'HikeSafe_102D', rssi: -45 },
        { id: '2', name: 'HikeSafe_143J', rssi: -60 },
        { id: '3', name: 'HikeSafe_722R', rssi: -52 },
      ];
      
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate scanning
      setAvailableDevices(mockDevices);
      setConnectionState(CONNECTION_STATES.DISCONNECTED);
      
      return mockDevices;
    } catch (err) {
      setError(err.message);
      setConnectionState(CONNECTION_STATES.ERROR);
      return [];
    }
  }, []);

  // Connect to a device
  const connectToDevice = useCallback(async (device) => {
    try {
      setConnectionState(CONNECTION_STATES.CONNECTING);
      setError(null);
      
      // TODO: Uncomment when BLE is ready
      // const success = await bleService.connectToDevice(device);
      // if (success) {
      //   setConnectedDevice(device);
      //   setConnectionState(CONNECTION_STATES.CONNECTED);
      //   return true;
      // }
      
      // Mock connection for UI testing
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate connection
      setConnectedDevice(device);
      setConnectionState(CONNECTION_STATES.CONNECTED);
      return true;
    } catch (err) {
      setError(err.message);
      setConnectionState(CONNECTION_STATES.ERROR);
      return false;
    }
  }, []);

  // Disconnect from device
  const disconnect = useCallback(async () => {
    try {
      // TODO: Uncomment when BLE is ready
      // await bleService.disconnect();
      
      setConnectedDevice(null);
      setConnectionState(CONNECTION_STATES.DISCONNECTED);
      setCurrentLobby(null);
      setLobbyMembers([]);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  // Create a lobby
  const createLobby = useCallback(async (lobbyName, groupId, maxMembers) => {
    if (connectionState !== CONNECTION_STATES.CONNECTED) {
      setError('Not connected to a device');
      return false;
    }
    
    try {
      // TODO: Uncomment when BLE is ready
      // const success = await bleService.sendCreateLobby(groupId, '', lobbyName);
      // if (success) {
      //   setCurrentLobby({ name: lobbyName, id: groupId, maxMembers });
      //   return true;
      // }
      
      // Mock for UI testing
      setCurrentLobby({ name: lobbyName, id: groupId, maxMembers: parseInt(maxMembers) });
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [connectionState]);

  // Join a lobby
  const joinLobby = useCallback(async (groupId) => {
    if (connectionState !== CONNECTION_STATES.CONNECTED) {
      setError('Not connected to a device');
      return false;
    }
    
    try {
      // TODO: Uncomment when BLE is ready
      // const success = await bleService.sendJoinLobby(groupId);
      // if (success) {
      //   setCurrentLobby({ id: groupId });
      //   return true;
      // }
      
      // Mock for UI testing
      setCurrentLobby({ id: groupId, name: `Lobby ${groupId}` });
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [connectionState]);

  // Send a text message
  const sendMessage = useCallback(async (destination, text) => {
    if (connectionState !== CONNECTION_STATES.CONNECTED) {
      setError('Not connected to a device');
      return false;
    }
    
    try {
      // TODO: Uncomment when BLE is ready
      // const success = await bleService.sendText(destination, text);
      // return success;
      
      // Mock for UI testing - add to local messages
      const newMessage = {
        id: Date.now(),
        text,
        sender: 'me',
        destination,
        time: new Date().toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit', 
          hour12: true 
        }).toLowerCase(),
      };
      setMessages(prev => [...prev, newMessage]);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [connectionState]);

  // Send GPS location
  const sendLocation = useCallback(async (latitude, longitude) => {
    if (connectionState !== CONNECTION_STATES.CONNECTED) {
      return false;
    }
    
    try {
      // TODO: Uncomment when BLE is ready
      // return await bleService.sendGPS(latitude, longitude);
      
      return true; // Mock success
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [connectionState]);

  // Send user profile
  const sendProfile = useCallback(async (profileData) => {
    if (connectionState !== CONNECTION_STATES.CONNECTED) {
      return false;
    }
    
    try {
      // TODO: Uncomment when BLE is ready
      // return await bleService.sendProfile(profileData);
      
      return true; // Mock success
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [connectionState]);

  // Subscribe to incoming messages
  const subscribeToMessages = useCallback((callback) => {
    messageListeners.current.push(callback);
    return () => {
      messageListeners.current = messageListeners.current.filter(cb => cb !== callback);
    };
  }, []);

  // Context value
  const value = {
    // State
    connectionState,
    connectedDevice,
    availableDevices,
    error,
    currentLobby,
    lobbyMembers,
    messages,
    
    // Computed
    isConnected: connectionState === CONNECTION_STATES.CONNECTED,
    isScanning: connectionState === CONNECTION_STATES.SCANNING,
    isConnecting: connectionState === CONNECTION_STATES.CONNECTING,
    
    // Actions
    scanForDevices,
    connectToDevice,
    disconnect,
    createLobby,
    joinLobby,
    sendMessage,
    sendLocation,
    sendProfile,
    subscribeToMessages,
    clearError: () => setError(null),
  };

  return (
    <LoRaContext.Provider value={value}>
      {children}
    </LoRaContext.Provider>
  );
};

// Custom hook to use the LoRa context
export const useLoRa = () => {
  const context = useContext(LoRaContext);
  if (!context) {
    throw new Error('useLoRa must be used within a LoRaProvider');
  }
  return context;
};

export default LoRaContext;
