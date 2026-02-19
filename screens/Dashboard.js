import React, { useState } from 'react';
import { View, TouchableOpacity, Modal, Text, Pressable } from 'react-native';
import { Home, MapPin, MessageCircle, Compass, User, CheckSquare, Square } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { styles } from '../styles/styles';
import { useTheme } from '../context/ThemeContext';
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

const TabIcon = ({ icon: Icon, active, onPress, colors }) => (
  <TouchableOpacity style={styles.tabItem} onPress={onPress}>
    <Icon size={24} color={active ? colors.primary : colors.gray} />
    {active && <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />}
  </TouchableOpacity>
);

const Dashboard = ({ onLogout }) => {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState('home');
  const [chatName, setChatName] = useState('');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [skipLogoutConfirm, setSkipLogoutConfirm] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showLobbyModal, setShowLobbyModal] = useState(false);

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
      case 'location': return <LocationTab onLocationPress={handleLocationPress} />;
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
            <Text style={[styles.modalText, { color: colors.textDark }]}>Lobby ID: ABCDEF123</Text>
            <Text style={[styles.modalText, { color: colors.textDark }]}>Members: 15</Text>
            <Text style={[styles.modalText, { color: colors.textDark }]}>Created: Today, 10:00 AM</Text>
            <Text style={[styles.modalText, { marginTop: 10, color: colors.textDark }]}>
              Share this ID with friends to let them join your hiking group.
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 20 }}>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.inputBg, marginRight: 10, flex: 1 }]}
                onPress={() => setShowLobbyModal(false)}
              >
                <Text style={{ color: colors.textDark, fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => setShowLobbyModal(false)}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>Copy ID</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Dashboard;
