import React, { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Home, MapPin, MessageCircle, Compass, User } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { styles } from '../styles/styles';
import HomeTab from './tabs/HomeTab';
import LocationTab from './tabs/LocationTab';
import MessageTab from './tabs/MessageTab';
import CompassTab from './tabs/CompassTab';
import ProfileTab from './tabs/ProfileTab';

const TabIcon = ({ icon: Icon, active, onPress }) => (
  <TouchableOpacity style={styles.tabItem} onPress={onPress}>
    <Icon size={24} color={active ? COLORS.primary : COLORS.gray} />
    {active && <View style={styles.activeDot} />}
  </TouchableOpacity>
);

const Dashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('home');

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return <HomeTab onChangeTab={setActiveTab} />;
      case 'location': return <LocationTab />;
      case 'message': return <MessageTab />;
      case 'compass': return <CompassTab />;
      case 'profile': return <ProfileTab onLogout={onLogout} />;
      default: return <HomeTab />;
    }
  };

  return (
    <View style={{flex: 1}}>
      {renderContent()}
      
      <View style={styles.bottomNav}>
        <TabIcon icon={Home} label="Home" active={activeTab === 'home'} onPress={() => setActiveTab('home')} />
        <TabIcon icon={MapPin} label="Loc" active={activeTab === 'location'} onPress={() => setActiveTab('location')} />
        <TabIcon icon={MessageCircle} label="Chat" active={activeTab === 'message'} onPress={() => setActiveTab('message')} />
        <TabIcon icon={Compass} label="Comp" active={activeTab === 'compass'} onPress={() => setActiveTab('compass')} />
        <TabIcon icon={User} label="Prof" active={activeTab === 'profile'} onPress={() => setActiveTab('profile')} />
      </View>
    </View>
  );
};

export default Dashboard;
