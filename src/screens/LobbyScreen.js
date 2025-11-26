import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, ImageBackground, Alert } from 'react-native';
import { styles } from '../styles';
import { COLORS } from '../constants';
import { InputField, MainButton } from '../components';
import bleService from '../services/BleService';

const LobbyScreen = ({ onLogin, onShowCreateSuccess, onReconnect, loraContext }) => {
  const [mode, setMode] = useState('join'); // 'join' or 'create'
  const [remember, setRemember] = useState(false);
  
  // Create lobby form state
  const [lobbyName, setLobbyName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [maxMember, setMaxMember] = useState('');
  
  // Join lobby form state
  const [joinUsername, setJoinUsername] = useState('');
  const [joinGroupId, setJoinGroupId] = useState('');

  const handleCreateLobby = async () => {
    // Validate form
    if (!lobbyName.trim()) {
      Alert.alert('Error', 'Please enter a lobby name');
      return;
    }
    
    const lobbyId = groupId.trim() || lobbyName.trim().toUpperCase().replace(/\s+/g, '_');
    
    // Debug logging
    console.log('=== CREATE LOBBY DEBUG ===');
    console.log('BLE connected:', bleService.isConnected());
    console.log('BLE device:', bleService.getDeviceName());
    console.log('Lobby ID:', lobbyId);
    console.log('Lobby Name:', lobbyName.trim());
    
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
      console.log('Sending create lobby command via BLE...');
      const ok = await bleService.sendCreateLobby(lobbyId, '', lobbyName.trim());
      console.log('Create lobby result:', ok);
      
      if (ok) {
        console.log('Create lobby BLE command sent successfully');
        onShowCreateSuccess({ lobbyName: lobbyName.trim(), groupId: lobbyId, maxMember: maxMember.trim() || '10' });
      } else {
        console.log('Create lobby FAILED - sendCreateLobby returned false');
        Alert.alert('Error', 'Failed to create lobby. Please check your device connection.');
      }
    } catch (e) {
      console.warn('Create lobby error', e);
      Alert.alert('Error', 'Failed to create lobby: ' + e.message);
    }
  };
  
  const handleJoinLobby = async () => {
    if (!joinUsername.trim()) {
      Alert.alert('Error', 'Please enter your username');
      return;
    }
    if (!joinGroupId.trim()) {
      Alert.alert('Error', 'Please enter a Group ID');
      return;
    }
    
    // Check if BLE is connected
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
    
    try {
      console.log('Joining lobby via BLE:', joinGroupId.trim());
      const ok = await bleService.sendJoinLobby(joinGroupId.trim().toUpperCase());
      
      if (ok) {
        console.log('Join lobby BLE command sent successfully');
        onLogin({ username: joinUsername.trim(), groupId: joinGroupId.trim().toUpperCase() });
      } else {
        Alert.alert('Error', 'Failed to join lobby. Please check your device connection.');
      }
    } catch (e) {
      console.warn('Join lobby error', e);
      Alert.alert('Error', 'Failed to join lobby: ' + e.message);
    }
  };

  if (mode === 'create') {
    return (
      <ImageBackground
        source={require('../../assets/forest_bg 1.png')}
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
                <Text style={styles.fieldLabel}>Group ID</Text>
                <TextInput 
                  style={styles.inputWhiteRounded} 
                  placeholder="Group ID" 
                  placeholderTextColor="rgba(0,0,0,0.35)"
                  value={groupId}
                  onChangeText={setGroupId}
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel} numberOfLines={1}>Max Member</Text>
                <TextInput 
                  style={styles.inputWhiteRounded} 
                  placeholder="Max Member" 
                  placeholderTextColor="rgba(0,0,0,0.35)" 
                  keyboardType="numeric"
                  value={maxMember}
                  onChangeText={setMaxMember}
                />
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
      source={require('../../assets/forest_bg 1.png')}
      style={styles.lobbyCreateBg}
      resizeMode="cover"
    >
      <View style={styles.contentContainer}>
          <View style={styles.logoSection}>
            <Image source={require('../../assets/hike.png')} style={styles.logoImage} />
            <Text style={styles.tagline}>"Stay connected. Stay safe."</Text>
          </View>

        <View style={[styles.formSection, { top:-10, width: '80%', alignSelf: 'center' }]}> 
          <InputField 
            placeholder="Username" 
            value={joinUsername}
            onChangeText={setJoinUsername}
          />
          <InputField 
            placeholder="Group ID" 
            value={joinGroupId}
            onChangeText={setJoinGroupId}
            autoCapitalize="characters"
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

        <MainButton title="Enter Lobby" onPress={handleJoinLobby} style={{ top: -30, width: '80%', alignSelf: 'center' }} />
        
        <TouchableOpacity
          onPress={() => setMode('create')}
          style={{ marginTop: 20, alignItems: 'center' }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: COLORS.primary, fontWeight: '600', textAlign: 'center' }}>
            Do you want to create a Lobby?{' '}
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Create Here.</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
};

export default LobbyScreen;
