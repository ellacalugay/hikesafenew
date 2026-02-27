import React, { useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator,
  StyleSheet,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bluetooth, BluetoothOff, Radio, Check, RefreshCw, ChevronRight, Satellite } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useBluetoothDevice } from '../context/BluetoothContext';

const DeviceSetupScreen = ({ onNext, onSkip }) => {
  const { colors } = useTheme();
  const {
    isEnabled,
    isScanning,
    isConnecting,
    isConnected,
    connectedDevice,
    availableDevices,
    myLocation,
    requestEnable,
    scanForDevices,
    connectToDevice,
    disconnect,
  } = useBluetoothDevice();

  useEffect(() => {
    if (isEnabled && !isConnected) {
      scanForDevices();
    }
  }, [isEnabled]);

  const handleDevicePress = async (device) => {
    if (isConnected && connectedDevice?.id === device.id) {
      await disconnect();
    } else {
      await connectToDevice(device);
    }
  };

  const renderDevice = ({ item }) => {
    const isCurrentDevice = connectedDevice?.id === item.id;
    
    return (
      <TouchableOpacity
        style={[
          styles.deviceItem,
          { 
            backgroundColor: colors.cardBg,
            borderColor: isCurrentDevice ? colors.primary : colors.borderColor,
            borderWidth: isCurrentDevice ? 2 : 1,
          }
        ]}
        onPress={() => handleDevicePress(item)}
        disabled={isConnecting}
      >
        <View style={styles.deviceInfo}>
          <Radio size={24} color={isCurrentDevice ? colors.primary : colors.gray} />
          <View style={styles.deviceText}>
            <Text style={[styles.deviceName, { color: colors.textDark }]}>
              {item.name || 'Unknown Device'}
            </Text>
            <Text style={[styles.deviceAddress, { color: colors.gray }]}>
              {item.address || item.id}
            </Text>
          </View>
        </View>
        
        {isCurrentDevice && isConnected ? (
          <View style={[styles.connectedBadge, { backgroundColor: colors.primary }]}>
            <Check size={16} color="#fff" />
            <Text style={styles.connectedText}>Connected</Text>
          </View>
        ) : (
          <Text style={[styles.tapToConnect, { color: colors.gray }]}>Tap to connect</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textDark }]}>Connect Your Device</Text>
        <Text style={[styles.subtitle, { color: colors.gray }]}>
          Connect your HikeSafe device to enable GPS tracking, messaging, and emergency alerts.
        </Text>
      </View>

      {/* Bluetooth Status */}
      <View style={[styles.statusCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
        {isEnabled ? (
          <Bluetooth size={32} color={colors.primary} />
        ) : (
          <BluetoothOff size={32} color={colors.gray} />
        )}
        <View style={styles.statusText}>
          <Text style={[styles.statusTitle, { color: colors.textDark }]}>
            Bluetooth {isEnabled ? 'Enabled' : 'Disabled'}
          </Text>
          <Text style={[styles.statusDesc, { color: colors.gray }]}>
            {isEnabled 
              ? 'Ready to connect to HikeSafe devices' 
              : 'Enable Bluetooth to connect to your device'}
          </Text>
        </View>
        {!isEnabled && (
          <TouchableOpacity
            style={[styles.enableButton, { backgroundColor: colors.primary }]}
            onPress={requestEnable}
          >
            <Text style={styles.enableButtonText}>Enable</Text>
          </TouchableOpacity>
        )}
        {isEnabled && (
          <TouchableOpacity onPress={scanForDevices} disabled={isScanning}>
            <RefreshCw size={22} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Connected Device Info */}
      {isConnected && connectedDevice && (
        <View style={[styles.connectedCard, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <View style={styles.connectedHeader}>
            <Radio size={20} color={colors.primary} />
            <Text style={[styles.connectedTitle, { color: colors.primary }]}>
              Connected: {connectedDevice.name}
            </Text>
          </View>
          
          <View style={styles.gpsInfo}>
            <Satellite size={16} color={colors.textDark} />
            <Text style={[styles.gpsLabel, { color: colors.textDark, marginLeft: 8 }]}>GPS Status:</Text>
            {myLocation.valid ? (
              <Text style={[styles.gpsValue, { color: colors.primary, marginLeft: 8 }]}>
                {myLocation.satellites} satellites locked
              </Text>
            ) : (
              <Text style={[styles.gpsValue, { color: colors.gray, marginLeft: 8 }]}>
                Acquiring... ({myLocation.satellites} sats)
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Device List */}
      <View style={styles.listSection}>
        <View style={styles.listHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textDark }]}>
            Available Devices
          </Text>
          {isScanning && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
        
        {isScanning && availableDevices.length === 0 ? (
          <View style={styles.scanningContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.scanningText, { color: colors.gray }]}>
              Scanning for devices...
            </Text>
          </View>
        ) : (
          <FlatList
            data={availableDevices}
            renderItem={renderDevice}
            keyExtractor={(item) => item.id || item.address}
            ListEmptyComponent={
              <View style={[styles.emptyContainer, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
                <BluetoothOff size={40} color={colors.gray} />
                <Text style={[styles.emptyText, { color: colors.gray }]}>
                  No HikeSafe devices found
                </Text>
                <Text style={[styles.emptyHint, { color: colors.gray }]}>
                  1. Power on your HikeSafe device{'\n'}
                  2. Make sure you are within range{'\n'}
                  3. Tap refresh to scan again
                </Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {/* Bottom Buttons */}
      <View style={styles.bottomButtons}>
        {isConnected ? (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={onNext}
          >
            <Text style={styles.primaryButtonText}>Continue to Setup</Text>
            <ChevronRight size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.skipButton, { borderColor: colors.borderColor }]}
              onPress={onSkip}
            >
              <Text style={[styles.skipButtonText, { color: colors.gray }]}>Skip for Now</Text>
            </TouchableOpacity>
            <Text style={[styles.skipHint, { color: colors.gray }]}>
              You can connect your device later in the Location tab
            </Text>
          </>
        )}
      </View>

      {/* Connecting Overlay */}
      {isConnecting && (
        <View style={styles.connectingOverlay}>
          <View style={[styles.connectingModal, { backgroundColor: colors.modalBg }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.connectingText, { color: colors.textDark }]}>
              Connecting to device...
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    flex: 1,
    marginLeft: 12,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  enableButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  enableButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  connectedCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  connectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  connectedTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  gpsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gpsLabel: {
    fontSize: 14,
  },
  gpsValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  listSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 20,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceText: {
    marginLeft: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '500',
  },
  deviceAddress: {
    fontSize: 12,
    marginTop: 2,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  connectedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  tapToConnect: {
    fontSize: 12,
  },
  scanningContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  scanningText: {
    marginTop: 16,
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomButtons: {
    padding: 24,
    paddingBottom: 32,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  skipHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
  connectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectingModal: {
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
  },
  connectingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default DeviceSetupScreen;
