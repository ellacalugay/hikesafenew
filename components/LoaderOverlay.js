import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, Animated, Easing, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

const LoaderOverlay = ({ visible = true, message = 'Loading...', backgroundColor = '#18181b' }) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    
    // Clean up on unmount or visibility change
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [pulse, visible]);

  if (!visible) return null;

  const logoScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const logoOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  return (
    <View style={[styles.overlayContainer, { backgroundColor }]}>
      <View style={styles.wrapper}>
        <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity }}>
          <Image
            source={require('../assets/hike_logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
        <Text style={styles.loadingText}>{message}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute', // Makes it float over other content
    top: 0,
    left: 0,
    width: width,
    height: height,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999, // Ensures it sits on top of everything else
    elevation: 10, // For Android z-index
  },
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },
  logo: {
    width: 150,
    height: 150,
  },
  loadingText: {
    textAlign: 'center',
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    // Removed translateX: 6 to ensure perfect centering
  },
});

export default LoaderOverlay;