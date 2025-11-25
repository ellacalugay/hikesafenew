import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { User } from 'lucide-react-native';
import { styles } from '../../styles';
import { COLORS } from '../../constants';

const MessageTab = () => (
  <View style={styles.tabContainer}>
    <View style={styles.headerBar}>
       <Text style={styles.headerTitle}>Messages</Text>
    </View>
    <ScrollView style={{flex:1, padding: 20}}>
      <View style={styles.chatItem}>
        <User size={20} color={COLORS.textDark} />
        <Text style={styles.chatName}>LOBBY ABCDEF123</Text>
        <View style={styles.onlineDot} />
      </View>
      {['NODE A: John Doe', 'NODE B: John Doe', 'NODE C: John Doe'].map((name, i) => (
        <View key={i} style={styles.chatItem}>
           <View style={styles.avatarCircle}><Text style={{fontSize:10}}>JD</Text></View>
           <Text style={styles.chatName}>{name}</Text>
           <View style={styles.onlineDot} />
        </View>
      ))}
    </ScrollView>
  </View>
);

export default MessageTab;
