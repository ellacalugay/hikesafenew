import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Modal,
  Image,
  ImageBackground,
  Dimensions,
  Animated,
  StatusBar,
  Platform,
  Switch, // Added Switch
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
// IMPORTANT: Make sure you have installed these packages: 
// npx expo install expo-location expo-sensors
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';

import { 
  Trees, 
  MapPin, 
  MessageCircle, 
  Compass, 
  User, 
  Home, 
  Settings, 
  LogOut, 
  AlertTriangle, 
  CheckCircle, 
  ChevronRight,
  Menu,
  Send,
  HelpCircle,
  AlertOctagon
} from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

// --- THEME CONSTANTS ---
const COLORS = {
  primary: '#4d7c0f', // Forest Green
  primaryLight: '#65a30d',
  accent: '#a3e635', // Lime
  background: '#f7fee7', // Mist
  textDark: '#1a2e05',
  textLight: '#ffffff',
  gray: '#9ca3af',
  cardBg: 'rgba(255, 255, 255, 0.9)',
};

// --- SHARED COMPONENTS ---

// 1. Nature Background Container
const ScreenContainer = ({ children }) => (
  <View style={styles.container}>
    <StatusBar barStyle="dark-content" />
    <LinearGradient
      colors={['#ecfccb', '#ffffff']}
      style={styles.backgroundGradient}
    />
    {/* Abstract Tree/Mountain Shapes */}
    <View style={styles.bgTreeLeft} />
    <View style={styles.bgTreeRight} />
    <View style={styles.bgMountain} />
    
    <SafeAreaView style={styles.safeArea}>
      {children}
    </SafeAreaView>
  </View>
);

// 2. Custom Button
const MainButton = ({ title, onPress, variant = 'primary', style }) => (
  <TouchableOpacity 
    style={[
      styles.button, 
      variant === 'outline' ? styles.buttonOutline : styles.buttonPrimary,
      style
    ]} 
    onPress={onPress}
  >
    <Text style={[
      styles.buttonText, 
      variant === 'outline' ? styles.buttonTextOutline : styles.buttonTextPrimary
    ]}>
      {title}
    </Text>
  </TouchableOpacity>
);

// 3. Custom Input
const InputField = ({ label, placeholder, value, onChangeText, secureTextEntry, keyboardType, error }) => (
  <View style={styles.inputContainer}>
    {label && <Text style={styles.inputLabel}>{label}</Text>}
    <TextInput
      style={[styles.input, error ? { borderColor: 'red' } : null]}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
    />
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
  </View>
);

// --- SCREENS ---//

// 1. ONBOARDING: NAME
const OnboardingName = ({ next }) => (
  <View style={styles.contentContainer}>
    <View style={styles.headerSpacer} />
    <Text style={styles.titleLarge}>
      What do we{'\n'}call you?
    </Text>
  
    <View style={[styles.formSection, styles.centeredForm, { top: 50 }]}>
      <InputField label="First Name" placeholder="e.g. John" />
      <InputField label="Last Name" placeholder="e.g. Doe" />
      <InputField label="Nickname" placeholder="e.g. JD" />
    </View>

    <View style={styles.illustrationSpace}>
       <Trees size={120} color={COLORS.primary} style={{opacity: 0.5}} />
    </View>

    <View style={styles.footer}>
      <MainButton title="NEXT" onPress={next} />
      <TouchableOpacity style={styles.skipButton} onPress={next}>
        <Text style={styles.skipText}>SKIP</Text>
      </TouchableOpacity>
    </View>
  </View>
);

// 2. ONBOARDING: DETAILS
const OnboardingDetails = ({ next, onShowReminder }) => {
  const [experience, setExperience] = useState('Beginner');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [contactPhone, setContactPhone] = useState('');
  const [contactPhoneError, setContactPhoneError] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactNameError, setContactNameError] = useState('');
  const [medicalCondition, setMedicalCondition] = useState('');
  const options = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

  const validatePhone = (phone) => {
    if (!phone || phone.trim().length === 0) return 'Phone is required';
    const digits = phone.replace(/[^0-9+]/g, '');
    if (digits.length < 7) return 'Enter a valid phone number';
    if (digits.length > 15) return 'Phone number too long';
    return '';
  };

  const validateName = (name) => {
    if (!name || name.trim().length === 0) return 'Contact name is required';
    return '';
  };

  const handleAccept = () => {
    const errPhone = validatePhone(contactPhone);
    const errName = validateName(contactName);

    if (errName) setContactNameError(errName);
    if (errPhone) setContactPhoneError(errPhone);

    if (errName || errPhone) return;

    setContactPhoneError('');
    setContactNameError('');
    onShowReminder();
  };

  return (
    <View style={[styles.contentContainer, styles.centerScreen]}>
      <Text style={[styles.titleLarge, styles.detailTitle]}>Get ready with the trail!</Text>

      <View style={styles.detailForm}>
        <InputField
          label="Contact Name"
          placeholder="Emergency Contact Name"
          value={contactName}
          onChangeText={(t) => { setContactName(t); if (contactNameError) setContactNameError(''); }}
          error={contactNameError}
        />
        <InputField
          label="Contact Phone"
          placeholder="Emergency Contact Phone"
          value={contactPhone}
          onChangeText={(t) => { setContactPhone(t); if (contactPhoneError) setContactPhoneError(''); }}
          keyboardType="phone-pad"
          error={contactPhoneError}
        />
        <InputField
          label="Medical Condition"
          placeholder="Any allergies or conditions?"
          value={medicalCondition}
          onChangeText={setMedicalCondition}
        />

        {/* Real Dropdown (Modal) */}
        <Text style={styles.inputLabel}>Hiking Experience level</Text>
        <TouchableOpacity style={styles.inputBox} onPress={() => setDropdownOpen(true)}>
          <Text style={{color: COLORS.textDark}}>{experience}</Text>
          <ChevronRight size={20} color={COLORS.gray} />
        </TouchableOpacity>
      </View>

      <View style={styles.illustrationSpace}>
         <Trees size={80} color={COLORS.primary} style={{opacity: 0.5}} />
      </View>

      <MainButton title="ACCEPT AND CONTINUE" onPress={handleAccept} style={{marginTop: 20}} />

      {/* Dropdown Modal */}
      <Modal visible={dropdownOpen} transparent animationType="fade">
        <TouchableOpacity style={styles.dropdownModalOverlay} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
          <View style={styles.dropdownModalContent}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.dropdownItem}
                onPress={() => { setExperience(opt); setDropdownOpen(false); }}
              >
                <Text style={styles.dropdownItemText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// 3. LOBBY SCREEN (Join & Create)
const LobbyScreen = ({ onLogin, onShowCreateSuccess }) => {
  const [mode, setMode] = useState('join'); // 'join' or 'create'
  const [remember, setRemember] = useState(false);
  
  // Create lobby form state
  const [lobbyName, setLobbyName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [maxMember, setMaxMember] = useState('');

  const handleCreateLobby = () => {
    // Pass the lobby data when creating
    onShowCreateSuccess({ lobbyName, groupId, maxMember });
  };

  if (mode === 'create') {
    return (
      <ImageBackground
        source={require('./assets/forest_bg 1.png')}
        style={styles.lobbyCreateBg}
        resizeMode="cover"
      >
        <View style={styles.centerContent}>
          <View style={styles.cardGreen}>
            <Text style={styles.cardTitleLarge}>CREATE A LOBBY</Text>
            <View style={styles.separatorThin} />

            <Text style={[styles.cardSubtitleWhite, { textAlign: 'left', alignSelf: 'flex-start', fontSize: 20 }]}>Welcome to HIKESAFE!</Text>
            <Text style={[styles.cardDescWhite, { textAlign: 'left', alignSelf: 'flex-start' }]} numberOfLines={1}>Please fill out the form below to create your lobby.</Text>
            <View style={styles.separatorThin} />

            <View style={styles.formGrid}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Lobby Name</Text>
                <TextInput 
                  style={styles.inputWhiteRounded} 
                  placeholder="Enter lobby name" 
                  placeholderTextColor="rgba(0,0,0,0.35)"
                  value={lobbyName}
                  onChangeText={setLobbyName}
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Group ID</Text>
                <TextInput 
                  style={styles.inputWhiteRounded} 
                  placeholder="Group ID" 
                  placeholderTextColor="rgba(0,0,0,0.35)"
                  value={groupId}
                  onChangeText={setGroupId}
                />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel} numberOfLines={1}>Max Member</Text>
                <TextInput 
                  style={styles.inputWhiteRounded} 
                  placeholder="Max Member" 
                  placeholderTextColor="rgba(0,0,0,0.35)" 
                  keyboardType="numeric"
                  value={maxMember}
                  onChangeText={setMaxMember}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.createNowButton} onPress={handleCreateLobby}>
              <Text style={styles.createNowText}>CREATE NOW</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setMode('join')} style={{marginTop: 8}}>
               <Text style={styles.linkTextWhite}>Already have a Lobby? <Text style={{fontWeight: 'bold', color: 'green', textDecorationLine: 'underline'}}>Click Here</Text></Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    );
  }

  // Join Mode
  return (
    <ImageBackground
      source={require('./assets/forest_bg 1.png')}
      style={styles.lobbyCreateBg}
      resizeMode="cover"
    >
      <View style={styles.contentContainer}>
          <View style={styles.logoSection}>
            <Image source={require('./assets/hike.png')} style={styles.logoImage} />
            <Text style={styles.tagline}>"Stay connected. Stay safe."</Text>
          </View>

        <View style={[styles.formSection, { top:-10, width: '80%', alignSelf: 'center' }]}> 
          <InputField placeholder="Username" />
          <InputField placeholder="Group ID" />
          
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => setRemember(!remember)}
              style={[styles.checkbox, remember ? styles.checkboxChecked : null]}
            >
              {remember && <Text style={styles.checkboxTick}>✓</Text>}
            </TouchableOpacity>
            <Text style={[styles.labelSmall, { color: 'white', fontWeight: '600', marginLeft: 8 }]}>Remember me</Text>
          </View>
          <View style={[styles.hrLine, { marginTop: 30 }]} />
        </View>

        <MainButton title="Enter Lobby" onPress={onLogin} style={{ top: -30, width: '80%', alignSelf: 'center' }} />
        
        <TouchableOpacity
          onPress={() => setMode('create')}
          style={{ marginTop: 20, alignItems: 'center' }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: COLORS.primary, fontWeight: '600', textAlign: 'center' }}>
            Do you want to create a Lobby?{' '}
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Create Here.</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
};

// 4. DASHBOARD (Tab Navigation Container)
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

const TabIcon = ({ icon: Icon, active, onPress }) => (
  <TouchableOpacity style={styles.tabItem} onPress={onPress}>
    <Icon size={24} color={active ? COLORS.primary : COLORS.gray} />
    {active && <View style={styles.activeDot} />}
  </TouchableOpacity>
);

// --- DASHBOARD TABS ---

const HomeTab = ({ onChangeTab }) => (
  <ScrollView contentContainerStyle={styles.scrollContent}>
    <View style={styles.headerRow}>
      <View>
        <Text style={styles.welcomeText}>Hello!</Text>
        <Text style={styles.usernameTitle}>John Doe</Text>
      </View>
      <Trees size={30} color={COLORS.primary} />
    </View>

    {/* Lobby ID Card */}
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

const ServiceItem = ({ icon: Icon, label, onPress }) => (
  <TouchableOpacity style={styles.serviceItem} onPress={onPress}>
    <View style={styles.serviceIconBox}>
      <Icon size={24} color={COLORS.textDark} />
    </View>
    <Text style={styles.serviceText}>{label}</Text>
  </TouchableOpacity>
);

const LocationTab = () => (
  <View style={styles.tabContainer}>
    <View style={styles.headerBar}>
       <Text style={styles.headerTitle}>LOCATION</Text>
    </View>
    <ScrollView style={{flex:1, padding: 20}}>
       <View style={styles.userLocationRow}>
         <View style={styles.avatarSmall}><User size={16} color="white" /></View>
         <Text style={styles.locationText}>1 meter away</Text>
         <MapPin size={20} color="red" />
       </View>
       <View style={styles.userLocationRow}>
         <View style={styles.avatarSmall}><User size={16} color="white" /></View>
         <Text style={styles.locationText}>0.5 meter away</Text>
         <MapPin size={20} color="red" />
       </View>
    </ScrollView>
  </View>
);

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

// --- COMPASS TAB (FUNCTIONAL) ---
const CompassTab = () => {
  const [isServiceEnabled, setIsServiceEnabled] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [magnetometer, setMagnetometer] = useState(0);
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('Waiting for GPS...');
  const [errorMsg, setErrorMsg] = useState(null);

  // Toggle Handler
  const toggleSwitch = async () => {
    if (!isServiceEnabled) {
      // Turn ON
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        Alert.alert("Permission Required", "Location permission is needed to use the compass.");
        return;
      }
      setIsServiceEnabled(true);
      _subscribe();
      _getLocation();
    } else {
      // Turn OFF
      setIsServiceEnabled(false);
      _unsubscribe();
      setLocation(null);
      setMagnetometer(0);
      setAddress('Service Paused');
    }
  };

  // Subscribe to Magnetometer
  const _subscribe = () => {
    Magnetometer.setUpdateInterval(100);
    const sub = Magnetometer.addListener((data) => {
      setMagnetometer(_angle(data));
    });
    setSubscription(sub);
  };

  // Unsubscribe
  const _unsubscribe = () => {
    subscription && subscription.remove();
    setSubscription(null);
  };

  // Calculate Angle
  const _angle = (magnetometer) => {
    let angle = 0;
    if (magnetometer) {
      let { x, y } = magnetometer;
      if (Math.atan2(y, x) >= 0) {
        angle = Math.atan2(y, x) * (180 / Math.PI);
      } else {
        angle = (Math.atan2(y, x) + 2 * Math.PI) * (180 / Math.PI);
      }
    }
    return Math.round(angle);
  };

  // Get Location & Address
  const _getLocation = async () => {
    try {
      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);
      
      // Reverse Geocode
      let addressResponse = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });

      if (addressResponse.length > 0) {
        let addr = addressResponse[0];
        // Construct legible address
        let locationName = `${addr.city || addr.subregion || ''}\n${addr.region || addr.country || ''}`;
        setAddress(locationName.trim());
      }
    } catch (e) {
      setAddress("Location Unavailable");
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      _unsubscribe();
    };
  }, []);

  // Get Cardinal Direction (N, NW, W, etc.)
  const getCardinalDirection = (deg) => {
    const val = Math.floor((deg / 45) + 0.5);
    const arr = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return arr[(val % 8)];
  };

  // Rotate the dial to point North (inverse of heading)
  // Note: To mimic a real compass dial (where N is printed on the card), 
  // we rotate the card so N points to real North.
  // Heading 0 = N is Top. Heading 90 (East) = N should be Left (-90).
  const rotateStyle = {
    transform: [{ rotate: `${-magnetometer}deg` }] 
  };

  return (
    <View style={styles.tabContainer}>
      <View style={styles.headerBar}>
         <Text style={styles.headerTitle}>COMPASS</Text>
      </View>
      
      {/* Black Compass Box matching the image */}
      <View style={styles.compassContainer}>
        <View style={styles.blackCompassBox}>
            {/* The Top Arrow (Fixed) */}
            <View style={styles.topArrow} />

            {/* The Rotating Dial */}
            <Animated.View style={[styles.compassInnerDial, rotateStyle]}>
               {/* Ticks (Simplified representation) */}
               <View style={styles.tickRing} />
               
               {/* Labels */}
               <Text style={[styles.directionTextBold, {top: 15}]}>N</Text>
               <Text style={[styles.directionTextBold, {bottom: 15}]}>S</Text>
               <Text style={[styles.directionTextBold, {left: 15}]}>W</Text>
               <Text style={[styles.directionTextBold, {right: 15}]}>E</Text>
               
               {/* Crosshair */}
               <View style={styles.crosshairVerticalLight} />
               <View style={styles.crosshairHorizontalLight} />
            </Animated.View>

            {/* Numeric Degrees (Static overlay on dial or dynamic) */}
            {/* The user image has numbers inside. We simplify to the 4 points for React Native performance without SVG */}
        </View>
      </View>

      {/* Toggle Section */}
      <View style={styles.locationStatusContainer}>
        <Text style={styles.locationServicesLabel}>Location Services:</Text>
        <View style={styles.toggleRow}>
             <Switch
                trackColor={{ false: "#767577", true: COLORS.primaryLight }}
                thumbColor={isServiceEnabled ? "#f4f3f4" : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                onValueChange={toggleSwitch}
                value={isServiceEnabled}
              />
             <View style={[styles.statusBadge, {backgroundColor: isServiceEnabled ? COLORS.primary : 'gray'}]}>
                <Text style={styles.statusBadgeText}>{isServiceEnabled ? 'ON' : 'OFF'}</Text>
             </View>
        </View>
      </View>

      {/* Location Data Display */}
      <View style={styles.coordsBoxTransparent}>
        <Text style={styles.coordsTitle}>
           {isServiceEnabled ? `${magnetometer}° ${getCardinalDirection(magnetometer)}` : '---'}
        </Text>
        <Text style={styles.coordsSubtitle}>
           {isServiceEnabled ? address : 'Enable location services\nto see your position'}
        </Text>
      </View>

      {/* Distance (Bottom Green Bar from image) */}
      <View style={styles.distanceBar}>
         <Text style={styles.distanceLabel}>DISTANCE:</Text>
         <Text style={styles.distanceValue}>{location ? '0 m' : '--'}</Text>
      </View>
    </View>
  );
};

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

const MenuOption = ({ icon: Icon, label, onPress }) => (
  <TouchableOpacity style={styles.menuOption} onPress={onPress}>
    <Icon size={20} color={COLORS.textDark} />
    <Text style={styles.menuLabel}>{label}</Text>
  </TouchableOpacity>
);

// --- MAIN APP COMPONENT ---

export default function App() {
  const [screen, setScreen] = useState('onboarding1'); // onboarding1, onboarding2, lobby, dashboard
  const [showReminder, setShowReminder] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lobbyData, setLobbyData] = useState({ lobbyName: '', groupId: '', maxMember: '' });

  // --- FLOW HANDLERS ---
  const handleNextOnboarding = () => setScreen('onboarding2');
  
  const handleShowReminder = () => setShowReminder(true);
  
  const handleAcceptTerms = () => {
    setShowReminder(false);
    setScreen('lobby');
  };

  const handleCreateLobbySuccess = (data) => {
    setLobbyData(data);
    setShowSuccess(true);
  };
  
  const handleEnterDashboard = () => {
    setShowSuccess(false);
    setScreen('dashboard');
  };

  const handleLogout = () => setScreen('onboarding1');

  return (
    <ScreenContainer>
      {/* SCREEN RENDERING LOGIC */}
      {screen === 'onboarding1' && <OnboardingName next={handleNextOnboarding} />}
      {screen === 'onboarding2' && <OnboardingDetails next={handleShowReminder} onShowReminder={handleShowReminder} />}
      {screen === 'lobby' && <LobbyScreen onLogin={handleEnterDashboard} onShowCreateSuccess={handleCreateLobbySuccess} />}
      {screen === 'dashboard' && <Dashboard onLogout={handleLogout} />}

      {/* --- MODALS --- */}

      {/* 1. HikeSafe Reminder Modal */}
      <Modal visible={showReminder} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentGreen}>
                <Text style={styles.modalTitleWhite}>HikeSafe Reminder</Text>
                <Text style={styles.modalTextWhite}>
                  Before continuing, please read and agree to our {' '}
                  <Text
                    onPress={() => setShowTerms(true)}
                    style={{ textDecorationLine: 'underline', fontWeight: '700' }}
                  >
                    Terms and Conditions
                  </Text>
                  .{"\n"}{"\n"}
                  By tapping "Accept and Continue", you agree that:{'\n'}
                  • You'll use HikeSafe responsibly.{'\n'}
                  • HikeSafe is a tool to assist safety but does not replace personal responsibility.{'\n'}
                </Text>

                <TouchableOpacity style={[styles.buttonWhite, { alignSelf: 'center', width: '80%'}]} onPress={handleAcceptTerms}>
                  <Text style={[styles.buttonTextGreen, {textAlign: 'center'}]}>ACCEPT AND CONTINUE</Text>
                </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 2. Terms Modal */}
      <Modal visible={showTerms} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentGreen}>
            <Text style={[styles.modalTitleWhite, {textAlign: 'center'}]}>Terms and Condition</Text>
            <ScrollView style={{maxHeight: 360, marginVertical: 10}}>
              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>1.</Text>
                  <Text style={styles.modalSectionTitle}>Acceptance of Terms</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  By using the HikeSafe app, you agree to comply with these Terms and Conditions. Please read them carefully before using the app.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>2.</Text>
                  <Text style={styles.modalSectionTitle}>Purpose of the App</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  HikeSafe is designed to help hikers stay safe by offering tools such as GPS tracking, emergency alerts, and route recording. It is intended as a supportive tool not a replacement for personal preparation, awareness, or professional guidance during outdoor activities.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>3.</Text>
                  <Text style={styles.modalSectionTitle}>User Responsibilities</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  • Use HikeSafe responsibly and only for lawful purposes
                  {'\n'}• Ensure your device has enough battery, storage, and connectivity
                  {'\n'}• Provide accurate personal and emergency contact details
                  {'\n'}• Do not misuse the app (e.g., sending false emergency alerts or sharing misleading data)
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>4.</Text>
                  <Text style={styles.modalSectionTitle}>Safety Disclaimer</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  While HikeSafe aims to enhance hiking safety, we do not guarantee complete safety or uninterrupted service. You acknowledge that hiking involves risks, and you are responsible for your own safety and decisions while on the trail.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>5.</Text>
                  <Text style={styles.modalSectionTitle}>Privacy and Data Use</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We collect limited data (such as location, contact, and device information) to provide safety features and improve performance. Your data is used only for app functionality and emergency purposes, and will not be sold to third parties.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>6.</Text>
                  <Text style={styles.modalSectionTitle}>App Updates and Availability</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We may update or modify HikeSafe without prior notice. We do not guarantee that all features will always be available or free of errors.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>7.</Text>
                  <Text style={styles.modalSectionTitle}>Intellectual Property</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  All content, design, and code within HikeSafe are owned by the HikeSafe Team. You may not copy, modify, or redistribute any part of the app without written permission.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>8.</Text>
                  <Text style={styles.modalSectionTitle}>Limitation of Liability</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  HikeSafe and its developers will not be liable for any injury, loss or damage resulting from your use of the app. Use it at your own risk and always practice caution when hiking.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>9.</Text>
                  <Text style={styles.modalSectionTitle}>Termination of Use</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We reserve the right to suspend or terminate access to HikeSafe for violations of these Terms or misuse of the app.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>10.</Text>
                  <Text style={styles.modalSectionTitle}>Contact Us</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  If you have questions about these Terms, please reach out at hikesafe.team@gmail.com
                </Text>
              </View>
            </ScrollView>
            <TouchableOpacity style={[styles.buttonWhite, { alignSelf: 'center', width: '80%'}]} onPress={() => setShowTerms(false)}>
              <Text style={[styles.buttonTextGreen, {textAlign: 'center'}]}>I UNDERSTAND</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3. Lobby Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={styles.cardGreen}>
             <Text style={styles.cardTitleWhite}>Lobby Creation Successful</Text>
             <View style={styles.separatorWhite} />
             <Text style={styles.cardSubtitleWhite}>Your lobby has been successfully created.</Text>
             
             <View style={styles.infoRow}>
               <Text style={styles.infoLabel}>Lobby Name:</Text>
               <Text style={styles.infoValue}>{lobbyData.lobbyName || 'N/A'}</Text>
             </View>
             <View style={styles.infoRow}>
               <Text style={styles.infoLabel}>Group ID:</Text>
               <Text style={styles.infoValue}>{lobbyData.groupId || 'N/A'}</Text>
             </View>
             <View style={styles.infoRow}>
               <Text style={styles.infoLabel}>Max Member:</Text>
               <Text style={styles.infoValue}>{lobbyData.maxMember || 'N/A'}</Text>
             </View>
             
             <TouchableOpacity style={styles.buttonWhite} onPress={handleEnterDashboard}>
               <Text style={styles.buttonTextGreen}>GO TO DASHBOARD</Text>
             </TouchableOpacity>
           </View>
        </View>
      </Modal>

    </ScreenContainer>
  );
}

// --- STYLES ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  backgroundGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: height,
  },
  // Abstract background shapes
  bgTreeLeft: {
    position: 'absolute',
    bottom: 0,
    left: -50,
    width: 200,
    height: 400,
    backgroundColor: '#1a2e05',
    opacity: 0.1,
    transform: [{ rotate: '10deg' }],
    borderTopRightRadius: 100,
  },
  bgTreeRight: {
    position: 'absolute',
    bottom: 0,
    right: -50,
    width: 200,
    height: 350,
    backgroundColor: '#365314',
    opacity: 0.1,
    transform: [{ rotate: '-15deg' }],
    borderTopLeftRadius: 100,
  },
  bgMountain: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: width,
    height: 150,
    backgroundColor: '#ecfccb',
    opacity: 0.8,
  },

  // Layouts
  contentContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },

  // Typography
  titleLarge: {
    fontSize: 45,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 30,
    marginTop: -10,
    textAlign: 'center',
    top: 30,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '900',
    color: '#2f4f09', // Darker Moss
    marginTop: 10,
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  logoImage: {
    width: 200,
    height:200,
    resizeMode: 'cover',
    alignSelf: 'center',
    marginBottom: 6,
    overflow: 'visible',
  },
  tagline: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    marginTop: 5,
    fontStyle: 'italic',
    alignItems: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    marginTop: 20,
    marginBottom: 10,
  },

  // Input
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: COLORS.textDark,
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.textDark,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  inputBox: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
  },
  inputWhite: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 10,
    width: '100%',
  },

  hrLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    width: '80%',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  separatorThin: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    width: '100%',
    marginVertical: 12,
    borderRadius: 2,
  },
  cardTitleLarge: {
    fontSize: 28,
    fontWeight: '900',
    color: 'rgba(0,0,0,0.30)',
    alignSelf: 'flex-start',
    width: '100%',
    textTransform: 'uppercase',
    paddingBottom: 4,
  },
  formGrid: {
    width: '100%',
    marginTop: 6,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  fieldLabel: {
    color: 'white',
    width: '30%',
    fontWeight: '700',
    fontSize: 14,
  },
  inputWhiteRounded: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: '65%',
  },
  createNowButton: {
    backgroundColor: 'white',
    paddingVertical: 12,
    borderRadius: 12,
    alignSelf: 'center',
    width: '60%',
    marginTop: 12,
  },
  createNowText: {
    color: COLORS.primary,
    fontWeight: '800',
    textAlign: 'center',
  },

  // Buttons
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  buttonPrimary: {
    backgroundColor: COLORS.primaryLight,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonTextPrimary: {
    color: 'white',
  },
  buttonWhite: {
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    marginTop: 15,
    marginBottom: 10,
  },
  buttonTextGreen: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  skipButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  skipText: {
    color: COLORS. black,
    fontWeight: '600',
  },
  linkTextWhite: {
    color: 'white',
    fontSize: 12,
    marginTop: 10,
  },

  // Modules/Cards
  cardGreen: {
    backgroundColor: '#65a30d', // Match Figma green
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  cardTitleWhite: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  cardSubtitleWhite: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 10,
    alignItems: 'left',
  },
  cardDescWhite: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 15,
  },
  separatorWhite: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    width: '100%',
    marginVertical: 10,
  },

  // Dashboard Specific
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 14,
    color: COLORS.textDark,
  },
  usernameTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  lobbyCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  lobbyLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  lobbyCode: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 12,
    padding: 10,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statValue: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  signalIcon: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 14,
    marginTop: 4,
    gap: 2,
  },
  bar: {
    width: 3,
    backgroundColor: 'white',
    borderRadius: 1,
  },
  
  // Services Grid
  servicesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  serviceItem: {
    alignItems: 'center',
  },
  serviceIconBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#d9f99d',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#fff',
  },
  serviceText: {
    fontSize: 12,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  
  // Recent Activity
  activityCard: {
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fff',
  },

  // Tab Nav
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 10,
    paddingBottom: 20,
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    position: 'absolute',
    bottom: 0,
    width: width,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    marginTop: 4,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)', // Dim background
    justifyContent: 'center',
    padding: 24,
  },
  modalContentGreen: {
    backgroundColor: '#4d7c0f',
    borderRadius: 16,
    padding: 26,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  modalTitleWhite: {
    fontSize: 25,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  modalTextWhite: {
    fontSize: 14,
    color: 'white',
    lineHeight: 20,
  },
  modalNumber: {
    width: 24,
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSectionTitle: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
    flex: 1,
  },
  modalParagraph: {
    color: 'white',
    lineHeight: 20,
    marginLeft: 23,
    marginBottom: 8,
    fontSize: 13,
    textAlign: 'justify',
  },
  lobbyCreateBg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },

  // Utils
  headerSpacer: { height: 60 },
  logoSection: { alignItems: 'center', marginBottom: 40, marginTop: 60 },
  illustrationSpace: { alignItems: 'center', marginVertical: 30 },
  footer: { marginTop: 'auto' },
  // Used to vertically center the form on onboarding screens
  centeredForm: {
    flex: 1,
    justifyContent: 'center',
  },
  // Center a whole screen's content
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Specific layout for onboarding details form
  detailForm: {
    width: '100%',
    maxWidth: 520,
    top: 60,
    marginVertical: 20,
  },
  detailTitle: {
    textAlign: 'center',
    marginBottom: 5,
  },
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dropdownModalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 0,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#111',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: 'white',
  },
  checkboxTick: {
    color: COLORS.primary,
    fontWeight: '900',
    fontSize: 14,
  },
  errorText: {
    color: 'red',
    marginTop: 6,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelSmall: {
    fontSize: 12,
    color: COLORS.textDark,
  },
  
  // Location Tab
  headerBar: {
    backgroundColor: '#d9f99d',
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 15,
  },
  headerTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: COLORS.textDark,
    textTransform: 'uppercase',
  },
  userLocationRow: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  avatarSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  locationText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textDark,
    fontWeight: '600'
  },
  
  // Message Tab
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    elevation: 2,
  },
  chatName: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center'
  },
  
  // --- UPDATED COMPASS STYLES ---
  tabContainer: {
    flex: 1,
  },
  compassContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  // The Black Rounded Square Box from the image
  blackCompassBox: {
    width: 280,
    height: 280,
    backgroundColor: 'black',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  // The fixed red/white arrow at the top center of the black box
  topArrow: {
    position: 'absolute',
    top: 15,
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'white',
    zIndex: 10,
  },
  // The rotating part
  compassInnerDial: {
    width: 240,
    height: 240,
    borderRadius: 120,
    alignItems: 'center',
    justifyContent: 'center',
    // borderWidth: 2,
    // borderColor: '#333',
  },
  // The ticks around the circle
  tickRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: 'white',
    borderStyle: 'dashed', // Simulates ticks
    opacity: 0.5,
  },
  directionTextBold: {
    position: 'absolute',
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white'
  },
  crosshairVerticalLight: {
    position: 'absolute',
    width: 2,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)'
  },
  crosshairHorizontalLight: {
    position: 'absolute',
    width: 40,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)'
  },

  // Status and Toggle
  locationStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 10
  },
  locationServicesLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textDark,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold'
  },

  // Coordinates and Location Text
  coordsBoxTransparent: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  coordsTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.textDark,
    marginBottom: 5
  },
  coordsSubtitle: {
    textAlign: 'center',
    fontSize: 16,
    color: COLORS.textDark,
    fontWeight: '600',
    opacity: 0.8
  },

  // Distance Bar (Green bar at bottom of compass tab)
  distanceBar: {
    backgroundColor: COLORS.primaryLight,
    padding: 15,
    marginHorizontal: 0,
    marginTop: 'auto',
    marginBottom: 60, // Space for nav bar
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30
  },
  distanceLabel: {
    color: 'white',
    fontWeight: '900',
    fontSize: 18,
    textTransform: 'uppercase'
  },
  distanceValue: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18
  },

  // Profile Tab
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 40
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    borderWidth: 4,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    elevation: 5
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: COLORS.textDark
  },
  menuList: {
    paddingHorizontal: 20
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    elevation: 1
  },
  menuLabel: {
    marginLeft: 15,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textDark
  },
  
  // Lobby Modal Info
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
    paddingBottom: 5
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14
  },
  infoValue: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14
  }
});