import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, Modal, Text, Pressable, Vibration, Share, Alert, ScrollView, TouchableWithoutFeedback, BackHandler, useWindowDimensions, StyleSheet, ImageBackground } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Home, MapPin, MessageCircle, User, CheckSquare, Square, AlertTriangle, X, Users } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { styles } from '../styles/styles';
import { useTheme } from '../context/ThemeContext';
import { useBluetoothDevice } from '../context/BluetoothContext';
import { useLobby } from '../context/LobbyContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import HomeTab from './tabs/HomeTab';
import LocationTab from './tabs/LocationTab';
import MessageTab from './tabs/MessageTab';
import ProfileTab from './tabs/ProfileTab';
import EditProfileScreen from './tabs/EditProfileScreen';
import ChatScreen from './tabs/ChatScreen';
import SettingsScreen from './tabs/SettingsScreen';
import HelpScreen from './tabs/HelpScreen';
import ReportProblemScreen from './tabs/ReportProblemScreen';
import MembersTab from './tabs/MembersTab';

const TAB_ORDER = ['home', 'location', 'message', 'members', 'profile'];
const SUB_SCREENS = ['editProfile', 'chat', 'settings', 'help', 'reportProblem'];

const TabIcon = ({ icon: Icon, active, onPress, colors }) => (
  <TouchableOpacity style={styles.tabItem} onPress={onPress}>
    {active ? (
      <LinearGradient
        colors={[colors.primaryLight, colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.activeTabGradient}
      >
        <Icon size={24} color="#FFFFFF" />
      </LinearGradient>
    ) : (
      <Icon size={24} color={colors.gray} />
    )}
  </TouchableOpacity>
);

const Dashboard = ({ onLogout, onDeleteAccount, onRequireDeviceSetup }) => {
  const { colors, isDarkMode } = useTheme();
  const navigation = useNavigation();
  const { activeAlert, dismissAlert, silenceActiveAlert, sendOK, sendCommand, isConnected, memberLocations } = useBluetoothDevice();
  const { lobbyCode, lobbyName, leaveLobby, isInLobby, getEmergencyContactForDevice, getMemberNickname } = useLobby();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState('home');
  const [tabHistory, setTabHistory] = useState(['home']);
  const renderedTabRef = useRef('home');
  const [renderedTab, setRenderedTab] = useState('home');
  const [transitionFromTab, setTransitionFromTab] = useState(null);
  const [transitionToTab, setTransitionToTab] = useState(null);
  const transitionToTabRef = useRef(null);
  const isTransitioningRef = useRef(false);
  const transitionProgress = useSharedValue(1);
  const transitionDirection = useSharedValue(1);
  // 0 = slide horizontal, 1 = cross-fade, 2 = slide up (modal), 3 = slide down (dismiss)
  const transitionMode = useSharedValue(0);
  const [chatName, setChatName] = useState('');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [skipLogoutConfirm, setSkipLogoutConfirm] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showLobbyModal, setShowLobbyModal] = useState(false);
  const [showSOSAlertModal, setShowSOSAlertModal] = useState(false);
  const joinAnnounceKeyRef = useRef(null);
  const wasConnectedRef = useRef(isConnected);

  const resolvedAlertLocation = useMemo(() => {
    if (!activeAlert || activeAlert.type === 'OFFLINE') return null;

    const alertLat = Number(activeAlert.lat);
    const alertLng = Number(activeAlert.lng);
    const hasAlertCoords =
      Number.isFinite(alertLat) &&
      Number.isFinite(alertLng) &&
      !(alertLat === 0 && alertLng === 0);

    if (hasAlertCoords) {
      return { lat: alertLat, lng: alertLng, source: 'alert' };
    }

    const deviceId = typeof activeAlert.deviceId === 'number' ? activeAlert.deviceId : null;
    if (!deviceId || !Array.isArray(memberLocations)) {
      return null;
    }

    const member = memberLocations.find((m) =>
      m &&
      m.deviceId === deviceId &&
      Number.isFinite(Number(m.latitude)) &&
      Number.isFinite(Number(m.longitude))
    );

    if (!member) {
      return null;
    }

    const memberLat = Number(member.latitude);
    const memberLng = Number(member.longitude);
    if (memberLat === 0 && memberLng === 0) {
      return null;
    }

    return { lat: memberLat, lng: memberLng, source: 'member' };
  }, [activeAlert, memberLocations]);

  const changeTab = useCallback((nextTab) => {
    setActiveTab((currentTab) => {
      if (currentTab === nextTab) return currentTab;
      setTabHistory((prev) => [...prev, nextTab]);
      return nextTab;
    });
  }, []);

  const goBackTab = useCallback(() => {
    setTabHistory((prev) => {
      if (prev.length <= 1) return prev;
      const nextHistory = prev.slice(0, -1);
      const previousTab = nextHistory[nextHistory.length - 1] ?? 'home';
      setActiveTab(previousTab);
      return nextHistory;
    });
  }, []);

  // Ask for location permission early (no in-app blocking popups).
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!alive) return;
        if (perm?.status !== 'granted' && perm?.canAskAgain) {
          await Location.requestForegroundPermissionsAsync();
        }
      } catch {
        // best-effort only
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleLocationTabPress = useCallback(() => {
    changeTab('location');
  }, [changeTab]);

  const getTransitionMode = useCallback((fromTab, toTab) => {
    const fromIsSub = SUB_SCREENS.includes(fromTab);
    const toIsSub = SUB_SCREENS.includes(toTab);

    if (!fromIsSub && toIsSub) return 2;
    if (fromIsSub && !toIsSub) return 3;

    const fromIndex = TAB_ORDER.indexOf(fromTab);
    const toIndex = TAB_ORDER.indexOf(toTab);
    if (fromIndex !== -1 && toIndex !== -1) {
      const delta = Math.abs(toIndex - fromIndex);
      return delta === 1 ? 0 : 1;
    }

    return 1;
  }, []);

  const getTransitionDirection = useCallback((fromTab, toTab) => {
    const fromIndex = TAB_ORDER.indexOf(fromTab);
    const toIndex = TAB_ORDER.indexOf(toTab);

    if (fromIndex !== -1 && toIndex !== -1) {
      return toIndex > fromIndex ? 1 : -1;
    }

    const fromIsSub = SUB_SCREENS.includes(fromTab);
    const toIsSub = SUB_SCREENS.includes(toTab);
    if (!fromIsSub && toIsSub) return 1;
    if (fromIsSub && !toIsSub) return -1;
    return 1;
  }, []);

  const finishTabTransition = useCallback((toTab) => {
    renderedTabRef.current = toTab;
    transitionToTabRef.current = null;
    isTransitioningRef.current = false;
    setRenderedTab(toTab);
    setTransitionFromTab(null);
    setTransitionToTab(null);
  }, []);

  useEffect(() => {
    if (activeTab === renderedTabRef.current) return;

    const fromTab = isTransitioningRef.current
      ? (transitionToTabRef.current ?? renderedTabRef.current)
      : renderedTabRef.current;
    const toTab = activeTab;

    const mode = getTransitionMode(fromTab, toTab);
    transitionMode.value = mode;
    transitionDirection.value = getTransitionDirection(fromTab, toTab);
    setTransitionFromTab(fromTab);
    setTransitionToTab(toTab);
    transitionToTabRef.current = toTab;
    isTransitioningRef.current = true;

    transitionProgress.value = 0;

    const duration = mode === 0 ? 340 : mode === 1 ? 260 : 380;
    transitionProgress.value = withTiming(
      1,
      { duration, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(finishTabTransition)(toTab);
        }
      }
    );
  }, [activeTab, finishTabTransition, getTransitionDirection, getTransitionMode, transitionDirection, transitionMode, transitionProgress]);

  // Handle hardware back button inside Dashboard: close modals first,
  // if on profile sub-screens go back to profile, otherwise go to home.
  useEffect(() => {
    const onBack = () => {
      if (showLogoutModal) { setShowLogoutModal(false); return true; }
      if (showLocationModal) { setShowLocationModal(false); return true; }
      if (showLobbyModal) { setShowLobbyModal(false); return true; }
      if (showSOSAlertModal) { setShowSOSAlertModal(false); return true; }

      if (tabHistory.length > 1) {
        goBackTab();
        return true;
      }

      if (activeTab !== 'home') {
        changeTab('home');
        return true;
      }

      return false; // let system handle (may exit app)
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => backHandler.remove();
  }, [showLogoutModal, showLocationModal, showLobbyModal, showSOSAlertModal, activeTab, tabHistory.length, goBackTab, changeTab]);

  // Handle incoming SOS/MORSE/OFFLINE alerts
  useEffect(() => {
    const isAlert = activeAlert && (activeAlert.type === 'SOS' || activeAlert.type === 'MORSE' || activeAlert.type === 'OFFLINE');
    if (!isAlert) {
      return;
    }

    // Sender phone should not self-prompt with the emergency modal.
    if (activeAlert.localEmergency) {
      if (showSOSAlertModal) {
        setShowSOSAlertModal(false);
      }
      return;
    }

    // If someone already acknowledged "On my way", don't keep re-prompting.
    if (activeAlert.silenced) {
      if (showSOSAlertModal) {
        setShowSOSAlertModal(false);
      }
      return;
    }

    setShowSOSAlertModal(true);
    // Vibrate to alert user (different pattern for offline)
    if (activeAlert.type === 'OFFLINE') {
      Vibration.vibrate([0, 300, 200, 300]);
    } else {
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);
    }
  }, [activeAlert, showSOSAlertModal]);

  // Broadcast join timestamp once per connected-lobby session.
  // Lobby code sync is already handled in BluetoothContext.
  useEffect(() => {
    if (isConnected && isInLobby && lobbyCode) {
      const announceKey = `${lobbyCode}`;
      if (joinAnnounceKeyRef.current === announceKey) {
        return;
      }

      // Small delay to ensure device is ready for commands
      const syncTimer = setTimeout(async () => {
        const sent = await sendCommand(`MSG:0,__JOINED_TS__:${Date.now()}`);
        if (sent) {
          joinAnnounceKeyRef.current = announceKey;
        }
      }, 1000);
      return () => clearTimeout(syncTimer);
    }

    if (!isConnected || !isInLobby) {
      joinAnnounceKeyRef.current = null;
    }
  }, [isConnected, isInLobby, lobbyCode, sendCommand]);

  const handleDismissSOSAlert = () => {
    setShowSOSAlertModal(false);
  };

  const handleRespondOK = async () => {
    await sendOK();
    setShowSOSAlertModal(false);
    dismissAlert();
  };

  const handleOnMyWay = async () => {
    if (!activeAlert || activeAlert.localEmergency) {
      setShowSOSAlertModal(false);
      return;
    }
    await sendCommand('ON_MY_WAY');
    silenceActiveAlert();
    setShowSOSAlertModal(false);
  };

  const handleOpenChat = (name) => {
    setChatName(name);
    changeTab('chat');
  };

  const handleLogoutPress = () => {
    if (skipLogoutConfirm) {
      onLogout();
    } else {
      setShowLogoutModal(true);
    }
  };

  const handleConfirmLogout = () => {
    if (dontShowAgain) {
      setSkipLogoutConfirm(true);
    }
    setShowLogoutModal(false);
    onLogout();
  };

  const handleLocationPress = (location) => {
    setSelectedLocation(location);
    setShowLocationModal(true);
  };

  const handleLobbyPress = () => {
    setShowLobbyModal(true);
  };

  const renderContentForTab = (tabKey) => {
    switch (tabKey) {
      case 'home':
        return (
          <HomeTab
            onChangeTab={(tab) => {
              if (tab === 'location') {
                handleLocationTabPress();
              } else {
                changeTab(tab);
              }
            }}
            onLobbyPress={handleLobbyPress}
          />
        );
      case 'location': return <LocationTab onLocationPress={handleLocationPress} onShowDeviceConnection={onRequireDeviceSetup} />;
      case 'message': return <MessageTab onOpenChat={handleOpenChat} />;
      case 'profile': return (
        <ProfileTab 
          onLogout={handleLogoutPress} 
          onEditProfile={() => changeTab('editProfile')}
          onSettings={() => changeTab('settings')}
          onHelp={() => changeTab('help')}
          onReportProblem={() => changeTab('reportProblem')}
        />
      );
      case 'editProfile': return <EditProfileScreen onBack={goBackTab} />;
      case 'chat': return <ChatScreen onBack={goBackTab} chatName={chatName} />;
      case 'settings': return <SettingsScreen onBack={goBackTab} onDeleteAccount={onDeleteAccount} />;
      case 'help': return <HelpScreen onBack={goBackTab} />;
      case 'reportProblem': return <ReportProblemScreen onBack={goBackTab} />;
      case 'members': return <MembersTab />;
      default: return <HomeTab />;
    }
  };

  const outgoingStyle = useAnimatedStyle(() => {
    const direction = transitionDirection.value;
    const progress = transitionProgress.value;
    const mode = transitionMode.value;

    // Defaults (cross-fade)
    let opacity = 1 - progress;
    let translateX = 0;
    let translateY = 0;
    let scale = 1 - 0.015 * progress;

    if (mode === 0) {
      // Slide horizontal
      translateX = -direction * windowWidth * progress;
      opacity = 1 - progress;
      scale = 1 - 0.01 * progress;
    } else if (mode === 2) {
      // Main -> sub-screen (incoming slides up); keep background subtly present
      opacity = 1 - 0.25 * progress;
      translateY = -windowHeight * 0.02 * progress;
      scale = 1 - 0.02 * progress;
    } else if (mode === 3) {
      // Sub-screen -> main (sub-screen dismisses downward)
      translateY = windowHeight * progress;
      opacity = 1 - progress;
      scale = 1;
    }

    return {
      opacity,
      transform: [{ translateX }, { translateY }, { scale }],
    };
  }, [windowWidth, windowHeight]);

  const incomingStyle = useAnimatedStyle(() => {
    const direction = transitionDirection.value;
    const progress = transitionProgress.value;
    const mode = transitionMode.value;

    // Defaults (cross-fade)
    let opacity = progress;
    let translateX = 0;
    let translateY = 0;
    let scale = 0.985 + 0.015 * progress;

    if (mode === 0) {
      // Slide horizontal
      translateX = direction * windowWidth * (1 - progress);
      opacity = progress;
      scale = 0.99 + 0.01 * progress;
    } else if (mode === 2) {
      // Sub-screen slides up
      translateY = windowHeight * (1 - progress);
      opacity = progress;
      scale = 0.99 + 0.01 * progress;
    } else if (mode === 3) {
      // Main screen re-appears behind the dismissed sub-screen
      opacity = progress;
      translateY = -windowHeight * 0.02 * (1 - progress);
      scale = 0.98 + 0.02 * progress;
    }

    return {
      opacity,
      transform: [{ translateX }, { translateY }, { scale }],
    };
  }, [windowWidth, windowHeight]);

  // Hide bottom nav when on sub-screens
  const showBottomNav = !SUB_SCREENS.includes(activeTab);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ImageBackground
        source={require('../assets/dashboard_bg.png')}
        style={StyleSheet.absoluteFillObject}
        imageStyle={{ resizeMode: 'cover' }}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} />

      <View style={{ flex: 1, overflow: 'hidden', backgroundColor: 'transparent' }}>
        {transitionFromTab && transitionToTab ? (
          <>
            <Animated.View
              style={[StyleSheet.absoluteFillObject, outgoingStyle]}
              pointerEvents="none"
            >
              {renderContentForTab(transitionFromTab)}
            </Animated.View>
            <Animated.View
              style={[{ flex: 1 }, incomingStyle]}
              pointerEvents="none"
            >
              {renderContentForTab(transitionToTab)}
            </Animated.View>
          </>
        ) : (
          renderContentForTab(renderedTab)
        )}
      </View>
      
      {showBottomNav && (
        <View
          style={[
            styles.bottomNav,
            {
              backgroundColor: colors.surfaceBg,
              borderTopColor: colors.borderColor,
              paddingBottom: 18,
            },
          ]}
        >
          <TabIcon icon={Home} label="Home" active={activeTab === 'home'} onPress={() => changeTab('home')} colors={colors} />
          <TabIcon icon={MapPin} label="Loc" active={activeTab === 'location'} onPress={handleLocationTabPress} colors={colors} />
          <TabIcon icon={MessageCircle} label="Chat" active={activeTab === 'message'} onPress={() => changeTab('message')} colors={colors} />
          <TabIcon icon={Users} label="Members" active={activeTab === 'members'} onPress={() => changeTab('members')} colors={colors} />
          <TabIcon icon={User} label="Prof" active={activeTab === 'profile'} onPress={() => changeTab('profile')} colors={colors} />
        </View>
      )}

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
                <User size={32} color={colors.primary} />
              </View>
            </View>
            <Text style={[styles.modalTitle, { color: colors.textDark, textAlign: 'center' }]}>Logout</Text>
            <Text style={[styles.modalText, { color: colors.textDark, textAlign: 'center' }]}>Are you sure you want to logout?</Text>
            
            <Pressable 
              style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 15 }}
              onPress={() => setDontShowAgain(!dontShowAgain)}
            >
              {dontShowAgain ? (
                <CheckSquare size={20} color={colors.primary} />
              ) : (
                <Square size={20} color={colors.gray} />
              )}
              <Text style={{ marginLeft: 8, color: colors.textDark }}>Don't show this again</Text>
            </Pressable>

            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.inputBg, marginRight: 10, flex: 1 }]}
                onPress={() => setShowLogoutModal(false)}
              >
                <Text style={{ color: colors.textDark, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={handleConfirmLogout}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Location Detail Modal */}
      <Modal
        visible={showLocationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: '#D6EAF8', alignItems: 'center', justifyContent: 'center' }}>
                <MapPin size={32} color="#2980B9" />
              </View>
            </View>
            <Text style={[styles.modalTitle, { color: colors.textDark, textAlign: 'center' }]}>Hiker Location</Text>
            {selectedLocation && (
              <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, padding: 14, marginVertical: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: colors.gray, fontSize: 12, fontWeight: '600' }}>NAME</Text>
                  <Text style={{ color: colors.textDark, fontWeight: '600' }}>{selectedLocation.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: colors.gray, fontSize: 12, fontWeight: '600' }}>DISTANCE</Text>
                  <Text style={{ color: colors.textDark, fontWeight: '600' }}>{selectedLocation.distance}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.gray, fontSize: 12, fontWeight: '600' }}>STATUS</Text>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>Online</Text>
                </View>
              </View>
            )}
            <Text style={{ color: colors.gray, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>Last updated: Just now</Text>
            <TouchableOpacity 
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowLocationModal(false)}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Lobby ID Modal */}
      <Modal
        visible={showLobbyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLobbyModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowLobbyModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View
                style={[
                  styles.modalContent,
                  {
                    maxHeight: '80%',
                    overflow: 'hidden',
                    backgroundColor: colors.modalBg,
                    marginTop: -28,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Users size={16} color={colors.primary} />
                    <Text style={[styles.modalTitle, { color: colors.textDark, marginBottom: 0, fontSize: 14, marginLeft: 6 }]}>LOBBY INFORMATION</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowLobbyModal(false)} style={{ marginTop: -4 }}>
                    <X size={24} color={colors.textDark} />
                  </TouchableOpacity>
                </View>

                {lobbyCode ? (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={{ backgroundColor: colors.primaryLight, padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>LOBBY CODE</Text>
                      <Text style={{ color: colors.textLight, fontSize: 36, fontWeight: 'bold', letterSpacing: 6, marginTop: 4 }}>{lobbyCode}</Text>
                    </View>

                    <View style={{ backgroundColor: colors.inputBg, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                      {lobbyName && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ color: colors.gray, fontSize: 12, fontWeight: '600' }}>NAME</Text>
                          <Text style={{ color: colors.textDark, fontWeight: '600' }}>{lobbyName}</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ color: colors.gray, fontSize: 12, fontWeight: '600' }}>MEMBERS</Text>
                        <Text style={{ color: colors.textDark, fontWeight: '600' }}>{memberLocations.length + 1}</Text>
                      </View>
                    </View>

                    <Text style={{ color: '#000', fontSize: 12, textAlign: 'center', marginBottom: 4, lineHeight: 18 }}>
                      Share this code with friends to let them join your hiking group.
                    </Text>

                    <View style={{ flexDirection: 'row', marginTop: 20 }}>
                      <TouchableOpacity
                        style={[styles.modalButton, { backgroundColor: '#F44336', marginRight: 10, flex: 1 }]}
                        onPress={async () => {
                          await leaveLobby();
                          setShowLobbyModal(false);
                          Alert.alert('Left Lobby', 'Lobby cleared for this phone.');

                          // Make lobby switching obvious: return to the Lobby join screen.
                          navigation.reset({
                            index: 0,
                            routes: [{ name: 'Lobby' }],
                          });
                        }}
                      >
                        <Text style={{ color: 'white', fontWeight: '600' }}>Leave</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, { backgroundColor: colors.primary, flex: 1 }]}
                        onPress={async () => {
                          try {
                            await Share.share({
                              message: `Join my HikeSafe hiking group!\n\nLobby Code: ${lobbyCode}\n\nEnter this code in the HikeSafe app to connect.`,
                            });
                          } catch (error) {
                            Alert.alert('Error', 'Could not share lobby code');
                          }
                        }}
                      >
                        <Text style={{ color: 'white', fontWeight: '600' }}>Share Code</Text>
                      </TouchableOpacity>
                    </View>

                    {/* View Members Button */}
                    <TouchableOpacity
                      style={[styles.modalButton, { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.primary, marginTop: 10 }]}
                      onPress={() => {
                        setShowLobbyModal(false);
                        changeTab('members');
                      }}
                    >
                      <Text style={{ color: colors.primary, fontWeight: '600' }}>View Members</Text>
                    </TouchableOpacity>
                  </ScrollView>
                ) : (
                  <>
                    <Text style={[styles.modalText, { color: colors.gray, textAlign: 'center', marginVertical: 20 }]}>
                      No lobby joined. Create or join a lobby from the Lobby screen.
                    </Text>
                    <TouchableOpacity
                      style={[styles.modalButton, { backgroundColor: colors.primary }]}
                      onPress={() => setShowLobbyModal(false)}
                    >
                      <Text style={{ color: 'white', fontWeight: '600' }}>Close</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* SOS Alert Modal */}
      <Modal
        visible={showSOSAlertModal}
        transparent
        animationType="fade"
        onRequestClose={handleDismissSOSAlert}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                // Avoid a bright "flashbang" in dark mode.
                backgroundColor: isDarkMode ? 'rgba(244,67,54,0.18)' : '#FFF0F0',
                borderWidth: 2,
                borderColor: activeAlert?.type === 'OFFLINE' ? colors.gray : '#F44336',
              },
            ]}
          >
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ 
                width: 64, 
                height: 64, 
                borderRadius: 20, 
                // backgroundColor: activeAlert?.type === 'OFFLINE' ? '#E0E0E0' : '#FDECEA',
                alignItems: 'center', 
                justifyContent: 'center',
              }}>
                <AlertTriangle size={32} color={activeAlert?.type === 'OFFLINE' ? colors.gray : '#F44336'} />
              </View>
            </View>
            <Text style={[styles.modalTitle, { color: activeAlert?.type === 'OFFLINE' ? colors.gray : '#F44336', textAlign: 'center' }]}>
              {activeAlert?.type === 'MORSE' ? 'MORSE SOS' : activeAlert?.type === 'OFFLINE' ? 'DEVICE OFFLINE' : 'SOS ALERT'}
            </Text>
            
            <Text style={[styles.modalText, { color: colors.textDark, textAlign: 'center', fontSize: 16, marginVertical: 8 }]}>
              {activeAlert?.type === 'OFFLINE' 
                ? `${activeAlert?.displayName || (typeof activeAlert?.deviceId === 'number' ? getMemberNickname(activeAlert.deviceId) : 'A member')} has gone offline!`
                : `${activeAlert?.displayName || (typeof activeAlert?.deviceId === 'number' ? getMemberNickname(activeAlert.deviceId) : 'A member')} needs help!`
              }
            </Text>

            {activeAlert?.type !== 'OFFLINE' && typeof activeAlert?.deviceId === 'number' ? (() => {
              const deviceId = activeAlert.deviceId;
              const contact = getEmergencyContactForDevice ? getEmergencyContactForDevice(deviceId) : null;
              const displayName = getMemberNickname ? getMemberNickname(deviceId) : `Device ${deviceId}`;
              if (!contact || (!contact.name && !contact.phone)) {
                return (
                  <Text style={[styles.modalText, { color: colors.gray, textAlign: 'center', fontSize: 13, marginTop: 2 }]}>Emergency contact for {displayName} not shared yet.</Text>
                );
              }
              return (
                <View style={{ backgroundColor: colors.inputBg, padding: 12, borderRadius: 12, marginTop: 8 }}>
                  <Text style={{ color: colors.gray, fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 4 }}>EMERGENCY CONTACT</Text>
                  <Text style={{ color: colors.textDark, fontSize: 14, fontWeight: '700' }}>{contact.name || 'Unknown'}</Text>
                  <Text style={{ color: colors.textDark, fontSize: 14, fontWeight: '600' }}>{contact.phone || ''}</Text>
                </View>
              );
            })() : null}
            
            {resolvedAlertLocation && (
                <View style={{ backgroundColor: colors.inputBg, padding: 14, borderRadius: 12, marginTop: 8 }}>
                  <Text style={{ color: colors.gray, fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 4 }}>LOCATION</Text>
                  <Text style={{ color: colors.textDark, fontFamily: 'monospace', fontSize: 14, fontWeight: '600' }}>
                    {resolvedAlertLocation.lat.toFixed(6)}, {resolvedAlertLocation.lng.toFixed(6)}
                  </Text>
                  {resolvedAlertLocation.source === 'member' && (
                    <Text style={{ color: colors.gray, fontSize: 11, marginTop: 4 }}>
                      Last known location
                    </Text>
                  )}
                </View>
              )}
            
            {activeAlert?.localEmergency ? (
              // SENDER: Show only "I am OK" button
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.primary, marginTop: 20, width: '100%' }]}
                onPress={handleRespondOK}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>I am OK</Text>
              </TouchableOpacity>
            ) : (
              // RECEIVER: Show "I am on my way" and "View Location" buttons
              <View style={{ flexDirection: 'row', marginTop: 20 }}>
                <TouchableOpacity 
                  style={[styles.modalButton, { backgroundColor: colors.inputBg, marginRight: 10, flex: 1 }]}
                  onPress={handleOnMyWay}
                >
                  <Text style={{ color: colors.textDark, fontWeight: '600' }}>I am on my way</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalButton, { backgroundColor: colors.primary, flex: 1 }]}
                  onPress={() => {
                    handleDismissSOSAlert();
                    handleLocationTabPress();
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '600' }}>View Location</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default Dashboard;
