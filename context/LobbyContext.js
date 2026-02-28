import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LobbyContext = createContext(null);

// Storage keys
const LOBBY_CODE_KEY = '@hikesafe_lobby_code';
const LOBBY_NAME_KEY = '@hikesafe_lobby_name';
const LOBBY_ROLE_KEY = '@hikesafe_lobby_role';
const LOBBY_MAX_MEMBERS_KEY = '@hikesafe_lobby_max_members';
const MEMBER_NICKNAMES_KEY = '@hikesafe_member_nicknames';
const MY_NICKNAME_KEY = '@hikesafe_my_nickname';

// Generate a random 4-digit lobby code
const generateLobbyCode = () => {
  return Math.floor(1000 + Math.random() * 9000); // 1000-9999
};

export const useLobby = () => {
  const context = useContext(LobbyContext);
  if (!context) {
    throw new Error('useLobby must be used within a LobbyProvider');
  }
  return context;
};

export const LobbyProvider = ({ children }) => {
  const [lobbyCode, setLobbyCodeState] = useState(null);
  const [lobbyName, setLobbyName] = useState('');
  const [maxMembers, setMaxMembers] = useState(10);
  const [isHost, setIsHost] = useState(false);
  const [isInLobby, setIsInLobby] = useState(false);
  const [lobbyMembers, setLobbyMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [memberNicknames, setMemberNicknames] = useState({}); // { deviceId: nickname }
  const [myNickname, setMyNicknameState] = useState('');
  
  // BLE command callback - will be set by BluetoothContext integration
  const [sendLobbyCommand, setSendLobbyCommand] = useState(null);

  // Load persisted lobby data on mount
  useEffect(() => {
    loadPersistedLobby();
  }, []);

  const loadPersistedLobby = async () => {
    try {
      const [savedCode, savedName, savedRole, savedMax, savedNicknames, savedMyNickname] = await Promise.all([
        AsyncStorage.getItem(LOBBY_CODE_KEY),
        AsyncStorage.getItem(LOBBY_NAME_KEY),
        AsyncStorage.getItem(LOBBY_ROLE_KEY),
        AsyncStorage.getItem(LOBBY_MAX_MEMBERS_KEY),
        AsyncStorage.getItem(MEMBER_NICKNAMES_KEY),
        AsyncStorage.getItem(MY_NICKNAME_KEY),
      ]);

      if (savedCode) {
        setLobbyCodeState(parseInt(savedCode, 10));
        setLobbyName(savedName || '');
        setIsHost(savedRole === 'host');
        setMaxMembers(savedMax ? parseInt(savedMax, 10) : 10);
        setIsInLobby(true);
        console.log('Loaded persisted lobby:', savedCode);
      }
      
      if (savedNicknames) {
        setMemberNicknames(JSON.parse(savedNicknames));
      }
      
      if (savedMyNickname) {
        setMyNicknameState(savedMyNickname);
      }
    } catch (error) {
      console.error('Failed to load lobby data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const persistLobbyData = async (code, name, role, max) => {
    try {
      await Promise.all([
        AsyncStorage.setItem(LOBBY_CODE_KEY, code.toString()),
        AsyncStorage.setItem(LOBBY_NAME_KEY, name),
        AsyncStorage.setItem(LOBBY_ROLE_KEY, role),
        AsyncStorage.setItem(LOBBY_MAX_MEMBERS_KEY, max.toString()),
      ]);
    } catch (error) {
      console.error('Failed to persist lobby data:', error);
    }
  };

  const clearPersistedLobby = async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(LOBBY_CODE_KEY),
        AsyncStorage.removeItem(LOBBY_NAME_KEY),
        AsyncStorage.removeItem(LOBBY_ROLE_KEY),
        AsyncStorage.removeItem(LOBBY_MAX_MEMBERS_KEY),
      ]);
    } catch (error) {
      console.error('Failed to clear lobby data:', error);
    }
  };

  // Create a new lobby (user becomes host)
  const createLobby = useCallback(async (name, maxMemberCount = 10) => {
    const code = generateLobbyCode();
    
    setLobbyCodeState(code);
    setLobbyName(name);
    setMaxMembers(maxMemberCount);
    setIsHost(true);
    setIsInLobby(true);
    setLobbyMembers([{ id: 'self', name: 'You (Host)', isHost: true }]);
    
    await persistLobbyData(code, name, 'host', maxMemberCount);
    
    console.log(`Created lobby: ${name} with code ${code}`);
    return code;
  }, []);

  // Join an existing lobby with code
  const joinLobby = useCallback(async (code, userName = 'Member') => {
    const numericCode = typeof code === 'string' ? parseInt(code, 10) : code;
    
    if (isNaN(numericCode) || numericCode < 1000 || numericCode > 9999) {
      throw new Error('Invalid lobby code. Must be 4 digits.');
    }
    
    setLobbyCodeState(numericCode);
    setLobbyName(''); // Will be synced from host later
    setMaxMembers(10);
    setIsHost(false);
    setIsInLobby(true);
    setLobbyMembers([{ id: 'self', name: userName, isHost: false }]);
    
    await persistLobbyData(numericCode, '', 'member', 10);
    
    console.log(`Joined lobby with code ${numericCode}`);
    return numericCode;
  }, []);

  // Send lobby code to ESP32 device via BLE
  const syncLobbyToDevice = useCallback(async (bleCommandFn) => {
    if (!lobbyCode) {
      console.log('No lobby code to sync');
      return false;
    }
    
    const commandFn = bleCommandFn || sendLobbyCommand;
    if (!commandFn) {
      console.log('No BLE command function available');
      return false;
    }
    
    try {
      // Send LOBBY:XXXX command to ESP32
      const success = await commandFn(`LOBBY:${lobbyCode}`);
      if (success) {
        console.log(`Synced lobby code ${lobbyCode} to device`);
      }
      return success;
    } catch (error) {
      console.error('Failed to sync lobby to device:', error);
      return false;
    }
  }, [lobbyCode, sendLobbyCommand]);

  // Leave current lobby
  const leaveLobby = useCallback(async () => {
    // Send code 0 to device to clear lobby filter
    if (sendLobbyCommand) {
      try {
        await sendLobbyCommand('LOBBY:0');
      } catch (e) {
        console.log('Could not clear device lobby:', e);
      }
    }
    
    setLobbyCodeState(null);
    setLobbyName('');
    setMaxMembers(10);
    setIsHost(false);
    setIsInLobby(false);
    setLobbyMembers([]);
    setMemberNicknames({});
    
    await clearPersistedLobby();
    await AsyncStorage.removeItem(MEMBER_NICKNAMES_KEY);
    console.log('Left lobby');
  }, [sendLobbyCommand]);

  // Add a member to the lobby (called when receiving device data)
  const addMember = useCallback((member) => {
    setLobbyMembers(prev => {
      const exists = prev.find(m => m.id === member.id);
      if (exists) {
        return prev.map(m => m.id === member.id ? { ...m, ...member } : m);
      }
      return [...prev, member];
    });
  }, []);

  // Remove a member from the lobby
  const removeMember = useCallback((memberId) => {
    setLobbyMembers(prev => prev.filter(m => m.id !== memberId));
  }, []);

  // Set nickname for a device (host only)
  const setMemberNickname = useCallback(async (deviceId, nickname) => {
    const newNicknames = { ...memberNicknames, [deviceId]: nickname };
    setMemberNicknames(newNicknames);
    try {
      await AsyncStorage.setItem(MEMBER_NICKNAMES_KEY, JSON.stringify(newNicknames));
    } catch (error) {
      console.error('Failed to save nickname:', error);
    }
  }, [memberNicknames]);

  // Get nickname for a device (returns deviceId if no nickname set)
  const getMemberNickname = useCallback((deviceId) => {
    return memberNicknames[deviceId] || `Device ${deviceId}`;
  }, [memberNicknames]);

  // Set your own nickname
  const setMyNickname = useCallback(async (nickname) => {
    setMyNicknameState(nickname);
    try {
      await AsyncStorage.setItem(MY_NICKNAME_KEY, nickname);
    } catch (error) {
      console.error('Failed to save my nickname:', error);
    }
  }, []);

  // Clear all nicknames (on leave lobby)
  const clearNicknames = useCallback(async () => {
    setMemberNicknames({});
    try {
      await AsyncStorage.removeItem(MEMBER_NICKNAMES_KEY);
    } catch (error) {
      console.error('Failed to clear nicknames:', error);
    }
  }, []);

  // Register the BLE command sender (called by BluetoothContext)
  const registerBleCommandSender = useCallback((commandFn) => {
    setSendLobbyCommand(() => commandFn);
  }, []);

  const value = {
    // State
    lobbyCode,
    lobbyName,
    maxMembers,
    isHost,
    isInLobby,
    lobbyMembers,
    isLoading,
    memberNicknames,
    myNickname,
    
    // Actions
    createLobby,
    joinLobby,
    leaveLobby,
    syncLobbyToDevice,
    addMember,
    removeMember,
    registerBleCommandSender,
    
    // Nicknames
    setMemberNickname,
    getMemberNickname,
    setMyNickname,
    clearNicknames,
    
    // Helpers
    generateLobbyCode,
  };

  return (
    <LobbyContext.Provider value={value}>
      {children}
    </LobbyContext.Provider>
  );
};

export default LobbyContext;
