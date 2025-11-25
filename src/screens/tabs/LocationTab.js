import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { User, MapPin } from 'lucide-react-native';
import { styles } from '../../styles';

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
  </View>
);

export default LocationTab;
