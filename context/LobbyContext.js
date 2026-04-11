import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

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
const PREFERRED_HOST_DEVICE_ID_KEY = '@hikesafe_preferred_host_device_id';
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
  const [isHost, setIsHost] = useState(false);
  const [isInLobby, setIsInLobby] = useState(false);
  const [lobbyMembers, setLobbyMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [memberNicknames, setMemberNicknames] = useState({}); 
  const [myNickname, setMyNicknameState] = useState('');
  const [deviceNickname, setDeviceNicknameState] = useState(''); 
  const [hostDeviceId, setHostDeviceId] = useState(null);
  // The "primary" admin/host we prefer whenever they're online.
  // Auto-failover will temporarily pick another host, but when preferred rejoins,
  // they reclaim admin automatically.
  const [preferredHostDeviceId, setPreferredHostDeviceId] = useState(null);
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
        savedCode, savedName, savedRole, savedMax, savedNicknames,
        savedMyNickname, savedDeviceNick, savedHostDeviceId, savedMyDeviceId,
        savedPreferredHostDeviceId,
        savedEmergencyContacts, savedMyEmergencyContact,
        savedRemember, savedRememberName, savedRememberCode, savedRememberExpiry,
        savedPendingDeviceLobbySync,
      ] = await Promise.all([
        AsyncStorage.getItem(LOBBY_CODE_KEY),
        AsyncStorage.getItem(LOBBY_NAME_KEY),
        AsyncStorage.getItem(LOBBY_ROLE_KEY),
        AsyncStorage.getItem(LOBBY_MAX_MEMBERS_KEY),
        AsyncStorage.getItem(MEMBER_NICKNAMES_KEY),
        AsyncStorage.getItem(MY_NICKNAME_KEY),
        AsyncStorage.getItem(DEVICE_NICKNAME_KEY),
        AsyncStorage.getItem(HOST_DEVICE_ID_KEY),
        AsyncStorage.getItem(MY_DEVICE_ID_KEY),
        AsyncStorage.getItem(PREFERRED_HOST_DEVICE_ID_KEY),
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

      const parsedHostId = savedHostDeviceId ? parseInt(savedHostDeviceId, 10) : null;
      const parsedMyId = savedMyDeviceId ? parseInt(savedMyDeviceId, 10) : null;
      const parsedPreferredHostId = savedPreferredHostDeviceId ? parseInt(savedPreferredHostDeviceId, 10) : null;

      if (!isNaN(parsedHostId) && parsedHostId !== null) {
        setHostDeviceId(parsedHostId);
      }

      if (!isNaN(parsedPreferredHostId) && parsedPreferredHostId !== null) {
        setPreferredHostDeviceId(parsedPreferredHostId);
      } else if (!isNaN(parsedHostId) && parsedHostId !== null) {
        // Back-compat: if we only had a host stored, treat it as the preferred host.
        setPreferredHostDeviceId(parsedHostId);
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
        AsyncStorage.removeItem(PREFERRED_HOST_DEVICE_ID_KEY),
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

  const persistPreferredHostDeviceId = useCallback(async (deviceId) => {
    try {
      if (deviceId === null || deviceId === undefined) {
        await AsyncStorage.removeItem(PREFERRED_HOST_DEVICE_ID_KEY);
      } else {
        await AsyncStorage.setItem(PREFERRED_HOST_DEVICE_ID_KEY, String(deviceId));
      }
    } catch (error) {
      console.error('Failed to persist preferred host device id:', error);
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

  const recalculateHost = useCallback(async (preferredId = null, excludedDeviceId = null) => {
    const currentMembers = lobbyMembersRef.current;

    const preferredOnline = preferredId !== null && preferredId !== undefined
      ? currentMembers.some(m => m && m.deviceId === preferredId && !m.isOffline && m.deviceId !== excludedDeviceId)
      : false;

    const nextHostId = preferredOnline ? preferredId : getNextHostCandidate(currentMembers, excludedDeviceId);
    const shouldPersistPreferred = (preferredId === null || preferredId === undefined) && nextHostId !== null;

    setLobbyMembers(prev => prev.map(member => ({
      ...member,
      isHost: nextHostId !== null && member.deviceId === nextHostId,
    })));

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

    if (shouldPersistPreferred) {
      setPreferredHostDeviceId(nextHostId);
      await persistPreferredHostDeviceId(nextHostId);
    }

    return nextHostId;
  }, [myDeviceId, persistHostDeviceId, persistPreferredHostDeviceId, persistRole]);

  const transferHostToFirstJoined = useCallback(async (excludedDeviceId = null) => {
    return recalculateHost(preferredHostDeviceId, excludedDeviceId);
  }, [preferredHostDeviceId, recalculateHost]);

  const electNewHost = useCallback(async (deviceId) => {
    if (!isHost) return false;
    if (deviceId === null || deviceId === undefined || Number.isNaN(deviceId)) return false;

    setPreferredHostDeviceId(deviceId);
    await persistPreferredHostDeviceId(deviceId);

    // Recalculate immediately using the new preference so the new admin takes effect.
    await recalculateHost(deviceId, null);
    return true;
  }, [isHost, persistPreferredHostDeviceId, recalculateHost]);

    // Create a new lobby (user becomes host)
  const createLobby = useCallback(async (name, max = 10) => {
    const code = generateLobbyCode();
    const now = Date.now();
    
    setLobbyCodeState(code);
    setLobbyName(name);
    setMaxMembers(max);
    setIsHost(true);
    setIsInLobby(true);
    
    const userName = myNickname || 'Host';
    setLobbyMembers([{ 
      id: 'self', 
      name: userName, 
      isHost: true, 
      isSelf: true, 
      joinedAt: now, 
      isOffline: false,
      deviceId: myDeviceId
    }]);
    
    setHostDeviceId(myDeviceId);
    setPreferredHostDeviceId(myDeviceId);
    
    await persistLobbyData(code, name, 'host', max);
    if (myDeviceId !== null) {
      await persistHostDeviceId(myDeviceId);
      await persistPreferredHostDeviceId(myDeviceId);
    }
    
    console.log(`Created lobby ${name} with code ${code}`);
    return code;
  }, [myDeviceId, myNickname, persistHostDeviceId, persistPreferredHostDeviceId]);

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
    setIsHost(false);
    setIsInLobby(true);
    setLobbyMembers([{ id: 'self', name: userName, isHost: false, isSelf: true, joinedAt: now, isOffline: false, deviceId: myDeviceId }]);
    setHostDeviceId(null);
    setPreferredHostDeviceId(null);
    
    await persistLobbyData(numericCode, '', 'member', 10);
    await persistHostDeviceId(null);
    await persistPreferredHostDeviceId(null);
    
    console.log(`Joined lobby with code ${numericCode}`);
    return numericCode;
  }, [myDeviceId, persistHostDeviceId, persistPreferredHostDeviceId]);

    // Sync lobby code to ESP32 device via BLE
  const syncLobbyToDevice = useCallback(async (bleCommandFn, targetCode = null, options = null) => {
    const codeToSync = targetCode ?? lobbyCode;
    const asHost = !!options?.asHost;

    if (!codeToSync) {
      // If we are trying to sync but have no code, we should probably be in state 0
      return false;
    }
    
    const commandFn = bleCommandFn || sendLobbyCommand;
    if (!commandFn) return false;
    
    try {
      const cmd = asHost ? `CREATE_LOBBY:${codeToSync}` : `LOBBY:${codeToSync}`;
      const success = await commandFn(cmd);
      
      if (success) {
        await clearPendingDeviceLobbySync();
      } else {
        // If it failed (e.g. device said LOBBY_EXISTS), we need to check if it's the SAME code
        // and if so, we can consider that a success for the app's state.
        await setPendingDeviceLobbySync(codeToSync);
      }
      return success;
    } catch (error) {
      await setPendingDeviceLobbySync(codeToSync);
      return false;
    }
  }, [clearPendingDeviceLobbySync, lobbyCode, sendLobbyCommand, setPendingDeviceLobbySync]);

    // Leave current lobby
    const leaveLobby = useCallback(async () => {
      // 1. Tell the physical device to reset this phone's session
      if (sendLobbyCommand) {
        try {
          // Use the token to tell the hardware ONLY this phone is leaving
          const token = await AsyncStorage.getItem('@hikesafe_phone_token');
          await sendLobbyCommand(`LEAVE_LOBBY:${token}`);
        } catch (e) {
          console.log('Device leave command failed:', e);
        }
      }
    
      // 2. Clear all local state immediately
      setLobbyCodeState(null);
      setLobbyName('');
      setIsHost(false);
      setIsInLobby(false);
      setHostDeviceId(null);
      setPreferredHostDeviceId(null);
      setMyDeviceIdState(null);
      setLobbyMembers([]);
      setPendingDeviceLobbySyncCode(null);
    
      // 3. Wipe all persistence
      await clearPersistedLobby();
      await AsyncStorage.removeItem(MEMBER_NICKNAMES_KEY);
      await AsyncStorage.removeItem(PENDING_DEVICE_LOBBY_SYNC_KEY);
    
      console.log('Lobby memory cleared successfully for this member');
    }, [sendLobbyCommand, clearPersistedLobby]);

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
    setIsHost(false);
    setIsInLobby(false);
    setHostDeviceId(null);
    setPreferredHostDeviceId(null);
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
        AsyncStorage.removeItem(LOBBY_ROLE_KEY),
        AsyncStorage.removeItem(LOBBY_MAX_MEMBERS_KEY),
        AsyncStorage.removeItem(MEMBER_NICKNAMES_KEY),
        AsyncStorage.removeItem(MY_NICKNAME_KEY),
        AsyncStorage.removeItem(DEVICE_NICKNAME_KEY),
        AsyncStorage.removeItem(HOST_DEVICE_ID_KEY),
        AsyncStorage.removeItem(PREFERRED_HOST_DEVICE_ID_KEY),
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
    } else if (preferredHostDeviceId !== null && preferredHostDeviceId !== undefined && deviceId === preferredHostDeviceId) {
      // Preferred admin rejoined: reclaim admin.
      await recalculateHost(preferredHostDeviceId, null);
    }
  }, [hostDeviceId, preferredHostDeviceId, recalculateHost, setMyDeviceId, transferHostToFirstJoined]);

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
    } else if (!isOffline && preferredHostDeviceId !== null && preferredHostDeviceId !== undefined && deviceId === preferredHostDeviceId) {
      // Preferred admin came back online: reclaim admin.
      await recalculateHost(preferredHostDeviceId, null);
    }
  }, [hostDeviceId, preferredHostDeviceId, recalculateHost, transferHostToFirstJoined]);

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
    const found = lobbyMembersRef.current.find(m => m && m.id === memberId);
    const removedDeviceId = found?.deviceId ?? null;

    setLobbyMembers(prev => prev.filter(m => m.id !== memberId));

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

  const checkExistingLobby = useCallback(async () => {
    if (!isConnected) {
      Alert.alert(
        'Device Required',
        'You must connect to your HikeSafe device to check for existing lobbies.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      const response = await sendCommand('QUERY_LOBBY');
      if (response.startsWith('ERROR:')) {
        Alert.alert('Error', 'Failed to retrieve lobby information.');
        return;
      }

      const [status, code, creator] = response.split(',');
      if (status === 'LOBBY_EXISTS') {
        Alert.alert(
          'Lobby Exists',
          `A lobby already exists with code ${code}, created by ${creator}. Please leave the current lobby before creating a new one.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('No Lobby', 'No existing lobby found.');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to check for existing lobby: ${error.message}`);
    }
  }, [isConnected, sendCommand]);

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
    preferredHostDeviceId,
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
    transferHostToFirstJoined,
    electNewHost,
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
  };

  return (
    <LobbyContext.Provider value={value}>
      {children}
    </LobbyContext.Provider>
  );
};

export default LobbyContext;