import { BleManager } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';
import { Buffer } from 'buffer';

const SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
const TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

// Device name prefix for filtering HikeSafe devices
const DEVICE_NAME_PREFIX = 'HikeSafe_';

// Commands (sent from app to device)
const CMD_APP_START = 1;
const CMD_SEND_TXT_MSG = 2;
const CMD_SEND_CHANNEL_TXT_MSG = 3;
const CMD_SYNC_NEXT_MESSAGE = 10; // Request next queued message from device
const CMD_DEVICE_QUERY = 22;
const CMD_SET_CHANNEL = 32; // Set channel at specific index: [idx][name(32)][secret(16)]
const CMD_SET_PROFILE = 44;
const CMD_GET_PROFILE = 45;
const CMD_CREATE_LOBBY = 46;
const CMD_JOIN_LOBBY = 47;
const CMD_SET_DEVICE_GPS = 48;
const CMD_GET_DISCOVERED_LOBBIES = 49;

// Fixed channel indices - MUST match on all devices for messaging to work
const PRIMARY_LOBBY_CHANNEL_IDX = 1; // User lobbies always use index 1
const DISCOVERY_CHANNEL_IDX = 7;     // Discovery channel uses index 7

// Response codes (device to app replies)
const RESP_CODE_OK = 0;
const RESP_CODE_ERR = 1;
const RESP_CODE_CONTACTS_START = 2;
const RESP_CODE_CONTACT = 3;
const RESP_CODE_END_OF_CONTACTS = 4;
const RESP_CODE_SELF_INFO = 5;
const RESP_CODE_SENT = 6;
const RESP_CODE_CONTACT_MSG_RECV = 7;
const RESP_CODE_CHANNEL_MSG_RECV = 8;
const RESP_CODE_CURR_TIME = 9;
const RESP_CODE_NO_MORE_MESSAGES = 10;
const RESP_CODE_EXPORT_CONTACT = 11;
const RESP_CODE_BATT_AND_STORAGE = 12;
const RESP_CODE_DEVICE_INFO = 13;
const RESP_CODE_PRIVATE_KEY = 14;
const RESP_CODE_DISABLED = 15;
const RESP_CODE_CONTACT_MSG_RECV_V3 = 16;
const RESP_CODE_CHANNEL_MSG_RECV_V3 = 17;
const RESP_CODE_CHANNEL_INFO = 18;
const RESP_CODE_DISCOVERED_LOBBY = 25;

// Push codes (device to app async notifications)
const PUSH_CODE_ADVERT = 0x80;
const PUSH_CODE_PATH_UPDATED = 0x81;
const PUSH_CODE_SEND_CONFIRMED = 0x82;
const PUSH_CODE_MSG_WAITING = 0x83;
const PUSH_CODE_RAW_DATA = 0x84;
const PUSH_CODE_LOGIN_SUCCESS = 0x85;
const PUSH_CODE_LOGIN_FAIL = 0x86;
const PUSH_CODE_STATUS_RESPONSE = 0x87;
const PUSH_CODE_LOG_RX_DATA = 0x88;
const PUSH_CODE_NEW_ADVERT = 0x8A;

// Export constants for use in App.js
export const BLE_CODES = {
  // Response codes
  RESP_CODE_OK,
  RESP_CODE_ERR,
  RESP_CODE_CONTACTS_START,
  RESP_CODE_CONTACT,
  RESP_CODE_END_OF_CONTACTS,
  RESP_CODE_SELF_INFO,
  RESP_CODE_SENT,
  RESP_CODE_CONTACT_MSG_RECV,
  RESP_CODE_CHANNEL_MSG_RECV,
  RESP_CODE_CONTACT_MSG_RECV_V3,
  RESP_CODE_CHANNEL_MSG_RECV_V3,
  RESP_CODE_CHANNEL_INFO,
  RESP_CODE_DEVICE_INFO,
  RESP_CODE_BATT_AND_STORAGE,
  RESP_CODE_NO_MORE_MESSAGES,
  // Push codes
  PUSH_CODE_ADVERT,
  PUSH_CODE_MSG_WAITING,
  PUSH_CODE_NEW_ADVERT,
  PUSH_CODE_SEND_CONFIRMED,
  PUSH_CODE_LOGIN_SUCCESS,
};

class BleService {
  constructor() {
    this.manager = new BleManager();
    this.device = null;
    this.monitor = null;
    this.connected = false;
    this.useFraming = true;
    this.messageListeners = []; // Array of message listener callbacks
    this.onDeviceDisconnected = null; // Callback for disconnect
    this.rxBuffer = Buffer.alloc(0); // Buffer for incoming framed data
    this.channels = {}; // map channelName -> { channelIdx, secret: [bytes] }
    // Channel indices are now fixed module-level constants:
    // PRIMARY_LOBBY_CHANNEL_IDX = 1 (user lobbies)
    // DISCOVERY_CHANNEL_IDX = 7 (discovery channel)
  }

  // Assign a channel index locally.
  // Uses fixed indices for channels to ensure both devices agree.
  _assignChannelIdx(channelName, secret) {
    if (this.channels[channelName]) {
      // Already assigned
      return this.channels[channelName].channelIdx;
    }
    
    let idx;
    if (channelName === BleService.DISCOVERY_CHANNEL) {
      idx = DISCOVERY_CHANNEL_IDX;
    } else {
      // All user lobbies use the same fixed index
      idx = PRIMARY_LOBBY_CHANNEL_IDX;
    }
    
    this.channels[channelName] = { channelIdx: idx, secret: secret || [] };
    console.log('BLE: assigned channel index', idx, 'for', channelName);
    return idx;
  }

  // Set a channel at a specific index using CMD_SET_CHANNEL
  // This OVERWRITES whatever is at that index, ensuring both devices use the same slot
  // Format: [CMD_SET_CHANNEL][idx][name(32 bytes, null-padded)][secret(16 bytes)]
  async sendSetChannel(channelIdx, channelName, secret) {
    // Build 32-byte null-padded name
    const nameBytes = new Uint8Array(32);
    const nameB = this.utf8ToBytes(channelName);
    const copyLen = Math.min(nameB.length, 31); // leave room for null terminator
    nameBytes.set(nameB.slice(0, copyLen), 0);
    
    // Build 16-byte secret
    const secretBytes = new Uint8Array(16);
    for (let i = 0; i < 16 && i < secret.length; i++) {
      secretBytes[i] = secret[i];
    }
    
    // Total: 1 (cmd) + 1 (idx) + 32 (name) + 16 (secret) = 50 bytes
    const out = new Uint8Array(50);
    out[0] = CMD_SET_CHANNEL;
    out[1] = channelIdx & 0xff;
    out.set(nameBytes, 2);
    out.set(secretBytes, 34);
    
    console.log('BLE sendSetChannel: idx=', channelIdx, 'name=', channelName);
    const ok = await this.sendRawBytes(out, { requireResponse: true });
    
    if (ok) {
      // Store local mapping
      this.channels[channelName] = { channelIdx, secret: Array.from(secretBytes) };
      console.log('BLE: channel set at index', channelIdx, 'for', channelName);
    }
    return ok;
  }

  // Register a message listener
  onMessage(callback) {
    if (typeof callback === 'function' && !this.messageListeners.includes(callback)) {
      this.messageListeners.push(callback);
    }
  }

  // Remove a message listener
  offMessage(callback) {
    const idx = this.messageListeners.indexOf(callback);
    if (idx !== -1) {
      this.messageListeners.splice(idx, 1);
    }
  }

  // Notify all listeners of a message
  notifyListeners(code, data) {
    for (const listener of this.messageListeners) {
      try {
        listener(code, data);
      } catch (e) {
        console.log('BLE message listener error:', e);
      }
    }
  }

  async ensurePermissions() {
    if (Platform.OS === 'android') {
      try {
        // Build list of permissions based on Android version
        // Android 12+ (API 31+) requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
        // Older versions only need ACCESS_FINE_LOCATION
        const permissions = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
        
        // Only add BLE permissions if they exist (Android 12+)
        if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN) {
          permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
        }
        if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) {
          permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
        }

        console.log('Requesting BLE permissions:', permissions);
        const granted = await PermissionsAndroid.requestMultiple(permissions);
        console.log('Permission results:', JSON.stringify(granted));

        // Check that all requested permissions were granted
        const deniedPermissions = [];
        let hasNeverAskAgain = false;
        
        for (const perm of permissions) {
          const result = granted[perm];
          if (result !== undefined && result !== PermissionsAndroid.RESULTS.GRANTED) {
            console.log('Permission denied:', perm, result);
            deniedPermissions.push(perm);
            if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
              hasNeverAskAgain = true;
            }
          }
        }

        if (deniedPermissions.length > 0) {
          if (hasNeverAskAgain) {
            // User selected "Don't ask again" - must open settings manually
            this.showOpenSettingsAlert();
          }
          return false;
        }
        return true;
      } catch (e) {
        console.log('Permission request error:', e);
        return false;
      }
    }
    return true;
  }

  showOpenSettingsAlert() {
    Alert.alert(
      'Bluetooth Permission Required',
      'HikeSafe needs Bluetooth permission to scan for LoRa devices. Please enable "Nearby devices" permission in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Open Settings', 
          onPress: () => {
            Linking.openSettings().catch(() => {
              console.log('Could not open settings');
            });
          }
        }
      ]
    );
  }

  async waitForPoweredOn(timeoutMs = 5000) {
    // Ensure the BLE adapter is powered on before scanning
    return new Promise((resolve) => {
      try {
        const sub = this.manager.onStateChange((state) => {
          if (state === 'PoweredOn') {
            try { sub.remove(); } catch (e) {}
            resolve(true);
          }
        }, true);

        setTimeout(() => {
          try { sub.remove(); } catch (e) {}
          resolve(false);
        }, timeoutMs);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async scanOnce(timeoutMs = 8000) {
    console.log('=== BLE SCAN STARTING ===');
    console.log(`Looking for devices with prefix: "${DEVICE_NAME_PREFIX}"`);
    console.log(`Scan timeout: ${timeoutMs}ms`);
    
    const ok = await this.ensurePermissions();
    if (!ok) {
      console.log('BLE permissions not granted - scan aborted');
      return [];
    }
    console.log('BLE permissions OK');

    const powered = await this.waitForPoweredOn(4000);
    if (!powered) {
      console.log('WARNING: Bluetooth adapter not powered on (will try anyway)');
    } else {
      console.log('Bluetooth adapter is powered on');
    }

    return new Promise((resolve) => {
      const found = new Map();
      const allDeviceNames = new Set(); // Track all device names for debugging
      console.log('Starting device scan...');

      // Broad scan (no service UUID filter). Filter by device name prefix in JS.
      this.manager.startDeviceScan(null, null, (err, dev) => {
        if (err) {
          console.log('BLE scan error:', err.message || err);
          try { this.manager.stopDeviceScan(); } catch (e) {}
          resolve([]);
          return;
        }
        if (!dev) return;

        const name = dev.name || dev.localName || (dev && dev.advertisement && dev.advertisement.localName);
        
        // Log all devices with names for debugging
        if (name && !allDeviceNames.has(name)) {
          allDeviceNames.add(name);
          console.log(`BLE scan found: "${name}" (looking for prefix: "${DEVICE_NAME_PREFIX}")`);
        }
        
        if (name && name.startsWith(DEVICE_NAME_PREFIX)) {
          // dedupe by id
          if (!found.has(dev.id)) {
            // Try to extract lobby ID from manufacturer data
            let lobbyId = null;
            try {
              const mfgData = dev.manufacturerData;
              console.log('BLE device', name, 'manufacturerData:', mfgData);
              if (mfgData) {
                // Decode base64 manufacturer data
                const bytes = Buffer.from(mfgData, 'base64');
                console.log('BLE device', name, 'mfgData bytes:', Array.from(bytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                // Format: [0xFF, 0xFF, 'L', ':', ...lobbyId]
                if (bytes.length >= 4 && bytes[0] === 0xFF && bytes[1] === 0xFF) {
                  const str = bytes.slice(2).toString('utf8');
                  console.log('BLE device', name, 'mfgData string after company ID:', str);
                  if (str.startsWith('L:')) {
                    lobbyId = str.substring(2);
                    console.log('BLE device has lobby:', lobbyId);
                  }
                }
              }
            } catch (e) {
              console.log('BLE device', name, 'mfgData parse error:', e.message);
            }
            
            found.set(dev.id, {
              id: dev.id,
              name: name,
              rssi: dev.rssi,
              device: dev,
              lobbyId: lobbyId, // null if no lobby, or the lobby ID string
            });
            console.log('✓ HikeSafe device found:', name, dev.id, 'RSSI:', dev.rssi, lobbyId ? `(Lobby: ${lobbyId})` : '');
          }
        }
      });

      setTimeout(() => {
        try { this.manager.stopDeviceScan(); } catch (e) {}
        const results = Array.from(found.values());
        console.log('=== BLE SCAN COMPLETE ===');
        console.log(`Total devices scanned: ${allDeviceNames.size}`);
        console.log(`HikeSafe devices found: ${results.length}`);
        if (allDeviceNames.size > 0) {
          console.log('All device names seen:', Array.from(allDeviceNames).join(', '));
        }
        resolve(results);
      }, timeoutMs);
    });
  }

  async connectToDevice(deviceInfo) {
    if (!deviceInfo || !deviceInfo.device) return false;
    try {
      const d = await deviceInfo.device.connect();
      await d.discoverAllServicesAndCharacteristics();
      this.device = d;
      this.connected = true;
      
      // Start monitoring for incoming notifications (TX characteristic)
      this.startMonitoring();
      
      // Monitor for disconnection
      d.onDisconnected((error, device) => {
        this.connected = false;
        this.device = null;
        this.stopMessagePolling();
        if (this.monitor) {
          this.monitor.remove();
          this.monitor = null;
        }
        if (this.onDeviceDisconnected) {
          this.onDeviceDisconnected(error);
        }
      });
      
      return true;
    } catch (e) {
      console.log('BLE connect error:', e);
      return false;
    }
  }

  // Start periodic polling for queued messages (fallback for missed push notifications)
  startMessagePolling() {
    // Disabled auto-polling to avoid overfilling the device recv_queue
    // with CMD_SYNC_NEXT_MESSAGE frames. Polling is now driven by
    // PUSH_CODE_MSG_WAITING (0x83) and explicit calls from the app.
  }

  stopMessagePolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
      console.log('BLE: stopped message polling');
    }
  }

  startMonitoring() {
    if (!this.device) {
      console.log('BLE: startMonitoring - no device!');
      return;
    }
    
    console.log('BLE: setting up notification monitor for TX characteristic...');
    console.log('BLE: SERVICE_UUID =', SERVICE_UUID);
    console.log('BLE: TX_CHAR_UUID =', TX_CHAR_UUID);
    
    try {
      this.monitor = this.device.monitorCharacteristicForService(
        SERVICE_UUID,
        TX_CHAR_UUID,
        (error, characteristic) => {
          if (error) {
            console.log('BLE monitor callback error:', error.message || error);
            return;
          }
          if (characteristic && characteristic.value) {
            console.log('BLE: notification received!');
            const data = Buffer.from(characteristic.value, 'base64');
            this.handleIncomingData(data);
          } else {
            console.log('BLE: notification with no value?');
          }
        }
      );
      console.log('BLE: monitoring started successfully for incoming data');
    } catch (e) {
      console.log('BLE: startMonitoring error:', e.message || e);
    }
  }

  handleIncomingData(data) {
    // BLE interface sends RAW frames (no '>' framing like USB serial)
    // Each BLE notification is a complete frame
    const hexData = Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    console.log('BLE: incoming notification, len:', data.length, 'bytes:', hexData);
    
    // Process directly as a complete frame (no framing header on BLE)
    if (data.length > 0) {
      this.processFrame(data);
    }
  }

  processFrame(payload) {
    if (!payload || payload.length === 0) return;
    
    const code = payload[0];
    const data = payload.slice(1); // Data is everything after the code byte
    console.log('BLE received frame, code:', code, '(0x' + code.toString(16) + '), len:', payload.length);
    
    // Handle PUSH_CODE_MSG_WAITING - device has messages queued
    if (code === PUSH_CODE_MSG_WAITING) {
      console.log('BLE: MSG_WAITING (0x83) received, requesting queued message...');
      this.syncNextMessage();
      return;
    }
    
    // Track if this is a NO_MORE_MESSAGES response for sync flow
    if (code === RESP_CODE_NO_MORE_MESSAGES) {
      console.log('BLE: NO_MORE_MESSAGES (code 10) - queue is empty');
      // No more messages to fetch
    }
    
    // If we received an actual message (channel or contact), there might be more - request again
    if (code === RESP_CODE_CHANNEL_MSG_RECV || code === RESP_CODE_CHANNEL_MSG_RECV_V3 ||
        code === RESP_CODE_CONTACT_MSG_RECV || code === RESP_CODE_CONTACT_MSG_RECV_V3) {
      console.log('BLE: *** RECEIVED MESSAGE *** code:', code, 'data length:', data.length);
      // Try to extract the message text for logging
      try {
        let offset = 0;
        if (code === RESP_CODE_CHANNEL_MSG_RECV_V3 || code === RESP_CODE_CONTACT_MSG_RECV_V3) {
          offset = 3; // V3 has 3 extra header bytes
        }
        if (data.length > offset + 7) {
          const channelIdx = data[offset];
          const textBytes = data.slice(offset + 7);
          const msgText = Buffer.from(textBytes).toString('utf8');
          console.log('BLE: Message on channel', channelIdx, ':', msgText);
        }
      } catch (e) {
        console.log('BLE: could not parse message text:', e.message);
      }
      // Small delay then request next message
      setTimeout(() => this.syncNextMessage(), 100);
    }
    
    // Notify all registered listeners (this delivers messages to App.js)
    this.notifyListeners(code, data);

    // Internal: track channel info replies so we can send messages to channels by name
    try {
      if (code === RESP_CODE_CHANNEL_INFO && data && data.length >= 49) {
        const channelIdx = data[0];
        const channelName = Buffer.from(data.slice(1, 33)).toString('utf8').replace(/\0/g, '').trim();
        const channelSecret = Array.from(data.slice(33, 49));
        // Store mapping
        if (channelName && channelName.length > 0) {
          this.channels[channelName] = { channelIdx, secret: channelSecret };
          console.log('BLE: stored channel mapping for', channelName, '->', channelIdx);
        }
      }
    } catch (e) {
      console.log('BLE: error parsing channel info internally:', e.message || e);
    }
  }

  // Request a single queued message from device
  async syncNextMessage() {
    if (this._syncing || !this.connected) {
      return;
    }
    this._syncing = true;
    
    try {
      const cmd = new Uint8Array([CMD_SYNC_NEXT_MESSAGE]);
      // Use writeWithoutResponse for better performance (response comes via notification)
      await this.sendRawBytes(cmd, { requireResponse: false });
    } catch (e) {
      console.log('BLE syncNextMessage error:', e.message || e);
    }
    
    // Clear syncing flag after a delay to prevent rapid re-requests
    setTimeout(() => { this._syncing = false; }, 500);
  }

  disconnect() {
    this.stopMessagePolling();
    if (this.monitor) {
      this.monitor.remove();
      this.monitor = null;
    }
    if (this.device) {
      try {
        this.device.cancelConnection();
      } catch (e) {}
    }
    this.device = null;
    this.connected = false;
    this.rxBuffer = Buffer.alloc(0);
  }

  buildFramed(bytes) {
    const header = new Uint8Array(3);
    header[0] = 0x3c; // '<'
    const len = bytes.length;
    header[1] = len & 0xff;
    header[2] = (len >> 8) & 0xff;
    const out = new Uint8Array(3 + bytes.length);
    out.set(header, 0);
    out.set(bytes, 3);
    return out;
  }

  base64FromBytes(bytes) {
    return Buffer.from(bytes).toString('base64');
  }

  utf8ToBytes(s) {
    return new Uint8Array(Buffer.from(s, 'utf8'));
  }

  async ensureConnected() {
    if (this.connected && this.device) return true;
    const devices = await this.scanOnce(6000);
    if (devices.length === 0) return false;
    const ok = await this.connectToDevice(devices[0]);
    return ok;
  }

  async sendRawBytes(bytes, opts = { requireResponse: false }) {
    if (!(await this.ensureConnected())) {
      console.log('BLE sendRawBytes: ensureConnected failed');
      return false;
    }
    const payload = this.useFraming ? this.buildFramed(bytes) : bytes;
    const b64 = this.base64FromBytes(payload);
    
    console.log('BLE sendRawBytes: writing', bytes.length, 'bytes (framed:', payload.length, ')');
    console.log('BLE sendRawBytes: device id =', this.device?.id);
    console.log('BLE sendRawBytes: base64 =', b64);
    
    // If caller requires a response, skip the faster writeWithoutResponse
    // and use writeWithResponse (acknowledged) so we know the peripheral
    // processed the command. Otherwise try without-response first and
    // fall back to with-response on error.
    if (opts && opts.requireResponse) {
      try {
        console.log('BLE sendRawBytes: requireResponse=true, trying writeWithResponse...');
        const writePromise = this.manager.writeCharacteristicWithResponseForDevice(
          this.device.id, SERVICE_UUID, RX_CHAR_UUID, b64
        );
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Write timeout after 10s')), 10000)
        );
        await Promise.race([writePromise, timeoutPromise]);
        console.log('BLE sendRawBytes: writeWithResponse successful');
        return true;
      } catch (e) {
        console.log('BLE sendRawBytes writeWithResponse error:', e.message || e);
        return false;
      }
    }

    // Try write WITHOUT response first (faster, no waiting for ACK)
    try {
      console.log('BLE sendRawBytes: trying writeWithoutResponse...');
      await this.manager.writeCharacteristicWithoutResponseForDevice(
        this.device.id, SERVICE_UUID, RX_CHAR_UUID, b64
      );
      console.log('BLE sendRawBytes: writeWithoutResponse successful');
      return true;
    } catch (e1) {
      console.log('BLE sendRawBytes writeWithoutResponse error:', e1.message || e1);

      // Fallback to write WITH response
      try {
        console.log('BLE sendRawBytes: trying writeWithResponse...');

        const writePromise = this.manager.writeCharacteristicWithResponseForDevice(
          this.device.id, SERVICE_UUID, RX_CHAR_UUID, b64
        );

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Write timeout after 10s')), 10000)
        );

        await Promise.race([writePromise, timeoutPromise]);
        console.log('BLE sendRawBytes: writeWithResponse successful');
        return true;
      } catch (e2) {
        const errorMsg = e2.message || String(e2);
        console.log('BLE sendRawBytes writeWithResponse error:', errorMsg);
        return false;
      }
    }
  }

  async sendCreateLobby(lobbyId, psk = '', name = '') {
    console.log('BLE sendCreateLobby called:', { lobbyId, psk, name });
    const nameB = this.utf8ToBytes(name);
    const pskB = this.utf8ToBytes(psk);
    const lobbyB = this.utf8ToBytes(lobbyId);
    const total = 1 + 1 + nameB.length + 1 + pskB.length + 1 + lobbyB.length;
    const out = new Uint8Array(total);
    let o = 0;
    out[o++] = CMD_CREATE_LOBBY;
    out[o++] = nameB.length & 0xff;
    out.set(nameB, o); o += nameB.length;
    out[o++] = pskB.length & 0xff;
    out.set(pskB, o); o += pskB.length;
    out[o++] = lobbyB.length & 0xff;
    out.set(lobbyB, o);
    console.log('BLE sendCreateLobby: packet built, sending...');
    const result = await this.sendRawBytes(out, { requireResponse: true });
    console.log('BLE sendCreateLobby: result =', result);
    return result;
  }

  async sendProfile(profileObj) {
    // profileObj is a JS object, encode as JSON UTF-8 bytes and send with CMD_SET_PROFILE
    try {
      const json = JSON.stringify(profileObj);
      const bytes = this.utf8ToBytes(json);
      const out = new Uint8Array(1 + bytes.length);
      out[0] = CMD_SET_PROFILE;
      out.set(bytes, 1);
      return await this.sendRawBytes(out);
    } catch (e) {
      return false;
    }
  }

  // Join lobby by lobby ID (requires lobby ID to be pre-stored on device)
  async sendJoinLobbyById(lobbyId) {
    const lobbyB = this.utf8ToBytes(lobbyId);
    const out = new Uint8Array(2 + lobbyB.length);
    out[0] = CMD_JOIN_LOBBY;
    out[1] = 0xFE; // join by lobby ID
    out.set(lobbyB, 2);
    return await this.sendRawBytes(out, { requireResponse: true });
  }

  // Join lobby by channel name and secret (works without pre-stored data!)
  // This is the recommended method for joining lobbies on new devices
  // channelName: string (max 32 chars)
  // channelSecret: Uint8Array or array of 16 bytes
  async sendJoinLobbyWithSecret(channelName, channelSecret) {
    if (!channelSecret || channelSecret.length !== 16) {
      console.log('BLE sendJoinLobbyWithSecret: invalid secret (must be 16 bytes)');
      return false;
    }
    const nameB = this.utf8ToBytes(channelName);
    // Format: [CMD_JOIN_LOBBY][0xFF][name_len][name...][16-byte secret]
    const out = new Uint8Array(2 + 1 + nameB.length + 16);
    let o = 0;
    out[o++] = CMD_JOIN_LOBBY;
    out[o++] = 0xFF; // special: add new channel with secret
    out[o++] = nameB.length & 0xff;
    out.set(nameB, o); o += nameB.length;
    out.set(new Uint8Array(channelSecret), o);
    console.log('BLE sendJoinLobbyWithSecret: joining channel', channelName);
    const ok = await this.sendRawBytes(out, { requireResponse: true });
    if (!ok) return false;

    // Assign a local channel index so we can send messages on this channel.
    // We no longer wait for RESP_CODE_CHANNEL_INFO since firmware may not emit it.
    this._assignChannelIdx(channelName, Array.from(channelSecret));
    return true;
  }

  // Derive a 16-byte secret from lobby name + PIN
  // This allows both devices to compute the same secret from the same inputs
  // Uses a simple but consistent hash - no external crypto library needed
  deriveSecretFromPin(lobbyName, pin) {
    const input = `${lobbyName}:${pin}:hikesafe`;
    console.log('BLE deriveSecretFromPin input string:', input);
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    // Generate 16 bytes from multiple hash iterations
    const bytes = [];
    for (let i = 0; i < 16; i++) {
      hash = Math.imul(hash, 0x01000193) ^ i;
      bytes.push(Math.abs(hash) & 0xff);
    }
    const secretHex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    console.log('BLE derived secret (hex):', secretHex);
    return bytes;
  }

  // Generate a random 6-digit PIN
  generatePin() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // Join lobby using lobby name + PIN (user-friendly!)
  // Uses CMD_SET_CHANNEL to force the channel to a fixed index, ensuring both devices match
  async sendJoinLobbyWithPin(lobbyName, pin) {
    const secret = this.deriveSecretFromPin(lobbyName, pin);
    console.log('BLE joining lobby with PIN:', lobbyName, 'pin:', pin);
    console.log('BLE: using fixed channel index', PRIMARY_LOBBY_CHANNEL_IDX);
    
    // Use CMD_SET_CHANNEL to set the channel at a FIXED index
    // This ensures both creator and joiner use the same channel slot
    return await this.sendSetChannel(PRIMARY_LOBBY_CHANNEL_IDX, lobbyName, secret);
  }

  // Create lobby with a generated PIN (returns the PIN for sharing)
  // This creates the channel on the device AND sets the BLE advertisement for discovery
  async sendCreateLobbyWithPin(lobbyName, lobbyId) {
    const pin = this.generatePin();
    // Use the Lobby ID (group ID) as the canonical name for deriving the secret
    // This keeps create/join consistent: both use the same Group ID + PIN
    const secret = this.deriveSecretFromPin(lobbyId, pin);
    
    console.log('BLE creating lobby:', { lobbyName, lobbyId, pin });
    console.log('BLE: using fixed channel index', PRIMARY_LOBBY_CHANNEL_IDX);
    
    // Step 1: Set the channel at a FIXED index using CMD_SET_CHANNEL
    // This ensures both creator and joiner use the same channel slot (index 1)
    const channelSet = await this.sendSetChannel(PRIMARY_LOBBY_CHANNEL_IDX, lobbyId, secret);
    if (!channelSet) {
      console.log('BLE: failed to set channel');
      return null;
    }
    
    // Step 2: Also send CMD_CREATE_LOBBY to set up the BLE advertisement with lobby ID
    // This allows other devices to discover this lobby via BLE scanning
    const nameB = this.utf8ToBytes(lobbyName);
    const lobbyB = this.utf8ToBytes(lobbyId);
    const pskB = this.utf8ToBytes(pin);
    
    const out = new Uint8Array(1 + 1 + nameB.length + 1 + pskB.length + 1 + lobbyB.length);
    let o = 0;
    out[o++] = CMD_CREATE_LOBBY;
    out[o++] = nameB.length & 0xff;
    out.set(nameB, o); o += nameB.length;
    out[o++] = pskB.length & 0xff;
    out.set(pskB, o); o += pskB.length;
    out[o++] = lobbyB.length & 0xff;
    out.set(lobbyB, o);
    
    console.log('BLE CMD_CREATE_LOBBY packet built, sending (for BLE advertisement)...');
    const created = await this.sendRawBytes(out, { requireResponse: true });
    console.log('BLE CMD_CREATE_LOBBY result:', created);
    
    // Return the PIN even if CMD_CREATE_LOBBY fails (channel is already set)
    // The main function is the channel setup; CMD_CREATE_LOBBY is just for BLE discovery
    return pin;
  }

  async sendText(dest, text) {
    const textB = this.utf8ToBytes(text);
    const out = new Uint8Array(2 + textB.length);
    out[0] = CMD_SEND_TXT_MSG;
    out[1] = dest & 0xff;
    out.set(textB, 2);
    return await this.sendRawBytes(out);
  }

  // Send a message to a channel by index (broadcast to all on that channel)
  // channelIdx: 0-7 (the channel slot on the device)
  // Firmware expects: [CMD][txt_type][channel_idx][4-byte timestamp][text...]
  async sendChannelTextByIndex(channelIdx, text, opts = { requireResponse: false }) {
    const textB = this.utf8ToBytes(text);
    const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp
    
    // Format: [CMD][txt_type=0][channel_idx][timestamp 4 bytes][text...]
    const out = new Uint8Array(1 + 1 + 1 + 4 + textB.length);
    let o = 0;
    out[o++] = CMD_SEND_CHANNEL_TXT_MSG;
    out[o++] = 0; // TXT_TYPE_PLAIN = 0
    out[o++] = channelIdx & 0xff;
    // Little-endian timestamp
    out[o++] = timestamp & 0xff;
    out[o++] = (timestamp >> 8) & 0xff;
    out[o++] = (timestamp >> 16) & 0xff;
    out[o++] = (timestamp >> 24) & 0xff;
    out.set(textB, o);
    
    console.log('BLE sendChannelTextByIndex:', { channelIdx, text, timestamp });
    return await this.sendRawBytes(out, opts);
  }

  // Send a message to a channel by name
  // Uses fixed channel indices to ensure messages go to the correct channel
  async sendChannelText(channelName, text, opts = { requireResponse: false }) {
    let idx;
    
    if (channelName === BleService.DISCOVERY_CHANNEL) {
      idx = DISCOVERY_CHANNEL_IDX;
      console.log('BLE sendChannelText: sending to discovery channel (index', idx, ')');
    } else {
      // All user lobbies use the fixed primary lobby index
      idx = PRIMARY_LOBBY_CHANNEL_IDX;
      console.log('BLE sendChannelText: sending to primary lobby (index', idx, ') name=', channelName);
    }
    
    return await this.sendChannelTextByIndex(idx, text, opts);
  }

  // Get lobbies discovered over LoRa radio (deprecated)
  // Firmware no longer stores discovered lobbies; use live discovery instead.
  async getDiscoveredLobbies() {
    console.log('BLE getDiscoveredLobbies: deprecated - use live discovery via requestNearbyLobbies/joinDiscoveryChannel');
    return [];
  }

  async sendGPS(lat, lon) {
    // convert to microdegrees (int32)
    try {
      const latInt = Math.round(lat * 1e6);
      const lonInt = Math.round(lon * 1e6);
      const out = new Uint8Array(1 + 4 + 4);
      out[0] = CMD_SET_DEVICE_GPS;
      // little-endian int32
      out[1] = latInt & 0xff;
      out[2] = (latInt >> 8) & 0xff;
      out[3] = (latInt >> 16) & 0xff;
      out[4] = (latInt >> 24) & 0xff;
      out[5] = lonInt & 0xff;
      out[6] = (lonInt >> 8) & 0xff;
      out[7] = (lonInt >> 16) & 0xff;
      out[8] = (lonInt >> 24) & 0xff;
      return await this.sendRawBytes(out);
    } catch (e) {
      return false;
    }
  }

  async queryDevice() {
    // Send CMD_DEVICE_QUERY (1) to get self info
    const CMD_DEVICE_QUERY = 1;
    const out = new Uint8Array([CMD_DEVICE_QUERY]);
    return await this.sendRawBytes(out);
  }

  // Send and wait for specific response type
  async sendAndWaitFor(bytes, expectedRespCode, timeoutMs = 5000) {
    return new Promise(async (resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.offMessage(handler);
          resolve(null);
        }
      }, timeoutMs);

      const handler = (code, data) => {
        if (code === expectedRespCode && !resolved) {
          resolved = true;
          clearTimeout(timer);
          this.offMessage(handler);
          resolve({ code, data });
        }
      };

      this.onMessage(handler);
      const sent = await this.sendRawBytes(bytes);
      if (!sent && !resolved) {
        resolved = true;
        clearTimeout(timer);
        this.offMessage(handler);
        resolve(null);
      }
    });
  }

  // Get device info and wait for response
  async getDeviceInfo() {
    const CMD_DEVICE_QUERY = 1;
    const resp = await this.sendAndWaitFor(new Uint8Array([CMD_DEVICE_QUERY]), RESP_CODE_SELF_INFO, 5000);
    if (resp && resp.data) {
      try {
        const json = Buffer.from(resp.data).toString('utf8');
        return JSON.parse(json);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // Query all contacts from the device
  async queryContacts() {
    // CMD_GET_CONTACTS = 7
    const CMD_GET_CONTACTS = 7;
    const out = new Uint8Array([CMD_GET_CONTACTS]);
    return await this.sendRawBytes(out);
  }

  // Query battery and storage status
  async queryBatteryStatus() {
    // CMD_STATUS_REQ = 20
    const CMD_STATUS_REQ = 20;
    const out = new Uint8Array([CMD_STATUS_REQ]);
    return await this.sendRawBytes(out);
  }

  isConnected() {
    return this.connected && this.device !== null;
  }

  getDeviceName() {
    return this.device ? this.device.name : null;
  }

  // ==================== LOBBY DISCOVERY SYSTEM ====================
  // This allows LoRa devices to broadcast and discover nearby lobbies
  
  // Global discovery channel name - all devices listen on this
  static DISCOVERY_CHANNEL = '__HIKESAFE_DISCOVERY__';
  static DISCOVERY_SECRET = new Uint8Array([0x48, 0x69, 0x6B, 0x65, 0x53, 0x61, 0x66, 0x65, 0x44, 0x69, 0x73, 0x63, 0x6F, 0x76, 0x65, 0x72]); // "HikeSafeDiscover"
  
  // Join the global discovery channel to listen for lobby broadcasts
  // Uses CMD_SET_CHANNEL with fixed index to ensure all devices use the same slot
  async joinDiscoveryChannel() {
    console.log('BLE: Joining global discovery channel at index', DISCOVERY_CHANNEL_IDX);
    return await this.sendSetChannel(
      DISCOVERY_CHANNEL_IDX,
      BleService.DISCOVERY_CHANNEL, 
      Array.from(BleService.DISCOVERY_SECRET)
    );
  }
  
  // Broadcast lobby existence on discovery channel
  // Format: LOBBY_ANNOUNCE:<lobbyName>:<creatorName>:<memberCount>
  async broadcastLobby(lobbyName, creatorName, memberCount = 1) {
    const message = `LOBBY_ANNOUNCE:${lobbyName}:${creatorName}:${memberCount}`;
    console.log('BLE: Broadcasting lobby:', message);
    return await this.sendChannelText(BleService.DISCOVERY_CHANNEL, message);
  }
  
  // Request nearby lobbies (other devices will respond)
  // Format: LOBBY_SCAN_REQUEST:<requesterName>
  async requestNearbyLobbies(requesterName) {
    const message = `LOBBY_SCAN_REQUEST:${requesterName}`;
    console.log('BLE: Requesting nearby lobbies...');
    return await this.sendChannelText(BleService.DISCOVERY_CHANNEL, message);
  }
  
  // Respond to lobby scan request
  // Format: LOBBY_SCAN_RESPONSE:<lobbyName>:<creatorName>:<memberCount>
  async respondToLobbyScan(lobbyName, creatorName, memberCount = 1) {
    const message = `LOBBY_SCAN_RESPONSE:${lobbyName}:${creatorName}:${memberCount}`;
    console.log('BLE: Responding to lobby scan:', message);
    return await this.sendChannelText(BleService.DISCOVERY_CHANNEL, message);
  }
  
  // Parse incoming discovery messages
  // Returns { type: 'ANNOUNCE'|'SCAN_REQUEST'|'SCAN_RESPONSE', lobbyName, creatorName, memberCount }
  parseDiscoveryMessage(text) {
    if (!text || typeof text !== 'string') return null;
    // Support multiple discovery formats:
    // 1) Legacy: "LOBBY_ANNOUNCE:<lobbyName>:<creatorName>:<memberCount>"
    // 2) Simple firmware announce: "LOBBY:<lobbyId>|<creatorName>"
    // 3) Scan request/response formats used by other clients
    const parts = text.split(':');
    if (parts.length >= 1) {
      const msgType = parts[0];

      if (msgType === 'LOBBY_ANNOUNCE' && parts.length >= 4) {
        return {
          type: 'ANNOUNCE',
          lobbyName: parts[1],
          creatorName: parts[2],
          memberCount: parseInt(parts[3]) || 1,
        };
      }

      if (msgType === 'LOBBY_SCAN_REQUEST' && parts.length >= 2) {
        return {
          type: 'SCAN_REQUEST',
          requesterName: parts[1],
        };
      }

      if (msgType === 'LOBBY_SCAN_RESPONSE' && parts.length >= 4) {
        return {
          type: 'SCAN_RESPONSE',
          lobbyName: parts[1],
          creatorName: parts[2],
          memberCount: parseInt(parts[3]) || 1,
        };
      }
    }

    // Simple firmware announcement format: "LOBBY:<lobbyId>|<creatorName>"
    if (text.startsWith('LOBBY:')) {
      try {
        const rest = text.substring('LOBBY:'.length);
        const sep = rest.indexOf('|');
        let lobbyName = rest;
        let creatorName = '';
        if (sep !== -1) {
          lobbyName = rest.substring(0, sep);
          creatorName = rest.substring(sep + 1);
        }
        return {
          type: 'ANNOUNCE',
          lobbyName: lobbyName || '',
          creatorName: creatorName || '',
          memberCount: 1,
        };
      } catch (e) {
        return null;
      }
    }

    return null;
  }
  
  // Check if a message is from the discovery channel
  isDiscoveryChannelMessage(channelName) {
    return channelName === BleService.DISCOVERY_CHANNEL;
  }

}

const bleService = new BleService();
export default bleService;
