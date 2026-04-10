import React, { useState, useEffect } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, StyleSheet } from 'react-native';
import { ArrowLeft, User, Radio, Phone, HeartPulse } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { styles } from '../../styles/styles';
import { MainButton, InputField } from '../../components/shared';
import { useTheme } from '../../context/ThemeContext';
import { useLobby } from '../../context/LobbyContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useUser } from '../../context/UserContext';

// Image upload removed — using initials instead of profile photo

const EditProfileScreen = ({ onBack }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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
    await setCtxMedicalCondition((medicalCondition || '').trim());
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
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      <KeyboardAvoidingView 
        style={[styles.tabContainer, { backgroundColor: 'transparent' }]} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      <View
        style={[
          styles.headerBar,
          {
            backgroundColor: colors.headerBg,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            elevation: 5,
            zIndex: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop:  15,
            paddingBottom: 10,
            height: 55,
          },
        ]}
      >
        <TouchableOpacity onPress={onBack} style={{ position: 'absolute', left: 16, bottom: 10, padding: 4 }}>
          <ArrowLeft size={24} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textDark, fontWeight: '700', fontSize: 20, bottom: 0, lineHeight: 24 }]}>
          EDIT PROFILE
        </Text>
        <Image
          source={require('../../assets/hike_logo.png')}
          style={{ position: 'absolute', right: 16, bottom: 10, width: 34, height: 34, resizeMode: 'contain' }}
        />
      </View>

      <ScrollView 
        style={{ flex: 1, backgroundColor: 'transparent' }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 20, paddingBottom: Math.max(insets.bottom + 90, 80), paddingHorizontal: 16 }}
      >
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View
            style={{
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 3,
              borderColor: colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary,
            }}
          >
            <Text style={{ fontSize: 34, fontWeight: '800', color: colors.textLight }}>{initials || 'HS'}</Text>
          </View>
          <Text style={{ marginTop: 12, color: colors.textDark, fontWeight: '700', letterSpacing: 1 }}>PROFILE DATA</Text>
        </View>
        

        <View
          style={{
            borderRadius: 16,
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 24,
            borderWidth: 1,
            borderColor: colors.glassBorder,
            backgroundColor: '#e9edf1',
            overflow: 'hidden',
            position: 'relative',
            marginBottom: 24,
          }}
        >
          <BlurView intensity={colors.glassIntensity} tint={colors.glassTint} style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(233, 237, 241, 0.72)' }]} />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <User size={18} color={colors.primary} />
            <Text style={{ marginLeft: 10, color: colors.primary, fontSize: 18, fontWeight: '800' }}>Personal Details</Text>
          </View>

          <InputField
            label="FIRST NAME"
            placeholder="Enter first name"
            value={firstName}
            onChangeText={setFirstName}
            editable={isEditing}
            containerStyle={{ marginBottom: 16 }}
          />

          <InputField
            label="LAST NAME"
            placeholder="Enter last name"
            value={lastName}
            onChangeText={setLastName}
            editable={isEditing}
            containerStyle={{ marginBottom: 16 }}
          />

          <InputField
            label="NICKNAME"
            placeholder="Enter nickname"
            value={nickname}
            onChangeText={setNickname}
            editable={isEditing}
            containerStyle={{ marginBottom: 24 }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <Radio size={18} color={colors.primary} />
            <Text style={{ marginLeft: 10, color: colors.primary, fontSize: 18, fontWeight: '800' }}>Device Settings</Text>
          </View>

          <InputField
            label="DEVICE NICKNAME"
            placeholder={connectedDevice?.name || 'Your HikeSafe device name'}
            value={deviceName}
            onChangeText={setDeviceName}
            editable={isEditing}
            containerStyle={{ marginBottom: 4 }}
          />

          <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 24, paddingHorizontal: 4, fontWeight: '500' }}>
            {isConnected ? `Connected to: ${connectedDevice?.name || 'HikeSafe Device'}` : 'Connect a device to customize its name'}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <Phone size={18} color={colors.primary} />
            <Text style={{ marginLeft: 10, color: colors.primary, fontSize: 18, fontWeight: '800' }}>Emergency Contact</Text>
          </View>

          <InputField
            label="CONTACT NAME"
            placeholder="Emergency contact name"
            value={contactName}
            onChangeText={setContactName}
            editable={isEditing}
            containerStyle={{ marginBottom: 16 }}
          />

          <InputField
            label="CONTACT PHONE"
            placeholder="Emergency contact phone"
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
            editable={isEditing}
            containerStyle={{ marginBottom: 24 }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
            <HeartPulse size={18} color={colors.primary} />
            <Text style={{ marginLeft: 10, color: colors.primary, fontSize: 18, fontWeight: '800' }}>Medical Info</Text>
          </View>

          <InputField
            label="MEDICAL CONDITIONS / ALLERGIES"
            placeholder="e.g., Asthma, Penicillin allergy, None"
            value={medicalCondition}
            onChangeText={setMedicalCondition}
            editable={isEditing}
            containerStyle={{ marginBottom: 24 }}
          />

          {!isEditing ? (
            <View style={{ marginTop: 10 }}>
              <MainButton title="EDIT PROFILE" onPress={() => setIsEditing(true)} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.borderColor, marginRight: 6 }]}
                onPress={handleCloseEdit}
              >
                <Text style={{ color: colors.textDark, fontWeight: '700' }}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: colors.primary, marginLeft: 6 }]}
                onPress={handleSave}
              >
                <Text style={{ color: colors.textLight, fontWeight: '700' }}>SAVE</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default EditProfileScreen;
