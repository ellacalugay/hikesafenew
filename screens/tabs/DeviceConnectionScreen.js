import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator,
  StyleSheet,
  Modal,
  ScrollView,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bluetooth, BluetoothOff, Radio, Check, RefreshCw, X, Edit2 } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';
import { MainButton, InputField } from '../../components/shared';

const DeviceConnectionScreen = ({ onBack }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    isEnabled,
    isScanning,
    isConnecting,
    isConnected,
    connectedDevicesList,
    activeHubId,
    availableDevices,
    myLocation,
    connectedDevicesCount,
    diagnostics,
    requestEnable,
    scanForDevices,
    connectToDevice,
    disconnect,
    disconnectFromDevice,
    setActiveHub,
    clearDiagnostics,
  } = useBluetoothDevice();
  const { deviceNickname, setDeviceNickname } = useLobby();
  
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');

  useEffect(() => {
    if (isEnabled && connectedDevicesList.length === 0) {
      scanForDevices();
    }
  }, [isEnabled, connectedDevicesList.length, scanForDevices]);

  useEffect(() => {
    if (showNicknameModal) {
      setNicknameInput(deviceNickname || '');
    }
  }, [showNicknameModal, deviceNickname]);

  const handleDevicePress = async (device) => {
    // Check if device is already connected
    const isAlreadyConnected = connectedDevicesList.some(d => d.id === device.id);
    
    if (isAlreadyConnected) {
      // Disconnect from this specific device
      await disconnectFromDevice(device.id);
    } else {
      // Connect to this device (without disconnecting from others)
      await connectToDevice(device);
    }
  };
  
  const handleSaveNickname = async () => {
    if (nicknameInput.trim()) {
      await setDeviceNickname(nicknameInput.trim());
    }
    setShowNicknameModal(false);
  };

  const singleHubNicknameMode = connectedDevicesList.length <= 1;

  const getConnectedHubLabel = (device) => {
    if (singleHubNicknameMode && deviceNickname) {
      return deviceNickname;
    }
    return device?.name || 'Device';
  };

  const formatDiagTime = (ts) => {
    if (!ts) return '--:--:--';
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '--:--:--';
    }
  };

  const handleExportDiagnostics = async () => {
    try {
      const list = Array.isArray(diagnostics) ? diagnostics : [];
      const lines = list.map((entry) => {
        let details = '';
        try {
          details = JSON.stringify(entry?.details || {});
        } catch {
          details = '{}';
        }
        return `${new Date(entry?.ts || Date.now()).toISOString()} | ${entry?.event || 'event'} | ${details}`;
      });

      const content = lines.length > 0
        ? lines.join('\n')
        : 'No diagnostics captured yet.';

      await Share.share({
        title: 'HikeSafe Diagnostics',
        message: content,
      });
    } catch (error) {
      console.log('Diagnostics export failed:', error?.message || error);
    }
  };

  const renderDevice = ({ item }) => {
    const isConnectedToDevice = connectedDevicesList.some(d => d.id === item.id);
    
    return (
      <TouchableOpacity
        style={[
          localStyles.deviceItem,
          { 
            borderColor: isConnectedToDevice ? colors.primary : colors.glassBorder,
            borderWidth: isConnectedToDevice ? 2 : 1,
          }
        ]}
        onPress={() => handleDevicePress(item)}
        disabled={isConnecting}
      >
        <BlurView intensity={colors.glassIntensity} tint={colors.glassTint} style={StyleSheet.absoluteFillObject} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

        <View style={localStyles.deviceInfo}>
          <Radio size={24} color={isConnectedToDevice ? colors.primary : colors.gray} />
          <View style={localStyles.deviceText}>
            <Text style={[localStyles.deviceName, { color: colors.textDark }]}>
              {item.name || 'Unknown Device'}
            </Text>
            <Text style={[localStyles.deviceAddress, { color: colors.gray }]}>
              {item.address || item.id}
            </Text>
          </View>
        </View>
        
        {isConnecting && !isConnectedToDevice ? null : (
          isConnectedToDevice && isConnected ? (
            <View style={[localStyles.connectedBadge, { backgroundColor: colors.primary }]}>
              <Check size={14} color={colors.textLight} />
              <Text style={[localStyles.connectedText, { color: colors.textLight }]}>Connected</Text>
            </View>
          ) : (
            <Text style={[localStyles.tapToConnect, { color: colors.textDark }]}>
              Tap to {isConnectedToDevice ? 'disconnect' : 'connect'}
            </Text>
          )
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[localStyles.container, { backgroundColor: 'transparent' }]}>

      <View
        style={[
          localStyles.headerBar,
          {
            backgroundColor: colors.headerBg,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            elevation: 5,
            zIndex: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: insets.top + 10,
            paddingBottom: 15,
            height: insets.top + 60,
            borderBottomColor: colors.glassBorder,
          },
        ]}
      >
        <TouchableOpacity onPress={onBack} style={{ position: 'absolute', left: 16, bottom: 12, padding: 4 }}>
          <ArrowLeft size={24} color={colors.textDark} />
        </TouchableOpacity>

        <Text style={[localStyles.headerTitle, { color: colors.textDark, fontWeight: '700', fontSize: 20, bottom: -4 }]}>
          DEVICES
        </Text>

        <TouchableOpacity
          onPress={scanForDevices}
          disabled={isScanning || !isEnabled}
          style={{ position: 'absolute', right: 16, bottom: 12, padding: 4 }}
        >
          <RefreshCw size={22} color={isEnabled ? colors.primary : colors.gray} />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, paddingTop: 16 }}>
        <View style={[localStyles.statusCard, { borderColor: colors.glassBorder }]}>
          <BlurView intensity={colors.glassIntensity} tint={colors.glassTint} style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {isEnabled ? <Bluetooth size={32} color={colors.primary} /> : <BluetoothOff size={32} color={colors.gray} />}
            <View style={localStyles.statusText}>
              <Text style={[localStyles.statusTitle, { color: colors.textDark }]}>Bluetooth {isEnabled ? 'Enabled' : 'Disabled'}</Text>
              <Text style={[localStyles.statusDesc, { color: colors.gray }]}
              >
                {isEnabled ? 'Ready to connect to HikeSafe devices' : 'Enable Bluetooth to connect to your device'}
              </Text>
            </View>
          </View>

          {!isEnabled && (
            <MainButton
              title="Enable"
              onPress={requestEnable}
              style={{ minWidth: 90, paddingVertical: 8, paddingHorizontal: 12, minHeight: 40 }}
            />
          )}
        </View>

        {isConnected && connectedDevicesList.length > 0 && (
          <View style={[localStyles.connectedCard, { borderColor: colors.primary }]}>
            <BlurView intensity={colors.glassIntensity} tint={colors.glassTint} style={StyleSheet.absoluteFillObject} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: `${colors.primaryLight}20` }]} />

            <View style={localStyles.connectedHeader}>
              <Radio size={20} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[localStyles.connectedTitle, { color: colors.textDark }]}>
                  Connected to {connectedDevicesList.length} device{connectedDevicesList.length > 1 ? 's' : ''}
                </Text>
                {connectedDevicesCount > 0 && (
                  <Text style={[localStyles.multiDeviceText, { color: colors.primary }]}>
                    {connectedDevicesCount} phone{connectedDevicesCount > 1 ? 's' : ''} active on LoRa
                  </Text>
                )}
              </View>
            </View>

            {connectedDevicesList.length > 1 && (
              <Text style={[localStyles.activeHubHint, { color: colors.gray }]}>
                Active hub controls Messages and Members tabs.
              </Text>
            )}

            <View style={{ marginLeft: 28, marginBottom: 16 }}>
              {connectedDevicesList.map((device) => (
                <View
                  key={device.id}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, paddingRight: 12 }}>
                    <Text
                      style={{ color: colors.textDark, fontSize: 14, fontWeight: '600', marginRight: 8 }}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {getConnectedHubLabel(device)}
                    </Text>
                    {singleHubNicknameMode && (
                      <TouchableOpacity
                        onPress={() => {
                          setNicknameInput(getConnectedHubLabel(device));
                          setShowNicknameModal(true);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Edit2 size={14} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity
                      onPress={() => setActiveHub(device.id)}
                      style={[
                        localStyles.activeHubBadge,
                        {
                          borderColor: activeHubId === device.id ? colors.primary : colors.borderColor,
                          backgroundColor: activeHubId === device.id ? `${colors.primary}1A` : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: activeHubId === device.id ? colors.primary : colors.gray,
                        }}
                      >
                        {activeHubId === device.id ? 'Active' : 'Set Active'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => disconnectFromDevice(device.id)} style={{ padding: 4, marginLeft: 8 }}>
                      <X size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            <View style={localStyles.gpsInfo}>
              <Text style={[localStyles.gpsLabel, { color: colors.gray }]}>GPS Status:</Text>
              {myLocation.valid ? (
                <View>
                  <Text style={[localStyles.gpsValue, { color: colors.textDark }]}>
                    {myLocation.lat.toFixed(6)}, {myLocation.lng.toFixed(6)}
                  </Text>
                  <Text style={[localStyles.gpsValue, { color: colors.gray, marginTop: 2 }]}>Satellites: {myLocation.satellites}</Text>
                </View>
              ) : (
                <Text style={[localStyles.gpsValue, { color: colors.gray }]}>Waiting for GPS fix... ({myLocation.satellites} sats)</Text>
              )}
            </View>

            <MainButton
              title={`Diagnostics (${(diagnostics || []).length})`}
              onPress={() => setShowDiagnosticsModal(true)}
              style={{ marginTop: 2, marginBottom: 10 }}
            />

            <MainButton
              title="Disconnect All"
              onPress={disconnect}
              style={{ marginTop: 8, backgroundColor: colors.danger, borderColor: colors.danger }}
            />
          </View>
        )}

        <View style={localStyles.listSection}>
          <Text style={[localStyles.sectionTitle, { color: colors.textDark }]}>Available Devices</Text>
          <Text style={[localStyles.sectionSubtitle, { color: colors.gray }]}>HikeSafe devices within range appear automatically</Text>

          {isScanning ? (
            <View style={localStyles.scanningContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[localStyles.scanningText, { color: colors.textDark }]}>Scanning for devices...</Text>
            </View>
          ) : (
            <FlatList
              data={availableDevices}
              renderItem={renderDevice}
              keyExtractor={(item) => item.id || item.address}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={localStyles.listContent}
              ListEmptyComponent={
                <View style={[localStyles.emptyContainer, { borderColor: colors.glassBorder }]}>
                  <BlurView intensity={colors.glassIntensity} tint={colors.glassTint} style={StyleSheet.absoluteFillObject} />
                  <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />
                  <BluetoothOff size={40} color={colors.gray} />
                  <Text style={[localStyles.emptyText, { color: colors.textDark }]}>No devices found</Text>
                  <Text style={[localStyles.emptyHint, { color: colors.gray }]}>
                    1. Power on your HikeSafe device{'\n'}
                    2. Make sure you are within range{'\n'}
                    3. Tap refresh in the top right to scan again
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>

      {isConnecting && (
        <View style={localStyles.connectingOverlay}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={[localStyles.connectingModal, { backgroundColor: colors.modalBg }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[localStyles.connectingText, { color: colors.textDark }]}>Connecting to device...</Text>
          </View>
        </View>
      )}

      <Modal
        visible={showDiagnosticsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDiagnosticsModal(false)}
      >
        <View style={localStyles.connectingOverlay}>
          <View style={[localStyles.diagnosticsModal, { backgroundColor: colors.modalBg, borderColor: colors.borderColor }]}> 
            <View style={localStyles.diagnosticsHeader}>
              <Text style={{ color: colors.textDark, fontSize: 18, fontWeight: '700' }}>Connection Diagnostics</Text>
              <TouchableOpacity onPress={() => setShowDiagnosticsModal(false)}>
                <X size={22} color={colors.gray} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 12 }}>
              Recent BLE/claim/hub events ({(diagnostics || []).length})
            </Text>

            <ScrollView
              style={[localStyles.diagnosticsScroll, { borderColor: colors.borderColor, backgroundColor: colors.inputBg }]}
              contentContainerStyle={{ padding: 10 }}
            >
              {(diagnostics || []).length === 0 ? (
                <Text style={{ color: colors.gray, fontSize: 13 }}>No diagnostics captured yet.</Text>
              ) : (
                [...diagnostics].reverse().map((entry) => {
                  const details = entry?.details && typeof entry.details === 'object'
                    ? JSON.stringify(entry.details)
                    : String(entry?.details || '');
                  return (
                    <View key={entry.id} style={{ marginBottom: 10 }}>
                      <Text style={{ color: colors.textDark, fontSize: 12, fontWeight: '700' }}>
                        {formatDiagTime(entry?.ts)} • {entry?.event || 'event'}
                      </Text>
                      <Text style={{ color: colors.gray, fontSize: 12, marginTop: 2 }}>
                        {details}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={localStyles.diagnosticsActions}>
              <TouchableOpacity
                onPress={handleExportDiagnostics}
                style={[localStyles.diagnosticsActionBtn, { borderColor: colors.borderColor }]}
              >
                <Text style={{ color: colors.textDark, fontWeight: '700' }}>Export</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => clearDiagnostics?.()}
                style={[localStyles.diagnosticsActionBtn, { borderColor: colors.borderColor }]}
              >
                <Text style={{ color: colors.textDark, fontWeight: '700' }}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowDiagnosticsModal(false)}
                style={[localStyles.diagnosticsActionBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}
              >
                <Text style={{ color: colors.textLight, fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showNicknameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNicknameModal(false)}
      >
        <View style={localStyles.connectingOverlay}>
          <View style={[localStyles.connectingModal, { backgroundColor: colors.modalBg, padding: 24, width: '85%' }]}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
                width: '100%',
              }}
            >
              <Text style={{ color: colors.textDark, fontSize: 18, fontWeight: '700' }}>Device Nickname</Text>
              <TouchableOpacity onPress={() => setShowNicknameModal(false)}>
                <X size={24} color={colors.gray} />
              </TouchableOpacity>
            </View>

            <Text style={{ color: colors.gray, fontSize: 13, marginBottom: 20, textAlign: 'left', width: '100%', lineHeight: 18 }}>
              Give your device a friendly name. This is stored locally on your phone.
            </Text>

            <InputField
              placeholder="Enter device nickname"
              value={nicknameInput}
              onChangeText={setNicknameInput}
              autoFocus
              containerStyle={{ width: '100%', marginBottom: 24 }}
            />

            <MainButton title="Save Name" onPress={handleSaveNickname} style={{ width: '100%' }} />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    width: '100%',
    borderBottomWidth: 1,
  },
  headerTitle: {
    letterSpacing: 0.5,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statusText: {
    flex: 1,
    marginLeft: 12,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusDesc: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  connectedCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  connectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  connectedTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  multiDeviceText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  activeHubHint: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 28,
    marginBottom: 10,
  },
  activeHubBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  gpsInfo: {
    marginBottom: 16,
    marginLeft: 28,
  },
  gpsLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  gpsValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  listSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 16,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 24,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
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
    fontWeight: '600',
  },
  deviceAddress: {
    fontSize: 12,
    marginTop: 4,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  connectedText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  tapToConnect: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
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
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
  connectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  connectingModal: {
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  connectingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
  },
  diagnosticsModal: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  diagnosticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  diagnosticsScroll: {
    borderWidth: 1,
    borderRadius: 12,
    maxHeight: 380,
  },
  diagnosticsActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  diagnosticsActionBtn: {
    minWidth: 86,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    marginLeft: 8,
  },
});

export default DeviceConnectionScreen;
