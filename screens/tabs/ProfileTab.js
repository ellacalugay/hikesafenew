import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ImageBackground, StyleSheet, Image } from 'react-native';
import { User, Settings, HelpCircle, AlertOctagon, LogOut } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useLobby } from '../../context/LobbyContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../../context/UserContext';

const MenuOption = ({ icon: Icon, label, onPress, colors }) => (
  <TouchableOpacity style={[styles.menuOption, { backgroundColor: colors.cardBg, borderColor: colors.borderColor, paddingVertical: 20, paddingHorizontal: 30 }]} onPress={onPress}>
    <Icon size={20} color={colors.textDark} />
    <Text style={[styles.menuLabel, { color: colors.textDark }]}>{label}</Text>
  </TouchableOpacity>
);

const ProfileTab = ({ onLogout, onEditProfile, onSettings, onHelp, onReportProblem }) => {
  const { colors } = useTheme();
  const { myNickname, clearRememberData, leaveLobby } = useLobby();
  const { firstName, lastName, memberId } = useUser();

  const initials = `${(firstName && firstName[0] ? firstName[0].toUpperCase() : (myNickname && myNickname[0] ? myNickname[0].toUpperCase() : ''))}${(lastName && lastName[0] ? lastName[0].toUpperCase() : '')}`;
  
  const handleLogout = async () => {
    try {
      await clearRememberData();
      await leaveLobby();
    } catch (e) {
      console.error('Logout cleanup failed', e);
    }
    if (onLogout) onLogout();
  };
  
  return (
    <ImageBackground 
      source={require('../../assets/dashboard_bg.png')} 
      style={[styles.tabContainer, { backgroundColor: colors.background }]}
      imageStyle={{ resizeMode: 'cover', width: '100%', height: '100%' }}
    >
      <View style={{ flex: 1, position: 'relative' }}>
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} />
      <Image
        source={require('../../assets/Assets.png')} 
        style={{ width: 120, height: 25, position: 'absolute', top: 40, left: 118, zIndex: 20 }}
        resizeMode="contain"
      />
      <ScrollView style={[styles.tabContainer, { backgroundColor: 'transparent' }]}> 
        <LinearGradient
          colors={colors.greetBn}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            borderRadius: 16,
            padding: 30,
            paddingBottom: 15,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            margin: 20,
            overflow: 'hidden',
            width: '88%',
            marginTop: 80,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11.5, color: 'rgba(255, 255, 255, 0.84)', marginBottom: 2 }}>
              "DESIGN HERE"
            </Text>
            <Text style={{ fontSize: 23, color: colors.textDark, fontWeight: '600', marginTop: 20 }}>Hello!</Text>
            <Text style={{ fontSize: 30, color: colors.textDark, fontWeight: '700', lineHeight: 30 }}>
              {myNickname}
            </Text>
            <Text style={{ fontSize: 9.5, color: 'rgb(255, 255, 255, 0.84)', marginTop: 9 }}>
              <Text style={{ fontWeight: 'bold' }}>{'MEMBER ID: '}</Text> 
               {memberId }
            </Text>
          </View>

          <View style={{
            width: 108,
            height: 108,
            borderRadius: 60,
            borderWidth: 2.5,
            borderColor: 'rgba(255,255,255,0.5)',
            overflow: 'hidden',
            marginTop: -25,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <View style={{ flex: 1, backgroundColor: colors.primary || '#81c784', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
              <Text style={{ color: 'rgba(255,255,255,0.95)', fontSize: 36, fontWeight: '700' }}>{initials || 'HS'}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={[styles.menuList, { gap: 5 }, {padding: 4}]}>
          <MenuOption icon={User} label="Edit Profile" onPress={onEditProfile} colors={colors} />
          <MenuOption icon={Settings} label="Settings" onPress={onSettings} colors={colors} />
          <MenuOption icon={HelpCircle} label="Help" onPress={onHelp} colors={colors} />
          <MenuOption icon={AlertOctagon} label="Report a Problem" onPress={onReportProblem} colors={colors} />
          <MenuOption icon={LogOut} label="Logout" onPress={handleLogout} colors={colors} />
        </View>
      </ScrollView>
      </View>
    </ImageBackground>
  );
};

export default ProfileTab;
