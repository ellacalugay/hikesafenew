import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bluetooth,
  BluetoothOff,
  Radio,
  Check,
  RefreshCw,
  ChevronRight,
  Satellite,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useBluetoothDevice } from '../context/BluetoothContext';

const DeviceSetupScreen = ({ onNext, onSkip, allowSkip = true }) => {
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
  }, [isEnabled, isConnected, scanForDevices]);

  const handleDevicePress = async (device) => {
    if (isConnected && connectedDevice?.id === device.id) {
      await disconnect();
    } else {
      await connectToDevice(device);
    }
  };

  const getSignalDotColor = (rssi) => {
    if (rssi === undefined || rssi === null) return '#6FAF4C';
    if (rssi > -75) return '#2E8B57';
    if (rssi > -90) return '#6FAF4C';
    return '#E74C3C';
  };

  const renderDevice = ({ item }) => {
    const isCurrentDevice = connectedDevice?.id === item.id;

    return (
      <TouchableOpacity
        style={[
          localStyles.deviceItem,
          {
            borderColor: isCurrentDevice ? '#2E8B57' : 'rgba(0,0,0,0.08)',
            borderWidth: isCurrentDevice ? 2 : 1,
          },
        ]}
        onPress={() => handleDevicePress(item)}
        disabled={isConnecting}
      >
        <View style={localStyles.deviceLeftSection}>
          <Text style={localStyles.deviceName}>{item.name || 'Unknown Device'}</Text>
          <Text style={localStyles.deviceAddress}>{item.address || item.id}</Text>
        </View>

        <View style={localStyles.deviceRightSection}>
          {isCurrentDevice && isConnected ? (
            <View style={localStyles.connectedPill}>
              <Check size={14} color="#2E8B57" />
              <Text style={localStyles.connectedPillText}>Connected</Text>
            </View>
          ) : (
            <View
              style={[
                localStyles.signalDot,
                { backgroundColor: getSignalDotColor(item.rssi) },
              ]}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ImageBackground
      source={require('../assets/forest_bg 1.png')}
      resizeMode="cover"
      style={localStyles.background}
    >
      <View style={localStyles.backdrop} />
      <SafeAreaView style={localStyles.container}>
        <View style={localStyles.headerArea}>
          <Text style={localStyles.brandTitle}>HikeSafe</Text>
          <Text style={localStyles.connectingLabel}>Long Range Device</Text>
          <Text style={localStyles.connectingText}>Connecting...</Text>
        </View>

        <View style={localStyles.statusStrip}>
          {isEnabled ? (
            <Bluetooth size={18} color="#2E8B57" />
          ) : (
            <BluetoothOff size={18} color="#6B6B6B" />
          )}
          <Text style={localStyles.statusStripText}>
            Bluetooth {isEnabled ? 'enabled' : 'disabled'}
          </Text>
          {!isEnabled ? (
            <TouchableOpacity
              style={localStyles.smallActionButton}
              onPress={requestEnable}
              disabled={isConnecting}
            >
              <Text style={localStyles.smallActionText}>Enable</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={localStyles.smallActionButton}
              onPress={scanForDevices}
              disabled={isScanning || isConnecting}
            >
              {isScanning ? (
                <ActivityIndicator size="small" color="#2E8B57" />
              ) : (
                <RefreshCw size={16} color="#2E8B57" />
              )}
            </TouchableOpacity>
          )}
        </View>

        {isConnected && connectedDevice && (
          <View style={localStyles.connectedInfoCard}>
            <View style={localStyles.connectedRow}>
              <Radio size={18} color="#2E8B57" />
              <Text style={localStyles.connectedInfoTitle}>
                Connected to {connectedDevice.name}
              </Text>
            </View>
            <View style={localStyles.connectedRow}>
              <Satellite size={14} color="#345A2A" />
              <Text style={localStyles.connectedInfoSubtext}>
                {myLocation.valid
                  ? `${myLocation.satellites} satellites locked`
                  : `Acquiring GPS... (${myLocation.satellites} sats)`}
              </Text>
            </View>
          </View>
        )}

        <View style={localStyles.listCard}>
          <Text style={localStyles.listTitle}>Available Devices</Text>

          {isScanning && availableDevices.length === 0 ? (
            <View style={localStyles.centerState}>
              <ActivityIndicator size="large" color="#2E8B57" />
              <Text style={localStyles.centerStateText}>Scanning for HikeSafe devices...</Text>
            </View>
          ) : (
            <FlatList
              data={availableDevices}
              renderItem={renderDevice}
              keyExtractor={(item) => item.id || item.address}
              contentContainerStyle={localStyles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={localStyles.centerState}>
                  <BluetoothOff size={30} color="#7A7A7A" />
                  <Text style={localStyles.centerStateText}>No devices found nearby</Text>
                  <Text style={localStyles.centerStateHint}>
                    Power on device, stay within range, then tap refresh.
                  </Text>
                </View>
              }
            />
          )}
        </View>

        <View style={localStyles.bottomArea}>
          {isConnected ? (
            <TouchableOpacity
              style={localStyles.primaryButton}
              onPress={onNext}
              disabled={isConnecting}
            >
              <Text style={localStyles.primaryButtonText}>CONTINUE</Text>
              <ChevronRight size={18} color="#2E8B57" />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  localStyles.primaryButton,
                  { opacity: allowSkip ? 1 : 0.55 },
                ]}
                onPress={allowSkip ? onSkip : undefined}
                disabled={!allowSkip || isConnecting}
              >
                <Text style={localStyles.primaryButtonText}>
                  {allowSkip ? 'SKIP FOR NOW' : 'RECONNECT REQUIRED'}
                </Text>
              </TouchableOpacity>
              <Text style={localStyles.bottomHint}>
                {allowSkip
                  ? 'You can connect your device later in setup.'
                  : 'Your previous device disconnected. Reconnect to continue.'}
              </Text>
            </>
          )}
        </View>

        {isConnecting && (
          <View style={localStyles.connectingOverlay}>
            <View style={localStyles.connectingCard}>
              <ActivityIndicator size="large" color="#2E8B57" />
              <Text style={localStyles.connectingCardText}>Connecting to device...</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </ImageBackground>
  );
};

const localStyles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#E8F0D6',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  headerArea: {
    marginTop: 12,
    marginBottom: 14,
  },
  brandTitle: {
    fontSize: 44,
    fontWeight: '800',
    color: '#2E6B3F',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  connectingLabel: {
    fontSize: 24,
    color: '#465A42',
    fontWeight: '500',
  },
  connectingText: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: '#1F3A22',
    marginTop: 2,
  },
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  statusStripText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: '#3F5340',
    fontWeight: '600',
  },
  smallActionButton: {
    minWidth: 42,
    minHeight: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(46,139,87,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7FBF2',
    paddingHorizontal: 10,
  },
  smallActionText: {
    color: '#2E8B57',
    fontSize: 12,
    fontWeight: '700',
  },
  connectedInfoCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(128, 199, 88, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(46,139,87,0.35)',
    padding: 12,
    marginBottom: 10,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  connectedInfoTitle: {
    marginLeft: 8,
    fontSize: 14,
    color: '#2F4F2F',
    fontWeight: '700',
  },
  connectedInfoSubtext: {
    marginLeft: 8,
    fontSize: 12,
    color: '#345A2A',
    fontWeight: '500',
  },
  listCard: {
    flex: 1,
    borderRadius: 22,
    padding: 14,
    backgroundColor: 'rgba(128, 199, 88, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(46,139,87,0.3)',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#244126',
    marginBottom: 10,
  },
  listContent: {
    paddingBottom: 8,
  },
  deviceItem: {
    minHeight: 58,
    backgroundColor: '#F1F1F1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  deviceLeftSection: {
    flex: 1,
    paddingRight: 8,
  },
  deviceName: {
    fontSize: 22,
    color: '#3D3D3D',
    fontWeight: '700',
  },
  deviceAddress: {
    fontSize: 11,
    color: '#7A7A7A',
    marginTop: 2,
  },
  deviceRightSection: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 76,
  },
  signalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(46,139,87,0.35)',
    backgroundColor: '#EBF7EE',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  connectedPillText: {
    marginLeft: 4,
    color: '#2E8B57',
    fontSize: 11,
    fontWeight: '700',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    paddingHorizontal: 18,
  },
  centerStateText: {
    marginTop: 12,
    color: '#344F36',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  centerStateHint: {
    marginTop: 6,
    color: '#4A6148',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  bottomArea: {
    paddingTop: 14,
  },
  primaryButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(46,139,87,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryButtonText: {
    color: '#2E8B57',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  bottomHint: {
    marginTop: 8,
    textAlign: 'center',
    color: '#3D533C',
    fontSize: 12,
  },
  connectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 30, 20, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectingCard: {
    width: '72%',
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 16,
    backgroundColor: '#F7FBF2',
    borderWidth: 1,
    borderColor: 'rgba(46,139,87,0.35)',
    alignItems: 'center',
  },
  connectingCardText: {
    marginTop: 10,
    color: '#2E4E2F',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default DeviceSetupScreen;
