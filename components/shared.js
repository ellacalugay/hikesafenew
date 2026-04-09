import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
export const InputField = ({ label, placeholder, value, onChangeText, secureTextEntry, keyboardType, error, maxLength, icon, rightElement, containerStyle, inputStyle, editable = true }) => {
  const { colors } = useTheme();
  const textColor = editable ? colors.textDark : colors.gray;
  
  return (
    <View style={[styles.inputContainer, containerStyle]}>
      {label && <Text style={[styles.inputLabel, { color: colors.textDark }]}>{label}</Text>}
      <View
        style={[
          styles.inputRow,
          { backgroundColor: colors.inputBg, borderColor: colors.borderColor },
          !editable ? { opacity: 0.72, borderStyle: 'dashed' } : null,
          error ? { borderColor: 'red' } : null,
        ]}
      >
        {icon ? <View style={styles.inputIcon}>{icon}</View> : null}
        <TextInput
          style={[styles.input, { color: textColor, borderWidth: 0, flex: 1 }, inputStyle]}
          placeholder={placeholder}
          placeholderTextColor={colors.gray}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          maxLength={maxLength}
          editable={editable}
          selectTextOnFocus={editable}
        />
        {rightElement ? <View style={styles.inputRight}>{rightElement}</View> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};
