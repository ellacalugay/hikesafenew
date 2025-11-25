import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { User, Settings, HelpCircle, AlertOctagon, LogOut } from 'lucide-react-native';
import { styles } from '../../styles';
import { MenuOption } from '../../components';

const ProfileTab = ({ onLogout }) => (
  <ScrollView style={styles.tabContainer}>
    <View style={styles.profileHeader}>
      <View style={styles.avatarLarge}>
        <User size={40} color="white" />
      </View>
      <Text style={styles.profileName}>Hello!{'\n'}John Doe</Text>
    </View>

    <View style={styles.menuList}>
      <MenuOption icon={User} label="Edit Profile" />
      <MenuOption icon={Settings} label="Settings" />
      <MenuOption icon={HelpCircle} label="Help" />
      <MenuOption icon={AlertOctagon} label="Report a Problem" />
      <MenuOption icon={LogOut} label="Logout" onPress={onLogout} />
    </View>
  </ScrollView>
);

export default ProfileTab;
