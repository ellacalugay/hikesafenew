// FIRMWARE UPDATE FOR MULTI-DEVICE SUPPORT
// Replace the sendStatusUpdate() function in your main firmware file with this version:

void sendStatusUpdate() {
    String packet = "SELF:";
    if(gps.location.isValid()) {
      packet += String(gps.location.lat(), 6) + "," + String(gps.location.lng(), 6) + ",";
    } else {
      packet += "0.0,0.0,";
    }
    // Format: SELF:[LAT],[LON],[SATS],[RSSI],[CONNECTED_DEVICES]
    packet += String(gps.satellites.value()) + "," + String(lastRssi) + "," + String(connectedDevices);
    sendToPhone(packet);
}

// This change adds the number of connected phones as the 5th parameter.
// Example output: SELF:34.052235,-118.243683,12,-85,2
// Meaning: 2 phones are currently connected to this HikeSafe device


// --- IMPORTANT BLE FIX (MTU fragmentation / partial command buffering) ---
// If your BLE RX writes arrive fragmented (common with BLE UART), the firmware must
// buffer until a full command (newline-terminated) arrives.
// Replace your existing checkBluetoothCommands() with this version.

void checkBluetoothCommands() {
  int newlineIdx = bleRxBuffer.indexOf('\n');
  if (newlineIdx == -1) return; // Wait for a full command

  // Handle multiple commands potentially batched together
  while (newlineIdx != -1) {
    String cmd = bleRxBuffer.substring(0, newlineIdx);
    bleRxBuffer = bleRxBuffer.substring(newlineIdx + 1);

    cmd.trim();
    if (cmd.length() > 0) {
      if (cmd == "SOS") triggerSOS();
      else if (cmd == "OK") {
        if (receivedSOS || receivedMorse) {
          receivedSOS = false;
          receivedMorse = false;
          sosActive = false;
          digitalWrite(SOS_LED, LOW);
          digitalWrite(BUZZER, LOW);
          updateDisplay();
        } else {
          triggerOkay();
        }
      }
      else if (cmd.startsWith("LOBBY:")) {
        currentLobbyCode = cmd.substring(6).toInt();
        preferences.putUInt("lobby_code", currentLobbyCode);
        sendToPhone("STATUS:LOBBY_SET," + String(currentLobbyCode));
        updateDisplay();
      }
      else if (cmd.startsWith("NICK:")) {
        myNickname = cmd.substring(5);
        if (myNickname.length() >= MAX_NICK_LEN) {
          myNickname = myNickname.substring(0, MAX_NICK_LEN - 1);
        }
        preferences.putString("nickname", myNickname);
        sendToPhone("STATUS:NICK_SET," + myNickname);
        sendLoRaNickname();
        updateDisplay();
      }
      else if (cmd.startsWith("EC:")) {
        int commaIdx = cmd.indexOf(',', 3);
        if (commaIdx > 0) {
          myECName = cmd.substring(3, commaIdx);
          myECPhone = cmd.substring(commaIdx + 1);

          if (myECName.length() >= MAX_EC_NAME) {
            myECName = myECName.substring(0, MAX_EC_NAME - 1);
          }
          if (myECPhone.length() >= MAX_EC_PHONE) {
            myECPhone = myECPhone.substring(0, MAX_EC_PHONE - 1);
          }

          preferences.putString("ec_name", myECName);
          preferences.putString("ec_phone", myECPhone);

          sendToPhone("STATUS:EC_SET");
          sendLoRaEmergencyContact();
          updateDisplay();
        }
      }
      else if (cmd.startsWith("MSG:")) {
        int commaIdx = cmd.indexOf(',', 4);
        if (commaIdx > 0) {
          int toDevice = cmd.substring(4, commaIdx).toInt();
          String msgText = cmd.substring(commaIdx + 1);
          sendLoRaTextMessage(toDevice, msgText);
          sendToPhone("ECHO_MSG:" + String(toDevice) + "," + msgText);
        }
      }
    }

    newlineIdx = bleRxBuffer.indexOf('\n');
  }
}
