import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ImageBackground,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styles } from '../styles/styles';
import { useTheme } from '../context/ThemeContext';
import { BlurView } from 'expo-blur';

// Nature Background Container
export const ScreenContainer = ({ children, bgImage }) => {
  const { isDarkMode, colors } = useTheme();
  
  return (
    <ImageBackground
      source={bgImage || require('../assets/dashboard_bg.png')}
      style={[styles.container, { backgroundColor: colors.background }]}
      imageStyle={{ resizeMode: 'cover', width: '100%', height: '100%' }}
    >
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />

      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} />
      
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {children}
      </SafeAreaView>
    </ImageBackground>
  );
};

// Custom Button
export const MainButton = ({ title, onPress, variant = 'primary', style, disabled }) => {
  const { colors } = useTheme();
  const isOutline = variant === 'outline';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      style={[
        styles.button,
        {
          backgroundColor: isOutline ? 'transparent' : colors.primary,
          borderColor: colors.primary,
          borderWidth: isOutline ? 2 : 0,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.buttonText, { color: isOutline ? colors.primary : colors.textLight }]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

export const GlassCard = ({ children, style, intensity, tint }) => {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: 16,
          overflow: 'hidden',
          position: 'relative',
          borderWidth: 1,
          borderColor: colors.glassBorder,
        },
        style,
      ]}
    >
      <BlurView
        intensity={typeof intensity === 'number' ? intensity : colors.glassIntensity}
        tint={tint || colors.glassTint}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />
      {children}
    </View>
  );
};

// Custom Input
export const InputField = ({ label, placeholder, value, onChangeText, secureTextEntry, keyboardType, error, maxLength, autoFocus, icon, rightElement, containerStyle, inputStyle, editable = true }) => {
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
          autoFocus={!!autoFocus}
          editable={editable}
          selectTextOnFocus={editable}
        />
        {rightElement ? <View style={styles.inputRight}>{rightElement}</View> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};
