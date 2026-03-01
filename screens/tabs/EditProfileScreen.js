import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { ArrowLeft, User, Radio } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { InputField, MainButton } from '../../components/shared';
import { useTheme } from '../../context/ThemeContext';
import { useLobby } from '../../context/LobbyContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';

const EditProfileScreen = ({ onBack }) => {
  const { colors } = useTheme();
  const { myNickname, setMyNickname, deviceNickname, setDeviceNickname } = useLobby();
  const { connectedDevice, isConnected } = useBluetoothDevice();
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [medicalCondition, setMedicalCondition] = useState('');

  // Load saved nickname on mount
  useEffect(() => {
    if (myNickname) {
      setNickname(myNickname);
    }
    if (deviceNickname) {
      setDeviceName(deviceNickname);
    }
  }, [myNickname, deviceNickname]);

  const handleSave = async () => {
    // Save nickname to LobbyContext
    if (nickname.trim()) {
      await setMyNickname(nickname.trim());
    }
    
    // Save device nickname
    if (deviceName.trim()) {
      await setDeviceNickname(deviceName.trim());
    }
    
    Alert.alert('Saved', 'Your profile has been updated.');
    onBack();
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.tabContainer, { backgroundColor: colors.background }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={[styles.headerBar, { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity 
          onPress={onBack} 
          style={{ position: 'absolute', left: 20, top: 15, padding: 5 }}
        >
          <ArrowLeft size={24} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textDark }]}>EDIT PROFILE</Text>
      </View>

      <ScrollView 
        style={{ flex: 1, padding: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        contentContainerStyle={{ paddingBottom: 50 }}
      >
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={[styles.avatarLarge, { backgroundColor: colors.primary }]}>
            <User size={40} color="white" />
          </View>
          <TouchableOpacity style={{ marginTop: 10 }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionHeader, { marginTop: 0, color: colors.textDark }]}>Personal Information</Text>
        
        <InputField 
          label="First Name" 
          placeholder="Enter first name"
          value={firstName}
          onChangeText={setFirstName}
        />
        <InputField 
          label="Last Name" 
          placeholder="Enter last name"
          value={lastName}
          onChangeText={setLastName}
        />
        <InputField 
          label="Nickname" 
          placeholder="Your display name in the app"
          value={nickname}
          onChangeText={setNickname}
        />

        <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Device Settings</Text>
        
        <InputField 
          label="Device Nickname" 
          placeholder={connectedDevice?.name || "Your HikeSafe device name"}
          value={deviceName}
          onChangeText={setDeviceName}
        />
        <Text style={{ color: colors.gray, fontSize: 12, marginTop: -8, marginBottom: 16, paddingHorizontal: 4 }}>
          {isConnected 
            ? `Connected to: ${connectedDevice?.name || 'HikeSafe Device'}`
            : 'Connect a device to customize its name'}
        </Text>

        <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Emergency Contact</Text>
        
        <InputField 
          label="Contact Name" 
          placeholder="Emergency contact name"
          value={contactName}
          onChangeText={setContactName}
        />
        <InputField 
          label="Contact Phone" 
          placeholder="Emergency contact phone"
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
        />

        <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Medical Information</Text>
        
        <InputField 
          label="Medical Condition" 
          placeholder="Any allergies or conditions?"
          value={medicalCondition}
          onChangeText={setMedicalCondition}
        />

        <MainButton 
          title="SAVE CHANGES" 
          onPress={handleSave} 
          style={{ marginTop: 20, marginBottom: 150 }} 
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default EditProfileScreen;
