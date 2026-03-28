import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Modal, Animated, ImageBackground } from 'react-native';
import { ArrowLeft, Bell, Moon, MapPin, Shield, ChevronRight, X } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';

const SettingRow = ({ icon: Icon, label, hasToggle, value, onValueChange, onPress, colors }) => (
  <TouchableOpacity 
    style={[styles.menuOption, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]} 
    onPress={onPress}
    disabled={hasToggle}
  >
    <Icon size={20} color={colors.textDark} />
    <Text style={[styles.menuLabel, { flex: 1, color: colors.textDark }]}>{label}</Text>
    {hasToggle ? (
      <Switch
        trackColor={{ false: "#767577", true: colors.primaryLight }}
        thumbColor={value ? "#f4f3f4" : "#f4f3f4"}
        ios_backgroundColor="#3e3e3e"
        onValueChange={onValueChange}
        value={value}
      />
    ) : (
      <ChevronRight size={20} color={colors.gray} />
    )}
  </TouchableOpacity>
);

const SettingsScreen = ({ onBack }) => {
  const { colors, isDarkMode, toggleDarkMode } = useTheme();
  const [notifications, setNotifications] = useState(true);
  const [locationTracking, setLocationTracking] = useState(true);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const themeTransitionAnim = useRef(new Animated.Value(1)).current;

  const handleDarkModeToggle = (value) => {
    // Fade out
    Animated.timing(themeTransitionAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      // Change theme
      toggleDarkMode(value);
      // Fade in
      Animated.timing(themeTransitionAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
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
        backgroundColor: 'rgba(0, 0, 0, 0.55)', 
        zIndex: 0,
      }} />
    )}
    <Animated.View style={[{ flex: 1, opacity: themeTransitionAnim }]}>
      <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
        <View style={[styles.headerBar, { backgroundColor: colors.headerBg }]}>
          <TouchableOpacity 
            onPress={onBack} 
            style={{ position: 'absolute', left: 20, top: 15, padding: 5 }}
          >
            <ArrowLeft size={24} color={colors.textDark} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textDark }]}>SETTINGS</Text>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }}>
        <Text style={[styles.sectionHeader, { marginTop: 0, color: colors.textDark }]}>Notifications</Text>
        <SettingRow 
          icon={Bell} 
          label="Push Notifications" 
          hasToggle 
          value={notifications}
          onValueChange={setNotifications}
          colors={colors}
        />

        <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Appearance</Text>
        <SettingRow 
          icon={Moon} 
          label="Dark Mode" 
          hasToggle 
          value={isDarkMode}
          onValueChange={handleDarkModeToggle}
          colors={colors}
        />

        <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Privacy</Text>
        <SettingRow 
          icon={MapPin} 
          label="Location Tracking" 
          hasToggle 
          value={locationTracking}
          onValueChange={setLocationTracking}
          colors={colors}
        />
        <SettingRow 
          icon={Shield} 
          label="Privacy Policy" 
          onPress={() => setShowPrivacyModal(true)}
          colors={colors}
        />

        <Text style={[styles.sectionHeader, { color: colors.textDark }]}>About</Text>
        <View style={[styles.menuOption, { flexDirection: 'column', alignItems: 'flex-start', backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
          <Text style={{ color: colors.textDark, fontWeight: '600' }}>HikeSafe</Text>
          <Text style={{ color: colors.gray, fontSize: 12, marginTop: 4 }}>Version 1.0.0</Text>
        </View>
      </ScrollView>

      {/* Privacy Policy Modal */}
      <Modal
        visible={showPrivacyModal}
        animationType="slide"
        onRequestClose={() => setShowPrivacyModal(false)}
      >
        <View style={[styles.tabContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.headerBar, { backgroundColor: colors.headerBg }]}>
            <TouchableOpacity 
              onPress={() => setShowPrivacyModal(false)} 
              style={{ position: 'absolute', left: 20, top: 15, padding: 5 }}
            >
              <X size={24} color={colors.textDark} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textDark }]}>PRIVACY POLICY</Text>
          </View>
          <ScrollView style={{ flex: 1, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textDark, marginBottom: 10 }}>
              HikeSafe Privacy Policy
            </Text>
            <Text style={{ color: colors.textDark, lineHeight: 22, marginBottom: 15 }}>
              Last updated: January 2025
            </Text>
            
            <Text style={{ fontWeight: '600', color: colors.textDark, marginBottom: 8 }}>
              1. Information We Collect
            </Text>
            <Text style={{ color: colors.gray, lineHeight: 22, marginBottom: 15 }}>
              We collect information you provide directly to us, including your name, email address, and location data when using our hiking safety features.
            </Text>

            <Text style={{ fontWeight: '600', color: colors.textDark, marginBottom: 8 }}>
              2. How We Use Your Information
            </Text>
            <Text style={{ color: colors.gray, lineHeight: 22, marginBottom: 15 }}>
              Your location data is used solely for the purpose of helping you stay connected with your hiking group and ensuring your safety on trails. We do not sell or share your personal information with third parties.
            </Text>

            <Text style={{ fontWeight: '600', color: colors.textDark, marginBottom: 8 }}>
              3. Data Security
            </Text>
            <Text style={{ color: colors.gray, lineHeight: 22, marginBottom: 15 }}>
              We implement appropriate security measures to protect your personal information. Location data is encrypted and stored securely.
            </Text>

            <Text style={{ fontWeight: '600', color: colors.textDark, marginBottom: 8 }}>
              4. Your Rights
            </Text>
            <Text style={{ color: colors.gray, lineHeight: 22, marginBottom: 15 }}>
              You have the right to access, update, or delete your personal information at any time through the app settings.
            </Text>

            <Text style={{ fontWeight: '600', color: colors.textDark, marginBottom: 8 }}>
              5. Contact Us
            </Text>
            <Text style={{ color: colors.gray, lineHeight: 22, marginBottom: 30 }}>
              If you have any questions about this Privacy Policy, please contact us at support@hikesafe.app
            </Text>

            <TouchableOpacity 
              style={[styles.modalButton, { backgroundColor: colors.primary, marginBottom: 30 }]}
              onPress={() => setShowPrivacyModal(false)}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>I Understand</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
      </View>
    </Animated.View>
    </ImageBackground>
  );
};

export default SettingsScreen;
