import React from 'react';
import { View, Text, ScrollView, Button, Alert } from 'react-native';
import { User, MapPin } from 'lucide-react-native';
import { styles } from '../../styles';
import * as Location from 'expo-location';
import BleService from '../../services/BleService';

const LocationTab = () => (
  <View style={styles.tabContainer}>
    <View style={styles.headerBar}>
       <Text style={styles.headerTitle}>LOCATION</Text>
    </View>
    <ScrollView style={{flex:1, padding: 20}}>
       <View style={styles.userLocationRow}>
         <View style={styles.avatarSmall}><User size={16} color="white" /></View>
         <Text style={styles.locationText}>1 meter away</Text>
         <MapPin size={20} color="red" />
       </View>
       <View style={styles.userLocationRow}>
         <View style={styles.avatarSmall}><User size={16} color="white" /></View>
         <Text style={styles.locationText}>0.5 meter away</Text>
         <MapPin size={20} color="red" />
       </View>
    </ScrollView>
    <View style={{ padding: 12 }}>
      <Button title="Send My Location to Device" onPress={async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission required', 'Enable location permission'); return; }
          const pos = await Location.getCurrentPositionAsync({});
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const ok = await BleService.sendGPS(lat, lon);
          if (!ok) Alert.alert('Send failed', 'Could not send location to device (no BLE connection?)');
        } catch (e) { Alert.alert('Error', String(e)); }
      }} />
    </View>
  </View>
);

export default LocationTab;
