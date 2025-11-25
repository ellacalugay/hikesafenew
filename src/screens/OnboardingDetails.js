import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Trees, ChevronRight } from 'lucide-react-native';
import { styles } from '../styles';
import { COLORS } from '../constants';
import { InputField, MainButton } from '../components';
import BleService from '../services/BleService';

const OnboardingDetails = ({ next, onShowReminder }) => {
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
    // send profile to device (best-effort)
    const profile = {
      firstName: '',
      lastName: '',
      contactName,
      contactPhone,
      medicalCondition,
      experience,
    };
    BleService.sendProfile(profile).then((ok) => {
      if (!ok) console.warn('Profile send failed or no device connected');
      onShowReminder();
    }).catch(() => onShowReminder());
  };

  return (
    <View style={[styles.contentContainer, styles.centerScreen]}>
      <Text style={[styles.titleLarge, styles.detailTitle]}>Get ready with the trail!</Text>

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
          onChangeText={(t) => { setContactPhone(t); if (contactPhoneError) setContactPhoneError(''); }}
          keyboardType="phone-pad"
          error={contactPhoneError}
        />
        <InputField
          label="Medical Condition"
          placeholder="Any allergies or conditions?"
          value={medicalCondition}
          onChangeText={setMedicalCondition}
        />

        {/* Real Dropdown (Modal) */}
        <Text style={styles.inputLabel}>Hiking Experience level</Text>
        <TouchableOpacity style={styles.inputBox} onPress={() => setDropdownOpen(true)}>
          <Text style={{color: COLORS.textDark}}>{experience}</Text>
          <ChevronRight size={20} color={COLORS.gray} />
        </TouchableOpacity>
      </View>

      <View style={styles.illustrationSpace}>
         <Trees size={80} color={COLORS.primary} style={{opacity: 0.5}} />
      </View>

      <MainButton title="ACCEPT AND CONTINUE" onPress={handleAccept} style={{marginTop: 20}} />

      {/* Dropdown Modal */}
      <Modal visible={dropdownOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.dropdownModalOverlay} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
          <View style={styles.dropdownModalContent}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.dropdownItem}
                onPress={() => { setExperience(opt); setDropdownOpen(false); }}
              >
                <Text style={styles.dropdownItemText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default OnboardingDetails;
