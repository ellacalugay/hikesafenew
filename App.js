import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Modal,
  Image,
  ImageBackground,
  Dimensions,
  Animated,
  StatusBar,
  Platform,
  Switch, 
  Alert,
  ActivityIndicator,
  Vibration,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
// IMPORTANT: Make sure you have installed these packages: 
// npx expo install expo-location expo-sensors @react-native-async-storage/async-storage
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
// BLE imports - enable for native build (expo prebuild)
import bleService, { BLE_CODES } from './src/services/BleService';

import { 
  Trees, 
  MapPin, 
  MessageCircle, 
  Compass, 
  User, 
  Home, 
  Settings, 
  LogOut, 
  AlertTriangle, 
  CheckCircle, 
  ChevronRight,
  ChevronLeft,
  Menu,
  Send,
  HelpCircle,
  AlertOctagon,
  Wifi,
  WifiOff,
  RefreshCw,
  Bell,
  BellOff,
  X,
  Camera,
  Mail,
  Phone,
  Shield,
  Info,
  FileText,
  MessageSquare,
  Navigation,
} from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

// ====== STORAGE KEYS ======
const STORAGE_KEYS = {
  REMEMBER_ME: '@hikesafe_remember_me',
  SAVED_USERNAME: '@hikesafe_saved_username',
  SAVED_GROUP_ID: '@hikesafe_saved_group_id',
  USER_PROFILE: '@hikesafe_user_profile',
  SETTINGS: '@hikesafe_settings',
  NOTIFICATIONS: '@hikesafe_notifications',
};

// ====== NOTIFICATION CONTEXT ======
const NotificationContext = createContext(null);

const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    return { notifications: [], addNotification: () => {}, clearNotification: () => {}, unreadCount: 0 };
  }
  return context;
};

// ====== LORA CONTEXT (Integrated) ======
const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  SCANNING: 'scanning',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
};

const LoRaContext = createContext(null);

const useLoRa = () => {
  const context = useContext(LoRaContext);
  if (!context) {
    throw new Error('useLoRa must be used within a LoRaProvider');
  }
  return context;
};

// --- THEME CONSTANTS ---
const COLORS = {
  primary: '#4d7c0f', // Forest Green
  primaryLight: '#65a30d',
  accent: '#a3e635', // Lime
  background: '#f7fee7', // Mist
  textDark: '#1a2e05',
  textLight: '#ffffff',
  gray: '#9ca3af',
  cardBg: 'rgba(255, 255, 255, 0.9)',
  error: '#dc2626', // Red for errors/logout
};

// --- SHARED COMPONENTS ---

// 1. Nature Background Container
const ScreenContainer = ({ children }) => (
  <View style={styles.container}>
    <StatusBar barStyle="dark-content" />
    <LinearGradient
      colors={['#ecfccb', '#ffffff']}
      style={styles.backgroundGradient}
    />
    {/* Abstract Tree/Mountain Shapes */}
    <View style={styles.bgTreeLeft} />
    <View style={styles.bgTreeRight} />
    <View style={styles.bgMountain} />
    
    <SafeAreaView style={styles.safeArea}>
      {children}
    </SafeAreaView>
  </View>
);

// 2. Custom Button
const MainButton = ({ title, onPress, variant = 'primary', style }) => (
  <TouchableOpacity 
    style={[
      styles.button, 
      variant === 'outline' ? styles.buttonOutline : styles.buttonPrimary,
      style
    ]} 
    onPress={onPress}
  >
    <Text style={[
      styles.buttonText, 
      variant === 'outline' ? styles.buttonTextOutline : styles.buttonTextPrimary
    ]}>
      {title}
    </Text>
  </TouchableOpacity>
);

// 3. Custom Input
const InputField = ({ label, placeholder, value, onChangeText, secureTextEntry, keyboardType, error, maxLength }) => (
  <View style={styles.inputContainer}>
    {label && <Text style={[styles.inputLabel, error ? { color: '#ef4444' } : null]}>{label}</Text>}
    <TextInput
      style={[styles.input, error ? styles.inputError : null]}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      maxLength={maxLength}
    />
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
  </View>
);

// --- SCREENS ---//

// 1. ONBOARDING: NAME
const OnboardingName = ({ next, onSaveName }) => {
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!nickname.trim()) newErrors.nickname = 'Nickname is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      const displayName = nickname.trim() || `${firstName.trim()} ${lastName.trim()}`;
      onSaveName?.({ firstName: firstName.trim(), lastName: lastName.trim(), nickname: nickname.trim(), displayName });
      next();
    }
  };

  return (
    <View style={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom + 20, 40) }]}>
      <View style={styles.headerSpacer} />
      <Text style={styles.titleLarge}>
        What do we{'\n'}call you?
      </Text>
    
      <View style={[styles.formSection, styles.centeredForm, { top: 50 }]}>
        <InputField 
          label="First Name *" 
          placeholder="e.g. John" 
          value={firstName}
          onChangeText={(text) => { setFirstName(text); setErrors(prev => ({...prev, firstName: ''})); }}
          error={errors.firstName}
        />
        <InputField 
          label="Last Name *" 
          placeholder="e.g. Doe"
          value={lastName}
          onChangeText={(text) => { setLastName(text); setErrors(prev => ({...prev, lastName: ''})); }}
          error={errors.lastName}
        />
        <InputField 
          label="Nickname *" 
          placeholder="e.g. JD"
          value={nickname}
          onChangeText={(text) => { setNickname(text); setErrors(prev => ({...prev, nickname: ''})); }}
          error={errors.nickname}
        />
      </View>

      <View style={styles.illustrationSpace}>
         <Trees size={120} color={COLORS.primary} style={{opacity: 0.5}} />
      </View>

      <View style={styles.footer}>
        <MainButton title="NEXT" onPress={handleNext} />
      </View>
    </View>
  );
};

// 0. INITIALIZATION SCREEN (BLE Connect to LoRa device)
const Initialization = ({ onConnected, loraContext }) => {
  const insets = useSafeAreaInsets();
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [devices, setDevices] = useState([]);
  const [statusText, setStatusText] = useState('Scanning for devices...');
  const [useMockDevices, setUseMockDevices] = useState(false); // Toggle for testing without real devices

  // Auto-scan on mount
  useEffect(() => {
    scanForDevices();
  }, []);

  const scanForDevices = async () => {
    setIsScanning(true);
    setStatusText('Scanning for devices...');
    setSelectedDevice(null);
    setDevices([]);
    
    try {
      if (useMockDevices) {
        // Mock devices for UI testing without real hardware
        await new Promise(resolve => setTimeout(resolve, 2500));
        const mockDevices = [
          { id: 'mock1', name: 'HikeSafe_102D', rssi: -45 },
          { id: 'mock2', name: 'HikeSafe_143J', rssi: -72 },
          { id: 'mock3', name: 'HikeSafe_722R', rssi: -55 },
        ];
        setDevices(mockDevices);
        setStatusText(mockDevices.length > 0 ? 'Select a device to connect' : 'No devices found');
      } else {
        // Real BLE scanning
        const scannedDevices = await bleService.scanOnce(8000);
        const deviceList = scannedDevices.map((d, idx) => ({
          id: d.id,
          name: d.name || `Unknown Device ${idx + 1}`,
          rssi: d.rssi || -100,
          device: d, // Keep reference to original device object
        }));
        setDevices(deviceList);
        setStatusText(deviceList.length > 0 ? 'Select a device to connect' : 'No devices found');
      }
    } catch (error) {
      console.log('Scan error:', error);
      setStatusText('Scan failed - check Bluetooth');
    }
    
    setIsScanning(false);
  };

  const handleConnect = async () => {
    if (!selectedDevice) {
      Alert.alert('No Device Selected', 'Please select a device to connect.');
      return;
    }
    
    const deviceInfo = devices.find(d => d.id === selectedDevice);
    if (!deviceInfo) return;
    
    setIsConnecting(true);
    setStatusText(`Connecting to ${deviceInfo.name}...`);
    
    try {
      let success = false;
      
      if (useMockDevices) {
        // Mock connection for UI testing
        await new Promise(resolve => setTimeout(resolve, 2000));
        success = true;
      } else {
        // Real BLE connection
        success = await bleService.connectToDevice(deviceInfo.device);
      }
      
      if (success) {
        // Update LoRa context with connected device
        if (loraContext) {
          loraContext.setConnectedDevice(deviceInfo);
          loraContext.setConnectionState(CONNECTION_STATES.CONNECTED);
        }
        
        setIsConnecting(false);
        onConnected?.(deviceInfo);
      } else {
        setStatusText('Connection failed. Try again.');
        setIsConnecting(false);
        Alert.alert('Connection Failed', 'Could not connect to the device. Please try again.');
      }
    } catch (error) {
      console.log('Connection error:', error);
      setStatusText('Connection error');
      setIsConnecting(false);
      Alert.alert('Connection Error', 'An error occurred while connecting. Please try again.');
    }
  };

  return (
    <ImageBackground
      source={require('./assets/intbg.png')}
      style={initStyles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={[initStyles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {/* Logo */}
        <View style={initStyles.logoContainer}>
          <Image 
            source={require('./assets/logoname.png')} 
            style={initStyles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Device Image */}
        <View style={initStyles.deviceImageContainer}>
          <Image 
            source={require('./assets/lilygo.png')} 
            style={initStyles.deviceImage}
            resizeMode="contain"
          />
        </View>

        {/* Status Text */}
        <View style={initStyles.statusContainer}>
          <Text style={initStyles.statusLabel}>Long Range Device</Text>
          <View style={initStyles.statusRow}>
            {(isScanning || isConnecting) && (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 8 }} />
            )}
            <Text style={initStyles.statusTitle}>{statusText}</Text>
          </View>
        </View>

        {/* Device List Card */}
        <View style={[initStyles.deviceListCard, { marginBottom: Math.max(insets.bottom + 20, 60) }]}>
          {/* Refresh Button */}
          <TouchableOpacity 
            style={initStyles.refreshButton} 
            onPress={scanForDevices}
            disabled={isScanning || isConnecting}
          >
            <RefreshCw size={18} color={isScanning ? COLORS.gray : COLORS.primary} />
            <Text style={[initStyles.refreshText, isScanning && { color: COLORS.gray }]}>
              {isScanning ? 'Scanning...' : 'Rescan'}
            </Text>
          </TouchableOpacity>

          <ScrollView style={initStyles.deviceList} showsVerticalScrollIndicator={false}>
            {devices.length === 0 && !isScanning ? (
              <View style={initStyles.emptyState}>
                <WifiOff size={40} color={COLORS.gray} />
                <Text style={initStyles.emptyText}>No devices found</Text>
                <Text style={initStyles.emptySubtext}>Make sure your LoRa device is powered on</Text>
              </View>
            ) : (
              devices.map((device) => (
                <TouchableOpacity
                  key={device.id}
                  style={[
                    initStyles.deviceItem,
                    selectedDevice === device.id && initStyles.deviceItemSelected
                  ]}
                  onPress={() => !isConnecting && setSelectedDevice(device.id)}
                  disabled={isConnecting}
                >
                  <View style={initStyles.deviceInfo}>
                    <Text style={initStyles.deviceName}>{device.name}</Text>
                    <Text style={initStyles.deviceRssi}>Signal: {device.rssi} dBm</Text>
                  </View>
                  <View style={[
                    initStyles.statusDot,
                    { backgroundColor: device.online ? '#22c55e' : '#ef4444' }
                  ]} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* Connect Button */}
          <TouchableOpacity 
            style={[
              initStyles.connectButton,
              !selectedDevice && !isConnecting && initStyles.connectButtonDisabled,
              isConnecting && initStyles.connectButtonConnecting
            ]} 
            onPress={handleConnect}
            disabled={!selectedDevice || isConnecting}
          >
            {isConnecting ? (
              <View style={initStyles.connectingRow}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={initStyles.connectingText}>Connecting...</Text>
              </View>
            ) : (
              <Text style={[
                initStyles.connectButtonText,
                !selectedDevice && { color: COLORS.gray }
              ]}>CONNECT</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
};

// Styles for Initialization screen
const initStyles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  logoContainer: {
    marginTop: 50,
    alignItems: 'flex-start',
    width: '100%',
  },
  logo: {
    width: 130,
    height: 100,
    top: -20,
  },
  deviceImageContainer: {
    marginTop: -90,
    marginBottom: -90,
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    // Shadow for Android
    elevation: 8,
  },
  deviceImage: {
    width: 1000,
    height: 370,
  },
  statusContainer: {
    alignItems: 'flex-start',
    width: '100%',
    marginTop: 0,
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a2e05',
  },
  deviceListCard: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 3,
    borderColor: '#4d7c0f',
    marginBottom: 60,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  refreshText: {
    fontSize: 14,
    color: '#4d7c0f',
    marginLeft: 6,
    fontWeight: '600',
  },
  deviceList: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdf4',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  deviceItemSelected: {
    borderColor: '#4d7c0f',
    borderWidth: 2,
    backgroundColor: '#ecfccb',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a2e05',
  },
  deviceRssi: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  connectButton: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#ecfccb',
    borderRadius: 10,
    minHeight: 50,
  },
  connectButtonDisabled: {
    backgroundColor: '#f3f4f6',
  },
  connectButtonConnecting: {
    backgroundColor: COLORS.primary,
  },
  connectButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4d7c0f',
    letterSpacing: 1,
  },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 10,
    letterSpacing: 0.5,
  },
});

// 2. ONBOARDING: DETAILS
const OnboardingDetails = ({ next, onShowReminder }) => {
  const insets = useSafeAreaInsets();
  const [experience, setExperience] = useState('Beginner');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [contactPhoneError, setContactPhoneError] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactNameError, setContactNameError] = useState('');
  const [medicalCondition, setMedicalCondition] = useState('');
  const options = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

  const validatePhone = (phone) => {
    if (!phone || phone.trim().length === 0) return 'Phone is required';
    // Remove all non-numeric characters except + for country code
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.length < 10) return 'Phone number must be at least 10 digits';
    if (digits.length > 15) return 'Phone number cannot exceed 15 digits';
    return '';
  };

  const handlePhoneChange = (text) => {
    // Only allow numbers, spaces, dashes, parentheses, and plus sign
    const formatted = text.replace(/[^0-9\s\-\(\)\+]/g, '');
    // Limit to reasonable length (with formatting characters)
    if (formatted.length <= 20) {
      setContactPhone(formatted);
      // Clear error when user starts typing again
      if (contactPhoneError) {
        const err = validatePhone(formatted);
        setContactPhoneError(err);
      }
    }
  };

  const validateName = (name) => {
    if (!name || name.trim().length === 0) return 'Contact name is required';
    return '';
  };

  const handleAccept = () => {
    const errPhone = validatePhone(contactPhone);
    const errName = validateName(contactName);

    if (errName) setContactNameError(errName);
    if (errPhone) setContactPhoneError(errPhone);

    if (errName || errPhone) return;

    setContactPhoneError('');
    setContactNameError('');
    onShowReminder();
  };

  return (
    <View style={[styles.contentContainer, styles.centerScreen, { paddingBottom: Math.max(insets.bottom + 20, 40) }]}>
      <Text style={[styles.titleLarge, styles.detailTitle]}>Get ready with the trail!</Text>

      <View style={styles.detailForm}>
        <InputField
          label="Contact Name"
          placeholder="Emergency Contact Name"
          value={contactName}
          onChangeText={(t) => { setContactName(t); if (contactNameError) setContactNameError(''); }}
          error={contactNameError}
        />
        <InputField
          label="Contact Phone"
          placeholder="Emergency Contact Phone"
          value={contactPhone}
          onChangeText={handlePhoneChange}
          keyboardType="phone-pad"
          maxLength={20}
          error={contactPhoneError}
        />
        <InputField
          label="Medical Condition"
          placeholder="Any allergies or conditions?"
          value={medicalCondition}
          onChangeText={setMedicalCondition}
        />

        {/* Real Dropdown (Modal) */}
        <Text style={styles.inputLabel}>Hiking Experience level</Text>
        <TouchableOpacity style={styles.inputBox} onPress={() => setDropdownOpen(true)}>
          <Text style={{color: COLORS.textDark}}>{experience}</Text>
          <ChevronRight size={20} color={COLORS.gray} />
        </TouchableOpacity>
      </View>

      <View style={styles.illustrationSpace}>
         <Trees size={80} color={COLORS.primary} style={{opacity: 0.5}} />
      </View>

      <MainButton title="ACCEPT AND CONTINUE" onPress={handleAccept} style={{marginTop: 20}} />

      {/* Dropdown Modal */}
      <Modal visible={dropdownOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.dropdownModalOverlay} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
          <View style={styles.dropdownModalContent}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.dropdownItem}
                onPress={() => { setExperience(opt); setDropdownOpen(false); }}
              >
                <Text style={styles.dropdownItemText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// 3. LOBBY SCREEN (Join & Create)
const LobbyScreen = ({ onLogin, onShowCreateSuccess, onReconnect }) => {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('join'); // 'join' or 'create'
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Join lobby form state
  const [joinUsername, setJoinUsername] = useState('');
  const [joinGroupId, setJoinGroupId] = useState('');  // Lobby ID (group id) to join
  const [joinPin, setJoinPin] = useState('');  // 6-digit PIN
  const [joinUsernameError, setJoinUsernameError] = useState('');
  const [joinGroupIdError, setJoinGroupIdError] = useState('');
  const [joinPinError, setJoinPinError] = useState('');
  
  // Create lobby form state
  const [lobbyName, setLobbyName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [maxMember, setMaxMember] = useState('');
  const [createdPin, setCreatedPin] = useState('');  // PIN generated after lobby creation
  const [isJoining, setIsJoining] = useState(false);  // Show joining indicator
  
  // Nearby Lobbies Discovery State
  const [nearbyLobbies, setNearbyLobbies] = useState([]); // Array of { lobbyName, creatorName, memberCount, timestamp }
  const [isScanning, setIsScanning] = useState(false);
  const [discoveryJoined, setDiscoveryJoined] = useState(false);
  const [selectedNearbyLobby, setSelectedNearbyLobby] = useState(null); // For PIN entry modal

  // Load saved credentials on mount
  useEffect(() => {
    loadSavedCredentials();
  }, []);

  // Set up discovery channel listener
  useEffect(() => {
    if (!bleService.isConnected()) return;
    
    const handleDiscoveryMessage = (code, data) => {
      // Listen for channel messages (RESP_CODE_CHANNEL_MSG_RECV or RESP_CODE_CHANNEL_MSG_RECV_V3)
      if (code !== 8 && code !== 17) return; // RESP_CODE_CHANNEL_MSG_RECV = 8, V3 = 17
      
      try {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        
        // Parse firmware format:
        // V3 (code 17): [SNR][reserved][reserved][channel_idx][path_len][txt_type][timestamp 4 bytes][text...]
        // V2 (code 8):  [channel_idx][path_len][txt_type][timestamp 4 bytes][text...]
        let offset = 0;
        if (code === 17) {
          // V3 has 3 extra bytes at the start
          offset = 3;
        }
        
        if (bytes.length < offset + 7) return; // Not enough data
        
        const channelIdx = bytes[offset];
        // const pathLen = bytes[offset + 1]; // Not used for now
        // const txtType = bytes[offset + 2]; // Usually 0 (plain)
        // const timestamp = bytes[offset + 3] | (bytes[offset + 4] << 8) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 24);
        
        // Text starts at offset + 7
        const textBytes = bytes.slice(offset + 7);
        const message = new TextDecoder().decode(textBytes);
        
        // Check if this is from the discovery channel (index 7)
        const DISCOVERY_CHANNEL_IDX = 7;
        if (channelIdx !== DISCOVERY_CHANNEL_IDX) {
          console.log('Channel message from index', channelIdx, '(not discovery channel)');
          return;
        }
        
        console.log('Discovery channel message received:', message);
        
        const parsed = bleService.parseDiscoveryMessage(message);
        if (!parsed) return;
        
        if (parsed.type === 'ANNOUNCE' || parsed.type === 'SCAN_RESPONSE') {
          // Add or update lobby in the list
          setNearbyLobbies(prev => {
            const existing = prev.findIndex(l => l.lobbyName === parsed.lobbyName);
            const newEntry = {
              lobbyName: parsed.lobbyName,
              creatorName: parsed.creatorName,
              memberCount: parsed.memberCount,
              timestamp: Date.now(),
            };
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = newEntry;
              return updated;
            }
            return [...prev, newEntry];
          });
        }
      } catch (e) {
        console.log('Error parsing discovery message:', e);
      }
    };
    
    bleService.onMessage(handleDiscoveryMessage);
    
    return () => {
      bleService.offMessage(handleDiscoveryMessage);
    };
  }, []);

  // Join discovery channel when BLE connects
  const joinDiscoveryChannel = async () => {
    if (!bleService.isConnected()) {
      console.log('Cannot join discovery channel - not connected');
      return false;
    }
    try {
      const ok = await bleService.joinDiscoveryChannel();
      setDiscoveryJoined(ok);
      console.log('Discovery channel joined:', ok);
      return ok;
    } catch (e) {
      console.log('Error joining discovery channel:', e);
      return false;
    }
  };

  // Scan for nearby lobbies via LoRa
  // Scan for nearby lobbies via LoRa by sending a scan request and listening
  // for transient announcements forwarded by the device over BLE.
  const scanForNearbyLobbies = async () => {
    setIsScanning(true);
    setNearbyLobbies([]); // Clear existing

    console.log('=== LORA LOBBY SCAN (LIVE) STARTING ===');

    try {
      if (!bleService.isConnected()) {
        Alert.alert(
          'Not Connected',
          'Please connect to your LoRa device first before scanning for lobbies.',
          [{ text: 'OK' }]
        );
        setIsScanning(false);
        return;
      }

      // Ensure we are joined to the discovery channel so incoming floods are forwarded
      await joinDiscoveryChannel();

      // Give the device a moment to join and start listening
      await new Promise(r => setTimeout(r, 300));

      // Clear any previously collected entries and request nearby lobbies
      setNearbyLobbies([]);
      await bleService.requestNearbyLobbies(bleService.getDeviceName() || 'phone');

      // Wait briefly to collect responses/announcements (they arrive via onMessage handler)
      await new Promise(r => setTimeout(r, 3000));

      setIsScanning(false);

      if (!nearbyLobbies || nearbyLobbies.length === 0) {
        Alert.alert(
          'No Lobbies Found',
          'No lobbies discovered over LoRa radio yet.\n\n' +
          '• Make sure someone has created a lobby\n' +
          '• Lobbies are broadcast by creators or responded to scan requests\n' +
          '• Try scanning again after a moment',
          [{ text: 'OK' }]
        );
      }
    } catch (e) {
      console.log('Lobby scan error:', e);
      setIsScanning(false);
      Alert.alert('Scan Error', 'Failed to scan for lobbies: ' + (e?.message || e));
    }
  };

  // Select a discovered lobby to join
  const selectNearbyLobby = (lobby) => {
    // Nearby entries report `lobbyName` but that is the Lobby ID/group identifier.
    setJoinGroupId(lobby.lobbyName);
    setSelectedNearbyLobby(lobby);
    // User still needs to enter PIN
    Alert.alert(
      'Enter PIN',
      `To join "${lobby.lobbyName}" (created by ${lobby.creatorName}), you need the 6-digit PIN from the lobby creator.`,
      [{ text: 'OK' }]
    );
  };

  const loadSavedCredentials = async () => {
    try {
      const savedRemember = await AsyncStorage.getItem(STORAGE_KEYS.REMEMBER_ME);
      if (savedRemember === 'true') {
        setRemember(true);
        const savedUsername = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_USERNAME);
        const savedLobbyName = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_GROUP_ID);
        if (savedUsername) setJoinUsername(savedUsername);
        if (savedLobbyName) setJoinGroupId(savedLobbyName);
      }
    } catch (error) {
      console.log('Error loading saved credentials:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCredentials = async (username, groupId) => {
    try {
      if (remember) {
        await AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_ME, 'true');
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_USERNAME, username);
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_GROUP_ID, groupId);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
        await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_USERNAME);
        await AsyncStorage.removeItem(STORAGE_KEYS.SAVED_GROUP_ID);
      }
    } catch (error) {
      console.log('Error saving credentials:', error);
    }
  };
  const [lobbyNameError, setLobbyNameError] = useState('');
  const [groupIdError, setGroupIdError] = useState('');
  const [maxMemberError, setMaxMemberError] = useState('');

  const validateJoinForm = () => {
    let isValid = true;
    
    if (!joinUsername.trim()) {
      setJoinUsernameError('Username is required');
      isValid = false;
    } else {
      setJoinUsernameError('');
    }
    
    if (!joinGroupId.trim()) {
      setJoinGroupIdError('Lobby ID is required');
      isValid = false;
    } else if (joinGroupId.trim().length < 2) {
      setJoinGroupIdError('Lobby ID must be at least 2 characters');
      isValid = false;
    } else {
      setJoinGroupIdError('');
    }
    
    if (!joinPin.trim()) {
      setJoinPinError('PIN is required (get this from the lobby creator)');
      isValid = false;
    } else if (!/^\d{6}$/.test(joinPin.trim())) {
      setJoinPinError('PIN must be exactly 6 digits');
      isValid = false;
    } else {
      setJoinPinError('');
    }
    
    return isValid;
  };

  const validateCreateForm = () => {
    let isValid = true;
    
    if (!lobbyName.trim()) {
      setLobbyNameError('Lobby name is required');
      isValid = false;
    } else if (lobbyName.trim().length < 3) {
      setLobbyNameError('Lobby name must be at least 3 characters');
      isValid = false;
    } else {
      setLobbyNameError('');
    }
    
    if (!groupId.trim()) {
      setGroupIdError('Group ID is required');
      isValid = false;
    } else if (groupId.trim().length < 4) {
      setGroupIdError('Group ID must be at least 4 characters');
      isValid = false;
    } else {
      setGroupIdError('');
    }
    
    if (!maxMember.trim()) {
      setMaxMemberError('Max members is required');
      isValid = false;
    } else if (isNaN(parseInt(maxMember)) || parseInt(maxMember) < 2) {
      setMaxMemberError('Enter a valid number (minimum 2)');
      isValid = false;
    } else if (parseInt(maxMember) > 50) {
      setMaxMemberError('Maximum 50 members allowed');
      isValid = false;
    } else {
      setMaxMemberError('');
    }
    
    return isValid;
  };

  const handleJoinLobby = async () => {
    if (validateJoinForm()) {
      const lobbyIdTrimmed = joinGroupId.trim();
      const pinTrimmed = joinPin.trim();

      // Save credentials if remember me is checked
      await saveCredentials(joinUsername.trim(), lobbyIdTrimmed);

      // Check if BLE is connected and send join lobby command
      console.log('=== JOIN LOBBY DEBUG ===');
      console.log('BLE connected:', bleService.isConnected());
      console.log('Lobby ID:', lobbyIdTrimmed);
      console.log('PIN:', pinTrimmed);
      
      if (!bleService.isConnected()) {
        Alert.alert(
          'Not Connected',
          'You are not connected to a HikeSafe device. Would you like to reconnect?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reconnect', onPress: () => onReconnect && onReconnect() }
          ]
        );
        return;
      }
      
      setIsJoining(true);
      
      try {
        console.log('=== JOINING LOBBY ===');
        console.log('Group ID (used for secret derivation):', lobbyIdTrimmed);
        console.log('PIN entered:', pinTrimmed);
        console.log('Expected input string for secret:', `${lobbyIdTrimmed}:${pinTrimmed}:hikesafe`);

        // Use sendJoinLobbyWithPin which uses CMD_SET_CHANNEL with fixed index
        // This ensures the channel is set at the same index as the creator
        const ok = await bleService.sendJoinLobbyWithPin(lobbyIdTrimmed, pinTrimmed);
        console.log('Join lobby BLE result:', ok);
        
        if (ok) {
          // Don't send join request message - just enter the lobby
          // The user will know if they're on the wrong channel when messages don't appear
          setIsJoining(false);
          Alert.alert(
            'Joined Lobby',
            `You have joined "${lobbyIdTrimmed}".\n\n⚠️ IMPORTANT: The PIN must match EXACTLY what the creator shared. If messages don't appear, verify the PIN.`,
            [{ text: 'OK', onPress: () => onLogin({ username: joinUsername.trim(), groupId: lobbyIdTrimmed }) }]
          );
        } else {
          setIsJoining(false);
          Alert.alert('Error', 'Failed to join lobby. Please check your device connection.');
        }
      } catch (e) {
        setIsJoining(false);
        console.warn('Join lobby BLE error:', e);
        Alert.alert('Error', 'Failed to join lobby: ' + e.message);
      }
    }
  };

  const handleCreateLobby = async () => {
    if (validateCreateForm()) {
      const lobbyId = groupId.trim().toUpperCase();
      const lobbyNameTrimmed = lobbyName.trim();
      
      // Debug logging
      console.log('=== CREATE LOBBY DEBUG ===');
      console.log('BLE connected:', bleService.isConnected());
      console.log('BLE device:', bleService.getDeviceName());
      console.log('Lobby ID:', lobbyId);
      console.log('Lobby Name:', lobbyNameTrimmed);
      
      // Check if BLE is connected
      if (!bleService.isConnected()) {
        console.log('BLE NOT CONNECTED - showing reconnect alert');
        Alert.alert(
          'Not Connected',
          'You are not connected to a HikeSafe device. Would you like to reconnect?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reconnect', onPress: () => onReconnect && onReconnect() }
          ]
        );
        return;
      }
      
      try {
        console.log('=== CREATING LOBBY ===');
        console.log('Lobby Name:', lobbyNameTrimmed);
        console.log('Group ID (used for secret derivation):', lobbyId);
        
        // Use the proper create function which:
        // 1. Creates the channel via CMD_CREATE_LOBBY (sets BLE advertisement for discovery)
        // 2. Sets the derived secret via CMD_JOIN_LOBBY
        // 3. Returns the generated PIN
        const pin = await bleService.sendCreateLobbyWithPin(lobbyNameTrimmed, lobbyId);
        
        if (!pin) {
          console.log('Create lobby FAILED');
          Alert.alert('Error', 'Failed to create lobby on device. Please check your connection.');
          return;
        }
        
        console.log('=== LOBBY CREATED ===');
        console.log('Generated PIN:', pin);
        console.log('Input string for secret:', `${lobbyId}:${pin}:hikesafe`);
        console.log('Share with joiners: Group ID =', lobbyId, ', PIN =', pin);
        
        // Store the PIN to display in success modal
        setCreatedPin(pin);
        
        onShowCreateSuccess({ 
            lobbyName: lobbyNameTrimmed, 
            groupId: lobbyId, 
            maxMember: maxMember.trim(),
            pin: pin  // Pass the PIN to display
          });
      } catch (e) {
        console.warn('Create lobby error:', e);
        Alert.alert('Error', 'Failed to create lobby: ' + e.message);
      }
    }
  };

  if (mode === 'create') {
    return (
      <ImageBackground
        source={require('./assets/forest_bg 1.png')}
        style={styles.lobbyCreateBg}
        resizeMode="contain"
      >
        <View style={[styles.centerContent, { paddingBottom: Math.max(insets.bottom + 20, 40) }]}>
          <View style={styles.cardGreen}>
            <Text style={styles.cardTitleLarge}>CREATE A LOBBY</Text>
            <View style={styles.separatorThin} />

            <Text style={[styles.cardSubtitleWhite, { textAlign: 'left', alignSelf: 'flex-start', fontSize: 20 }]}>Welcome to HIKESAFE!</Text>
            <Text style={[styles.cardDescWhite, { textAlign: 'left', alignSelf: 'flex-start' }]} numberOfLines={1}>Please fill out the form below to create your lobby.</Text>
            <View style={styles.separatorThin} />

            <View style={styles.formGrid}>
              <View style={styles.fieldRow}>
                <View style={styles.fieldRowInner}>
                  <Text style={[styles.fieldLabel, lobbyNameError && { color: '#fecaca' }]}>Lobby Name</Text>
                  <TextInput 
                    style={[styles.inputWhiteRounded, lobbyNameError ? styles.inputError : null]} 
                    placeholder="Enter lobby name" 
                    placeholderTextColor="rgba(0,0,0,0.35)"
                    value={lobbyName}
                    onChangeText={(t) => { setLobbyName(t); if (lobbyNameError) setLobbyNameError(''); }}
                  />
                </View>
                {lobbyNameError ? <Text style={styles.errorTextWhite}>{lobbyNameError}</Text> : null}
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldRowInner}>
                  <Text style={[styles.fieldLabel, groupIdError && { color: '#fecaca' }]}>Group ID</Text>
                  <TextInput 
                    style={[styles.inputWhiteRounded, groupIdError ? styles.inputError : null]} 
                    placeholder="Group ID" 
                    placeholderTextColor="rgba(0,0,0,0.35)"
                    value={groupId}
                    onChangeText={(t) => { setGroupId(t); if (groupIdError) setGroupIdError(''); }}
                    autoCapitalize="characters"
                  />
                </View>
                {groupIdError ? <Text style={styles.errorTextWhite}>{groupIdError}</Text> : null}
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldRowInner}>
                  <Text style={[styles.fieldLabel, maxMemberError && { color: '#fecaca' }]} numberOfLines={1}>Max Member</Text>
                  <TextInput 
                    style={[styles.inputWhiteRounded, maxMemberError ? styles.inputError : null]} 
                    placeholder="Max Member" 
                    placeholderTextColor="rgba(0,0,0,0.35)" 
                    keyboardType="numeric"
                    value={maxMember}
                    onChangeText={(t) => { setMaxMember(t); if (maxMemberError) setMaxMemberError(''); }}
                  />
                </View>
                {maxMemberError ? <Text style={styles.errorTextWhite}>{maxMemberError}</Text> : null}
              </View>
            </View>

            <TouchableOpacity style={styles.createNowButton} onPress={handleCreateLobby}>
              <Text style={styles.createNowText}>CREATE NOW</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setMode('join')} style={{marginTop: 8}}>
               <Text style={styles.linkTextWhite}>Already have a Lobby? <Text style={{fontWeight: 'bold', color: 'green', textDecorationLine: 'underline'}}>Click Here</Text></Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    );
  }

  // Join Mode
  return (
    <ImageBackground
      source={require('./assets/forest_bg 1.png')}
      style={styles.lobbyCreateBg}
      resizeMode="cover"
    >
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 20, 40) }]} keyboardShouldPersistTaps="handled">
          <View style={styles.logoSection}>
            <Image source={require('./assets/hike.png')} style={styles.logoImage} />
            <Text style={styles.tagline}>"Stay connected. Stay safe."</Text>
          </View>

        <View style={[styles.formSection, { width: '80%', alignSelf: 'center' }]}> 

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, joinGroupIdError ? { borderColor: 'red' } : null]}
              placeholder="Lobby ID (Group ID)"
              placeholderTextColor="#9CA3AF"
              value={joinGroupId}
              onChangeText={(t) => { setJoinGroupId(t); if (joinGroupIdError) setJoinGroupIdError(''); }}
              autoCapitalize="characters"
            />
            {joinGroupIdError ? <Text style={styles.errorTextRed}>{joinGroupIdError}</Text> : null}
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, joinPinError ? { borderColor: 'red' } : null]}
              placeholder="6-Digit PIN"
              placeholderTextColor="#9CA3AF"
              value={joinPin}
              onChangeText={(t) => { 
                // Only allow digits, max 6
                const digits = t.replace(/[^0-9]/g, '').slice(0, 6);
                setJoinPin(digits); 
                if (joinPinError) setJoinPinError(''); 
              }}
              keyboardType="numeric"
              maxLength={6}
            />
            {joinPinError ? <Text style={styles.errorTextRed}>{joinPinError}</Text> : null}
            
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, joinUsernameError ? { borderColor: 'red' } : null]}
              placeholder="Your display name"
              placeholderTextColor="#9CA3AF"
              value={joinUsername}
              onChangeText={(t) => { setJoinUsername(t); if (joinUsernameError) setJoinUsernameError(''); }}
            />
            {joinUsernameError ? <Text style={styles.errorTextRed}>{joinUsernameError}</Text> : null}
          </View>
          
          {/* Nearby Lobbies Discovery Section */}
          <View style={{ marginTop: 15, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 14 }}>📡 Nearby Lobbies</Text>
              <TouchableOpacity 
                onPress={scanForNearbyLobbies}
                disabled={isScanning}
                style={{ 
                  backgroundColor: isScanning ? '#6b7280' : '#22c55e', 
                  paddingHorizontal: 12, 
                  paddingVertical: 6, 
                  borderRadius: 12 
                }}
              >
                {isScanning ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="white" />
                    <Text style={{ color: 'white', fontSize: 12, marginLeft: 5 }}>Scanning...</Text>
                  </View>
                ) : (
                  <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>Scan</Text>
                )}
              </TouchableOpacity>
            </View>
            
            {nearbyLobbies.length > 0 ? (
              <ScrollView style={{ maxHeight: 120, marginTop: 8 }} nestedScrollEnabled>
                {nearbyLobbies.map((lobby, idx) => (
                  <TouchableOpacity 
                    key={`${lobby.lobbyName}-${idx}`}
                    onPress={() => selectNearbyLobby(lobby)}
                    style={{ 
                      backgroundColor: joinGroupId === lobby.lobbyName ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.1)', 
                      padding: 10, 
                      borderRadius: 8, 
                      marginBottom: 6,
                      borderWidth: joinGroupId === lobby.lobbyName ? 1 : 0,
                      borderColor: '#22c55e',
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={{ color: 'white', fontWeight: '600' }}>{lobby.lobbyName}</Text>
                        <Text style={{ color: '#9CA3AF', fontSize: 11 }}>Created by: {lobby.creatorName}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: '#22c55e', fontSize: 12 }}>{lobby.memberCount} member{lobby.memberCount !== 1 ? 's' : ''}</Text>
                        <Text style={{ color: '#6b7280', fontSize: 10 }}>Tap to select</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                {isScanning ? '📻 Scanning LoRa radio...' : 'Tap "Scan" to find lobbies via LoRa'}
              </Text>
            )}
          </View>
          
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => setRemember(!remember)}
              style={[styles.checkbox, remember ? styles.checkboxChecked : null]}
            >
              {remember && <Text style={styles.checkboxTick}>✓</Text>}
            </TouchableOpacity>
            <Text style={[styles.labelSmall, { color: 'white', fontWeight: '600', marginLeft: 8 }]}>Remember me</Text>
          </View>
          <View style={[styles.hrLine, { marginTop: 30 }]} />
        </View>

          {isJoining ? (
          <View style={{ width: '80%', alignSelf: 'center', alignItems: 'center', padding: 15, marginTop: 10 }}>
            <ActivityIndicator size="large" color="#22c55e" />
            <Text style={{ color: 'white', marginTop: 10, fontWeight: '600' }}>Joining lobby...</Text>
          </View>
        ) : (
          <MainButton title="Enter Lobby" onPress={handleJoinLobby} style={{ width: '80%', alignSelf: 'center', marginTop: 10 }} />
        )}
        
        <TouchableOpacity
          onPress={onReconnect}
          style={{ marginTop: 16, alignItems: 'center' }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: '#fbbf24', fontWeight: '600', textAlign: 'center', fontSize: 13 }}>
            Lost connection?{' '}
            <Text style={{ color: 'white', fontWeight: 'bold', textDecorationLine: 'underline' }}>Connect again.</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMode('create')}
          style={{ marginTop: 10, alignItems: 'center' }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: COLORS.primary, fontWeight: '600', textAlign: 'center' }}>
            Do you want to create a Lobby?{' '}
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Create Here.</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ImageBackground>
  );
};

// 4. DASHBOARD (Tab Navigation Container)
const Dashboard = ({ onLogout, userData = {}, lobbyData = {}, loraContext = {} }) => {
  const [activeTab, setActiveTab] = useState('home');
  const [chatTarget, setChatTarget] = useState(null); // null = chat list, object = conversation
  const insets = useSafeAreaInsets(); // Get safe area insets for bottom navigation
  
  // Location service state - persists across tab switches
  const [locationServiceEnabled, setLocationServiceEnabled] = useState(false);
  const [compassSubscription, setCompassSubscription] = useState(null);
  
  // Get display values from userData or lobbyData
  const displayUsername = userData?.username || 'John Doe';
  const displayGroupId = userData?.groupId || lobbyData?.groupId || 'ABCDEF123';
  
  // Get lobby members and messages from context
  const lobbyMembers = loraContext?.lobbyMembers || [];
  const messages = loraContext?.messages || [];
  const memberCount = lobbyMembers.length;
  
  // Calculate nearest member distance
  const nearestDistance = lobbyMembers.length > 0 
    ? Math.min(...lobbyMembers.filter(m => m.distance).map(m => m.distance)) || null
    : null;

  const { checkMessagesNow } = loraContext;

  const renderContent = () => {
    // If chatTarget is set, show the conversation view
    if (chatTarget) {
      return <ChatConversation chat={chatTarget} onBack={() => setChatTarget(null)} loraContext={loraContext} />;
    }
    
    switch (activeTab) {
      case 'home': return <HomeTab 
        onChangeTab={setActiveTab} 
        username={displayUsername} 
        groupId={displayGroupId}
        memberCount={memberCount}
        isConnected={loraContext?.isConnected}
        nearestDistance={nearestDistance}
      />;
      case 'location': return <LocationTab lobbyMembers={lobbyMembers} loraContext={loraContext} />;
      case 'message': return <MessageTab onOpenChat={setChatTarget} groupId={displayGroupId} lobbyMembers={lobbyMembers} messages={messages} />;
      case 'compass': return <CompassTab 
        isServiceEnabled={locationServiceEnabled} 
        setIsServiceEnabled={setLocationServiceEnabled}
        subscription={compassSubscription}
        setSubscription={setCompassSubscription}
        loraContext={loraContext}
      />;
      case 'profile': return <ProfileTab 
        onLogout={onLogout} 
        username={displayUsername} 
        userData={userData}
        isConnected={loraContext?.isConnected} 
      />;
      default: return <HomeTab />;
    }
  };

  return (
    <ImageBackground
      source={require('./assets/dashboard.png')}
      style={{flex: 1}}
      resizeMode="cover"
    >
      {/* Top-right manual message sync button */}
      {!chatTarget && (
        <View style={{ position: 'absolute', top: insets.top + 10, right: 10, zIndex: 10 }}>
          <TouchableOpacity
            onPress={checkMessagesNow}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999 }}
          >
            <RefreshCw size={18} color={COLORS.primary} />
            <Text style={{ marginLeft: 6, color: COLORS.primary, fontWeight: '600' }}>Check messages</Text>
          </TouchableOpacity>
        </View>
      )}

      {renderContent()}
      
      {/* Bottom Navigation Bar - hide when in chat conversation */}
      {!chatTarget && (
        <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) + 10 }]}>
          <TabIcon icon={Home} label="Home" active={activeTab === 'home'} onPress={() => setActiveTab('home')} />
          <TabIcon icon={MapPin} label="Loc" active={activeTab === 'location'} onPress={() => setActiveTab('location')} />
          <TabIcon icon={MessageCircle} label="Chat" active={activeTab === 'message'} onPress={() => setActiveTab('message')} />
          <TabIcon icon={Compass} label="Comp" active={activeTab === 'compass'} onPress={() => setActiveTab('compass')} />
          <TabIcon icon={User} label="Prof" active={activeTab === 'profile'} onPress={() => setActiveTab('profile')} />
        </View>
      )}
    </ImageBackground>
  );
};

const TabIcon = ({ icon: Icon, active, onPress }) => (
  <TouchableOpacity style={styles.tabItem} onPress={onPress}>
    <Icon size={24} color={active ? COLORS.primary : COLORS.gray} />
    {active && <View style={styles.activeDot} />}
  </TouchableOpacity>
);

// --- DASHBOARD TABS ---

const HomeTab = ({ onChangeTab, username = 'John Doe', groupId = 'ABCDEF123', memberCount = 0, isConnected = false, nearestDistance = null }) => (
  <ScrollView contentContainerStyle={styles.scrollContent}>
    <View style={styles.headerRow}>
      <View>
        <Text style={styles.welcomeText}>Hello!</Text>
        <Text style={styles.usernameTitle}>{username}</Text>
      </View>
      <View style={styles.connectionStatus}>
        {isConnected ? (
          <Wifi size={24} color={COLORS.primary} />
        ) : (
          <WifiOff size={24} color={COLORS.gray} />
        )}
      </View>
    </View>

    {/* Lobby ID Card */}
    <LinearGradient colors={[COLORS.primaryLight, COLORS.primary]} style={styles.lobbyCard}>
      <Text style={styles.lobbyLabel}>LOBBY ID</Text>
      <Text style={styles.lobbyCode}>{groupId}</Text>
      
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>MEMBERS</Text>
          <Text style={styles.statValue}>{memberCount > 0 ? memberCount : '--'}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>NEAREST</Text>
          <Text style={styles.statValue}>{nearestDistance ? `${nearestDistance} m` : '-- m'}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>SIGNAL</Text>
          <View style={styles.signalIcon}>
            <View style={[styles.bar, {height: 6, backgroundColor: isConnected ? 'white' : '#9ca3af'}]} />
            <View style={[styles.bar, {height: 10, backgroundColor: isConnected ? 'white' : '#9ca3af'}]} />
            <View style={[styles.bar, {height: 14, backgroundColor: isConnected ? 'white' : '#9ca3af'}]} />
          </View>
        </View>
      </View>
    </LinearGradient>

    <Text style={styles.sectionHeader}>Services</Text>
    <View style={styles.servicesGrid}>
      <ServiceItem icon={User} label="Profile" onPress={() => onChangeTab('profile')} />
      <ServiceItem icon={MessageCircle} label="Message" onPress={() => onChangeTab('message')} />
      <ServiceItem icon={MapPin} label="Location" onPress={() => onChangeTab('location')} />
      <ServiceItem icon={Compass} label="Compass" onPress={() => onChangeTab('compass')} />
    </View>

    <Text style={styles.sectionHeader}>Recent Activities</Text>
    <View style={styles.activityCard}>
      <Text style={styles.activityText}>Lobby joined at {new Date().toLocaleTimeString()}</Text>
    </View>
  </ScrollView>
);

const ServiceItem = ({ icon: Icon, label, onPress }) => (
  <TouchableOpacity style={styles.serviceItem} onPress={onPress}>
    <View style={styles.serviceIconBox}>
      <Icon size={24} color={COLORS.textDark} />
    </View>
    <Text style={styles.serviceText}>{label}</Text>
  </TouchableOpacity>
);

const LocationTab = ({ lobbyMembers = [], loraContext = {} }) => {
  const [myLocation, setMyLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const locationSubscription = useRef(null);

  // Use real members if available, otherwise show empty state
  const [members, setMembers] = useState([]);
  
  // Update members when lobbyMembers changes
  useEffect(() => {
    if (lobbyMembers.length > 0) {
      setMembers(lobbyMembers.map(m => ({
        ...m,
        online: m.online !== undefined ? m.online : true,
        distance: m.distance || null,
        lastSeen: m.lastSeen || new Date(),
      })));
    }
  }, [lobbyMembers]);

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c); // Distance in meters
  };

  // Start/stop location tracking
  const toggleTracking = async () => {
    if (isTracking) {
      // Stop tracking
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      setIsTracking(false);
    } else {
      // Start tracking
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocationError('Location permission denied');
          return;
        }

        setIsTracking(true);
        setLocationError(null);

        // Get initial location
        const location = await Location.getCurrentPositionAsync({});
        setMyLocation(location.coords);
        setLastUpdate(new Date());

        // Start watching location
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000, // Update every 5 seconds
            distanceInterval: 5, // Or when moved 5 meters
          },
          (newLocation) => {
            setMyLocation(newLocation.coords);
            setLastUpdate(new Date());
            
            // Send location via LoRa if connected
            if (loraContext?.sendLocation) {
              loraContext.sendLocation(newLocation.coords.latitude, newLocation.coords.longitude);
            }

            // Update member distances (simulated - in real app this would come from LoRa)
            setMembers(prev => prev.map(member => ({
              ...member,
              distance: member.online ? Math.max(1, Math.floor(Math.random() * 100)) : member.distance,
            })));
          }
        );
      } catch (error) {
        setLocationError('Failed to get location');
        setIsTracking(false);
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, []);

  // Format time ago
  const timeAgo = (date) => {
    if (!date) return 'Unknown';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <View style={styles.tabContainer}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>LOCATION</Text>
      </View>
      
      {/* My Location Card */}
      <View style={locStyles.myLocationCard}>
        <View style={locStyles.myLocationHeader}>
          <Navigation size={20} color={COLORS.primary} />
          <Text style={locStyles.myLocationTitle}>My Location</Text>
          <TouchableOpacity 
            style={[locStyles.trackingButton, isTracking && locStyles.trackingButtonActive]}
            onPress={toggleTracking}
          >
            <Text style={[locStyles.trackingButtonText, isTracking && { color: 'white' }]}>
              {isTracking ? 'Stop Tracking' : 'Start Tracking'}
            </Text>
          </TouchableOpacity>
        </View>
        {myLocation ? (
          <View style={locStyles.coordsRow}>
            <Text style={locStyles.coordsText}>
              {myLocation.latitude.toFixed(6)}, {myLocation.longitude.toFixed(6)}
            </Text>
            {lastUpdate && <Text style={locStyles.updateText}>Updated {timeAgo(lastUpdate)}</Text>}
          </View>
        ) : (
          <Text style={locStyles.noLocationText}>
            {locationError || 'Tap "Start Tracking" to share your location'}
          </Text>
        )}
      </View>

      {/* Members List */}
      <ScrollView style={{flex:1, padding: 20, paddingTop: 0}}>
        <Text style={locStyles.sectionTitle}>Lobby Members ({members.length})</Text>
        {members.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: COLORS.gray, textAlign: 'center' }}>
              No other members in the lobby yet.{'\n'}When other LoRa devices join and share location, they will appear here.
            </Text>
          </View>
        ) : (
          members.map((member) => (
            <View key={member.id} style={styles.userLocationRow}>
              <View style={[styles.avatarSmall, !member.online && { backgroundColor: COLORS.gray }]}>
                <User size={16} color="white" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={locStyles.memberRow}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <View style={[locStyles.statusDot, { backgroundColor: member.online ? '#22c55e' : '#9ca3af' }]} />
                </View>
                <Text style={styles.locationText}>
                  {member.online && member.distance ? `${member.distance} meter${member.distance !== 1 ? 's' : ''} away` : member.online ? 'Distance unknown' : `Last seen ${timeAgo(member.lastSeen)}`}
                </Text>
              </View>
              <MapPin size={20} color={member.online ? COLORS.primary : COLORS.gray} />
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

// Location Tab Styles
const locStyles = StyleSheet.create({
  myLocationCard: {
    backgroundColor: 'white',
    margin: 20,
    marginBottom: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  myLocationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  myLocationTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
    marginLeft: 8,
  },
  trackingButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  trackingButtonActive: {
    backgroundColor: COLORS.primary,
  },
  trackingButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  coordsRow: {
    marginTop: 4,
  },
  coordsText: {
    fontSize: 14,
    color: COLORS.textDark,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  updateText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  noLocationText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 6,
  },
});

// --- MESSAGE TAB (Chat List) ---
const MessageTab = ({ onOpenChat, groupId = 'ABCDEF123', lobbyMembers = [], messages = [] }) => {
  // Use real members, empty array if none
  const members = lobbyMembers.map(m => ({
    id: m.id,
    name: m.name || `Device_${String(m.id).slice(0, 4)}`,
    online: m.online !== undefined ? m.online : true,
    distance: m.distance ? `${m.distance} M` : '-- M',
    avatar: m.name ? m.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??',
  }));

  // Get the last message from the global messages for lobby
  const lastLobbyMessage = messages.length > 0 
    ? messages[messages.length - 1]
    : null;

  // Lobby group chat
  const lobbyChat = {
    id: 'lobby',
    name: `LOBBY ${groupId}`,
    type: 'group',
    lastMessage: lastLobbyMessage 
      ? `${lastLobbyMessage.sender === 'me' ? 'You: ' : ''}${lastLobbyMessage.text}`.slice(0, 40)
      : (members.length > 0 ? 'Tap to chat with group' : 'No members yet'),
    time: lastLobbyMessage?.time || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase(),
    online: true,
    members: members.length + 1, // +1 for self
  };

  // Transform members to chat format
  const userChats = members.map((m, index) => ({
    id: m.id || `user${index}`,
    name: m.name,
    type: 'user',
    lastMessage: m.lastMessage || 'Tap to start chatting',
    time: m.time || '---',
    online: m.online !== undefined ? m.online : true,
    distance: m.distance || '-- M',
    avatar: m.avatar || m.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
  }));

  return (
    <View style={msgStyles.container}>
      {/* Header */}
      <LinearGradient colors={[COLORS.primaryLight, COLORS.primary]} style={msgStyles.header}>
        <Text style={msgStyles.headerTitle}>Messages</Text>
      </LinearGradient>

      <ScrollView style={msgStyles.chatList}>
        {/* Lobby Group Chat */}
        <TouchableOpacity style={msgStyles.chatItem} onPress={() => onOpenChat(lobbyChat)}>
          <View style={msgStyles.groupIcon}>
            <User size={24} color="white" />
          </View>
          <View style={msgStyles.chatInfo}>
            <View style={msgStyles.chatHeader}>
              <Text style={msgStyles.chatName}>{lobbyChat.name}</Text>
              <Text style={msgStyles.chatTime}>{lobbyChat.time}</Text>
            </View>
            <View style={msgStyles.chatSubInfo}>
              <Text style={msgStyles.chatLastMsg} numberOfLines={1}>{lobbyChat.lastMessage}</Text>
              <View style={msgStyles.memberBadge}>
                <Text style={msgStyles.memberCount}>{lobbyChat.members}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Divider */}
        <View style={msgStyles.divider}>
          <Text style={msgStyles.dividerText}>Direct Messages</Text>
        </View>

        {/* User Chats */}
        {userChats.map((chat) => (
          <TouchableOpacity key={chat.id} style={msgStyles.chatItem} onPress={() => onOpenChat(chat)}>
            <View style={msgStyles.avatarContainer}>
              <View style={msgStyles.avatar}>
                <Text style={msgStyles.avatarText}>{chat.avatar}</Text>
              </View>
              <View style={[msgStyles.statusIndicator, { backgroundColor: chat.online ? '#22c55e' : '#9ca3af' }]} />
            </View>
            <View style={msgStyles.chatInfo}>
              <View style={msgStyles.chatHeader}>
                <Text style={msgStyles.chatName}>{chat.name}</Text>
                <Text style={msgStyles.chatTime}>{chat.time}</Text>
              </View>
              <View style={msgStyles.chatSubInfo}>
                <Text style={msgStyles.chatLastMsg} numberOfLines={1}>{chat.lastMessage}</Text>
                <Text style={msgStyles.distanceText}>{chat.distance}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
        
        {/* Empty state */}
        {userChats.length === 0 && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: COLORS.gray, textAlign: 'center' }}>
              No other members in the lobby yet.{'\n'}When other LoRa devices join, they will appear here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// --- CHAT CONVERSATION VIEW ---
const ChatConversation = ({ chat, onBack, loraContext = {} }) => {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollViewRef = useRef(null);
  
  // Local messages for this chat - synced with loraContext.messages
  const [localMessages, setLocalMessages] = useState([]);
  
  // Sync with global messages from LoRa context
  useEffect(() => {
    if (loraContext?.messages) {
      // Filter messages relevant to this chat
      // For group chat: show all channel messages (sender === 'remote' or 'me')
      // For direct chat: filter by destination/sender
      const relevantMessages = loraContext.messages.filter(msg => {
        if (chat.type === 'group') {
          // Group chat: show all lobby channel messages
          return true;
        } else {
          // Direct message: match by user ID
          const chatUserId = chat.id.replace('user', '');
          return msg.destination === chatUserId || msg.sender === chatUserId;
        }
      });
      
      setLocalMessages(relevantMessages);
    }
  }, [loraContext?.messages, chat.id, chat.type]);

  // Scroll to bottom when messages change or keyboard appears
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => keyboardDidShowListener.remove();
  }, []);

  useEffect(() => {
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  }, [localMessages]);

  const sendMessage = async () => {
    if (message.trim() && !isSending) {
      setIsSending(true);
      const textToSend = message.trim();
      setMessage(''); // Clear input immediately
      
      // Send via LoRa if connected - this will add to loraContext.messages which syncs to localMessages
      if (loraContext?.sendMessage) {
        const destination = chat.type === 'group' ? 0xFF : parseInt(chat.id.replace('user', '')) || 0;
        await loraContext.sendMessage(destination, textToSend);
      }
      
      setIsSending(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={chatStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <LinearGradient colors={[COLORS.primaryLight, COLORS.primary]} style={chatStyles.header}>
        <TouchableOpacity onPress={onBack} style={chatStyles.backButton}>
          <ChevronRight size={24} color="white" style={{ transform: [{ rotate: '180deg' }] }} />
        </TouchableOpacity>
        <View style={chatStyles.headerInfo}>
          <View style={chatStyles.headerAvatar}>
            {chat.type === 'group' ? (
              <User size={20} color="white" />
            ) : (
              <Text style={chatStyles.headerAvatarText}>{chat.avatar}</Text>
            )}
          </View>
          <View>
            <Text style={chatStyles.headerName}>{chat.name}</Text>
            <Text style={chatStyles.headerStatus}>
              {chat.type === 'group' ? `${chat.members} members` : `Distance: ${chat.distance}`}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Messages */}
      <ImageBackground
        source={require('./assets/intbg.png')}
        style={chatStyles.messagesContainer}
        resizeMode="cover"
      >
        <ScrollView 
          ref={scrollViewRef}
          style={chatStyles.messagesList} 
          contentContainerStyle={{ paddingVertical: 16, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {localMessages.map((msg) => (
            <View 
              key={msg.id} 
              style={[
                chatStyles.messageRow,
                msg.sender === 'me' ? chatStyles.messageRowRight : chatStyles.messageRowLeft
              ]}
            >
              {msg.sender !== 'me' && (
                <View style={chatStyles.msgAvatar}>
                  <Image 
                    source={require('./assets/icon.png')} 
                    style={chatStyles.msgAvatarImage}
                  />
                </View>
              )}
              
              <View style={chatStyles.messageBubbleContainer}>
                {msg.sender !== 'me' && <Text style={chatStyles.timeTextLeft}>{msg.time}</Text>}
                <View style={[
                  chatStyles.messageBubble,
                  msg.sender === 'me' ? chatStyles.messageBubbleRight : chatStyles.messageBubbleLeft
                ]}>
                  <Text style={chatStyles.messageText}>{msg.text}</Text>
                </View>
                {msg.sender === 'me' && <Text style={chatStyles.timeTextRight}>{msg.time}</Text>}
              </View>
              
              {msg.sender === 'me' && (
                <View style={chatStyles.msgAvatar}>
                  <Image 
                    source={require('./assets/icon.png')} 
                    style={chatStyles.msgAvatarImage}
                  />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </ImageBackground>

      {/* Input Area */}
      <View style={[chatStyles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={chatStyles.textInput}
          placeholder="Type a message..."
          placeholderTextColor="#9ca3af"
          value={message}
          onChangeText={setMessage}
          multiline
        />
        <TouchableOpacity style={chatStyles.sendButton} onPress={sendMessage}>
          <Send size={20} color="white" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// Styles for Message Tab (Chat List)
const msgStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  chatList: {
    flex: 1,
    padding: 16,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  groupIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'white',
  },
  chatInfo: {
    flex: 1,
    marginLeft: 12,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  chatTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  chatSubInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatLastMsg: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  memberBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  memberCount: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
  },
  distanceText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },
  divider: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  dividerText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
});

// Styles for Chat Conversation
const chatStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 4,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  headerName: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
  },
  headerStatus: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  msgAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  msgAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  messageBubbleContainer: {
    maxWidth: '60%',
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  messageBubbleLeft: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomLeftRadius: 4,
  },
  messageBubbleRight: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: COLORS.textDark,
  },
  timeTextLeft: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
    marginLeft: 4,
  },
  timeTextRight: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
    marginRight: 4,
    textAlign: 'right',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});

// --- COMPASS TAB (FUNCTIONAL) ---
const CompassTab = ({ isServiceEnabled, setIsServiceEnabled, subscription, setSubscription }) => {
  const [magnetometer, setMagnetometer] = useState(0);
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState(isServiceEnabled ? 'Fetching location...' : 'Waiting for GPS...');
  const [errorMsg, setErrorMsg] = useState(null);
  const subscriptionRef = useRef(subscription);

  // Keep ref in sync with prop
  useEffect(() => {
    subscriptionRef.current = subscription;
  }, [subscription]);

  // On mount, if service is already enabled, start subscribing
  useEffect(() => {
    if (isServiceEnabled) {
      _subscribe();
      _getLocation();
    }
    // Cleanup only the local subscription reference, don't turn off service
    return () => {
      // Don't unsubscribe here - let the service keep running
    };
  }, []);

  // Toggle Handler
  const toggleSwitch = async () => {
    if (!isServiceEnabled) {
      // Turn ON
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        Alert.alert("Permission Required", "Location permission is needed to use the compass.");
        return;
      }
      setIsServiceEnabled(true);
      _subscribe();
      _getLocation();
    } else {
      // Turn OFF
      setIsServiceEnabled(false);
      _unsubscribe();
      setLocation(null);
      setMagnetometer(0);
      setAddress('Service Paused');
    }
  };

  // Subscribe to Magnetometer
  const _subscribe = () => {
    // Unsubscribe first if already subscribed
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
    }
    Magnetometer.setUpdateInterval(100);
    const sub = Magnetometer.addListener((data) => {
      setMagnetometer(_angle(data));
    });
    setSubscription(sub);
    subscriptionRef.current = sub;
  };

  // Unsubscribe
  const _unsubscribe = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    setSubscription(null);
  };

  // Calculate Angle
  const _angle = (magnetometer) => {
    let angle = 0;
    if (magnetometer) {
      let { x, y } = magnetometer;
      if (Math.atan2(y, x) >= 0) {
        angle = Math.atan2(y, x) * (180 / Math.PI);
      } else {
        angle = (Math.atan2(y, x) + 2 * Math.PI) * (180 / Math.PI);
      }
    }
    return Math.round(angle);
  };

  // Get Location & Address
  const _getLocation = async () => {
    try {
      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);
      
      // Reverse Geocode
      let addressResponse = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });

      if (addressResponse.length > 0) {
        let addr = addressResponse[0];
        // Construct legible address
        let locationName = `${addr.city || addr.subregion || ''}\n${addr.region || addr.country || ''}`;
        setAddress(locationName.trim());
      }
    } catch (e) {
      setAddress("Location Unavailable");
    }
  };

  // Get Cardinal Direction (N, NW, W, etc.)
  const getCardinalDirection = (deg) => {
    const val = Math.floor((deg / 45) + 0.5);
    const arr = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return arr[(val % 8)];
  };

  // Rotate the dial to point North (inverse of heading)
  // Note: To mimic a real compass dial (where N is printed on the card), 
  // we rotate the card so N points to real North.
  // Heading 0 = N is Top. Heading 90 (East) = N should be Left (-90).
  const rotateStyle = {
    transform: [{ rotate: `${-magnetometer}deg` }] 
  };

  return (
    <View style={styles.tabContainer}>
      <View style={styles.headerBar}>
         <Text style={styles.headerTitle}>COMPASS</Text>
      </View>
      
      {/* Black Compass Box matching the image */}
      <View style={styles.compassContainer}>
        <View style={styles.blackCompassBox}>
            {/* The Top Arrow (Fixed) */}
            <View style={styles.topArrow} />

            {/* The Rotating Dial */}
            <Animated.View style={[styles.compassInnerDial, rotateStyle]}>
               {/* Ticks (Simplified representation) */}
               <View style={styles.tickRing} />
               
               {/* Labels */}
               <Text style={[styles.directionTextBold, {top: 15}]}>N</Text>
               <Text style={[styles.directionTextBold, {bottom: 15}]}>S</Text>
               <Text style={[styles.directionTextBold, {left: 15}]}>W</Text>
               <Text style={[styles.directionTextBold, {right: 15}]}>E</Text>
               
               {/* Crosshair */}
               <View style={styles.crosshairVerticalLight} />
               <View style={styles.crosshairHorizontalLight} />
            </Animated.View>

            {/* Numeric Degrees (Static overlay on dial or dynamic) */}
            {/* The user image has numbers inside. We simplify to the 4 points for React Native performance without SVG */}
        </View>
      </View>

      {/* Toggle Section */}
      <View style={styles.locationStatusContainer}>
        <Text style={styles.locationServicesLabel}>Location Services:</Text>
        <View style={styles.toggleRow}>
             <Switch
                trackColor={{ false: "#767577", true: COLORS.primaryLight }}
                thumbColor={isServiceEnabled ? "#f4f3f4" : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                onValueChange={toggleSwitch}
                value={isServiceEnabled}
              />
             <View style={[styles.statusBadge, {backgroundColor: isServiceEnabled ? COLORS.primary : 'gray'}]}>
                <Text style={styles.statusBadgeText}>{isServiceEnabled ? 'ON' : 'OFF'}</Text>
             </View>
        </View>
      </View>

      {/* Location Data Display */}
      <View style={styles.coordsBoxTransparent}>
        <Text style={styles.coordsTitle}>
           {isServiceEnabled ? `${magnetometer}° ${getCardinalDirection(magnetometer)}` : '---'}
        </Text>
        <Text style={styles.coordsSubtitle}>
           {isServiceEnabled ? address : 'Enable location services\nto see your position'}
        </Text>
      </View>

      {/* Distance (Bottom Green Bar from image) */}
      <View style={styles.distanceBar}>
         <Text style={styles.distanceLabel}>DISTANCE:</Text>
         <Text style={styles.distanceValue}>{location ? '0 m' : '--'}</Text>
      </View>
    </View>
  );
};

const ProfileTab = ({ onLogout, username = 'John Doe', userData = {}, isConnected = false }) => {
  const [activeScreen, setActiveScreen] = useState('main'); // main, edit, settings, help, report
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { notifications, unreadCount } = useNotifications();

  const handleLogoutPress = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    onLogout();
  };

  // Edit Profile Screen
  if (activeScreen === 'edit') {
    return (
      <EditProfileScreen 
        userData={userData} 
        onBack={() => setActiveScreen('main')} 
      />
    );
  }

  // Settings Screen
  if (activeScreen === 'settings') {
    return (
      <SettingsScreen 
        onBack={() => setActiveScreen('main')} 
      />
    );
  }

  // Help Screen
  if (activeScreen === 'help') {
    return (
      <HelpScreen 
        onBack={() => setActiveScreen('main')} 
      />
    );
  }

  // Report a Problem Screen
  if (activeScreen === 'report') {
    return (
      <ReportProblemScreen 
        onBack={() => setActiveScreen('main')} 
      />
    );
  }

  // Main Profile Screen
  return (
    <ScrollView style={styles.tabContainer}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarLarge}>
          <User size={40} color="white" />
        </View>
        <Text style={styles.profileName}>Hello!{'\n'}{username}</Text>
      </View>

      {/* Connection Status Card */}
      <View style={styles.connectionCard}>
        <View style={styles.connectionRow}>
          {isConnected ? (
            <Wifi size={20} color={COLORS.primary} />
          ) : (
            <WifiOff size={20} color={COLORS.gray} />
          )}
          <Text style={[styles.connectionText, { color: isConnected ? COLORS.primary : COLORS.gray }]}>
            {isConnected ? 'LoRa Device Connected' : 'LoRa Device Disconnected'}
          </Text>
        </View>
      </View>

      <View style={styles.menuList}>
        <MenuOption icon={User} label="Edit Profile" onPress={() => setActiveScreen('edit')} />
        <MenuOption icon={Settings} label="Settings" onPress={() => setActiveScreen('settings')} />
        <MenuOption icon={HelpCircle} label="Help" onPress={() => setActiveScreen('help')} />
        <MenuOption icon={AlertOctagon} label="Report a Problem" onPress={() => setActiveScreen('report')} />
        <MenuOption icon={LogOut} label="Logout" onPress={handleLogoutPress} danger />
      </View>

      {/* Logout Confirmation Modal */}
      <Modal visible={showLogoutConfirm} transparent animationType="fade">
        <View style={logoutStyles.overlay}>
          <View style={logoutStyles.modal}>
            <View style={logoutStyles.iconContainer}>
              <LogOut size={32} color={COLORS.error} />
            </View>
            <Text style={logoutStyles.title}>Logout</Text>
            <Text style={logoutStyles.message}>Are you sure you want to logout? You'll need to rejoin the lobby.</Text>
            <View style={logoutStyles.buttonRow}>
              <TouchableOpacity 
                style={logoutStyles.cancelButton} 
                onPress={() => setShowLogoutConfirm(false)}
              >
                <Text style={logoutStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={logoutStyles.logoutButton} 
                onPress={confirmLogout}
              >
                <Text style={logoutStyles.logoutButtonText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// Edit Profile Screen
const EditProfileScreen = ({ userData = {}, onBack }) => {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef(null);
  const [firstName, setFirstName] = useState(userData.firstName || '');
  const [lastName, setLastName] = useState(userData.lastName || '');
  const [nickname, setNickname] = useState(userData.nickname || '');
  const [phone, setPhone] = useState(userData.phone || '');
  const [emergencyContact, setEmergencyContact] = useState(userData.emergencyContact || '');
  const [isSaving, setIsSaving] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [emergencyError, setEmergencyError] = useState('');

  const validatePhoneNumber = (number, isRequired = true) => {
    // Remove non-numeric characters for validation
    const cleanNumber = number.replace(/[^0-9]/g, '');
    if (isRequired && cleanNumber.length === 0) {
      return 'Phone number is required';
    }
    if (cleanNumber.length > 0 && cleanNumber.length < 10) {
      return 'Phone number must be at least 10 digits';
    }
    if (cleanNumber.length > 15) {
      return 'Phone number cannot exceed 15 digits';
    }
    return '';
  };

  const checkSameNumbers = (phoneNum, emergencyNum) => {
    const cleanPhone = phoneNum.replace(/[^0-9]/g, '');
    const cleanEmergency = emergencyNum.replace(/[^0-9]/g, '');
    if (cleanPhone.length >= 10 && cleanEmergency.length >= 10 && cleanPhone === cleanEmergency) {
      return 'Emergency contact cannot be the same as your phone number';
    }
    return '';
  };

  const handlePhoneChange = (text) => {
    // Only allow numbers, spaces, dashes, parentheses, and plus sign
    const formatted = text.replace(/[^0-9\s\-\(\)\+]/g, '');
    // Limit to reasonable length (with formatting characters)
    if (formatted.length <= 20) {
      setPhone(formatted);
      const phoneErr = validatePhoneNumber(formatted);
      setPhoneError(phoneErr);
      // Also check if emergency contact matches
      if (!phoneErr && emergencyContact) {
        const sameErr = checkSameNumbers(formatted, emergencyContact);
        if (sameErr) setEmergencyError(sameErr);
        else setEmergencyError(validatePhoneNumber(emergencyContact, false));
      }
    }
  };

  const handleEmergencyChange = (text) => {
    const formatted = text.replace(/[^0-9\s\-\(\)\+]/g, '');
    if (formatted.length <= 20) {
      setEmergencyContact(formatted);
      const emergencyErr = validatePhoneNumber(formatted, false);
      if (emergencyErr) {
        setEmergencyError(emergencyErr);
      } else {
        // Check if same as phone number
        const sameErr = checkSameNumbers(phone, formatted);
        setEmergencyError(sameErr);
      }
    }
  };

  const handleEmergencyFocus = () => {
    // Scroll to make emergency contact visible above keyboard
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 300);
  };

  const handleSave = async () => {
    // Validate before saving
    const phoneValidation = validatePhoneNumber(phone);
    const emergencyValidation = emergencyContact ? validatePhoneNumber(emergencyContact, false) : '';
    const sameNumberError = emergencyContact ? checkSameNumbers(phone, emergencyContact) : '';
    
    if (phoneValidation) {
      setPhoneError(phoneValidation);
      return;
    }
    if (emergencyValidation) {
      setEmergencyError(emergencyValidation);
      return;
    }
    if (sameNumberError) {
      setEmergencyError(sameNumberError);
      return;
    }

    setIsSaving(true);
    try {
      const profileData = { firstName, lastName, nickname, phone, emergencyContact };
      await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profileData));
      Alert.alert('Success', 'Profile updated successfully!');
      onBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={editProfileStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={editProfileStyles.header}>
        <TouchableOpacity onPress={onBack} style={editProfileStyles.backButton}>
          <ChevronLeft size={24} color={COLORS.textDark} />
        </TouchableOpacity>
        <Text style={editProfileStyles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView 
        ref={scrollViewRef}
        style={editProfileStyles.scrollContent}
        contentContainerStyle={[editProfileStyles.scrollContentContainer, { paddingBottom: Math.max(insets.bottom + 100, 150) }]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Avatar Section */}
        <View style={editProfileStyles.avatarSection}>
          <View style={editProfileStyles.avatarLarge}>
            <User size={50} color="white" />
          </View>
          <TouchableOpacity style={editProfileStyles.changePhotoBtn}>
            <Camera size={16} color={COLORS.primary} />
            <Text style={editProfileStyles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        {/* Form Card */}
        <View style={editProfileStyles.formCard}>
          <View style={editProfileStyles.formGroup}>
            <Text style={editProfileStyles.label}>First Name</Text>
            <TextInput
              style={editProfileStyles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Enter first name"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={editProfileStyles.formGroup}>
            <Text style={editProfileStyles.label}>Last Name</Text>
            <TextInput
              style={editProfileStyles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Enter last name"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={editProfileStyles.formGroup}>
            <Text style={editProfileStyles.label}>Nickname</Text>
            <TextInput
              style={editProfileStyles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="Enter nickname"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={editProfileStyles.formGroup}>
            <Text style={editProfileStyles.label}>Phone Number</Text>
            <TextInput
              style={[editProfileStyles.input, phoneError && editProfileStyles.inputError]}
              value={phone}
              onChangeText={handlePhoneChange}
              placeholder="Enter phone number"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
              maxLength={20}
            />
            {phoneError ? <Text style={editProfileStyles.errorText}>{phoneError}</Text> : null}
          </View>

          <View style={editProfileStyles.formGroupLast}>
            <Text style={editProfileStyles.label}>Emergency Contact</Text>
            <TextInput
              style={[editProfileStyles.input, emergencyError && editProfileStyles.inputError]}
              value={emergencyContact}
              onChangeText={handleEmergencyChange}
              onFocus={handleEmergencyFocus}
              placeholder="Emergency contact number"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
              maxLength={20}
            />
            {emergencyError ? <Text style={editProfileStyles.errorText}>{emergencyError}</Text> : null}
          </View>
        </View>

        <TouchableOpacity 
          style={[editProfileStyles.saveButton, isSaving && { opacity: 0.7 }]} 
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={editProfileStyles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// Settings Screen
const SettingsScreen = ({ onBack }) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationSharing, setLocationSharing] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        setNotificationsEnabled(settings.notifications ?? true);
        setLocationSharing(settings.locationSharing ?? true);
        setDarkMode(settings.darkMode ?? false);
        setSoundEnabled(settings.sound ?? true);
        setVibrationEnabled(settings.vibration ?? true);
      }
    } catch (error) {
      console.log('Error loading settings:', error);
    }
  };

  const saveSetting = async (key, value) => {
    try {
      const savedSettings = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      const settings = savedSettings ? JSON.parse(savedSettings) : {};
      settings[key] = value;
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.log('Error saving setting:', error);
    }
  };

  const SettingRow = ({ icon: Icon, label, value, onValueChange, settingKey }) => (
    <View style={settingsStyles.settingRow}>
      <View style={settingsStyles.settingLeft}>
        <Icon size={20} color={COLORS.textDark} />
        <Text style={settingsStyles.settingLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(newValue) => {
          onValueChange(newValue);
          saveSetting(settingKey, newValue);
        }}
        trackColor={{ false: '#d1d5db', true: COLORS.primaryLight }}
        thumbColor={value ? COLORS.primary : '#f4f3f4'}
      />
    </View>
  );

  return (
    <View style={settingsStyles.container}>
      <View style={profileStyles.header}>
        <TouchableOpacity onPress={onBack} style={profileStyles.backButton}>
          <ChevronLeft size={24} color={COLORS.textDark} />
        </TouchableOpacity>
        <Text style={profileStyles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={settingsStyles.content}>
        <Text style={settingsStyles.sectionTitle}>Notifications</Text>
        <View style={settingsStyles.section}>
          <SettingRow 
            icon={Bell} 
            label="Push Notifications" 
            value={notificationsEnabled} 
            onValueChange={setNotificationsEnabled}
            settingKey="notifications"
          />
          <SettingRow 
            icon={MessageSquare} 
            label="Message Alerts" 
            value={soundEnabled} 
            onValueChange={setSoundEnabled}
            settingKey="sound"
          />
        </View>

        <Text style={settingsStyles.sectionTitle}>Privacy & Location</Text>
        <View style={settingsStyles.section}>
          <SettingRow 
            icon={MapPin} 
            label="Share Location" 
            value={locationSharing} 
            onValueChange={setLocationSharing}
            settingKey="locationSharing"
          />
        </View>

        <Text style={settingsStyles.sectionTitle}>Feedback</Text>
        <View style={settingsStyles.section}>
          <SettingRow 
            icon={Bell} 
            label="Vibration" 
            value={vibrationEnabled} 
            onValueChange={setVibrationEnabled}
            settingKey="vibration"
          />
        </View>

        <View style={settingsStyles.infoSection}>
          <Text style={settingsStyles.versionText}>HikeSafe v1.0.0</Text>
          <Text style={settingsStyles.copyrightText}>© 2025 HikeSafe Team</Text>
        </View>
      </ScrollView>
    </View>
  );
};

// Help Screen
const HelpScreen = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const faqs = [
    { 
      q: 'How do I connect to a LoRa device?', 
      a: 'On the initialization screen, make sure your LoRa device is powered on. Tap "Rescan" to find nearby devices, select your device, and tap "Connect".' 
    },
    { 
      q: 'How does location sharing work?', 
      a: 'When you enable location tracking in the Location tab, your GPS coordinates are sent to other lobby members via the LoRa mesh network.' 
    },
    { 
      q: 'What is the range of communication?', 
      a: 'LoRa devices can communicate over several kilometers in open terrain. Range may be reduced in forests or mountainous areas.' 
    },
    { 
      q: 'How do I send an SOS alert?', 
      a: 'In an emergency, use the SOS feature (coming soon) to broadcast your location to all lobby members and emergency contacts.' 
    },
    { 
      q: 'Why can\'t I see other members\' locations?', 
      a: 'Make sure all members have location sharing enabled and are connected to the same LoRa mesh network.' 
    },
  ];

  const [expandedIndex, setExpandedIndex] = useState(null);

  return (
    <View style={helpScreenStyles.container}>
      <View style={helpScreenStyles.header}>
        <TouchableOpacity onPress={onBack} style={helpScreenStyles.backButton}>
          <ChevronLeft size={24} color={COLORS.textDark} />
        </TouchableOpacity>
        <Text style={helpScreenStyles.headerTitle}>Help & FAQ</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView 
        style={helpScreenStyles.scrollContent}
        contentContainerStyle={[helpScreenStyles.scrollContentContainer, { paddingBottom: Math.max(insets.bottom + 20, 120) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={helpScreenStyles.introCard}>
          <View style={helpScreenStyles.introIconContainer}>
            <Info size={24} color={COLORS.primary} />
          </View>
          <Text style={helpScreenStyles.introText}>
            Find answers to common questions about HikeSafe. Can't find what you need? Report a problem.
          </Text>
        </View>

        <Text style={helpScreenStyles.sectionTitle}>Frequently Asked Questions</Text>
        
        {faqs.map((faq, index) => (
          <TouchableOpacity 
            key={index} 
            style={[
              helpScreenStyles.faqItem,
              expandedIndex === index && helpScreenStyles.faqItemExpanded
            ]}
            onPress={() => setExpandedIndex(expandedIndex === index ? null : index)}
            activeOpacity={0.7}
          >
            <View style={helpScreenStyles.faqHeader}>
              <View style={helpScreenStyles.faqIconContainer}>
                <HelpCircle size={18} color={expandedIndex === index ? COLORS.primary : '#9ca3af'} />
              </View>
              <Text style={[
                helpScreenStyles.faqQuestion,
                expandedIndex === index && helpScreenStyles.faqQuestionExpanded
              ]}>{faq.q}</Text>
              <View style={helpScreenStyles.faqChevron}>
                <ChevronRight 
                  size={20} 
                  color={expandedIndex === index ? COLORS.primary : '#9ca3af'} 
                  style={{ transform: [{ rotate: expandedIndex === index ? '90deg' : '0deg' }] }} 
                />
              </View>
            </View>
            {expandedIndex === index && (
              <View style={helpScreenStyles.faqAnswerContainer}>
                <Text style={helpScreenStyles.faqAnswer}>{faq.a}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        <View style={helpScreenStyles.contactSection}>
          <Text style={helpScreenStyles.contactTitle}>Need More Help?</Text>
          <Text style={helpScreenStyles.contactSubtitle}>Our support team is here to assist you</Text>
          <TouchableOpacity style={helpScreenStyles.contactButton}>
            <Mail size={20} color="white" />
            <Text style={helpScreenStyles.contactButtonText}>Contact Support</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

// Report a Problem Screen
const ReportProblemScreen = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const categories = [
    'App Crash',
    'Connection Issue',
    'Location Not Working',
    'Message Not Sending',
    'UI/Display Issue',
    'Feature Request',
    'Other',
  ];

  const handleSubmit = async () => {
    if (!category) {
      Alert.alert('Error', 'Please select a category');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Error', 'Please describe the problem');
      return;
    }

    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSubmitting(false);
    
    Alert.alert(
      'Thank You!',
      'Your report has been submitted. We\'ll look into it as soon as possible.',
      [{ text: 'OK', onPress: onBack }]
    );
  };

  return (
    <KeyboardAvoidingView 
      style={reportStyles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          <View style={profileStyles.header}>
            <TouchableOpacity onPress={onBack} style={profileStyles.backButton}>
              <ChevronLeft size={24} color={COLORS.textDark} />
            </TouchableOpacity>
            <Text style={profileStyles.headerTitle}>Report a Problem</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView 
            style={reportStyles.content}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 20, 40) }}
          >
            <View style={reportStyles.infoCard}>
              <AlertOctagon size={24} color={COLORS.primary} />
              <Text style={reportStyles.infoText}>
                Help us improve HikeSafe by reporting any issues you encounter.
              </Text>
            </View>

            <View style={reportStyles.form}>
              <Text style={reportStyles.label}>Category *</Text>
              <TouchableOpacity 
                style={reportStyles.picker}
                onPress={() => setShowCategoryPicker(true)}
              >
                <Text style={category ? reportStyles.pickerText : reportStyles.pickerPlaceholder}>
                  {category || 'Select a category'}
                </Text>
                <ChevronRight size={20} color={COLORS.gray} />
              </TouchableOpacity>

              <Text style={reportStyles.label}>Description *</Text>
              <TextInput
                style={reportStyles.textArea}
                value={description}
                onChangeText={setDescription}
                placeholder="Please describe the problem in detail..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />

              <TouchableOpacity 
                style={[reportStyles.submitButton, isSubmitting && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={reportStyles.submitButtonText}>Submit Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>

      {/* Category Picker Modal */}
      {/* Category Picker Modal */}
      <Modal visible={showCategoryPicker} transparent animationType="fade">
        <TouchableOpacity 
          style={reportStyles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowCategoryPicker(false)}
        >
          <View style={reportStyles.modalContent}>
            <Text style={reportStyles.modalTitle}>Select Category</Text>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[reportStyles.categoryItem, category === cat && reportStyles.categoryItemSelected]}
                onPress={() => {
                  setCategory(cat);
                  setShowCategoryPicker(false);
                }}
              >
                <Text style={[reportStyles.categoryText, category === cat && { color: COLORS.primary }]}>
                  {cat}
                </Text>
                {category === cat && <CheckCircle size={20} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
};

// Edit Profile Screen Styles
const editProfileStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingBottom: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 10,
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  changePhotoText: {
    marginLeft: 6,
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  formCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  formGroup: {
    marginBottom: 20,
  },
  formGroupLast: {
    marginBottom: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.textDark,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  inputError: {
    borderColor: COLORS.error,
    borderWidth: 1.5,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },
});

// Help Screen Styles
const helpScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingBottom: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 20,
    paddingBottom: 120,
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfccb',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  introIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(132, 204, 22, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  introText: {
    flex: 1,
    marginLeft: 14,
    fontSize: 14,
    color: COLORS.textDark,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 16,
  },
  faqItem: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  faqItemExpanded: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.1,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faqIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
    lineHeight: 21,
  },
  faqQuestionExpanded: {
    color: COLORS.primary,
  },
  faqChevron: {
    marginLeft: 8,
  },
  faqAnswerContainer: {
    marginTop: 14,
    paddingTop: 14,
    paddingLeft: 44,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  faqAnswer: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 22,
  },
  contactSection: {
    marginTop: 32,
    marginBottom: 20,
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  contactSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 18,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  contactButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
  },
});

// Logout Confirmation Styles
const logoutStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  logoutButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: COLORS.error,
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
});

// Profile Screen Styles
const profileStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingBottom: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
  },
  changePhotoText: {
    marginLeft: 6,
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  form: {
    gap: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textDark,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});

// Settings Screen Styles
const settingsStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 15,
    color: COLORS.textDark,
    marginLeft: 12,
  },
  infoSection: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  versionText: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 4,
  },
  copyrightText: {
    fontSize: 12,
    color: '#9ca3af',
  },
});

// Help Screen Styles
const helpStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfccb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  introText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: COLORS.textDark,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 12,
  },
  faqItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
    paddingRight: 10,
  },
  faqAnswer: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  contactSection: {
    marginTop: 30,
    marginBottom: 40,
    alignItems: 'center',
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 12,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  contactButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
});

// Report Problem Screen Styles
const reportStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: COLORS.textDark,
    lineHeight: 20,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 8,
    marginTop: 8,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickerText: {
    fontSize: 15,
    color: COLORS.textDark,
  },
  pickerPlaceholder: {
    fontSize: 15,
    color: '#9ca3af',
  },
  textArea: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textDark,
    minHeight: 150,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 16,
    textAlign: 'center',
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  categoryItemSelected: {
    backgroundColor: '#f0fdf4',
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  categoryText: {
    fontSize: 15,
    color: COLORS.textDark,
  },
});

const MenuOption = ({ icon: Icon, label, onPress, badge, danger }) => (
  <TouchableOpacity style={[styles.menuOption, danger && styles.menuOptionDanger]} onPress={onPress}>
    <Icon size={20} color={danger ? COLORS.error : COLORS.textDark} />
    <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
    {badge && (
      <View style={styles.menuBadge}>
        <Text style={styles.menuBadgeText}>{badge}</Text>
      </View>
    )}
    <ChevronRight size={20} color={danger ? COLORS.error : COLORS.gray} style={{ marginLeft: 'auto' }} />
  </TouchableOpacity>
);

// --- MAIN APP COMPONENT ---

export default function App() {
  // DEBUG: set to true to skip onboarding flows for faster debugging. Remove when done.
  const DEBUG_SKIP_ONBOARDING = true;

  const [screen, setScreen] = useState('init'); // init, onboarding1, onboarding2, lobby, dashboard
  const [showReminder, setShowReminder] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lobbyData, setLobbyData] = useState({ lobbyName: '', groupId: '', maxMember: '' });
  const [userData, setUserData] = useState({ username: '', groupId: '' });
  
  // ====== NOTIFICATION STATE ======
  const [notifications, setNotifications] = useState([]);
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [currentNotification, setCurrentNotification] = useState(null);

  // Load saved notifications on mount
  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      if (saved) {
        setNotifications(JSON.parse(saved));
      }
    } catch (error) {
      console.log('Error loading notifications:', error);
    }
  };

  const saveNotifications = async (notifs) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
    } catch (error) {
      console.log('Error saving notifications:', error);
    }
  };

  const addNotification = (notification) => {
    const newNotif = {
      id: Date.now(),
      ...notification,
      timestamp: new Date().toISOString(),
      read: false,
    };
    const updated = [newNotif, ...notifications].slice(0, 50); // Keep last 50
    setNotifications(updated);
    saveNotifications(updated);
    
    // Show banner
    setCurrentNotification(newNotif);
    setShowNotificationBanner(true);
    Vibration.vibrate(200);
    
    // Auto-hide banner after 3 seconds
    setTimeout(() => {
      setShowNotificationBanner(false);
    }, 3000);
  };

  const clearNotification = (id) => {
    const updated = notifications.filter(n => n.id !== id);
    setNotifications(updated);
    saveNotifications(updated);
  };

  const markAsRead = (id) => {
    const updated = notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    );
    setNotifications(updated);
    saveNotifications(updated);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const notificationContext = {
    notifications,
    addNotification,
    clearNotification,
    markAsRead,
    unreadCount,
  };
  
  // ====== LORA STATE MANAGEMENT ======
  const [connectionState, setConnectionState] = useState(CONNECTION_STATES.DISCONNECTED);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [currentLobby, setCurrentLobby] = useState(null); // { name, channelIdx, secret (16 bytes), lobbyId }
  const [lobbyMembers, setLobbyMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loraError, setLoraError] = useState(null);

  // Set up BLE message listener
  useEffect(() => {
    const handleBleMessage = (code, data) => {
      console.log('BLE message received, code:', code, 'data length:', data?.length);
      
      switch (code) {
        case BLE_CODES.RESP_CODE_OK:
          console.log('BLE: Command OK');
          break;
          
        case BLE_CODES.RESP_CODE_ERR:
          console.log('BLE: Command error');
          break;
          
        case BLE_CODES.RESP_CODE_CHANNEL_INFO:
          // Lobby/channel created successfully
          // Format: [channel_idx(1)][name(32)][secret(16)]
          try {
            if (data && data.length >= 49) {
              const channelIdx = data[0];
              const channelName = Buffer.from(data.slice(1, 33)).toString('utf8').replace(/\0/g, '').trim();
              const channelSecret = Array.from(data.slice(33, 49)); // Store as array of bytes
              
              // Create shareable code: base64 encode the secret
              const secretBase64 = Buffer.from(channelSecret).toString('base64');
              
              console.log('Lobby created! Channel:', channelIdx, 'Name:', channelName);
              console.log('Channel secret (base64):', secretBase64);
              
              // Store lobby info with secret for sharing
              setCurrentLobby(prev => ({
                ...prev,
                channelIdx,
                name: channelName,
                secret: channelSecret,
                secretBase64: secretBase64,
              }));
              
              addNotification({
                type: 'success',
                title: 'Lobby Created',
                message: `Share code: ${secretBase64.slice(0, 8)}...`,
              });
            }
          } catch (e) {
            console.log('Error parsing channel info:', e);
          }
          break;

        case BLE_CODES.RESP_CODE_CONTACT_MSG_RECV:
        case BLE_CODES.RESP_CODE_CONTACT_MSG_RECV_V3:
        case BLE_CODES.RESP_CODE_CHANNEL_MSG_RECV:
        case BLE_CODES.RESP_CODE_CHANNEL_MSG_RECV_V3:
        case BLE_CODES.PUSH_CODE_MSG_WAITING:
          // Incoming text message from LoRa
          try {
            // Parse firmware format:
            // V3 (codes 16, 17): [SNR][reserved][reserved][channel_idx/contact info][path_len][txt_type][timestamp 4 bytes][text...]
            // V2 (codes 7, 8):   [channel_idx/contact info][path_len][txt_type][timestamp 4 bytes][text...]
            // PUSH_CODE_MSG_WAITING is just a notification, no payload
            
            if (code === BLE_CODES.PUSH_CODE_MSG_WAITING) {
              console.log('BLE: MSG_WAITING push received');
              break;
            }
            
            const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
            let offset = 0;
            
            // V3 has 3 extra header bytes
            if (code === BLE_CODES.RESP_CODE_CHANNEL_MSG_RECV_V3 || code === BLE_CODES.RESP_CODE_CONTACT_MSG_RECV_V3) {
              offset = 3;
            }
            
            if (bytes.length < offset + 7) {
              console.log('BLE: message too short');
              break;
            }
            
            const channelIdx = bytes[offset];
            // const pathLen = bytes[offset + 1];
            // const txtType = bytes[offset + 2];
            // const timestamp = bytes[offset + 3] | (bytes[offset + 4] << 8) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 24);
            
            // Text starts at offset + 7
            const textBytes = bytes.slice(offset + 7);
            const msgText = new TextDecoder().decode(textBytes);
            
            console.log('BLE: channel', channelIdx, 'message:', msgText);
            
            // Skip discovery channel messages here (handled by LobbyScreen's listener)
            const DISCOVERY_CHANNEL_IDX = 7;
            if (channelIdx === DISCOVERY_CHANNEL_IDX) {
              console.log('BLE: skipping discovery channel message in main handler');
              break;
            }
            
            const newMsg = {
              id: Date.now(),
              text: msgText,
              sender: 'remote',
              channelIdx: channelIdx,
              time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase(),
            };
            setMessages(prev => [...prev, newMsg]);
            // Add notification
            addNotification({
              type: 'message',
              title: 'New Message',
              message: msgText.length > 30 ? msgText.substring(0, 30) + '...' : msgText,
            });
          } catch (e) {
            console.log('Error parsing message:', e);
          }
          break;
          
        case BLE_CODES.RESP_CODE_SELF_INFO:
          // Device info received
          try {
            const info = JSON.parse(Buffer.from(data).toString('utf8'));
            console.log('Device info:', info);
          } catch (e) {
            console.log('Error parsing device info:', e);
          }
          break;
          
        case BLE_CODES.RESP_CODE_SENT:
        case BLE_CODES.PUSH_CODE_SEND_CONFIRMED:
          // Message sent confirmation
          console.log('Message sent confirmed');
          break;
          
        case BLE_CODES.RESP_CODE_CONTACTS_START:
          // Start of contacts list - clear existing
          console.log('Contacts list starting...');
          setLobbyMembers([]);
          break;
          
        case BLE_CODES.RESP_CODE_END_OF_CONTACTS:
          // End of contacts list
          console.log('Contacts list complete');
          break;
          
        case BLE_CODES.RESP_CODE_CONTACT:
          // Individual contact received
          // Format varies but typically: [pub_key(32)][name...] or JSON
          try {
            // Try to parse as JSON first
            let contact;
            try {
              contact = JSON.parse(Buffer.from(data).toString('utf8'));
            } catch {
              // Binary format - parse pub key and name
              if (data.length >= 32) {
                const pubKeyHex = Buffer.from(data.slice(0, 6)).toString('hex');
                const nameBytes = data.slice(32);
                const name = Buffer.from(nameBytes).toString('utf8').replace(/\0/g, '').trim() || 'Unknown';
                contact = {
                  id: pubKeyHex,
                  name: name,
                  online: true,
                  lastSeen: new Date(),
                };
              }
            }
            if (contact) {
              console.log('Contact received:', contact);
              setLobbyMembers(prev => {
                const exists = prev.find(m => m.id === contact.id);
                if (exists) {
                  return prev.map(m => m.id === contact.id ? { ...m, ...contact, online: true, lastSeen: new Date() } : m);
                }
                return [...prev, { ...contact, online: true, lastSeen: new Date() }];
              });
            }
          } catch (e) {
            console.log('Error parsing contact:', e);
          }
          break;
          
        case BLE_CODES.PUSH_CODE_NEW_ADVERT:
        case BLE_CODES.PUSH_CODE_ADVERT:
          // New device discovered on mesh
          try {
            if (data && data.length >= 32) {
              const pubKeyHex = Buffer.from(data.slice(0, 6)).toString('hex');
              console.log('New advert from:', pubKeyHex);
              // This is just the public key - device is in range
              setLobbyMembers(prev => {
                const exists = prev.find(m => m.id === pubKeyHex);
                if (exists) {
                  return prev.map(m => m.id === pubKeyHex ? { ...m, online: true, lastSeen: new Date() } : m);
                }
                return [...prev, { id: pubKeyHex, name: `Device_${pubKeyHex.slice(0, 4)}`, online: true, lastSeen: new Date() }];
              });
            }
          } catch (e) {
            console.log('Error parsing advert:', e);
          }
          break;
          
        default:
          console.log('BLE unhandled response code:', code);
      }
    };

    // Register the message handler
    bleService.onMessage(handleBleMessage);

    // Cleanup on unmount
    return () => {
      bleService.offMessage(handleBleMessage);
    };
  }, []);

  // LoRa Context value to pass to components
  const loraContext = {
    // State
    connectionState,
    setConnectionState,
    connectedDevice,
    setConnectedDevice,
    availableDevices,
    setAvailableDevices,
    currentLobby,
    setCurrentLobby,
    lobbyMembers,
    setLobbyMembers,
    messages,
    setMessages,
    error: loraError,
    setError: setLoraError,
    
    // Computed
    isConnected: connectionState === CONNECTION_STATES.CONNECTED,
    
    // Actions (integrated with BLE service)
    // Manually trigger a single sync of queued messages from the device
    checkMessagesNow: async () => {
      try {
        await bleService.syncNextMessage();
      } catch (e) {
        console.log('Manual syncNextMessage error:', e?.message || e);
      }
    },

    // destination: number for direct message, 0xFF for channel broadcast
    sendMessage: async (destination, text) => {
      try {
        // Optimistic UI: add message immediately with 'sending' status
        const msgId = Date.now();
        const newMsg = {
          id: msgId,
          text,
          sender: 'me',
          destination,
          status: 'sending', // 'sending' | 'sent' | 'failed'
          time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase(),
        };
        setMessages(prev => [...prev, newMsg]);

        // If broadcasting to lobby, ensure we're actually in a lobby
        if (destination === 0xFF) {
          if (!currentLobby || !currentLobby.id) {
            // Mark message as failed and notify user
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'failed' } : m));
            addNotification({ type: 'error', title: 'Not In Lobby', message: 'Join or create a lobby before sending group messages.' });
            return false;
          }
        }

        // Attempt to send via BLE if connected
        let ok = true;
        if (bleService.isConnected()) {
          if (destination === 0xFF) {
            // Broadcast to lobby channel (group message)
            ok = await bleService.sendChannelTextByIndex(1, text);
          } else {
            // Direct message to specific device
            ok = await bleService.sendText(destination, text);
          }
        } else {
          // Not connected - treat as failed for now
          ok = false;
        }

        // Update message status based on send result
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: ok ? 'sent' : 'failed' } : m));
        if (!ok) {
          addNotification({ type: 'error', title: 'Send Failed', message: 'Message could not be sent over BLE.' });
        }
        return ok;
      } catch (error) {
        console.log('Send message error:', error);
        return false;
      }
    },
    
    sendLocation: async (lat, lon) => {
      try {
        if (bleService.isConnected()) {
          return await bleService.sendGPS(lat, lon);
        }
        return true; // Return true for mock mode
      } catch (error) {
        console.log('Send location error:', error);
        return false;
      }
    },
    
    createLobby: async (lobbyName, groupId, maxMembers) => {
      try {
        if (bleService.isConnected()) {
          await bleService.sendCreateLobby(groupId, '', lobbyName);
        }
        setCurrentLobby({ name: lobbyName, id: groupId, maxMembers: parseInt(maxMembers) });
        // Add notification for lobby creation
        addNotification({
          type: 'lobby',
          title: 'Lobby Created',
          message: `You created lobby "${lobbyName}"`,
        });
        return true;
      } catch (error) {
        console.log('Create lobby error:', error);
        return false;
      }
    },
    
    joinLobby: async (joinCode) => {
      try {
        // Parse join code: lobbyName:base64Secret
        const parts = joinCode.split(':');
        if (parts.length !== 2) {
          console.log('Invalid join code format');
          return false;
        }
        const lobbyName = parts[0];
        const secretBytes = Array.from(Buffer.from(parts[1], 'base64'));
        
        if (bleService.isConnected()) {
          await bleService.sendJoinLobbyWithSecret(lobbyName, secretBytes);
        }
        setCurrentLobby({ id: lobbyName, name: lobbyName });
        // Add notification for joining lobby
        addNotification({
          type: 'lobby',
          title: 'Joined Lobby',
          message: `You joined lobby ${lobbyName}`,
        });
        return true;
      } catch (error) {
        console.log('Join lobby error:', error);
        return false;
      }
    },
    
    sendProfile: async (profileObj) => {
      try {
        if (bleService.isConnected()) {
          return await bleService.sendProfile(profileObj);
        }
        return true;
      } catch (error) {
        console.log('Send profile error:', error);
        return false;
      }
    },
    
    disconnect: async () => {
      try {
        await bleService.disconnect();
        setConnectionState(CONNECTION_STATES.DISCONNECTED);
        setConnectedDevice(null);
      } catch (error) {
        console.log('Disconnect error:', error);
      }
    },
  };

  // --- FLOW HANDLERS ---
  const handleSaveName = (nameData) => {
    setUserData(prev => ({ ...prev, username: nameData.displayName, firstName: nameData.firstName, lastName: nameData.lastName, nickname: nameData.nickname }));
  };

  const handleNextOnboarding = () => setScreen('onboarding2');
  
  const handleShowReminder = () => setShowReminder(true);
  
  const handleAcceptTerms = () => {
    setShowReminder(false);
    setScreen('lobby');
  };

  const handleDeviceConnected = (device) => {
    setConnectedDevice(device);
    setConnectionState(CONNECTION_STATES.CONNECTED);
    // Allow skipping onboarding during debugging
    if (DEBUG_SKIP_ONBOARDING) {
      setScreen('lobby');
    } else {
      setScreen('onboarding1');
    }
  };

  const handleCreateLobbySuccess = async (data) => {
    setLobbyData(data);
    // Note: The actual BLE create with PIN already happened in LobbyScreen
    // This callback just updates state and shows the success modal
    setCurrentLobby({ id: data.groupId, name: data.lobbyName, pin: data.pin });
    setShowSuccess(true);
  };
  
  // Handle joining an existing lobby
  // Note: The actual BLE join with PIN already happened in LobbyScreen
  // This callback just updates the app state after successful join
  const handleJoinLobby = async (data) => {
    if (data && data.username && data.groupId) {
      setUserData({ username: data.username, groupId: data.groupId });
      // Update current lobby state
      setCurrentLobby({ id: data.groupId, name: data.groupId });
    }
    setScreen('dashboard');
  };
  
  const handleEnterDashboard = () => {
    setShowSuccess(false);
    // Set userData from lobbyData for created lobbies
    if (lobbyData.groupId) {
      setUserData(prev => ({ ...prev, groupId: lobbyData.groupId }));
    }
    setScreen('dashboard');
  };

  const handleLogout = () => {
    // Reset user data on logout
    setUserData({ username: '', groupId: '' });
    setCurrentLobby(null);
    setScreen('lobby');
  };

  return (
    <SafeAreaProvider>
      <NotificationContext.Provider value={notificationContext}>
      <LoRaContext.Provider value={loraContext}>
        <ScreenContainer>
          {/* SCREEN RENDERING LOGIC */}
          {screen === 'init' && <Initialization onConnected={handleDeviceConnected} loraContext={loraContext} />}
          {screen === 'onboarding1' && <OnboardingName next={handleNextOnboarding} onSaveName={handleSaveName} />}
          {screen === 'onboarding2' && <OnboardingDetails next={handleShowReminder} onShowReminder={handleShowReminder} />}
          {screen === 'lobby' && <LobbyScreen onLogin={handleJoinLobby} onShowCreateSuccess={handleCreateLobbySuccess} onReconnect={() => setScreen('init')} loraContext={loraContext} />}
          {screen === 'dashboard' && <Dashboard onLogout={handleLogout} userData={userData} lobbyData={lobbyData} loraContext={loraContext} />}

      {/* Notification Banner */}
      {showNotificationBanner && currentNotification && (
        <Animated.View style={notifStyles.banner}>
          <View style={notifStyles.bannerContent}>
            <View style={notifStyles.bannerIcon}>
              {currentNotification.type === 'message' && <MessageCircle size={20} color="white" />}
              {currentNotification.type === 'lobby' && <User size={20} color="white" />}
              {currentNotification.type === 'location' && <MapPin size={20} color="white" />}
              {currentNotification.type === 'alert' && <AlertTriangle size={20} color="white" />}
              {!currentNotification.type && <Bell size={20} color="white" />}
            </View>
            <View style={notifStyles.bannerText}>
              <Text style={notifStyles.bannerTitle}>{currentNotification.title}</Text>
              <Text style={notifStyles.bannerMessage} numberOfLines={1}>{currentNotification.message}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowNotificationBanner(false)} style={notifStyles.bannerClose}>
              <X size={20} color="white" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* --- MODALS --- */}

      {/* 1. HikeSafe Reminder Modal */}
      <Modal visible={showReminder} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentGreen}>
                <Text style={styles.modalTitleWhite}>HikeSafe Reminder</Text>
                <Text style={styles.modalTextWhite}>
                  Before continuing, please read and agree to our {' '}
                  <Text
                    onPress={() => setShowTerms(true)}
                    style={{ textDecorationLine: 'underline', fontWeight: '700' }}
                  >
                    Terms and Conditions
                  </Text>
                  .{"\n"}{"\n"}
                  By tapping "Accept and Continue", you agree that:{'\n'}
                  • You'll use HikeSafe responsibly.{'\n'}
                  • HikeSafe is a tool to assist safety but does not replace personal responsibility.{'\n'}
                </Text>

                <TouchableOpacity style={[styles.buttonWhite, { alignSelf: 'center', width: '80%'}]} onPress={handleAcceptTerms}>
                  <Text style={[styles.buttonTextGreen, {textAlign: 'center'}]}>ACCEPT AND CONTINUE</Text>
                </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 2. Terms Modal */}
      <Modal visible={showTerms} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentGreen}>
            <Text style={[styles.modalTitleWhite, {textAlign: 'center'}]}>Terms and Condition</Text>
            <ScrollView style={{maxHeight: 360, marginVertical: 10}}>
              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>1.</Text>
                  <Text style={styles.modalSectionTitle}>Acceptance of Terms</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  By using the HikeSafe app, you agree to comply with these Terms and Conditions. Please read them carefully before using the app.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>2.</Text>
                  <Text style={styles.modalSectionTitle}>Purpose of the App</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  HikeSafe is designed to help hikers stay safe by offering tools such as GPS tracking, emergency alerts, and route recording. It is intended as a supportive tool not a replacement for personal preparation, awareness, or professional guidance during outdoor activities.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>3.</Text>
                  <Text style={styles.modalSectionTitle}>User Responsibilities</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  • Use HikeSafe responsibly and only for lawful purposes
                  {'\n'}• Ensure your device has enough battery, storage, and connectivity
                  {'\n'}• Provide accurate personal and emergency contact details
                  {'\n'}• Do not misuse the app (e.g., sending false emergency alerts or sharing misleading data)
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>4.</Text>
                  <Text style={styles.modalSectionTitle}>Safety Disclaimer</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  While HikeSafe aims to enhance hiking safety, we do not guarantee complete safety or uninterrupted service. You acknowledge that hiking involves risks, and you are responsible for your own safety and decisions while on the trail.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>5.</Text>
                  <Text style={styles.modalSectionTitle}>Privacy and Data Use</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We collect limited data (such as location, contact, and device information) to provide safety features and improve performance. Your data is used only for app functionality and emergency purposes, and will not be sold to third parties.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>6.</Text>
                  <Text style={styles.modalSectionTitle}>App Updates and Availability</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We may update or modify HikeSafe without prior notice. We do not guarantee that all features will always be available or free of errors.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>7.</Text>
                  <Text style={styles.modalSectionTitle}>Intellectual Property</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  All content, design, and code within HikeSafe are owned by the HikeSafe Team. You may not copy, modify, or redistribute any part of the app without written permission.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>8.</Text>
                  <Text style={styles.modalSectionTitle}>Limitation of Liability</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  HikeSafe and its developers will not be liable for any injury, loss or damage resulting from your use of the app. Use it at your own risk and always practice caution when hiking.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>9.</Text>
                  <Text style={styles.modalSectionTitle}>Termination of Use</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We reserve the right to suspend or terminate access to HikeSafe for violations of these Terms or misuse of the app.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>10.</Text>
                  <Text style={styles.modalSectionTitle}>Contact Us</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  If you have questions about these Terms, please reach out at hikesafe.team@gmail.com
                </Text>
              </View>
            </ScrollView>
            <TouchableOpacity style={[styles.buttonWhite, { alignSelf: 'center', width: '80%'}]} onPress={() => setShowTerms(false)}>
              <Text style={[styles.buttonTextGreen, {textAlign: 'center'}]}>I UNDERSTAND</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3. Lobby Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={styles.cardGreen}>
             <Text style={styles.cardTitleWhite}>Lobby Creation Successful</Text>
             <View style={styles.separatorWhite} />
             <Text style={styles.cardSubtitleWhite}>Your lobby has been successfully created.</Text>
             
             <View style={styles.infoRow}>
               <Text style={styles.infoLabel}>Lobby Name:</Text>
               <Text style={styles.infoValue}>{lobbyData.lobbyName || 'N/A'}</Text>
             </View>
             <View style={styles.infoRow}>
               <Text style={styles.infoLabel}>Max Member:</Text>
               <Text style={styles.infoValue}>{lobbyData.maxMember || 'N/A'}</Text>
             </View>
             
             {/* Show PIN for sharing */}
             {lobbyData.pin && (
               <View style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.2)', padding: 16, borderRadius: 8 }}>
                 <Text style={[styles.infoLabel, { marginBottom: 8, textAlign: 'center' }]}>Share these details with others to join:</Text>
                 
                 <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: 12, borderRadius: 6, marginBottom: 8 }}>
                   <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, textAlign: 'center' }}>Lobby Name</Text>
                   <Text style={[styles.infoValue, { fontSize: 18, fontWeight: 'bold', textAlign: 'center' }]} selectable={true}>
                     {lobbyData.lobbyName}
                   </Text>
                 </View>
                 
                 <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: 12, borderRadius: 6 }}>
                   <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, textAlign: 'center' }}>PIN Code</Text>
                   <Text style={[styles.infoValue, { fontSize: 32, fontWeight: 'bold', textAlign: 'center', letterSpacing: 4 }]} selectable={true}>
                     {lobbyData.pin}
                   </Text>
                 </View>
                 
                 <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
                   Tell others: "Join lobby '{lobbyData.lobbyName}' with PIN {lobbyData.pin}"
                 </Text>
               </View>
             )}
             
             <TouchableOpacity style={styles.buttonWhite} onPress={handleEnterDashboard}>
               <Text style={styles.buttonTextGreen}>GO TO DASHBOARD</Text>
             </TouchableOpacity>
           </View>
        </View>
      </Modal>

        </ScreenContainer>
      </LoRaContext.Provider>
      </NotificationContext.Provider>
    </SafeAreaProvider>
  );
}

// --- NOTIFICATION STYLES ---
const notifStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  bannerMessage: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: 2,
  },
  bannerClose: {
    padding: 4,
  },
});

// --- STYLES ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  backgroundGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: height,
  },
  // Abstract background shapes
  bgTreeLeft: {
    position: 'absolute',
    bottom: 0,
    left: -50,
    width: 200,
    height: 400,
    backgroundColor: '#1a2e05',
    opacity: 0.1,
    transform: [{ rotate: '10deg' }],
    borderTopRightRadius: 100,
  },
  bgTreeRight: {
    position: 'absolute',
    bottom: 0,
    right: -50,
    width: 200,
    height: 350,
    backgroundColor: '#365314',
    opacity: 0.1,
    transform: [{ rotate: '-15deg' }],
    borderTopLeftRadius: 100,
  },
  bgMountain: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: width,
    height: 150,
    backgroundColor: '#ecfccb',
    opacity: 0.8,
  },

  // Layouts
  contentContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
    backgroundColor: 'transparent',
  },

  // Typography
  titleLarge: {
    fontSize: 45,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 30,
    marginTop: -10,
    textAlign: 'center',
    top: 30,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '900',
    color: '#2f4f09', // Darker Moss
    marginTop: 10,
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  logoImage: {
    width: 200,
    height:200,
    resizeMode: 'cover',
    alignSelf: 'center',
    marginBottom: 6,
    overflow: 'visible',
  },
  tagline: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    marginTop: 5,
    fontStyle: 'italic',
    alignItems: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginTop: 20,
    marginBottom: 10,
  },

  // Input
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: COLORS.textDark,
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.textDark,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  inputBox: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  inputWhite: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 10,
    width: '100%',
  },

  hrLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    width: '80%',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  separatorThin: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    width: '100%',
    marginVertical: 12,
    borderRadius: 2,
  },
  cardTitleLarge: {
    fontSize: 28,
    fontWeight: '900',
    color: 'rgba(0,0,0,0.30)',
    alignSelf: 'flex-start',
    width: '100%',
    textTransform: 'uppercase',
    paddingBottom: 4,
  },
  formGrid: {
    width: '100%',
    marginTop: 6,
  },
  fieldRow: {
    marginBottom: 14,
  },
  fieldRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    color: 'white',
    width: '30%',
    fontWeight: '700',
    fontSize: 14,
  },
  inputWhiteRounded: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: '65%',
  },
  createNowButton: {
    backgroundColor: 'white',
    paddingVertical: 12,
    borderRadius: 12,
    alignSelf: 'center',
    width: '60%',
    marginTop: 12,
  },
  createNowText: {
    color: COLORS.primary,
    fontWeight: '800',
    textAlign: 'center',
  },

  // Buttons
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  buttonPrimary: {
    backgroundColor: COLORS.primaryLight,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonTextPrimary: {
    color: 'white',
  },
  buttonWhite: {
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    marginTop: 15,
    marginBottom: 10,
  },
  buttonTextGreen: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  skipButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  skipText: {
    color: COLORS. black,
    fontWeight: '600',
  },
  linkTextWhite: {
    color: 'white',
    fontSize: 12,
    marginTop: 10,
  },

  // Modules/Cards
  cardGreen: {
    backgroundColor: '#65a30d', // Match Figma green
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  cardTitleWhite: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  cardSubtitleWhite: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
    alignItems: 'left',
  },
  cardDescWhite: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 15,
  },
  separatorWhite: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    width: '100%',
    marginVertical: 10,
  },

  // Dashboard Specific
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 14,
    color: COLORS.textDark,
  },
  usernameTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  lobbyCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  lobbyLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  lobbyCode: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 12,
    padding: 10,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statValue: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  signalIcon: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 14,
    marginTop: 4,
    gap: 2,
  },
  bar: {
    width: 3,
    backgroundColor: 'white',
    borderRadius: 1,
  },
  
  // Services Grid
  servicesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  serviceItem: {
    alignItems: 'center',
  },
  serviceIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#d9f99d',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  serviceText: {
    fontSize: 12,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  
  // Recent Activity
  activityCard: {
    minHeight: 60,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    justifyContent: 'center',
  },
  activityText: {
    fontSize: 14,
    color: COLORS.textDark,
  },
  
  // Connection Status
  connectionStatus: {
    marginTop: 15,
  },
  connectionCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  
  // Member name in location
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
  },

  // Tab Nav
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 10,
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    position: 'absolute',
    bottom: 0,
    width: width,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    marginTop: 4,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)', // Dim background
    justifyContent: 'center',
    padding: 24,
  },
  modalContentGreen: {
    backgroundColor: '#4d7c0f',
    borderRadius: 16,
    padding: 26,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  modalTitleWhite: {
    fontSize: 25,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  modalTextWhite: {
    fontSize: 14,
    color: 'white',
    lineHeight: 20,
  },
  modalNumber: {
    width: 24,
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSectionTitle: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
  },
  modalParagraph: {
    color: 'white',
    lineHeight: 20,
    marginLeft: 23,
    marginBottom: 8,
    fontSize: 13,
    textAlign: 'justify',
  },
  lobbyCreateBg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },

  // Utils
  headerSpacer: { height: 60 },
  logoSection: { alignItems: 'center', marginBottom: 40, marginTop: 60 },
  illustrationSpace: { alignItems: 'center', marginVertical: 30 },
  footer: { marginTop: 'auto' },
  // Used to vertically center the form on onboarding screens
  centeredForm: {
    flex: 1,
    justifyContent: 'center',
  },
  // Center a whole screen's content
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Specific layout for onboarding details form
  detailForm: {
    width: '100%',
    maxWidth: 520,
    top: 60,
    marginVertical: 20,
  },
  detailTitle: {
    textAlign: 'center',
    marginBottom: 5,
  },
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dropdownModalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 0,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#111',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: 'white',
  },
  checkboxTick: {
    color: COLORS.primary,
    fontWeight: '900',
    fontSize: 14,
  },
  errorText: {
    color: '#ef4444',
    marginTop: 4,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  errorTextWhite: {
    color: '#fecaca',
    marginTop: 6,
    marginLeft: '35%',
    fontSize: 12,
    fontWeight: '600',
  },
  errorTextRed: {
    color: '#ef4444',
    marginTop: 4,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  inputError: {
    borderColor: '#ef4444',
    borderWidth: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelSmall: {
    fontSize: 12,
    color: COLORS.textDark,
  },
  
  // Location Tab
  headerBar: {
    backgroundColor: '#d9f99d',
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 15,
  },
  headerTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: COLORS.textDark,
    textTransform: 'uppercase',
  },
  userLocationRow: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  avatarSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  locationText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textDark,
    fontWeight: '600'
  },
  
  // Message Tab
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  chatName: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center'
  },
  
  // --- UPDATED COMPASS STYLES ---
  tabContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  compassContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  // The Black Rounded Square Box from the image
  blackCompassBox: {
    width: 280,
    height: 280,
    backgroundColor: 'black',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  // The fixed red/white arrow at the top center of the black box
  topArrow: {
    position: 'absolute',
    top: 15,
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'white',
    zIndex: 10,
  },
  // The rotating part
  compassInnerDial: {
    width: 240,
    height: 240,
    borderRadius: 120,
    alignItems: 'center',
    justifyContent: 'center',
    // borderWidth: 2,
    // borderColor: '#333',
  },
  // The ticks around the circle
  tickRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: 'white',
    borderStyle: 'dashed', // Simulates ticks
    opacity: 0.5,
  },
  directionTextBold: {
    position: 'absolute',
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white'
  },
  crosshairVerticalLight: {
    position: 'absolute',
    width: 2,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)'
  },
  crosshairHorizontalLight: {
    position: 'absolute',
    width: 40,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)'
  },

  // Status and Toggle
  locationStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 10
  },
  locationServicesLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold'
  },

  // Coordinates and Location Text
  coordsBoxTransparent: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  coordsTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.textDark,
    marginBottom: 5
  },
  coordsSubtitle: {
    textAlign: 'center',
    fontSize: 16,
    color: COLORS.textDark,
    fontWeight: '600',
    opacity: 0.8
  },

  // Distance Bar (Green bar at bottom of compass tab)
  distanceBar: {
    backgroundColor: COLORS.primaryLight,
    padding: 15,
    marginHorizontal: 0,
    marginTop: 'auto',
    marginBottom: 60, // Space for nav bar
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30
  },
  distanceLabel: {
    color: 'white',
    fontWeight: '900',
    fontSize: 18,
    textTransform: 'uppercase'
  },
  distanceValue: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18
  },

  // Profile Tab
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 40
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    borderWidth: 4,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    elevation: 5
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: COLORS.textDark
  },
  menuList: {
    paddingHorizontal: 20
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    elevation: 1
  },
  menuOptionDanger: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  menuLabel: {
    marginLeft: 15,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textDark
  },
  menuLabelDanger: {
    color: COLORS.error,
  },
  
  // Lobby Modal Info
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
    paddingBottom: 5
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14
  },
  infoValue: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14
  }
});