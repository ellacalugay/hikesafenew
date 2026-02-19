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
import { useTheme } from '../context/ThemeContext';

// Nature Background Container
export const ScreenContainer = ({ children }) => {
  const { isDarkMode, colors } = useTheme();
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <LinearGradient
        colors={isDarkMode ? ['#1a1a1a', '#252525'] : ['#ecfccb', '#ffffff']}
        style={styles.backgroundGradient}
      />
      {!isDarkMode && (
        <>
          <View style={styles.bgTreeLeft} />
          <View style={styles.bgTreeRight} />
          <View style={styles.bgMountain} />
        </>
      )}
      
      <SafeAreaView style={styles.safeArea}>
        {children}
      </SafeAreaView>
    </View>
  );
};

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
export const InputField = ({ label, placeholder, value, onChangeText, secureTextEntry, keyboardType, error, maxLength }) => {
  const { colors } = useTheme();
  
  return (
    <View style={styles.inputContainer}>
      {label && <Text style={[styles.inputLabel, { color: colors.textDark }]}>{label}</Text>}
      <TextInput
        style={[
          styles.input, 
          { backgroundColor: colors.inputBg, color: colors.textDark, borderColor: colors.borderColor },
          error ? { borderColor: 'red' } : null
        ]}
        placeholder={placeholder}
        placeholderTextColor={colors.gray}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        maxLength={maxLength}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};
