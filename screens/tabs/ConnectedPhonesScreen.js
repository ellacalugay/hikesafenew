import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Smartphone, Users, Radio, Wifi, WifiOff } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';
import { styles } from '../../styles/styles';

const ConnectedPhonesScreen = ({ onBack }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getMemberNickname } = useLobby();
  const {
    isConnected,
    connectedDevice,
    connectedDevicesCount,
    memberLocations,
    myLocation,
    lastDataReceived,
    connectionHealth,
    loraSignalStrength,
  } = useBluetoothDevice();

  const formatTime = useCallback((timestamp) => {
    if (!timestamp) return 'Never';
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 1) return `${(minutes / 60).toFixed(1)}h ago`;
    return new Date(timestamp).toLocaleTimeString();
  }, []);

  const connectedPhones = useMemo(() => {
    const bleSignal = (() => {
      if (!isConnected) return 'Disconnected';
      if (connectionHealth === 'good') return 'Strong';
      if (connectionHealth === 'warning') return 'Weak';
      if (connectionHealth === 'lost') return 'Disconnected';
      return 'Unknown';
    })();

    const mySignal = typeof loraSignalStrength === 'number'
      ? `${bleSignal} • LoRa ${loraSignalStrength} dBm`
      : bleSignal;

    const myPhoneData = {
      id: 'this-phone',
      name: 'Your Phone',
      deviceId: connectedDevice ? connectedDevice.id : null,
      role: 'Primary',
      isConnected,
      location: (myLocation?.valid && Number.isFinite(myLocation?.lat) && Number.isFinite(myLocation?.lng))
        ? `${myLocation.lat.toFixed(5)}, ${myLocation.lng.toFixed(5)}`
        : 'Awaiting GPS',
      lastUpdate: lastDataReceived,
      signalStrength: mySignal,
    };

    const otherPhonesData = (memberLocations || []).map((member) => ({
      id: `device-${member.deviceId}`,
      name: (getMemberNickname && getMemberNickname(member.deviceId)) || `Device ${member.deviceId}`,
      deviceId: member.deviceId,
      role: 'Member',
      isConnected: !member.isOffline,
      location: (Number.isFinite(member.lat) && Number.isFinite(member.lng))
        ? `${member.lat.toFixed(5)}, ${member.lng.toFixed(5)}`
        : 'No GPS',
      lastUpdate: member.lastUpdate || Date.now(),
      signalStrength: member.signalStrength || 'Unknown',
    }));

    return [myPhoneData, ...otherPhonesData];
  }, [connectionHealth, connectedDevice, getMemberNickname, isConnected, lastDataReceived, loraSignalStrength, memberLocations, myLocation?.lat, myLocation?.lng, myLocation?.valid]);

  const renderPhoneItem = (item) => (
    <View
      key={item.id}
      style={[
        localStyles.phoneCard,
        {
          borderColor: item.isConnected ? colors.primary : colors.glassBorder,
          borderWidth: item.isConnected ? 1.5 : 1,
        },
      ]}
    >
      <BlurView intensity={colors.glassIntensity} tint={colors.glassTint} style={StyleSheet.absoluteFillObject} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

      <View style={localStyles.phoneHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Smartphone
            size={24}
            color={item.isConnected ? colors.primary : colors.gray}
            style={{ marginRight: 12 }}
          />
          <View>
            <Text style={[localStyles.phoneName, { color: colors.textDark }]}>
              {item.name}
            </Text>
            <Text style={[localStyles.phoneRole, { color: colors.gray }]}>
              {item.role}
              {item.isConnected &&  ' • Online'}
            </Text>
          </View>
        </View>
        <View
          style={[
            localStyles.statusBadge,
            { backgroundColor: item.isConnected ? `${colors.primaryLight}33` : colors.inputBg },
          ]}
        >
          {item.isConnected ? (
            <Wifi size={16} color={colors.primary} />
          ) : (
            <WifiOff size={16} color={colors.gray} />
          )}
        </View>
      </View>

      <View style={[localStyles.phoneDetails, { borderTopColor: colors.glassBorder }]}>
        <View style={localStyles.detailRow}>
          <Text style={[localStyles.label, { color: colors.gray }]}>Location:</Text>
          <Text style={[localStyles.value, { color: colors.textDark }]}>
            {item.location}
          </Text>
        </View>

        <View style={localStyles.detailRow}>
          <Text style={[localStyles.label, { color: colors.gray }]}>Last Update:</Text>
          <Text style={[localStyles.value, { color: colors.textDark }]}>
            {formatTime(item.lastUpdate)}
          </Text>
        </View>

        <View style={localStyles.detailRow}>
          <Text style={[localStyles.label, { color: colors.gray }]}>Signal:</Text>
          <Text
            style={[
              localStyles.value,
              {
                color: (() => {
                  const s = String(item.signalStrength || '');
                  if (s.startsWith('Strong')) return colors.primary;
                  if (s.startsWith('Weak')) return colors.accent;
                  if (s.startsWith('Disconnected')) return colors.danger;
                  return colors.gray;
                })(),
              },
            ]}
          >
            {item.signalStrength}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[localStyles.container, { backgroundColor: 'transparent' }]}
    >

      {/* Header */}
      <View
        style={[
          styles.headerBar,
          {
            backgroundColor: colors.headerBg,
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            marginBottom: 10,
            paddingTop: insets.top + 10,
            paddingBottom: 15,
            height: insets.top + 60,
          },
        ]}
      >
        <TouchableOpacity
          onPress={onBack}
          style={{ position: 'absolute', left: 16, bottom: 12, padding: 4 }}
        >
          <ArrowLeft size={24} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textDark, fontWeight: '700', fontSize: 20, bottom: -4 }]}>CONNECTED PHONES</Text>
        <Image
          source={require('../../assets/hike_logo.png')}
          style={{ position: 'absolute', right: 16, bottom: 6, width: 36, height: 36, resizeMode: 'contain' }}
        />
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 90, 50) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <View style={[localStyles.summaryCard, { borderColor: colors.glassBorder, backgroundColor: 'transparent' }]}
        >
          <BlurView intensity={colors.glassIntensity} tint={colors.glassTint} style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

          <View style={localStyles.summaryItem}>
            <Users size={28} color={colors.primary} />
            <View style={{ marginLeft: 12 }}>
              <Text style={[localStyles.summaryLabel, { color: colors.gray }]}>Total Connected</Text>
              <Text style={[localStyles.summaryValue, { color: colors.primary }]}>
                {connectedDevicesCount} {connectedDevicesCount === 1 ? 'Phone' : 'Phones'}
              </Text>
            </View>
          </View>

          <View style={[localStyles.connectedStatus, { backgroundColor: isConnected ? colors.primary : colors.danger }]}>
            {isConnected ? <Radio size={16} color={colors.textLight} /> : <WifiOff size={16} color={colors.textLight} />}
            <Text style={[localStyles.statusText, { color: colors.textLight }]}>
              {isConnected ? 'Device Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>

        {/* Phone List */}
        <View style={localStyles.listContent}>
          {connectedPhones.map((phone) => renderPhoneItem(phone))}
        </View>

        {/* Info */}
        <View style={[localStyles.infoSection, { borderTopColor: colors.glassBorder }]}>
          <Text style={[localStyles.infoTitle, { color: colors.textDark }]}>About This Screen</Text>
          <Text style={[localStyles.infoText, { color: colors.gray }]}>• "Your Phone" shows your primary connection to the HikeSafe device</Text>
          <Text style={[localStyles.infoText, { color: colors.gray }]}>• Other devices connect through the LoRa mesh network</Text>
          <Text style={[localStyles.infoText, { color: colors.gray }]}>• Location updates are shared in real-time across all connected phones</Text>
          <Text style={[localStyles.infoText, { color: colors.gray }]}>• Offline devices can still receive broadcasts through other connected phones</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryCard: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  connectedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  phoneCard: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  phoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  phoneName: {
    fontSize: 16,
    fontWeight: '700',
  },
  phoneRole: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  statusBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneDetails: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  value: {
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
    fontWeight: '500',
  },
  infoSection: {
    padding: 20,
    borderTopWidth: 1,
    marginTop: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
    fontWeight: '500',
  },
});

export default ConnectedPhonesScreen;
