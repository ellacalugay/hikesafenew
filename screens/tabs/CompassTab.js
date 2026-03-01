import React, { useState, useEffect } from 'react';
import { View, Text, Switch, Animated, Alert, ImageBackground, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';

const CompassTab = () => {
  const { colors, isDarkMode } = useTheme();
  const [isServiceEnabled, setIsServiceEnabled] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [magnetometer, setMagnetometer] = useState(0);
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState('Waiting for GPS...');
  const [errorMsg, setErrorMsg] = useState(null);

  const toggleSwitch = async () => {
    if (!isServiceEnabled) {
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
      setIsServiceEnabled(false);
      _unsubscribe();
      setLocation(null);
      setMagnetometer(0);
      setAddress('Service Paused');
    }
  };

  const _subscribe = () => {
    Magnetometer.setUpdateInterval(100);
    const sub = Magnetometer.addListener((data) => {
      setMagnetometer(_angle(data));
    });
    setSubscription(sub);
  };

  const _unsubscribe = () => {
    subscription && subscription.remove();
    setSubscription(null);
  };

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

  const _getLocation = async () => {
    try {
      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(location);
      
      // Display coordinates directly (works offline, no reverse geocoding)
      const lat = location.coords.latitude.toFixed(6);
      const lng = location.coords.longitude.toFixed(6);
      const alt = location.coords.altitude ? `Alt: ${location.coords.altitude.toFixed(0)}m` : '';
      setAddress(`${lat}, ${lng}\n${alt}`);
    } catch (e) {
      setAddress("GPS Unavailable");
    }
  };

  // Continuously update location when service is enabled
  useEffect(() => {
    let locationWatcher = null;
    
    if (isServiceEnabled) {
      (async () => {
        locationWatcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5 },
          (loc) => {
            setLocation(loc);
            const lat = loc.coords.latitude.toFixed(6);
            const lng = loc.coords.longitude.toFixed(6);
            const alt = loc.coords.altitude ? `Alt: ${loc.coords.altitude.toFixed(0)}m` : '';
            setAddress(`${lat}, ${lng}\n${alt}`);
          }
        );
      })();
    }
    
    return () => {
      if (locationWatcher) {
        locationWatcher.remove();
      }
    };
  }, [isServiceEnabled]);

  useEffect(() => {
    return () => {
      _unsubscribe();
    };
  }, []);

  const getCardinalDirection = (deg) => {
    const val = Math.floor((deg / 45) + 0.5);
    const arr = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return arr[(val % 8)];
  };

  const rotateStyle = {
    transform: [{ rotate: `${-magnetometer}deg` }] 
  };

  return (
    <ImageBackground 
      source={require('../../assets/dashboard_bg.png')} 
      style={[styles.tabContainer, { backgroundColor: colors.background }]}
      imageStyle={{ resizeMode: 'cover' }}
    >
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} />
      <View style={{ backgroundColor: colors.primaryLight, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, marginHorizontal: 16, marginTop: 16, marginBottom: 6, borderRadius: 12 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.textDark }]}>COMPASS</Text>
        </View>
      </View>
      
      <View style={styles.compassContainer}>
        <View style={[styles.blackCompassBox, isDarkMode && { borderColor: colors.primary }]}>
            <View style={[styles.topArrow, { borderBottomColor: colors.primary }]} />

            <Animated.View style={[styles.compassInnerDial, rotateStyle]}>
               <View style={styles.tickRing} />
               
               <Text style={[styles.directionTextBold, {top: 15}]}>N</Text>
               <Text style={[styles.directionTextBold, {bottom: 15}]}>S</Text>
               <Text style={[styles.directionTextBold, {left: 15}]}>W</Text>
               <Text style={[styles.directionTextBold, {right: 15}]}>E</Text>
               
               <View style={styles.crosshairVerticalLight} />
               <View style={styles.crosshairHorizontalLight} />
            </Animated.View>
        </View>
      </View>

      <View style={[styles.locationStatusContainer, { backgroundColor: colors.cardBg }]}>
        <Text style={[styles.locationServicesLabel, { color: colors.textDark }]}>Location Services:</Text>
        <View style={styles.toggleRow}>
             <Switch
                trackColor={{ false: "#767577", true: colors.primaryLight }}
                thumbColor={isServiceEnabled ? "#f4f3f4" : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                onValueChange={toggleSwitch}
                value={isServiceEnabled}
              />
             <View style={[styles.statusBadge, {backgroundColor: isServiceEnabled ? colors.primary : 'gray'}]}>
                <Text style={styles.statusBadgeText}>{isServiceEnabled ? 'ON' : 'OFF'}</Text>
             </View>
        </View>
      </View>

      <View style={[styles.coordsBoxTransparent, { backgroundColor: isDarkMode ? colors.cardBg : 'transparent' }]}>
        <Text style={[styles.coordsTitle, { color: colors.textDark }]}>
           {isServiceEnabled ? `${magnetometer}° ${getCardinalDirection(magnetometer)}` : '---'}
        </Text>
        <Text style={[styles.coordsSubtitle, { color: colors.gray }]}>
           {isServiceEnabled ? address : 'Enable location services\nto see your position'}
        </Text>
      </View>

      <View style={[styles.distanceBar, { bottom: 70, backgroundColor: colors.primaryLight }]}>
         <Text style={styles.distanceLabel}>DISTANCE:</Text>
         <Text style={styles.distanceValue}>{location ? '0 m' : '--'}</Text>
      </View>
    </ImageBackground>
  );
};

export default CompassTab;
