import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Trees, User, MessageCircle, MapPin, Compass, Clock, Users, Bell } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';

const ServiceItem = ({ icon: Icon, label, onPress, colors }) => (
  <TouchableOpacity style={[styles.serviceItem, { backgroundColor: colors.cardBg }]} onPress={onPress}>
    <View style={[styles.serviceIconBox, { backgroundColor: colors.surfaceBg }]}>
      <Icon size={24} color={colors.textDark} />
    </View>
    <Text style={[styles.serviceText, { color: colors.textDark }]}>{label}</Text>
  </TouchableOpacity>
);

const ActivityItem = ({ icon: Icon, title, description, time, colors }) => (
  <View style={[styles.activityCard, { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
    <View style={{ 
      width: 40, 
      height: 40, 
      borderRadius: 20, 
      backgroundColor: colors.primaryLight, 
      alignItems: 'center', 
      justifyContent: 'center',
      marginRight: 12 
    }}>
      <Icon size={20} color="white" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontWeight: '600', color: colors.textDark }}>{title}</Text>
      <Text style={{ fontSize: 12, color: colors.gray, marginTop: 2 }}>{description}</Text>
    </View>
    <Text style={{ fontSize: 11, color: colors.gray }}>{time}</Text>
  </View>
);

const HomeTab = ({ onChangeTab, onLobbyPress }) => {
  const { colors } = useTheme();
  
  return (
  <ScrollView contentContainerStyle={[styles.scrollContent, { backgroundColor: colors.background }]}>
    <View style={styles.headerRow}>
      <View>
        <Text style={[styles.welcomeText, { color: colors.textDark }]}>Hello!</Text>
        <Text style={[styles.usernameTitle, { color: colors.textDark }]}>John Doe</Text>
      </View>
      <Trees size={30} color={colors.primary} />
    </View>

    <TouchableOpacity onPress={onLobbyPress} activeOpacity={0.8}>
      <LinearGradient colors={[colors.primaryLight, colors.primary]} style={styles.lobbyCard}>
        <Text style={styles.lobbyLabel}>LOBBY ID</Text>
        <Text style={styles.lobbyCode}>ABCDEF123</Text>
        
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>MEMBERS</Text>
            <Text style={styles.statValue}>15</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>NEAREST</Text>
            <Text style={styles.statValue}>30 m</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>SIGNAL</Text>
            <View style={styles.signalIcon}>
              <View style={[styles.bar, {height: 6}]} />
              <View style={[styles.bar, {height: 10}]} />
              <View style={[styles.bar, {height: 14}]} />
            </View>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>

    <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Services</Text>
    <View style={styles.servicesGrid}>
      <ServiceItem icon={User} label="Profile" onPress={() => onChangeTab('profile')} colors={colors} />
      <ServiceItem icon={MessageCircle} label="Message" onPress={() => onChangeTab('message')} colors={colors} />
      <ServiceItem icon={MapPin} label="Location" onPress={() => onChangeTab('location')} colors={colors} />
      <ServiceItem icon={Compass} label="Compass" onPress={() => onChangeTab('compass')} colors={colors} />
    </View>

    <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Recent Activities</Text>
    <ActivityItem 
      icon={Users} 
      title="New member joined" 
      description="Alex joined your hiking group" 
      time="5 min ago"
      colors={colors}
    />
    <ActivityItem 
      icon={Bell} 
      title="Location alert" 
      description="Member 50m+ away from group" 
      time="15 min ago"
      colors={colors}
    />
    <ActivityItem 
      icon={Clock} 
      title="Hike started" 
      description="Group hike session began" 
      time="1 hr ago"
      colors={colors}
    />
  </ScrollView>
  );
};

export default HomeTab;
