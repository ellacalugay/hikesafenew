import React, { useState, useEffect } from 'react';
import { View, Text, Switch, Animated, Alert } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';

const CompassTab = () => {
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
      let location = await Location.getCurrentPositionAsync({});
      setLocation(location);
      
      let addressResponse = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });

      if (addressResponse.length > 0) {
        let addr = addressResponse[0];
        let locationName = `${addr.city || addr.subregion || ''}\n${addr.region || addr.country || ''}`;
        setAddress(locationName.trim());
      }
    } catch (e) {
      setAddress("Location Unavailable");
    }
  };

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
    <View style={styles.tabContainer}>
      <View style={styles.headerBar}>
         <Text style={styles.headerTitle}>COMPASS</Text>
      </View>
      
      <View style={styles.compassContainer}>
        <View style={styles.blackCompassBox}>
            <View style={styles.topArrow} />

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

      <View style={styles.coordsBoxTransparent}>
        <Text style={styles.coordsTitle}>
           {isServiceEnabled ? `${magnetometer}° ${getCardinalDirection(magnetometer)}` : '---'}
        </Text>
        <Text style={styles.coordsSubtitle}>
           {isServiceEnabled ? address : 'Enable location services\nto see your position'}
        </Text>
      </View>

      <View style={styles.distanceBar}>
         <Text style={styles.distanceLabel}>DISTANCE:</Text>
         <Text style={styles.distanceValue}>{location ? '0 m' : '--'}</Text>
      </View>
    </View>
  );
};

export default CompassTab;
