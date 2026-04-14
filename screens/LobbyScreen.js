import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TouchableWithoutFeedback, Keyboard, Image, ImageBackground, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// remember persistence moved to LobbyContext
import { styles } from '../styles/styles';
import { InputField, MainButton } from '../components/shared';
import { useTheme } from '../context/ThemeContext';
import { useLobby } from '../context/LobbyContext';
import { useBluetoothDevice } from '../context/BluetoothContext';

const LobbyScreen = ({ onLogin }) => {
  const { colors } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { joinLobby, syncLobbyToDevice, rememberEnabled, rememberedUsername, rememberedJoinCode, setRememberEnabled, saveRememberData, clearRememberData, myNickname } = useLobby();
  const { sendCommand, isConnected } = useBluetoothDevice();
  
  // Join mode fields
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Initialize local fields.
  // Username is sourced from onboarding nickname and is not editable.
  useEffect(() => {
    const nextName = String(myNickname || rememberedUsername || '').trim();
    if (!nextName) return;
    setUsername(prev => (prev === nextName ? prev : nextName));
  }, [myNickname, rememberedUsername]);

  // Apply remembered join code (only when it actually differs).
  useEffect(() => {
    if (!rememberEnabled) return;
    const nextCode = String(rememberedJoinCode || '');
    if (!nextCode) return;
    setJoinCode(prev => (prev === nextCode ? prev : nextCode));
  }, [rememberEnabled, rememberedJoinCode]);

  // Persist when username/joinCode change and remember is enabled.
  // Guard against redundant writes that can cause render loops on some RN builds.
  useEffect(() => {
    if (!rememberEnabled) return;

    const nameToSave = String(username || '');
    const codeToSave = String(joinCode || '');

    // If the context already matches, don't write again.
    if (nameToSave === String(rememberedUsername || '') && codeToSave === String(rememberedJoinCode || '')) {
      return;
    }

    saveRememberData(nameToSave, codeToSave).catch(e => console.error(e));
  }, [username, joinCode, rememberEnabled, rememberedUsername, rememberedJoinCode, saveRememberData]);

  const getJoinButtonText = () => {
    return isSubmitting ? 'Joining...' : 'Enter Lobby';
  };

  const handleJoinLobby = async () => {
    if (isSubmitting) return;
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
    
    performJoinLobby();
  };
  
    const performJoinLobby = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      const parsedCode = parseInt(joinCode, 10);
      await joinLobby(parsedCode, username.trim() || 'Hiker');

        // Best-effort sync. Do not block entering the group if BLE is flaky.
      await syncLobbyToDevice(isConnected ? sendCommand : null, parsedCode);

      onLogin();
    } catch (error) {
      Alert.alert('Error', 'Failed to join lobby: ' + error.message);
    } finally {
      setIsSubmitting(false);
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
                      Enter any 4-digit group code. Anyone using the same code will be in your group.
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
                </View>

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
