import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, KeyboardAvoidingView, ScrollView, Platform, ImageBackground, Animated } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { styles } from '../styles/styles';
import { InputField, MainButton } from '../components/shared';
import { useTheme } from '../context/ThemeContext';
import { useLobby } from '../context/LobbyContext';

const OnboardingDetails = ({ next, onShowReminder }) => {
  const { colors } = useTheme();
  const { setMyEmergencyContact } = useLobby();
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(-20)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(20)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.stagger(150, [
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(formTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(buttonScale, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);
  const [experience, setExperience] = useState('Beginner');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [contactPhoneError, setContactPhoneError] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactNameError, setContactNameError] = useState('');
  const [medicalCondition, setMedicalCondition] = useState('');
  const options = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

  const validatePhone = (phone) => {
    if (!phone || phone.trim().length === 0) return 'Phone is required';
    const digits = phone.replace(/[^0-9+]/g, '');
    if (digits.length < 7) return 'Enter a valid phone number';
    if (digits.length > 15) return 'Phone number too long';
    return '';
  };

  const validateName = (name) => {
    if (!name || name.trim().length === 0) return 'Contact name is required';
    return '';
  };

  const handleAccept = () => {
    const errPhone = validatePhone(contactPhone);
    const errName = validateName(contactName);

    if (errName) setContactNameError(errName);
    if (errPhone) setContactPhoneError(errPhone);

    if (errName || errPhone) return;

    setContactPhoneError('');
    setContactNameError('');

    // Persist locally so we can sync to device later.
    if (setMyEmergencyContact) {
      setMyEmergencyContact({ name: contactName.trim(), phone: contactPhone.trim() });
    }
    onShowReminder();
  };

  return (
    <ImageBackground
      source={require('../assets/int bg 1.png')}
      resizeMode="cover"
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={[styles.contentContainer, { justifyContent: 'center' }]}>
            <Animated.Text style={[styles.titleLarge, styles.detailTitle, { color: colors.textDark, top: 0, marginTop: 0, marginBottom: 16 }, {
              opacity: titleOpacity,
              transform: [{ translateY: titleTranslateY }],
            }]}>Get ready with the trail!</Animated.Text>

            <Animated.View style={[styles.detailForm, { top: 0, marginTop: 12, marginBottom: 8 }, {
              opacity: formOpacity,
              transform: [{ translateY: formTranslateY }],
            }]}>
              <InputField
                label="Contact Name"
                placeholder="Emergency Contact Name"
                value={contactName}
                onChangeText={(t) => { setContactName(t); if (contactNameError) setContactNameError(''); }}
                error={contactNameError}
              />
              <InputField
                label="Contact Phone"
                placeholder="Emergency Contact Phone"
                value={contactPhone}
                onChangeText={(t) => { 
                  if (t.length <= 11) {
                    setContactPhone(t); 
                    if (contactPhoneError) setContactPhoneError(''); 
                  }
                }}
                keyboardType="phone-pad"
                error={contactPhoneError}
                maxLength={11}
              />
              <InputField
                label="Medical Condition"
                placeholder="Any allergies or conditions?"
                value={medicalCondition}
                onChangeText={setMedicalCondition}
              />

              <Text style={[styles.inputLabel, { color: colors.textDark }]}>Hiking Experience level</Text>
              <TouchableOpacity style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.borderColor }]} onPress={() => setDropdownOpen(true)}>
                <Text style={{color: colors.textDark}}>{experience}</Text>
                <ChevronRight size={20} color={colors.gray} />
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={[{
              opacity: buttonOpacity,
              transform: [{ scale: buttonScale }],
            }]}>
              <MainButton title="ACCEPT AND CONTINUE" onPress={handleAccept} style={{ marginTop: 14, marginBottom: 16 }} />
            </Animated.View>

            <Modal visible={dropdownOpen} transparent animationType="fade">
              <TouchableOpacity style={styles.dropdownModalOverlay} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
                <View style={[styles.dropdownModalContent, { backgroundColor: colors.modalBg }]}>
                  {options.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.dropdownItem, { borderBottomColor: colors.borderColor }]}
                      onPress={() => { setExperience(opt); setDropdownOpen(false); }}
                    >
                      <Text style={[styles.dropdownItemText, { color: colors.textDark }]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableOpacity>
            </Modal>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
};

export default OnboardingDetails;
