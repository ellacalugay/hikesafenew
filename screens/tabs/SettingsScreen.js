import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Modal, Animated, Alert, StyleSheet, Image } from 'react-native';
import { ArrowLeft, Bell, Moon, MapPin, Shield, ChevronRight, X, AlertTriangle } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOCATION_SERVICES_PREF_KEY = '@hikesafe_location_services_enabled';
const LOCATION_SERVICES_PROMPTED_KEY = '@hikesafe_location_services_prompted';

const SettingRow = ({ icon: Icon, label, hasToggle, value, onValueChange, onPress, colors }) => (
  <TouchableOpacity 
    style={[
      styles.menuOption,
      {
        borderWidth: 1,
        borderColor: colors.glassBorder,
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 0,
      },
    ]} 
    onPress={onPress}
    disabled={hasToggle}
  >
    <BlurView
      intensity={colors.glassIntensity}
      tint={colors.glassTint}
      style={StyleSheet.absoluteFillObject}
    />
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

    <Icon size={20} color={colors.textDark} />
    <Text numberOfLines={1} style={[styles.menuLabel, { flex: 1, color: colors.textDark }]}>{label}</Text>
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

const SettingsScreen = ({ onBack, onDeleteAccount }) => {
  const { colors, isDarkMode, toggleDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState(true);
  const [locationServicesEnabled, setLocationServicesEnabled] = useState(true);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const themeTransitionAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LOCATION_SERVICES_PREF_KEY);
        if (!alive) return;
        if (saved === null) {
          setLocationServicesEnabled(true);
        } else {
          setLocationServicesEnabled(saved === 'true');
        }
      } catch (e) {
        if (alive) setLocationServicesEnabled(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const setLocationServicesPref = useCallback(async (enabled) => {
    setLocationServicesEnabled(enabled);
    try {
      await AsyncStorage.setItem(LOCATION_SERVICES_PREF_KEY, enabled ? 'true' : 'false');
      await AsyncStorage.setItem(LOCATION_SERVICES_PROMPTED_KEY, 'true');
    } catch (e) {
      // ignore
    }
  }, []);

  const handleLocationServicesToggle = useCallback(async (enabled) => {
    if (!enabled) {
      await setLocationServicesPref(false);
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location permission is needed to use the compass in the Location tab.');
        await setLocationServicesPref(false);
        return;
      }
      await setLocationServicesPref(true);
    } catch (e) {
      Alert.alert('Permission Error', 'Could not request location permission.');
      await setLocationServicesPref(false);
    }
  }, [setLocationServicesPref]);

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
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      <Animated.View style={[{ flex: 1, opacity: themeTransitionAnim }]}>
        <View
          style={[
            styles.headerBar,
            {
              backgroundColor: colors.headerBg,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
              elevation: 5,
              zIndex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: insets.top + 10,
              paddingBottom: 15,
              height: insets.top + 60,
            },
          ]}
        >
          <TouchableOpacity onPress={onBack} style={{ position: 'absolute', left: 16, bottom: 12, padding: 4 }}>
            <ArrowLeft size={24} color={colors.textDark} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textDark, fontWeight: '700', fontSize: 20, bottom: -4 }]}>SETTINGS</Text>
          <Image
            source={require('../../assets/hike_logo.png')}
            style={{ position: 'absolute', right: 16, bottom: 6, width: 36, height: 36, resizeMode: 'contain' }}
          />
        </View>

        <ScrollView
          style={{ flex: 1, padding: 20 }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 90, 50) }}
          showsVerticalScrollIndicator={false}
        >
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
            label="Location Services"
            hasToggle
            value={locationServicesEnabled}
            onValueChange={handleLocationServicesToggle}
            colors={colors}
          />
          <SettingRow
            icon={Shield}
            label="Privacy Policy"
            onPress={() => setShowPrivacyModal(true)}
            colors={colors}
          />

          <Text style={[styles.sectionHeader, { color: colors.textDark }]}>About</Text>
          <View
            style={[
              styles.menuOption,
              {
                flexDirection: 'column',
                alignItems: 'flex-start',
                borderWidth: 1,
                borderColor: colors.glassBorder,
              },
            ]}
          >
            <BlurView
              intensity={colors.glassIntensity}
              tint={colors.glassTint}
              style={StyleSheet.absoluteFillObject}
            />
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

            <Text style={{ color: colors.textDark, fontWeight: '600' }}>HikeSafe</Text>
            <Text style={{ color: colors.gray, fontSize: 12, marginTop: 4 }}>Version 1.0.0</Text>
          </View>

          <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Account</Text>
          <SettingRow
            icon={AlertTriangle}
            label="Delete Account"
            onPress={() => setShowDeleteModal(true)}
            colors={colors}
          />
        </ScrollView>

        {/* Privacy Policy Modal */}
        <Modal
          visible={showPrivacyModal}
          animationType="slide"
          onRequestClose={() => setShowPrivacyModal(false)}
        >
          <View style={[styles.tabContainer, { backgroundColor: colors.background }]}>
            <View
              style={[
                styles.headerBar,
                {
                  backgroundColor: colors.headerBg,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingTop: insets.top + 10,
                  paddingBottom: 15,
                  height: insets.top + 60,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => setShowPrivacyModal(false)}
                style={{ position: 'absolute', left: 16, bottom: 12, padding: 4 }}
              >
                <X size={24} color={colors.textDark} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.textDark, fontSize: 20, bottom: -4 }]}>PRIVACY POLICY</Text>
            </View>
            <ScrollView style={{ flex: 1, padding: 20 }} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
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

        {/* Delete Account Modal */}
        <Modal
          visible={showDeleteModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeleteModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.modalTitle, { color: colors.textDark, textAlign: 'center' }]}>Delete Account</Text>
              <Text style={[styles.modalText, { color: colors.textDark, textAlign: 'center', marginBottom: 16 }]}
              >
                Are you sure you want to delete your account on this device? You'll need to complete onboarding again next time.
              </Text>

              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.inputBg, marginRight: 10, flex: 1 }]}
                  onPress={() => setShowDeleteModal(false)}
                >
                  <Text style={{ color: colors.textDark, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.danger, flex: 1 }]}
                  onPress={() => {
                    setShowDeleteModal(false);
                    onDeleteAccount && onDeleteAccount();
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '600' }}>Yes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </Animated.View>
    </View>
  );
};

export default SettingsScreen;
