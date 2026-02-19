import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { User, MapPin } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';

const locations = [
  { id: 1, name: 'Hiker 1', distance: '1 meter away' },
  { id: 2, name: 'Hiker 2', distance: '0.5 meter away' },
  { id: 3, name: 'Alex', distance: '15 meters away' },
  { id: 4, name: 'Sarah', distance: '25 meters away' },
];

const LocationTab = ({ onLocationPress }) => {
  const { colors } = useTheme();
  
  return (
  <View style={[styles.tabContainer, { backgroundColor: colors.background }]}>
    <View style={[styles.headerBar, { backgroundColor: colors.headerBg }]}>
       <Text style={[styles.headerTitle, { color: colors.textDark }]}>LOCATION</Text>
    </View>
    <ScrollView style={{flex:1, padding: 20}}>
      {locations.map((loc) => (
        <TouchableOpacity 
          key={loc.id}
          style={[styles.userLocationRow, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}
          onPress={() => onLocationPress && onLocationPress(loc)}
          activeOpacity={0.7}
        >
          <View style={[styles.avatarSmall, { backgroundColor: colors.primary }]}><User size={16} color="white" /></View>
          <Text style={[styles.locationText, { color: colors.textDark }]}>{loc.distance}</Text>
          <MapPin size={20} color="red" />
        </TouchableOpacity>
      ))}
      <Text style={{ textAlign: 'center', color: colors.gray, marginTop: 20, fontSize: 12 }}>
        Tap on a hiker to see more details
      </Text>
    </ScrollView>
  </View>
  );
};

export default LocationTab;
