import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { User, Settings, HelpCircle, AlertOctagon, LogOut } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';

const MenuOption = ({ icon: Icon, label, onPress, colors }) => (
  <TouchableOpacity style={[styles.menuOption, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]} onPress={onPress}>
    <Icon size={20} color={colors.textDark} />
    <Text style={[styles.menuLabel, { color: colors.textDark }]}>{label}</Text>
  </TouchableOpacity>
);

const ProfileTab = ({ onLogout, onEditProfile, onSettings, onHelp, onReportProblem }) => {
  const { colors } = useTheme();
  
  return (
  <ScrollView style={[styles.tabContainer, { backgroundColor: colors.background }]}>
    <View style={[styles.profileHeader, { backgroundColor: colors.headerBg }]}>
      <View style={[styles.avatarLarge, { backgroundColor: colors.primary }]}>
        <User size={40} color="white" />
      </View>
      <Text style={[styles.profileName, { color: colors.textDark }]}>Hello!{'\n'}Hiker</Text>
    </View>

    <View style={styles.menuList}>
      <MenuOption icon={User} label="Edit Profile" onPress={onEditProfile} colors={colors} />
      <MenuOption icon={Settings} label="Settings" onPress={onSettings} colors={colors} />
      <MenuOption icon={HelpCircle} label="Help" onPress={onHelp} colors={colors} />
      <MenuOption icon={AlertOctagon} label="Report a Problem" onPress={onReportProblem} colors={colors} />
      <MenuOption icon={LogOut} label="Logout" onPress={onLogout} colors={colors} />
    </View>
  </ScrollView>
  );
};

export default ProfileTab;
