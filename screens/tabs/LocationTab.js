import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, ImageBackground, Alert, Animated, Easing } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { User, MapPin, Radio, Satellite, AlertTriangle, WifiOff, Map, Target, List, Play, Pause, Trash2, Route } from 'lucide-react-native';
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RADAR_SIZE = SCREEN_WIDTH - 64;

const LOCATION_SERVICES_PREF_KEY = '@hikesafe_location_services_enabled';

// Calculate distance between two GPS coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // meters
};

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

// Radar View Component - Works completely offline
const RadarView = ({ myLocation, members, colors, onMemberPress, headingDeg = null }) => {
  const radarPulseAnim = useRef(new Animated.Value(0)).current;

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

  const getCardinalDirection = (deg) => {
    const val = Math.floor((deg / 45) + 0.5);
    const arr = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return arr[(val % 8)];
  };

  // Find max distance to scale the radar
  const maxDistance = Math.max(
    ...members.map(m => m.distance || 0).filter(d => d > 0),
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
    <View style={[localStyles.radarContainer, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
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
        <Text style={[localStyles.radarNote, { color: colors.gray }]}>
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
      <View style={[localStyles.offlineMapContainer, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
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
    <View style={[localStyles.offlineMapContainer, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
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
            const markerColor = isEmergency ? colors.accent : isOffline ? '#999' : '#3498DB';
            
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
                  }
                ]}
                onPress={() => onMemberPress(member)}
              >
                <Text style={localStyles.memberMapLabel}>D{member.deviceId}</Text>
              </TouchableOpacity>
            );
          })}
          
          {/* Mobile device markers */}
          {members.flatMap(member => {
            if (!member.mobiles || member.mobiles.length === 0) return [];
            return member.mobiles.map(mobile => {
              if (!mobile.lat || !mobile.lng) return null;
              
              const pos = gpsToScreen(mobile.lat, mobile.lng);
              
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
                    localStyles.mobileMapMarker,
                    {
                      left: pos.x - 9,
                      top: pos.y - 9,
                      backgroundColor: getRssiColor(mobile.rssi),
                    }
                  ]}
                  title={`Mobile ${mobile.mobileId}`}
                  description={`RSSI: ${mobile.rssi} dBm`}
                >
                  <Text style={localStyles.mobileMapLabel}>M{mobile.mobileId}</Text>
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

// Legacy Map View Component (requires internet) - kept for reference
const MapViewComponent = ({ myLocation, members, colors, onMemberPress }) => {
  const mapRef = useRef(null);
  const [mapError, setMapError] = useState(false);
  
  // Default region (or use myLocation if available)
  const initialRegion = {
    latitude: myLocation.valid ? myLocation.lat : 14.5995,
    longitude: myLocation.valid ? myLocation.lng : 120.9842,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };
  
  // Fit map to show all markers
  useEffect(() => {
    if (mapRef.current && myLocation.valid && members.length > 0) {
      const coordinates = [
        { latitude: myLocation.lat, longitude: myLocation.lng },
        ...members
          .filter(m => m.lat && m.lng)
          .map(m => ({ latitude: m.lat, longitude: m.lng }))
      ];
      
      if (coordinates.length > 1) {
        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
    }
  }, [myLocation, members]);

  if (mapError) {
    return (
      <View style={[localStyles.mapError, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
        <Map size={32} color={colors.gray} />
        <Text style={[localStyles.mapErrorText, { color: colors.gray }]}>
          Map unavailable offline.{'\n'}Switch to Radar View.
        </Text>
      </View>
    );
  }

  return (
    <View style={localStyles.mapContainer}>
      <MapView
        ref={mapRef}
        style={localStyles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsCompass={true}
        showsScale={true}
        mapType="standard"
        onMapReady={() => setMapError(false)}
        onError={() => setMapError(true)}
      >
        {/* My location marker */}
        {myLocation.valid && (
          <>
            <Circle
              center={{ latitude: myLocation.lat, longitude: myLocation.lng }}
              radius={20}
              fillColor="rgba(107, 142, 35, 0.3)"
              strokeColor="rgba(107, 142, 35, 0.8)"
              strokeWidth={2}
            />
            <Marker
              coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }}
              title="You"
              description={`${myLocation.satellites} satellites`}
              pinColor="#6B8E23"
            />
          </>
        )}
        
        {/* Device markers */}
        {members.map((member) => {
          if (!member.lat || !member.lng) return null;
          
          const isEmergency = member.alertType === 'SOS' || member.alertType === 'MORSE';
          const isOffline = member.isOffline || member.alertType === 'OFFLINE';
          
          return (
            <Marker
              key={member.deviceId}
              coordinate={{ latitude: member.lat, longitude: member.lng }}
              title={`Device ${member.deviceId}`}
              description={isEmergency ? `⚠️ ${member.alertType} ALERT` : isOffline ? '📵 Offline' : formatDistance(member.distance)}
              pinColor={isEmergency ? '#E74C3C' : isOffline ? '#999' : '#3498DB'}
              onPress={() => onMemberPress(member)}
            />
          );
        })}
        
        {/* Mobile device markers */}
        {members.flatMap(member => {
          if (!member.mobiles || member.mobiles.length === 0) return [];
          return member.mobiles.map(mobile => {
            if (!mobile.lat || !mobile.lng) return null;
            
            // Get RSSI color for pin
            const getRssiColor = (rssi) => {
              if (rssi >= -50) return '#4CAF50';      // Green
              if (rssi >= -60) return '#8BC34A';      // Light Green
              if (rssi >= -70) return '#FFC107';      // Yellow
              if (rssi >= -80) return '#FF9800';      // Orange
              return '#F44336';                        // Red
            };
            
            return (
              <Marker
                key={`mobile-${member.deviceId}-${mobile.mobileId}`}
                coordinate={{ latitude: mobile.lat, longitude: mobile.lng }}
                title={`D${member.deviceId} Mobile ${mobile.mobileId}`}
                description={`RSSI: ${mobile.rssi} dBm | Distance: ~${mobile.estimatedDistance}m`}
                pinColor={getRssiColor(mobile.rssi)}
              />
            );
          });
        })}
      </MapView>
      
      {!myLocation.valid && (
        <View style={[localStyles.mapOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <Text style={localStyles.mapOverlayText}>Waiting for GPS signal...</Text>
        </View>
      )}
    </View>
  );
};

const LocationTab = ({ onLocationPress, onShowDeviceConnection }) => {
  const { colors } = useTheme();
  const { 
    isConnected, 
    connectedDevice, 
    myLocation, 
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
  // Note: Map view disabled - requires Google Maps API key configuration
  // Use 'radar' (works offline) or 'list' view
  const [viewMode, setViewMode] = useState('radar'); // 'radar', 'list' (map disabled)

  const [locationServicesEnabled, setLocationServicesEnabled] = useState(true);
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
      if (viewMode !== 'radar') return;

      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (perm?.status !== 'granted') {
          setHeadingDeg(null);
          return;
        }
      } catch (e) {
        // If we can't read permission state, keep compass off.
        setHeadingDeg(null);
        return;
      }

      // Keep this responsive but avoid excessive re-renders.
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
  }, [computeHeading, locationServicesEnabled, viewMode]);
  
  // Combine member locations with distance calculation
  const membersWithDistance = useMemo(() => {
    return (memberLocations || []).map(member => ({
      ...member,
      name: getMemberNickname ? getMemberNickname(member.deviceId) : `Device ${member.deviceId}`,
      distance: myLocation.valid && member.lat && member.lng
        ? calculateDistance(myLocation.lat, myLocation.lng, member.lat, member.lng)
        : null,
    }));
  }, [getMemberNickname, memberLocations, myLocation.lat, myLocation.lng, myLocation.valid]);

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

  return (
    <ImageBackground 
      source={require('../../assets/dashboard_bg.png')} 
      style={[styles.tabContainer, { backgroundColor: colors.background }]}
      imageStyle={{ resizeMode: 'cover' }}
    >
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.overlay }]} />
      
      <ScrollView style={{flex:1, backgroundColor: 'transparent'}} contentContainerStyle={{ padding: 16 }}>
        {/* Device Connection Status (only when connected) */}
        {isConnected && (
          <TouchableOpacity 
            style={[localStyles.connectionCard, { 
              backgroundColor: colors.primaryLight,
              borderColor: colors.primary,
            }]}
            onPress={onShowDeviceConnection}
            activeOpacity={0.7}
          >
            <View style={localStyles.connectionHeader}>
              <Radio size={24} color={colors.textLight} />
              <View style={localStyles.connectionText}>
                <Text style={[localStyles.connectionTitle, { color: colors.textLight }]}>
                  {connectedDevice?.name}
                </Text>
                <Text style={[localStyles.connectionSubtitle, { color: colors.textLight, opacity: 0.9 }]}>
                  Tap to manage connection
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* My GPS Location */}
        {isConnected && (
          <View style={[localStyles.myLocationCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
            <View style={localStyles.myLocationHeader}>
              <Satellite size={20} color={colors.primary} />
              <Text style={[localStyles.myLocationTitle, { color: colors.textDark }]}>My GPS Location</Text>
              <View style={[localStyles.satBadge, { backgroundColor: myLocation.valid ? colors.primary : colors.gray }]}>
                <Text style={localStyles.satText}>{myLocation.satellites} sats</Text>
              </View>
            </View>
            
            {myLocation.valid ? (
              <View style={localStyles.coordsContainer}>
                <View style={localStyles.coordRow}>
                  <Text style={[localStyles.coordLabel, { color: colors.gray }]}>LAT:</Text>
                  <Text 
                    style={[localStyles.coordValue, { color: colors.textDark }]}
                    selectable={true}
                    numberOfLines={1}
                  >
                    {myLocation.lat.toFixed(6)}
                  </Text>
                </View>
                <View style={localStyles.coordRow}>
                  <Text style={[localStyles.coordLabel, { color: colors.gray }]}>LNG:</Text>
                  <Text 
                    style={[localStyles.coordValue, { color: colors.textDark }]}
                    selectable={true}
                    numberOfLines={1}
                  >
                    {myLocation.lng.toFixed(6)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={[localStyles.waitingText, { color: colors.gray }]}>
                Waiting for GPS signal...{'\n'}
                Make sure you're outdoors with clear sky view.
              </Text>
            )}
          </View>
        )}

        {/* View Mode Toggle */}
        <View style={[localStyles.viewToggle, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
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

        {/* Offline Grid Map View */}
        {viewMode === 'map' && (
          <OfflineGridMap
            myLocation={myLocation}
            members={membersWithDistance}
            colors={colors}
            onMemberPress={handleMemberPress}
            breadcrumbs={breadcrumbs}
            remoteBreadcrumbsByDevice={sosRemoteBreadcrumbs}
          />
        )}

        {/* Radar View */}
        {viewMode === 'radar' && (
          <RadarView
            myLocation={myLocation}
            members={membersWithDistance}
            colors={colors}
            onMemberPress={handleMemberPress}
            headingDeg={headingDeg}
          />
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <>
            <Text style={[localStyles.sectionTitle, { color: colors.textDark }]}>
              Group Members ({membersWithDistance.length})
            </Text>
            
            {membersWithDistance.length > 0 ? (
              membersWithDistance.map((member) => {
                const isEmergency = member.alertType === 'SOS' || member.alertType === 'MORSE';
                const isOffline = member.isOffline || member.alertType === 'OFFLINE';
                
                return (
                  <TouchableOpacity 
                    key={member.deviceId}
                    style={[styles.userLocationRow, { 
                      backgroundColor: isEmergency 
                        ? '#FFF0F0' 
                        : isOffline 
                          ? '#F5F5F5'
                          : colors.cardBg, 
                      borderColor: isEmergency
                        ? colors.accent
                        : isOffline
                          ? '#999'
                          : colors.borderColor,
                      opacity: isOffline ? 0.7 : 1,
                    }]}
                    onPress={() => handleMemberPress(member)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.avatarSmall, { 
                      backgroundColor: isEmergency
                        ? colors.accent 
                        : isOffline
                          ? '#999'
                          : colors.primary 
                    }]}>
                      {isEmergency ? (
                        <AlertTriangle size={16} color="white" />
                      ) : isOffline ? (
                        <WifiOff size={16} color="white" />
                      ) : (
                        <User size={16} color="white" />
                      )}
                    </View>
                    <View style={localStyles.memberInfo}>
                      <Text style={[styles.locationText, { color: isOffline ? '#666' : colors.textDark }]}>{member.name}</Text>
                      <Text style={[localStyles.memberDistance, { color: colors.gray }]}>
                        {isOffline ? 'Connection lost' : formatDistance(member.distance)}
                      </Text>
                      {isEmergency && (
                        <Text style={[localStyles.alertBadge, { color: colors.accent }]}>
                          ⚠️ {member.alertType} ALERT
                        </Text>
                      )}
                      {isOffline && (
                        <Text style={[localStyles.alertBadge, { color: '#999' }]}>
                          📵 OFFLINE
                        </Text>
                      )}
                    </View>
                    <MapPin size={20} color={isEmergency ? colors.accent : isOffline ? '#999' : 'red'} />
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={[localStyles.emptyState, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
                <User size={32} color={colors.gray} />
                <Text style={[localStyles.emptyText, { color: colors.gray }]}>
                  {isConnected 
                    ? 'No other group members detected yet.\nLocations will appear when LoRa signals are received.'
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
          <Text style={{ textAlign: 'center', color: colors.gray, marginTop: 20, marginBottom: 40, fontSize: 12 }}>
            {isConnected 
              ? 'Locations update automatically via LoRa' 
              : 'Connect to your HikeSafe device to enable GPS tracking'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ImageBackground>
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
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
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
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 16,
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
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  mapErrorText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  // Radar styles
  radarContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
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
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  // Offline Grid Map styles
  offlineMapContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
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
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
    zIndex: 4,
  },
  mobileMapLabel: {
    color: '#fff',
    fontSize: 8,
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
