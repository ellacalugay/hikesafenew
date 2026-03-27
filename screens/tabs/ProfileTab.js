import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ImageBackground, StyleSheet, Image } from 'react-native';
import { User, Settings, HelpCircle, AlertOctagon, LogOut } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useLobby } from '../../context/LobbyContext';
import { LinearGradient } from 'expo-linear-gradient';

const MenuOption = ({ icon: Icon, label, onPress, colors }) => (
  <TouchableOpacity style={[styles.menuOption, { backgroundColor: colors.cardBg, borderColor: colors.borderColor, paddingVertical: 20, paddingHorizontal: 30 }]} onPress={onPress}>
    <Icon size={20} color={colors.textDark} />
    <Text style={[styles.menuLabel, { color: colors.textDark }]}>{label}</Text>
  </TouchableOpacity>
);

const ProfileTab = ({ onLogout, onEditProfile, onSettings, onHelp, onReportProblem }) => {
  const { colors } = useTheme();
  const {myNickname} = useLobby();
  
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
          colors={['#2e7d32', '#4caf50', '#7db241', '#a5de0a']}
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
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>
              "DESIGN HERE"
            </Text>
            <Text style={{ fontSize: 20, color: 'rgba(0, 0, 0, 0.85)', fontWeight: '600', marginTop: 20 }}>Hello!</Text>
            <Text style={{ fontSize: 30, color: '#000000', fontWeight: '700', lineHeight: 30 }}>
              {myNickname}
            </Text>
            <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
              {/* MEMBER ID: {memberId} */}
            </Text>
          </View>

          <View style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            borderWidth: 2.5,
            borderColor: 'rgba(255,255,255,0.5)',
            overflow: 'hidden',
            marginTop: -25,
          }}>
            <View style={{ flex: 1, backgroundColor: '#81c784', alignItems: 'center', justifyContent: 'center' }}>
              <User size={36} color="rgba(255,255,255,0.7)" />
            </View>
          </View>
        </LinearGradient>

        <View style={[styles.menuList, { gap: 5 }, {padding: 10}]}>
          <MenuOption icon={User} label="Edit Profile" onPress={onEditProfile} colors={colors} />
          <MenuOption icon={Settings} label="Settings" onPress={onSettings} colors={colors} />
          <MenuOption icon={HelpCircle} label="Help" onPress={onHelp} colors={colors} />
          <MenuOption icon={AlertOctagon} label="Report a Problem" onPress={onReportProblem} colors={colors} />
          <MenuOption icon={LogOut} label="Logout" onPress={onLogout} colors={colors} />
        </View>
      </ScrollView>
      </View>
    </ImageBackground>
  );
};

export default ProfileTab;
