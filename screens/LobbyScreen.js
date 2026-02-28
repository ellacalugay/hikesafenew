import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, ImageBackground, Alert, ActivityIndicator } from 'react-native';
import { styles } from '../styles/styles';
import { InputField, MainButton } from '../components/shared';
import { useTheme } from '../context/ThemeContext';
import { useLobby } from '../context/LobbyContext';
import { useBluetoothDevice } from '../context/BluetoothContext';

const LobbyScreen = ({ onLogin, onShowCreateSuccess }) => {
  const { colors } = useTheme();
  const { createLobby, joinLobby, syncLobbyToDevice, lobbyCode, isInLobby } = useLobby();
  const { sendCommand, isConnected } = useBluetoothDevice();
  
  const [mode, setMode] = useState('join');
  const [remember, setRemember] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Create mode fields
  const [lobbyName, setLobbyName] = useState('');
  const [maxMember, setMaxMember] = useState('10');
  
  // Join mode fields
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Sync lobby code to device when connected
  useEffect(() => {
    if (isConnected && lobbyCode) {
      syncLobbyToDevice(sendCommand);
    }
  }, [isConnected, lobbyCode]);

  const handleCreateLobby = async () => {
    if (!lobbyName.trim()) {
      Alert.alert('Error', 'Please enter a lobby name');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const code = await createLobby(lobbyName.trim(), parseInt(maxMember) || 10);
      
      // Sync to device if connected
      if (isConnected) {
        await sendCommand(`LOBBY:${code}`);
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
    
    setIsSubmitting(true);
    try {
      await joinLobby(joinCode, username.trim() || 'Hiker');
      
      // Sync to device if connected
      if (isConnected) {
        await sendCommand(`LOBBY:${joinCode}`);
      }
      
      onLogin();
    } catch (error) {
      Alert.alert('Error', 'Failed to join lobby: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
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
            <Text style={[styles.cardDescWhite, { textAlign: 'left', alignSelf: 'flex-start' }]} numberOfLines={1}>Please fill out the form below to create your lobby.</Text>
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

        <MainButton 
          title={isSubmitting ? "Joining..." : "Enter Lobby"} 
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

export default LobbyScreen;
