import React, { useState, useEffect } from 'react';
import { Image } from 'react-native';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ImageBackground, TextInput } from 'react-native';
import { ArrowLeft, User, Radio, Camera, Phone } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { MainButton } from '../../components/shared';
import { useTheme } from '../../context/ThemeContext';
import { useLobby } from '../../context/LobbyContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useUser } from '../../context/UserContext';

let ImagePicker = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (error) {
  console.warn('expo-image-picker is not available in this runtime build.', error);
}

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
  const [profilePicture, setProfilePicture] = useState(null);
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

    if (ctxProfilePicture) {
      setProfilePicture(ctxProfilePicture);
    }

  }, [ctxFirstName, ctxLastName, ctxContactName, ctxContactPhone, ctxMedicalCondition, ctxProfilePicture]);

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
    if (profilePicture && typeof setCtxProfilePicture === 'function') {
      await setCtxProfilePicture(profilePicture);
    }

    Alert.alert('Saved', 'Your profile has been updated.');
    setIsEditing(false);
  };

  const handleCloseEdit = () => {
    setFirstName(ctxFirstName || '');
    setLastName(ctxLastName || '');
    setContactName(ctxContactName || '');
    setContactPhone(ctxContactPhone || '');
    setMedicalCondition(ctxMedicalCondition || '');
    setProfilePicture(ctxProfilePicture || null);
    setNickname(myNickname || ctxFirstName || '');
    setDeviceName(deviceNickname || '');
    setIsEditing(false);
  };

  const handlePickImage = async () => {
  if (!ImagePicker) {
    Alert.alert(
      'Photo picker unavailable',
      'This build does not include the native image picker module. Reinstall the app as a fresh Expo dev build, then try again.'
    );
    return;
  }

  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setProfilePicture(result.assets[0].uri);
    }
  } catch (error) {
    console.warn('Failed to launch image picker.', error);
    Alert.alert(
      'Photo picker error',
      'Unable to open the photo picker in this build. Reinstall the app as a dev client and clear the Metro cache.'
    );
  }
};
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
        contentContainerStyle={{ paddingBottom: 50, paddingHorizontal: 10 }}
        
>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={handlePickImage} disabled={!isEditing}>
              <View style={{ width: 100, height: 100 }}>
                <View style={{
                  width: 100,
                  height: 100,
                  borderRadius: 50,
                  borderWidth: 2,
                  borderColor: 'black',
                  overflow: 'hidden',
                }}>
                  {profilePicture ? (
                    <Image 
                      source={{ uri: profilePicture }} 
                      style={{ width: 100, height: 100 }}
                    />
                  ) : (
                    <Image 
                      source={require('../../assets/add_profile.jpg')} 
                      style={{ width: 210, height: 210, position: 'absolute', top: -57, left: -57 }} 
                    />
                  )}
                  </View>
                    <View style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      backgroundColor: '#4CAF50',
                      borderRadius: 12,
                      width: 24,
                      height: 24,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Camera size={14} color="white" />
                  </View>
                </View>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 1, opacity: isEditing ? 1 : 0.6 }} onPress={handlePickImage} disabled={!isEditing}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>{isEditing ? 'PROFILE PHOTO' : 'PROFILE PHOTO (LOCKED)'}</Text>
            </TouchableOpacity>
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
