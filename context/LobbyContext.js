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
const DEVICE_NICKNAME_KEY = '@hikesafe_device_nickname';
const HOST_DEVICE_ID_KEY = '@hikesafe_host_device_id';
const MY_DEVICE_ID_KEY = '@hikesafe_my_device_id';
const EMERGENCY_CONTACTS_KEY = '@hikesafe_emergency_contacts';
const MY_EMERGENCY_CONTACT_KEY = '@hikesafe_my_emergency_contact';

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
  const [deviceNickname, setDeviceNicknameState] = useState(''); // Local nickname for connected device
  const [hostDeviceId, setHostDeviceId] = useState(null);
  const [myDeviceId, setMyDeviceIdState] = useState(null);
  
  // BLE command callback - will be set by BluetoothContext integration
  const [sendLobbyCommand, setSendLobbyCommand] = useState(null);

  // Emergency contacts
  // emergencyContacts: { [deviceId]: { name: string, phone: string } }
  const [emergencyContacts, setEmergencyContacts] = useState({});
  const [myEmergencyContact, setMyEmergencyContactState] = useState({ name: '', phone: '' });

  // Load persisted lobby data on mount
  useEffect(() => {
    loadPersistedLobby();
  }, []);

  const loadPersistedLobby = async () => {
    try {
      const [savedCode, savedName, savedRole, savedMax, savedNicknames, savedMyNickname, savedDeviceNick, savedHostDeviceId, savedMyDeviceId, savedEmergencyContacts, savedMyEmergencyContact] = await Promise.all([
        AsyncStorage.getItem(LOBBY_CODE_KEY),
        AsyncStorage.getItem(LOBBY_NAME_KEY),
        AsyncStorage.getItem(LOBBY_ROLE_KEY),
        AsyncStorage.getItem(LOBBY_MAX_MEMBERS_KEY),
        AsyncStorage.getItem(MEMBER_NICKNAMES_KEY),
        AsyncStorage.getItem(MY_NICKNAME_KEY),
        AsyncStorage.getItem(DEVICE_NICKNAME_KEY),
        AsyncStorage.getItem(HOST_DEVICE_ID_KEY),
        AsyncStorage.getItem(MY_DEVICE_ID_KEY),
        AsyncStorage.getItem(EMERGENCY_CONTACTS_KEY),
        AsyncStorage.getItem(MY_EMERGENCY_CONTACT_KEY),
      ]);

      if (savedCode) {
        setLobbyCodeState(parseInt(savedCode, 10));
        setLobbyName(savedName || '');
        setMaxMembers(savedMax ? parseInt(savedMax, 10) : 10);
        setIsInLobby(true);
        console.log('Loaded persisted lobby:', savedCode);
      }

      const parsedHostId = savedHostDeviceId ? parseInt(savedHostDeviceId, 10) : null;
      const parsedMyId = savedMyDeviceId ? parseInt(savedMyDeviceId, 10) : null;

      if (!isNaN(parsedHostId) && parsedHostId !== null) {
        setHostDeviceId(parsedHostId);
      }

      if (!isNaN(parsedMyId) && parsedMyId !== null) {
        setMyDeviceIdState(parsedMyId);
      }

      if (parsedHostId !== null && parsedMyId !== null && !isNaN(parsedHostId) && !isNaN(parsedMyId)) {
        setIsHost(parsedHostId === parsedMyId);
      } else {
        setIsHost(savedRole === 'host');
      }
      
      if (savedNicknames) {
        setMemberNicknames(JSON.parse(savedNicknames));
      }
      
      if (savedMyNickname) {
        setMyNicknameState(savedMyNickname);
      }
      
      if (savedDeviceNick) {
        setDeviceNicknameState(savedDeviceNick);
      }

      if (savedEmergencyContacts) {
        try {
          setEmergencyContacts(JSON.parse(savedEmergencyContacts));
        } catch (e) {
          setEmergencyContacts({});
        }
      }

      if (savedMyEmergencyContact) {
        try {
          const parsed = JSON.parse(savedMyEmergencyContact);
          if (parsed && typeof parsed === 'object') {
            setMyEmergencyContactState({
              name: (parsed.name || '').toString(),
              phone: (parsed.phone || '').toString(),
            });
          }
        } catch (e) {
          setMyEmergencyContactState({ name: '', phone: '' });
        }
      }
    } catch (error) {
      console.error('Failed to load lobby data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const persistEmergencyContacts = useCallback(async (next) => {
    try {
      await AsyncStorage.setItem(EMERGENCY_CONTACTS_KEY, JSON.stringify(next || {}));
    } catch (error) {
      console.error('Failed to persist emergency contacts:', error);
    }
  }, []);

  const setMyEmergencyContact = useCallback(async (contact) => {
    const next = {
      name: (contact?.name || '').toString(),
      phone: (contact?.phone || '').toString(),
    };
    setMyEmergencyContactState(next);
    try {
      await AsyncStorage.setItem(MY_EMERGENCY_CONTACT_KEY, JSON.stringify(next));
    } catch (error) {
      console.error('Failed to persist my emergency contact:', error);
    }
  }, []);

  const setEmergencyContactForDevice = useCallback(async (deviceId, contact) => {
    if (deviceId === null || deviceId === undefined || Number.isNaN(deviceId)) return;
    const nextContact = {
      name: (contact?.name || '').toString(),
      phone: (contact?.phone || '').toString(),
    };

    setEmergencyContacts(prev => {
      const next = { ...(prev || {}) };
      next[deviceId] = nextContact;
      // Persist best-effort
      persistEmergencyContacts(next);
      return next;
    });
  }, [persistEmergencyContacts]);

  const getEmergencyContactForDevice = useCallback((deviceId) => {
    if (deviceId === null || deviceId === undefined) return null;
    return emergencyContacts?.[deviceId] || null;
  }, [emergencyContacts]);

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
        AsyncStorage.removeItem(HOST_DEVICE_ID_KEY),
        AsyncStorage.removeItem(MY_DEVICE_ID_KEY),
      ]);
    } catch (error) {
      console.error('Failed to clear lobby data:', error);
    }
  };

  const persistRole = useCallback(async (role) => {
    try {
      await AsyncStorage.setItem(LOBBY_ROLE_KEY, role);
    } catch (error) {
      console.error('Failed to persist role:', error);
    }
  }, []);

  const persistHostDeviceId = useCallback(async (deviceId) => {
    try {
      if (deviceId === null || deviceId === undefined) {
        await AsyncStorage.removeItem(HOST_DEVICE_ID_KEY);
      } else {
        await AsyncStorage.setItem(HOST_DEVICE_ID_KEY, String(deviceId));
      }
    } catch (error) {
      console.error('Failed to persist host device id:', error);
    }
  }, []);

  const persistMyDeviceId = useCallback(async (deviceId) => {
    try {
      if (deviceId === null || deviceId === undefined) {
        await AsyncStorage.removeItem(MY_DEVICE_ID_KEY);
      } else {
        await AsyncStorage.setItem(MY_DEVICE_ID_KEY, String(deviceId));
      }
    } catch (error) {
      console.error('Failed to persist my device id:', error);
    }
  }, []);

  const sortByJoinTime = (a, b) => {
    const aJoin = a.joinedAt || Number.MAX_SAFE_INTEGER;
    const bJoin = b.joinedAt || Number.MAX_SAFE_INTEGER;
    if (aJoin !== bJoin) return aJoin - bJoin;
    return (a.deviceId || Number.MAX_SAFE_INTEGER) - (b.deviceId || Number.MAX_SAFE_INTEGER);
  };

  const getNextHostCandidate = (members, excludedDeviceId = null) => {
    const candidates = members
      .filter(m => m.deviceId !== null && m.deviceId !== undefined)
      .filter(m => !m.isOffline)
      .filter(m => m.deviceId !== excludedDeviceId)
      .sort(sortByJoinTime);
    return candidates.length > 0 ? candidates[0].deviceId : null;
  };

  const transferHostToFirstJoined = useCallback(async (excludedDeviceId = null) => {
    let nextHostId = null;

    setLobbyMembers(prev => {
      nextHostId = getNextHostCandidate(prev, excludedDeviceId);
      return prev.map(member => ({
        ...member,
        isHost: nextHostId !== null && member.deviceId === nextHostId,
      }));
    });

    setHostDeviceId(nextHostId);

    if (nextHostId === null || myDeviceId === null) {
      setIsHost(false);
      await persistRole('member');
    } else {
      const amHost = nextHostId === myDeviceId;
      setIsHost(amHost);
      await persistRole(amHost ? 'host' : 'member');
    }

    await persistHostDeviceId(nextHostId);
    return nextHostId;
  }, [myDeviceId, persistHostDeviceId, persistRole]);

  // Create a new lobby (user becomes host)
  const createLobby = useCallback(async (name, maxMemberCount = 10) => {
    const code = generateLobbyCode();
    const now = Date.now();
    
    setLobbyCodeState(code);
    setLobbyName(name);
    setMaxMembers(maxMemberCount);
    setIsHost(true);
    setIsInLobby(true);
    setLobbyMembers([{ id: 'self', name: 'You (Host)', isHost: true, isSelf: true, joinedAt: now, isOffline: false, deviceId: myDeviceId }]);
    
    await persistLobbyData(code, name, 'host', maxMemberCount);
    if (myDeviceId !== null) {
      setHostDeviceId(myDeviceId);
      await persistHostDeviceId(myDeviceId);
    }
    
    console.log(`Created lobby: ${name} with code ${code}`);
    return code;
  }, [myDeviceId, persistHostDeviceId]);

  // Join an existing lobby with code
  const joinLobby = useCallback(async (code, userName = 'Member') => {
    const numericCode = typeof code === 'string' ? parseInt(code, 10) : code;
    const now = Date.now();
    
    if (isNaN(numericCode) || numericCode < 1000 || numericCode > 9999) {
      throw new Error('Invalid lobby code. Must be 4 digits.');
    }
    
    setLobbyCodeState(numericCode);
    setLobbyName(''); // Will be synced from host later
    setMaxMembers(10);
    setIsHost(false);
    setIsInLobby(true);
    setLobbyMembers([{ id: 'self', name: userName, isHost: false, isSelf: true, joinedAt: now, isOffline: false, deviceId: myDeviceId }]);
    setHostDeviceId(null);
    
    await persistLobbyData(numericCode, '', 'member', 10);
    await persistHostDeviceId(null);
    
    console.log(`Joined lobby with code ${numericCode}`);
    return numericCode;
  }, [myDeviceId, persistHostDeviceId]);

  // Send lobby code to ESP32 device via BLE
  const syncLobbyToDevice = useCallback(async (bleCommandFn, targetCode = null) => {
    const codeToSync = targetCode ?? lobbyCode;

    if (!codeToSync) {
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
      const success = await commandFn(`LOBBY:${codeToSync}`);
      if (success) {
        console.log(`Synced lobby code ${codeToSync} to device`);
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
    setHostDeviceId(null);
    setMyDeviceIdState(null);
    setLobbyMembers([]);
    setMemberNicknames({});
    
    await clearPersistedLobby();
    await AsyncStorage.removeItem(MEMBER_NICKNAMES_KEY);
    console.log('Left lobby');
  }, [sendLobbyCommand]);

  const setMyDeviceId = useCallback(async (deviceId) => {
    if (deviceId === null || deviceId === undefined || Number.isNaN(deviceId)) {
      return;
    }

    setMyDeviceIdState(deviceId);
    await persistMyDeviceId(deviceId);

    setLobbyMembers(prev => {
      if (!prev || prev.length === 0) return prev;
      return prev.map(member => member.id === 'self' ? { ...member, deviceId } : member);
    });

    if (isHost && (hostDeviceId === null || hostDeviceId === undefined)) {
      setHostDeviceId(deviceId);
      await persistHostDeviceId(deviceId);
      await persistRole('host');
    } else if (hostDeviceId !== null && hostDeviceId !== undefined) {
      const amHost = hostDeviceId === deviceId;
      setIsHost(amHost);
      await persistRole(amHost ? 'host' : 'member');
    }
  }, [hostDeviceId, isHost, persistHostDeviceId, persistMyDeviceId, persistRole]);

  const registerMemberSync = useCallback(async (deviceId, joinedAt = Date.now(), options = {}) => {
    if (deviceId === null || deviceId === undefined || Number.isNaN(deviceId)) {
      return;
    }

    const safeJoinTime = Number.isFinite(joinedAt) ? joinedAt : Date.now();
    const isSelf = options.isSelf === true;

    setLobbyMembers(prev => {
      const existingIndex = prev.findIndex(m => m.deviceId === deviceId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        const existing = updated[existingIndex];
        updated[existingIndex] = {
          ...existing,
          joinedAt: existing.joinedAt ? Math.min(existing.joinedAt, safeJoinTime) : safeJoinTime,
          isOffline: false,
        };
        return updated;
      }

      return [
        ...prev,
        {
          id: `device-${deviceId}`,
          deviceId,
          name: `Device ${deviceId}`,
          isHost: false,
          isOffline: false,
          joinedAt: safeJoinTime,
          isSelf,
        },
      ];
    });

    if (isSelf) {
      await setMyDeviceId(deviceId);
    }

    if (hostDeviceId === null || hostDeviceId === undefined) {
      await transferHostToFirstJoined();
    }
  }, [hostDeviceId, setMyDeviceId, transferHostToFirstJoined]);

  const setMemberOffline = useCallback(async (deviceId, isOffline = true) => {
    if (deviceId === null || deviceId === undefined || Number.isNaN(deviceId)) {
      return;
    }

    setLobbyMembers(prev => prev.map(member =>
      member.deviceId === deviceId
        ? { ...member, isOffline }
        : member
    ));

    if (isOffline && hostDeviceId === deviceId) {
      await transferHostToFirstJoined(deviceId);
    }
  }, [hostDeviceId, transferHostToFirstJoined]);

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
    let removedDeviceId = null;
    setLobbyMembers(prev => {
      const found = prev.find(m => m.id === memberId);
      removedDeviceId = found?.deviceId ?? null;
      return prev.filter(m => m.id !== memberId);
    });

    if (removedDeviceId !== null && removedDeviceId === hostDeviceId) {
      transferHostToFirstJoined(removedDeviceId);
    }
  }, [hostDeviceId, transferHostToFirstJoined]);

  useEffect(() => {
    if (!isInLobby || myDeviceId === null || hostDeviceId === null) return;
    const amHost = myDeviceId === hostDeviceId;
    setIsHost(amHost);
    persistRole(amHost ? 'host' : 'member');
  }, [hostDeviceId, isInLobby, myDeviceId, persistRole]);

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

  // Set device nickname (local name for connected BLE device)
  const setDeviceNickname = useCallback(async (nickname) => {
    setDeviceNicknameState(nickname);
    try {
      await AsyncStorage.setItem(DEVICE_NICKNAME_KEY, nickname);
    } catch (error) {
      console.error('Failed to save device nickname:', error);
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
    deviceNickname,
    emergencyContacts,
    myEmergencyContact,
    hostDeviceId,
    myDeviceId,
    
    // Actions
    createLobby,
    joinLobby,
    leaveLobby,
    syncLobbyToDevice,
    addMember,
    removeMember,
    setMyDeviceId,
    registerMemberSync,
    setMemberOffline,
    transferHostToFirstJoined,
    registerBleCommandSender,
    
    // Nicknames
    setMemberNickname,
    getMemberNickname,
    setMyNickname,
    setDeviceNickname,
    setMyEmergencyContact,
    setEmergencyContactForDevice,
    getEmergencyContactForDevice,
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
