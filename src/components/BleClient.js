/**
 * BleClient.js
 *
 * JavaScript BLE client that talks to the HikeSafe firmware (Nordic UART Service).
 * Designed for integration into your existing `App.js` (Expo-managed app).
 *
 * NOTE: If you use a fully managed Expo app (Expo Go) you need a custom dev client
 * or to eject, because `react-native-ble-plx` requires native modules.
 * See integration notes below.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Button, TextInput, Switch, ScrollView, FlatList, Platform, PermissionsAndroid, Alert } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

const SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
const RX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
const TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

// Opcodes taken from firmware MyMesh.cpp
const CMD_SEND_TXT_MSG = 2;
const CMD_SEND_CHANNEL_TXT_MSG = 3;
const CMD_SET_PROFILE = 44;
const CMD_GET_PROFILE = 45;
const CMD_CREATE_LOBBY = 46;
const CMD_JOIN_LOBBY = 47;
const CMD_SET_DEVICE_GPS = 48;

export default function BleClient() {
  const managerRef = useRef(new BleManager());
  const [scanning, setScanning] = useState(false);
  const [filterNus, setFilterNus] = useState(true);
  const [devices, setDevices] = useState([]);
  const devicesRef = useRef(new Map());
  const [connected, setConnected] = useState(null);
  const monitorRef = useRef(null);
  const [log, setLog] = useState([]);
  const [hexToSend, setHexToSend] = useState('');
  const [useFraming, setUseFraming] = useState(true);

  useEffect(() => {
    const mgr = managerRef.current;
    const sub = mgr.onStateChange((state) => appendLog('BLE state: ' + state), true);
    return () => { sub.remove(); cleanupAll(); };
  }, []);

  async function ensurePermissions() {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        if (granted['android.permission.ACCESS_FINE_LOCATION'] !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permissions required', 'Location permission is required for BLE scanning');
        }
      } catch (e) { appendLog('Permission error'); }
    }
  }

  function appendLog(s) { setLog(l=>[new Date().toLocaleTimeString() + ' - ' + s, ...l].slice(0,200)); }

  async function startScan() {
    await ensurePermissions();
    devicesRef.current.clear();
    setDevices([]);
    setScanning(true);
    appendLog('Start scan');
    managerRef.current.startDeviceScan(filterNus ? [SERVICE_UUID] : null, null, (error, device) => {
      if (error) { appendLog('Scan error: ' + error.message); setScanning(false); return; }
      if (!device) return;
      devicesRef.current.set(device.id, device);
      setDevices(Array.from(devicesRef.current.values()));
    });
    setTimeout(()=>stopScan(), 10000);
  }

  function stopScan() { try { managerRef.current.stopDeviceScan(); } catch {} setScanning(false); appendLog('Scan stopped'); }

  async function connectTo(device) {
    appendLog('Connecting: ' + (device.name || device.id));
    stopScan();
    try {
      const d = await device.connect();
      await d.discoverAllServicesAndCharacteristics();
      setConnected(d);
      appendLog('Connected: ' + d.id);
      if (Platform.OS === 'android') {
        try { if (managerRef.current.requestMTUForDevice) { const m = await managerRef.current.requestMTUForDevice(d.id, 247); appendLog('MTU: ' + m); } }
        catch (e) { appendLog('MTU request failed'); }
      }
      subscribeTx(d);
    } catch (e) { appendLog('Connect failed: ' + (e?.message || e)); }
  }

  function cleanupMonitor() { try { monitorRef.current?.remove(); } catch {} monitorRef.current = null; }

  function subscribeTx(device) {
    cleanupMonitor();
    try {
      const sub = managerRef.current.monitorCharacteristicForDevice(device.id, SERVICE_UUID, TX_CHAR_UUID, (err, char) => {
        if (err) { appendLog('Notify err: ' + err.message); return; }
        if (!char?.value) return;
        try {
          const bytes = bytesFromBase64(char.value);
          appendLog('RX: ' + bytesToHex(bytes) + ' | ' + bytesToUtf8(bytes));
        } catch (e) { appendLog('Decode notify failed'); }
      });
      monitorRef.current = sub;
      appendLog('Subscribed to TX');
    } catch (e) { appendLog('Subscribe failed'); }
  }

  async function disconnect() { if (!connected) return; appendLog('Disconnecting'); cleanupMonitor(); try { await managerRef.current.cancelDeviceConnection(connected.id); setConnected(null); appendLog('Disconnected'); } catch (e) { appendLog('Disconnect failed'); } }

  function buildFramed(bytes) { const header=new Uint8Array(3); header[0]=0x3c; const len=bytes.length; header[1]=len&0xff; header[2]=(len>>8)&0xff; const out=new Uint8Array(3+bytes.length); out.set(header,0); out.set(bytes,3); return out; }

  async function sendBytes(bytes) { if (!connected) { appendLog('No device'); return; } const payload = useFraming ? buildFramed(bytes) : bytes; const b64 = base64FromBytes(payload); try { await managerRef.current.writeCharacteristicWithResponseForDevice(connected.id, SERVICE_UUID, RX_CHAR_UUID, b64); appendLog('TX: ' + bytesToHex(payload)); } catch (e) { appendLog('Write failed: ' + (e?.message || e)); } }

  function hexToBytes(hex) { const clean=(hex||'').replace(/[^0-9a-fA-F]/g,''); const out=new Uint8Array(clean.length/2); for (let i=0;i<clean.length;i+=2) out[i/2]=parseInt(clean.substr(i,2),16); return out; }
  function bytesToHex(bytes) { return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase(); }
  function utf8ToBytes(s) { return new Uint8Array(Buffer.from(s,'utf8')); }
  function bytesToUtf8(b) { try { return Buffer.from(b).toString('utf8'); } catch { return ''; } }
  function base64FromBytes(b) { return Buffer.from(b).toString('base64'); }
  function bytesFromBase64(s) { return new Uint8Array(Buffer.from(s,'base64')); }

  function buildCreateLobby(lobbyId, psk, name) { const nameB=name?utf8ToBytes(name):new Uint8Array(0); const pskB=psk?utf8ToBytes(psk):new Uint8Array(0); const lobbyB=utf8ToBytes(lobbyId); const total=1+1+nameB.length+1+pskB.length+1+lobbyB.length; const out=new Uint8Array(total); let o=0; out[o++]=CMD_CREATE_LOBBY; out[o++]=nameB.length; out.set(nameB,o); o+=nameB.length; out[o++]=pskB.length; out.set(pskB,o); o+=pskB.length; out[o++]=lobbyB.length; out.set(lobbyB,o); return out; }

  function buildJoinLobby(lobbyId) { const lobbyB=utf8ToBytes(lobbyId); const out=new Uint8Array(2+lobbyB.length); out[0]=CMD_JOIN_LOBBY; out[1]=0xFE; out.set(lobbyB,2); return out; }

  return (
    <View style={{ padding: 12, flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Button title={scanning? 'Scanning...' : 'Scan'} onPress={() => (scanning? stopScan() : startScan())} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text>Filter NUS</Text>
          <Switch value={filterNus} onValueChange={setFilterNus} />
        </View>
      </View>

      <FlatList data={devices} keyExtractor={d=>d.id} renderItem={({item}) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600' }}>{item.name || '(no name)'}</Text>
            <Text style={{ fontSize: 11, color: '#666' }}>{item.id}</Text>
          </View>
          <Button title="Connect" onPress={() => connectTo(item)} />
        </View>
      )} style={{ maxHeight: 160 }} />

      <View style={{ marginVertical: 8 }}>
        <Text>Manual send (hex)</Text>
        <TextInput value={hexToSend} onChangeText={setHexToSend} placeholder="3C0700..." style={{ borderWidth: 1, padding: 8, marginVertical: 6 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button title="Send Hex" onPress={() => { try { const b = hexToBytes(hexToSend); sendBytes(b); setHexToSend(''); } catch (e) { appendLog('Invalid hex'); } }} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text>Serial Framing</Text>
            <Switch value={useFraming} onValueChange={setUseFraming} />
          </View>
        </View>
      </View>

      <View style={{ marginVertical: 8 }}>
        <Text style={{ fontWeight: '700' }}>Helpers</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Create Lobby" onPress={() => sendBytes(buildCreateLobby('test'))} />
          <Button title="Join Lobby" onPress={() => sendBytes(buildJoinLobby('test'))} />
        </View>
      </View>

      <View style={{ marginTop: 8, flex: 1 }}>
        <Text style={{ fontWeight: '700' }}>Log</Text>
        <ScrollView style={{ borderWidth: 1, padding: 8, marginTop: 6 }}>
          {log.map((l, i) => <Text key={i} style={{ marginBottom: 6 }}>{l}</Text>)}
        </ScrollView>
      </View>
    </View>
  );
}
