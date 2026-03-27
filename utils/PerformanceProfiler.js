import React from 'react';
import { Platform } from 'react-native';

/**
 * PerformanceProfiler - Track component render times and performance
 * Usage: Wrap components with <PerformanceProfiler name="ComponentName">
 * 
 * Development only - automatically disabled in production
 */

const IS_DEV = __DEV__; // React Native's built-in dev flag
const ENABLE_PROFILING = IS_DEV && true; // Toggle profiling here

// Storage for performance metrics
const performanceMetricsRef = {
  renders: {},
  slowRenders: [], // Track renders > 16ms (60fps threshold)
};

/**
 * Hook to measure component render performance
 * @param {string} componentName - Name of the component being measured
 * @returns {void}
 */
export const useRenderProfiler = (componentName) => {
  const renderStartRef = React.useRef(Date.now());
  const renderCountRef = React.useRef(0);

  React.useLayoutEffect(() => {
    if (!ENABLE_PROFILING) return;

    const renderEnd = Date.now();
    const renderDuration = renderEnd - renderStartRef.current;
    renderCountRef.current++;

    // Initialize metrics if needed
    if (!performanceMetricsRef.renders[componentName]) {
      performanceMetricsRef.renders[componentName] = {
        count: 0,
        total: 0,
        min: Infinity,
        max: 0,
        avg: 0,
      };
    }

    const metrics = performanceMetricsRef.renders[componentName];
    metrics.count++;
    metrics.total += renderDuration;
    metrics.min = Math.min(metrics.min, renderDuration);
    metrics.max = Math.max(metrics.max, renderDuration);
    metrics.avg = metrics.total / metrics.count;

    // Flag slow renders (> 16ms is slower than 60fps)
    if (renderDuration > 16) {
      performanceMetricsRef.slowRenders.push({
        component: componentName,
        duration: renderDuration,
        timestamp: new Date().toLocaleTimeString(),
      });

      // Keep last 100 slow renders
      if (performanceMetricsRef.slowRenders.length > 100) {
        performanceMetricsRef.slowRenders.shift();
      }

      if (renderDuration > 32) {
        // Double frame time - really slow
        console.warn(
          `🐌 SLOW RENDER: ${componentName} took ${renderDuration.toFixed(1)}ms (target: <16ms)`
        );
      }
    }
  });
};

/**
 * Get all recorded performance metrics
 */
export const getPerformanceMetrics = () => {
  if (!ENABLE_PROFILING) {
    return { error: 'Profiling disabled - set ENABLE_PROFILING=true' };
  }

  return {
    renders: performanceMetricsRef.renders,
    slowRenders: performanceMetricsRef.slowRenders,
    timestamp: new Date().toLocaleTimeString(),
  };
};

/**
 * Reset performance metrics (call between test runs)
 */
export const resetPerformanceMetrics = () => {
  performanceMetricsRef.renders = {};
  performanceMetricsRef.slowRenders = [];
};

/**
 * Log performance report to console
 */
export const logPerformanceReport = () => {
  if (!ENABLE_PROFILING) {
    console.log('❌ Profiling not enabled');
    return;
  }

  console.log('\n📊 PERFORMANCE REPORT\n');
  console.log('Component Render Times:');
  console.log('─'.repeat(60));

  const sortedByAvg = Object.entries(performanceMetricsRef.renders).sort(
    ([, a], [, b]) => b.avg - a.avg
  );

  sortedByAvg.forEach(([component, metrics]) => {
    const avgMs = metrics.avg.toFixed(2);
    const minMs = metrics.min.toFixed(2);
    const maxMs = metrics.max.toFixed(2);
    const indicator = metrics.avg > 16 ? '🐌' : metrics.avg > 8 ? '⚠️' : '✅';

    console.log(
      `${indicator} ${component} | ${metrics.count} renders | avg: ${avgMs}ms (min: ${minMs}ms, max: ${maxMs}ms)`
    );
  });

  if (performanceMetricsRef.slowRenders.length > 0) {
    console.log('\n⚠️ Slow Renders (>16ms):');
    console.log('─'.repeat(60));
    const recentSlow = performanceMetricsRef.slowRenders.slice(-10);
    recentSlow.forEach(({ component, duration, timestamp }) => {
      console.log(`${timestamp} | ${component} | ${duration.toFixed(1)}ms`);
    });
  }

  console.log('\n');
};

/**
 * PerformanceProfiler Component
 * Wraps components to measure render time
 */
export const PerformanceProfiler = ({ name, children }) => {
  if (!ENABLE_PROFILING) {
    return children;
  }

  useRenderProfiler(name);
  return children;
};

export default PerformanceProfiler;
