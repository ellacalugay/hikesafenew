import { BleManager } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
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
const CMD_DEVICE_QUERY = 22;
const CMD_SET_PROFILE = 44;
const CMD_GET_PROFILE = 45;
const CMD_CREATE_LOBBY = 46;
const CMD_JOIN_LOBBY = 47;
const CMD_SET_DEVICE_GPS = 48;

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
  RESP_CODE_SELF_INFO,
  RESP_CODE_CONTACT,
  RESP_CODE_SENT,
  RESP_CODE_CONTACT_MSG_RECV,
  RESP_CODE_CONTACT_MSG_RECV_V3,
  RESP_CODE_CHANNEL_MSG_RECV,
  RESP_CODE_CHANNEL_MSG_RECV_V3,
  PUSH_CODE_MSG_WAITING,
  PUSH_CODE_NEW_ADVERT,
  PUSH_CODE_SEND_CONFIRMED,
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
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        return true;
      } catch (e) {
        return false;
      }
    }
    return true;
  }

  async scanOnce(timeoutMs = 8000) {
    await this.ensurePermissions();
    return new Promise((resolve) => {
      const found = new Map();
      this.manager.startDeviceScan([SERVICE_UUID], null, (err, dev) => {
        if (err) {
          this.manager.stopDeviceScan();
          resolve([]);
          return;
        }
        if (!dev) return;
        // Filter to only HikeSafe devices
        if (dev.name && dev.name.startsWith(DEVICE_NAME_PREFIX)) {
          found.set(dev.id, {
            id: dev.id,
            name: dev.name,
            rssi: dev.rssi,
            device: dev,
          });
        }
      });
      setTimeout(() => {
        try { this.manager.stopDeviceScan(); } catch {}
        resolve(Array.from(found.values()));
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

  startMonitoring() {
    if (!this.device) return;
    
    this.monitor = this.device.monitorCharacteristicForService(
      SERVICE_UUID,
      TX_CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          console.log('BLE monitor error:', error);
          return;
        }
        if (characteristic && characteristic.value) {
          const data = Buffer.from(characteristic.value, 'base64');
          this.handleIncomingData(data);
        }
      }
    );
  }

  handleIncomingData(data) {
    // Device sends frames prefixed with '>' (0x3E) then LEN LSB, LEN MSB, then payload
    this.rxBuffer = Buffer.concat([this.rxBuffer, data]);
    
    while (true) {
      const idx = this.rxBuffer.indexOf(0x3E); // '>'
      if (idx === -1) {
        if (this.rxBuffer.length > 256) this.rxBuffer = Buffer.alloc(0);
        return;
      }
      if (idx > 0) this.rxBuffer = this.rxBuffer.slice(idx);
      if (this.rxBuffer.length < 3) return;
      
      const len = this.rxBuffer[1] | (this.rxBuffer[2] << 8);
      const totalNeeded = 3 + len;
      if (this.rxBuffer.length < totalNeeded) return;
      
      const payload = this.rxBuffer.slice(3, 3 + len);
      this.processFrame(payload);
      this.rxBuffer = this.rxBuffer.slice(totalNeeded);
    }
  }

  processFrame(payload) {
    if (!payload || payload.length === 0) return;
    
    const code = payload[0];
    const data = payload.slice(1); // Data is everything after the code byte
    console.log('BLE received frame, code:', code, 'len:', payload.length);
    
    // Notify all registered listeners
    this.notifyListeners(code, data);
  }

  disconnect() {
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

  async sendRawBytes(bytes) {
    if (!(await this.ensureConnected())) return false;
    const payload = this.useFraming ? this.buildFramed(bytes) : bytes;
    const b64 = this.base64FromBytes(payload);
    try {
      await this.manager.writeCharacteristicWithResponseForDevice(this.device.id, SERVICE_UUID, RX_CHAR_UUID, b64);
      return true;
    } catch (e) {
      return false;
    }
  }

  async sendCreateLobby(lobbyId, psk = '', name = '') {
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
    return await this.sendRawBytes(out);
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

  async sendJoinLobby(lobbyId) {
    const lobbyB = this.utf8ToBytes(lobbyId);
    const out = new Uint8Array(2 + lobbyB.length);
    out[0] = CMD_JOIN_LOBBY;
    out[1] = 0xFE;
    out.set(lobbyB, 2);
    return await this.sendRawBytes(out);
  }

  async sendText(dest, text) {
    const textB = this.utf8ToBytes(text);
    const out = new Uint8Array(2 + textB.length);
    out[0] = CMD_SEND_TXT_MSG;
    out[1] = dest & 0xff;
    out.set(textB, 2);
    return await this.sendRawBytes(out);
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

  isConnected() {
    return this.connected && this.device !== null;
  }

  getDeviceName() {
    return this.device ? this.device.name : null;
  }

}

const bleService = new BleService();
export default bleService;
