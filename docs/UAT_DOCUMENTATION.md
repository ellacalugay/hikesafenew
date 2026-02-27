# HikeSafe App - User Acceptance Testing (UAT) Documentation

**Version:** 1.0  
**Date:** February 28, 2026  
**Platform:** Android (Expo/React Native)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Hardware Requirements](#2-hardware-requirements)
3. [Software Requirements](#3-software-requirements)
4. [Communication Protocol](#4-communication-protocol)
5. [Test Environment Setup](#5-test-environment-setup)
6. [UAT Test Cases](#6-uat-test-cases)
7. [Expected Behaviors](#7-expected-behaviors)
8. [Known Limitations](#8-known-limitations)
9. [Troubleshooting Guide](#9-troubleshooting-guide)

---

## 1. System Overview

HikeSafe is a hiking safety application that connects to ESP32-based LoRa devices via Bluetooth Low Energy (BLE). The system enables:

- **GPS Tracking:** Real-time location sharing among group members
- **SOS Alerts:** Emergency distress signals broadcast to all group members
- **Offline Messaging:** Text communication via LoRa radio (no cellular required)
- **Member Monitoring:** Automatic offline detection when devices lose contact
- **Visual Location Display:** Map view (when online) and radar view (fully offline)

### Architecture

```
┌─────────────────┐     BLE      ┌─────────────────┐     LoRa      ┌─────────────────┐
│   HikeSafe App  │◄────────────►│  ESP32 Device   │◄─────────────►│  Other Devices  │
│   (Android)     │  Nordic UART │  (HikeSafe-DX)  │   433MHz RF   │  in Group       │
└─────────────────┘              └─────────────────┘               └─────────────────┘
```

---

## 2. Hardware Requirements

### HikeSafe Device (ESP32)
- ESP32 microcontroller with BLE capability
- LoRa transceiver module (433MHz)
- GPS module (Neo-6M or compatible)
- SOS button (tactile switch)
- Power source (LiPo battery recommended)
- Device ID configured (1-255)

### Mobile Device
- Android smartphone (Android 6.0+)
- Bluetooth 4.0+ (BLE support)
- Minimum 2GB RAM
- GPS capability (for validation)

---

## 3. Software Requirements

### Mobile App
- HikeSafe App (built with Expo SDK 54)
- Android 6.0 (API level 23) or higher

### Required Permissions
| Permission | Purpose |
|------------|---------|
| Bluetooth | BLE device communication |
| Bluetooth Admin | Device scanning/pairing |
| Bluetooth Connect | Android 12+ BLE connections |
| Bluetooth Scan | Android 12+ device discovery |
| Fine Location | GPS coordinate access |
| Coarse Location | Approximate location |

---

## 4. Communication Protocol

### BLE Service (Nordic UART Service)

| UUID | Type | Direction |
|------|------|-----------|
| `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` | Service | - |
| `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` | RX Characteristic | App → Device |
| `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` | TX Characteristic | Device → App |

### Device → App Messages

| Message Format | Description | Example |
|----------------|-------------|---------|
| `SELF:lat,lng,sats` | Own GPS coordinates | `SELF:14.5995,120.9842,8` |
| `ALERT:SOS,id,lat,lng` | SOS emergency alert | `ALERT:SOS,2,14.5996,120.9843` |
| `ALERT:MORSE,id,lat,lng` | Morse code SOS alert | `ALERT:MORSE,3,14.5997,120.9844` |
| `ALERT:OK,id,lat,lng` | OK status from member | `ALERT:OK,2,14.5996,120.9843` |
| `ALERT:OFFLINE,id` | Device went offline (90s timeout) | `ALERT:OFFLINE,2` |
| `ALERT:ONLINE,id` | Device back online | `ALERT:ONLINE,2` |
| `MSG:id,text` | Text message from device | `MSG:2,Help needed at river` |
| `MSG_BEAT` | Heartbeat signal | `MSG_BEAT` |

### App → Device Commands

| Command | Description | Format |
|---------|-------------|--------|
| Send SOS | Broadcast emergency | `SOS\n` |
| Send OK | Broadcast safe status | `OK\n` |
| Send Message | Send text to device | `MSG:targetId,message text\n` |
| Broadcast Message | Send to all devices | `MSG:0,message text\n` |

---

## 5. Test Environment Setup

### Pre-Test Checklist

- [ ] Minimum 2 HikeSafe devices powered on and configured
- [ ] All devices within LoRa range (~1km line of sight)
- [ ] GPS has clear sky view (outdoor testing recommended)
- [ ] Android devices with HikeSafe app installed
- [ ] Bluetooth enabled on all Android devices
- [ ] Battery level >50% on all devices

### Device Configuration

Each ESP32 device must have a unique Device ID (1-255) configured in firmware:
```cpp
#define DEVICE_ID 1  // Change for each device
```

### Device Naming Convention

Devices advertise as: `HikeSafe-D{ID}` (e.g., `HikeSafe-D1`, `HikeSafe-D2`)

---

## 6. UAT Test Cases

### TC-001: App Launch and Initial Setup

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Launch HikeSafe app | App opens to Device Setup screen | |
| 2 | Verify Bluetooth status | Shows "Bluetooth: ON" or prompt to enable | |
| 3 | Navigate through onboarding | Can proceed through name/details screens | |
| 4 | Skip device setup | Can skip and access Dashboard | |

---

### TC-002: Device Scanning and Connection

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Go to Location tab | Location screen displays | |
| 2 | Tap device connection card | Opens Device Connection screen | |
| 3 | Wait for scan (auto-starts) | "Scanning for devices..." shown | |
| 4 | Verify device appears | Device shows as "HikeSafe-DX" | |
| 5 | Tap device to connect | "Connecting..." status shown | |
| 6 | Wait for connection | Shows "Connected" with green indicator | |
| 7 | Return to Location tab | Shows connected device name | |

---

### TC-003: GPS Location Display

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Connect to device | Connection established | |
| 2 | Wait for GPS fix | "My GPS Location" card appears | |
| 3 | Verify coordinates | Lat/Lng displayed with correct format | |
| 4 | Verify satellite count | Shows satellite count (e.g., "8 sats") | |
| 5 | Check coordinate accuracy | Matches known location (±50m) | |

---

### TC-004: Radar View (Offline Map)

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Ensure GPS valid | Own location showing | |
| 2 | Select "Radar" view mode | Radar display shown | |
| 3 | Verify center point | "YOU" dot at center | |
| 4 | Verify compass directions | N/S/E/W labels correct | |
| 5 | Wait for member location | Other device dot appears | |
| 6 | Verify dot position | Direction matches physical location | |
| 7 | Tap member dot | Shows member info modal | |

---

### TC-005: Map View

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Select "Map" view mode | Google Maps/Apple Maps displays | |
| 2 | Verify own marker | Green pin at your location | |
| 3 | Verify member markers | Blue pins for group members | |
| 4 | Pinch to zoom | Map zooms in/out | |
| 5 | Tap member marker | Shows name and distance | |
| 6 | Disable internet | Map shows cached tiles or error message | |

---

### TC-006: SOS Alert - Sending

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | On Home tab, tap "SOS" button | Confirmation modal appears | |
| 2 | Confirm "SEND SOS" | SOS sent confirmation shown | |
| 3 | Verify on other device | Other device receives SOS alert | |
| 4 | Verify on other app | Alert modal with vibration appears | |

---

### TC-007: SOS Alert - Receiving

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Have another device send SOS | - | |
| 2 | Verify alert modal | Modal shows "SOS ALERT" with device ID | |
| 3 | Verify vibration | Phone vibrates (long pattern) | |
| 4 | Verify location shown | Sender's coordinates displayed | |
| 5 | Tap "Respond OK" | OK response sent | |
| 6 | Tap "Dismiss" | Alert dismissed, member shown in list | |

---

### TC-008: Physical SOS Button

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Press physical SOS button on device | - | |
| 2 | Short press (tap) | SOS alert broadcast within 5 seconds | |
| 3 | Long press (3+ sec) | Morse mode activated, "SOS" sent | |
| 4 | Verify app receives | Alert modal appears on all apps | |

---

### TC-009: OK Status

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | On Home tab, tap "I'm OK" button | Confirmation modal appears | |
| 2 | Confirm "SEND OK" | OK sent confirmation shown | |
| 3 | Verify on other device | OK status received | |
| 4 | Note: Used to respond to SOS | Dismisses active SOS alert | |

---

### TC-010: Messaging - Direct Message

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Go to Messages tab | Message list shown | |
| 2 | Tap on a device conversation | Chat screen opens | |
| 3 | Type message | Text input works | |
| 4 | Tap send | Message sent via LoRa | |
| 5 | Verify on recipient | Message received and displayed | |
| 6 | Verify delivery | Message appears in chat history | |

---

### TC-011: Messaging - Broadcast

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Go to Messages tab | Message list shown | |
| 2 | Tap "Group Chat (Broadcast)" | Broadcast chat opens | |
| 3 | Type message | Text input works | |
| 4 | Tap send | Message sent to all devices | |
| 5 | Verify on all devices | All group members receive message | |

---

### TC-012: Device Offline Detection

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Have 2+ devices connected to mesh | Members visible in app | |
| 2 | Power off one device | - | |
| 3 | Wait 90 seconds | App receives OFFLINE alert | |
| 4 | Verify alert shown | "DEVICE OFFLINE" modal appears | |
| 5 | Verify member status | Member shows gray with "📵 OFFLINE" badge | |
| 6 | Verify vibration | Different pattern (shorter) for offline | |

---

### TC-013: Device Online Recovery

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Have offline device in list | Member shows as OFFLINE | |
| 2 | Power on the device | - | |
| 3 | Wait for heartbeat | Device sends MSG_BEAT | |
| 4 | Verify status update | Member no longer shows OFFLINE | |
| 5 | Verify location updates | GPS coordinates resume updating | |

---

### TC-014: Connection Loss and Recovery

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Connected to device normally | Shows "Connected" | |
| 2 | Walk >10m away from device | BLE may disconnect | |
| 3 | Verify disconnect detected | Status shows "Disconnected" within 15s | |
| 4 | Return near device | - | |
| 5 | Tap to reconnect | Connection re-established | |

---

### TC-015: Dark Mode Theme

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Go to Profile → Settings | Settings screen opens | |
| 2 | Toggle "Dark Mode" | Theme changes immediately | |
| 3 | Verify all screens | Colors update throughout app | |
| 4 | Close and reopen app | Dark mode persists | |

---

### TC-016: Multi-Device Group

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1 | Setup 3+ HikeSafe devices | All devices in LoRa range | |
| 2 | Connect app to one device | Connection established | |
| 3 | Wait for mesh sync | All devices appear in member list | |
| 4 | Verify distances | Distance calculations shown for each | |
| 5 | Move one device | Distance updates reflect movement | |

---

## 7. Expected Behaviors

### GPS Acquisition
- Cold start: 30-60 seconds for GPS fix
- Warm start: 5-15 seconds
- Requires clear sky view (outdoor)
- Accuracy: 3-10 meters typical

### LoRa Range
- Line of sight: Up to 2km
- Urban/forest: 500m-1km
- Buildings significantly reduce range

### Heartbeat System
- Devices send heartbeat every ~60 seconds
- Offline detection: 90 seconds without heartbeat
- Online recovery: Immediate upon next heartbeat

### BLE Connection
- Range: ~10 meters typical
- Reconnection required if out of range
- No system pairing needed (Nordic UART)

---

## 8. Known Limitations

| Limitation | Description | Workaround |
|------------|-------------|------------|
| Map offline | Standard map view requires internet | Use Radar view when offline |
| GPS indoors | GPS doesn't work indoors | Test outdoors or near windows |
| BLE range | Limited to ~10m from phone | Stay near device |
| Message length | LoRa limits message size | Keep messages under 200 chars |
| Battery life | GPS and LoRa consume power | Carry backup battery |

---

## 9. Troubleshooting Guide

### Device Not Found in Scan

1. Verify device is powered on (LED indicator)
2. Ensure device is advertising as `HikeSafe-DX`
3. Check Bluetooth is enabled on phone
4. Try toggling Bluetooth off/on
5. Restart the app
6. Restart the ESP32 device

### GPS Not Getting Fix

1. Move outdoors with clear sky view
2. Wait up to 60 seconds for cold start
3. Verify GPS module is connected properly
4. Check GPS antenna is not obstructed
5. Satellite count shows progress

### Messages Not Sending

1. Verify BLE connection is active
2. Check device is connected (green indicator)
3. Ensure message is under 200 characters
4. Other device must be in LoRa range
5. Check LoRa antenna connections

### SOS Not Received by Group

1. Verify all devices are in LoRa range
2. Check sender's device has GPS fix
3. Ensure receiving app is connected
4. Verify LoRa module is functioning

### App Crashes on Launch

1. Clear app data/cache
2. Reinstall app from APK
3. Ensure Android 6.0+ installed
4. Check available storage space
5. Report crash log to developers

### OFFLINE Alert Not Received

1. Heartbeat timeout is 90 seconds - wait
2. Verify powered-off device left mesh
3. Check receiving device has LoRa connection
4. Restart hub device if stuck

---

## Appendix A: Test Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Tester | | | |
| Developer | | | |
| Project Lead | | | |

---

## Appendix B: Defect Log

| ID | Test Case | Description | Severity | Status |
|----|-----------|-------------|----------|--------|
| | | | | |
| | | | | |
| | | | | |

**Severity Levels:**
- Critical: App crash, data loss, safety feature failure
- High: Feature not working, significant UX issue
- Medium: Minor feature issue, cosmetic problem
- Low: Enhancement request, minor improvement

---

## Appendix C: Device Protocol Quick Reference

```
INCOMING (Device → App):
========================
SELF:14.5995,120.9842,8         # Own GPS (lat, lng, satellites)
ALERT:SOS,2,14.5996,120.9843    # SOS from device 2
ALERT:MORSE,3,14.5997,120.9844  # Morse SOS from device 3
ALERT:OK,2,14.5996,120.9843     # OK from device 2
ALERT:OFFLINE,2                  # Device 2 went offline
ALERT:ONLINE,2                   # Device 2 back online
MSG:2,Hello everyone            # Message from device 2
MSG_BEAT                         # Heartbeat signal

OUTGOING (App → Device):
========================
SOS\n                           # Send SOS alert
OK\n                            # Send OK status
MSG:2,Hello back\n              # Send to device 2
MSG:0,Group message\n           # Broadcast to all
```

---

**Document End**
