import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ImageBackground, Image } from 'react-native';
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
  const { isConnected, isDeviceReachable, connectedDevice, myLocation, memberLocations, statusMessage, loraSignalStrength, connectedDevicesCount, activeAlert } = useBluetoothDevice();
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
  
  return (
    <ImageBackground 
      source={require('../../assets/dashboard_bg.png')} 
      style={[styles.tabContainer, { backgroundColor: colors.background }]}
      imageStyle={{ resizeMode: 'cover', width: '100%', height: '100%' }}
    >
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} />
      <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={[styles.scrollContent, { backgroundColor: 'transparent', paddingBottom: 120 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.welcomeText, { color: colors.textDark }]}>Hello!</Text>
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
                {loraSignalStrength ? (
                  <Text style={[styles.statValue, { fontSize: 12 }]}>{loraSignalStrength} dBm</Text>
                ) : (
                  <View style={styles.signalIcon}>
                    <View style={[styles.bar, {height: 6, backgroundColor: signalQuality >= 1 ? '#fff' : '#666'}]} />
                    <View style={[styles.bar, {height: 10, backgroundColor: signalQuality >= 2 ? '#fff' : '#666'}]} />
                    <View style={[styles.bar, {height: 14, backgroundColor: signalQuality >= 3 ? '#fff' : '#666'}]} />
                  </View>
                )}
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
});

export default HomeTab;