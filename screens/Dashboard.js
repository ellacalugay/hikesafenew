import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, Modal, Text, Pressable, Vibration, Share, Alert, ScrollView, TouchableWithoutFeedback, ImageBackground, BackHandler } from 'react-native';
import { Home, MapPin, MessageCircle, Compass, User, Check, CheckSquare, Square, AlertTriangle, X, Users, Radio } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants/theme';
import { styles } from '../styles/styles';
import { useTheme } from '../context/ThemeContext';
import { useBluetoothDevice } from '../context/BluetoothContext';
import { useLobby } from '../context/LobbyContext';
import HomeTab from './tabs/HomeTab';
import LocationTab from './tabs/LocationTab';
import MessageTab from './tabs/MessageTab';
import CompassTab from './tabs/CompassTab';
import ProfileTab from './tabs/ProfileTab';
import EditProfileScreen from './tabs/EditProfileScreen';
import ChatScreen from './tabs/ChatScreen';
import SettingsScreen from './tabs/SettingsScreen';
import HelpScreen from './tabs/HelpScreen';
import ReportProblemScreen from './tabs/ReportProblemScreen';
import MembersTab from './tabs/MembersTab';

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
      <Icon size={24} color="#000000" />
    )}
  </TouchableOpacity>
);

const Dashboard = ({ onLogout, onRequireDeviceSetup }) => {
  const { colors } = useTheme();
  const { activeAlert, dismissAlert, sendSOS, sendOK, sendCommand, isConnected, memberLocations } = useBluetoothDevice();
  const { lobbyCode, lobbyName, isHost, leaveLobby, isInLobby, hostDeviceId, myDeviceId, getEmergencyContactForDevice, getMemberNickname } = useLobby();
  const [activeTab, setActiveTab] = useState('home');
  const [chatName, setChatName] = useState('');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [skipLogoutConfirm, setSkipLogoutConfirm] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showLobbyModal, setShowLobbyModal] = useState(false);
  const [showSOSAlertModal, setShowSOSAlertModal] = useState(false);
  const joinAnnounceKeyRef = useRef(null);

  // Handle hardware back button inside Dashboard: close modals first,
  // if on profile sub-screens go back to profile, otherwise go to home.
  useEffect(() => {
    const onBack = () => {
      if (showLogoutModal) { setShowLogoutModal(false); return true; }
      if (showLocationModal) { setShowLocationModal(false); return true; }
      if (showLobbyModal) { setShowLobbyModal(false); return true; }
      if (showSOSAlertModal) { setShowSOSAlertModal(false); return true; }

      const profileSubs = ['editProfile', 'settings', 'help', 'reportProblem'];
      if (profileSubs.includes(activeTab)) {
        setActiveTab('profile');
        return true;
      }

      if (activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }

      return false; // let system handle (may exit app)
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => backHandler.remove();
  }, [showLogoutModal, showLocationModal, showLobbyModal, showSOSAlertModal, activeTab]);

  // Handle incoming SOS/MORSE/OFFLINE alerts
  useEffect(() => {
    if (activeAlert && (activeAlert.type === 'SOS' || activeAlert.type === 'MORSE' || activeAlert.type === 'OFFLINE')) {
      setShowSOSAlertModal(true);
      // Vibrate to alert user (different pattern for offline)
      if (activeAlert.type === 'OFFLINE') {
        Vibration.vibrate([0, 300, 200, 300]);
      } else {
        Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      }
    }
  }, [activeAlert]);

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

  const handleSendSOSFromLobby = async () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to your SOS device first via the Location tab.');
      return;
    }
    await sendSOS();
    Alert.alert('SOS Sent', 'Your SOS signal has been broadcasted to all group members.');
  };

  const handleSendOKFromLobby = async () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to your SOS device first via the Location tab.');
      return;
    }
    await sendOK();
    Alert.alert('OK Sent', 'Your OK status has been broadcasted to all group members.');
  };

  const handleOpenChat = (name) => {
    setChatName(name);
    setActiveTab('chat');
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

  const adminDisplay = hostDeviceId === null || hostDeviceId === undefined
    ? 'Electing...'
    : myDeviceId === hostDeviceId
      ? `You (Device ${hostDeviceId})`
      : `Device ${hostDeviceId}`;

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return <HomeTab onChangeTab={setActiveTab} onLobbyPress={handleLobbyPress} />;
      case 'location': return <LocationTab onLocationPress={handleLocationPress} onShowDeviceConnection={onRequireDeviceSetup} />;
      case 'message': return <MessageTab onOpenChat={handleOpenChat} />;
      case 'compass': return <CompassTab />;
      case 'profile': return (
        <ProfileTab 
          onLogout={handleLogoutPress} 
          onEditProfile={() => setActiveTab('editProfile')}
          onSettings={() => setActiveTab('settings')}
          onHelp={() => setActiveTab('help')}
          onReportProblem={() => setActiveTab('reportProblem')}
        />
      );
      case 'editProfile': return <EditProfileScreen onBack={() => setActiveTab('profile')} />;
      case 'chat': return <ChatScreen onBack={() => setActiveTab('message')} chatName={chatName} />;
      case 'settings': return <SettingsScreen onBack={() => setActiveTab('profile')} />;
      case 'help': return <HelpScreen onBack={() => setActiveTab('profile')} />;
      case 'reportProblem': return <ReportProblemScreen onBack={() => setActiveTab('profile')} />;
      case 'members': return isHost ? <MembersTab /> : <HomeTab onChangeTab={setActiveTab} onLobbyPress={handleLobbyPress} />;
      default: return <HomeTab />;
    }
  };

  // Hide bottom nav when on sub-screens
  const subScreens = ['editProfile', 'chat', 'settings', 'help', 'reportProblem'];
  const showBottomNav = !subScreens.includes(activeTab);

  return (
    <View style={{flex: 1, backgroundColor: colors.background}}>
      {renderContent()}
      
      {showBottomNav && (
        <View style={[styles.bottomNav, { backgroundColor: colors.surfaceBg, borderTopColor: colors.borderColor }]}>
          <TabIcon icon={Home} label="Home" active={activeTab === 'home'} onPress={() => setActiveTab('home')} colors={colors} />
          <TabIcon icon={MapPin} label="Loc" active={activeTab === 'location'} onPress={() => setActiveTab('location')} colors={colors} />
          <TabIcon icon={MessageCircle} label="Chat" active={activeTab === 'message'} onPress={() => setActiveTab('message')} colors={colors} />
          {isHost && (
            <TabIcon icon={Users} label="Members" active={activeTab === 'members'} onPress={() => setActiveTab('members')} colors={colors} />
          )}
          <TabIcon icon={Compass} label="Comp" active={activeTab === 'compass'} onPress={() => setActiveTab('compass')} colors={colors} />
          <TabIcon icon={User} label="Prof" active={activeTab === 'profile'} onPress={() => setActiveTab('profile')} colors={colors} />
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
              <ImageBackground
                source={require('../assets/int bg 1.png')}
                resizeMode="cover"
                imageStyle={{ borderRadius: 20 }}
                style={[styles.modalContent, { maxHeight: '80%', overflow: 'hidden', backgroundColor: 'transparent' }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Users size={16} color={colors.primary} />
                    <Text style={[styles.modalTitle, { color: colors.textDark, marginBottom: 0, fontSize: 14, marginLeft: 6 }]}>LOBBY INFORMATION</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowLobbyModal(false)} style={{ marginTop: -4 }}>
                    <X size={24} color="#000" />
                  </TouchableOpacity>
                </View>

                {lobbyCode ? (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={{ backgroundColor: colors.primaryLight, padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>LOBBY CODE</Text>
                      <Text style={{ color: '#0B1F16', fontSize: 36, fontWeight: 'bold', letterSpacing: 6, marginTop: 4 }}>{lobbyCode}</Text>
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
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: colors.gray, fontSize: 12, fontWeight: '600' }}>ROLE</Text>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>{isHost ? 'Host' : 'Member'}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                        <Text style={{ color: colors.gray, fontSize: 12, fontWeight: '600' }}>CURRENT ADMIN</Text>
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>{adminDisplay}</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingVertical: 16,
                          borderRadius: 12,
                          marginRight: 8,
                          backgroundColor: isConnected ? colors.accent : colors.gray,
                        }}
                        onPress={handleSendSOSFromLobby}
                        activeOpacity={0.8}
                      >
                        <AlertTriangle size={28} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 8 }}>SOS</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingVertical: 16,
                          borderRadius: 12,
                          marginLeft: 8,
                          backgroundColor: isConnected ? colors.primary : colors.gray,
                        }}
                        onPress={handleSendOKFromLobby}
                        activeOpacity={0.8}
                      >
                        <Check size={28} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 8 }}>I'm OK</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={{ color: '#000', fontSize: 12, textAlign: 'center', marginBottom: 4, lineHeight: 18 }}>
                      Share this code with friends to let them join your hiking group.
                    </Text>

                    <View style={{ flexDirection: 'row', marginTop: 20 }}>
                      <TouchableOpacity
                        style={[styles.modalButton, { backgroundColor: '#F44336', marginRight: 10, flex: 1 }]}
                        onPress={async () => {
                          // Send LOBBY:0 to device to clear filter
                          if (isConnected) {
                            await sendCommand('LOBBY:0');
                          }
                          await leaveLobby();
                          setShowLobbyModal(false);
                          Alert.alert('Left Lobby', 'Your lobby code has been cleared. Device will now ignore/be ignored by your old group.');
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
                    {isHost && (
                      <TouchableOpacity
                        style={[styles.modalButton, { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.primary, marginTop: 10 }]}
                        onPress={() => {
                          setShowLobbyModal(false);
                          setActiveTab('members');
                        }}
                      >
                        <Text style={{ color: colors.primary, fontWeight: '600' }}>View Members</Text>
                      </TouchableOpacity>
                    )}
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
              </ImageBackground>
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
          <View style={[styles.modalContent, { backgroundColor: '#FFF0F0', borderWidth: 2, borderColor: activeAlert?.type === 'OFFLINE' ? '#999' : colors.accent }]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ 
                width: 64, 
                height: 64, 
                borderRadius: 20, 
                backgroundColor: activeAlert?.type === 'OFFLINE' ? '#E0E0E0' : '#FDECEA',
                alignItems: 'center', 
                justifyContent: 'center',
              }}>
                <AlertTriangle size={32} color={activeAlert?.type === 'OFFLINE' ? '#666' : colors.accent} />
              </View>
            </View>
            <Text style={[styles.modalTitle, { color: activeAlert?.type === 'OFFLINE' ? '#666' : colors.accent, textAlign: 'center' }]}>
              {activeAlert?.type === 'MORSE' ? 'MORSE SOS' : activeAlert?.type === 'OFFLINE' ? 'DEVICE OFFLINE' : 'SOS ALERT'}
            </Text>
            
            <Text style={[styles.modalText, { color: colors.textDark, textAlign: 'center', fontSize: 16, marginVertical: 8 }]}>
              {activeAlert?.type === 'OFFLINE' 
                ? `Device ${activeAlert?.deviceId} has gone offline!`
                : `Device ${activeAlert?.deviceId} needs help!`
              }
            </Text>

            {activeAlert?.type !== 'OFFLINE' && activeAlert?.deviceId ? (() => {
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
            
            {activeAlert?.lat && activeAlert?.lng && (
              <View style={{ backgroundColor: colors.inputBg, padding: 14, borderRadius: 12, marginTop: 8 }}>
                <Text style={{ color: colors.gray, fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 4 }}>LOCATION</Text>
                <Text style={{ color: colors.textDark, fontFamily: 'monospace', fontSize: 14, fontWeight: '600' }}>
                  {activeAlert.lat.toFixed(6)}, {activeAlert.lng.toFixed(6)}
                </Text>
              </View>
            )}
            
            <View style={{ flexDirection: 'row', marginTop: 20 }}>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.inputBg, marginRight: 10, flex: 1 }]}
                onPress={handleDismissSOSAlert}
              >
                <Text style={{ color: colors.textDark, fontWeight: '600' }}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => {
                  handleDismissSOSAlert();
                  setActiveTab('location');
                }}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>View Location</Text>
              </TouchableOpacity>
            </View>
            
            {isConnected && (
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.primary, marginTop: 10, width: '100%' }]}
                onPress={handleRespondOK}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>Send OK Response</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Dashboard;
