import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Trees, User, MessageCircle, MapPin, Compass } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';

const ServiceItem = ({ icon: Icon, label, onPress }) => (
  <TouchableOpacity style={styles.serviceItem} onPress={onPress}>
    <View style={styles.serviceIconBox}>
      <Icon size={24} color={COLORS.textDark} />
    </View>
    <Text style={styles.serviceText}>{label}</Text>
  </TouchableOpacity>
);

const HomeTab = ({ onChangeTab }) => (
  <ScrollView contentContainerStyle={styles.scrollContent}>
    <View style={styles.headerRow}>
      <View>
        <Text style={styles.welcomeText}>Hello!</Text>
        <Text style={styles.usernameTitle}>John Doe</Text>
      </View>
      <Trees size={30} color={COLORS.primary} />
    </View>

    <LinearGradient colors={[COLORS.primaryLight, COLORS.primary]} style={styles.lobbyCard}>
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

    <Text style={styles.sectionHeader}>Services</Text>
    <View style={styles.servicesGrid}>
      <ServiceItem icon={User} label="Profile" onPress={() => onChangeTab('profile')} />
      <ServiceItem icon={MessageCircle} label="Message" onPress={() => onChangeTab('message')} />
      <ServiceItem icon={MapPin} label="Location" onPress={() => onChangeTab('location')} />
      <ServiceItem icon={Compass} label="Compass" onPress={() => onChangeTab('compass')} />
    </View>

    <Text style={styles.sectionHeader}>Recent Activities</Text>
    <View style={styles.activityCard} />
    <View style={styles.activityCard} />
  </ScrollView>
);

export default HomeTab;
