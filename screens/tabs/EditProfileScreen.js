import React, { useState, useEffect } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ImageBackground } from 'react-native';
import { ArrowLeft, User, Radio } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { InputField, MainButton } from '../../components/shared';
import { useTheme } from '../../context/ThemeContext';
import { useLobby } from '../../context/LobbyContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useUser } from '../../context/UserContext';

// Image upload removed — using initials instead of profile photo

const EditProfileScreen = ({ onBack }) => {
  const { colors, isDarkMode, toggleDarkMode } = useTheme();
  const { myNickname, setMyNickname, deviceNickname, setDeviceNickname } = useLobby();
  const { connectedDevice, isConnected } = useBluetoothDevice();
  const {
    firstName: ctxFirstName,
    lastName: ctxLastName,
    contactName: ctxContactName,
    contactPhone: ctxContactPhone,
    medicalCondition: ctxMedicalCondition,
    profilePicture: ctxProfilePicture, 
    setFirstName: setCtxFirstName,
    setLastName: setCtxLastName,
    setContactName: setCtxContactName,
    setContactPhone: setCtxContactPhone,
    setMedicalCondition: setCtxMedicalCondition,
    setProfilePicture: setCtxProfilePicture,
  } = useUser();
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [medicalCondition, setMedicalCondition] = useState('');
  // profilePicture removed; will display initials instead

  // Load saved nickname on mount
  useEffect(() => {
    if (myNickname) {
      setNickname(myNickname);
    }
    if (deviceNickname) {
      setDeviceName(deviceNickname);
    }
  }
    , [myNickname, deviceNickname]);

  useEffect(() => {
    if (ctxFirstName) {
      setFirstName(ctxFirstName);
    }
    if (ctxLastName) {
      setLastName(ctxLastName);
    }
    if (ctxContactName) {
      setContactName(ctxContactName);
    }
    if (ctxContactPhone) {
      setContactPhone(ctxContactPhone);
    }
    if (ctxMedicalCondition) {
      setMedicalCondition(ctxMedicalCondition);
    }

    // profile picture handling removed

  }, [ctxFirstName, ctxLastName, ctxContactName, ctxContactPhone, ctxMedicalCondition, ctxProfilePicture]);

  const handleSave = async () => {
    // Save nickname to LobbyContext
    if (nickname.trim()) {
      await setMyNickname(nickname.trim());
    }
    
    // Save device nickname
    if (deviceName.trim()) {
      await setDeviceNickname(deviceName.trim());
    }
    // Save personal info to UserContext
    if (firstName.trim()) await setCtxFirstName(firstName.trim());
    if (lastName.trim()) await setCtxLastName(lastName.trim());
    if (contactName.trim()) await setCtxContactName(contactName.trim());
    if (contactPhone.trim()) await setCtxContactPhone(contactPhone.trim());
    if (medicalCondition.trim()) await setCtxMedicalCondition(medicalCondition.trim());
    // Profile photo upload removed; we store names only

    Alert.alert('Saved', 'Your profile has been updated.');
    if (typeof onBack === 'function') onBack();
  };
  // derive initials dynamically from first/last name
  const initials = `${(firstName && firstName[0] ? firstName[0] : '').toUpperCase()}${(lastName && lastName[0] ? lastName[0] : '').toUpperCase()}`;
  return (
    <ImageBackground 
      source={require('../../assets/dashboard_bg.png')} 
      style={[styles.tabContainer, { backgroundColor: colors.background }]}
      imageStyle={{ resizeMode: 'cover', width: '100%', height: '100%' }}
    >
    {isDarkMode && (
      <View style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)', // adjust opacity to taste
        zIndex: 0,
      }} />
    )} 

    <KeyboardAvoidingView 
      style={[styles.tabContainer, { backgroundColor: 'transparent' }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={[styles.headerBar, { backgroundColor: colors.headerBg, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 5, zIndex: 1}]}>
        <TouchableOpacity 
          onPress={onBack} 
          style={{ position: 'absolute', left: 20, top: 15, padding: 5 }}
        >
          <ArrowLeft size={24} color={colors.textDark} style={{ marginTop: 13 }} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textDark, fontWeight: '700', fontSize: 22, marginLeft: -90, marginTop: -10, paddingBottom: 10 }]}>EDIT PROFILE</Text>
        <Image 
          source={require('../../assets/hike_logo.png')} 
          style={{ 
            position: 'absolute', 
            right: 30, 
            top: 17,
            width: 50, 
            height: 50, 
            resizeMode: 'contain' 
          }} 
          />
      </View>

      <ScrollView 
        style={{ flex: 1, padding: 2, backgroundColor: 'transparent' }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 50 }}
        
>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 2,
              borderColor: colors.textDark || 'black',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primaryLight || '#eee',
            }}>
              <Text style={{ fontSize: 34, fontWeight: '800', color: colors.primary || '#156e05' }}>{initials || '??'}</Text>
            </View>
            <Text style={{ marginTop: 8, color: colors.primary, fontWeight: '700' }}>PROFILE NAME</Text>
          </View>
        </View>
        

        {/* ── All fields inside one white rounded card ── */}
        <View style={{
          backgroundColor: colors.profileBg,
          borderRadius: 16,
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.10,
          shadowRadius: 8,
          elevation: 4,
          marginBottom: 24,
        }}>
          <Text style={[styles.sectionHeader, { marginTop: 0, color: colors.textDark }]}>Personal Information</Text>
          <InputField label="First Name" placeholder="Enter first name" value={firstName} onChangeText={setFirstName} />
          <InputField label="Last Name" placeholder="Enter last name" value={lastName} onChangeText={setLastName} />
          <InputField label="Nickname" placeholder="Your display name in the app" value={nickname} onChangeText={setNickname} />

          <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Device Settings</Text>
          <InputField label="Device Nickname" placeholder={connectedDevice?.name || "Your HikeSafe device name"} value={deviceName} onChangeText={setDeviceName} />
          <Text style={{ color: colors.gray, fontSize: 12, marginTop: -8, marginBottom: 16, paddingHorizontal: 4 }}>
            {isConnected ? `Connected to: ${connectedDevice?.name || 'HikeSafe Device'}` : 'Connect a device to customize its name'}
          </Text>

          <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Emergency Contact</Text>
          <InputField label="Contact Name" placeholder="Emergency contact name" value={contactName} onChangeText={setContactName} />
          <InputField label="Contact Phone" placeholder="Emergency contact phone" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />

          <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Medical Information</Text>
          <InputField label="Medical Condition" placeholder="Any allergies or conditions?" value={medicalCondition} onChangeText={setMedicalCondition} />
         
          <View style={{ marginHorizontal: 50, marginTop: 20 }}>
            <MainButton title="SAVE CHANGES" onPress={handleSave} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </ImageBackground>
  );
};

export default EditProfileScreen;
