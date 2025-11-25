import { BleManager } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

const SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
const TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

// Opcodes
const CMD_CREATE_LOBBY = 46;
const CMD_JOIN_LOBBY = 47;
const CMD_SEND_TXT_MSG = 2;
const CMD_SET_PROFILE = 44;
const CMD_SET_DEVICE_GPS = 48;

class BleService {
  constructor() {
    this.manager = new BleManager();
    this.device = null;
    this.monitor = null;
    this.connected = false;
    this.useFraming = true;
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
        found.set(dev.id, dev);
      });
      setTimeout(() => {
        try { this.manager.stopDeviceScan(); } catch {}
        resolve(Array.from(found.values()));
      }, timeoutMs);
    });
  }

  async connectToDevice(dev) {
    if (!dev) return false;
    try {
      const d = await dev.connect();
      await d.discoverAllServicesAndCharacteristics();
      this.device = d;
      this.connected = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  buildFramed(bytes) {
    const header = new Uint8Array(3);
    header[0] = 0x3c;
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

}

const bleService = new BleService();
export default bleService;
