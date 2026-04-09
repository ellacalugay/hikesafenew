import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator,
  StyleSheet,
  Modal,
  TextInput,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Bluetooth, BluetoothOff, Radio, Check, RefreshCw, Edit2, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';

const DeviceConnectionScreen = ({ onBack }) => {
  const { colors } = useTheme();
  const {
    isEnabled,
    isScanning,
    isConnecting,
    isConnected,
    connectedDevice,
    connectedDevicesList,
    availableDevices,
    myLocation,
    connectedDevicesCount,
    requestEnable,
    scanForDevices,
    connectToDevice,
    disconnect,
    disconnectFromDevice,
  } = useBluetoothDevice();
  const { deviceNickname, setDeviceNickname } = useLobby();
  
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');

  useEffect(() => {
    if (isEnabled && connectedDevicesList.length === 0) {
      scanForDevices();
    }
  }, [isEnabled, connectedDevicesList.length, scanForDevices]);

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
  
  const handleEditNickname = () => {
    setNicknameInput(deviceNickname || connectedDevice?.name || '');
    setShowNicknameModal(true);
  };
  
  const handleSaveNickname = async () => {
    if (nicknameInput.trim()) {
      await setDeviceNickname(nicknameInput.trim());
    }
    setShowNicknameModal(false);
  };
  
  // Get display name for connected device
  const getDeviceDisplayName = () => {
    if (deviceNickname) {
      return deviceNickname;
    }
    return connectedDevice?.name || 'Unknown Device';
  };

  const renderDevice = ({ item }) => {
    const isConnectedToDevice = connectedDevicesList.some(d => d.id === item.id);
    
    return (
      <TouchableOpacity
        style={[
          styles.deviceItem,
          { 
            backgroundColor: colors.cardBg,
            borderColor: isConnectedToDevice ? colors.primary : colors.borderColor,
            borderWidth: isConnectedToDevice ? 2 : 1,
          }
        ]}
        onPress={() => handleDevicePress(item)}
        disabled={isConnecting}
      >
        <View style={styles.deviceInfo}>
          <Radio size={24} color={isConnectedToDevice ? colors.primary : colors.gray} />
          <View style={styles.deviceText}>
            <Text style={[styles.deviceName, { color: colors.textDark }]}>
              {item.name || 'Unknown Device'}
            </Text>
            <Text style={[styles.deviceAddress, { color: colors.gray }]}>
              {item.address || item.id}
            </Text>
          </View>
        </View>
        
        {isConnecting && !isConnectedToDevice ? null : (
          isConnectedToDevice && isConnected ? (
            <View style={[styles.connectedBadge, { backgroundColor: colors.primary }]}>
              <Check size={16} color="#fff" />
              <Text style={styles.connectedText}>Connected</Text>
            </View>
          ) : (
            <Text style={[styles.tapToConnect, { color: colors.gray }]}>Tap to {isConnectedToDevice ? 'disconnect' : 'connect'}</Text>
          )
        )}
      </TouchableOpacity>
    );
  };
        
        {isConnecting && !isCurrentDevice ? null : (
          isCurrentDevice && isConnected ? (
            <View style={[styles.connectedBadge, { backgroundColor: colors.primary }]}>
              <Check size={16} color="#fff" />
              <Text style={styles.connectedText}>Connected</Text>
            </View>
          ) : (
            <Text style={[styles.tapToConnect, { color: colors.gray }]}>Tap to connect</Text>
          )
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textDark }]}>Device Connection</Text>
        <TouchableOpacity 
          onPress={scanForDevices} 
          disabled={isScanning || !isEnabled}
          style={styles.refreshButton}
        >
          <RefreshCw size={22} color={isEnabled ? colors.primary : colors.gray} />
        </TouchableOpacity>
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
              ? 'Ready to connect to SOS devices' 
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
      </View>

      {/* Connected Devices Info - MULTI-DEVICE SUPPORT */}
      {isConnected && connectedDevicesList.length > 0 && (
        <View style={[styles.connectedCard, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <View style={styles.connectedHeader}>
            <Radio size={20} color={colors.textLight} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.connectedTitle, { color: colors.textLight }]}>
                Connected to {connectedDevicesList.length} device{connectedDevicesList.length > 1 ? 's' : ''}
              </Text>
              {connectedDevicesCount > 0 && (
                <Text style={[styles.multiDeviceText, { color: colors.textLight, opacity: 0.9 }]}>
                  {connectedDevicesCount} phone{connectedDevicesCount > 1 ? 's' : ''} on LoRa
                </Text>
              )}
            </View>
          </View>

          {/* List of connected devices */}
          <View style={{ marginLeft: 28, marginBottom: 12 }}>
            {connectedDevicesList.map((device, idx) => (
              <View key={device.id} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: colors.textLight, fontSize: 13 }}>
                    {device.name || 'Device'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => disconnectFromDevice(device.id)}
                    style={{ padding: 4 }}
                  >
                    <X size={16} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
          
          {/* GPS Info from first connected device */}
          <View style={styles.gpsInfo}>
            <Text style={[styles.gpsLabel, { color: colors.textLight }]}>GPS Status:</Text>
            {myLocation.valid ? (
              <View>
                <Text style={[styles.gpsValue, { color: colors.textLight }]}>
                  {myLocation.lat.toFixed(6)}, {myLocation.lng.toFixed(6)}
                </Text>
                <Text style={[styles.gpsValue, { color: colors.textLight, opacity: 0.9 }]}>
                  Satellites: {myLocation.satellites}
                </Text>
              </View>
            ) : (
              <Text style={[styles.gpsValue, { color: colors.textLight, opacity: 0.9 }]}>
                Waiting for GPS fix... ({myLocation.satellites} sats)
              </Text>
            )}
          </View>
          
          <TouchableOpacity
            style={[styles.disconnectButton, { borderColor: colors.accent }]}
            onPress={disconnect}
          >
            <Text style={[styles.disconnectText, { color: colors.accent }]}>Disconnect All</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Device List */}
      <View style={styles.listSection}>
        <Text style={[styles.sectionTitle, { color: colors.textDark }]}>
          Available Devices
        </Text>
        <Text style={[styles.sectionSubtitle, { color: colors.gray }]}>
          HikeSafe devices within range will appear automatically
        </Text>
        
        {isScanning ? (
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
              <View style={styles.emptyContainer}>
                <BluetoothOff size={48} color={colors.gray} />
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
      
      {/* Device Nickname Modal */}
      <Modal
        visible={showNicknameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNicknameModal(false)}
      >
        <View style={styles.connectingOverlay}>
          <View style={[styles.connectingModal, { backgroundColor: colors.modalBg, padding: 20 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ color: colors.textDark, fontSize: 18, fontWeight: '600' }}>Device Nickname</Text>
              <TouchableOpacity onPress={() => setShowNicknameModal(false)}>
                <X size={24} color={colors.gray} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.gray, fontSize: 12, marginBottom: 12 }}>
              Give your device a friendly name. This is stored locally on your phone.
            </Text>
            <TextInput
              style={{
                backgroundColor: colors.cardBg,
                borderWidth: 1,
                borderColor: colors.borderColor,
                borderRadius: 8,
                padding: 12,
                color: colors.textDark,
                fontSize: 16,
                marginBottom: 16,
              }}
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="Enter device nickname"
              placeholderTextColor={colors.gray}
              autoFocus
            />
            <TouchableOpacity
              style={{
                backgroundColor: colors.primary,
                padding: 14,
                borderRadius: 8,
                alignItems: 'center',
              }}
              onPress={handleSaveNickname}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  },
  refreshButton: {
    padding: 8,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
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
    marginTop: 0,
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
  multiDeviceText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    marginLeft: 8,
  },
  gpsInfo: {
    marginBottom: 12,
  },
  gpsLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  gpsValue: {
    fontSize: 13,
  },
  disconnectButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  disconnectText: {
    fontWeight: '600',
  },
  listSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 16,
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
    paddingVertical: 40,
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

export default DeviceConnectionScreen;
