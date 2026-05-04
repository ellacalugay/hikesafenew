import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const LobbyContext = createContext(null);

// Storage keys
const LOBBY_CODE_KEY = '@hikesafe_lobby_code';
const LOBBY_NAME_KEY = '@hikesafe_lobby_name';
const LOBBY_MAX_MEMBERS_KEY = '@hikesafe_lobby_max_members';
const MEMBER_NICKNAMES_KEY = '@hikesafe_member_nicknames';
const MY_NICKNAME_KEY = '@hikesafe_my_nickname';
const DEVICE_NICKNAME_KEY = '@hikesafe_device_nickname';
const MY_DEVICE_ID_KEY = '@hikesafe_my_device_id';
const EMERGENCY_CONTACTS_KEY = '@hikesafe_emergency_contacts';
const MY_EMERGENCY_CONTACT_KEY = '@hikesafe_my_emergency_contact';
const REMEMBER_KEY = '@hikesafe_remember';
const REMEMBER_USERNAME_KEY = '@hikesafe_remember_username';
const REMEMBER_JOINCODE_KEY = '@hikesafe_remember_joincode';
const REMEMBER_EXPIRY_KEY = '@hikesafe_remember_expiry'; 
const PENDING_DEVICE_LOBBY_SYNC_KEY = '@hikesafe_pending_device_lobby_sync';

const REMEMBER_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

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
  const [isInLobby, setIsInLobby] = useState(false);
  const [lobbyMembers, setLobbyMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [memberNicknames, setMemberNicknames] = useState({}); 
  const [myNickname, setMyNicknameState] = useState('');
  const [deviceNickname, setDeviceNicknameState] = useState(''); 
  const [myDeviceId, setMyDeviceIdState] = useState(null);
  const [sendLobbyCommand, setSendLobbyCommand] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emergencyContacts, setEmergencyContacts] = useState({});
  const [myEmergencyContact, setMyEmergencyContactState] = useState({ name: '', phone: '' });
  const [rememberEnabled, setRememberEnabled] = useState(false);
  const [rememberedUsername, setRememberedUsername] = useState('');
  const [rememberedJoinCode, setRememberedJoinCode] = useState('');
  const [pendingDeviceLobbySyncCode, setPendingDeviceLobbySyncCode] = useState(null);

  // BluetoothContext registers the low-level sender here. Treat sender presence as connection for lobby actions.
  const isConnected = typeof sendLobbyCommand === 'function';
  const sendCommand = useCallback(async (command) => {
    if (!sendLobbyCommand) return false;
    return sendLobbyCommand(command);
  }, [sendLobbyCommand]);

  // Synchronous reference to lobby members to avoid relying on async state updater ordering.
  const lobbyMembersRef = useRef([]);
  useEffect(() => {
    lobbyMembersRef.current = lobbyMembers;
  }, [lobbyMembers]);

  useEffect(() => {
    loadPersistedLobby();
  }, []);

  useEffect(() => {
    const checkExpiry = async () => {
      try {
        const expiry = await AsyncStorage.getItem(REMEMBER_EXPIRY_KEY);
        if (expiry && Date.now() > parseInt(expiry, 10)) {
          await clearRememberStorage();
          setRememberEnabled(false);
          setRememberedUsername('');
          setRememberedJoinCode('');
          console.log('Remember me session expired');
        }
      } catch (e) {
        console.error('Error checking remember me session expiry:', e);
      }
    };

    checkExpiry();
    const interval = setInterval(checkExpiry, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const clearRememberStorage = async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(REMEMBER_KEY),
        AsyncStorage.removeItem(REMEMBER_USERNAME_KEY),
        AsyncStorage.removeItem(REMEMBER_JOINCODE_KEY),
        AsyncStorage.removeItem(REMEMBER_EXPIRY_KEY),
        AsyncStorage.removeItem(PENDING_DEVICE_LOBBY_SYNC_KEY),
      ]);
    } catch (e) {
      console.error('Failed to clear remember storage:', e);
    }
  };

  const loadPersistedLobby = async () => {
    try {
      const [
        savedCode, savedName, savedMax, savedNicknames,
        savedMyNickname, savedDeviceNick, savedMyDeviceId,
        savedEmergencyContacts, savedMyEmergencyContact,
        savedRemember, savedRememberName, savedRememberCode, savedRememberExpiry,
        savedPendingDeviceLobbySync,
      ] = await Promise.all([
        AsyncStorage.getItem(LOBBY_CODE_KEY),
        AsyncStorage.getItem(LOBBY_NAME_KEY),
        AsyncStorage.getItem(LOBBY_MAX_MEMBERS_KEY),
        AsyncStorage.getItem(MEMBER_NICKNAMES_KEY),
        AsyncStorage.getItem(MY_NICKNAME_KEY),
        AsyncStorage.getItem(DEVICE_NICKNAME_KEY),
        AsyncStorage.getItem(MY_DEVICE_ID_KEY),
        AsyncStorage.getItem(EMERGENCY_CONTACTS_KEY),
        AsyncStorage.getItem(MY_EMERGENCY_CONTACT_KEY),
        AsyncStorage.getItem(REMEMBER_KEY),
        AsyncStorage.getItem(REMEMBER_USERNAME_KEY),
        AsyncStorage.getItem(REMEMBER_JOINCODE_KEY),
        AsyncStorage.getItem(REMEMBER_EXPIRY_KEY), 
        AsyncStorage.getItem(PENDING_DEVICE_LOBBY_SYNC_KEY),
      ]);

      if (savedCode) {
        setLobbyCodeState(parseInt(savedCode, 10));
        setLobbyName(savedName || '');
        setMaxMembers(savedMax ? parseInt(savedMax, 10) : 10);
        setIsInLobby(true);
        console.log('Loaded persisted lobby:', savedCode);
      }
      const parsedMyId = savedMyDeviceId ? parseInt(savedMyDeviceId, 10) : null;

      if (!isNaN(parsedMyId) && parsedMyId !== null) {
        setMyDeviceIdState(parsedMyId);
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

      if (savedRemember === '1') {
        const expiry = savedRememberExpiry ? parseInt(savedRememberExpiry, 10) : null;
        if (expiry && Date.now() > expiry) {
          await clearRememberStorage();
          console.log('Remember me session expired on load');
        } else {
          setRememberEnabled(true);
          setRememberedUsername(savedRememberName || '');
          setRememberedJoinCode(savedRememberCode || '');
        }
      }

      if (savedPendingDeviceLobbySync) {
        const parsedPending = parseInt(savedPendingDeviceLobbySync, 10);
        if (!Number.isNaN(parsedPending) && parsedPending >= 1000 && parsedPending <= 9999) {
          setPendingDeviceLobbySyncCode(parsedPending);
        }
      }

    } catch (error) {
      console.error('Failed to load lobby data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setPendingDeviceLobbySync = useCallback(async (code) => {
    const numeric = typeof code === 'string' ? parseInt(code, 10) : code;
    if (Number.isNaN(numeric) || numeric < 1000 || numeric > 9999) return;
    setPendingDeviceLobbySyncCode(numeric);
    try {
      await AsyncStorage.setItem(PENDING_DEVICE_LOBBY_SYNC_KEY, String(numeric));
    } catch {
      // ignore
    }
  }, []);

  const clearPendingDeviceLobbySync = useCallback(async () => {
    setPendingDeviceLobbySyncCode(null);
    try {
      await AsyncStorage.removeItem(PENDING_DEVICE_LOBBY_SYNC_KEY);
    } catch {
      // ignore
    }
  }, []);

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
        AsyncStorage.removeItem(LOBBY_MAX_MEMBERS_KEY),
        AsyncStorage.removeItem(MY_DEVICE_ID_KEY),
        AsyncStorage.removeItem(REMEMBER_KEY),
        AsyncStorage.removeItem(REMEMBER_USERNAME_KEY),
        AsyncStorage.removeItem(REMEMBER_JOINCODE_KEY),
        AsyncStorage.removeItem(PENDING_DEVICE_LOBBY_SYNC_KEY),
      ]);
    } catch (error) {
      console.error('Failed to clear lobby data:', error);
    }
  };

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

  const persistRememberSettings = useCallback(async (enabled, name = '', code = '') => {
    try {
      if (enabled) {
        const expiry = (Date.now() + REMEMBER_SESSION_DURATION_MS).toString();
        await AsyncStorage.setItem(REMEMBER_KEY, '1');
        await AsyncStorage.setItem(REMEMBER_USERNAME_KEY, name || '');
        await AsyncStorage.setItem(REMEMBER_JOINCODE_KEY, code || '');
        await AsyncStorage.setItem(REMEMBER_EXPIRY_KEY, expiry); 
      } else {
        await clearRememberStorage(); 
      }
    } catch (e) {
      console.error('Failed to persist remember settings:', e);
    }
  }, []);

  const setRememberEnabledFn = useCallback(async (enabled) => {
    setRememberEnabled(Boolean(enabled));
    if (!enabled) {
      setRememberedUsername('');
      setRememberedJoinCode('');
    }
    await persistRememberSettings(Boolean(enabled), rememberedUsername, rememberedJoinCode);
  }, [persistRememberSettings, rememberedUsername, rememberedJoinCode]);

  const saveRememberData = useCallback(async (name, code) => {
    setRememberedUsername(name || '');
    setRememberedJoinCode(code || '');
    if (rememberEnabled) {
      await persistRememberSettings(true, name, code);
    }
  }, [persistRememberSettings, rememberEnabled]);

  const clearRememberData = useCallback(async () => {
    setRememberEnabled(false);
    setRememberedUsername('');
    setRememberedJoinCode('');
    await clearRememberStorage();
  }, []);

  // Create a new lobby
  const createLobby = useCallback(async (name, max = 10) => {
    const code = generateLobbyCode();
    const now = Date.now();
    
    setLobbyCodeState(code);
    setLobbyName(name);
    setMaxMembers(max);
    setIsInLobby(true);
    
    const userName = myNickname || 'Host';
    setLobbyMembers([{ 
      id: 'self', 
      name: userName, 
      isSelf: true, 
      joinedAt: now, 
      isOffline: false,
      deviceId: myDeviceId
    }]);

    await persistLobbyData(code, name, 'member', max);
    
    console.log(`Created lobby ${name} with code ${code}`);
    return code;
  }, [myDeviceId, myNickname]);

  // Create a new lobby without requiring a device connection
  const createLobbyWithoutDevice = useCallback(async (name, maxMembers = 10) => {
    try {
      const code = generateLobbyCode();
      setLobbyCodeState(code);
      setLobbyName(name);
      setMaxMembers(maxMembers);
      setIsHost(true);
      setIsInLobby(true);

      await AsyncStorage.multiSet([
        [LOBBY_CODE_KEY, String(code)],
        [LOBBY_NAME_KEY, name],
        [LOBBY_MAX_MEMBERS_KEY, String(maxMembers)],
        [LOBBY_ROLE_KEY, 'host'],
      ]);

      console.log(`Lobby created without device: ${name} (Code: ${code})`);
    } catch (error) {
      console.error('Failed to create lobby without device:', error);
    }
  }, []);

  // Join an existing lobby with code
  const joinLobby = useCallback(async (code, userName = 'Member') => {
    const numericCode = typeof code === 'string' ? parseInt(code, 10) : code;
    const now = Date.now();
    
    if (isNaN(numericCode) || numericCode < 1000 || numericCode > 9999) {
      throw new Error('Invalid lobby code. Must be 4 digits.');
    }

    // Switching/joining should not carry nicknames from a previous lobby.
    setMemberNicknames({});
    try {
      await AsyncStorage.removeItem(MEMBER_NICKNAMES_KEY);
    } catch {
      // ignore
    }
    
    setLobbyCodeState(numericCode);
    setLobbyName(''); // Will be synced from host later
    setMaxMembers(10);
    setIsInLobby(true);
    setLobbyMembers([{ id: 'self', name: userName, isSelf: true, joinedAt: now, isOffline: false, deviceId: myDeviceId }]);
    
    await persistLobbyData(numericCode, '', 'member', 10);
    
    console.log(`Joined lobby with code ${numericCode}`);
    return numericCode;
  }, [myDeviceId]);

    // Sync lobby code to ESP32 device via BLE
    // "Lobby" is treated as a simple 4-digit channel selector.
    // Sync is best-effort: if BLE isn't available yet, we persist a pending sync code and retry on reconnect.
    const syncLobbyToDevice = useCallback(async (bleCommandFn, targetCode = null) => {
      const codeToSync = targetCode ?? lobbyCode;

      if (codeToSync === null || codeToSync === undefined) {
        return false;
      }

      const numeric = typeof codeToSync === 'string' ? parseInt(codeToSync, 10) : Number(codeToSync);
      if (Number.isNaN(numeric)) {
        return false;
      }

      const commandFn = bleCommandFn || sendLobbyCommand;
      if (!commandFn) {
        // No BLE sender yet (not connected). Remember for later.
        if (numeric >= 1000 && numeric <= 9999) {
          await setPendingDeviceLobbySync(numeric);
        }
        return false;
      }

      try {
        // Special case: LOBBY:0 clears the device filter.
        const cmd = (numeric === 0) ? 'LOBBY:0' : `LOBBY:${numeric}`;
        const success = await commandFn(cmd);

        if (success) {
          await clearPendingDeviceLobbySync();
        } else {
          if (numeric >= 1000 && numeric <= 9999) {
            await setPendingDeviceLobbySync(numeric);
          }
        }

        return success;
      } catch (error) {
        if (numeric >= 1000 && numeric <= 9999) {
          await setPendingDeviceLobbySync(numeric);
        }
        return false;
      }
    }, [clearPendingDeviceLobbySync, lobbyCode, sendLobbyCommand, setPendingDeviceLobbySync]);

  // Leave current lobby
  // Multi-phone safe: clears local state only (does not change the device lobby/channel).
  const leaveLobby = useCallback(async () => {
    setLobbyCodeState(null);
    setLobbyName('');
    setIsInLobby(false);
    setMyDeviceIdState(null);
    setLobbyMembers([]);
    setMemberNicknames({});
    setPendingDeviceLobbySyncCode(null);
    setRememberEnabled(false);
    setRememberedUsername('');
    setRememberedJoinCode('');

    await clearPersistedLobby();
    await AsyncStorage.removeItem(MEMBER_NICKNAMES_KEY);
    await AsyncStorage.removeItem(PENDING_DEVICE_LOBBY_SYNC_KEY);

    console.log('Left lobby');
  }, [clearPersistedLobby]);

  const clearAccount = useCallback(async () => {
    // Best-effort: clear lobby filter on device
    if (sendLobbyCommand) {
      try {
        // IMPORTANT: Do NOT clear device lobby here.
        // Account reset should only affect this phone; the LoRa device lobby is shared.
        // await sendLobbyCommand('LOBBY:0');
      } catch (e) {
        console.log('Could not clear device lobby during account reset:', e);
      }
    }

    setLobbyCodeState(null);
    setLobbyName('');
    setMaxMembers(10);
    setIsInLobby(false);
    setMyDeviceIdState(null);
    setLobbyMembers([]);
    setMemberNicknames({});
    setMyNicknameState('');
    setDeviceNicknameState('');
    setEmergencyContacts({});
    setMyEmergencyContactState({ name: '', phone: '' });
    setRememberEnabled(false);
    setRememberedUsername('');
    setRememberedJoinCode('');

    try {
      await Promise.all([
        AsyncStorage.removeItem(LOBBY_CODE_KEY),
        AsyncStorage.removeItem(LOBBY_NAME_KEY),
        AsyncStorage.removeItem(LOBBY_MAX_MEMBERS_KEY),
        AsyncStorage.removeItem(MEMBER_NICKNAMES_KEY),
        AsyncStorage.removeItem(MY_NICKNAME_KEY),
        AsyncStorage.removeItem(DEVICE_NICKNAME_KEY),
        AsyncStorage.removeItem(MY_DEVICE_ID_KEY),
        AsyncStorage.removeItem(EMERGENCY_CONTACTS_KEY),
        AsyncStorage.removeItem(MY_EMERGENCY_CONTACT_KEY),
        AsyncStorage.removeItem(REMEMBER_KEY),
        AsyncStorage.removeItem(REMEMBER_USERNAME_KEY),
        AsyncStorage.removeItem(REMEMBER_JOINCODE_KEY),
        AsyncStorage.removeItem(REMEMBER_EXPIRY_KEY),
      ]);
    } catch (error) {
      console.error('Failed to clear account lobby data:', error);
    }
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
  }, [persistMyDeviceId]);

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
          isOffline: false,
          joinedAt: safeJoinTime,
          isSelf,
        },
      ];
    });

    if (isSelf) {
      await setMyDeviceId(deviceId);
    }
  }, [setMyDeviceId]);

  const setMemberOffline = useCallback(async (deviceId, isOffline = true) => {
    if (deviceId === null || deviceId === undefined || Number.isNaN(deviceId)) {
      return;
    }

    setLobbyMembers(prev => prev.map(member =>
      member.deviceId === deviceId
        ? { ...member, isOffline }
        : member
    ));
  }, []);

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
    // Also update lobbyMembers display name so member lists reflect the nickname immediately
    setLobbyMembers(prev => prev.map(m => (m && m.deviceId === deviceId ? { ...m, name: nickname } : m)));
    try {
      await AsyncStorage.setItem(MEMBER_NICKNAMES_KEY, JSON.stringify(newNicknames));
    } catch (error) {
      console.error('Failed to save nickname:', error);
    }
  }, [memberNicknames]);

  // Get nickname for a device (returns deviceId if no nickname set)
  const getMemberNickname = useCallback((deviceId) => {
    if (deviceId === null || deviceId === undefined) return '';
    // Prefer our own stored nickname when asked for our device id
    if (deviceId === myDeviceId && (myNickname || '').trim().length > 0) {
      return myNickname;
    }
    return memberNicknames[deviceId] || `Device ${deviceId}`;
  }, [memberNicknames, myDeviceId, myNickname]);

  // Set your own nickname
  const setMyNickname = useCallback(async (nickname) => {
    setMyNicknameState(nickname);
    try {
      await AsyncStorage.setItem(MY_NICKNAME_KEY, nickname);
    } catch (error) {
      console.error('Failed to save my nickname:', error);
    }

    // Also ensure our device id maps to the nickname in the member map
    // so components using getMemberNickname() will show the correct name
    if (myDeviceId !== null && myDeviceId !== undefined && (nickname || '').trim().length > 0) {
      try {
        // setMemberNickname persists into storage as well
        setMemberNickname(myDeviceId, nickname);
      } catch (e) {
        // best-effort, ignore errors here
      }
    }
  }, [myDeviceId, setMemberNickname]);

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
    isInLobby,
    lobbyMembers,
    isLoading,
    memberNicknames,
    myNickname,
    deviceNickname,
    emergencyContacts,
    myEmergencyContact,
    myDeviceId,
    rememberEnabled,
    rememberedUsername,
    rememberedJoinCode,
    pendingDeviceLobbySyncCode,
    
    createLobby,
    joinLobby,
    leaveLobby,
    syncLobbyToDevice,
    setPendingDeviceLobbySync,
    clearPendingDeviceLobbySync,
    addMember,
    removeMember,
    setMyDeviceId,
    registerMemberSync,
    setMemberOffline,
    registerBleCommandSender,
    
    setMemberNickname,
    getMemberNickname,
    setMyNickname,
    setDeviceNickname,
    setMyEmergencyContact,
    setEmergencyContactForDevice,
    getEmergencyContactForDevice,
    clearNicknames,
    setRememberEnabled: setRememberEnabledFn,
    saveRememberData,
    clearRememberData,
    clearAccount,
    generateLobbyCode,
    createLobbyWithoutDevice,
  };

  return (
    <LobbyContext.Provider value={value}>
      {children}
    </LobbyContext.Provider>
  );
};

export default LobbyContext;