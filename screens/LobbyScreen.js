import React, { useState, useEffect, useRef } from 'react';
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
    const [isSubmitting, setIsSubmitting] = useState(false);
  const { createLobby, joinLobby, syncLobbyToDevice, lobbyCode, isInLobby, rememberEnabled, rememberedUsername, rememberedJoinCode, setRememberEnabled, saveRememberData, clearRememberData, myNickname } = useLobby();
  const { sendCommand, isConnected, statusMessage, memberLocations } = useBluetoothDevice();
  
    // Create mode fields
  const [mode, setMode] = useState('join');
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
    return isSubmitting ? 'Joining...' : 'Enter Lobby';
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
        'You must connect to your HikeSafe device before creating a lobby.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setIsSubmitting(true);
    try {
      const code = await createLobby(lobbyName.trim(), parseInt(maxMember) || 10);
      
      // Try syncing lobby code to device
      const success = await syncLobbyToDevice(sendCommand, code, { asHost: true });
      if (!success) {
        Alert.alert(
          'Lobby Created',
          'Lobby was created locally, but device sync failed. Keep Bluetooth connected and it will retry automatically.'
        );
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
    if (!isConnected) {
      Alert.alert(
        'Device Required',
        'Connect to your HikeSafe device before joining.',
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
    
    performJoinLobby();
  };
  
    const performJoinLobby = async () => {
    setIsSubmitting(true);
    
    try {
      const parsedCode = parseInt(joinCode, 10);
      const success = await syncLobbyToDevice(sendCommand, parsedCode);
      
      // We don't call joinLobby() here yet because the hardware is doing a 5-second discovery search.
      // If the hardware finds the lobby, it will send STATUS:LOBBY_VERIFIED.
      // If it doesn't, it sends ERROR:LOBBY_NOT_FOUND which BluetoothContext will show as an Alert.
      
    } catch (error) {
      Alert.alert('Error', 'Failed to join lobby: ' + error.message);
      setIsSubmitting(false);
    }
  };

  // Listen for the verification success to actually transition the UI
  useEffect(() => {
    if (!isSubmitting) return;
    if (!statusMessage) return;

    if (statusMessage.startsWith('LOBBY_VERIFIED,')) {
      const code = parseInt(statusMessage.split(',')[1], 10);
      joinLobby(code, username.trim() || 'Hiker').then(() => {
        setIsSubmitting(false);
        onLogin();
      });
    } else if (statusMessage.includes('ERROR:LOBBY_NOT_FOUND') || statusMessage.includes('LOBBY_EXISTS')) {
      setIsSubmitting(false);
    }
  }, [statusMessage, isSubmitting]);

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
