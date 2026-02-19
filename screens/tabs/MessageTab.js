import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { User } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';

const MessageTab = ({ onOpenChat }) => {
  const { colors } = useTheme();
  
  return (
  <View style={[styles.tabContainer, { backgroundColor: colors.background }]}>
    <View style={[styles.headerBar, { backgroundColor: colors.headerBg }]}>
       <Text style={[styles.headerTitle, { color: colors.textDark }]}>Messages</Text>
    </View>
    <ScrollView style={{flex:1, padding: 20}}>
      <TouchableOpacity style={[styles.chatItem, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]} onPress={() => onOpenChat('LOBBY ABCDEF123')}>
        <User size={20} color={colors.textDark} />
        <Text style={[styles.chatName, { color: colors.textDark }]}>LOBBY ABCDEF123</Text>
        <View style={styles.onlineDot} />
      </TouchableOpacity>
      {['NODE A: John Doe', 'NODE B: John Doe', 'NODE C: John Doe'].map((name, i) => (
        <TouchableOpacity key={i} style={[styles.chatItem, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]} onPress={() => onOpenChat(name)}>
           <View style={[styles.avatarCircle, { backgroundColor: colors.inputBg }]}><Text style={{fontSize:10, color: colors.textDark}}>JD</Text></View>
           <Text style={[styles.chatName, { color: colors.textDark }]}>{name}</Text>
           <View style={styles.onlineDot} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
  );
};

export default MessageTab;
