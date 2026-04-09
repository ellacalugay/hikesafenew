#include <TinyGPSPlus.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SPI.h>
#include <LoRa.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Preferences.h>
#include <math.h>
#ifdef ESP32
#include <esp_gatts_api.h>
#endif

// --- CONFIGURATION ---
#define DEVICE_ID 3

// --- SEPARATION ALERT CONFIGURATION ---
#define SEPARATION_ALERT_METERS  100  // alert fires at 200m
#define SEPARATION_CLEAR_METERS  50  // clears when back within 160m
#define SEPARATION_BUZZ_ON_MS    300    // Red LED + buzzer ON per pulse
#define SEPARATION_BUZZ_OFF_MS  1000    // Gap between pulses

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- BLE SETTINGS (Nordic UART Service) ---
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

BLEServer *pServer = NULL;
BLECharacteristic *pTxCharacteristic;
String bleRxBuffer = "";

uint32_t connectedDevices    = 0;
uint32_t oldConnectedDevices = 0;

// LoRa Pins
#define SCK  5
#define MISO 19
#define MOSI 27
#define SS   18
#define RST  14
#define DI0  26
#define BAND 915E6

HardwareSerial gpsSerial(2);
TinyGPSPlus gps;

const int GPS_RX = 34;
const int GPS_TX = 12;

const int BUTTON_SOS   = 15;
const int BUTTON_OKAY  = 13;
const int BUTTON_MORSE = 35;

const int SOS_LED   = 2;
const int BUZZER    = 25;
const int GREEN_LED = 4;

bool sosActive     = false;
bool morseActive   = false;
bool okayActive    = false;
bool receivedSOS   = false;
bool receivedMorse = false;

// --- SEPARATION ALERT STATE ---
bool  separationAlert      = false;
float lastKnownDistance    = -1.0;
int   separationFromDevice = 0;
unsigned long lastSepBuzzTime = 0;
bool  sepBuzzState         = false;

int  remoteDevice = 0;
int  lastRssi     = 0;

// --- MOBILE PHONE TRACKING ---
#define MAX_MOBILE_PHONES 4
struct ConnectedMobile {
  uint16_t connId;      // BLE connection ID (when available)
  uint8_t mobileID;
  String token;         // Phone token used for CLAIM/PLOC (best-effort mapping)
  String nickname;
  unsigned long lastSeen;
  bool isAlert;
  int lastRssi;         // Signal strength from device
  float latitude;       // GPS location
  float longitude;
  int estimatedDistance; // Computed from RSSI (meters)
};
ConnectedMobile connectedMobiles[MAX_MOBILE_PHONES];
uint8_t connectedMobileCount = 0;
uint8_t nextMobileID = 1;  // Legacy; IDs are now allocated from available slots

// ---- Mobile tracking helpers ----
void clearMobileSlot(uint8_t idx) {
  if (idx >= MAX_MOBILE_PHONES) return;
  connectedMobiles[idx].connId = 0xFFFF;
  connectedMobiles[idx].mobileID = 0;
  connectedMobiles[idx].token = "";
  connectedMobiles[idx].nickname = "";
  connectedMobiles[idx].lastSeen = 0;
  connectedMobiles[idx].isAlert = false;
  connectedMobiles[idx].lastRssi = 0;
  connectedMobiles[idx].latitude = 0.0;
  connectedMobiles[idx].longitude = 0.0;
  connectedMobiles[idx].estimatedDistance = -1;
}

void clearAllMobiles() {
  connectedMobileCount = 0;
  nextMobileID = 1;
  for (uint8_t i = 0; i < MAX_MOBILE_PHONES; i++) {
    clearMobileSlot(i);
  }
}

uint8_t allocateMobileId() {
  // Choose the lowest unused ID in [1..MAX_MOBILE_PHONES]
  for (uint8_t candidate = 1; candidate <= MAX_MOBILE_PHONES; candidate++) {
    bool used = false;
    for (uint8_t i = 0; i < connectedMobileCount; i++) {
      if (connectedMobiles[i].mobileID == candidate) {
        used = true;
        break;
      }
    }
    if (!used) return candidate;
  }
  return 0;
}

String morseInput = "";
unsigned long pressStart  = 0;
unsigned long lastTapTime = 0;
bool isPressing = false;

const int DOT_MAX       = 250;
const int DASH_MIN      = 400;
const int MORSE_TIMEOUT = 1500;

unsigned long lastGPSCheck      = 0;
unsigned long lastDisplayUpdate = 0;

unsigned long alarmStartTime = 0;
int  alarmStep     = 0;
bool alarmLedState = false;

unsigned long lastHeartbeatTime = 0;
const unsigned long heartbeatInterval = 30000;

unsigned long lastSeenTime = 0;
const unsigned long timeoutInterval = 90000;
bool isOffline = false;

unsigned long lastSOSTime = 0;
const unsigned long sosInterval = 10000;

unsigned long lastECBroadcastTime = 0;
const unsigned long ecBroadcastInterval = 45000;  // Refresh EC every 45 seconds

uint32_t currentLobbyCode = 0;
bool lobbyHostActive = false;                 // True if this device is hosting the current lobby
String pendingLobbyVerifyNonce = "";          // Nonce for an in-flight VERIFY_LOBBY request
uint32_t pendingLobbyVerifyCode = 0;
String myNickname = "Hiker";
String myECName   = "None";
String myECPhone  = "0000000000";

Preferences preferences;

#define MSG_SOS   1
#define MSG_MORSE 2
#define MSG_OKAY  3
#define MSG_TEXT  4
#define MSG_BEAT  5
#define MSG_NICK  6
#define MSG_EC    7
#define MSG_ON_MY_WAY 8

#define MAX_TEXT_LEN 50
#define MAX_NICK_LEN 15
#define MAX_EC_NAME  16
#define MAX_EC_PHONE 16

struct LoRaMessage {
  uint32_t lobbyCode;
  uint8_t  deviceID;
  uint8_t  mobileID;    // 0 = device button, 1-4 = mobile phone ID
  uint8_t  msgType;
  float    latitude;
  float    longitude;
  uint8_t  satellites;
  int      rssi;        // Signal strength (will be added during transmission)
};

struct LoRaTextMessage {
  uint32_t lobbyCode;
  uint8_t  deviceID;
  uint8_t  mobileID;    // 0 = device, 1-4 = mobile phone ID
  uint8_t  msgType;
  uint8_t  targetID;
  int      rssi;        // Signal strength
  char     text[MAX_TEXT_LEN];
};

struct LoRaNickMessage {
  uint32_t lobbyCode;
  uint8_t  deviceID;
  uint8_t  mobileID;    // 0 = device, 1-4 = mobile phone ID
  uint8_t  msgType;
  int      rssi;        // Signal strength
  char     nickname[MAX_NICK_LEN];
};

struct LoRaECMessage {
  uint32_t lobbyCode;
  uint8_t  deviceID;
  uint8_t  mobileID;    // 0 = device, 1-4 = mobile phone ID
  uint8_t  msgType;
  int      rssi;        // Signal strength
  char     ecName[MAX_EC_NAME];
  char     ecPhone[MAX_EC_PHONE];
};

// ============================================================
// FORWARD DECLARATIONS
// ============================================================
void sendToPhone(String msg);
void updateDisplay();
void triggerSOS();
void triggerOkay();
void checkMorseInput();
void sendLoRaMessage(uint8_t msgType, uint8_t mobileID);
void sendLoRaLocationMessage(uint8_t msgType, uint8_t mobileID, float lat, float lng, uint8_t satellites);
void sendLoRaTextMessage(uint8_t targetDevice, String message, uint8_t mobileID);
void sendLoRaNickname();
void sendLoRaEmergencyContact();
void receiveLoRaMessage();
void updateGPS();
void sendStatusUpdate();
void checkBluetoothCommands();
void blinkNormalSOSNonBlocking();
void blinkMorseSOSNonBlocking();
void handleSeparationAlarmNonBlocking();
void checkSeparationAlert(uint8_t fromDevice, float remoteLat, float remoteLon, uint8_t remoteSatellites);

// ============================================================
// HAVERSINE DISTANCE (returns meters)
// ============================================================
float haversineDistance(float lat1, float lon1, float lat2, float lon2) {
  const float R = 6371000.0;
  float dLat = (lat2 - lat1) * DEG_TO_RAD;
  float dLon = (lon2 - lon1) * DEG_TO_RAD;
  float a = sin(dLat / 2.0) * sin(dLat / 2.0) +
            cos(lat1 * DEG_TO_RAD) * cos(lat2 * DEG_TO_RAD) *
            sin(dLon / 2.0) * sin(dLon / 2.0);
  return R * 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
}

// ============================================================
// RSSI TO DISTANCE (Path Loss Model - returns meters)
// RSSI = -XX dBm at 1 meter (calibration needed)
// Distance = 10^((RSSI - TX_POWER) / (10 * n))
// n = path loss exponent (2-4, typically 3 for free space)
// ============================================================
int rssiToDistance(int rssi) {
  const int TX_POWER = -40;  // dBm at 1 meter (calibrate based on device)
  const float PATH_LOSS_EXPONENT = 3.0;
  
  if (rssi == 0) return -1;  // Invalid RSSI
  
  float distance = pow(10.0, (float)(TX_POWER - rssi) / (10.0 * PATH_LOSS_EXPONENT));
  return (int)distance;  // Return distance in meters
}

// ============================================================
// CHECK SEPARATION ALERT
// Fires when distance > SEPARATION_ALERT_METERS (200m)
// Clears only when distance <= SEPARATION_CLEAR_METERS (160m)
// BOTH devices must have valid GPS fixes (satellites > 0)
// ============================================================
void checkSeparationAlert(uint8_t fromDevice, float remoteLat, float remoteLon, uint8_t remoteSatellites) {
  if (!gps.location.isValid()) return;
  if (remoteSatellites == 0) return;  // Remote device must have satellite fix
  if (remoteLat == 0.0 && remoteLon == 0.0) return;

  float dist = haversineDistance(
    gps.location.lat(), gps.location.lng(),
    remoteLat, remoteLon
  );
  lastKnownDistance    = dist;
  separationFromDevice = fromDevice;

  if (!separationAlert && dist > SEPARATION_ALERT_METERS) {
    // --- TRIGGER ---
    separationAlert = true;
    sendToPhone("ALERT:TOO_FAR," + String(fromDevice) + "," + String(dist, 1));
    updateDisplay();
  } else if (separationAlert && dist <= SEPARATION_CLEAR_METERS) {
    // --- CLEAR (hysteresis) ---
    separationAlert = false;
    digitalWrite(SOS_LED, LOW);
    digitalWrite(BUZZER,  LOW);
    sepBuzzState = false;
    sendToPhone("ALERT:REGROUPED," + String(fromDevice) + "," + String(dist, 1));
    updateDisplay();
  }
}

// ============================================================
// NON-BLOCKING SEPARATION BUZZER + RED LED PULSE
// 300ms ON / 1000ms OFF — slow pulse distinct from SOS
// Lower priority than SOS and received-SOS alarms
// ============================================================
void handleSeparationAlarmNonBlocking() {
  if (!separationAlert) return;
  if (sosActive || morseActive || receivedSOS || receivedMorse) return;

  unsigned long now      = millis();
  unsigned long interval = sepBuzzState ? SEPARATION_BUZZ_ON_MS : SEPARATION_BUZZ_OFF_MS;

  if (now - lastSepBuzzTime >= interval) {
    lastSepBuzzTime = now;
    sepBuzzState    = !sepBuzzState;
    digitalWrite(SOS_LED, sepBuzzState ? HIGH : LOW);
    digitalWrite(BUZZER,  sepBuzzState ? HIGH : LOW);
  }
}

// ============================================================
// BLE CALLBACKS
// ============================================================
class MyServerCallbacks : public BLEServerCallbacks {
  void addMobile(uint16_t connId) {
    if (connectedMobileCount >= MAX_MOBILE_PHONES) return;

    // Avoid duplicate entries if we somehow get repeated connect events.
    for (uint8_t i = 0; i < connectedMobileCount; i++) {
      if (connectedMobiles[i].connId == connId) return;
    }

    uint8_t id = allocateMobileId();
    if (id == 0) return;

    const uint8_t idx = connectedMobileCount;
    clearMobileSlot(idx);
    connectedMobiles[idx].connId = connId;
    connectedMobiles[idx].mobileID = id;
    connectedMobiles[idx].token = "";
    connectedMobiles[idx].nickname = "Mobile " + String(id);
    connectedMobiles[idx].lastSeen = millis();
    connectedMobiles[idx].isAlert = false;
    connectedMobileCount++;
  }

  bool removeMobileByConnId(uint16_t connId) {
    if (connectedMobileCount == 0) return false;
    for (uint8_t i = 0; i < connectedMobileCount; i++) {
      if (connectedMobiles[i].connId == connId) {
        Serial.print("Removing Mobile ID: ");
        Serial.println(connectedMobiles[i].mobileID);

        // Shift left to keep array compact
        for (uint8_t j = i; j + 1 < connectedMobileCount; j++) {
          connectedMobiles[j] = connectedMobiles[j + 1];
        }
        connectedMobileCount--;
        clearMobileSlot(connectedMobileCount);
        return true;
      }
    }
    return false;
  }

  // Enforce conn_id-based tracking: DO NOT include the parameter-less versions.
  void onConnect(BLEServer* pServer, esp_ble_gatts_cb_param_t *param) override {
    connectedDevices++;

    uint16_t connId = 0xFFFF;
    if (param) connId = param->connect.conn_id;

    Serial.print("Phone Connected! Conn_ID: ");
    Serial.println(connId);

    addMobile(connId);
  }

  void onDisconnect(BLEServer* pServer, esp_ble_gatts_cb_param_t *param) override {
    if (connectedDevices > 0) connectedDevices--;

    uint16_t disconnectedConnId = 0xFFFF;
    if (param) disconnectedConnId = param->disconnect.conn_id;

    Serial.print("Phone Disconnected! Conn_ID: ");
    Serial.println(disconnectedConnId);

    if (disconnectedConnId != 0xFFFF) {
      const bool removed = removeMobileByConnId(disconnectedConnId);
      if (!removed) {
        Serial.println("Warning: conn_id not found in table");
      }
    } else {
      Serial.println("Warning: disconnect conn_id unknown");
    }

    // Keep advertising so new phones can join.
    if (pServer) pServer->startAdvertising();
  }
};

class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String rxValue = pCharacteristic->getValue();
    if (rxValue.length() > 0) bleRxBuffer += rxValue;
  }
};

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);

  // Ensure mobile tracking table starts clean
  clearAllMobiles();

  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED failed");
    while (1);
  }

  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(15, 20);
  display.print("HikeSafe");
  display.setTextSize(1);
  display.setCursor(15, 45);
  display.print("System Booting...");
  display.display();
  delay(3000);

  preferences.begin("sos_app", false);
  sosActive        = preferences.getBool("sos_state", false);
  morseActive      = preferences.getBool("morse_state", false);
  currentLobbyCode = preferences.getUInt("lobby_code", 0);
  lobbyHostActive  = preferences.getBool("lobby_host", false);
  myNickname       = preferences.getString("nickname", "Hiker");
  myECName         = preferences.getString("ec_name", "None");
  myECPhone        = preferences.getString("ec_phone", "0000000000");

  if (currentLobbyCode == 0) {
    lobbyHostActive = false;
    preferences.putBool("lobby_host", false);
  }

  if (sosActive || morseActive) {
    display.clearDisplay();
    display.setCursor(0, 0);
    display.print("RESUMING SOS...");
    display.display();
    delay(1000);
  }

  // --- BLE SETUP ---
  String bleName = "HikeSafe-D" + String(DEVICE_ID);
  BLEDevice::init(bleName.c_str());
  BLEDevice::setMTU(200);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_TX, BLECharacteristic::PROPERTY_NOTIFY);
  pTxCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_RX, BLECharacteristic::PROPERTY_WRITE);
  pRxCharacteristic->setCallbacks(new MyCallbacks());

  pService->start();
  pServer->getAdvertising()->start();

  // --- LORA SETUP ---
  SPI.begin(SCK, MISO, MOSI, SS);
  LoRa.setPins(SS, RST, DI0);
  if (!LoRa.begin(BAND)) {
    display.clearDisplay();
    display.setCursor(0, 0);
    display.print("LORA FAILED");
    display.display();
    while (1);
  }
  LoRa.setTxPower(20);
  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(125E3);
  LoRa.enableCrc();

  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);

  pinMode(BUTTON_SOS,   INPUT_PULLUP);
  pinMode(BUTTON_OKAY,  INPUT_PULLUP);
  pinMode(BUTTON_MORSE, INPUT_PULLUP);

  pinMode(SOS_LED,   OUTPUT);
  pinMode(BUZZER,    OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  digitalWrite(SOS_LED,   LOW);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(BUZZER,    LOW);

  lastSeenTime = millis();
  updateDisplay();
}

// ============================================================
// MAIN LOOP
// ============================================================
void loop() {
  // --- BLE connection management ---
  if (connectedDevices != oldConnectedDevices) {
    if (connectedDevices > oldConnectedDevices) {
      digitalWrite(GREEN_LED, HIGH); delay(200); digitalWrite(GREEN_LED, LOW);
    }
    delay(500);
    pServer->startAdvertising();
    oldConnectedDevices = connectedDevices;
    updateDisplay();
  }

  updateGPS();
  receiveLoRaMessage();
  checkBluetoothCommands();

  // --- Connection timeout ---
  if (!isOffline && (millis() - lastSeenTime >= timeoutInterval) && remoteDevice != 0) {
    isOffline = true;
    sendToPhone("ALERT:OFFLINE," + String(remoteDevice));
    updateDisplay();
  }

  // --- Heartbeat ---
  if (millis() - lastHeartbeatTime >= heartbeatInterval) {
    lastHeartbeatTime = millis();
    if (!sosActive && !morseActive) sendLoRaMessage(MSG_BEAT, 0);
  }

  // --- Active emergency rebroadcast ---
  if (sosActive || morseActive) {
    if (millis() - lastSOSTime >= sosInterval) {
      lastSOSTime = millis();
      sendLoRaMessage(sosActive ? MSG_SOS : MSG_MORSE, 0);
      // Rebroadcast EC with emergency for consistency
      if (currentLobbyCode > 0) {
        sendLoRaEmergencyContact();
      }
    }
  }

  // --- Periodic EC refresh (keep EC data fresh for all devices) ---
  if (currentLobbyCode > 0 && !sosActive && !morseActive) {
    if (millis() - lastECBroadcastTime >= ecBroadcastInterval) {
      lastECBroadcastTime = millis();
      sendLoRaEmergencyContact();
    }
  }

  // --- Buttons ---
  if (digitalRead(BUTTON_SOS) == LOW && !sosActive) triggerSOS();

  if (digitalRead(BUTTON_OKAY) == LOW) {
    if (receivedSOS || receivedMorse) {
      receivedSOS = receivedMorse = false;
      digitalWrite(SOS_LED, LOW);
      digitalWrite(BUZZER,  LOW);
      digitalWrite(GREEN_LED, HIGH); delay(500); digitalWrite(GREEN_LED, LOW);
      updateDisplay();
      delay(500);
    } else if (sosActive || morseActive) {
      triggerOkay();
    } else if (separationAlert) {
      // Manually silence separation alarm via OKAY button
      separationAlert = false;
      digitalWrite(SOS_LED, LOW);
      digitalWrite(BUZZER,  LOW);
      sepBuzzState = false;
      sendToPhone("ALERT:SEP_ACK");
      updateDisplay();
    }
  }

  // --- Morse input ---
  if (digitalRead(BUTTON_MORSE) == LOW) {
    if (!isPressing) {
      isPressing = true;
      pressStart = millis();
    }
  } else {
    if (isPressing) {
      isPressing = false;
      unsigned long pressTime = millis() - pressStart;
      if (pressTime > 20) {
        if (pressTime < DOT_MAX) {
          morseInput += ".";
          sendToPhone("MORSE_DOT");
          digitalWrite(SOS_LED, HIGH); delay(80); digitalWrite(SOS_LED, LOW);
        } else {
          morseInput += "-";
          sendToPhone("MORSE_DASH");
          digitalWrite(SOS_LED, HIGH); delay(200); digitalWrite(SOS_LED, LOW);
        }
        lastTapTime = millis();
        updateDisplay();
      }
    }
  }

  // --- Smart Morse evaluation ---
  if (morseInput.length() > 0) {
    String target = "...---...";
    if (!target.startsWith(morseInput))              checkMorseInput();
    else if (morseInput == target)                   checkMorseInput();
    else if (millis() - lastTapTime > MORSE_TIMEOUT) checkMorseInput();
  }

  // --- Alarm handlers (priority: received SOS > received Morse > separation) ---
  if (receivedSOS) {
    digitalWrite(GREEN_LED, LOW);
    blinkNormalSOSNonBlocking();
  } else if (receivedMorse) {
    digitalWrite(GREEN_LED, LOW);
    blinkMorseSOSNonBlocking();
  } else if (separationAlert) {
    handleSeparationAlarmNonBlocking();
  } else {
    if (!sosActive && !morseActive) {
      digitalWrite(SOS_LED,   LOW);
      digitalWrite(BUZZER,    LOW);
      digitalWrite(GREEN_LED, LOW);
      alarmStep = 0;
    }
  }

  // --- Periodic updates ---
  if (millis() - lastGPSCheck >= 2000) {
    lastGPSCheck = millis();
    sendStatusUpdate();
  }
  if (millis() - lastDisplayUpdate >= 1000) {
    lastDisplayUpdate = millis();
    updateDisplay();
  }
}

// ============================================================
// HELPERS
// ============================================================
void sendToPhone(String msg) {
  if (connectedDevices > 0) {
    msg += "\n";
    pTxCharacteristic->setValue((uint8_t*)msg.c_str(), msg.length());
    pTxCharacteristic->notify();
  }
}

void triggerSOS() {
  sosActive   = true;
  morseActive = false;
  receivedSOS = receivedMorse = false;
  preferences.putBool("sos_state",   true);
  preferences.putBool("morse_state", false);
  sendToPhone("STATUS:SENDING_SOS");

  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(20, 25);
  display.print("SOS ON!");
  display.display();

  // Broadcast SOS from ALL connected mobiles
  for (uint8_t i = 0; i < connectedMobileCount; i++) {
    sendLoRaMessage(MSG_SOS, connectedMobiles[i].mobileID);
  }
  // Also send from device itself
  sendLoRaMessage(MSG_SOS, 0);
  
  // Immediately broadcast EC so receivers know who to contact
  delay(100);
  if (currentLobbyCode > 0) {
    sendLoRaEmergencyContact();
  }
  
  lastSOSTime = millis();

  digitalWrite(SOS_LED, HIGH); delay(1000); digitalWrite(SOS_LED, LOW);
  updateDisplay();
  delay(300);
}

void triggerOkay() {
  sosActive = morseActive = okayActive = false;
  preferences.putBool("sos_state",   false);
  preferences.putBool("morse_state", false);
  sendToPhone("STATUS:SENDING_OK");

  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(25, 25);
  display.print("I'M OK!");
  display.display();

  // Broadcast OK from ALL connected mobiles
  for (uint8_t i = 0; i < connectedMobileCount; i++) {
    sendLoRaMessage(MSG_OKAY, connectedMobiles[i].mobileID);
  }
  // Also send from device itself
  sendLoRaMessage(MSG_OKAY, 0);
  
  digitalWrite(GREEN_LED, HIGH); delay(1000); digitalWrite(GREEN_LED, LOW);
  updateDisplay();
  delay(300);
}

void checkBluetoothCommands() {
  int newlineIdx = bleRxBuffer.indexOf('\n');
  if (newlineIdx == -1) return;

  while (newlineIdx != -1) {
    String cmd = bleRxBuffer.substring(0, newlineIdx);
    bleRxBuffer = bleRxBuffer.substring(newlineIdx + 1);
    cmd.trim();

    if (cmd.length() > 0) {
      if (cmd == "SOS") {
        triggerSOS();
      } else if (cmd == "OK") {
        if (receivedSOS || receivedMorse) {
          receivedSOS = receivedMorse = sosActive = false;
          digitalWrite(SOS_LED, LOW);
          digitalWrite(BUZZER,  LOW);
          updateDisplay();
        } else {
          triggerOkay();
        }
      } else if (cmd == "ON_MY_WAY") {
        // Receiver is responding - send alert to SOS sender
        sendLoRaMessage(MSG_ON_MY_WAY, 0);
        sendToPhone("STATUS:ON_MY_WAY_SENT");
      } else if (cmd.startsWith("LOBBY:")) {
        uint32_t nextCode = cmd.substring(6).toInt();
        // Multi-phone on one device: if we're already hosting this same lobby,
        // don't clear host mode just because another phone re-sent LOBBY:####.
        if (nextCode != currentLobbyCode) {
          lobbyHostActive = false;
          preferences.putBool("lobby_host", false);
        }
        currentLobbyCode = nextCode;
        preferences.putUInt("lobby_code", currentLobbyCode);
        sendToPhone("STATUS:LOBBY_SET," + String(currentLobbyCode));
        // Broadcast own EC when joining a new lobby
        if (currentLobbyCode > 0) {
          delay(200);  // Small delay to ensure device is ready
          sendLoRaEmergencyContact();
          lastECBroadcastTime = millis();
        }
        updateDisplay();
      } else if (cmd.startsWith("HOSTLOBBY:")) {
        // Host creates/owns the lobby on this device.
        currentLobbyCode = cmd.substring(10).toInt();
        preferences.putUInt("lobby_code", currentLobbyCode);
        lobbyHostActive = (currentLobbyCode > 0);
        preferences.putBool("lobby_host", lobbyHostActive);
        sendToPhone("STATUS:LOBBY_SET," + String(currentLobbyCode));

        if (currentLobbyCode > 0) {
          delay(200);
          sendLoRaEmergencyContact();
          lastECBroadcastTime = millis();
        }
        updateDisplay();
      } else if (cmd.startsWith("VERIFY_LOBBY:")) {
        // App asks device to verify that the lobby exists.
        // Format: VERIFY_LOBBY:<code>,<nonce>
        String payload = cmd.substring(12);
        int commaIdx = payload.indexOf(',');
        if (commaIdx > 0) {
          uint32_t code = payload.substring(0, commaIdx).toInt();
          String nonce = payload.substring(commaIdx + 1);
          nonce.trim();

          if (nonce.length() > 0 && code > 0 && code == currentLobbyCode) {
            if (lobbyHostActive) {
              // Local host confirmation for multi-phone-on-one-device.
              sendToPhone("STATUS:LOBBY_VERIFIED," + String(code) + "," + nonce + ",LOCAL");
            } else {
              // Try LoRa verification: broadcast __LOBBY_VERIFY__ and wait for __LOBBY_ACK__.
              pendingLobbyVerifyNonce = nonce;
              pendingLobbyVerifyCode = code;
              sendLoRaTextMessage(0, "__LOBBY_VERIFY__:" + nonce, 0);
            }
          }
        }
      } else if (cmd.startsWith("NICK:")) {
        myNickname = cmd.substring(5);
        if (myNickname.length() >= MAX_NICK_LEN)
          myNickname = myNickname.substring(0, MAX_NICK_LEN - 1);
        preferences.putString("nickname", myNickname);
        sendToPhone("STATUS:NICK_SET," + myNickname);
        sendLoRaNickname();
        updateDisplay();
      } else if (cmd.startsWith("EC:")) {
        int commaIdx = cmd.indexOf(',', 3);
        if (commaIdx > 0) {
          myECName  = cmd.substring(3, commaIdx);
          myECPhone = cmd.substring(commaIdx + 1);
          if (myECName.length()  >= MAX_EC_NAME)  myECName  = myECName.substring(0, MAX_EC_NAME - 1);
          if (myECPhone.length() >= MAX_EC_PHONE) myECPhone = myECPhone.substring(0, MAX_EC_PHONE - 1);
          preferences.putString("ec_name",  myECName);
          preferences.putString("ec_phone", myECPhone);
          sendToPhone("STATUS:EC_SET");
          // Immediately broadcast EC to all group members
          if (currentLobbyCode > 0) {
            sendLoRaEmergencyContact();
            lastECBroadcastTime = millis();
          }
          updateDisplay();
        }
      } else if (cmd.startsWith("MSG:")) {
        int commaIdx = cmd.indexOf(',', 4);
        if (commaIdx > 0) {
          int    toDevice = cmd.substring(4, commaIdx).toInt();
          String msgText  = cmd.substring(commaIdx + 1);
          sendLoRaTextMessage(toDevice, msgText, 0);
          sendToPhone("ECHO_MSG:" + String(toDevice) + "," + msgText);
        }
      } else if (cmd.startsWith("CLAIM:")) {
        // Multi-phone identity handshake.
        // Phone sends: CLAIM:<token>
        // Device replies (broadcast to all phones): CLAIMED:<token>,<mobileId>
        String token = cmd.substring(6);
        token.trim();
        if (token.length() > 0) {
          int existingIdx = -1;
          for (uint8_t i = 0; i < connectedMobileCount; i++) {
            if (connectedMobiles[i].token == token) {
              existingIdx = i;
              break;
            }
          }

          if (existingIdx >= 0) {
            connectedMobiles[existingIdx].lastSeen = millis();
            sendToPhone("CLAIMED:" + token + "," + String(connectedMobiles[existingIdx].mobileID));
          } else {
            // Best-effort: assign this token to the newest connected slot without a token.
            int bestIdx = -1;
            unsigned long bestSeen = 0;
            for (uint8_t i = 0; i < connectedMobileCount; i++) {
              if (connectedMobiles[i].token.length() > 0) continue;
              if (bestIdx < 0 || connectedMobiles[i].lastSeen >= bestSeen) {
                bestIdx = i;
                bestSeen = connectedMobiles[i].lastSeen;
              }
            }

            if (bestIdx >= 0) {
              connectedMobiles[bestIdx].token = token;
              connectedMobiles[bestIdx].lastSeen = millis();
              sendToPhone("CLAIMED:" + token + "," + String(connectedMobiles[bestIdx].mobileID));
            } else {
              // No available slots (or no connected mobiles tracked).
              sendToPhone("CLAIMED:" + token + ",0");
            }
          }
        }
      } else if (cmd.startsWith("PLOC:")) {
        // Phone location relay into the LoRa mesh.
        // Format: PLOC:<token>,<mobileId>,<lat>,<lng>[,<sats>]
        String payload = cmd.substring(5);
        payload.trim();

        int i1 = payload.indexOf(',');
        int i2 = i1 >= 0 ? payload.indexOf(',', i1 + 1) : -1;
        int i3 = i2 >= 0 ? payload.indexOf(',', i2 + 1) : -1;
        int i4 = i3 >= 0 ? payload.indexOf(',', i3 + 1) : -1;

        if (i1 > 0 && i2 > i1 && i3 > i2) {
          const String token = payload.substring(0, i1);
          const uint8_t mobileId = (uint8_t)payload.substring(i1 + 1, i2).toInt();
          const float lat = payload.substring(i2 + 1, i3).toFloat();
          const float lng = (i4 >= 0 ? payload.substring(i3 + 1, i4) : payload.substring(i3 + 1)).toFloat();
          const uint8_t sats = (i4 >= 0 ? (uint8_t)payload.substring(i4 + 1).toInt() : 0);

          if (mobileId >= 1 && mobileId <= MAX_MOBILE_PHONES && !(lat == 0.0 && lng == 0.0)) {
            // Update local tracking table (best-effort validation using token).
            for (uint8_t i = 0; i < connectedMobileCount; i++) {
              if (connectedMobiles[i].mobileID != mobileId) continue;
              if (connectedMobiles[i].token.length() > 0 && connectedMobiles[i].token != token) {
                // Token mismatch: ignore (prevents accidental cross-talk between phones)
                break;
              }

              if (connectedMobiles[i].token.length() == 0) {
                connectedMobiles[i].token = token;
              }

              connectedMobiles[i].latitude = lat;
              connectedMobiles[i].longitude = lng;
              connectedMobiles[i].lastSeen = millis();
              break;
            }

            // Broadcast this phone's location over LoRa as a heartbeat tagged with mobileID.
            if (currentLobbyCode > 0) {
              sendLoRaLocationMessage(MSG_BEAT, mobileId, lat, lng, sats);
            }

            // Also forward to all connected phones for local visualization.
            sendToPhone(
              "MOBILELOC:" + String(DEVICE_ID) + "," + String(mobileId) + "," + String(lat, 6) + "," + String(lng, 6) + ",0,0"
            );
          }
        }
      }
    }
    newlineIdx = bleRxBuffer.indexOf('\n');
  }
}

void sendStatusUpdate() {
  String packet = "SELF:";
  if (gps.location.isValid())
    packet += String(gps.location.lat(), 6) + "," + String(gps.location.lng(), 6) + ",";
  else
    packet += "0.0,0.0,";

  packet += String(gps.satellites.value()) + "," +
            String(lastRssi) + "," +
            String(connectedDevices);

  if (lastKnownDistance >= 0)
    packet += "," + String(lastKnownDistance, 1);
  else
    packet += ",---";

  sendToPhone(packet);

  // Send mobile locations (best-effort). Use MOBILELOC so phones can associate mobiles with a device.
  for (uint8_t i = 0; i < connectedMobileCount; i++) {
    if (connectedMobiles[i].mobileID == 0) continue;
    if (connectedMobiles[i].latitude == 0.0 && connectedMobiles[i].longitude == 0.0) continue;
    String mobilePacket = "MOBILELOC:";
    mobilePacket += String(DEVICE_ID) + ",";
    mobilePacket += String(connectedMobiles[i].mobileID) + ",";
    mobilePacket += String(connectedMobiles[i].latitude, 6) + ",";
    mobilePacket += String(connectedMobiles[i].longitude, 6) + ",";
    mobilePacket += String(connectedMobiles[i].lastRssi) + ",";
    mobilePacket += String(connectedMobiles[i].estimatedDistance);
    sendToPhone(mobilePacket);
  }
}

// ============================================================
// LORA SEND
// ============================================================
void sendLoRaMessage(uint8_t msgType, uint8_t mobileID) {
  const float lat = gps.location.isValid() ? gps.location.lat() : 0.0;
  const float lng = gps.location.isValid() ? gps.location.lng() : 0.0;
  const uint8_t sats = (uint8_t)gps.satellites.value();
  sendLoRaLocationMessage(msgType, mobileID, lat, lng, sats);
}

void sendLoRaLocationMessage(uint8_t msgType, uint8_t mobileID, float lat, float lng, uint8_t satellites) {
  LoRaMessage msg;
  msg.lobbyCode  = currentLobbyCode;
  msg.deviceID   = DEVICE_ID;
  msg.mobileID   = mobileID;
  msg.msgType    = msgType;
  msg.latitude   = lat;
  msg.longitude  = lng;
  msg.satellites = satellites;
  msg.rssi       = 0;  // Set to 0 when sending (will be known by receiver)
  LoRa.beginPacket();
  LoRa.write((uint8_t*)&msg, sizeof(msg));
  LoRa.endPacket();
}

void sendLoRaTextMessage(uint8_t targetDevice, String message, uint8_t mobileID) {
  LoRaTextMessage textMsg;
  textMsg.lobbyCode = currentLobbyCode;
  textMsg.deviceID  = DEVICE_ID;
  textMsg.mobileID  = mobileID;
  textMsg.msgType   = MSG_TEXT;
  textMsg.targetID  = targetDevice;
  textMsg.rssi      = 0;  // Set to 0 when sending
  strncpy(textMsg.text, message.c_str(), MAX_TEXT_LEN - 1);
  textMsg.text[MAX_TEXT_LEN - 1] = '\0';
  LoRa.beginPacket();
  LoRa.write((uint8_t*)&textMsg, sizeof(textMsg));
  LoRa.endPacket();
}

void sendLoRaNickname() {
  if (currentLobbyCode == 0) return;
  LoRaNickMessage nickMsg;
  nickMsg.lobbyCode = currentLobbyCode;
  nickMsg.deviceID  = DEVICE_ID;
  nickMsg.mobileID  = 0;  // Device sending, not a specific mobile
  nickMsg.msgType   = MSG_NICK;
  nickMsg.rssi      = 0;
  strncpy(nickMsg.nickname, myNickname.c_str(), MAX_NICK_LEN - 1);
  nickMsg.nickname[MAX_NICK_LEN - 1] = '\0';
  LoRa.beginPacket();
  LoRa.write((uint8_t*)&nickMsg, sizeof(nickMsg));
  LoRa.endPacket();
}

void sendLoRaEmergencyContact() {
  if (currentLobbyCode == 0) return;
  LoRaECMessage ecMsg;
  ecMsg.lobbyCode = currentLobbyCode;
  ecMsg.deviceID  = DEVICE_ID;
  ecMsg.mobileID  = 0;  // Device sending, not a specific mobile
  ecMsg.msgType   = MSG_EC;
  ecMsg.rssi      = 0;
  strncpy(ecMsg.ecName,  myECName.c_str(),  MAX_EC_NAME  - 1);
  strncpy(ecMsg.ecPhone, myECPhone.c_str(), MAX_EC_PHONE - 1);
  ecMsg.ecName[MAX_EC_NAME   - 1] = '\0';
  ecMsg.ecPhone[MAX_EC_PHONE - 1] = '\0';
  LoRa.beginPacket();
  LoRa.write((uint8_t*)&ecMsg, sizeof(ecMsg));
  LoRa.endPacket();
}

// ============================================================
// LORA RECEIVE
// ============================================================
void receiveLoRaMessage() {
  int packetSize = LoRa.parsePacket();
  if (packetSize == 0) return;
  
  int currentRssi = LoRa.packetRssi();  // Get RSSI for this packet

  if (packetSize == sizeof(LoRaMessage)) {
    LoRaMessage msg;
    LoRa.readBytes((uint8_t*)&msg, sizeof(msg));
    if (msg.lobbyCode != currentLobbyCode) return;
    if (msg.deviceID  == DEVICE_ID)        return;

    remoteDevice = msg.deviceID;
    lastRssi     = currentRssi;
    lastSeenTime = millis();

    // If this message came from a mobile (mobileID 1..4), forward its location to phones.
    // Do NOT tie remote mobiles to this device's locally-connected phone table.
    if (msg.mobileID > 0 && msg.mobileID <= MAX_MOBILE_PHONES) {
      // Forward mobile location for rendering as a sub-dot under the remote device.
      sendToPhone(
        "MOBILELOC:" + String(msg.deviceID) + "," + String(msg.mobileID) + "," +
        String(msg.latitude, 6) + "," + String(msg.longitude, 6) + "," +
        String(currentRssi) + "," + String(rssiToDistance(currentRssi))
      );
    }

    if (isOffline) {
      isOffline = false;
      sendToPhone("ALERT:ONLINE," + String(remoteDevice));
    }

    // Run separation checks on device-level packets (mobileID==0) only.
    if (msg.mobileID == 0 &&
        (msg.msgType == MSG_SOS   ||
         msg.msgType == MSG_MORSE ||
         msg.msgType == MSG_OKAY  ||
         msg.msgType == MSG_BEAT)) {
      checkSeparationAlert(msg.deviceID, msg.latitude, msg.longitude, msg.satellites);
    }

    String alert = "ALERT:";
    if (msg.msgType == MSG_SOS) {
      alert += "SOS,";
      receivedSOS = true;
    } else if (msg.msgType == MSG_MORSE) {
      alert += "MORSE,";
      receivedMorse = true;
    } else if (msg.msgType == MSG_OKAY) {
      alert += "OK,";
      receivedSOS = receivedMorse = false;
      digitalWrite(GREEN_LED, HIGH); delay(500); digitalWrite(GREEN_LED, LOW);
    } else if (msg.msgType == MSG_ON_MY_WAY) {
      alert += "ON_MY_WAY,";
      // Receiver is coming to help - keep SOS active but show different indicator
    } else if (msg.msgType == MSG_BEAT) {
      if (msg.mobileID == 0) {
        // Forward regular device location updates to connected phone(s)
        // so the app can show live tracking even without SOS.
        String loc = "LOC:";
        loc += String(msg.deviceID) + ",";
        loc += String(msg.latitude, 6) + ",";
        loc += String(msg.longitude, 6) + ",";
        loc += String(msg.satellites) + ",";
        loc += String(currentRssi);
        sendToPhone(loc);
        updateDisplay();
        return;
      }

      // Mobile heartbeat already forwarded above via MOBILELOC.
      updateDisplay();
      return;
    }

    alert += String(msg.deviceID) + "," +
             String(msg.latitude,  6) + "," +
             String(msg.longitude, 6);
    sendToPhone(alert);
    updateDisplay();

  } else if (packetSize == sizeof(LoRaTextMessage)) {
    LoRaTextMessage txtMsg;
    LoRa.readBytes((uint8_t*)&txtMsg, sizeof(txtMsg));
    if (txtMsg.lobbyCode != currentLobbyCode)                  return;
    if (txtMsg.targetID  != DEVICE_ID && txtMsg.targetID != 0) return;
    if (txtMsg.deviceID  == DEVICE_ID)                         return;

    lastRssi     = currentRssi;
    lastSeenTime = millis();
    if (isOffline) isOffline = false;

    // Update mobile device info if this message came from a mobile
    if (txtMsg.mobileID > 0 && txtMsg.mobileID <= MAX_MOBILE_PHONES) {
      for (uint8_t i = 0; i < connectedMobileCount; i++) {
        if (connectedMobiles[i].mobileID == txtMsg.mobileID) {
          connectedMobiles[i].lastRssi = currentRssi;
          connectedMobiles[i].estimatedDistance = rssiToDistance(currentRssi);
          connectedMobiles[i].lastSeen = millis();
          break;
        }
      }
    }

    txtMsg.text[MAX_TEXT_LEN - 1] = '\0';

    // --- Lobby verification handshake ---
    // Joiner broadcasts: __LOBBY_VERIFY__:<nonce>
    // Any device in the same lobby responds directly: __LOBBY_ACK__:<nonce>
    String text = String(txtMsg.text);
    if (text.startsWith("__LOBBY_VERIFY__:")) {
      const String nonce = text.substring(String("__LOBBY_VERIFY__:").length());
      if (nonce.length() > 0) {
        sendLoRaTextMessage(txtMsg.deviceID, "__LOBBY_ACK__:" + nonce, 0);
      }
      // Don't forward verification pings to phones as chat messages.
      return;
    }

    // If we're verifying a lobby via LoRa, capture the ACK and inform the phone.
    if (text.startsWith("__LOBBY_ACK__:")) {
      const String nonce = text.substring(String("__LOBBY_ACK__:").length());
      if (pendingLobbyVerifyNonce.length() > 0 && nonce == pendingLobbyVerifyNonce && pendingLobbyVerifyCode == currentLobbyCode) {
        sendToPhone("STATUS:LOBBY_VERIFIED," + String(currentLobbyCode) + "," + nonce + ",LORA");
        pendingLobbyVerifyNonce = "";
        pendingLobbyVerifyCode = 0;
      }
      // Don't forward ACKs to phones as chat messages.
      return;
    }

    sendToPhone("MSG:" + String(txtMsg.deviceID) + ",M" + String(txtMsg.mobileID) + "," + text + ",RSSI:" + String(currentRssi));
    digitalWrite(GREEN_LED, HIGH); delay(200); digitalWrite(GREEN_LED, LOW);
    updateDisplay();

  } else if (packetSize == sizeof(LoRaNickMessage)) {
    LoRaNickMessage nickMsg;
    LoRa.readBytes((uint8_t*)&nickMsg, sizeof(nickMsg));
    if (nickMsg.lobbyCode != currentLobbyCode) return;
    if (nickMsg.deviceID  == DEVICE_ID)        return;

    lastRssi     = LoRa.packetRssi();
    lastSeenTime = millis();
    if (isOffline) isOffline = false;

    nickMsg.nickname[MAX_NICK_LEN - 1] = '\0';
    sendToPhone("NICK:" + String(nickMsg.deviceID) + "," + String(nickMsg.nickname));
    updateDisplay();

  } else if (packetSize == sizeof(LoRaECMessage)) {
    LoRaECMessage ecMsg;
    LoRa.readBytes((uint8_t*)&ecMsg, sizeof(ecMsg));
    if (ecMsg.lobbyCode != currentLobbyCode) return;
    if (ecMsg.deviceID  == DEVICE_ID)        return;

    lastRssi     = LoRa.packetRssi();
    lastSeenTime = millis();
    if (isOffline) isOffline = false;

    ecMsg.ecName[MAX_EC_NAME   - 1] = '\0';
    ecMsg.ecPhone[MAX_EC_PHONE - 1] = '\0';
    sendToPhone("EC:" + String(ecMsg.deviceID) + "," +
                String(ecMsg.ecName) + "," + String(ecMsg.ecPhone));
    updateDisplay();
  }
}

// ============================================================
// GPS
// ============================================================
void updateGPS() {
  while (gpsSerial.available() > 0) gps.encode(gpsSerial.read());
}

// ============================================================
// DISPLAY
// ============================================================
void updateDisplay() {
  display.clearDisplay();

  // --- TOP STATUS BAR ---
  display.fillRect(0, 0, 128, 14, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setTextSize(1);

  display.setCursor(2, 3);
  display.print("D"); display.print(DEVICE_ID);

  display.setCursor(25, 3);
  display.print("L:"); display.print(currentLobbyCode);

  display.setCursor(65, 3);
  if (gps.location.isValid()) {
    display.print("SAT:"); display.print(gps.satellites.value());
  } else {
    display.print("NO FIX");
  }

  display.setCursor(102, 3);
  if (connectedDevices > 0) {
    display.print("BL:"); display.print(connectedDevices);
  } else {
    display.print("PAIR");
  }

  // --- MAIN ZONE ---
  display.setTextColor(SSD1306_WHITE);

  if (sosActive || morseActive) {
    display.setTextSize(2);
    display.setCursor(15, 24);
    display.print("TX SOS!");
    display.setTextSize(1);
  } else if (separationAlert) {
    display.setTextSize(2);
    display.setCursor(5, 18);
    display.print("TOO FAR!");
    display.setTextSize(1);
    display.setCursor(10, 38);
    if (lastKnownDistance >= 0) {
      display.print("Dist: ");
      display.print((int)lastKnownDistance);
      display.print("m");
    }
  } else if (morseInput.length() > 0) {
    display.setTextSize(2);
    display.setCursor(15, 24);
    display.print(morseInput);
    display.setTextSize(1);
  } else {
    display.setTextSize(1);
    if (gps.location.isValid()) {
      display.setCursor(0, 20);
      display.print("LAT: "); display.print(gps.location.lat(), 6);
      display.setCursor(0, 32);
      display.print("LON: "); display.print(gps.location.lng(), 6);
      if (lastKnownDistance >= 0) {
        display.setCursor(0, 44);
        display.print("DIST: ");
        display.print((int)lastKnownDistance);
        display.print("m");
      }
    } else {
      display.setCursor(25, 20);
      display.print("Searching for");
      display.setCursor(25, 32);
      display.print("Satellites...");
    }
  }

  // --- BOTTOM ALERT BAR ---
  display.drawLine(0, 48, 128, 48, SSD1306_WHITE);

  if (receivedSOS) {
    display.fillRect(0, 49, 128, 15, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(4, 53);
    display.print("!!! SOS FROM D"); display.print(remoteDevice); display.print(" !!!");
  } else if (receivedMorse) {
    display.fillRect(0, 49, 128, 15, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(4, 53);
    display.print("! MORSE FROM D"); display.print(remoteDevice); display.print(" !");
  } else if (separationAlert) {
    display.fillRect(0, 49, 128, 15, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(4, 53);
    display.print("D"); display.print(separationFromDevice);
    display.print(" >200m AWAY!");   // <-- fixed from >300m
  } else {
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 53);
    if (isOffline && remoteDevice != 0) {
      display.print("! D"); display.print(remoteDevice); display.print(" IS OFFLINE !");
    } else if (lastRssi != 0) {
      display.print("RSSI:"); display.print(lastRssi);
      display.print("dBm");
      if (lastKnownDistance >= 0) {
        display.print(" "); display.print((int)lastKnownDistance); display.print("m");
      }
    } else {
      display.print("System Ready");
    }
  }

  display.display();
}

// ============================================================
// MORSE
// ============================================================
void checkMorseInput() {
  if (morseInput == "...---...") {
    morseActive = true;
    sosActive   = false;
    preferences.putBool("morse_state", true);
    preferences.putBool("sos_state",   false);
    sendToPhone("STATUS:SENDING_MORSE_SOS");
    
    // Broadcast MORSE from ALL connected mobiles
    for (uint8_t i = 0; i < connectedMobileCount; i++) {
      sendLoRaMessage(MSG_MORSE, connectedMobiles[i].mobileID);
    }
    // Also send from device itself
    sendLoRaMessage(MSG_MORSE, 0);
    
    // Immediately broadcast EC so receivers know who to contact
    delay(100);
    if (currentLobbyCode > 0) {
      sendLoRaEmergencyContact();
    }
    
    lastSOSTime = millis();

    display.clearDisplay();
    display.setTextSize(2);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(20, 25);
    display.print("SOS ON!");
    display.display();

    digitalWrite(SOS_LED, HIGH); delay(1000); digitalWrite(SOS_LED, LOW);
  } else {
    display.clearDisplay();
    display.setTextSize(2);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(20, 25);
    display.print("INVALID");
    display.display();

    sendToPhone("STATUS:MORSE_FAIL");
    digitalWrite(BUZZER, HIGH); delay(1000); digitalWrite(BUZZER, LOW);
  }
  morseInput = "";
  updateDisplay();
}

// ============================================================
// ALARM BLINK HELPERS
// ============================================================
void blinkNormalSOSNonBlocking() {
  unsigned long now = millis();
  if (now - alarmStartTime >= 200) {
    alarmStartTime = now;
    alarmLedState  = !alarmLedState;
    digitalWrite(SOS_LED, alarmLedState ? HIGH : LOW);
    digitalWrite(BUZZER,  alarmLedState ? HIGH : LOW);
  }
}

void blinkMorseSOSNonBlocking() {
  unsigned long now = millis();
  if (now - alarmStartTime >= 300) {
    alarmStartTime = now;
    alarmLedState  = !alarmLedState;
    digitalWrite(SOS_LED, alarmLedState ? HIGH : LOW);
    digitalWrite(BUZZER,  alarmLedState ? HIGH : LOW);
  }
}