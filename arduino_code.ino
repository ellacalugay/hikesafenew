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
#include <queue>
#include <Crypto.h>
#include <AES.h>

std::queue<String> bleCommandQueue; // Declare BLE command queue

AES aes; // Declare AES object
byte aesKey[16] = {0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F}; // Declare AES key

#ifdef ESP32
#include <esp_gatts_api.h>
#endif

// --- CONFIGURATION ---
#define DEVICE_ID 2

// --- SEPARATION ALERT CONFIGURATION ---
#define SEPARATION_ALERT_METERS  100  // alert fires at 100m
#define SEPARATION_CLEAR_METERS  50   // clears when back within 50m
#define SEPARATION_BUZZ_ON_MS    300  // Red LED + buzzer ON per pulse
#define SEPARATION_BUZZ_OFF_MS  1000  // Gap between pulses

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

uint32_t oldConnectedMobileCount = 0; 

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
bool gpsWarningPrinted = false;

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
  uint16_t connId;      
  uint8_t mobileID;
  String token;         
  String nickname;
  unsigned long lastSeen;
  bool isInLobby; // New flag to track lobby participation per phone
  bool isAlert;
  int lastRssi;         
  float latitude;       
  float longitude;
  int estimatedDistance; 
};
ConnectedMobile connectedMobiles[MAX_MOBILE_PHONES];
uint8_t connectedMobileCount = 0;

void clearMobileSlot(uint8_t idx) {
  if (idx >= MAX_MOBILE_PHONES) return;
  connectedMobiles[idx].connId = 0xFFFF;
  connectedMobiles[idx].mobileID = 0;
  connectedMobiles[idx].token = "";
  connectedMobiles[idx].nickname = "";
  connectedMobiles[idx].lastSeen = 0;
  connectedMobiles[idx].isInLobby = false; // Reset lobby flag
  connectedMobiles[idx].isAlert = false;
  connectedMobiles[idx].lastRssi = 0;
  connectedMobiles[idx].latitude = 0.0;
  connectedMobiles[idx].longitude = 0.0;
  connectedMobiles[idx].estimatedDistance = -1;
}

void clearAllMobiles() {
  connectedMobileCount = 0;
  for (uint8_t i = 0; i < MAX_MOBILE_PHONES; i++) {
    clearMobileSlot(i);
  }
}

uint8_t allocateMobileId() {
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
const unsigned long ecBroadcastInterval = 45000;  

uint32_t currentLobbyCode = 0;
bool lobbyHostActive = false;                 
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
  uint8_t  mobileID;    
  uint8_t  msgType;
  float    latitude;
  float    longitude;
  uint8_t  satellites;
  int      rssi;        
};

struct LoRaTextMessage {
  uint32_t lobbyCode;
  uint8_t  deviceID;
  uint8_t  mobileID;    
  uint8_t  msgType;
  uint8_t  targetID;
  int      rssi;        
  char     text[MAX_TEXT_LEN];
};

struct LoRaNickMessage {
  uint32_t lobbyCode;
  uint8_t  deviceID;
  uint8_t  mobileID;    
  uint8_t  msgType;
  int      rssi;        
  char     nickname[MAX_NICK_LEN];
};

struct LoRaECMessage {
  uint32_t lobbyCode;
  uint8_t  deviceID;
  uint8_t  mobileID;    
  uint8_t  msgType;
  int      rssi;        
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
// HAVERSINE DISTANCE
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

int rssiToDistance(int rssi) {
  const int TX_POWER = -40;  
  const float PATH_LOSS_EXPONENT = 3.0;
  if (rssi == 0) return -1;  
  float distance = pow(10.0, (float)(TX_POWER - rssi) / (10.0 * PATH_LOSS_EXPONENT));
  return (int)distance;  
}

void checkSeparationAlert(uint8_t fromDevice, float remoteLat, float remoteLon, uint8_t remoteSatellites) {
  if (!gps.location.isValid()) return;
  if (remoteSatellites == 0) return;  
  if (remoteLat == 0.0 && remoteLon == 0.0) return;

  float dist = haversineDistance(
    gps.location.lat(), gps.location.lng(),
    remoteLat, remoteLon
  );
  lastKnownDistance    = dist;
  separationFromDevice = fromDevice;

  if (!separationAlert && dist > SEPARATION_ALERT_METERS) {
    Serial.printf("[WARN] Separation Alert! Dist: %.1fm\n", dist);
    separationAlert = true;
    sendToPhone("ALERT:TOO_FAR," + String(fromDevice) + "," + String(dist, 1));
    updateDisplay(); // Important alerts update display immediately
  } else if (separationAlert && dist <= SEPARATION_CLEAR_METERS) {
    Serial.printf("[INFO] Regrouped. Dist: %.1fm\n", dist);
    separationAlert = false;
    digitalWrite(SOS_LED, LOW);
    digitalWrite(BUZZER,  LOW);
    sepBuzzState = false;
    sendToPhone("ALERT:REGROUPED," + String(fromDevice) + "," + String(dist, 1));
    updateDisplay();
  }
}

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
    // FIX 1: Prevent silent fail/memory leak by kicking oldest inactive phone if full
    if (connectedMobileCount >= MAX_MOBILE_PHONES) {
      int oldestIdx = 0;
      unsigned long oldestTime = connectedMobiles[0].lastSeen;
      for (uint8_t i = 1; i < connectedMobileCount; i++) {
        if (connectedMobiles[i].lastSeen < oldestTime) {
          oldestTime = connectedMobiles[i].lastSeen;
          oldestIdx = i;
        }
      }
      Serial.printf("[WARN] BLE Slots full. Forcing removal of inactive M%d\n", connectedMobiles[oldestIdx].mobileID);
      for (uint8_t j = oldestIdx; j + 1 < connectedMobileCount; j++) {
        connectedMobiles[j] = connectedMobiles[j + 1];
      }
      connectedMobileCount--;
      clearMobileSlot(connectedMobileCount);
    }

    for (uint8_t i = 0; i < connectedMobileCount; i++) {
      if (connectedMobiles[i].connId == connId) return;
    }

    uint8_t id = allocateMobileId();
    if (id == 0) return;

    const uint8_t idx = connectedMobileCount;
    clearMobileSlot(idx);
    connectedMobiles[idx].connId = connId;
    connectedMobiles[idx].mobileID = id;
    connectedMobiles[idx].nickname = "Mobile " + String(id);
    connectedMobiles[idx].lastSeen = millis();
    connectedMobileCount++;
    Serial.printf("[BLE] Mobile Assigned: M%d\n", id);
  }

  bool removeMobileByConnId(uint16_t connId) {
    if (connectedMobileCount == 0) return false;
    for (uint8_t i = 0; i < connectedMobileCount; i++) {
      if (connectedMobiles[i].connId == connId) {
        Serial.printf("[BLE] Removing Mobile ID: M%d\n", connectedMobiles[i].mobileID);
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

  void onConnect(BLEServer* pServer, esp_ble_gatts_cb_param_t *param) override {
    uint16_t connId = param ? param->connect.conn_id : 0xFFFF;
    Serial.printf("[BLE] Phone Connected! Conn_ID: %d\n", connId);
    addMobile(connId);
  }

  void onDisconnect(BLEServer* pServer, esp_ble_gatts_cb_param_t *param) override {
    uint16_t disconnectedConnId = param ? param->disconnect.conn_id : 0xFFFF;
    Serial.printf("[BLE] Phone Disconnected! Conn_ID: %d\n", disconnectedConnId);
    if (disconnectedConnId != 0xFFFF) removeMobileByConnId(disconnectedConnId);
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
void setupPreferences() {
  preferences.begin("hikesafe", false);
  currentLobbyCode = preferences.getUInt("lobby_code", 0);
  lobbyHostActive = preferences.getBool("lobby_host", false);
  myNickname = preferences.getString("nickname", "Hiker");
  myECName = preferences.getString("ec_name", "None");
  myECPhone = preferences.getString("ec_phone", "0000000000");

  // Enforce 4-digit lobby codes only (1000-9999). Clear any legacy/invalid stored value.
  if (currentLobbyCode != 0 && (currentLobbyCode < 1000 || currentLobbyCode > 9999)) {
    Serial.printf("[WARN] Invalid saved lobby_code=%lu; clearing to 0\n", (unsigned long)currentLobbyCode);
    currentLobbyCode = 0;
    lobbyHostActive = false;
    preferences.putUInt("lobby_code", 0);
    preferences.putBool("lobby_host", false);
  }
}

void saveLobbyPreferences(uint32_t lobbyCode, bool isHost) {
  preferences.putUInt("lobby_code", lobbyCode);
  preferences.putBool("lobby_host", isHost);
  logLobbyEvent("Lobby preferences saved: Code=" + String(lobbyCode) + ", Host=" + String(isHost));
}

void saveUserPreferences(const String& nickname, const String& ecName, const String& ecPhone) {
  preferences.putString("nickname", nickname);
  preferences.putString("ec_name", ecName);
  preferences.putString("ec_phone", ecPhone);
  logLobbyEvent("User preferences saved: Nickname=" + nickname + ", EC Name=" + ecName + ", EC Phone=" + ecPhone);
}

void setup() {
  Serial.begin(115200);
  setupPreferences();
  Serial.println("\n[INFO] --- Booting HikeSafe ---");
  clearAllMobiles();

  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("[ERROR] OLED failed");
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

  // --- BLE SETUP ---
  String bleName = "HikeSafe-D" + String(DEVICE_ID);
  BLEDevice::init(bleName.c_str());
  BLEDevice::setMTU(200);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_TX, BLECharacteristic::PROPERTY_NOTIFY);
  pTxCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_RX, BLECharacteristic::PROPERTY_WRITE);
  pRxCharacteristic->setCallbacks(new MyCallbacks());

  pService->start();
  pServer->getAdvertising()->start();

  // --- LORA SETUP ---
  SPI.begin(SCK, MISO, MOSI, SS);
  LoRa.setPins(SS, RST, DI0);
  if (!LoRa.begin(BAND)) {
    Serial.println("[ERROR] LORA FAILED");
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
  if (connectedMobileCount != oldConnectedMobileCount) {
    if (connectedMobileCount > oldConnectedMobileCount) {
      digitalWrite(GREEN_LED, HIGH); delay(200); digitalWrite(GREEN_LED, LOW);
    }
    delay(500);
    pServer->startAdvertising(); 
    oldConnectedMobileCount = connectedMobileCount;
    updateDisplay();
  }

  updateGPS();
  receiveLoRaMessage();
  checkBluetoothCommands();

  if (millis() > 10000 && gps.charsProcessed() < 10 && !gpsWarningPrinted) {
      Serial.println("[ERROR] GPS: No data received.");
      gpsWarningPrinted = true;
  }

  if (!isOffline && (millis() - lastSeenTime >= timeoutInterval) && remoteDevice != 0) {
    isOffline = true;
    sendToPhone("ALERT:OFFLINE," + String(remoteDevice));
    updateDisplay();
  }

  if (millis() - lastHeartbeatTime >= heartbeatInterval) {
    lastHeartbeatTime = millis();
    if (!sosActive && !morseActive) sendLoRaMessage(MSG_BEAT, 0);
  }

  if (sosActive || morseActive) {
    if (millis() - lastSOSTime >= sosInterval) {
      lastSOSTime = millis();
      sendLoRaMessage(sosActive ? MSG_SOS : MSG_MORSE, 0);
      if (currentLobbyCode > 0) sendLoRaEmergencyContact();
    }
  }

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
      separationAlert = false;
      digitalWrite(SOS_LED, LOW);
      digitalWrite(BUZZER,  LOW);
      sepBuzzState = false;
      sendToPhone("ALERT:SEP_ACK");
      updateDisplay();
    }
  }

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
        // FIX 4: Removed spammy updateDisplay() here. Loop handles it.
      }
    }
  }

  if (morseInput.length() > 0) {
    String target = "...---...";
    if (!target.startsWith(morseInput))              checkMorseInput();
    else if (morseInput == target)                   checkMorseInput();
    else if (millis() - lastTapTime > MORSE_TIMEOUT) checkMorseInput();
  }

  if (receivedSOS) {
    digitalWrite(GREEN_LED, LOW);
    blinkNormalSOSNonBlocking();
  } else if (receivedMorse) {
    digitalWrite(GREEN_LED, LOW);
    blinkMorseSOSNonBlocking();
  } else if (sosActive) {
    digitalWrite(GREEN_LED, LOW);
    blinkNormalSOSNonBlocking();
  } else if (morseActive) {
    digitalWrite(GREEN_LED, LOW);
    blinkMorseSOSNonBlocking();
  } else if (separationAlert) {
    handleSeparationAlarmNonBlocking();
  } else {
    digitalWrite(SOS_LED,   LOW);
    digitalWrite(BUZZER,    LOW);
    digitalWrite(GREEN_LED, LOW);
    alarmStep = 0;
  }

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
  if (connectedMobileCount > 0) {
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

  for (uint8_t i = 0; i < connectedMobileCount; i++) {
    sendLoRaMessage(MSG_SOS, connectedMobiles[i].mobileID);
  }
  sendLoRaMessage(MSG_SOS, 0);
  
  delay(100);
  if (currentLobbyCode > 0) sendLoRaEmergencyContact();
  
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

  for (uint8_t i = 0; i < connectedMobileCount; i++) {
    sendLoRaMessage(MSG_OKAY, connectedMobiles[i].mobileID);
  }
  sendLoRaMessage(MSG_OKAY, 0);
  
  digitalWrite(GREEN_LED, HIGH); delay(1000); digitalWrite(GREEN_LED, LOW);
  updateDisplay();
  delay(300);
}

void checkBluetoothCommands() {
  int newlineIdx = bleRxBuffer.indexOf('\n');
  while (newlineIdx != -1) {
    String cmd = bleRxBuffer.substring(0, newlineIdx);
    bleRxBuffer = bleRxBuffer.substring(newlineIdx + 1);
    cmd.trim();
    if (cmd.length() > 0) {
      bleCommandQueue.push(cmd);
    }
    newlineIdx = bleRxBuffer.indexOf('\n');
  }

  while (!bleCommandQueue.empty()) {
    String nextCmd = bleCommandQueue.front();
    bleCommandQueue.pop();
    processBLECommand(nextCmd);
  }
}

void processBLECommand(const String& cmd) {
  if (cmd == "SOS") {
    logLobbyEvent("SOS command received");
    triggerSOS();
  } else if (cmd == "OK") {
    logLobbyEvent("OK command received");
    if (receivedSOS || receivedMorse) {
      receivedSOS = receivedMorse = false;
      digitalWrite(SOS_LED, LOW);
      digitalWrite(BUZZER, LOW);
      updateDisplay();
    } else {
      triggerOkay();
    }
  } else if (cmd == "ON_MY_WAY") {
    logLobbyEvent("ON_MY_WAY command received");
    sendLoRaMessage(MSG_ON_MY_WAY, 0);
    sendToPhone("STATUS:ON_MY_WAY_SENT");
  } else if (cmd.startsWith("LOBBY:")) {
    uint32_t nextCode = cmd.substring(6).toInt();

    // `LOBBY:<code>` is now a direct channel selector. Any phone can set/overwrite.
    if (nextCode == 0) {
      setLobbyCode(0, false);
      for (int i = 0; i < connectedMobileCount; i++) {
        connectedMobiles[i].isInLobby = false;
      }
      return;
    }

    // Enforce 4-digit lobby codes only.
    if (nextCode < 1000 || nextCode > 9999) {
      logLobbyEvent("Rejecting invalid LOBBY code from BLE: " + String(nextCode));
      sendToPhone("STATUS:INVALID_LOBBY," + String(nextCode));
      return;
    }

    setLobbyCode(nextCode, false);
    for (int i = 0; i < connectedMobileCount; i++) {
      connectedMobiles[i].isInLobby = true;
    }
  } else if (cmd.startsWith("CREATE_LOBBY:")) {
    uint32_t lobbyCode = cmd.substring(13).toInt();

    // `CREATE_LOBBY:<code>` is equivalent to setting the channel, but marks host flag.
    if (lobbyCode != 0 && (lobbyCode < 1000 || lobbyCode > 9999)) {
      logLobbyEvent("Rejecting invalid CREATE_LOBBY code from BLE: " + String(lobbyCode));
      sendToPhone("STATUS:INVALID_LOBBY," + String(lobbyCode));
      return;
    }

    setLobbyCode(lobbyCode, true);
    // Mark ALL currently connected mobiles as being in the newly created lobby
    for (int i = 0; i < connectedMobileCount; i++) {
      connectedMobiles[i].isInLobby = true;
    }
    sendToPhone("STATUS:LOBBY_CREATED," + String(lobbyCode));
  } else if (cmd.startsWith("LEAVE_LOBBY")) {
    // Determine which phone sent the command via token if provided, 
    // otherwise we assume the sender wants to be removed.
    // For now, we'll look for a token or just handle the logic globally but safely.
    
    // Safety: Only clear the hardware lobby if NO connected mobiles 
    // are currently in a lobby session.
    bool anyoneElseInLobby = false;
    
    // If the command was "LEAVE_LOBBY:<token>"
    if (cmd.indexOf(':') != -1) {
      String token = cmd.substring(12);
      for (int i = 0; i < connectedMobileCount; i++) {
        if (connectedMobiles[i].token == token) {
          connectedMobiles[i].isInLobby = false;
          logLobbyEvent("Mobile M" + String(connectedMobiles[i].mobileID) + " left the lobby.");
        } else if (connectedMobiles[i].isInLobby) {
          anyoneElseInLobby = true;
        }
      }
    } else {
      // Legacy/Simple: Clear all (not recommended for multi-phone)
      for (int i = 0; i < connectedMobileCount; i++) connectedMobiles[i].isInLobby = false;
    }

    if (!anyoneElseInLobby) {
      logLobbyEvent("Last member left. Clearing hardware lobby: " + String(currentLobbyCode));
      setLobbyCode(0, false);
      sendToPhone("STATUS:LOBBY_CLEARED");
    } else {
      sendToPhone("STATUS:MEMBER_LEFT");
    }
  } else if (cmd.startsWith("NICK:")) {
  String nick = cmd.substring(5);
  if (nick.length() > 0) {
    myNickname = nick;
    preferences.putString("nickname", nick);
    sendLoRaNickname();
  }
  } else if (cmd.startsWith("EC:")) {
  String payload = cmd.substring(3);
  int comma = payload.indexOf(',');
  if (comma > 0) {
    myECName = payload.substring(0, comma);
    myECPhone = payload.substring(comma + 1);
    preferences.putString("ec_name", myECName);
    preferences.putString("ec_phone", myECPhone);
    sendLoRaEmergencyContact();
  }
  } else if (cmd.startsWith("MSG:")) {
  int comma = cmd.indexOf(',', 4);
  if (comma > 4) {
    int target = cmd.substring(4, comma).toInt();
    String text = cmd.substring(comma + 1);

    if (currentLobbyCode == 0) {
      // Do not allow lobby-0 messages; require lobby join first.
      sendToPhone("STATUS:JOIN_LOBBY_FIRST");
    } else {
      sendLoRaTextMessage(target, text, 0);

      // Local echo so other phones connected to this same hub can see the message.
      // The app treats the numeric field as the conversation target (0 = broadcast).
      sendToPhone("ECHO_MSG:" + String(target) + "," + text);
    }
  }
  } else if (cmd.startsWith("CLAIM:")) {
  String token = cmd.substring(6);
  for (int i = 0; i < connectedMobileCount; i++) {
    if (connectedMobiles[i].token == "" || connectedMobiles[i].token == token) {
      connectedMobiles[i].token = token;
      sendToPhone("CLAIMED:" + token + "," + String(connectedMobiles[i].mobileID));
      break;
    }
  }
  } else if (cmd.startsWith("PLOC:")) {
  int firstComma = cmd.indexOf(',', 5);
  int secondComma = cmd.indexOf(',', firstComma + 1);
  int thirdComma = cmd.indexOf(',', secondComma + 1);
  if (firstComma > 0 && secondComma > 0 && thirdComma > 0) {
    String token = cmd.substring(5, firstComma);
    int mId = cmd.substring(firstComma + 1, secondComma).toInt();
    float lat = cmd.substring(secondComma + 1, thirdComma).toFloat();
    float lng = cmd.substring(thirdComma + 1).toFloat();
    for (int i = 0; i < connectedMobileCount; i++) {
      if (connectedMobiles[i].mobileID == mId && connectedMobiles[i].token == token) {
        connectedMobiles[i].latitude = lat;
        connectedMobiles[i].longitude = lng;
        connectedMobiles[i].lastSeen = millis();
        break;
      }
    }
  }
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
            String(connectedMobileCount) + "," +
            String(currentLobbyCode); // Added lobby code to heartbeat

  if (lastKnownDistance >= 0)
    packet += "," + String(lastKnownDistance, 1);
  else
    packet += ",---";

  sendToPhone(packet);

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
  // Lobby 0 means "not joined"; do not transmit group traffic.
  // Prevents accidental lobby-0 broadcasts being received by everyone.
  if (currentLobbyCode == 0) return;
  LoRaMessage msg;
  msg.lobbyCode  = currentLobbyCode;
  msg.deviceID   = DEVICE_ID;
  msg.mobileID   = mobileID;
  msg.msgType    = msgType;
  msg.latitude   = lat;
  msg.longitude  = lng;
  msg.satellites = satellites;
  msg.rssi       = 0;  
  Serial.printf("[LORA] TX Type: %d | ID: %d\n", msgType, mobileID);
  LoRa.beginPacket();
  LoRa.write((uint8_t*)&msg, sizeof(msg));
  LoRa.endPacket();
}

void sendLoRaTextMessage(uint8_t targetDevice, String message, uint8_t mobileID) {
  // Lobby 0 means "not joined"; do not transmit group traffic.
  if (currentLobbyCode == 0) return;
  LoRaTextMessage textMsg;
  textMsg.lobbyCode = currentLobbyCode;
  textMsg.deviceID  = DEVICE_ID;
  textMsg.mobileID  = mobileID;
  textMsg.msgType   = MSG_TEXT;
  textMsg.targetID  = targetDevice;
  textMsg.rssi      = 0; 
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
  nickMsg.mobileID  = 0; 
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
  ecMsg.mobileID  = 0; 
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
  
  int currentRssi = LoRa.packetRssi(); 

    if (packetSize == sizeof(LoRaMessage)) {
    LoRaMessage msg;
    LoRa.readBytes((uint8_t*)&msg, sizeof(msg));
    
    // Safety: Always process packets from Lobby 0 (Discovery/Broadcast) 
    // or packets that match our current lobby.
    if (msg.lobbyCode != 0 && msg.lobbyCode != currentLobbyCode) return;
    if (msg.deviceID  == DEVICE_ID) return;

    remoteDevice = msg.deviceID;
    lastRssi     = currentRssi;
    lastSeenTime = millis();

    if (msg.mobileID > 0 && msg.mobileID <= MAX_MOBILE_PHONES) {
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
    } else if (msg.msgType == MSG_BEAT) {
      if (msg.mobileID == 0) {
        String loc = "LOC:";
        loc += String(msg.deviceID) + ",";
        loc += String(msg.latitude, 6) + ",";
        loc += String(msg.longitude, 6) + ",";
        loc += String(msg.satellites) + ",";
        loc += String(currentRssi);
        sendToPhone(loc);
      }
      return; // FIX 4: Display updates handled by main loop
    }

    alert += String(msg.deviceID) + "," +
             String(msg.latitude,  6) + "," +
             String(msg.longitude, 6);
    sendToPhone(alert);

    } else if (packetSize == sizeof(LoRaTextMessage)) {
    LoRaTextMessage txtMsg;
    LoRa.readBytes((uint8_t*)&txtMsg, sizeof(txtMsg));
    
    // Safety: Always process packets from Lobby 0 (Discovery/Broadcast) 
    // or packets that match our current lobby.
    if (txtMsg.lobbyCode != 0 && txtMsg.lobbyCode != currentLobbyCode) return;
    if (txtMsg.targetID  != DEVICE_ID && txtMsg.targetID != 0) return;
    if (txtMsg.deviceID  == DEVICE_ID) return;

    lastRssi     = currentRssi;
    lastSeenTime = millis();
    if (isOffline) isOffline = false;

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

    String text = String(txtMsg.text);
    
    sendToPhone("MSG:" + String(txtMsg.deviceID) + ",M" + String(txtMsg.mobileID) + "," + text + ",RSSI:" + String(currentRssi));
    digitalWrite(GREEN_LED, HIGH); delay(200); digitalWrite(GREEN_LED, LOW);

  } else if (packetSize == sizeof(LoRaNickMessage)) {
    LoRaNickMessage nickMsg;
    LoRa.readBytes((uint8_t*)&nickMsg, sizeof(nickMsg));
    if (nickMsg.lobbyCode != currentLobbyCode) return;
    if (nickMsg.deviceID  == DEVICE_ID) return;

    lastRssi     = LoRa.packetRssi();
    lastSeenTime = millis();
    if (isOffline) isOffline = false;

    nickMsg.nickname[MAX_NICK_LEN - 1] = '\0';
    sendToPhone("NICK:" + String(nickMsg.deviceID) + "," + String(nickMsg.nickname));

  } else if (packetSize == sizeof(LoRaECMessage)) {
    LoRaECMessage ecMsg;
    LoRa.readBytes((uint8_t*)&ecMsg, sizeof(ecMsg));
    if (ecMsg.lobbyCode != currentLobbyCode) return;
    if (ecMsg.deviceID  == DEVICE_ID) return;

    lastRssi     = LoRa.packetRssi();
    lastSeenTime = millis();
    if (isOffline) isOffline = false;

    ecMsg.ecName[MAX_EC_NAME   - 1] = '\0';
    ecMsg.ecPhone[MAX_EC_PHONE - 1] = '\0';
    sendToPhone("EC:" + String(ecMsg.deviceID) + "," +
                String(ecMsg.ecName) + "," + String(ecMsg.ecPhone));
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
  if (connectedMobileCount > 0) {
    display.print("BL:"); display.print(connectedMobileCount);
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
    display.print(" >100m AWAY!");   
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
    
    for (uint8_t i = 0; i < connectedMobileCount; i++) {
      sendLoRaMessage(MSG_MORSE, connectedMobiles[i].mobileID);
    }
    sendLoRaMessage(MSG_MORSE, 0);
    
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
    // FIX 3: Shortened blocking delay from 1000ms to 200ms
    digitalWrite(BUZZER, HIGH); delay(200); digitalWrite(BUZZER, LOW);
  }
  morseInput = "";
  updateDisplay();
}

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

// Add logging for lobby-related events
void logLobbyEvent(const String& event) {
  Serial.println("[" + getTimestamp() + "] [LOBBY EVENT]: " + event);
}

void setLobbyCode(uint32_t lobbyCode, bool isHost) {
  const uint32_t prevLobbyCode = currentLobbyCode;
  if (lobbyCode != 0 && (lobbyCode < 1000 || lobbyCode > 9999)) {
    logLobbyEvent("Rejecting invalid lobby code: " + String(lobbyCode));
    sendToPhone("STATUS:INVALID_LOBBY," + String(lobbyCode));
    return;
  }

  currentLobbyCode = lobbyCode;
  lobbyHostActive = isHost;
  preferences.putUInt("lobby_code", lobbyCode);
  preferences.putBool("lobby_host", isHost);
  logLobbyEvent("Lobby code set: " + String(lobbyCode) + ", Host: " + String(isHost));
  sendToPhone("STATUS:LOBBY_SET," + String(lobbyCode));
  // Let other LoRa devices discover us immediately on lobby change (no GPS required).
  // Uses the existing app-side JOIN_TS parsing (it doesn't require a real timestamp).
  if (lobbyCode > 0 && lobbyCode != prevLobbyCode) {
    sendLoRaTextMessage(0, "__JOINED_TS__:", 0);
  }

  if (lobbyCode > 0) {
    delay(200);
    sendLoRaEmergencyContact();
    lastECBroadcastTime = millis();
  }
}

String getTimestamp() {
  unsigned long now = millis();
  unsigned long seconds = (now / 1000) % 60;
  unsigned long minutes = (now / (1000 * 60)) % 60;
  unsigned long hours = (now / (1000 * 60 * 60)) % 24;
  char buffer[9];
  snprintf(buffer, sizeof(buffer), "%02lu:%02lu:%02lu", hours, minutes, seconds);
  return String(buffer);
}
