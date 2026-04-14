import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Pressable, Alert, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Radio, Users, AlertTriangle } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calculateDistance } from '../../utils/math';

const HomeTab = ({ onChangeTab, onLobbyPress }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isConnected, connectedDevice, myLocation, memberLocations, statusMessage, loraSignalStrength, connectedDevicesCount, activeAlert, sendSOS, sendOK } = useBluetoothDevice();
  const { lobbyCode, lobbyName, myNickname } = useLobby();

  // SOS button pulse/blink (subtle) when connected.
  const sosPulseAnim = useRef(new Animated.Value(0)).current;
  const sosPulseLoopRef = useRef(null);

  useEffect(() => {
    // Stop pulse when not connected.
    if (!isConnected) {
      try {
        sosPulseLoopRef.current?.stop?.();
      } catch {
        // ignore
      }
      sosPulseLoopRef.current = null;
      sosPulseAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sosPulseAnim, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    sosPulseLoopRef.current = loop;
    loop.start();

    return () => {
      try {
        loop.stop();
      } catch {
        // ignore
      }
    };
  }, [isConnected, sosPulseAnim]);
  
  // Calculate nearest member distance
  const nearestDistance = useMemo(() => {
    if (!myLocation?.valid || !memberLocations || memberLocations.length === 0) return null;
    
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

  const handleSendOk = async () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to your device first.');
      return;
    }

    try {
      await sendOK();
      Alert.alert('OK Sent', 'Your OK signal has been sent.');
    } catch {
      Alert.alert('Send Failed', 'Could not send OK. Please try again.');
    }
  };
  
  return (
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={[
          styles.scrollContent,
          {
            backgroundColor: 'transparent',
            paddingTop: 12,
            paddingBottom: insets.bottom + 90,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.headerRow, { alignItems: 'center' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.welcomeText, { color: colors.textDark }, { fontWeight: 'bold' }]}>Hello!</Text>
            <Text style={[styles.usernameTitle, { color: colors.textDark }]} numberOfLines={1}>
              {myNickname}
            </Text>
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
              style={{ width: 44, height: 44, resizeMode: 'contain', marginLeft: 8 }} 
            />            
          </View>
        </View>

        {/* SOS / OK Action Buttons moved to bottom fixed container */}

        {/* Status Message */}
        {statusMessage && (
          <View style={[localStyles.statusBanner, { backgroundColor: colors.primaryLight }]}>
            <Text style={[localStyles.statusText, { color: colors.textLight }]}>
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
        <Text style={[localStyles.sosHint, { color: colors.gray }]}>PRESS AND HOLD FOR 1 SECOND</Text>

        <Pressable
          onLongPress={handleEmergencySOS}
          delayLongPress={1000}
          style={[localStyles.sosPressable, !isConnected && localStyles.sosDisabled]}
        >
          {({ pressed }) => {
            const sosSize = 300; // ~15% bigger than 260
            const pulseOpacity = sosPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] });
            const pulseScale = sosPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

            const haloOpacity = sosPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0] });
            const haloScale = sosPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] });

            return (
              <View style={{ alignSelf: 'center' }}>
                {isConnected && (
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: sosSize,
                      height: sosSize,
                      borderRadius: sosSize / 2,
                      backgroundColor: '#9A0000',
                      opacity: haloOpacity,
                      transform: [{ scale: haloScale }],
                    }}
                  />
                )}

                <Animated.View
                  style={{
                    opacity: isConnected ? pulseOpacity : 1,
                    transform: [{ scale: pressed ? 0.975 : (isConnected ? pulseScale : 1) }],
                  }}
                >
                  <View
                    style={[
                      localStyles.sosCard,
                      {
                        backgroundColor: isConnected ? '#9A0000' : '#ff0000',
                        width: sosSize,
                        height: sosSize,
                        borderRadius: sosSize / 2,
                        alignSelf: 'center',
                      },
                    ]}
                  >
                    <View style={localStyles.sosInnerFrame}>
                      <View style={localStyles.sosIconWrap}>
                        <AlertTriangle size={52} color="#fff" strokeWidth={2.6} />
                      </View>
                      <Text style={localStyles.sosLabel}>SOS</Text>
                      <Text style={localStyles.sosSubLabel}>HOLD TO ALERT</Text>
                    </View>
                  </View>
                </Animated.View>
              </View>
            );
          }}
        </Pressable>

        {/* OK Button */}
        <TouchableOpacity
          onPress={handleSendOk}
          disabled={!isConnected}
          activeOpacity={0.85}
          style={[
            localStyles.okButton,
            {
              backgroundColor: isConnected ? colors.primary : colors.inputBg,
              opacity: isConnected ? 1 : 0.6,
            },
          ]}
        >
          <Text style={[localStyles.okButtonText, { color: isConnected ? colors.textLight : colors.gray }]}>I am OK</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
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
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
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
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.4,
  },

  sosTitle: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1.2,
    marginTop: 28,
  },

  okButton: {
    alignSelf: 'center',
    marginTop: 18,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    minWidth: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okButtonText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  sosPressable: {
    marginTop: 0,
    alignSelf: 'stretch',
  },

  sosDisabled: {
    opacity: 0.7,
  },

  sosCard: {
    borderRadius: 28,
    padding: 20,
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
    borderRadius: 9999,
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

});

export default HomeTab;