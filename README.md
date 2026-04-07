# HikeSafe

HikeSafe is an Expo/React Native mobile app that connects to a HikeSafe hardware device over **Bluetooth LE (BLE)** and displays / relays **LoRa + GPS** status for off-grid group safety.

At a high level:

- **BLE** is the local “control + telemetry” link between the phone and the device.
- **LoRa** is the long-range link between devices (SOS / OK / text / heartbeat).
- **GPS** provides location for you and other devices in the same lobby.

## Requirements

- Node.js (see `eas.json` for the pinned build Node version)
- Expo CLI
- EAS CLI (`npm i -g eas-cli`)

> Note: BLE (and other custom native modules) require a **development build** (Expo Dev Client). This will not work in Expo Go.

## Setup

```bash
npm install
```

## Common commands

```bash
# start Metro
npm run start

# start Metro and open a platform
npm run android
npm run ios
```

## Run (Dev Client)

```bash
npx expo start --dev-client
```

Install a dev build on your device/emulator first (see below), then press:

- `a` for Android
- `i` for iOS

## Build (EAS)

### Android dev build

```bash
eas build --platform android --profile development
```

### iOS dev build

```bash
eas build --platform ios --profile development
```

Profiles are defined in `eas.json`:

- `development`: dev-client build (native modules enabled)
- `preview`: internal APK
- `production`: Android App Bundle

## What the app does

- Connects to the HikeSafe device via BLE
- Sends commands to the device (join lobby, nickname, emergency contact, SOS/OK)
- Displays device telemetry (GPS fix, satellites, LoRa RSSI)
- Shows member/device status in a lobby (online/offline, location updates)
- Displays multi-phone connection count (device reports number of connected phones)

## BLE protocol (app ↔ device)

The device and app exchange **newline-terminated** text messages (each message ends with `\n`).

### App → device commands

- `SOS`
- `OK`
- `LOBBY:<code>`
- `NICK:<name>`
- `EC:<name>,<phone>`
- `MSG:<targetId>,<text>` (where `targetId=0` means broadcast)

### Device → app messages

- `SELF:<lat>,<lng>,<sats>,<rssi>,<connectedPhones>`
- `ALERT:SOS,<deviceId>,<lat>,<lng>`
- `ALERT:MORSE,<deviceId>,<lat>,<lng>`
- `ALERT:OK,<deviceId>,<lat>,<lng>`
- `ALERT:OFFLINE,<deviceId>` / `ALERT:ONLINE,<deviceId>`
- `STATUS:LOBBY_SET,<code>` / `STATUS:NICK_SET,<name>` / `STATUS:EC_SET`
- `MSG:<fromDeviceId>,<text>`
- `NICK:<deviceId>,<nickname>`
- `EC:<deviceId>,<name>,<phone>`
- `ECHO_MSG:<targetId>,<text>`

### Important firmware note (MTU fragmentation)

BLE writes can arrive fragmented (especially for longer commands like `EC:`). The firmware must buffer incoming BLE text until a newline is received, then parse the whole command.

See `FIRMWARE_UPDATE.ino` for an updated `checkBluetoothCommands()` implementation.

## Project structure

- `context/` — app state providers (Bluetooth, Lobby, Theme, User)
- `screens/` — UI screens and tabs
- `components/` — shared UI components
- `assets/` — images, sounds, etc.
- `docs/` — testing / UAT docs
- `PERFORMANCE_*.md` — performance profiling/monitoring notes

## Firmware notes

- `FIRMWARE_UPDATE.ino` contains firmware snippet updates (e.g., `SELF:` payload format and BLE command buffering guidance).

## Troubleshooting

- Dev Client required: if you add/remove Expo native modules or config plugins, rebuild and reinstall the dev client.
- Android permissions: on Android 12+ you need `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` (the app requests these at runtime).
- BLE disconnects during writes: ensure commands are newline-terminated on the app side and buffered until newline on the firmware side.
- Battery optimizations: aggressive power saving can kill BLE in the background; test in the foreground first and consider disabling battery optimization for the app while debugging.
