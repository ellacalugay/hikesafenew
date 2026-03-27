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
