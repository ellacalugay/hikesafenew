import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, ImageBackground } from 'react-native';
import { styles } from '../styles';
import { COLORS } from '../constants';
import { InputField, MainButton } from '../components';
import BleService from '../services/BleService';

const LobbyScreen = ({ onLogin, onShowCreateSuccess }) => {
  const [mode, setMode] = useState('join'); // 'join' or 'create'
  const [remember, setRemember] = useState(false);
  
  // Create lobby form state
  const [lobbyName, setLobbyName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [maxMember, setMaxMember] = useState('');

  const handleCreateLobby = () => {
    // Try to send create lobby to connected device (auto-scan/connect if needed)
    const lobbyId = groupId && groupId.length > 0 ? groupId : lobbyName;
    if (!lobbyId || lobbyId.length === 0) {
      // fallback to just call the app handler
      onShowCreateSuccess({ lobbyName, groupId, maxMember });
      return;
    }
    BleService.sendCreateLobby(lobbyId, '')
      .then((ok) => {
        if (ok) {
          // notify app and proceed
          onShowCreateSuccess({ lobbyName, groupId: lobbyId, maxMember });
        } else {
          // still call handler but warn
          onShowCreateSuccess({ lobbyName, groupId: lobbyId, maxMember });
          // developer log
          console.warn('Create lobby BLE send failed');
        }
      })
      .catch((e) => {
        console.warn('Create lobby error', e);
        onShowCreateSuccess({ lobbyName, groupId: lobbyId, maxMember });
      });
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
          <InputField placeholder="Username" />
          <InputField placeholder="Group ID" />
          
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

        <MainButton title="Enter Lobby" onPress={() => {
          // When joining, attempt BLE join first
          const lobbyIdField = '';
          // If user filled Group ID, use it; otherwise rely on form inputs elsewhere
          const lobbyToJoin = groupId && groupId.length > 0 ? groupId : '';
          if (lobbyToJoin.length > 0) {
            BleService.sendJoinLobby(lobbyToJoin)
              .then((ok) => {
                if (!ok) console.warn('Join lobby BLE failed');
                onLogin();
              })
              .catch((e) => { console.warn('Join lobby err', e); onLogin(); });
          } else {
            onLogin();
          }
        }} style={{ top: -30, width: '80%', alignSelf: 'center' }} />
        
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
