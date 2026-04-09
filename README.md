# HikeSafe

HikeSafe is an off-grid group-safety system composed of:

1) an **Expo / React Native** mobile app, and
2) an **ESP32-based hardware node** that bridges **Bluetooth LE (BLE)** ↔ **LoRa** and reports **GPS** status.

The intent is simple: phones provide a usable UI and easy input (nicknames, lobby codes, messages), while hardware nodes provide long-range LoRa comms and keep operating even when there’s no cell service.

## How it works (one-minute mental model)

- **BLE (phone ⇄ device)**: short-range control + telemetry link.
- **LoRa (device ⇄ device)**: long-range link for SOS/OK/heartbeat + text between devices in the same lobby.
- **GPS (device)**: provides location used for map display and separation alerts.

In practice:

- You pair your phone to a device over BLE.
- You set/join a **Lobby** (a shared numeric code).
- Devices in the same lobby exchange LoRa packets.
- The device forwards key events/telemetry back to the phone over BLE as newline-terminated text.

## Architecture (data flow)

```text
Phone UI (Expo / RN)
	├─ writes commands (newline terminated)
	│
	▼
BLE (Nordic UART Service)
	│
	▼
ESP32 device
	├─ parses commands (buffer until \n)
	├─ reads GPS
	├─ publishes telemetry/alerts back over BLE
	└─ sends/receives LoRa packets within a lobby
				│
				▼
	 Other ESP32 devices (same lobby)
				│
				▼
	 Their paired phones (optional, via BLE)
```

## Safety / expectations

This is a prototype-style system intended for experimentation and field testing.

- Do not rely on HikeSafe as your only emergency plan.
- Radios, terrain, weather, and power management can affect reliability.

## Repository layout

This repository contains the mobile app and a firmware sketch.

- `arduino_code.ino` — ESP32 firmware (BLE + LoRa + GPS + alerts)
- `context/` — app state providers (Bluetooth, Lobby, Theme, User)
- `screens/` — UI screens and tabs
- `components/` — shared UI components
- `assets/` — app assets
- `docs/` — UAT / testing documentation
- `PERFORMANCE_*.md` — profiling/monitoring notes
- `MULTI_DEVICE_*.md` — design + implementation notes for multi-phone / multi-device

## Requirements

- Node.js `20.0.0` (pinned in `eas.json`)
- Expo CLI
- EAS CLI (`npm i -g eas-cli`)

Important: this app uses native modules (notably BLE and MapLibre), so it requires an **Expo Development Build (Dev Client)**. It will not work in Expo Go.

## Quick start (app)

Run these commands from the `hikesafenew/` folder:

```bash
npm install
```

Start Metro:

```bash
npm run start
```

Or start and open a platform:

```bash
npm run android
npm run ios
```

If you already installed a Dev Client build on your phone/emulator:

```bash
npx expo start --dev-client
```

## Building a Dev Client (EAS)

Profiles live in `eas.json`:

- `development`: dev-client build (native modules enabled)
- `preview`: internal distribution APK
- `production`: Android App Bundle

Android dev build:

```bash
eas build --platform android --profile development
```

iOS dev build:

```bash
eas build --platform ios --profile development
```

## Offline topo maps (MapLibre)

The Location tab’s map uses MapLibre and supports an offline tile cache.

Provide a raster tile URL template via an Expo public env var:

- `EXPO_PUBLIC_TILE_URL_TEMPLATE` (must contain `{z}`, `{x}`, `{y}`)

Examples:

PowerShell:

```powershell
$env:EXPO_PUBLIC_TILE_URL_TEMPLATE = "https://your-tile-server/tiles/{z}/{x}/{y}.png"
npx expo start --dev-client
```

Windows `cmd.exe`:

```bat
set EXPO_PUBLIC_TILE_URL_TEMPLATE=https://your-tile-server/tiles/{z}/{x}/{y}.png
npx expo start --dev-client
```

Because MapLibre is native, rebuild your Dev Client after changing native dependencies:

```bash
eas build --platform android --profile development
eas build --platform ios --profile development
```

## Firmware (ESP32)

The firmware sketch is `arduino_code.ino`. It:

- exposes a BLE UART-style service (Nordic UART Service UUIDs)
- buffers incoming BLE writes and parses commands once a newline is received
- emits newline-terminated messages to the phone
- transmits and receives LoRa packets gated by a `lobbyCode`
- uses GPS to generate location updates and separation alerts

Notes:

- The firmware sets a larger BLE MTU (`BLEDevice::setMTU(200)`) to reduce truncation risk for longer notifications.
- Multi-phone support is implemented by tracking each phone’s **BLE connection id (`conn_id`)** and removing only the disconnected phone.

### Multi-phone behavior (why there are two IDs)

The firmware deals with two different identifiers:

- `conn_id` (BLE/GATT): a unique identifier assigned by the BLE stack per active connection.
	- Used internally to know exactly which phone connected/disconnected.
- `mobileID` (1..4): a small stable ID used inside LoRa packets so that messages can be attributed to a specific phone when multiple phones are paired to the same device.

When a phone disconnects, the firmware removes the matching `conn_id` entry and keeps other phones connected.

For deeper design context, see:

- `MULTI_DEVICE_AUDIT.md`
- `MULTI_DEVICE_IMPLEMENTATION.md`

## What the app does

- Connects to a HikeSafe device via BLE (scan → connect → subscribe)
- Sends device commands (lobby, nickname, emergency contact, SOS/OK, chat)
- Displays device telemetry (GPS fix, satellites, LoRa RSSI, connected phone count)
- Shows lobby/member status (online/offline, locations, emergency state)
- Surfaces alerts (SOS/Morse/OK, offline/online, separation too-far/regrouped)

## Offline topo maps (MapLibre)

MapLibre is a native module, so it requires a Dev Build (it will not render in Expo Go).

This app uses **raster tiles**. To use maps completely offline, you:

1) configure a tile source URL template (used only for downloading tiles)
2) download tiles around your current GPS position (requires internet once)
3) switch to the topo map view; it reads tiles from local storage (offline-only)

### Configure the tile URL template

Create `hikesafenew/.env` and set:

`EXPO_PUBLIC_TILE_URL_TEMPLATE=https://your-tile-server/{z}/{x}/{y}.png`

Then restart Expo so the env var is picked up:

`npx expo start -c`

### Download tiles for offline use

- Open the Location tab
- Get a valid GPS fix
- Use the offline download section to download tiles (requires internet once)
- After the download completes, the topo map works in airplane mode

## BLE protocol (app ↔ device)

Transport:

- newline-terminated UTF-8 text lines
- each message ends with `\n`
- app should write full commands ending in `\n`
- device should buffer partial writes until newline before parsing

### App → device commands

- `SOS`
- `OK`
- `ON_MY_WAY`
- `LOBBY:<code>`
- `HOSTLOBBY:<code>`
- `VERIFY_LOBBY:<code>,<nonce>`
- `NICK:<name>`
- `EC:<name>,<phone>`
- `MSG:<targetId>,<text>` (where `targetId=0` means broadcast)

Hybrid tracking (phone GPS relay when multiple phones share one hub):

- `CLAIM:<token>` (phone asks the hub to assign a `mobileID`)
- `PLOC:<token>,<mobileId>,<lat>,<lng>[,<sats>]` (phone sends its current GPS; hub rebroadcasts it over LoRa)

### Device → app messages

Core telemetry:

- `SELF:<lat>,<lng>,<sats>,<rssi>,<connectedPhones>[,<lastDistance>]`
- `LOC:<deviceId>,<lat>,<lng>,<sats>,<rssi>`
- `MOBILELOC:<deviceId>,<mobileId>,<lat>,<lng>,<rssi>,<estimatedDistance>`
- `MOBILE:<mobileId>,<lat>,<lng>,<rssi>,<estimatedDistance>` (legacy/local-only format)

Alerts:

- `ALERT:SOS,<deviceId>,<lat>,<lng>`
- `ALERT:MORSE,<deviceId>,<lat>,<lng>`
- `ALERT:OK,<deviceId>,<lat>,<lng>`
- `ALERT:ON_MY_WAY,<deviceId>,<lat>,<lng>`
- `ALERT:OFFLINE,<deviceId>` / `ALERT:ONLINE,<deviceId>`
- `ALERT:TOO_FAR,<deviceId>,<distanceMeters>`
- `ALERT:REGROUPED,<deviceId>,<distanceMeters>`
- `ALERT:SEP_ACK`

Status + acks:

- `STATUS:LOBBY_SET,<code>`
- `STATUS:LOBBY_VERIFIED,<code>,<nonce>,LOCAL|LORA`
- `STATUS:NICK_SET,<name>`
- `STATUS:EC_SET`
- `STATUS:SENDING_SOS` / `STATUS:SENDING_MORSE_SOS` / `STATUS:SENDING_OK`
- `STATUS:ON_MY_WAY_SENT`
- `STATUS:MORSE_FAIL`

Messaging / metadata:

- `MSG:<fromDeviceId>,M<mobileId>,<text>,RSSI:<rssi>`
- `ECHO_MSG:<targetId>,<text>`
- `NICK:<deviceId>,<nickname>`
- `EC:<deviceId>,<name>,<phone>`
- `MORSE_DOT` / `MORSE_DASH`

## Troubleshooting

- Dev Client required: rebuild and reinstall if you change native dependencies or config plugins.
- Android permissions (12+): `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` are required; the app requests runtime permissions.
- BLE command issues: ensure commands are newline-terminated; the firmware only parses once a newline is received.
- Map tiles not downloading: confirm `EXPO_PUBLIC_TILE_URL_TEMPLATE` is set in the same terminal session that runs Expo.
- Multi-phone behavior: the firmware logs connect/disconnect `conn_id` to Serial. Connect two phones, then disable Bluetooth on one phone and confirm only that `conn_id` is removed.
- Battery optimizations: aggressive power saving can kill BLE/background work. Validate in the foreground first; then adjust device battery optimization settings for longer tests.

## Performance notes

See:

- `PERFORMANCE_QUICK_START.md`
- `PERFORMANCE_SETUP.md`
- `PERFORMANCE_OPTIMIZATION.md`
- `PERFORMANCE_IMPLEMENTATION_SUMMARY.md`

## Additional docs

- `MULTI_DEVICE_AUDIT.md` / `MULTI_DEVICE_IMPLEMENTATION.md` — multi-phone & multi-device notes
- `docs/UAT_DOCUMENTATION.md` — test/UAT reference
