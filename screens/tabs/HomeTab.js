import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, Alert, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Trees, User, MessageCircle, MapPin, Compass, AlertTriangle, Radio, Check, Users } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';

// Calculate distance between two GPS coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // meters
};

const ServiceItem = ({ icon: Icon, label, onPress, colors }) => (
  <TouchableOpacity style={[styles.serviceItem, { backgroundColor: 'transparent' }]} onPress={onPress}>
    <View style={[styles.serviceIconBox, { backgroundColor: 'transparent' }]}>
      <Icon size={24} color={colors.textDark} />
    </View>
    <Text style={[styles.serviceText, { color: colors.textDark }]}>{label}</Text>
  </TouchableOpacity>
);

const HomeTab = ({ onChangeTab, onLobbyPress }) => {
  const { colors } = useTheme();
  const { isConnected, connectedDevice, myLocation, memberLocations, statusMessage, sendSOS, sendOK } = useBluetoothDevice();
  const { lobbyCode, lobbyName, isHost, isInLobby } = useLobby();
  
  // Calculate nearest member distance
  const nearestDistance = useMemo(() => {
    if (!myLocation.valid || memberLocations.length === 0) return null;
    
    const distances = memberLocations
      .filter(m => m.lat && m.lng && !m.isOffline)
      .map(m => calculateDistance(myLocation.lat, myLocation.lng, m.lat, m.lng))
      .filter(d => d !== null);
    
    if (distances.length === 0) return null;
    return Math.min(...distances);
  }, [myLocation, memberLocations]);
  
  const formatNearestDistance = (meters) => {
    if (meters === null) return '--';
    if (meters < 1000) return `${meters.toFixed(0)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };
  const [showSOSConfirm, setShowSOSConfirm] = useState(false);
  const [showOKConfirm, setShowOKConfirm] = useState(false);

  const handleSOSPress = () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to your SOS device first via the Location tab.');
      return;
    }
    setShowSOSConfirm(true);
  };

  const handleConfirmSOS = async () => {
    setShowSOSConfirm(false);
    await sendSOS();
    Alert.alert('SOS Sent', 'Your SOS signal has been broadcasted to all group members.');
  };

  const handleOKPress = () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to your SOS device first via the Location tab.');
      return;
    }
    setShowOKConfirm(true);
  };

  const handleConfirmOK = async () => {
    setShowOKConfirm(false);
    await sendOK();
    Alert.alert('OK Sent', 'Your OK status has been broadcasted to all group members.');
  };
  
  return (
    <ImageBackground 
      source={require('../../assets/dashboard_bg.png')} 
      style={[styles.tabContainer, { backgroundColor: colors.background }]}
      imageStyle={{ resizeMode: 'cover', width: '100%', height: '100%' }}
    >
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} />
      <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={[styles.scrollContent, { backgroundColor: 'transparent', paddingBottom: 180 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.welcomeText, { color: colors.textDark }]}>Hello!</Text>
            <Text style={[styles.usernameTitle, { color: colors.textDark }]}>Hiker</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {isConnected && (
              <View style={localStyles.connectedIndicator}>
                <Radio size={14} color={colors.primary} />
                <Text style={[localStyles.connectedText, { color: colors.primary }]}>
                  {connectedDevice?.name?.replace('SOS-', '') || 'Device'}
                </Text>
              </View>
            )}
            <Trees size={30} color={colors.primary} />
          </View>
        </View>

        {/* SOS / OK Action Buttons moved to bottom fixed container */}

        {/* Status Message */}
        {statusMessage && (
          <View style={[localStyles.statusBanner, { backgroundColor: colors.primaryLight }]}>
            <Text style={[localStyles.statusText, { color: colors.primary }]}>
              {statusMessage.replace(/_/g, ' ')}
            </Text>
          </View>
        )}

        {/* GPS Status Preview */}
        {isConnected && (
          <View style={[localStyles.gpsPreview, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <Text style={[localStyles.gpsLabel, { color: colors.gray }]}>GPS Status</Text>
            <Text style={[localStyles.gpsValue, { color: myLocation.valid ? colors.primary : colors.gray }]}>
              {myLocation.valid 
                ? `${myLocation.lat.toFixed(4)}, ${myLocation.lng.toFixed(4)} (${myLocation.satellites} sats)`
                : `Acquiring signal... (${myLocation.satellites} sats)`}
            </Text>
          </View>
        )}

        <TouchableOpacity onPress={onLobbyPress} activeOpacity={0.8}>
          <LinearGradient colors={[colors.primaryLight, colors.primary]} style={styles.lobbyCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.lobbyLabel}>{lobbyName || 'GROUP STATUS'}</Text>
              {isHost && (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>HOST</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Users size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.lobbyCode}>
                {lobbyCode ? `LOBBY: ${lobbyCode}` : (isConnected ? 'ACTIVE' : 'NO LOBBY')}
              </Text>
            </View>
            
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>MEMBERS</Text>
                <Text style={styles.statValue}>{memberLocations.length}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>NEAREST</Text>
                <Text style={styles.statValue}>{formatNearestDistance(nearestDistance)}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>SIGNAL</Text>
                <View style={styles.signalIcon}>
                  <View style={[styles.bar, {height: 6, backgroundColor: isConnected ? '#fff' : '#999'}]} />
                  <View style={[styles.bar, {height: 10, backgroundColor: isConnected ? '#fff' : '#999'}]} />
                  <View style={[styles.bar, {height: 14, backgroundColor: isConnected ? '#fff' : '#666'}]} />
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Services</Text>
        <View style={styles.servicesGrid}>
          <ServiceItem icon={User} label="Profile" onPress={() => onChangeTab('profile')} colors={colors} />
          <ServiceItem icon={MessageCircle} label="Message" onPress={() => onChangeTab('message')} colors={colors} />
          <ServiceItem icon={MapPin} label="Location" onPress={() => onChangeTab('location')} colors={colors} />
          <ServiceItem icon={Compass} label="Compass" onPress={() => onChangeTab('compass')} colors={colors} />
        </View>

      </ScrollView>

      {/* Bottom SOS / OK Buttons (fixed) */}
      <View style={localStyles.bottomContainer} pointerEvents="box-none">
        <TouchableOpacity 
          style={[localStyles.sosButton, { backgroundColor: isConnected ? colors.accent : colors.gray }]}
          onPress={handleSOSPress}
          activeOpacity={0.8}
        >
          <AlertTriangle size={28} color="#fff" />
          <Text style={localStyles.sosButtonText}>SOS</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[localStyles.okButton, { backgroundColor: isConnected ? colors.primary : colors.gray }]}
          onPress={handleOKPress}
          activeOpacity={0.8}
        >
          <Check size={28} color="#fff" />
          <Text style={localStyles.okButtonText}>I'm OK</Text>
        </TouchableOpacity>
      </View>

      {/* SOS Confirmation Modal */}
      <Modal visible={showSOSConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#FFF0F0', borderWidth: 2, borderColor: colors.accent }]}>
            <AlertTriangle size={48} color={colors.accent} style={{ alignSelf: 'center', marginBottom: 16 }} />
            <Text style={[styles.modalTitle, { color: colors.accent, textAlign: 'center' }]}>Send SOS?</Text>
            <Text style={[styles.modalText, { color: colors.textDark, textAlign: 'center' }]}>
              This will broadcast an emergency signal to all group members via LoRa radio.
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 20 }}>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.inputBg, marginRight: 10, flex: 1 }]}
                onPress={() => setShowSOSConfirm(false)}
              >
                <Text style={{ color: colors.textDark, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.accent, flex: 1 }]}
                onPress={handleConfirmSOS}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>SEND SOS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* OK Confirmation Modal */}
      <Modal visible={showOKConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Check size={48} color={colors.primary} style={{ alignSelf: 'center', marginBottom: 16 }} />
            <Text style={[styles.modalTitle, { color: colors.primary, textAlign: 'center' }]}>Send "I'm OK"?</Text>
            <Text style={[styles.modalText, { color: colors.textDark, textAlign: 'center' }]}>
              This will let all group members know you are safe.
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 20 }}>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.inputBg, marginRight: 10, flex: 1 }]}
                onPress={() => setShowOKConfirm(false)}
              >
                <Text style={{ color: colors.textDark, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={handleConfirmOK}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>SEND OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
};

const localStyles = StyleSheet.create({
  emergencyButtons: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  sosButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginRight: 8,
  },
  sosButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  okButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginLeft: 8,
  },
  okButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  connectedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(107, 142, 35, 0.1)',
  },
  connectedText: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  statusBanner: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  statusText: {
    fontWeight: '600',
    fontSize: 14,
  },
  gpsPreview: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
  },
  gpsLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  gpsValue: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  bottomContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 120,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
});

export default HomeTab;