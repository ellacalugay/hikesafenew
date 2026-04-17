import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Alert, ImageBackground, StyleSheet, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DefaultTheme, NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableScreens } from 'react-native-screens';
import { useFonts } from 'expo-font';
import LoaderOverlay from './components/LoaderOverlay';
import Transition from 'react-native-screen-transitions';
import { createBlankStackNavigator } from 'react-native-screen-transitions/blank-stack';
import { Easing as ReanimatedEasing, interpolate } from 'react-native-reanimated';
import { ThemeProvider, useTheme } from './context/ThemeContext';
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

import ReminderModal from './components/modals/ReminderModal';
import TermsModal from './components/modals/TermsModal';

// Startup loader visibility (helps ensure you can actually see it on fast reloads).
const MIN_STARTUP_LOADER_MS = 1500;
const STARTUP_TRANSITION_MS = 540;

enableScreens(true);

const Stack = createBlankStackNavigator();

const SMOOTH_TIMING_SPEC = {
  open: { duration: 420, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) },
  close: { duration: 380, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) },
};

const softZoomIn = () => ({
  screenStyleInterpolator: ({ progress }) => {
    'worklet';

    const scale = interpolate(progress, [0, 1, 2], [0.96, 1, 0.99]);

    return {
      contentStyle: {
        transform: [{ scale }],
      },
    };
  },
  transitionSpec: SMOOTH_TIMING_SPEC,
});

const slideFromBottomNoFade = (opts = {}) => ({
  gestureEnabled: opts.gestureEnabled,
  gestureDirection: opts.gestureDirection,
  transitionSpec: opts.transitionSpec ?? SMOOTH_TIMING_SPEC,
  screenStyleInterpolator: ({ progress, layouts: { screen } }) => {
    'worklet';
    return {
      contentStyle: {
        transform: [
          {
            translateY: interpolate(progress, [0, 1], [screen.height, 0]),
          },
        ],
      },
    };
  },
});

const slideFromTopNoFade = (opts = {}) => ({
  transitionSpec: opts.transitionSpec ?? SMOOTH_TIMING_SPEC,
  screenStyleInterpolator: ({ progress, layouts: { screen } }) => {
    'worklet';
    return {
      contentStyle: {
        transform: [
          {
            translateY: interpolate(progress, [0, 1], [-screen.height, 0]),
          },
        ],
      },
    };
  },
});

const slideFromRight = () => ({
  screenStyleInterpolator: ({ progress, layouts: { screen } }) => {
    'worklet';
    return {
      contentStyle: {
        transform: [
          {
            translateX: interpolate(
              progress,
              [0, 1],
              [screen.width, 0]
            ),
          },
        ],
      },
    };
  },
});

function AppNavigator() {
  const { colors } = useTheme();
  const navigationRef = useNavigationContainerRef();
  const { disconnect, clearChatHistory, clearBreadcrumbs, isConnected } = useBluetoothDevice();
  const {
    isLoading: userLoading,
    clearUser,
    firstName,
    lastName,
    contactName,
    contactPhone,
    medicalCondition,
  } = useUser();
  const { myNickname, isLoading: lobbyLoading, clearAccount } = useLobby();

  const [resumeAfterReconnect, setResumeAfterReconnect] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const hasOnboardingInfo = useMemo(() => {
    const hasName = !!((firstName || '').trim() || (lastName || '').trim());
    const hasNick = !!(myNickname || '').trim();
    const hasEmergencyContact = !!((contactName || '').trim() || (contactPhone || '').trim());
    const hasMedical = !!(medicalCondition || '').trim();
    return hasName || hasNick || hasEmergencyContact || hasMedical;
  }, [contactName, contactPhone, firstName, lastName, medicalCondition, myNickname]);

  // Global safety net: if the LoRa device powers off / goes out of range and the BLE link drops,
  // reset navigation to DeviceSetup from anywhere (Lobby, Dashboard, sub-screens) so the user
  // cannot "back" into a stale in-lobby/dashboard state.
  const wasConnectedRef = useRef(isConnected);
  useEffect(() => {
    const wasConnected = wasConnectedRef.current;
    wasConnectedRef.current = isConnected;

    if (!wasConnected || isConnected) return;

    try {
      setShowTerms(false);
      setShowReminder(false);
    } catch {
      // ignore
    }

    if (typeof navigationRef?.isReady === 'function' && !navigationRef.isReady()) return;

    const currentRoute = navigationRef.getCurrentRoute?.();
    if (currentRoute?.name === 'DeviceSetup') return;

    // Strict policy B: wipe stack to force the full reconnect flow.
    setResumeAfterReconnect(true);
    navigationRef.reset({
      index: 0,
      routes: [{ name: 'DeviceSetup' }],
    });
  }, [isConnected, navigationRef]);

  const handleEnterDashboard = (navigation) => {
    const nav = navigation || navigationRef;
    if (typeof nav?.isReady === 'function' && !nav.isReady()) return;
    // Clear Lobby/Onboarding from stack so transparent dashboard content
    // cannot show previous screens underneath.
    nav?.reset?.({
      index: 0,
      routes: [{ name: 'Dashboard' }],
    });
  };

    const handleDeviceSetupComplete = (navigation) => {
    if (userLoading || lobbyLoading) {
      return;
    }

    if (resumeAfterReconnect || hasOnboardingInfo) {
      setResumeAfterReconnect(false);
      navigation.navigate('Lobby');
      return;
    }

    navigation.navigate('OnboardingName');
  };

  const handleShowReminder = () => setShowReminder(true);

  const handleAcceptTerms = (navigation) => {
    setShowReminder(false);

    const nav = navigation || navigationRef;
    if (typeof nav?.isReady === 'function' && !nav.isReady()) return;
    nav?.navigate?.('Lobby');
  };

  const handleLogout = async (navigation) => {
    await disconnect();
    setResumeAfterReconnect(false);
    navigation.reset({ index: 0, routes: [{ name: 'DeviceSetup' }] });
  };

  const handleDeleteAccount = async (navigation) => {
    try {
      await clearAccount();
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
      navigation.reset({ index: 0, routes: [{ name: 'DeviceSetup' }] });
    }
  };

  const handleRequireDeviceSetup = (navigation) => {
    setResumeAfterReconnect(true);
    navigation.push('DeviceSetup');
  };

  useEffect(() => {
    const backAction = () => {
      if (showTerms) { setShowTerms(false); return true; }
      if (showReminder) { setShowReminder(false); return true; }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [showTerms, showReminder]);

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: 'transparent',
      card: 'transparent',
    },
  };

  return (
    <>
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        <Stack.Navigator
          initialRouteName="DeviceSetup"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        >
          <Stack.Screen
            name="DeviceSetup"
            options={{
              ...slideFromRight(),
              transitionSpec: SMOOTH_TIMING_SPEC,
            }}
          >
            {({ navigation }) => (
              <DeviceSetupScreen
                onNext={() => handleDeviceSetupComplete(navigation)}
                onSkip={() => handleDeviceSetupComplete(navigation)}
                allowSkip={!resumeAfterReconnect}
              />
            )}
          </Stack.Screen>

          <Stack.Screen
            name="OnboardingName"
            options={{
              ...(Platform.OS === 'ios'
                ? slideFromBottomNoFade({ gestureEnabled: true, gestureDirection: 'vertical' })
                : Transition.Presets.SlideFromBottom({
                    gestureEnabled: true,
                    gestureDirection: 'vertical',
                    transitionSpec: SMOOTH_TIMING_SPEC,
                  })),
            }}
          >
            {({ navigation }) => (
              <OnboardingName
                next={() => navigation.navigate('OnboardingDetails')}
              />
            )}
          </Stack.Screen>

          <Stack.Screen
            name="OnboardingDetails"
            options={{
              ...(Platform.OS === 'ios'
                ? slideFromBottomNoFade({ gestureEnabled: true, gestureDirection: 'vertical' })
                : Transition.Presets.SlideFromBottom({
                    gestureEnabled: true,
                    gestureDirection: 'vertical',
                    transitionSpec: SMOOTH_TIMING_SPEC,
                  })),
            }}
          >
            {({ navigation }) => (
              <OnboardingDetails
                next={handleShowReminder}
                onShowReminder={handleShowReminder}
                onBack={() => navigation.goBack()}
              />
            )}
          </Stack.Screen>

          <Stack.Screen
            name="Lobby"
            options={{
              ...(Platform.OS === 'ios'
                ? slideFromTopNoFade()
                : Transition.Presets.SlideFromTop({ transitionSpec: SMOOTH_TIMING_SPEC })),
            }}
          >
            {({ navigation }) => (
              <LobbyScreen
                onLogin={() => handleEnterDashboard(navigation)}
              />
            )}
          </Stack.Screen>

          <Stack.Screen
            name="Dashboard"
            options={{
              ...(Platform.OS === 'ios' ? slideFromRight() : softZoomIn()),
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            {({ navigation }) => (
              <Dashboard
                onLogout={() => handleLogout(navigation)}
                onDeleteAccount={() => handleDeleteAccount(navigation)}
                onRequireDeviceSetup={() => handleRequireDeviceSetup(navigation)}
              />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>

      <ReminderModal
        visible={showReminder && !showTerms}
        onAccept={() => handleAcceptTerms()}
        onShowTerms={() => setShowTerms(true)}
      />
      <TermsModal visible={showTerms} onClose={() => setShowTerms(false)} />
    </>
  );
}

export default function App() {
  // Crash-guard: capture uncaught JS errors and unhandled promise rejections.
  // This helps prevent release builds from hard-crashing on transient errors (e.g., fetch/network hiccups).
  useEffect(() => {
    const ErrorUtilsRef = globalThis?.ErrorUtils;
    const canSetHandler = !!(ErrorUtilsRef && typeof ErrorUtilsRef.setGlobalHandler === 'function');
    const prevHandler = canSetHandler && typeof ErrorUtilsRef.getGlobalHandler === 'function'
      ? ErrorUtilsRef.getGlobalHandler()
      : null;

    const handler = (err, isFatal) => {
      try {
        const message = err?.message || String(err);
        console.log('GlobalError:', message);

        if (!__DEV__ && isFatal) {
          Alert.alert(
            'Something went wrong',
            'HikeSafe hit an unexpected error. Please reopen the app.\n\nIf it keeps happening, try turning Bluetooth off/on and reconnect.',
            [{ text: 'OK' }]
          );
        }
      } catch {
        // ignore
      }

      // Preserve default behavior in dev so errors are still visible.
      if (__DEV__ && typeof prevHandler === 'function') {
        prevHandler(err, isFatal);
      }
    };

    if (canSetHandler) {
      ErrorUtilsRef.setGlobalHandler(handler);
    }

    const prevUnhandled = globalThis.onunhandledrejection;
    try {
      globalThis.onunhandledrejection = (event) => {
        try {
          const reason = event?.reason;
          const msg = reason?.message || String(reason);
          console.log('UnhandledPromiseRejection:', msg);
        } catch {
          // ignore
        }
        // Let any existing handler run too.
        if (typeof prevUnhandled === 'function') {
          try { prevUnhandled(event); } catch { /* ignore */ }
        }
      };
    } catch {
      // ignore
    }

    return () => {
      try {
        if (canSetHandler && typeof prevHandler === 'function') {
          ErrorUtilsRef.setGlobalHandler(prevHandler);
        }
        globalThis.onunhandledrejection = prevUnhandled;
      } catch {
        // ignore
      }
    };
  }, []);

  const [fontsLoaded] = useFonts({
    // Keep font family names the same as existing style usage.
    SpaceGrotesk_500Medium: require('./assets/fonts/SpaceGrotesk_500Medium.ttf'),
    SpaceGrotesk_700Bold: require('./assets/fonts/SpaceGrotesk_700Bold.ttf'),
    PublicSans_400Regular: require('./assets/fonts/PublicSans_400Regular.ttf'),
    PublicSans_600SemiBold: require('./assets/fonts/PublicSans_600SemiBold.ttf'),
    PublicSans_700Bold: require('./assets/fonts/PublicSans_700Bold.ttf'),
  });

  const startupLoaderStartRef = useRef(Date.now());
  const [startupLoaderVisible, setStartupLoaderVisible] = useState(true);

  const startupLoaderOpacity = useRef(new Animated.Value(1)).current;
  const appContentOpacity = useRef(new Animated.Value(0)).current;
  const [renderAppContent, setRenderAppContent] = useState(false);
  const [renderStartupLoader, setRenderStartupLoader] = useState(true);

  useEffect(() => {
    if (!fontsLoaded) {
      startupLoaderStartRef.current = Date.now();
      setStartupLoaderVisible(true);
      return;
    }

    const elapsed = Date.now() - startupLoaderStartRef.current;
    const remaining = Math.max(0, MIN_STARTUP_LOADER_MS - elapsed);
    const t = setTimeout(() => setStartupLoaderVisible(false), remaining);
    return () => clearTimeout(t);
  }, [fontsLoaded]);

  const readyToEnterApp = fontsLoaded && !startupLoaderVisible;

  useEffect(() => {
    if (!readyToEnterApp) {
      setRenderAppContent(false);
      setRenderStartupLoader(true);
      startupLoaderOpacity.setValue(1);
      appContentOpacity.setValue(0);
      return;
    }

    setRenderAppContent(true);
    Animated.parallel([
      Animated.timing(startupLoaderOpacity, {
        toValue: 0,
        duration: STARTUP_TRANSITION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(appContentOpacity, {
        toValue: 1,
        duration: STARTUP_TRANSITION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setRenderStartupLoader(false);
    });
  }, [readyToEnterApp, appContentOpacity, startupLoaderOpacity]);

  const ThemedRoot = ({ children }) => {
    const { colors } = useTheme();
    return (
      <GestureHandlerRootView style={[appStyles.root, { backgroundColor: colors.background }]}>
        <ImageBackground
          source={require('./assets/dashboard_bg.png')}
          style={StyleSheet.absoluteFillObject}
          imageStyle={appStyles.startupBgImage}
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} />
        {children}
      </GestureHandlerRootView>
    );
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedRoot>
          {renderAppContent && (
            <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: appContentOpacity }]} pointerEvents="auto">
              <UserProvider>
                <LobbyProvider>
                  <BluetoothProvider>
                    <AppNavigator />
                  </BluetoothProvider>
                </LobbyProvider>
              </UserProvider>
            </Animated.View>
          )}

          {renderStartupLoader && (
            <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: startupLoaderOpacity }]} pointerEvents="auto">
              <View style={appStyles.startupBg}>
                <LoaderOverlay message="Loading..." backgroundColor="transparent" />
              </View>
            </Animated.View>
          )}
        </ThemedRoot>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const appStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  startupBg: {
    flex: 1,
  },
  startupBgImage: {
    resizeMode: 'cover',
    width: '100%',
    height: '100%',
  },
});
