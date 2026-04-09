import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Animated, BackHandler, ActivityIndicator, Easing } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { PublicSans_400Regular, PublicSans_600SemiBold, PublicSans_700Bold } from '@expo-google-fonts/public-sans';
import { ScreenContainer } from './components/shared';
import { styles } from './styles/styles';
import { ThemeProvider } from './context/ThemeContext';
import { BluetoothProvider } from './context/BluetoothContext';
import { LobbyProvider } from './context/LobbyContext';
import { UserProvider } from './context/UserContext';
import { useBluetoothDevice } from './context/BluetoothContext';
import { useUser } from './context/UserContext';
import { useLobby } from './context/LobbyContext';
import DeviceSetupScreen from './screens/DeviceSetupScreen';
import OnboardingName from './screens/OnboardingName';
import OnboardingDetails from './screens/OnboardingDetails';
import LobbyScreen from './screens/LobbyScreen';
import Dashboard from './screens/Dashboard';

function AppContent() {
  const { disconnect, clearChatHistory, clearBreadcrumbs } = useBluetoothDevice();
  const { firstName, lastName, isLoading: userLoading, clearUser } = useUser();
  const { myNickname, isLoading: lobbyLoading, clearAccount } = useLobby();
  const [screenStack, setScreenStack] = useState(['deviceSetup']);
  const screen = screenStack[screenStack.length - 1];
  const [transitioningOnboardingScreen, setTransitioningOnboardingScreen] = useState(null);
  const [transitionDirection, setTransitionDirection] = useState(1);
  const [disableOnboardingIntroFor, setDisableOnboardingIntroFor] = useState(null);
  const [resumeAfterReconnect, setResumeAfterReconnect] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lobbyData, setLobbyData] = useState({ lobbyName: '', groupId: '', maxMember: '' });
  const screenFadeAnim = useRef(new Animated.Value(0)).current;
  const onboardingTransitionAnim = useRef(new Animated.Value(0)).current;
  const skipNextScreenFadeRef = useRef(false);

  const [activeTab, setActiveTab] = useState('home');
  const [tabHistory, setTabHistory] = useState(['home']);

  const navigateTo = (newScreen) => {
    setScreenStack(prev => [...prev, newScreen]);
  };

  const navigateBack = () => {
    setScreenStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  };

  const startOnboardingTransition = (nextScreen, direction) => {
    if (transitioningOnboardingScreen) return;
    if (screen === nextScreen) return;

    skipNextScreenFadeRef.current = true;
    setDisableOnboardingIntroFor(nextScreen);
    setTransitionDirection(direction);
    setTransitioningOnboardingScreen(nextScreen);
    onboardingTransitionAnim.setValue(0);

    Animated.timing(onboardingTransitionAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;

      setScreenStack(prev => {
        if (direction > 0) {
          return [...prev, nextScreen];
        }
        return prev.length > 1 ? prev.slice(0, -1) : prev;
      });

      // Keep the overlay fully visible for at least one frame while the
      // underlying screen swaps/mounts to avoid a one-frame flash/jitter.
      requestAnimationFrame(() => {
        setTransitioningOnboardingScreen(null);
        onboardingTransitionAnim.setValue(0);
      });
    });
  };

  useEffect(() => {
    if (disableOnboardingIntroFor && screen === disableOnboardingIntroFor) {
      setDisableOnboardingIntroFor(null);
    }
  }, [screen, disableOnboardingIntroFor]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setTabHistory(prev => [...prev, tab]);
  };

  const handleDeviceSetupComplete = () => {
    if (resumeAfterReconnect) {
      setResumeAfterReconnect(false);
      navigateTo('dashboard');
      return;
    }
    // Nickname is required for lobby identity. Only skip onboarding if we have it.
    // This also handles older installs where first/last name existed but nickname was never collected.
    if (!userLoading && !lobbyLoading && (myNickname || '').trim().length > 0) {
      navigateTo('lobby'); 
      return;
    }
    navigateTo('onboarding1');
  };
  const handleNextOnboarding = () => startOnboardingTransition('onboarding2', 1);
  const handleBackOnboarding = () => startOnboardingTransition('onboarding1', -1);
  
  const handleShowReminder = () => setShowReminder(true);
  
  const handleAcceptTerms = () => {
    setShowReminder(false);
    navigateTo('lobby');
  };

  const handleCreateLobbySuccess = (data) => {
    setLobbyData(data);
    setShowSuccess(true);
  };
  
  const handleEnterDashboard = () => {
    setShowSuccess(false);
    setActiveTab('home');
    setTabHistory(['home']);
    navigateTo('dashboard');
  };

  const handleLogout = async () => {
    // Explicit logout is the only flow that should tear down BLE session.
    await disconnect();
    setResumeAfterReconnect(false);
    setActiveTab('home');
    setTabHistory(['home']);
    setScreenStack(['deviceSetup']);
  };

  const handleDeleteAccount = async () => {
    // Wipe local account/profile state so onboarding runs again next launch.
    try {
      // Clear lobby/profile first (best-effort: clears device lobby filter while connected)
      await clearAccount();

      // Clear local app data
      await Promise.all([
        clearChatHistory?.(),
        clearBreadcrumbs?.(),
        clearUser(),
      ]);
    } catch (e) {
      console.log('Delete account cleanup failed:', e?.message || e);
    } finally {
      await disconnect();
      setResumeAfterReconnect(false);
      setActiveTab('home');
      setTabHistory(['home']);
      setScreenStack(['deviceSetup']);
    }
  };

  const handleRequireDeviceSetup = () => {
    setResumeAfterReconnect(true);
    navigateTo('deviceSetup');
  };

  // Define screen history for back navigation
  useEffect(() => {
    const backAction = () => {
      // Close any open modal first
      if (showTerms) { setShowTerms(false); return true; }
      if (showReminder) { setShowReminder(false); return true; }
      if (showSuccess) { setShowSuccess(false); return true; }

      if (screen === 'dashboard') {
        if (tabHistory.length > 1) {
          // Pop current tab, go back to previous tab
          const newHistory = tabHistory.slice(0, -1);
          setTabHistory(newHistory);
          setActiveTab(newHistory[newHistory.length - 1]);
          return true;
        }
        // On home tab (root) — go back to lobby
        navigateBack();
        return true;
      }

      // If there are previous screens in the stack, go back to the last one
      if (screenStack.length > 1) {
        navigateBack();
        return true;
      }

      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [screenStack, screen, tabHistory, showTerms, showReminder, showSuccess]);

  // Screen transition animation
  useEffect(() => {
    if (skipNextScreenFadeRef.current) {
      screenFadeAnim.setValue(1);
      skipNextScreenFadeRef.current = false;
      return;
    }

    screenFadeAnim.setValue(0);
    Animated.timing(screenFadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [screen]);

  return (
    <ScreenContainer>
      <Animated.View style={{ flex: 1, opacity: screenFadeAnim }}>
        <View style={{ flex: 1 }}>
          {screen === 'deviceSetup' && (
            <DeviceSetupScreen
              onNext={handleDeviceSetupComplete}
              onSkip={handleDeviceSetupComplete}
              allowSkip={!resumeAfterReconnect}
            />
          )}
          {screen === 'onboarding1' && (
            <OnboardingName
              next={handleNextOnboarding}
              disableMountAnimation={disableOnboardingIntroFor === 'onboarding1'}
            />
          )}
          {screen === 'onboarding2' && (
            <OnboardingDetails
              next={handleShowReminder}
              onShowReminder={handleShowReminder}
              onBack={handleBackOnboarding}
              disableMountAnimation={disableOnboardingIntroFor === 'onboarding2'}
            />
          )}
          {screen === 'lobby' && <LobbyScreen onLogin={handleEnterDashboard} onShowCreateSuccess={handleCreateLobbySuccess} />}
          {screen === 'dashboard' && (
            <Dashboard
              onLogout={handleLogout}
              onDeleteAccount={handleDeleteAccount}
              onRequireDeviceSetup={handleRequireDeviceSetup}
              activeTab={activeTab}
              onTabChange={handleTabChange}
            />
          )}

          {transitioningOnboardingScreen && screen === 'onboarding1' && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: onboardingTransitionAnim,
                renderToHardwareTextureAndroid: true,
                shouldRasterizeIOS: true,
                transform: [
                  {
                    translateX: onboardingTransitionAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16 * transitionDirection, 0],
                    }),
                  },
                ],
              }}
            >
              <OnboardingDetails
                next={handleShowReminder}
                onShowReminder={handleShowReminder}
                onBack={handleBackOnboarding}
                disableMountAnimation
              />
            </Animated.View>
          )}

          {transitioningOnboardingScreen && screen === 'onboarding2' && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: onboardingTransitionAnim,
                renderToHardwareTextureAndroid: true,
                shouldRasterizeIOS: true,
                transform: [
                  {
                    translateX: onboardingTransitionAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16 * transitionDirection, 0],
                    }),
                  },
                ],
              }}
            >
              <OnboardingName next={handleNextOnboarding} disableMountAnimation />
            </Animated.View>
          )}
        </View>
      </Animated.View>

      {/* HikeSafe Reminder Modal */}
      <Modal visible={showReminder && !showTerms} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentGreen}>
                <Text style={styles.modalTitleWhite}>HikeSafe Reminder</Text>
                <Text style={styles.modalTextWhite}>
                  Before continuing, please read and agree to our {' '}
                  <Text
                    onPress={() => setShowTerms(true)}
                    style={{ fontWeight: '700' }}
                  >
                    Terms and Conditions
                  </Text>
                  .{"\n"}{"\n"}
                  By tapping "Accept and Continue", you agree that:{'\n'}
                  • You'll use HikeSafe responsibly.{'\n'}
                  • HikeSafe is a tool to assist safety but does not replace personal responsibility.{'\n'}
                </Text>

                <TouchableOpacity style={[styles.buttonWhite, { alignSelf: 'center', width: '80%'}]} onPress={handleAcceptTerms}>
                  <Text style={[styles.buttonTextGreen, {textAlign: 'center'}]}>ACCEPT AND CONTINUE</Text>
                </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Terms Modal */}
      <Modal visible={showTerms} transparent animationType="slide">
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
          <LinearGradient
            colors={['#46981D', '#3A8619', '#2F7315']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ width: '90%', height: '90%', borderRadius: 20, padding: 20, flexDirection: 'column' }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[styles.modalTitleWhite, { textAlign: 'center', marginBottom: 12 }]}
            >
              Terms and Conditions
            </Text>
            <ScrollView style={{flex: 1, marginBottom: 12}} showsVerticalScrollIndicator={false}>
              <View style={{ paddingRight: 8 }}>
                <View style={{marginBottom: 12}}>
                  <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                    <Text style={styles.modalNumber}>1.</Text>
                    <Text style={styles.modalSectionTitle}>Acceptance of Terms</Text>
                  </View>
                  <Text style={[styles.modalParagraph, { textAlign: 'justify' }]}>
                    By using the HikeSafe app, you agree to comply with these Terms and Conditions. Please read them carefully before using the app.
                  </Text>
                </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>2.</Text>
                  <Text style={styles.modalSectionTitle}>Purpose of the App</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  HikeSafe is designed to help hikers stay safe by offering tools such as GPS tracking, emergency alerts, and route recording. It is intended as a supportive tool not a replacement for personal preparation, awareness, or professional guidance during outdoor activities.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>3.</Text>
                  <Text style={styles.modalSectionTitle}>User Responsibilities</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  • Use HikeSafe responsibly and only for lawful purposes
                  {'\n'}• Ensure your device has enough battery, storage, and connectivity
                  {'\n'}• Provide accurate personal and emergency contact details
                  {'\n'}• Do not misuse the app (e.g., sending false emergency alerts or sharing misleading data)
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>4.</Text>
                  <Text style={styles.modalSectionTitle}>Safety Disclaimer</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  While HikeSafe aims to enhance hiking safety, we do not guarantee complete safety or uninterrupted service. You acknowledge that hiking involves risks, and you are responsible for your own safety and decisions while on the trail.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>5.</Text>
                  <Text style={styles.modalSectionTitle}>Privacy and Data Use</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We collect limited data (such as location, contact, and device information) to provide safety features and improve performance. Your data is used only for app functionality and emergency purposes, and will not be sold to third parties.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>6.</Text>
                  <Text style={styles.modalSectionTitle}>App Updates and Availability</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We may update or modify HikeSafe without prior notice. We do not guarantee that all features will always be available or free of errors.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>7.</Text>
                  <Text style={styles.modalSectionTitle}>Intellectual Property</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  All content, design, and code within HikeSafe are owned by the HikeSafe Team. You may not copy, modify, or redistribute any part of the app without written permission.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>8.</Text>
                  <Text style={styles.modalSectionTitle}>Limitation of Liability</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  HikeSafe and its developers will not be liable for any injury, loss or damage resulting from your use of the app. Use it at your own risk and always practice caution when hiking.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>9.</Text>
                  <Text style={styles.modalSectionTitle}>Termination of Use</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We reserve the right to suspend or terminate access to HikeSafe for violations of these Terms or misuse of the app.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>10.</Text>
                  <Text style={styles.modalSectionTitle}>Contact Us</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  If you have questions about these Terms, please reach out at hikesafe.team@gmail.com
                </Text>
              </View>
              </View>
            </ScrollView>
            <TouchableOpacity style={{ backgroundColor: 'white', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, alignItems: 'center' }} onPress={() => {
              setShowTerms(false);
            }}>
              <Text style={{ color: '#2E8B57', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>I UNDERSTAND</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </Modal>

      {/* Lobby Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={styles.cardGreen}>
             <Text style={styles.cardTitleWhite}>Lobby Creation Successful</Text>
             <View style={styles.separatorWhite} />
             <Text style={styles.cardSubtitleWhite}>Your lobby has been successfully created.</Text>
             
             <View style={styles.infoRow}>
               <Text style={styles.infoLabel}>Lobby Name:</Text>
               <Text style={styles.infoValue}>{lobbyData.lobbyName || 'N/A'}</Text>
             </View>
             <View style={styles.infoRow}>
               <Text style={styles.infoLabel}>Group ID:</Text>
               <Text style={styles.infoValue}>{lobbyData.groupId || 'N/A'}</Text>
             </View>
             <View style={styles.infoRow}>
               <Text style={styles.infoLabel}>Max Member:</Text>
               <Text style={styles.infoValue}>{lobbyData.maxMember || 'N/A'}</Text>
             </View>
             
             <TouchableOpacity style={styles.buttonWhite} onPress={handleEnterDashboard}>
               <Text style={styles.buttonTextGreen}>GO TO DASHBOARD</Text>
             </TouchableOpacity>
           </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    PublicSans_400Regular,
    PublicSans_600SemiBold,
    PublicSans_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8faf5' }}>
          <ActivityIndicator size="large" color="#156e05" />
          <Text style={{ marginTop: 12, fontSize: 14, color: '#404a3b', fontWeight: '600' }}>
            Loading…
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <UserProvider>
          <LobbyProvider>
            <BluetoothProvider>
              <AppContent />
            </BluetoothProvider>
          </LobbyProvider>
        </UserProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
