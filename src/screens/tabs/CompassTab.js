import React, { useState, useEffect } from 'react';
import { View, Text, Switch, Animated, Alert } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { styles } from '../../styles';
import { COLORS } from '../../constants';

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

export default CompassTab;
