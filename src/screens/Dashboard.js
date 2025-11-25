import React, { useState } from 'react';
import { View, Dimensions } from 'react-native';
import { Home, MapPin, MessageCircle, Compass, User } from 'lucide-react-native';
import { styles } from '../styles';
import { TabIcon } from '../components';
import { HomeTab, LocationTab, MessageTab, CompassTab, ProfileTab } from './tabs';

const { width } = Dimensions.get('window');

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
      
      {/* Bottom Navigation Bar */}
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
