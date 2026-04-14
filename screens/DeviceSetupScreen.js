import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  ImageBackground,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bluetooth,
  BluetoothOff,
  Radio,
  Check,
  RefreshCw,
  Satellite,
} from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useBluetoothDevice } from '../context/BluetoothContext';
import { useTheme } from '../context/ThemeContext';
import { MainButton } from '../components/shared';

const DeviceSetupScreen = ({ onNext, onSkip, allowSkip = true }) => {
  const { colors, isDarkMode } = useTheme();
  const {
    isEnabled,
    isScanning,
    isConnecting,
    isConnected,
    connectedDevice,
    connectedDevicesList,
    availableDevices,
    myLocation,
    requestEnable,
    scanForDevices,
    connectToDevice,
    disconnect,
    disconnectFromDevice,
  } = useBluetoothDevice();

  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    if (isEnabled && !isConnected) {
      scanForDevices();
    }
  }, [isEnabled, isConnected, scanForDevices]);

  // Animated dots for "Connecting..." effect
  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDotCount((prev) => (prev + 1) % 4);
    }, 500);
    return () => clearInterval(dotInterval);
  }, []);

  const handleDevicePress = async (device) => {
    const isAlreadyConnected = Array.isArray(connectedDevicesList)
      ? connectedDevicesList.some(d => d?.id === device.id)
      : false;

    if (isAlreadyConnected && typeof disconnectFromDevice === 'function') {
      await disconnectFromDevice(device.id);
      return;
    }

    if (isConnected && connectedDevice?.id === device.id) {
      await disconnect();
      return;
    }

    await connectToDevice(device);
  };

  const getSignalDotColor = (rssi) => {
    if (rssi === undefined || rssi === null) return colors.primaryLight;
    if (rssi > -75) return colors.primary;
    if (rssi > -90) return colors.accent;
    return colors.danger;
  };

  const renderDevice = ({ item }) => {
    const isConnectedToItem = Array.isArray(connectedDevicesList)
      ? connectedDevicesList.some(d => d?.id === item.id)
      : false;
    const isCurrentDevice = connectedDevice?.id === item.id;

    return (
      <TouchableOpacity
        style={[
          localStyles.deviceItem,
          {
            backgroundColor: colors.inputBg,
            borderColor: isConnectedToItem ? colors.primary : colors.borderColor,
            borderWidth: isConnectedToItem ? 2 : 1,
          },
        ]}
        onPress={() => handleDevicePress(item)}
        disabled={isConnecting}
      >
        <View style={localStyles.deviceLeftSection}>
          <Text style={[localStyles.deviceName, { color: colors.textDark }]}>{item.name || 'Unknown Device'}</Text>
          <Text style={[localStyles.deviceAddress, { color: colors.gray }]}>{item.address || item.id}</Text>
        </View>

        <View style={localStyles.deviceRightSection}>
          {isCurrentDevice && isConnected ? (
            <View
              style={[
                localStyles.connectedPill,
                { borderColor: colors.primary, backgroundColor: `${colors.primaryLight}20` },
              ]}
            >
              <Check size={14} color={colors.primary} />
              <Text style={[localStyles.connectedPillText, { color: colors.primary }]}>Connected</Text>
            </View>
          ) : isConnectedToItem ? (
            <View
              style={[
                localStyles.connectedPill,
                { borderColor: colors.primary, backgroundColor: `${colors.primaryLight}20` },
              ]}
            >
              <Check size={14} color={colors.primary} />
              <Text style={[localStyles.connectedPillText, { color: colors.primary }]}>Connected</Text>
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

  const displayedDevices = useMemo(() => {
    const list = Array.isArray(availableDevices) ? [...availableDevices] : [];

    // Ensure all currently connected hubs appear in the list.
    const connected = Array.isArray(connectedDevicesList) ? connectedDevicesList : [];
    connected.forEach((d) => {
      if (!d?.id) return;
      const alreadyListed = list.some(x => x?.id === d.id);
      if (!alreadyListed) {
        list.unshift({
          id: d.id,
          name: d.name || 'Connected Device',
          address: d.id,
          rssi: null,
        });
      }
    });

    return list;
  }, [availableDevices, connectedDevicesList]);

  return (
    <ImageBackground
      source={require('../assets/int bg 1.png')}
      resizeMode="cover"
      style={[localStyles.background, { backgroundColor: colors.background }]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} />

      <SafeAreaView style={localStyles.container} edges={['top', 'bottom']}>
        <View style={localStyles.headerArea}>
          <View style={localStyles.headerRow}>
            <View style={localStyles.headerLeft}>
              <Text style={[localStyles.brandTitle, { color: colors.primary }]}>HikeSafe</Text>
              <Text style={[localStyles.connectingLabel, { color: colors.textDark }]}>Long Range Device</Text>
              <View style={localStyles.connectingRow}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  style={[localStyles.connectingText, localStyles.connectingWord, { color: colors.textDark }]}
                >
                  Connecting
                </Text>
                <View style={localStyles.connectingDots}>
                  <Text style={[localStyles.connectingText, localStyles.connectingDot, { color: colors.textDark, opacity: Math.max(1, dotCount) >= 1 ? 1 : 0 }]}>.</Text>
                  <Text style={[localStyles.connectingText, localStyles.connectingDot, { color: colors.textDark, opacity: Math.max(1, dotCount) >= 2 ? 1 : 0 }]}>.</Text>
                  <Text style={[localStyles.connectingText, localStyles.connectingDot, { color: colors.textDark, opacity: Math.max(1, dotCount) >= 3 ? 1 : 0 }]}>.</Text>
                </View>
              </View>
            </View>

            <View
              style={[
                localStyles.headerRightArt,
                {
                  shadowColor: isDarkMode ? colors.overlay : colors.textDark,
                },
              ]}
            >
              <Image
                source={require('../assets/lillyyyyygoooar 2.png')}
                style={{ width: 150, height: 150 }}
                resizeMode="contain"
              />
            </View>
          </View>
        </View>

        <View style={[localStyles.statusStrip, { borderColor: colors.glassBorder }]}>
          <BlurView intensity={colors.glassIntensity} tint={colors.glassTint} style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

          {isEnabled ? <Bluetooth size={20} color={colors.primary} /> : <BluetoothOff size={20} color={colors.gray} />}

          <Text style={[localStyles.statusStripText, { color: colors.textDark }]}>
            Bluetooth {isEnabled ? 'enabled' : 'disabled'}
          </Text>

          {!isEnabled ? (
            <TouchableOpacity
              style={[localStyles.smallActionButton, { borderColor: colors.primary, backgroundColor: colors.inputBg }]}
              onPress={requestEnable}
              disabled={isConnecting}
            >
              <Text style={[localStyles.smallActionText, { color: colors.primary }]}>Enable</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[localStyles.smallActionButton, { borderColor: colors.primary, backgroundColor: colors.inputBg }]}
              onPress={scanForDevices}
              disabled={isScanning || isConnecting}
            >
              {isScanning ? <ActivityIndicator size="small" color={colors.primary} /> : <RefreshCw size={16} color={colors.primary} />}
            </TouchableOpacity>
          )}
        </View>

        {isConnected && connectedDevice && (
          <View style={[localStyles.connectedInfoCard, { borderColor: colors.primary }]}>
            <BlurView intensity={colors.glassIntensity} tint={colors.glassTint} style={StyleSheet.absoluteFillObject} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: `${colors.primaryLight}20` }]} />

            <View style={localStyles.connectedRow}>
              <Radio size={18} color={colors.primary} />
              <Text style={[localStyles.connectedInfoTitle, { color: colors.textDark }]}>
                Connected to {connectedDevice.name}
                {Array.isArray(connectedDevicesList) && connectedDevicesList.length > 1
                  ? ` (+${connectedDevicesList.length - 1})`
                  : ''}
              </Text>
            </View>
            <View style={localStyles.connectedRow}>
              <Satellite size={14} color={colors.primaryLight} />
              <Text style={[localStyles.connectedInfoSubtext, { color: colors.gray }]}>
                {myLocation.valid
                  ? `${myLocation.satellites} satellites locked`
                  : `Acquiring GPS... (${myLocation.satellites} sats)`}
              </Text>
            </View>
          </View>
        )}

        <View style={[localStyles.listCard, { borderColor: colors.glassBorder }]}>
          <BlurView intensity={colors.glassIntensity} tint={colors.glassTint} style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

          <Text style={[localStyles.listTitle, { color: colors.textDark }]}>Nearby HikeSafe Devices</Text>

          {isScanning && availableDevices.length === 0 ? (
            <View style={localStyles.centerState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[localStyles.centerStateText, { color: colors.textDark }]}>Scanning for HikeSafe devices...</Text>
            </View>
          ) : (
            <FlatList
              data={displayedDevices}
              renderItem={renderDevice}
              keyExtractor={(item) => item.id || item.address}
              contentContainerStyle={localStyles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={localStyles.centerState}>
                  <BluetoothOff size={32} color={colors.gray} />
                  <Text style={[localStyles.centerStateText, { color: colors.textDark }]}>No devices found nearby</Text>
                  <Text style={[localStyles.centerStateHint, { color: colors.gray }]}>
                    Power on device, stay within range, then tap refresh.
                  </Text>
                </View>
              }
            />
          )}
        </View>

        <View style={localStyles.bottomArea}>
          {isConnected ? (
            <MainButton title="CONNECT" onPress={onNext} disabled={isConnecting} />
          ) : (
            <>
              <MainButton
                title={allowSkip ? 'SKIP FOR NOW' : 'RECONNECT REQUIRED'}
                onPress={allowSkip ? onSkip : undefined}
                disabled={!allowSkip || isConnecting}
                variant={allowSkip ? 'outline' : 'primary'}
                style={{ opacity: allowSkip ? 1 : 0.6 }}
              />
              <Text style={[localStyles.bottomHint, { color: colors.gray }]}>
                {allowSkip
                  ? 'You can connect your device later in settings.'
                  : 'Your previous device disconnected. Reconnect to continue.'}
              </Text>
            </>
          )}
        </View>

        {isConnecting && (
          <View style={localStyles.connectingOverlay}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
            <View style={[localStyles.connectingCard, { backgroundColor: colors.modalBg, borderColor: colors.primary }]}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[localStyles.connectingCardText, { color: colors.textDark }]}>Connecting to device...</Text>
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
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerArea: {
    marginTop: 10,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  headerLeft: {
    flex: 1,
    // Reserve space for the absolutely-positioned right art so text layout stays stable.
    paddingRight: 148,
  },
  headerRightArt: {
    width: 148,
    height: 128,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    shadowOffset: { width: 6, height: 10 },
    shadowOpacity: 0.75,
    shadowRadius: 3,
    elevation: 10,
  },
  brandTitle: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  connectingLabel: {
    fontSize: 22,
    fontWeight: '600',
  },
  connectingText: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    marginTop: 2,
  },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  connectingWord: {
    flexShrink: 1,
  },
  connectingDots: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexShrink: 0,
  },
  connectingDot: {
    // Lift dots slightly so they sit "beside" without baseline collisions.
    transform: [{ translateY: -1 }],
  },
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  statusStripText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '700',
  },
  smallActionButton: {
    minWidth: 60,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  smallActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  connectedInfoCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  connectedInfoTitle: {
    marginLeft: 10,
    fontSize: 15,
    fontWeight: '800',
  },
  connectedInfoSubtext: {
    marginLeft: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  listCard: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 8,
  },
  deviceItem: {
    minHeight: 64,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  deviceLeftSection: {
    flex: 1,
    paddingRight: 8,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '800',
  },
  deviceAddress: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  deviceRightSection: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 80,
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
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  connectedPillText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '800',
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  centerStateText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  centerStateHint: {
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
  bottomArea: {
    paddingTop: 8,
  },
  bottomHint: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
  },
  connectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  connectingCard: {
    width: '75%',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: 'black',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  connectingCardText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '800',
  },
});

export default DeviceSetupScreen;
