import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ImageBackground, Image, Pressable, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Trees, User, MessageCircle, MapPin, Compass, Radio, Users, AlertTriangle } from 'lucide-react-native';
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

const HomeTab = ({ onChangeTab, onLobbyPress }) => {
  const { colors } = useTheme();
  const { isConnected, isDeviceReachable, connectedDevice, myLocation, memberLocations, statusMessage, loraSignalStrength, connectedDevicesCount, activeAlert, unreadCount, sendSOS } = useBluetoothDevice();
  const { lobbyCode, lobbyName, isHost, myNickname } = useLobby();
  
  // Get signal quality from RSSI (LoRa typical ranges: -30 to -120 dBm)
  const getSignalQuality = (rssi) => {
    if (rssi === null || rssi === undefined) return 0;
    if (rssi > -70) return 3;  // Excellent
    if (rssi > -90) return 2;  // Good
    if (rssi > -110) return 1; // Fair
    return 0; // Poor/No signal
  };
  
  const signalQuality = getSignalQuality(loraSignalStrength);
  
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

  const handleEmergencySOS = async () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to your SOS device first via the Location tab.');
      return;
    }

    await sendSOS();
    Alert.alert('SOS Sent', 'Your SOS signal has been broadcasted to all group members.');
  };

  // Dynamic badge counts
  const memberAlerts = (memberLocations || []).filter(m => m.alertType === 'SOS' || m.alertType === 'MORSE').length;
  const totalAlerts = (activeAlert ? 1 : 0) + memberAlerts;
  const unreadMsgs = unreadCount || 0;
  
  return (
    <ImageBackground 
      source={require('../../assets/dashboard_bg.png')} 
      style={[styles.tabContainer, { backgroundColor: colors.background }]}
      imageStyle={{ resizeMode: 'cover', width: '100%', height: '100%' }}
    >
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} />
      <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={[styles.scrollContent, { backgroundColor: 'transparent', paddingBottom: 96 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.welcomeText, { color: colors.textDark }, { fontWeight: 'bold' }]}>Hello!</Text>
            <Text style={[styles.usernameTitle, { color: colors.textDark }]}>{myNickname}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {isConnected && (
              <View style={localStyles.connectedIndicator}>
                <Radio size={14} color={colors.primary} />
                <Text style={[localStyles.connectedText, { color: colors.primary }]}>
                  {connectedDevice?.name?.replace('SOS-', '') || 'Device'}
                </Text>
                {connectedDevicesCount > 1 && (
                  <Text style={[localStyles.deviceCountBadge, { color: colors.primary }]}>
                    +{connectedDevicesCount - 1}
                  </Text>
                )}
              </View>
            )}
            <Image 
              source={require('../../assets/hike_logo.png')} 
              style={{ 
                position: 'absolute', 
                right: 3, 
                top: -27,
                width: 50, 
                height: 50, 
                resizeMode: 'contain' 
              }} 
            />            
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

        {/* Persistent Emergency Banner */}
        {activeAlert && (activeAlert.type === 'SOS' || activeAlert.type === 'MORSE') && (
          <TouchableOpacity
            style={localStyles.emergencyBanner}
            activeOpacity={0.85}
            onPress={() => onChangeTab('location')}
          >
            <View style={localStyles.emergencyIconWrap}>
              <AlertTriangle size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={localStyles.emergencyTitle}>
                {activeAlert.type === 'MORSE' ? 'MORSE EMERGENCY ACTIVE' : 'SOS EMERGENCY ACTIVE'}
              </Text>
              <Text style={localStyles.emergencySubtitle}>
                {activeAlert.deviceId ? `Device ${activeAlert.deviceId}` : 'Connected device'} needs attention. Tap to view location.
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* GPS Status Preview */}
        {isConnected && (
          <View style={[localStyles.gpsPreview, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[localStyles.gpsLabel, { color: colors.gray }]}>GPS Status</Text>
              {loraSignalStrength && (
                <Text style={[localStyles.rssiText, { color: loraSignalStrength > -90 ? colors.primary : colors.accent }]}>
                  LoRa: {loraSignalStrength} dBm
                </Text>
              )}
            </View>
            <Text style={[localStyles.gpsValue, { color: myLocation.valid ? colors.primary : colors.gray }]}>
              {myLocation.valid 
                ? `${myLocation.lat.toFixed(4)}, ${myLocation.lng.toFixed(4)} (${myLocation.satellites} sats)`
                : `Acquiring signal... (${myLocation.satellites} sats)`}
            </Text>
          </View>
        )}

        <TouchableOpacity onPress={onLobbyPress} activeOpacity={0.8} style={{ marginTop: -8 }}>
          <LinearGradient colors={[colors.primaryLight, colors.primary]} style={localStyles.compactLobbyCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={localStyles.compactLobbyTitle}>{lobbyName || 'My Lobby'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <Users size={14} color="#fff" />
                  <Text style={localStyles.compactLobbyCode}>{lobbyCode || '--'}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={localStyles.compactStatusLabel}>LOBBY CODE</Text>
                <Text style={localStyles.compactStatusValue}>{lobbyCode || '----'}</Text>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', marginTop: 8, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={localStyles.compactStatusLabel}>STATUS</Text>
              <Text style={localStyles.compactStatusValue}>{isConnected ? '1 Active Now' : 'Offline'}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[localStyles.sosTitle, { color: colors.textDark }]}>EMERGENCY SOS</Text>
        <Text style={[localStyles.sosHint, { color: colors.gray }]}>PRESS AND HOLD FOR 2 SECONDS</Text>

        <Pressable
          onLongPress={handleEmergencySOS}
          delayLongPress={2000}
          style={({ pressed }) => [
            localStyles.sosPressable,
            !isConnected && localStyles.sosDisabled,
            pressed && localStyles.sosPressed,
          ]}
        >
          <View style={[localStyles.sosCard, { backgroundColor: isConnected ? '#9A0000' : '#ff0000' }]}>
            <View style={localStyles.sosInnerFrame}>
              <View style={localStyles.sosIconWrap}>
                <AlertTriangle size={52} color="#fff" strokeWidth={2.6} />
              </View>
              <Text style={localStyles.sosLabel}>SOS</Text>
              <Text style={localStyles.sosSubLabel}>HOLD TO ALERT</Text>
            </View>
          </View>
        </Pressable>

      </ScrollView>
    </ImageBackground>
  );
};

const localStyles = StyleSheet.create({
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
  deviceCountBadge: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: 'rgba(107, 142, 35, 0.2)',
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
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C62828',
    borderRadius: 10,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  emergencyIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginRight: 10,
  },
  emergencyTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  emergencySubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: 2,
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
  rssiText: {
    fontSize: 11,
    fontWeight: '600',
  },

  sosHint: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.4,
  },

  sosTitle: {
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1.2,
    marginTop: 6,
  },

  sosPressable: {
    marginTop: 6,
    alignSelf: 'stretch',
  },

  sosDisabled: {
    opacity: 0.7,
  },

  sosPressed: {
    transform: [{ scale: 0.985 }],
  },

  sosCard: {
    borderRadius: 28,
    padding: 20,
    minHeight: 240,
    borderWidth: 1,
    backgroundColor: '#9A0000',
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#9A0000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 13,
  },

  sosInnerFrame: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 20,
  },

  sosIconWrap: {
    width: 102,
    height: 102,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.24)',
    marginBottom: 16,
  },

  sosLabel: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 6,
  },

  sosSubLabel: {
    color: 'rgba(255,255,255,0.9)',
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },

  compactLobbyCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },

  compactLobbyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  compactLobbyCode: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 6,
  },

  compactStatusLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  compactStatusValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },

  servicesGrid2x2: {
    marginTop: 12,
  },

  serviceRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },

  serviceItem: {
    alignItems: 'center',
    width: '23%',
  },
  serviceCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 16,
    margin: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  serviceIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  serviceText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

});

export default HomeTab;