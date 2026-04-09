import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Keyboard, KeyboardAvoidingView, ScrollView, Platform, ImageBackground, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, ChevronLeft, User, Phone, Plus } from 'lucide-react-native';
import { styles } from '../styles/styles';
import { InputField, MainButton } from '../components/shared';
import { useTheme } from '../context/ThemeContext';
import { useLobby } from '../context/LobbyContext';
import { useUser } from '../context/UserContext';

const OnboardingDetails = ({ next, onShowReminder, onBack, disableMountAnimation = false }) => {
  const { colors } = useTheme();
  const { setMyEmergencyContact } = useLobby();
  const {
    setContactName: setCtxContactName,
    setContactPhone: setCtxContactPhone,
    setMedicalCondition: setCtxMedicalCondition,
    setExperience: setCtxExperience,
  } = useUser();
  const titleOpacity = useRef(new Animated.Value(disableMountAnimation ? 1 : 0)).current;
  const titleTranslateY = useRef(new Animated.Value(disableMountAnimation ? 0 : -20)).current;
  const formOpacity = useRef(new Animated.Value(disableMountAnimation ? 1 : 0)).current;
  const formTranslateY = useRef(new Animated.Value(disableMountAnimation ? 0 : 20)).current;
  const buttonOpacity = useRef(new Animated.Value(disableMountAnimation ? 1 : 0)).current;
  const buttonScale = useRef(new Animated.Value(disableMountAnimation ? 1 : 0.9)).current;

  useEffect(() => {
    if (disableMountAnimation) return;

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

  const {
    contactName: ctxContactName,
    contactPhone: ctxContactPhone,
    medicalCondition: ctxMedicalCondition,
    experience: ctxExperience,
  } = useUser();

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
    Keyboard.dismiss();
    const errPhone = validatePhone(contactPhone);
    const errName = validateName(contactName);

    if (errName) setContactNameError(errName);
    if (errPhone) setContactPhoneError(errPhone);

    if (errName || errPhone) return;

    setContactPhoneError('');
    setContactNameError('');

    const persistAndContinue = async () => {
      // Persist to UserContext (main-branch onboarding expectations)
      try {
        await setCtxContactName(contactName);
        await setCtxContactPhone(contactPhone);
        await setCtxMedicalCondition(medicalCondition);
        if (setCtxExperience) await setCtxExperience(experience);
      } catch (e) {
        console.error('Failed to save onboarding details:', e);
      }

      // Persist to LobbyContext so we can sync to device later.
      if (setMyEmergencyContact) {
        setMyEmergencyContact({ name: contactName.trim(), phone: contactPhone.trim() });
      }

      onShowReminder();
    };

    persistAndContinue();
  };

  // Seed local state from context values
  useEffect(() => {
    if (ctxContactName) setContactName(ctxContactName);
    if (ctxContactPhone) setContactPhone(ctxContactPhone);
    if (ctxMedicalCondition) setMedicalCondition(ctxMedicalCondition);
    if (ctxExperience) setExperience(ctxExperience);
  }, [ctxContactName, ctxContactPhone, ctxMedicalCondition, ctxExperience]);

  return (
    <ImageBackground
      source={require('../assets/int bg 1.png')}
      resizeMode="cover"
      style={{ flex: 1 }}
    >
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.onboardingPage}>
            <View style={styles.onboardingHeader}>
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  onBack && onBack();
                }}
                style={styles.onboardingBackBtn}
                accessibilityRole="button"
                accessibilityLabel="Back to previous step"
              >
                <ChevronLeft size={20} color={colors.textDark} />
              </TouchableOpacity>
              <View style={styles.onboardingProgress}>
                <Text style={[styles.onboardingProgressText, { color: colors.gray, marginRight: 8 }]}>2 of 2</Text>
                <View style={styles.onboardingDots}>
                  <View style={[styles.onboardingDot, { backgroundColor: 'transparent', borderColor: colors.borderColor }]} />
                  <View style={[styles.onboardingDot, { backgroundColor: colors.primary, borderColor: colors.primary }]} />
                </View>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.onboardingBody}>
                <View style={{ marginTop: 10 }}>
                  <Animated.Text style={[styles.titleLarge, styles.detailTitle, { color: colors.textDark, top: 0, marginTop: 25, marginBottom: 12, textAlign: 'left', fontSize: 48, lineHeight: 50 }, {
                    opacity: titleOpacity,
                    transform: [{ translateY: titleTranslateY }],
                  }]}>Get ready with the trail!</Animated.Text>

                  <Animated.View style={[styles.onboardingForm, {
                    opacity: formOpacity,
                    transform: [{ translateY: formTranslateY }],
                    marginTop: 10,
                  }]}>
                    <InputField
                      label="Contact Name"
                      placeholder="Emergency Contact Name"
                      value={contactName}
                      onChangeText={(t) => { setContactName(t); if (contactNameError) setContactNameError(''); }}
                      error={contactNameError}
                      icon={<User size={16} color={colors.gray} />}
                      containerStyle={styles.onboardingFieldGap}
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
                      icon={<Phone size={16} color={colors.gray} />}
                      containerStyle={styles.onboardingFieldGap}
                    />
                    <InputField
                      label="Medical Condition"
                      placeholder="Any allergies or conditions?"
                      value={medicalCondition}
                      onChangeText={setMedicalCondition}
                      icon={<Plus size={16} color={colors.gray} />}
                      containerStyle={styles.onboardingFieldGap}
                    />

                    <Text style={[styles.inputLabel, { color: colors.textDark, marginBottom: 6, marginTop: 2 }]}>Hiking Experience level</Text>
                    <TouchableOpacity
                      style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.borderColor, paddingVertical: 14, paddingHorizontal: 16 }]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setDropdownOpen(true);
                      }}
                    >
                      <Text style={{ color: colors.textDark, fontWeight: '600' }}>{experience}</Text>
                      <ChevronDown size={18} color={colors.gray} />
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>

              <Animated.View style={[styles.onboardingFooter, {
                opacity: buttonOpacity,
                transform: [{ scale: buttonScale }],
              }]}>
                <MainButton title="ACCEPT AND CONTINUE" onPress={handleAccept} style={{ marginTop: 8, marginBottom: 12 }} />
              </Animated.View>
            </ScrollView>

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
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
};

export default OnboardingDetails;
