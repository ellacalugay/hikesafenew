import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Trees } from 'lucide-react-native';
import { styles } from '../styles';
import { COLORS } from '../constants';
import { InputField, MainButton } from '../components';

const OnboardingName = ({ next }) => (
  <View style={styles.contentContainer}>
    <View style={styles.headerSpacer} />
    <Text style={styles.titleLarge}>
      What do we{'\n'}call you?
    </Text>
  
    <View style={[styles.formSection, styles.centeredForm, { top: 50 }]}>
      <InputField label="First Name" placeholder="e.g. John" />
      <InputField label="Last Name" placeholder="e.g. Doe" />
      <InputField label="Nickname" placeholder="e.g. JD" />
    </View>

    <View style={styles.illustrationSpace}>
       <Trees size={120} color={COLORS.primary} style={{opacity: 0.5}} />
    </View>

    <View style={styles.footer}>
      <MainButton title="NEXT" onPress={next} />
      <TouchableOpacity style={styles.skipButton} onPress={next}>
        <Text style={styles.skipText}>SKIP</Text>
      </TouchableOpacity>
    </View>
  </View>
);

export default OnboardingName;
