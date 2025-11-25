import React from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { styles } from '../styles';
import { COLORS } from '../constants';

const ServiceItem = ({ icon: Icon, label, onPress }) => (
  <TouchableOpacity style={styles.serviceItem} onPress={onPress}>
    <View style={styles.serviceIconBox}>
      <Icon size={24} color={COLORS.textDark} />
    </View>
    <Text style={styles.serviceText}>{label}</Text>
  </TouchableOpacity>
);

export default ServiceItem;
