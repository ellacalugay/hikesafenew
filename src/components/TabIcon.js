import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { styles } from '../styles';
import { COLORS } from '../constants';

const TabIcon = ({ icon: Icon, active, onPress }) => (
  <TouchableOpacity style={styles.tabItem} onPress={onPress}>
    <Icon size={24} color={active ? COLORS.primary : COLORS.gray} />
    {active && <View style={styles.activeDot} />}
  </TouchableOpacity>
);

export default TabIcon;
