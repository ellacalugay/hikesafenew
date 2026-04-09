import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { User, Settings, HelpCircle, AlertOctagon, LogOut } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useLobby } from '../../context/LobbyContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../../context/UserContext';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MenuOption = ({ icon: Icon, label, onPress, colors }) => (
  <TouchableOpacity
    style={[
      styles.menuOption,
      {
        borderWidth: 1,
        borderColor: colors.glassBorder,
        paddingVertical: 20,
        paddingHorizontal: 20,
      },
    ]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <BlurView
      intensity={colors.glassIntensity}
      tint={colors.glassTint}
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    />
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

    <View style={{ flexDirection: 'row', alignItems: 'center', zIndex: 1 }}>
      <Icon size={20} color={colors.textDark} />
      <Text style={[styles.menuLabel, { color: colors.textDark, marginLeft: 16, fontWeight: '600' }]}>
        {label}
      </Text>
    </View>
  </TouchableOpacity>
);

const ProfileTab = ({ onLogout, onEditProfile, onSettings, onHelp, onReportProblem }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      <View style={{ flex: 1, position: 'relative' }}>

        <View style={{ alignItems: 'center', paddingTop: insets.top + 16, paddingBottom: 10, zIndex: 20 }}>
          <Image
            source={require('../../assets/Assets.png')}
            style={{ width: 120, height: 25 }}
            resizeMode="contain"
          />
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          showsVerticalScrollIndicator={false}
        >
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
            marginHorizontal: 20,
            marginBottom: 20,
            overflow: 'hidden',
            marginTop: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 23, color: colors.textDark, fontWeight: '600', marginTop: 20 }}>Hello!</Text>
            <Text style={{ fontSize: 30, color: colors.textDark, fontWeight: '700', lineHeight: 30 }}>
              {myNickname}
            </Text>
            <Text style={{ fontSize: 9.5, color: 'rgba(255, 255, 255, 0.84)', marginTop: 9 }}>
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

        <View style={{ paddingHorizontal: 20, gap: 4 }}>
          <MenuOption icon={User} label="Edit Profile" onPress={onEditProfile} colors={colors} />
          <MenuOption icon={Settings} label="Settings" onPress={onSettings} colors={colors} />
          <MenuOption icon={HelpCircle} label="Help" onPress={onHelp} colors={colors} />
          <MenuOption icon={AlertOctagon} label="Report a Problem" onPress={onReportProblem} colors={colors} />
          <MenuOption icon={LogOut} label="Logout" onPress={handleLogout} colors={colors} />
        </View>
        </ScrollView>
      </View>
    </View>
  );
};

export default ProfileTab;
