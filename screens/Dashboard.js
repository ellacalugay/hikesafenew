import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Modal, Text, Pressable, Vibration, Share, Alert } from 'react-native';
import { Home, MapPin, MessageCircle, Compass, User, CheckSquare, Square, AlertTriangle, X, Users } from 'lucide-react-native';
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
import DeviceConnectionScreen from './tabs/DeviceConnectionScreen';
import MembersTab from './tabs/MembersTab';

const TabIcon = ({ icon: Icon, active, onPress, colors }) => (
  <TouchableOpacity style={styles.tabItem} onPress={onPress}>
    <Icon size={24} color={active ? colors.primary : colors.gray} />
    {active && <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />}
  </TouchableOpacity>
);

const Dashboard = ({ onLogout }) => {
  const { colors } = useTheme();
  const { activeAlert, dismissAlert, sendOK, sendCommand, isConnected, memberLocations } = useBluetoothDevice();
  const { lobbyCode, lobbyName, isHost, leaveLobby, isInLobby } = useLobby();
  const [activeTab, setActiveTab] = useState('home');
  const [chatName, setChatName] = useState('');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [skipLogoutConfirm, setSkipLogoutConfirm] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showLobbyModal, setShowLobbyModal] = useState(false);
  const [showSOSAlertModal, setShowSOSAlertModal] = useState(false);

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

  // Auto-sync lobby code when device connects
  useEffect(() => {
    if (isConnected && isInLobby && lobbyCode) {
      // Small delay to ensure device is ready for commands
      const syncTimer = setTimeout(async () => {
        console.log('Auto-syncing lobby code to device:', lobbyCode);
        await sendCommand(`LOBBY:${lobbyCode}`);
      }, 1000);
      return () => clearTimeout(syncTimer);
    }
  }, [isConnected, isInLobby, lobbyCode, sendCommand]);

  const handleDismissSOSAlert = () => {
    setShowSOSAlertModal(false);
    dismissAlert();
  };

  const handleRespondOK = async () => {
    await sendOK();
    setShowSOSAlertModal(false);
    dismissAlert();
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

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return <HomeTab onChangeTab={setActiveTab} onLobbyPress={handleLobbyPress} />;
      case 'location': return <LocationTab onLocationPress={handleLocationPress} onShowDeviceConnection={() => setActiveTab('deviceConnection')} />;
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
      case 'deviceConnection': return <DeviceConnectionScreen onBack={() => setActiveTab('location')} />;
      case 'members': return <MembersTab />;
      default: return <HomeTab />;
    }
  };

  // Hide bottom nav when on sub-screens
  const subScreens = ['editProfile', 'chat', 'settings', 'help', 'reportProblem', 'deviceConnection'];
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
            <Text style={[styles.modalTitle, { color: colors.textDark }]}>Logout</Text>
            <Text style={[styles.modalText, { color: colors.textDark }]}>Are you sure you want to logout?</Text>
            
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
            <Text style={[styles.modalTitle, { color: colors.textDark }]}>Hiker Location</Text>
            {selectedLocation && (
              <>
                <Text style={[styles.modalText, { color: colors.textDark }]}>Name: {selectedLocation.name}</Text>
                <Text style={[styles.modalText, { color: colors.textDark }]}>Distance: {selectedLocation.distance}</Text>
                <Text style={[styles.modalText, { color: colors.textDark }]}>Status: Online</Text>
                <Text style={[styles.modalText, { marginTop: 10, color: colors.gray }]}>
                  Last updated: Just now
                </Text>
              </>
            )}
            <TouchableOpacity 
              style={[styles.modalButton, { backgroundColor: colors.primary, marginTop: 20 }]}
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
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textDark }]}>Lobby Information</Text>
            
            {lobbyCode ? (
              <>
                <View style={{ backgroundColor: colors.primaryLight, padding: 15, borderRadius: 10, alignItems: 'center', marginVertical: 10 }}>
                  <Text style={{ color: colors.gray, fontSize: 12 }}>LOBBY CODE</Text>
                  <Text style={{ color: colors.primary, fontSize: 32, fontWeight: 'bold', letterSpacing: 4 }}>{lobbyCode}</Text>
                </View>
                
                {lobbyName && (
                  <Text style={[styles.modalText, { color: colors.textDark }]}>Name: {lobbyName}</Text>
                )}
                <Text style={[styles.modalText, { color: colors.textDark }]}>Members: {memberLocations.length + 1}</Text>
                <Text style={[styles.modalText, { color: colors.textDark }]}>Role: {isHost ? 'Host' : 'Member'}</Text>
                <Text style={[styles.modalText, { marginTop: 10, color: colors.gray, textAlign: 'center', fontSize: 12 }]}>
                  Share this code with friends to let them join your hiking group. All devices must use the same code.
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
              </>
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
        </View>
      </Modal>

      {/* SOS Alert Modal */}
      <Modal
        visible={showSOSAlertModal}
        transparent
        animationType="fade"
        onRequestClose={handleDismissSOSAlert}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#FFF0F0', borderWidth: 2, borderColor: colors.accent }]}>
            <View style={{ alignItems: 'center', marginBottom: 15 }}>
              <View style={{ 
                backgroundColor: activeAlert?.type === 'OFFLINE' ? '#666' : colors.accent, 
                width: 60, 
                height: 60, 
                borderRadius: 30, 
                justifyContent: 'center', 
                alignItems: 'center',
                marginBottom: 10
              }}>
                <AlertTriangle size={32} color="white" />
              </View>
              <Text style={[styles.modalTitle, { color: activeAlert?.type === 'OFFLINE' ? '#666' : colors.accent, fontSize: 22 }]}>
                {activeAlert?.type === 'MORSE' ? 'MORSE SOS' : activeAlert?.type === 'OFFLINE' ? 'DEVICE OFFLINE' : 'SOS ALERT'}
              </Text>
            </View>
            
            <Text style={[styles.modalText, { color: colors.textDark, textAlign: 'center', fontSize: 16 }]}>
              {activeAlert?.type === 'OFFLINE' 
                ? `Device ${activeAlert?.deviceId} has gone offline!`
                : `Device ${activeAlert?.deviceId} needs help!`
              }
            </Text>
            
            {activeAlert?.lat && activeAlert?.lng && (
              <View style={{ backgroundColor: colors.cardBg, padding: 12, borderRadius: 8, marginTop: 12 }}>
                <Text style={{ color: colors.gray, fontSize: 12 }}>Location</Text>
                <Text style={{ color: colors.textDark, fontFamily: 'monospace', fontSize: 14 }}>
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
