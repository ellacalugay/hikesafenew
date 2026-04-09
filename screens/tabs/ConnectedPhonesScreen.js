import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Smartphone, Users, Radio, Wifi, WifiOff, Clock } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';

const ConnectedPhonesScreen = ({ onBack }) => {
  const { colors } = useTheme();
  const {
    isConnected,
    connectedDevice,
    connectedDevicesCount,
    memberLocations,
    myLocation,
  } = useBluetoothDevice();

  // Mock data for demonstration - in production, track phone IDs from LoRa messages
  const [connectedPhones, setConnectedPhones] = useState([
    {
      id: 'this-phone',
      name: 'Your Phone',
      deviceId: null,
      role: 'Primary',
      isConnected: true,
      Location: myLocation.valid
        ? `${myLocation.lat.toFixed(4)}, ${myLocation.lng.toFixed(4)}`
        : 'Awaiting GPS',
      lastUpdate: Date.now(),
      signalStrength: 'Strong',
    },
  ]);

  // Add member locations to the connected phones list
  useEffect(() => {
    if (memberLocations.length > 0) {
      const otherPhones = memberLocations.map((member) => ({
        id: `device-${member.deviceId}`,
        name: `Device ${member.deviceId}`,
        deviceId: member.deviceId,
        role: 'Member',
        isConnected: !member.isOffline,
        location: member.lat && member.lng
          ? `${member.lat.toFixed(4)}, ${member.lng.toFixed(4)}`
          : 'No GPS',
        lastUpdate: member.lastUpdate || Date.now(),
        signalStrength: member.signalStrength || 'Unknown',
      }));

      setConnectedPhones((prev) => {
        // Update this-phone location if it changed
        const updated = prev.map((p) =>
          p.id === 'this-phone'
            ? {
                ...p,
                location: myLocation.valid
                  ? `${myLocation.lat.toFixed(4)}, ${myLocation.lng.toFixed(4)}`
                  : 'Awaiting GPS',
                lastUpdate: Date.now(),
              }
            : p
        );
        // Merge with other phones (avoid duplicates)
        const otherIds = new Set(otherPhones.map((p) => p.id));
        const merged = [
          updated[0], // Keep "this-phone" first
          ...otherPhones,
        ];
        return merged;
      });
    }
  }, [memberLocations, myLocation]);

  const formatTime = (timestamp) => {
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
  };

  const renderPhoneItem = ({ item }) => (
    <View
      style={[
        styles.phoneCard,
        {
          backgroundColor: colors.cardBg,
          borderColor: item.isConnected ? colors.primary : colors.borderColor,
          borderWidth: 1.5,
        },
      ]}
    >
      <View style={styles.phoneHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Smartphone
            size={24}
            color={item.isConnected ? colors.primary : colors.gray}
            style={{ marginRight: 12 }}
          />
          <View>
            <Text style={[styles.phoneName, { color: colors.textDark }]}>
              {item.name}
            </Text>
            <Text style={[styles.phoneRole, { color: colors.gray }]}>
              {item.role}
              {item.isConnected &&  ' • Online'}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: item.isConnected ? colors.primaryLight : colors.borderColor },
          ]}
        >
          {item.isConnected ? (
            <Wifi size={14} color={colors.primary} />
          ) : (
            <WifiOff size={14} color={colors.gray} />
          )}
        </View>
      </View>

      <View style={styles.phoneDetails}>
        <View style={styles.detailRow}>
          <Text style={[styles.label, { color: colors.gray }]}>Location:</Text>
          <Text style={[styles.value, { color: colors.textDark }]}>
            {item.location}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.label, { color: colors.gray }]}>Last Update:</Text>
          <Text style={[styles.value, { color: colors.textDark }]}>
            {formatTime(item.lastUpdate)}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.label, { color: colors.gray }]}>Signal:</Text>
          <Text
            style={[
              styles.value,
              {
                color:
                  item.signalStrength === 'Strong'
                    ? colors.primary
                    : item.signalStrength === 'Weak'
                    ? colors.accent
                    : colors.gray,
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textDark }]}>
          Connected Phones
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary Card */}
      <View style={[styles.summaryCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
        <View style={styles.summaryItem}>
          <Users size={28} color={colors.primary} />
          <View style={{ marginLeft: 12 }}>
            <Text style={[styles.summaryLabel, { color: colors.gray }]}>
              Total Connected
            </Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              {connectedDevicesCount} {connectedDevicesCount === 1 ? 'Phone' : 'Phones'}
            </Text>
          </View>
        </View>

        {isConnected ? (
          <View style={[styles.connectedStatus, { backgroundColor: colors.primaryLight }]}>
            <Radio size={16} color={colors.textLight} />
            <Text style={[styles.statusText, { color: colors.textLight }]} >
              Device Connected
            </Text>
          </View>
        ) : (
          <View style={[styles.connectedStatus, { backgroundColor: colors.primaryLight }]}>
            <Radio size={16} color={colors.textLight} />
            <Text style={[styles.statusText, { color: colors.textLight }]}>
              Device Disconnected
            </Text>
          </View>
        )}
      </View>

      {/* Phone List */}
      <FlatList
        data={connectedPhones}
        renderItem={renderPhoneItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        scrollEnabled={false}
      />

      <ScrollView style={{ flex: 1 }}>
        <View style={styles.infoSection}>
          <Text style={[styles.infoTitle, { color: colors.textDark }]}>
            About This Screen
          </Text>
          <Text style={[styles.infoText, { color: colors.gray }]}>
            • "Your Phone" shows your primary connection to the HikeSafe device
          </Text>
          <Text style={[styles.infoText, { color: colors.gray }]}>
            • Other devices connect through the LoRa mesh network
          </Text>
          <Text style={[styles.infoText, { color: colors.gray }]}>
            • Location updates are shared in real-time across all connected phones
          </Text>
          <Text style={[styles.infoText, { color: colors.gray }]}>
            • Offline devices can still receive broadcasts through other connected phones
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  summaryCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  connectedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  phoneCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 12,
  },
  phoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  phoneName: {
    fontSize: 16,
    fontWeight: '600',
  },
  phoneRole: {
    fontSize: 12,
    marginTop: 2,
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
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  value: {
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  infoSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
});

export default ConnectedPhonesScreen;
