import React, { useState, useEffect } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ImageBackground, TextInput } from 'react-native';
import { ArrowLeft, User, Radio, Phone } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { MainButton } from '../../components/shared';
import { useTheme } from '../../context/ThemeContext';
import { useLobby } from '../../context/LobbyContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useUser } from '../../context/UserContext';

// Image upload removed — using initials instead of profile photo

const EditProfileScreen = ({ onBack }) => {
  const { colors, isDarkMode } = useTheme();
  const { myNickname, setMyNickname, deviceNickname, setDeviceNickname } = useLobby();
  const { connectedDevice, isConnected } = useBluetoothDevice();
  const {
    firstName: ctxFirstName,
    lastName: ctxLastName,
    contactName: ctxContactName,
    contactPhone: ctxContactPhone,
    medicalCondition: ctxMedicalCondition,
    setFirstName: setCtxFirstName,
    setLastName: setCtxLastName,
    setContactName: setCtxContactName,
    setContactPhone: setCtxContactPhone,
    setMedicalCondition: setCtxMedicalCondition,
  } = useUser();
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [medicalCondition, setMedicalCondition] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Load saved nickname on mount
  useEffect(() => {
    if (myNickname) {
      setNickname(myNickname);
    } else if (ctxFirstName) {
      setNickname(ctxFirstName);
    }
    if (deviceNickname) {
      setDeviceName(deviceNickname);
    }
  }
    , [myNickname, deviceNickname, ctxFirstName]);

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

  }, [ctxFirstName, ctxLastName, ctxContactName, ctxContactPhone, ctxMedicalCondition]);

  const handleSave = async () => {
    if (!isEditing) return;

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
    setIsEditing(false);
  };

  const handleCloseEdit = () => {
    setFirstName(ctxFirstName || '');
    setLastName(ctxLastName || '');
    setContactName(ctxContactName || '');
    setContactPhone(ctxContactPhone || '');
    setMedicalCondition(ctxMedicalCondition || '');
    setNickname(myNickname || ctxFirstName || '');
    setDeviceName(deviceNickname || '');
    setIsEditing(false);
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
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 80, paddingHorizontal: 10 }}
        
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
          paddingTop: 24,
          paddingBottom: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.10,
          shadowRadius: 8,
          elevation: 4,
          marginBottom: 24,
          marginHorizontal: 2,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <User size={18} color={colors.primary} />
            <Text style={{ marginLeft: 10, color: colors.primary, fontSize: 20, fontWeight: '800' }}>Personal Details</Text>
          </View>

          <Text style={{ color: colors.textDark, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.9, marginBottom: 8 }}>FIRST NAME</Text>
          <TextInput
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 12,
              minHeight: 60,
              paddingHorizontal: 18,
              fontSize: 16,
              fontWeight: '600',
              color: colors.textDark,
              marginBottom: 18,
              opacity: isEditing ? 1 : 0.72,
            }}
            placeholder="Enter first name"
            placeholderTextColor={colors.gray}
            value={firstName}
            onChangeText={setFirstName}
            editable={isEditing}
          />

          <Text style={{ color: colors.textDark, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.9, marginBottom: 8 }}>LAST NAME</Text>
          <TextInput
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 12,
              minHeight: 60,
              paddingHorizontal: 18,
              fontSize: 16,
              fontWeight: '600',
              color: colors.textDark,
              marginBottom: 18,
              opacity: isEditing ? 1 : 0.72,
            }}
            placeholder="Enter last name"
            placeholderTextColor={colors.gray}
            value={lastName}
            onChangeText={setLastName}
            editable={isEditing}
          />

          <Text style={{ color: colors.textDark, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.9, marginBottom: 8 }}>NICKNAME</Text>
          <TextInput
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 12,
              minHeight: 60,
              paddingHorizontal: 18,
              fontSize: 16,
              fontWeight: '600',
              color: colors.textDark,
              marginBottom: 18,
              opacity: isEditing ? 1 : 0.72,
            }}
            placeholder="Enter nickname"
            placeholderTextColor={colors.gray}
            value={nickname}
            onChangeText={setNickname}
            editable={isEditing}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Radio size={18} color={colors.primary} />
            <Text style={{ marginLeft: 10, color: colors.primary, fontSize: 20, fontWeight: '800' }}>Device Settings</Text>
          </View>

          <Text style={{ color: colors.textDark, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.9, marginBottom: 8 }}>DEVICE NICKNAME</Text>
          <TextInput
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 12,
              minHeight: 60,
              paddingHorizontal: 18,
              fontSize: 16,
              fontWeight: '600',
              color: colors.textDark,
              marginBottom: 18,
              opacity: isEditing ? 1 : 0.72,
            }}
            placeholder={connectedDevice?.name || 'Your HikeSafe device name'}
            placeholderTextColor={colors.gray}
            value={deviceName}
            onChangeText={setDeviceName}
            editable={isEditing}
          />

          <Text style={{ color: colors.gray, fontSize: 12, marginTop: -8, marginBottom: 16, paddingHorizontal: 4 }}>
            {isConnected ? `Connected to: ${connectedDevice?.name || 'HikeSafe Device'}` : 'Connect a device to customize its name'}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Phone size={18} color={colors.primary} />
            <Text style={{ marginLeft: 10, color: colors.primary, fontSize: 20, fontWeight: '800' }}>Emergency Contact</Text>
          </View>

          <Text style={{ color: colors.textDark, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.9, marginBottom: 8 }}>CONTACT NAME</Text>
          <TextInput
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 12,
              minHeight: 60,
              paddingHorizontal: 18,
              fontSize: 16,
              fontWeight: '600',
              color: colors.textDark,
              marginBottom: 18,
              opacity: isEditing ? 1 : 0.72,
            }}
            placeholder="Emergency contact name"
            placeholderTextColor={colors.gray}
            value={contactName}
            onChangeText={setContactName}
            editable={isEditing}
          />

          <Text style={{ color: colors.textDark, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.9, marginBottom: 8 }}>CONTACT PHONE</Text>
          <TextInput
            style={{
              backgroundColor: colors.inputBg,
              borderRadius: 12,
              minHeight: 60,
              paddingHorizontal: 18,
              fontSize: 16,
              fontWeight: '600',
              color: colors.textDark,
              marginBottom: 18,
              opacity: isEditing ? 1 : 0.72,
            }}
            placeholder="Emergency contact phone"
            placeholderTextColor={colors.gray}
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
            editable={isEditing}
          />
         
          {!isEditing ? (
            <View style={{ marginHorizontal: 50, marginTop: 20 }}>
              <MainButton title="UPDATE PROFILE" onPress={() => setIsEditing(true)} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', marginTop: 20 }}>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.borderColor, marginRight: 5 }]}
                onPress={handleCloseEdit}
              >
                <Text style={{ color: colors.textDark, fontWeight: '700' }}>CLOSE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary, { flex: 1, marginLeft: 5 }]}
                onPress={handleSave}
              >
                <Text style={[styles.buttonText, styles.buttonTextPrimary]}>SAVE</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </ImageBackground>
  );
};

export default EditProfileScreen;
