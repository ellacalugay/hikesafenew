import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { styles } from '../styles';
import { COLORS } from '../constants';

const MenuOption = ({ icon: Icon, label, onPress }) => (
  <TouchableOpacity style={styles.menuOption} onPress={onPress}>
    <Icon size={20} color={COLORS.textDark} />
    <Text style={styles.menuLabel}>{label}</Text>
  </TouchableOpacity>
);

export default MenuOption;
