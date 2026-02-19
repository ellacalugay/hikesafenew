import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../styles/styles';

// Nature Background Container
export const ScreenContainer = ({ children }) => (
  <View style={styles.container}>
    <StatusBar barStyle="dark-content" />
    <LinearGradient
      colors={['#ecfccb', '#ffffff']}
      style={styles.backgroundGradient}
    />
    <View style={styles.bgTreeLeft} />
    <View style={styles.bgTreeRight} />
    <View style={styles.bgMountain} />
    
    <SafeAreaView style={styles.safeArea}>
      {children}
    </SafeAreaView>
  </View>
);

// Custom Button
export const MainButton = ({ title, onPress, variant = 'primary', style }) => (
  <TouchableOpacity 
    style={[
      styles.button, 
      variant === 'outline' ? styles.buttonOutline : styles.buttonPrimary,
      style
    ]} 
    onPress={onPress}
  >
    <Text style={[
      styles.buttonText, 
      variant === 'outline' ? styles.buttonTextOutline : styles.buttonTextPrimary
    ]}>
      {title}
    </Text>
  </TouchableOpacity>
);

// Custom Input
export const InputField = ({ label, placeholder, value, onChangeText, secureTextEntry, keyboardType, error }) => (
  <View style={styles.inputContainer}>
    {label && <Text style={styles.inputLabel}>{label}</Text>}
    <TextInput
      style={[styles.input, error ? { borderColor: 'red' } : null]}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
    />
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
  </View>
);
