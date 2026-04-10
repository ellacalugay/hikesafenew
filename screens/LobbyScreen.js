import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, Keyboard, Image, ImageBackground, Alert, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// remember persistence moved to LobbyContext
import { styles } from '../styles/styles';
import { InputField, MainButton } from '../components/shared';
import { useTheme } from '../context/ThemeContext';
import { useLobby } from '../context/LobbyContext';
import { useBluetoothDevice } from '../context/BluetoothContext';

const LobbyScreen = ({ onLogin, onShowCreateSuccess }) => {
  const { colors } = useTheme();
  const {
    createLobby,
    joinLobby,
    syncLobbyToDevice,
    lobbyCode,
    isInLobby,
    isHost,
    lobbyMembers,
    myDeviceId,
    transferHostToFirstJoined,
    clearNicknames,
    rememberEnabled,
    rememberedUsername,
    rememberedJoinCode,
    setRememberEnabled,
    saveRememberData,
    clearRememberData,
    myNickname,
  } = useLobby();
  const { sendCommand, isConnected, statusMessage, memberLocations } = useBluetoothDevice();
  
  // For tracking lobby validation
  const [validationState, setValidationState] = useState(null); // null, 'syncing', 'verifying', 'confirmed'
  const pendingJoinRef = useRef(null);
  const validationTimeoutRef = useRef(null);
  const validationStateRef = useRef(null); // Ref to track current state for timeout callbacks
  
  // Keep ref in sync with state
  useEffect(() => {
    validationStateRef.current = validationState;
  }, [validationState]);

  const startLobbyVerification = useCallback((expectedCode) => {
    if (!pendingJoinRef.current) return;
    if (!expectedCode) return;

    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
      validationTimeoutRef.current = null;
    }

    const nonce = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    pendingJoinRef.current.nonce = nonce;
    setValidationState('verifying');

    sendCommand && sendCommand(`VERIFY_LOBBY:${expectedCode},${nonce}`);

    validationTimeoutRef.current = setTimeout(() => {
      if (validationStateRef.current === 'verifying') {
        setIsSubmitting(false);
        setValidationState(null);
        pendingJoinRef.current = null;
        Alert.alert(
          'Lobby Not Found',
          'No devices responded for this lobby code. Make sure the host device is powered on and nearby, then try again.'
        );
      }
    }, 6000);
  }, [sendCommand]);
  
  const [mode, setMode] = useState('join');
  // remember flag is managed in LobbyContext
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Create mode fields
  const [lobbyName, setLobbyName] = useState('');
  const [maxMember, setMaxMember] = useState('10');
  
  // Join mode fields
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Initialize local fields.
  // Username is sourced from onboarding nickname and is not editable.
  useEffect(() => {
    const nextName = (myNickname || rememberedUsername || '').toString();
    if (nextName && nextName !== username) setUsername(nextName);
    if (rememberEnabled && rememberedJoinCode) setJoinCode(rememberedJoinCode);
  }, [rememberEnabled, rememberedUsername, rememberedJoinCode, myNickname, username]);

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

  const getJoinButtonText = () => {
    if (!isSubmitting) return 'Enter Lobby';
    if (validationState === 'syncing') return 'Syncing to device...';
    if (validationState === 'verifying') return 'Verifying lobby...';
    if (validationState === 'confirmed') return 'Entering...';
    return 'Joining...';
  };

  // Monitor for device confirmation (STATUS:LOBBY_SET)
  useEffect(() => {
    if (validationState !== 'syncing') return;
    if (!statusMessage) return;
    if (!pendingJoinRef.current) return;

    // Accept both the friendly status text and the raw firmware token.
    const matchFriendly = statusMessage.match(/Lobby\s(\d{4})\ssynced\sto\sdevice/i);
    const matchRaw = statusMessage.match(/^(?:STATUS:)?LOBBY_SET,(\d{4})/i);
    const confirmedCode = matchFriendly
      ? parseInt(matchFriendly[1], 10)
      : (matchRaw ? parseInt(matchRaw[1], 10) : null);
    const expectedCode = pendingJoinRef.current?.code;

    if (confirmedCode && expectedCode && confirmedCode === expectedCode) {
      startLobbyVerification(expectedCode);
    }
  }, [statusMessage, validationState, startLobbyVerification]);

  // Monitor for device-side verification success (STATUS:LOBBY_VERIFIED,...)
  useEffect(() => {
    if (validationState !== 'verifying') return;
    if (!statusMessage) return;
    if (!pendingJoinRef.current?.nonce) return;

    const parts = statusMessage.split(',');
    if (parts.length < 3) return;
    if (parts[0] !== 'LOBBY_VERIFIED') return;

    const verifiedCode = parseInt(parts[1], 10);
    const verifiedNonce = (parts[2] || '').trim();
    const expectedCode = pendingJoinRef.current?.code;

    if (!Number.isNaN(verifiedCode) && expectedCode && verifiedCode === expectedCode && verifiedNonce === pendingJoinRef.current.nonce) {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
        validationTimeoutRef.current = null;
      }

      setValidationState('confirmed');
      completeJoin(true);
    }
  }, [statusMessage, validationState]);

  const completeJoin = async (membersFound) => {
    if (!pendingJoinRef.current) return;
    
    const { code, name } = pendingJoinRef.current;
    
    try {
      const numericCode = typeof code === 'string' ? parseInt(code, 10) : code;

      // If switching from an existing lobby, hand off admin/host locally (if possible)
      // and clear per-lobby nickname state so it doesn't leak into the new lobby.
      const isSwitching = Boolean(isInLobby && lobbyCode && lobbyCode !== numericCode);
      if (isSwitching) {
        try {
          const othersOnline = (lobbyMembers || [])
            .filter(m => m && !m.isOffline)
            .filter(m => m.deviceId !== null && m.deviceId !== undefined)
            .filter(m => myDeviceId === null || myDeviceId === undefined ? true : m.deviceId !== myDeviceId);

          if (isHost && othersOnline.length > 0) {
            await transferHostToFirstJoined(myDeviceId ?? null);
          }

          await clearNicknames();
        } catch (e) {
          // Best-effort only; do not block joining the new lobby.
          console.log('Switch lobby cleanup failed:', e);
        }
      }

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

    // Require device connection to create lobby (lobby code must be synced to the LoRa device).
    if (!isConnected) {
      Alert.alert(
        'Device Required',
        'You must connect to your HikeSafe device before creating a lobby. The lobby code is synced to your device for LoRa communication.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setIsSubmitting(true);
    try {
      const code = await createLobby(lobbyName.trim(), parseInt(maxMember) || 10);
      
      // Try syncing lobby code to device, but do not hard-fail lobby creation on temporary BLE drops.
      if (isConnected) {
        const success = await syncLobbyToDevice(sendCommand, code, { asHost: true });
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
    
    // Require device connection to join lobby (device verifies code was set).
    if (!isConnected) {
      Alert.alert(
        'Device Required',
        'Connect to your HikeSafe device before joining. The lobby code must be synced to the device for LoRa communication.',
        [{ text: 'OK' }]
      );
      return;
    }

    // If this phone is already in a lobby, joining a different code will change the
    // lobby on the connected LoRa device. Show a confirmation, but always allow
    // the user to proceed if they choose.
    if (isInLobby && lobbyCode && lobbyCode !== code) {
      Alert.alert(
        'Change Lobby?',
        `You are currently in lobby ${lobbyCode}. Joining lobby ${code} will change the lobby on your connected LoRa device and may affect other phones sharing it.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Change Lobby', style: 'destructive', onPress: () => performJoinLobby() },
        ]
      );
      return;
    }

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
      const parsedCode = parseInt(joinCode, 10);

      // Send lobby code to device first.
      const success = await syncLobbyToDevice(sendCommand, parsedCode);
      if (!success) {
        setIsSubmitting(false);
        setValidationState(null);
        pendingJoinRef.current = null;
        Alert.alert('Error', 'Failed to sync lobby code to device. Please try again.');
        return;
      }

      // Fallback: some firmware builds may not emit STATUS:LOBBY_SET. If we don't get a
      // confirmation quickly, proceed to VERIFY_LOBBY anyway and rely on the verify ACK.
      setTimeout(() => {
        const expected = pendingJoinRef.current?.code;
        if (validationStateRef.current === 'syncing' && expected && expected === parsedCode) {
          startLobbyVerification(expected);
        }
      }, 1200);

      // Wait for device confirmation via STATUS:LOBBY_SET,<code>
      // If no confirmation within 5 seconds, fail.
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }

      validationTimeoutRef.current = setTimeout(() => {
        if (validationStateRef.current === 'syncing') {
          // If we somehow didn't transition to verifying, fail here.
          setIsSubmitting(false);
          setValidationState(null);
          pendingJoinRef.current = null;
          Alert.alert('Error', 'Unable to verify lobby. Please try again.');
        }
      }, 8000);
      
    } catch (error) {
      Alert.alert('Error', 'Failed to join lobby: ' + error.message);
      setIsSubmitting(false);
      setValidationState(null);
      pendingJoinRef.current = null;
    }
  };

  // (button text function moved above to support verify state)

  return (
    <ImageBackground
      source={require('../assets/forest_bg 1.png')}
      style={styles.lobbyCreateBg}
      resizeMode="cover"
    >
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={{ flex: 1 }}>
              {mode === 'create' ? (
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
                          placeholderTextColor={colors.gray}
                          value={lobbyName}
                          onChangeText={setLobbyName}
                        />
                      </View>

                      <View style={styles.fieldRow}>
                        <Text style={styles.fieldLabel} numberOfLines={1}>Max Members</Text>
                        <TextInput
                          style={styles.inputWhiteRounded}
                          placeholder="10"
                          placeholderTextColor={colors.gray}
                          keyboardType="numeric"
                          value={maxMember}
                          onChangeText={setMaxMember}
                          maxLength={2}
                        />
                      </View>

                      <View style={styles.fieldRow}>
                        <Text style={[styles.fieldLabel, { opacity: 0.7 }]}>Lobby Code</Text>
                        <View
                          style={[
                            styles.inputWhiteRounded,
                            {
                              backgroundColor: colors.glassOverlay,
                              borderWidth: 1,
                              borderColor: colors.glassBorder,
                              justifyContent: 'center',
                            },
                          ]}
                        >
                          <Text style={{ color: colors.gray, fontStyle: 'italic' }}>Auto-generated (4 digits)</Text>
                        </View>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[styles.createNowButton, isSubmitting && { opacity: 0.7 }]}
                      onPress={handleCreateLobby}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <Text style={styles.createNowText}>CREATE NOW</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setMode('join')} style={{ marginTop: 8 }}>
                      <Text style={styles.linkTextWhite}>
                        Already have a Lobby?{' '}
                        <Text style={{ fontWeight: 'bold', color: colors.accent, textDecorationLine: 'underline' }}>Click Here</Text>
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.contentContainer}>
                  <View style={styles.logoSection}>
                    <Image source={require('../assets/hike.png')} style={styles.logoImage} />
                    <Text style={styles.tagline}>"Stay connected. Stay safe."</Text>
                  </View>

                  <View style={[styles.formSection, { top: -10, width: '80%', alignSelf: 'center' }]}> 
                    <InputField 
                      placeholder="Your Name" 
                      value={username}
                      onChangeText={setUsername}
                      editable={false}
                    />
                    <InputField 
                      placeholder="Lobby Code (4 digits)" 
                      value={joinCode}
                      onChangeText={setJoinCode}
                      keyboardType="numeric"
                      maxLength={4}
                    />
                    
                    <Text style={[localStyles.infoText, { color: colors.textLight, opacity: 0.8 }]}>
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
                        style={[
                          styles.checkbox,
                          rememberEnabled
                            ? { backgroundColor: colors.accent, borderColor: colors.accent }
                            : { borderColor: colors.textLight },
                        ]}
                      >
                        {rememberEnabled && <Text style={{ color: colors.background, fontWeight: '900', fontSize: 14 }}>✓</Text>}
                      </TouchableOpacity>
                      <Text style={[styles.labelSmall, { color: colors.textLight, fontWeight: '600', marginLeft: 8 }]}>Remember me</Text>
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
                    <Text style={{ color: colors.textLight, fontWeight: '600', textAlign: 'center' }}>
                      Do you want to create a Lobby?{' '}
                      <Text style={{ color: colors.accent, fontWeight: 'bold' }}>Create Here.</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
