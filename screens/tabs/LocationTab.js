import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Alert, Animated, Easing, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { User, MapPin, Radio, Satellite, AlertTriangle, WifiOff, Map, Target, List, Play, Pause, Trash2, Route } from 'lucide-react-native';
import Constants from 'expo-constants';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calculateDistance } from '../../utils/math';
import { clearOfflineTilesAsync, downloadOfflineRegionTilesAsync, estimateTileCountForRegion, getOfflineTileTemplateUri } from '../../utils/offlineTiles';

// MapLibre requires native code; it is not available in Expo Go.
const isExpoGo = Constants.appOwnership === 'expo';
let MapLibreRN = null;
if (!isExpoGo) {
  try {
    MapLibreRN = require('@maplibre/maplibre-react-native');
  } catch (e) {
    console.log('MapLibre load failed:', e?.message || e);
    MapLibreRN = null;
  }
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RADAR_SIZE = SCREEN_WIDTH - 64;

const LOCATION_SERVICES_PREF_KEY = '@hikesafe_location_services_enabled';
const OFFLINE_TILES_META_KEY = '@hikesafe_offline_tiles_meta';

const OFFLINE_DEFAULT_RADIUS_KM = 8;
const OFFLINE_DEFAULT_ZOOM_MIN = 10;
const OFFLINE_DEFAULT_ZOOM_MAX = 14;
const OFFLINE_MAX_TILES = 5000;

const TILE_URL_TEMPLATE = process.env.EXPO_PUBLIC_TILE_URL_TEMPLATE || null;

// Calculate bearing between two points
const calculateBearing = (lat1, lon1, lat2, lon2) => {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

const formatDistance = (meters) => {
  if (meters === null) return 'Unknown';
  if (meters < 1) return `${(meters * 100).toFixed(0)} cm`;
  if (meters < 1000) return `${meters.toFixed(0)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
};

// Stable, easy-to-differentiate colors for phone markers.
// Uses only existing theme primitives (no new hard-coded colors).
const getPhoneMarkerColor = (colors, deviceId, mobileId) => {
  const palette = [
    colors.primaryLight,
    colors.danger,
    colors.gray,
    colors.primary,
  ].filter(Boolean);

  const d = Number.isFinite(deviceId) ? deviceId : 0;
  const m = Number.isFinite(mobileId) ? mobileId : 0;
  const idx = palette.length ? Math.abs((d * 7 + m * 13) % palette.length) : 0;
  return palette[idx] || colors.primary;
};

// Radar View Component - Works completely offline
const RadarView = ({ myLocation, members, colors, onMemberPress, locationServicesEnabled }) => {
  const radarPulseAnim = useRef(new Animated.Value(0)).current;

  // Compass state is isolated here so the parent screen doesn't re-render at 10fps.
  const [headingDeg, setHeadingDeg] = useState(null);
  const magnetometerSubRef = useRef(null);
  const headingSmoothRef = useRef(null);
  const headingLastUpdateRef = useRef(0);

  const computeHeading = useCallback((mag) => {
    if (!mag) return null;
    const { x, y } = mag;
    const raw = Math.atan2(y, x) * (180 / Math.PI);
    const normalized = raw >= 0 ? raw : raw + 360;
    if (!Number.isFinite(normalized)) return null;
    return normalized;
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(radarPulseAnim, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );

    loop.start();
    return () => {
      try {
        loop.stop();
      } catch {
        // ignore
      }
      radarPulseAnim.setValue(0);
    };
  }, [radarPulseAnim]);

  useEffect(() => {
    let cancelled = false;

    const cleanup = () => {
      if (magnetometerSubRef.current) {
        try { magnetometerSubRef.current.remove(); } catch (e) {}
        magnetometerSubRef.current = null;
      }
    };

    (async () => {
      cleanup();
      setHeadingDeg(null);
      headingSmoothRef.current = null;
      headingLastUpdateRef.current = 0;

      if (!locationServicesEnabled) return;

      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (perm?.status !== 'granted') {
          setHeadingDeg(null);
          return;
        }
      } catch (e) {
        setHeadingDeg(null);
        return;
      }

      // Responsive but avoid excessive re-renders.
      Magnetometer.setUpdateInterval(100);
      magnetometerSubRef.current = Magnetometer.addListener((data) => {
        if (cancelled) return;

        const rawHeading = computeHeading(data);
        if (rawHeading === null) return;

        const now = Date.now();
        if (now - headingLastUpdateRef.current < 100) return;
        headingLastUpdateRef.current = now;

        const prev = headingSmoothRef.current;
        if (prev === null || prev === undefined) {
          headingSmoothRef.current = rawHeading;
          setHeadingDeg(rawHeading);
          return;
        }

        // Smooth using shortest angular distance.
        const delta = ((rawHeading - prev + 540) % 360) - 180; // [-180, 180]
        const next = (prev + 0.25 * delta + 360) % 360;

        // Skip tiny updates to reduce UI churn.
        if (Math.abs(delta) < 0.5) return;

        headingSmoothRef.current = next;
        setHeadingDeg(next);
      });
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [computeHeading, locationServicesEnabled]);

  const getCardinalDirection = (deg) => {
    const val = Math.floor((deg / 45) + 0.5);
    const arr = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return arr[(val % 8)];
  };

  // Find max distance to scale the radar
  const maxDistance = Math.max(
    ...members.map(m => m.distance || 0).filter(d => d > 0),
    ...members.flatMap(m => {
      const mobiles = Array.isArray(m?.mobiles) ? m.mobiles : [];
      if (!myLocation?.valid) return [];
      return mobiles
        .map(mobile => {
          if (!mobile?.lat || !mobile?.lng) return 0;
          return calculateDistance(myLocation.lat, myLocation.lng, mobile.lat, mobile.lng) || 0;
        })
        .filter(d => d > 0);
    }),
    100 // Minimum 100m range
  );
  
  // Scale factor: radar radius represents maxDistance
  const radarRadius = RADAR_SIZE / 2 - 30;

  const rippleBaseSize = RADAR_SIZE - 60;
  const rippleScaleA = radarPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] });
  const rippleOpacityA = radarPulseAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.35, 0.18, 0] });
  const phaseB = Animated.modulo(Animated.add(radarPulseAnim, 0.5), 1);
  const rippleScaleB = phaseB.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] });
  const rippleOpacityB = phaseB.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.28, 0.14, 0] });
  
  return (
    <View style={[localStyles.radarContainer, { backgroundColor: 'transparent', borderColor: colors.glassBorder }]}>
      <BlurView
        intensity={colors.glassIntensity}
        tint={colors.glassTint}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

      <View style={localStyles.radarHeader}>
        <Target size={20} color={colors.primary} />
        <Text style={[localStyles.radarTitle, { color: colors.textDark }]}>Radar View</Text>
        <Text style={[localStyles.radarRange, { color: colors.gray }]}>
          Range: {formatDistance(maxDistance)}{headingDeg === null ? ' | Compass off' : ` | ${Math.round(headingDeg)}° ${getCardinalDirection(Math.round(headingDeg))}`}
        </Text>
      </View>

      <View
        style={[
          localStyles.radarDial,
          {
            width: RADAR_SIZE,
            height: RADAR_SIZE,
            borderRadius: RADAR_SIZE / 2,
            borderColor: colors.borderColor,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View style={[localStyles.radar, { width: RADAR_SIZE, height: RADAR_SIZE }]}>
        {/* Animated radar pulse (ripple) */}
        <View style={localStyles.radarRipples} pointerEvents="none">
          <Animated.View
            style={[
              localStyles.radarRipple,
              {
                width: rippleBaseSize,
                height: rippleBaseSize,
                borderRadius: rippleBaseSize / 2,
                borderColor: colors.primary,
                opacity: rippleOpacityA,
                transform: [{ scale: rippleScaleA }],
              },
            ]}
          />
          <Animated.View
            style={[
              localStyles.radarRipple,
              {
                width: rippleBaseSize,
                height: rippleBaseSize,
                borderRadius: rippleBaseSize / 2,
                borderColor: colors.primary,
                opacity: rippleOpacityB,
                transform: [{ scale: rippleScaleB }],
              },
            ]}
          />
        </View>

        {/* Radar circles */}
        <View style={[localStyles.radarCircle, { width: RADAR_SIZE - 60, height: RADAR_SIZE - 60, borderColor: colors.borderColor }]} />
        <View style={[localStyles.radarCircle, { width: (RADAR_SIZE - 60) * 0.66, height: (RADAR_SIZE - 60) * 0.66, borderColor: colors.borderColor }]} />
        <View style={[localStyles.radarCircle, { width: (RADAR_SIZE - 60) * 0.33, height: (RADAR_SIZE - 60) * 0.33, borderColor: colors.borderColor }]} />
        
        {/* Compass overlay: rotate cardinal labels + crosshair based on heading */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: RADAR_SIZE,
            height: RADAR_SIZE,
            transform: [{ rotate: `${headingDeg === null ? 0 : -headingDeg}deg` }],
          }}
          pointerEvents="none"
        >
          <View style={[localStyles.radarLineH, { backgroundColor: colors.borderColor }]} />
          <View style={[localStyles.radarLineV, { backgroundColor: colors.borderColor }]} />
          <Text
            style={[
              localStyles.dirLabel,
              localStyles.dirN,
              { color: colors.gray, transform: [{ rotate: `${headingDeg === null ? 0 : headingDeg}deg` }] },
            ]}
          >
            N
          </Text>
          <Text
            style={[
              localStyles.dirLabel,
              localStyles.dirS,
              { color: colors.gray, transform: [{ rotate: `${headingDeg === null ? 0 : headingDeg}deg` }] },
            ]}
          >
            S
          </Text>
          <Text
            style={[
              localStyles.dirLabel,
              localStyles.dirE,
              { color: colors.gray, transform: [{ rotate: `${headingDeg === null ? 0 : headingDeg}deg` }] },
            ]}
          >
            E
          </Text>
          <Text
            style={[
              localStyles.dirLabel,
              localStyles.dirW,
              { color: colors.gray, transform: [{ rotate: `${headingDeg === null ? 0 : headingDeg}deg` }] },
            ]}
          >
            W
          </Text>
        </View>
        
        {/* Center point (You) */}
        <View style={[localStyles.centerDot, { backgroundColor: colors.primary }]}>
          <Text style={localStyles.centerLabel}>YOU</Text>
        </View>
        
        {/* Device and Mobile dots */}
        {members.map((member) => {
          if (!myLocation.valid || !member.lat || !member.lng) return null;
          
          const distance = member.distance || 0;
          const bearing = calculateBearing(myLocation.lat, myLocation.lng, member.lat, member.lng);
          const adjustedBearing = headingDeg === null
            ? bearing
            : (bearing - headingDeg + 360) % 360;
          
          // Scale distance to radar
          const scaledDistance = Math.min((distance / maxDistance) * radarRadius, radarRadius);
          
          // Convert bearing to x,y (bearing 0 = North = top)
          const angleRad = (adjustedBearing - 90) * Math.PI / 180;
          const x = Math.cos(angleRad) * scaledDistance;
          const y = Math.sin(angleRad) * scaledDistance;
          
          const isEmergency = member.alertType === 'SOS' || member.alertType === 'MORSE';
          const isOffline = member.isOffline || member.alertType === 'OFFLINE';
          
          return (
            <TouchableOpacity
              key={member.deviceId}
              style={[
                localStyles.memberDot,
                {
                  backgroundColor: isEmergency ? colors.accent : isOffline ? '#999' : colors.primary,
                  left: RADAR_SIZE / 2 + x - 15,
                  top: RADAR_SIZE / 2 + y - 15,
                  opacity: isOffline ? 0.6 : 1,
                }
              ]}
              onPress={() => onMemberPress(member)}
            >
              <Text style={localStyles.memberDotText}>D{member.deviceId}</Text>
            </TouchableOpacity>
          );
        })}
        
        {/* Mobile device dots */}
        {members.flatMap(member => {
          if (!member.mobiles || member.mobiles.length === 0) return [];
          return member.mobiles.map(mobile => {
            if (!myLocation.valid || !mobile.lat || !mobile.lng) return null;
            
            const distance = calculateDistance(myLocation.lat, myLocation.lng, mobile.lat, mobile.lng);
            const bearing = calculateBearing(myLocation.lat, myLocation.lng, mobile.lat, mobile.lng);
            const adjustedBearing = headingDeg === null
              ? bearing
              : (bearing - headingDeg + 360) % 360;
            const scaledDistance = Math.min((distance / maxDistance) * radarRadius, radarRadius);
            
            const angleRad = (adjustedBearing - 90) * Math.PI / 180;
            const x = Math.cos(angleRad) * scaledDistance;
            const y = Math.sin(angleRad) * scaledDistance;
            
            // Get RSSI color
            const getRssiColor = (rssi) => {
              if (rssi >= -50) return '#4CAF50';
              if (rssi >= -60) return '#8BC34A';
              if (rssi >= -70) return '#FFC107';
              if (rssi >= -80) return '#FF9800';
              return '#F44336';
            };
            
            return (
              <View
                key={`mobile-${member.deviceId}-${mobile.mobileId}`}
                style={[
                  localStyles.mobileDot,
                  {
                    backgroundColor: getRssiColor(mobile.rssi),
                    left: RADAR_SIZE / 2 + x - 10,
                    top: RADAR_SIZE / 2 + y - 10,
                  }
                ]}
              >
                <Text style={localStyles.mobileDotText}>M{mobile.mobileId}</Text>
              </View>
            );
          });
        })}

        </View>
      </View>
      
      {!myLocation.valid && (
        <Text style={[localStyles.radarNote, { color: colors.black }]}>
          Waiting for GPS to show positions...
        </Text>
      )}
    </View>
  );
};

// Map View Component
// Offline Grid Map Component - Works without internet
const OfflineGridMap = ({ myLocation, members, colors, onMemberPress, breadcrumbs = [], remoteBreadcrumbsByDevice = {} }) => {
  // Find the bounds to fit all members
  const remotePoints = [];
  try {
    Object.values(remoteBreadcrumbsByDevice || {}).forEach(arr => {
      if (!Array.isArray(arr)) return;
      arr.forEach(p => {
        if (p && p.lat && p.lng) remotePoints.push({ lat: p.lat, lng: p.lng });
      });
    });
  } catch (e) {
    // ignore
  }

  const allPoints = [
    ...(myLocation.valid ? [{ lat: myLocation.lat, lng: myLocation.lng }] : []),
    ...members.filter(m => m.lat && m.lng),
    ...breadcrumbs.filter(b => b.lat && b.lng),
    ...remotePoints,
  ];
  
  if (allPoints.length === 0 || !myLocation.valid) {
    return (
      <View style={[localStyles.offlineMapContainer, { backgroundColor: 'transparent', borderColor: colors.glassBorder }]}>
        <BlurView
          intensity={colors.glassIntensity}
          tint={colors.glassTint}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

        <View style={localStyles.offlineMapHeader}>
          <Map size={20} color={colors.primary} />
          <Text style={[localStyles.radarTitle, { color: colors.textDark }]}>Offline Map</Text>
          <Text style={[localStyles.radarRange, { color: colors.gray }]}>GPS Required</Text>
        </View>
        <View style={[localStyles.offlineMapGrid, { height: RADAR_SIZE }]}>
          <Text style={{ color: colors.gray, textAlign: 'center' }}>
            Waiting for GPS signal...{'\n'}Make sure you're outdoors.
          </Text>
        </View>
      </View>
    );
  }
  
  // Calculate bounds
  const maxDistance = Math.max(
    ...members.map(m => m.distance || 0).filter(d => d > 0),
    ...members.flatMap(m => {
      const mobiles = Array.isArray(m?.mobiles) ? m.mobiles : [];
      if (!myLocation?.valid) return [];
      return mobiles
        .map(mobile => {
          if (!mobile?.lat || !mobile?.lng) return 0;
          return calculateDistance(myLocation.lat, myLocation.lng, mobile.lat, mobile.lng) || 0;
        })
        .filter(d => d > 0);
    }),
    200 // Minimum 200m view
  );
  
  // Map size
  const mapSize = RADAR_SIZE;
  const padding = 40;
  const usableSize = mapSize - padding * 2;
  
  // Scale: pixels per meter
  const scale = usableSize / (maxDistance * 2);
  
  // Convert GPS to screen position relative to myLocation
  const gpsToScreen = (lat, lng) => {
    if (!myLocation.valid) return { x: mapSize / 2, y: mapSize / 2 };
    
    const distance = calculateDistance(myLocation.lat, myLocation.lng, lat, lng);
    const bearing = calculateBearing(myLocation.lat, myLocation.lng, lat, lng);
    
    // Scale and clamp
    const scaledDist = Math.min(distance * scale, usableSize / 2);
    const angleRad = (bearing - 90) * Math.PI / 180;
    
    return {
      x: mapSize / 2 + Math.cos(angleRad) * scaledDist,
      y: mapSize / 2 + Math.sin(angleRad) * scaledDist,
    };
  };
  
  // Grid lines (N-S, E-W)
  const gridLines = 5;
  const gridSpacing = usableSize / gridLines;
  
  return (
    <View style={[localStyles.offlineMapContainer, { backgroundColor: 'transparent', borderColor: colors.glassBorder }]}>
      <BlurView
        intensity={colors.glassIntensity}
        tint={colors.glassTint}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

      <View style={localStyles.offlineMapHeader}>
        <Map size={20} color={colors.primary} />
        <Text style={[localStyles.radarTitle, { color: colors.textDark }]}>Offline Map</Text>
        <Text style={[localStyles.radarRange, { color: colors.gray }]}>
          Scale: {formatDistance(maxDistance * 2)}
        </Text>
      </View>
      
      <View style={[localStyles.offlineMapGrid, { width: mapSize, height: mapSize }]}>
        {/* Grid background */}
        <View style={[localStyles.gridBg, { backgroundColor: colors.background }]}>
          {/* Horizontal grid lines */}
          {Array.from({ length: gridLines + 1 }).map((_, i) => (
            <View
              key={`h-${i}`}
              style={{
                position: 'absolute',
                left: padding,
                right: padding,
                top: padding + i * gridSpacing,
                height: 1,
                backgroundColor: colors.borderColor,
                opacity: i === Math.floor(gridLines / 2) ? 0.8 : 0.4,
              }}
            />
          ))}
          
          {/* Vertical grid lines */}
          {Array.from({ length: gridLines + 1 }).map((_, i) => (
            <View
              key={`v-${i}`}
              style={{
                position: 'absolute',
                top: padding,
                bottom: padding,
                left: padding + i * gridSpacing,
                width: 1,
                backgroundColor: colors.borderColor,
                opacity: i === Math.floor(gridLines / 2) ? 0.8 : 0.4,
              }}
            />
          ))}
          
          {/* Cardinal directions */}
          <Text style={[localStyles.gridDir, { top: 5, left: mapSize / 2 - 8, color: colors.primary }]}>N</Text>
          <Text style={[localStyles.gridDir, { bottom: 5, left: mapSize / 2 - 8, color: colors.gray }]}>S</Text>
          <Text style={[localStyles.gridDir, { top: mapSize / 2 - 10, right: 8, color: colors.gray }]}>E</Text>
          <Text style={[localStyles.gridDir, { top: mapSize / 2 - 10, left: 8, color: colors.gray }]}>W</Text>
          
          {/* Distance markers at corners */}
          <Text style={[localStyles.distMarker, { top: padding - 15, right: padding - 5, color: colors.gray }]}>
            {formatDistance(maxDistance)}
          </Text>
          
          {/* Breadcrumb trail (path you've walked) */}
          {breadcrumbs.length > 1 && breadcrumbs.map((point, index) => {
            if (index === 0) return null;
            
            const prevPoint = breadcrumbs[index - 1];
            const pos1 = gpsToScreen(prevPoint.lat, prevPoint.lng);
            const pos2 = gpsToScreen(point.lat, point.lng);
            
            // Calculate line properties for CSS positioning
            const dx = pos2.x - pos1.x;
            const dy = pos2.y - pos1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            return (
              <View
                key={`trail-${index}`}
                style={{
                  position: 'absolute',
                  left: pos1.x,
                  top: pos1.y - 1.5,
                  width: length,
                  height: 3,
                  backgroundColor: '#2ECC71',
                  opacity: 0.7,
                  transform: [{ rotate: `${angle}deg` }],
                  transformOrigin: 'left center',
                  borderRadius: 1.5,
                }}
              />
            );
          })}

          {/* Remote breadcrumb trails (other members) */}
          {Object.entries(remoteBreadcrumbsByDevice || {}).map(([deviceId, points]) => {
            if (!Array.isArray(points) || points.length < 2) return null;

            return points.map((point, index) => {
              if (index === 0) return null;
              const prevPoint = points[index - 1];
              if (!prevPoint?.lat || !prevPoint?.lng || !point?.lat || !point?.lng) return null;

              const pos1 = gpsToScreen(prevPoint.lat, prevPoint.lng);
              const pos2 = gpsToScreen(point.lat, point.lng);
              const dx = pos2.x - pos1.x;
              const dy = pos2.y - pos1.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * 180 / Math.PI;

              return (
                <View
                  key={`rtrail-${deviceId}-${index}`}
                  style={{
                    position: 'absolute',
                    left: pos1.x,
                    top: pos1.y - 1,
                    width: length,
                    height: 2,
                    backgroundColor: '#3498DB',
                    opacity: 0.35,
                    transform: [{ rotate: `${angle}deg` }],
                    transformOrigin: 'left center',
                    borderRadius: 1,
                  }}
                />
              );
            });
          })}
          
          {/* Breadcrumb dots (every few points) */}
          {breadcrumbs.filter((_, i) => i % 5 === 0).map((point, index) => {
            const pos = gpsToScreen(point.lat, point.lng);
            return (
              <View
                key={`dot-${index}`}
                style={{
                  position: 'absolute',
                  left: pos.x - 3,
                  top: pos.y - 3,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: '#27AE60',
                }}
              />
            );
          })}
          
          {/* Your position (center) */}
          <View style={[localStyles.myPosMarker, { left: mapSize / 2 - 12, top: mapSize / 2 - 12, borderColor: colors.primary }]}>
            <View style={[localStyles.myPosInner, { backgroundColor: colors.primary }]} />
          </View>
          <Text style={[localStyles.myPosLabel, { left: mapSize / 2 + 15, top: mapSize / 2 - 8, color: colors.primary }]}>
            You
          </Text>
          
          {/* Device markers */}
          {members.map((member) => {
            if (!member.lat || !member.lng) return null;
            
            const pos = gpsToScreen(member.lat, member.lng);
            const isEmergency = member.alertType === 'SOS' || member.alertType === 'MORSE';
            const isOffline = member.isOffline || member.alertType === 'OFFLINE';
            const markerColor = isEmergency ? colors.accent : isOffline ? colors.gray : colors.gray;
            
            return (
              <TouchableOpacity
                key={member.deviceId}
                style={[
                  localStyles.memberMapMarker,
                  {
                    left: pos.x - 12,
                    top: pos.y - 12,
                    backgroundColor: markerColor,
                    opacity: isOffline ? 0.6 : 1,
                    borderColor: colors.textLight,
                  }
                ]}
                onPress={() => onMemberPress(member)}
              >
                <Text style={[localStyles.memberMapLabel, { color: colors.textLight }]}>D{member.deviceId}</Text>
              </TouchableOpacity>
            );
          })}
          
          {/* Mobile device markers */}
          {members.flatMap(member => {
            if (!member.mobiles || member.mobiles.length === 0) return [];
            return member.mobiles.map(mobile => {
              if (!mobile.lat || !mobile.lng) return null;
              
              const pos = gpsToScreen(mobile.lat, mobile.lng);
              const mobileColor = getPhoneMarkerColor(colors, member.deviceId, mobile.mobileId);
              
              return (
                <View
                  key={`mobile-${member.deviceId}-${mobile.mobileId}`}
                  style={[
                    localStyles.mobileMapMarker,
                    {
                      left: pos.x - 11,
                      top: pos.y - 11,
                      backgroundColor: mobileColor,
                      borderColor: colors.textLight,
                      zIndex: 6,
                    }
                  ]}
                  title={`Mobile ${mobile.mobileId}`}
                  description={`RSSI: ${mobile.rssi} dBm`}
                >
                  <Text style={[localStyles.mobileMapLabel, { color: colors.textLight }]}>M{mobile.mobileId}</Text>
                </View>
              );
            });
          })}
        </View>
      </View>
      
      {/* Coordinates display */}
      <View style={localStyles.coordsDisplay}>
        <Text style={[localStyles.coordsText, { color: colors.textDark }]}>
          {myLocation.lat.toFixed(6)}, {myLocation.lng.toFixed(6)}
        </Text>
      </View>
    </View>
  );
};

const TopoMapView = ({ myLocation, members, colors, onMemberPress, tileUrlTemplate, offlineEnabled }) => {
  if (!MapLibreRN) {
    return (
      <View style={[localStyles.mapError, { backgroundColor: 'transparent', borderColor: colors.glassBorder }]}> 
        <BlurView
          intensity={colors.glassIntensity}
          tint={colors.glassTint}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

        <Map size={32} color={colors.gray} />
        <Text style={[localStyles.mapErrorText, { color: colors.textDark, fontWeight: '800', marginTop: 8 }]}>Requires Dev Build</Text>
        <Text style={[localStyles.mapErrorText, { color: colors.gray, marginTop: 6 }]}>MapLibre isn't available in Expo Go.</Text>
        <Text style={[localStyles.mapErrorText, { color: colors.gray, marginTop: 6 }]}>Use Radar View for now.</Text>
      </View>
    );
  }

  const MLMapView = MapLibreRN.MapView;
  const MLCamera = MapLibreRN.Camera;
  const PointAnnotation = MapLibreRN.PointAnnotation;

  const center = myLocation.valid
    ? [myLocation.lng, myLocation.lat]
    : [120.9842, 14.5995];

  const tileTemplates = useMemo(() => {
    // Offline-only: the topo view must render from local tiles.
    // The online template (EXPO_PUBLIC_TILE_URL_TEMPLATE) is used only to download tiles.
    return [getOfflineTileTemplateUri()];
  }, []);

  const mapStyle = useMemo(() => {
    return {
      version: 8,
      sources: {
        topo: {
          type: 'raster',
          tiles: tileTemplates,
          tileSize: 256,
        },
      },
      layers: [
        {
          id: 'topo',
          type: 'raster',
          source: 'topo',
        },
      ],
    };
  }, [tileTemplates]);

  if (!offlineEnabled) {
    return (
      <View style={[localStyles.mapError, { backgroundColor: 'transparent', borderColor: colors.glassBorder }]}>
        <BlurView
          intensity={colors.glassIntensity}
          tint={colors.glassTint}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

        <Map size={32} color={colors.gray} />
        <Text style={[localStyles.mapErrorText, { color: colors.gray }]}>Offline topo tiles not downloaded yet.</Text>
        <Text style={[localStyles.mapErrorText, { color: colors.gray, marginTop: 6 }]}>
          Download offline tiles in the Location tab first.
        </Text>
      </View>
    );
  }

  return (
    <View style={localStyles.mapContainer}>
      <MLMapView
        style={localStyles.map}
        mapStyle={mapStyle}
        zoomEnabled
        scrollEnabled
        pitchEnabled={false}
        rotateEnabled={false}
        attributionEnabled
      >
        <MLCamera
          centerCoordinate={center}
          zoomLevel={myLocation.valid ? 13 : 10}
          animationMode="flyTo"
          animationDuration={500}
        />

        {myLocation.valid && (
          <PointAnnotation id="me" coordinate={[myLocation.lng, myLocation.lat]}>
            <View style={[localStyles.mapDot, { backgroundColor: colors.primary, borderColor: colors.glassBorder }]} />
          </PointAnnotation>
        )}

        {(members || []).map((member) => {
          if (!member?.lat || !member?.lng) return null;
          return (
            <PointAnnotation
              key={`member-${member.deviceId}`}
              id={`member-${member.deviceId}`}
              coordinate={[member.lng, member.lat]}
              onSelected={() => onMemberPress(member)}
            >
              <View style={[localStyles.mapDot, { backgroundColor: colors.gray, borderColor: colors.glassBorder }]} />
            </PointAnnotation>
          );
        })}

        {(members || []).flatMap((member) => {
          const mobiles = Array.isArray(member?.mobiles) ? member.mobiles : [];
          if (mobiles.length === 0) return [];

          return mobiles.map((mobile) => {
            if (!mobile?.lat || !mobile?.lng) return null;

            const mobileColor = getPhoneMarkerColor(colors, member.deviceId, mobile.mobileId);
            return (
              <PointAnnotation
                key={`mobile-${member.deviceId}-${mobile.mobileId}`}
                id={`mobile-${member.deviceId}-${mobile.mobileId}`}
                coordinate={[mobile.lng, mobile.lat]}
              >
                <View
                  style={[
                    localStyles.mapMobileDot,
                    { backgroundColor: mobileColor, borderColor: colors.glassBorder },
                  ]}
                >
                  <Text style={[localStyles.mapMobileDotText, { color: colors.textLight }]}>M{mobile.mobileId}</Text>
                </View>
              </PointAnnotation>
            );
          });
        })}
      </MLMapView>

      {!myLocation.valid && (
        <View style={[localStyles.mapOverlay, { backgroundColor: colors.overlay }]}>
          <Text style={[localStyles.mapOverlayText, { color: colors.textLight }]}>Waiting for GPS signal...</Text>
        </View>
      )}
    </View>
  );
};

const LocationTab = ({ onLocationPress, onShowDeviceConnection }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { 
    isConnected, 
    connectedDevice, 
    myLocation, 
    phoneLocation,
    memberLocations,
    breadcrumbs,
    remoteBreadcrumbs,
    isTrackingBreadcrumbs,
    startBreadcrumbTracking,
    stopBreadcrumbTracking,
    clearBreadcrumbs,
    getTrailDistance,
  } = useBluetoothDevice();
  const { getMemberNickname } = useLobby();
  const [viewMode, setViewMode] = useState('radar'); // 'map', 'radar', 'list'

  const [offlineMeta, setOfflineMeta] = useState(null);
  const [offlineDownloading, setOfflineDownloading] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState(null);

  const [locationServicesEnabled, setLocationServicesEnabled] = useState(true);

  const effectiveMyLocation = useMemo(() => {
    const isValid = (loc) => {
      if (!loc) return false;
      if (!loc.valid) return false;
      if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return false;
      if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return false;
      if (loc.lat === 0 && loc.lng === 0) return false;
      return true;
    };

    if (isValid(myLocation)) return myLocation;
    if (isValid(phoneLocation)) {
      return {
        lat: phoneLocation.lat,
        lng: phoneLocation.lng,
        satellites: typeof myLocation?.satellites === 'number' ? myLocation.satellites : 0,
        valid: true,
      };
    }
    return myLocation;
  }, [myLocation, phoneLocation]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LOCATION_SERVICES_PREF_KEY);
        if (!alive) return;
        if (saved === null) {
          setLocationServicesEnabled(true);
        } else {
          setLocationServicesEnabled(saved === 'true');
        }
      } catch (e) {
        // default to enabled
        if (alive) setLocationServicesEnabled(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(OFFLINE_TILES_META_KEY);
        if (!alive) return;
        setOfflineMeta(raw ? JSON.parse(raw) : null);
      } catch {
        if (alive) setOfflineMeta(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  
  // Combine member locations with distance calculation
  const membersWithDistance = useMemo(() => {
    return (memberLocations || []).map(member => ({
      ...member,
      name: getMemberNickname ? getMemberNickname(member.deviceId) : `Device ${member.deviceId}`,
      distance: effectiveMyLocation.valid && member.lat && member.lng
        ? calculateDistance(effectiveMyLocation.lat, effectiveMyLocation.lng, member.lat, member.lng)
        : null,
    }));
  }, [effectiveMyLocation.lat, effectiveMyLocation.lng, effectiveMyLocation.valid, getMemberNickname, memberLocations]);

  // Only show other members' trails when that member has sent an SOS.
  const sosRemoteBreadcrumbs = useMemo(() => {
    const sosSet = new Set(
      (membersWithDistance || [])
        .filter(m => m && m.alertType === 'SOS')
        .map(m => String(m.deviceId))
    );

    const entries = Object.entries(remoteBreadcrumbs || {}).filter(([deviceId]) => sosSet.has(String(deviceId)));
    return Object.fromEntries(entries);
  }, [membersWithDistance, remoteBreadcrumbs]);

  const handleMemberPress = (member) => {
    onLocationPress && onLocationPress({
      id: member.deviceId,
      name: member.name,
      lat: member.lat,
      lng: member.lng,
      distance: formatDistance(member.distance),
      alertType: member.alertType,
      isOffline: member.isOffline,
    });
  };

  const offlineTilesAvailable = !!offlineMeta?.tileCount && offlineMeta.tileCount > 0;

  const startOfflineDownload = useCallback(async () => {
    if (!effectiveMyLocation?.valid) {
      Alert.alert('GPS Required', 'Wait for a valid GPS fix before downloading offline maps.');
      return;
    }
    if (!TILE_URL_TEMPLATE) {
      Alert.alert('Tile Source Missing', 'Set EXPO_PUBLIC_TILE_URL_TEMPLATE to a raster tile URL template (e.g. https://your-server/{z}/{x}/{y}.png).');
      return;
    }

    const estimate = estimateTileCountForRegion({
      centerLat: effectiveMyLocation.lat,
      centerLng: effectiveMyLocation.lng,
      radiusKm: OFFLINE_DEFAULT_RADIUS_KM,
      zoomMin: OFFLINE_DEFAULT_ZOOM_MIN,
      zoomMax: OFFLINE_DEFAULT_ZOOM_MAX,
    });

    if (estimate > OFFLINE_MAX_TILES) {
      Alert.alert(
        'Area Too Large',
        `This download would exceed the safety cap (${OFFLINE_MAX_TILES} tiles). Move closer to the area you need or reduce zoom/radius.`
      );
      return;
    }

    setOfflineDownloading(true);
    setOfflineProgress({ completed: 0, attempted: 0, total: Math.min(estimate, OFFLINE_MAX_TILES) });

    try {
      const res = await downloadOfflineRegionTilesAsync({
        centerLat: effectiveMyLocation.lat,
        centerLng: effectiveMyLocation.lng,
        radiusKm: OFFLINE_DEFAULT_RADIUS_KM,
        zoomMin: OFFLINE_DEFAULT_ZOOM_MIN,
        zoomMax: OFFLINE_DEFAULT_ZOOM_MAX,
        tileUrlTemplate: TILE_URL_TEMPLATE,
        maxTiles: OFFLINE_MAX_TILES,
        onProgress: (p) => setOfflineProgress(p),
      });

      const meta = {
        downloadedAt: Date.now(),
        centerLat: effectiveMyLocation.lat,
        centerLng: effectiveMyLocation.lng,
        radiusKm: OFFLINE_DEFAULT_RADIUS_KM,
        zoomMin: OFFLINE_DEFAULT_ZOOM_MIN,
        zoomMax: OFFLINE_DEFAULT_ZOOM_MAX,
        tileCount: res?.completed || 0,
      };
      await AsyncStorage.setItem(OFFLINE_TILES_META_KEY, JSON.stringify(meta));
      setOfflineMeta(meta);
    } catch (e) {
      Alert.alert('Download Failed', e?.message || 'Could not download offline tiles.');
    } finally {
      setOfflineDownloading(false);
    }
  }, [effectiveMyLocation?.lat, effectiveMyLocation?.lng, effectiveMyLocation?.valid]);

  const clearOfflineDownload = useCallback(async () => {
    Alert.alert(
      'Clear Offline Maps',
      'Remove all downloaded offline tiles from this device?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearOfflineTilesAsync();
            await AsyncStorage.removeItem(OFFLINE_TILES_META_KEY);
            setOfflineMeta(null);
            setOfflineProgress(null);
          },
        },
      ]
    );
  }, []);

  return (
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90 }}
      >
        {/* View Mode Toggle */}
        <View style={[localStyles.viewToggle, { backgroundColor: 'transparent', borderColor: colors.glassBorder }]}>
          <BlurView
            intensity={colors.glassIntensity}
            tint={colors.glassTint}
            style={StyleSheet.absoluteFillObject}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

          <TouchableOpacity 
            style={[localStyles.toggleBtn, viewMode === 'map' && { backgroundColor: colors.primary }]}
            onPress={() => setViewMode('map')}
          >
            <Map size={18} color={viewMode === 'map' ? '#fff' : colors.textDark} />
            <Text style={[localStyles.toggleText, { color: viewMode === 'map' ? '#fff' : colors.textDark }]}>Map</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[localStyles.toggleBtn, viewMode === 'radar' && { backgroundColor: colors.primary }]}
            onPress={() => setViewMode('radar')}
          >
            <Target size={18} color={viewMode === 'radar' ? '#fff' : colors.textDark} />
            <Text style={[localStyles.toggleText, { color: viewMode === 'radar' ? '#fff' : colors.textDark }]}>Radar</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[localStyles.toggleBtn, viewMode === 'list' && { backgroundColor: colors.primary }]}
            onPress={() => setViewMode('list')}
          >
            <List size={18} color={viewMode === 'list' ? '#fff' : colors.textDark} />
            <Text style={[localStyles.toggleText, { color: viewMode === 'list' ? '#fff' : colors.textDark }]}>List</Text>
          </TouchableOpacity>
        </View>

        {/* Offline Maps */}
        <View style={[localStyles.trailControls, { backgroundColor: 'transparent', borderColor: 'transparent' }]}>
          <View style={localStyles.trailHeader}>
            <Map size={18} color={colors.primary} />
            <Text style={[localStyles.trailTitle, { color: colors.textDark }]}>Offline Maps</Text>
            {offlineDownloading && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />}
          </View>

          <Text style={[localStyles.trailPoints, { color: colors.gray }]}>Tile source: {TILE_URL_TEMPLATE ? 'Configured' : 'Not set'}</Text>
          <Text style={[localStyles.trailPoints, { color: colors.gray }]}>
            Cached: {offlineTilesAvailable ? `${offlineMeta.tileCount} tiles` : 'None'}
          </Text>
          {!!offlineProgress && offlineDownloading && (
            <Text style={[localStyles.trailPoints, { color: colors.gray }]}>
              Downloading: {offlineProgress.completed}/{offlineProgress.total}
            </Text>
          )}

          <View style={localStyles.trailButtons}>
            <TouchableOpacity
              style={[localStyles.trailBtn, { backgroundColor: colors.primary, flex: 1, opacity: offlineDownloading ? 0.6 : 1 }]}
              onPress={startOfflineDownload}
              disabled={offlineDownloading}
            >
              <Text style={localStyles.trailBtnText}>Download Around Me</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[localStyles.trailBtn, { backgroundColor: colors.gray, marginLeft: 8, opacity: offlineDownloading ? 0.6 : 1 }]}
              onPress={clearOfflineDownload}
              disabled={offlineDownloading}
            >
              <Trash2 size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Trail Tracking Controls */}
        <View style={[localStyles.trailControls, { backgroundColor: 'transparent', borderColor: 'transparent' }]}>
          <View style={localStyles.trailHeader}>
            <Route size={18} color={colors.primary} />
            <Text style={[localStyles.trailTitle, { color: colors.textDark }]}>Trail Breadcrumbs</Text>
            {isTrackingBreadcrumbs && (
              <View style={[localStyles.recordingBadge, { backgroundColor: '#2ECC71' }]}>
                <Text style={localStyles.recordingText}>Recording</Text>
              </View>
            )}
          </View>
          
          <View style={localStyles.trailStats}>
            <Text style={[localStyles.trailDistance, { color: colors.textDark }]}>
              Distance: {formatDistance(getTrailDistance())}
            </Text>
            <Text style={[localStyles.trailPoints, { color: colors.gray }]}>
              {breadcrumbs.length} points
            </Text>
          </View>
          
          <View style={localStyles.trailButtons}>
            <TouchableOpacity 
              style={[
                localStyles.trailBtn, 
                { 
                  backgroundColor: isTrackingBreadcrumbs ? '#E74C3C' : '#2ECC71',
                  flex: 1,
                }
              ]}
              onPress={isTrackingBreadcrumbs ? stopBreadcrumbTracking : startBreadcrumbTracking}
            >
              {isTrackingBreadcrumbs ? (
                <Pause size={18} color="#fff" />
              ) : (
                <Play size={18} color="#fff" />
              )}
              <Text style={localStyles.trailBtnText}>
                {isTrackingBreadcrumbs ? 'Stop Tracking' : 'Start Tracking'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[localStyles.trailBtn, { backgroundColor: colors.gray, marginLeft: 8 }]}
              onPress={() => {
                Alert.alert(
                  'Clear Trail',
                  'Are you sure you want to clear your trail history? This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { 
                      text: 'Clear', 
                      style: 'destructive',
                      onPress: clearBreadcrumbs
                    },
                  ]
                );
              }}
            >
              <Trash2 size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Topo Map View (MapLibre, offline-capable with cached tiles) */}
        {viewMode === 'map' && (
          (MapLibreRN && offlineTilesAvailable) ? (
            <TopoMapView
              myLocation={effectiveMyLocation}
              members={membersWithDistance}
              colors={colors}
              onMemberPress={handleMemberPress}
              tileUrlTemplate={TILE_URL_TEMPLATE}
              offlineEnabled={offlineTilesAvailable}
            />
          ) : (
            <OfflineGridMap
              myLocation={effectiveMyLocation}
              members={membersWithDistance}
              colors={colors}
              onMemberPress={handleMemberPress}
              breadcrumbs={breadcrumbs}
              remoteBreadcrumbsByDevice={sosRemoteBreadcrumbs}
            />
          )
        )}

        {/* Radar View */}
        {viewMode === 'radar' && (
          <RadarView
            myLocation={effectiveMyLocation}
            members={membersWithDistance}
            colors={colors}
            onMemberPress={handleMemberPress}
            locationServicesEnabled={locationServicesEnabled}
          />
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <>
            <Text style={[localStyles.sectionTitle, { color: colors.textDark }]}>
              Phones ({
                (membersWithDistance || []).reduce((acc, member) => {
                  const mobiles = Array.isArray(member?.mobiles) ? member.mobiles : [];
                  return acc + mobiles.filter(m => m && typeof m.mobileId === 'number' && m.mobileId >= 1 && m.mobileId <= 4).length;
                }, 0)
              })
            </Text>
            
            {(membersWithDistance || []).some(m => Array.isArray(m?.mobiles) && m.mobiles.length > 0) ? (
              (membersWithDistance || []).flatMap((member) => {
                const isEmergency = member.alertType === 'SOS' || member.alertType === 'MORSE';
                const isOffline = member.isOffline || member.alertType === 'OFFLINE';
                const mobiles = Array.isArray(member?.mobiles) ? member.mobiles : [];

                return mobiles
                  .filter(m => m && typeof m.mobileId === 'number' && m.mobileId >= 1 && m.mobileId <= 4)
                  .map((mobile) => {
                    const hasCoords = typeof mobile.lat === 'number' && typeof mobile.lng === 'number' && Number.isFinite(mobile.lat) && Number.isFinite(mobile.lng);
                    const mobileDistance = (effectiveMyLocation.valid && hasCoords)
                      ? calculateDistance(effectiveMyLocation.lat, effectiveMyLocation.lng, mobile.lat, mobile.lng)
                      : null;

                    const mobileColor = getPhoneMarkerColor(colors, member.deviceId, mobile.mobileId);
                    const title = `${member.name} · M${mobile.mobileId}`;

                    return (
                      <TouchableOpacity
                        key={`mrow-${member.deviceId}-${mobile.mobileId}`}
                        style={[
                          styles.userLocationRow,
                          {
                            backgroundColor: 'transparent',
                            borderWidth: 1,
                            borderColor: isEmergency ? colors.accent : isOffline ? colors.gray : colors.glassBorder,
                            opacity: isOffline ? 0.7 : 1,
                            overflow: 'hidden',
                            position: 'relative',
                          },
                        ]}
                        onPress={() => {
                          onLocationPress && onLocationPress({
                            id: member.deviceId,
                            name: title,
                            lat: hasCoords ? mobile.lat : member.lat,
                            lng: hasCoords ? mobile.lng : member.lng,
                            distance: formatDistance(mobileDistance),
                            alertType: member.alertType,
                            isOffline: member.isOffline,
                            mobileId: mobile.mobileId,
                          });
                        }}
                        activeOpacity={0.7}
                      >
                        <BlurView
                          intensity={colors.glassIntensity}
                          tint={colors.glassTint}
                          style={StyleSheet.absoluteFillObject}
                        />
                        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

                        <View style={[styles.avatarSmall, { backgroundColor: mobileColor }]}>
                          <Radio size={16} color={colors.textLight} />
                        </View>

                        <View style={localStyles.memberInfo}>
                          <Text style={[styles.locationText, { color: isOffline ? colors.gray : colors.textDark }]}>{title}</Text>
                          <Text style={[localStyles.memberDistance, { color: colors.gray }]}>
                            {isOffline ? 'Connection lost' : formatDistance(mobileDistance)}
                          </Text>
                          {isEmergency && (
                            <Text style={[localStyles.alertBadge, { color: colors.accent }]}>
                              ⚠️ {member.alertType} ALERT
                            </Text>
                          )}
                          {isOffline && (
                            <Text style={[localStyles.alertBadge, { color: colors.gray }]}>
                              📵 OFFLINE
                            </Text>
                          )}
                        </View>

                        <MapPin size={20} color={isEmergency ? colors.accent : isOffline ? colors.gray : colors.danger} />
                      </TouchableOpacity>
                    );
                  });
              })
            ) : (
              <View style={[localStyles.emptyState, { backgroundColor: 'transparent', borderColor: colors.glassBorder }]}>
                <BlurView
                  intensity={colors.glassIntensity}
                  tint={colors.glassTint}
                  style={StyleSheet.absoluteFillObject}
                />
                <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

                <User size={32} color={colors.gray} />
                <Text style={[localStyles.emptyText, { color: colors.gray }]}>
                  {isConnected 
                    ? 'No phone locations detected yet.\nThey will appear when MOBILELOC is received over LoRa.'
                    : 'Connect your device to see group member locations.'}
                </Text>
              </View>
            )}
          </>
        )}
        
        <TouchableOpacity
          activeOpacity={isConnected ? 1 : 0.7}
          onPress={isConnected ? undefined : onShowDeviceConnection}
        >
          <Text style={{ textAlign: 'center', color: colors.black, marginTop: 5, marginBottom: 40, fontSize: 12 }}>
            {isConnected 
              ? 'Locations update automatically via LoRa' 
              : 'Connect to your HikeSafe device to enable GPS tracking'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const localStyles = StyleSheet.create({
  connectionCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionText: {
    marginLeft: 12,
    flex: 1,
  },
  connectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  connectionSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  myLocationCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  lobbyCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  lobbyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lobbyTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  lobbySubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  lobbyCodeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  lobbyCodeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  lobbyMemberCount: {
    fontSize: 12,
    marginTop: 8,
    marginLeft: 30,
  },
  myLocationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  myLocationTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  satBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  satText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  coordsContainer: {
    marginTop: 4,
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  coordLabel: {
    fontSize: 14,
    fontWeight: '600',
    width: 45,
  },
  coordValue: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  waitingText: {
    fontSize: 13,
    lineHeight: 20,
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Map styles
  mapContainer: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  radarDial: {
    alignSelf: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  mapDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  mapMobileDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapMobileDotText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapOverlayText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  mapError: {
    height: 200,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  mapErrorText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  // Radar styles
  radarContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  radarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  radarTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  radarRange: {
    fontSize: 12,
  },
  radar: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarCircle: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  radarRipples: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRipple: {
    position: 'absolute',
    borderWidth: 2,
  },
  radarLineH: {
    position: 'absolute',
    width: '100%',
    height: 1,
  },
  radarLineV: {
    position: 'absolute',
    width: 1,
    height: '100%',
  },
  centerDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  centerLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  dirLabel: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: '600',
    width: 18,
    textAlign: 'center',
  },
  dirN: { top: 8, left: '50%', marginLeft: -9 },
  dirS: { bottom: 8, left: '50%', marginLeft: -9 },
  dirE: { right: 10, top: '50%', marginTop: -8 },
  dirW: { left: 10, top: '50%', marginTop: -8 },
  memberDot: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  memberDotText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  mobileDot: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    borderWidth: 2,
    borderColor: '#fff',
  },
  mobileDotText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  radarNote: {
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 10,
  },
  memberDistance: {
    fontSize: 12,
    marginTop: 2,
  },
  alertBadge: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyState: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  // Offline Grid Map styles
  offlineMapContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  offlineMapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  offlineMapGrid: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridBg: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    position: 'relative',
  },
  gridDir: {
    position: 'absolute',
    fontSize: 14,
    fontWeight: '700',
  },
  distMarker: {
    position: 'absolute',
    fontSize: 10,
  },
  myPosMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  myPosInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  myPosLabel: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: '600',
  },
  memberMapMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  memberMapLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  mobileMapMarker: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
    zIndex: 4,
  },
  mobileMapLabel: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  coordsDisplay: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  coordsText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  // Trail Tracking Styles
  trailControls: {
    marginBottom: 16,
  },
  trailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  trailTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  recordingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  recordingText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  trailStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  trailDistance: {
    fontSize: 14,
    fontWeight: '500',
  },
  trailPoints: {
    fontSize: 12,
  },
  trailButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  trailBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default LocationTab;
