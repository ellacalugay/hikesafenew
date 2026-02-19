import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { Trees, ChevronRight } from 'lucide-react-native';
import { styles } from '../styles/styles';
import { InputField, MainButton } from '../components/shared';
import { useTheme } from '../context/ThemeContext';

const OnboardingDetails = ({ next, onShowReminder }) => {
  const { colors } = useTheme();
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
    onShowReminder();
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: colors.background }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.contentContainer, styles.centerScreen, { backgroundColor: colors.background }]}>
          <Text style={[styles.titleLarge, styles.detailTitle, { color: colors.textDark }]}>Get ready with the trail!</Text>

          <View style={styles.detailForm}>
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
          </View>

          <View style={styles.illustrationSpace}>
            <Trees size={80} color={colors.primary} style={{opacity: 0.5}} />
          </View>

          <MainButton title="ACCEPT AND CONTINUE" onPress={handleAccept} style={{marginTop: 20}} />

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
  );
};

export default OnboardingDetails;
