import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, ImageBackground, Alert, ActivityIndicator, StyleSheet } from 'react-native';
// remember persistence moved to LobbyContext
import { styles } from '../styles/styles';
import { InputField, MainButton } from '../components/shared';
import { useTheme } from '../context/ThemeContext';
import { useLobby } from '../context/LobbyContext';
import { useBluetoothDevice } from '../context/BluetoothContext';

const LobbyScreen = ({ onLogin, onShowCreateSuccess }) => {
  const { colors } = useTheme();
  const { createLobby, joinLobby, syncLobbyToDevice, lobbyCode, isInLobby, rememberEnabled, rememberedUsername, rememberedJoinCode, setRememberEnabled, saveRememberData, clearRememberData } = useLobby();
  const { sendCommand, isConnected, statusMessage, memberLocations } = useBluetoothDevice();
  
  // For tracking lobby validation
  const [validationState, setValidationState] = useState(null); // null, 'syncing', 'waiting', 'confirmed'
  const pendingJoinRef = useRef(null);
  const validationTimeoutRef = useRef(null);
  const validationStateRef = useRef(null); // Ref to track current state for timeout callbacks
  
  // Keep ref in sync with state
  useEffect(() => {
    validationStateRef.current = validationState;
  }, [validationState]);
  
  const [mode, setMode] = useState('join');
  // remember flag is managed in LobbyContext
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Create mode fields
  const [lobbyName, setLobbyName] = useState('');
  const [maxMember, setMaxMember] = useState('10');
  
  // Join mode fields
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // initialize local fields from remembered data
  useEffect(() => {
    if (rememberEnabled) {
      if (rememberedUsername) setUsername(rememberedUsername);
      if (rememberedJoinCode) setJoinCode(rememberedJoinCode);
    }
  }, [rememberEnabled, rememberedUsername, rememberedJoinCode]);

  // Persist when username/joinCode change and remember is enabled
  useEffect(() => {
    if (rememberEnabled) {
      saveRememberData(username, joinCode).catch(e => console.error(e));
    }
  }, [username, joinCode, rememberEnabled, saveRememberData]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // Monitor for device confirmation (STATUS:LOBBY_SET)
  useEffect(() => {
    if (validationState === 'syncing' && statusMessage && statusMessage.includes('Lobby') && statusMessage.includes('synced to device')) {
      // Device confirmed the lobby code was set - enter immediately
      // Note: Other members will appear when their heartbeats arrive (every ~30 seconds)
      setValidationState('confirmed');
      completeJoin(true);
    }
  }, [statusMessage, validationState]);

  const completeJoin = async (membersFound) => {
    if (!pendingJoinRef.current) return;
    
    const { code, name } = pendingJoinRef.current;
    
    try {
      const numericCode = typeof code === 'string' ? parseInt(code, 10) : code;
      await joinLobby(numericCode, name);
      setValidationState(null);
      pendingJoinRef.current = null;
      onLogin();
    } catch (error) {
      Alert.alert('Error', 'Failed to join lobby: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateLobby = async () => {
    if (!lobbyName.trim()) {
      Alert.alert('Error', 'Please enter a lobby name');
      return;
    }

    // Require device connection to create lobby
    // TEMPORARILY BYPASSED FOR UI TESTING
    // if (!isConnected) {
    //   Alert.alert(
    //     'Device Required',
    //     'You must connect to your HikeSafe device before creating a lobby. The lobby code is synced to your device for LoRa communication.',
    //     [{ text: 'OK' }]
    //   );
    //   return;
    // }
    
    setIsSubmitting(true);
    try {
      const code = await createLobby(lobbyName.trim(), parseInt(maxMember) || 10);
      
      // Try syncing lobby code to device, but do not hard-fail lobby creation on temporary BLE drops.
      if (isConnected) {
        const success = await syncLobbyToDevice(sendCommand, code);
        if (!success) {
          Alert.alert(
            'Lobby Created',
            'Lobby was created, but device sync is pending. Keep Bluetooth connected and it will retry automatically.'
          );
        }
      }
      
      onShowCreateSuccess({ 
        lobbyName: lobbyName.trim(), 
        groupId: code.toString(), 
        maxMember: maxMember || '10' 
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to create lobby: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinLobby = async () => {
    if (!joinCode.trim()) {
      Alert.alert('Error', 'Please enter a lobby code');
      return;
    }
    
    if (joinCode.length !== 4 || isNaN(parseInt(joinCode))) {
      Alert.alert('Error', 'Lobby code must be 4 digits');
      return;
    }

    const code = parseInt(joinCode, 10);
    if (code < 1000 || code > 9999) {
      Alert.alert('Error', 'Lobby code must be between 1000 and 9999');
      return;
    }
    
    // Require device connection to join lobby
    // TEMPORARILY BYPASSED FOR UI TESTING
    // if (!isConnected) {
    //   Alert.alert(
    //     'Device Required',
    //     'You must connect to your HikeSafe device before joining a lobby. The lobby code is synced to your device for LoRa communication.',
    //     [{ text: 'OK' }]
    //   );
    //   return;
    // }
    
    // Start validation process
    performJoinLobby();
  };
  
  const performJoinLobby = async () => {
    setIsSubmitting(true);
    setValidationState('syncing');
    
    // Store pending join info
    pendingJoinRef.current = {
      code: parseInt(joinCode, 10),
      name: username.trim() || 'Hiker'
    };
    
    try {
      // TEMPORARILY BYPASSED FOR UI TESTING
      // Send lobby code to device first (skip if not connected)
      if (isConnected) {
        const parsedCode = parseInt(joinCode, 10);
        const success = await syncLobbyToDevice(sendCommand, parsedCode);
        if (!success) {
          // Allow entering lobby even if BLE link briefly drops; sync can resume on reconnect.
          setValidationState('confirmed');
          completeJoin(false);
          Alert.alert(
            'Joined Lobby',
            'Joined lobby, but device sync is pending. Reconnect Bluetooth to sync lobby code.'
          );
          return;
        }
        
        // Wait for device confirmation via statusMessage effect
        // If no confirmation within 5 seconds, fail
        setTimeout(() => {
          if (validationStateRef.current === 'syncing') {
            setIsSubmitting(false);
            setValidationState(null);
            pendingJoinRef.current = null;
            Alert.alert('Error', 'Device did not confirm lobby code. Please try again.');
          }
        }, 5000);
      } else {
        // No device - skip validation and join directly
        setValidationState('confirmed');
        completeJoin(true);
      }
      
    } catch (error) {
      Alert.alert('Error', 'Failed to join lobby: ' + error.message);
      setIsSubmitting(false);
      setValidationState(null);
      pendingJoinRef.current = null;
    }
  };

  // Get appropriate button text based on validation state
  const getJoinButtonText = () => {
    if (!isSubmitting) return 'Enter Lobby';
    if (validationState === 'syncing') return 'Syncing to device...';
    if (validationState === 'confirmed') return 'Entering...';
    return 'Joining...';
  };

  if (mode === 'create') {
    return (
      <ImageBackground
        source={require('../assets/forest_bg 1.png')}
        style={styles.lobbyCreateBg}
        resizeMode="cover"
      >
        <View style={styles.centerContent}>
          <View style={styles.cardGreen}>
            <Text style={styles.cardTitleLarge}>CREATE A LOBBY</Text>
            <View style={styles.separatorThin} />

            <Text style={[styles.cardSubtitleWhite, { textAlign: 'left', alignSelf: 'flex-start', fontSize: 20 }]}>Welcome to HIKESAFE!</Text>
            <Text style={[styles.cardDescWhite, { textAlign: 'left', alignSelf: 'flex-start' }]} numberOfLines={2}>Create a lobby and share the code with your group members.</Text>
            <View style={styles.separatorThin} />

            <View style={styles.formGrid}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Lobby Name</Text>
                <TextInput 
                  style={styles.inputWhiteRounded} 
                  placeholder="Enter lobby name" 
                  placeholderTextColor="rgba(0,0,0,0.35)"
                  value={lobbyName}
                  onChangeText={setLobbyName}
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel} numberOfLines={1}>Max Members</Text>
                <TextInput 
                  style={styles.inputWhiteRounded} 
                  placeholder="10" 
                  placeholderTextColor="rgba(0,0,0,0.35)" 
                  keyboardType="numeric"
                  value={maxMember}
                  onChangeText={setMaxMember}
                  maxLength={2}
                />
              </View>
              
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { opacity: 0.7 }]}>Lobby Code</Text>
                <View style={[styles.inputWhiteRounded, { backgroundColor: 'rgba(255,255,255,0.5)', justifyContent: 'center' }]}>
                  <Text style={{ color: 'rgba(0,0,0,0.5)', fontStyle: 'italic' }}>Auto-generated (4 digits)</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.createNowButton, isSubmitting && { opacity: 0.7 }]} 
              onPress={handleCreateLobby}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#1B4332" />
              ) : (
                <Text style={styles.createNowText}>CREATE NOW</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setMode('join')} style={{marginTop: 8}}>
               <Text style={styles.linkTextWhite}>Already have a Lobby? <Text style={{fontWeight: 'bold', color: 'green', textDecorationLine: 'underline'}}>Click Here</Text></Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground
      source={require('../assets/forest_bg 1.png')}
      style={styles.lobbyCreateBg}
      resizeMode="cover"
    >
      <View style={styles.contentContainer}>
          <View style={styles.logoSection}>
            <Image source={require('../assets/hike.png')} style={styles.logoImage} />
            <Text style={styles.tagline}>"Stay connected. Stay safe."</Text>
          </View>

        <View style={[styles.formSection, { top:-10, width: '80%', alignSelf: 'center' }]}> 
          <InputField 
            placeholder="Your Name" 
            value={username}
            onChangeText={setUsername}
          />
          <InputField 
            placeholder="Lobby Code (4 digits)" 
            value={joinCode}
            onChangeText={setJoinCode}
            keyboardType="numeric"
            maxLength={4}
          />
          
          <Text style={localStyles.infoText}>
            Get the 4-digit code from your group leader who created the lobby.
          </Text>
          
          <View style={styles.row}>
            <TouchableOpacity
              onPress={async () => {
                const next = !rememberEnabled;
                await setRememberEnabled(next);
                if (next) {
                  await saveRememberData(username, joinCode);
                } else {
                  await clearRememberData();
                }
              }}
              style={[styles.checkbox, rememberEnabled ? styles.checkboxChecked : null]}
            >
              {rememberEnabled && <Text style={styles.checkboxTick}>✓</Text>}
            </TouchableOpacity>
            <Text style={[styles.labelSmall, { color: 'white', fontWeight: '600', marginLeft: 8 }]}>Remember me</Text>
          </View>
          <View style={[styles.hrLine, { marginTop: 30 }]} />
        </View>

        <MainButton 
          title={getJoinButtonText()} 
          onPress={handleJoinLobby} 
          style={{ top: -30, width: '80%', alignSelf: 'center' }} 
          disabled={isSubmitting}
        />
        
        <TouchableOpacity
          onPress={() => setMode('create')}
          style={{ marginTop: 20, alignItems: 'center' }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: colors.primary, fontWeight: '600', textAlign: 'center' }}>
            Do you want to create a Lobby?{' '}
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Create Here.</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
};

const localStyles = StyleSheet.create({
  infoText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
    fontStyle: 'italic',
  },
});

export default LobbyScreen;
