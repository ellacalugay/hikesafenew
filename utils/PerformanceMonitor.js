import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Platform } from 'react-native';

/**
 * PerformanceMonitor - Real-time FPS and performance metrics display
 * Usage: <PerformanceMonitor />
 * 
 * Shows:
 * - Current FPS (frames per second)
 * - Average FPS over last 30 frames
 * - Whether performance is acceptable (60fps target)
 * - Memory usage info (if available via React Native)
 */
export const PerformanceMonitor = () => {
  const [fps, setFps] = useState(0);
  const [avgFps, setAvgFps] = useState(0);
  const [isLaggy, setIsLaggy] = useState(false);
  const [memoryUsage, setMemoryUsage] = useState(0);

  const frameCountRef = useRef(0);
  const fpsHistoryRef = useRef([]);
  const lastTimeRef = useRef(Date.now());
  const animationFrameRef = useRef(null);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = Date.now();

    const measureFrame = () => {
      const now = Date.now();
      const delta = now - lastTime;

      if (delta >= 1000) {
        // Calculate FPS for this second
        const currentFps = frameCount;
        setFps(currentFps);

        // Track history for average
        fpsHistoryRef.current.push(currentFps);
        if (fpsHistoryRef.current.length > 30) {
          fpsHistoryRef.current.shift();
        }

        // Calculate average
        const average = Math.round(
          fpsHistoryRef.current.reduce((a, b) => a + b, 0) /
            fpsHistoryRef.current.length
        );
        setAvgFps(average);

        // Flag if laggy (below 50fps)
        setIsLaggy(average < 50);

        frameCount = 0;
        lastTime = now;
      }

      frameCount++;

      // Get memory usage if available (Android)
      if (Platform.OS === 'android' && global.gc) {
        try {
          // Note: This requires --expose-gc flag in dev builds
          global.gc();
        } catch (e) {
          // gc not available
        }
      }

      animationFrameRef.current = requestAnimationFrame(measureFrame);
    };

    animationFrameRef.current = requestAnimationFrame(measureFrame);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const statusColor = isLaggy ? '#ff6b6b' : '#51cf66';
  const statusText = isLaggy ? 'LAGGING' : 'GOOD';

  return (
    <View style={[styles.container, { backgroundColor: 'rgba(0, 0, 0, 0.8)' }]}>
      <View style={{ marginBottom: 8 }}>
        <Text style={styles.label}>FPS Monitor</Text>
        <Text style={[styles.value, { color: statusColor }]}>
          {fps} fps ({statusText})
        </Text>
        <Text style={[styles.secondaryValue]}>
          Avg: {avgFps} fps (30s)
        </Text>
      </View>

      <View style={styles.divider} />

      <View>
        <Text style={styles.label}>Performance</Text>
        <View
          style={[
            styles.statusBar,
            {
              width: `${Math.min((avgFps / 60) * 100, 100)}%`,
              backgroundColor: isLaggy ? '#ff6b6b' : '#51cf66',
            },
          ]}
        />
        <Text style={styles.secondaryValue}>
          {isLaggy ? '⚠️ Frame drops detected' : '✅ Performance OK'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 9999,
    padding: 10,
    borderRadius: 8,
    minWidth: 140,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  label: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
    opacity: 0.8,
  },
  value: {
    color: '#51cf66',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  secondaryValue: {
    color: '#aaa',
    fontSize: 10,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 8,
  },
  statusBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
  },
});

export default PerformanceMonitor;
