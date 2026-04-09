import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Switch, Animated, Alert, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CompassTab = () => {
  const { colors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [isServiceEnabled, setIsServiceEnabled] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [displayAngle, setDisplayAngle] = useState(0);
  const spinValue = useRef(new Animated.Value(0)).current;
  const lastAngle = useRef(0);
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
    } else {
      setIsServiceEnabled(false);
      _unsubscribe();
      setLocation(null);
      setDisplayAngle(0);

      // Reset compass dial to 0 smoothly
      Animated.timing(spinValue, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
      lastAngle.current = 0;

      setAddress('Service Paused');
    }
  };

  const _subscribe = () => {
    Magnetometer.setUpdateInterval(60);
    const sub = Magnetometer.addListener((data) => {
      let angle = 0;
      if (data) {
        let { x, y } = data;
        angle = Math.atan2(y, x) * (180 / Math.PI);
        if (angle < 0) angle += 360;
      }

      let newAngle = Math.round(angle);

      // Shortest path: prevent snap/spin backwards when crossing North
      let diff = newAngle - lastAngle.current;
      if (diff > 180) newAngle -= 360;
      else if (diff < -180) newAngle += 360;

      Animated.timing(spinValue, {
        toValue: newAngle,
        duration: 60,
        useNativeDriver: true,
      }).start();

      lastAngle.current = newAngle;

      // Keep display within 0..359
      setDisplayAngle((newAngle % 360 + 360) % 360);
    });
    setSubscription(sub);
  };

  const _unsubscribe = () => {
    subscription && subscription.remove();
    setSubscription(null);
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

  const spin = spinValue.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '-360deg'],
  });

  return (
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      <View style={{ backgroundColor: colors.primaryLight, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, marginHorizontal: 16, marginTop: 16, marginBottom: 6, borderRadius: 12 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.textLight }]}>COMPASS</Text>
        </View>
      </View>
      
      <View style={styles.compassContainer}>
        <View style={[styles.blackCompassBox, { borderColor: colors.glassBorder }]}>
            <BlurView
              intensity={colors.glassIntensity}
              tint={colors.glassTint}
              style={StyleSheet.absoluteFillObject}
            />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]}
            />
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: isDarkMode ? colors.cardBg : colors.textDark,
                  opacity: 0.68,
                },
              ]}
            />

            <View style={[styles.topArrow, { borderBottomColor: colors.primary }]} />

            <Animated.View style={[styles.compassInnerDial, { transform: [{ rotate: spin }] }]}>
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

      <View style={[styles.locationStatusContainer, { backgroundColor: 'transparent' }]}>
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

      <View
        style={[
          styles.coordsBoxTransparent,
          {
            borderWidth: 1,
            borderColor: colors.glassBorder,
            borderRadius: 16,
            marginHorizontal: 16,
            marginTop: 8,
            overflow: 'hidden',
            position: 'relative',
          },
        ]}
      >
        <BlurView
          intensity={colors.glassIntensity}
          tint={colors.glassTint}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

        <Text style={[styles.coordsTitle, { color: colors.textDark }]}>
           {isServiceEnabled ? `${displayAngle}° ${getCardinalDirection(displayAngle)}` : '---'}
        </Text>
        <Text style={[styles.coordsSubtitle, { color: colors.gray }]}>
           {isServiceEnabled ? address : 'Enable location services\nto see your position'}
        </Text>
      </View>

      <View style={[styles.distanceBar, { bottom: insets.bottom + 65, backgroundColor: colors.primaryLight }]}>
        <Text style={[styles.distanceLabel, { color: colors.textLight }]}>DISTANCE:</Text>
        <Text style={[styles.distanceValue, { color: colors.textLight }]}>{location ? '0 m' : '--'}</Text>
      </View>
    </View>
  );
};

export default CompassTab;
