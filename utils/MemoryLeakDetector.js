import { useEffect, useRef, useCallback } from 'react';

/**
 * MemoryLeakDetector - Track subscriptions, timers, and cleanup
 * Helps identify memory leaks from uncleared intervals, subscriptions, etc.
 */

const trackedResourcesRef = {
  intervals: [],
  timeouts: [],
  subscriptions: [],
  listeners: [],
  asyncOperations: [],
};

const ENABLE_LEAK_DETECTION = __DEV__; // Dev only

/**
 * useTrackedSetInterval - setInterval with automatic leak detection
 * @param {function} callback - Function to call
 * @param {number} delay - Delay in ms
 * @returns {function} - Cleanup function
 */
export const useTrackedSetInterval = (callback, delay) => {
  const componentRef = useRef(null);

  useEffect(() => {
    const intervalId = setInterval(callback, delay);

    if (ENABLE_LEAK_DETECTION) {
      trackedResourcesRef.intervals.push({
        id: intervalId,
        component: componentRef.current?.displayName || 'Unknown',
        createdAt: new Date(),
        delay,
      });
    }

    return () => {
      clearInterval(intervalId);
      if (ENABLE_LEAK_DETECTION) {
        trackedResourcesRef.intervals = trackedResourcesRef.intervals.filter(
          (i) => i.id !== intervalId
        );
      }
    };
  }, [callback, delay]);
};

/**
 * useTrackedSetTimeout - setTimeout with automatic leak detection
 * @param {function} callback - Function to call
 * @param {number} delay - Delay in ms
 * @returns {function} - Cleanup function
 */
export const useTrackedSetTimeout = (callback, delay) => {
  useEffect(() => {
    const timeoutId = setTimeout(callback, delay);

    if (ENABLE_LEAK_DETECTION) {
      trackedResourcesRef.timeouts.push({
        id: timeoutId,
        createdAt: new Date(),
        delay,
      });
    }

    return () => {
      clearTimeout(timeoutId);
      if (ENABLE_LEAK_DETECTION) {
        trackedResourcesRef.timeouts = trackedResourcesRef.timeouts.filter(
          (t) => t.id !== timeoutId
        );
      }
    };
  }, [callback, delay]);
};

/**
 * useTrackedSubscription - Track subscriptions/listeners
 * @param {object} subscription - The subscription object or cleanup function
 * @param {string} name - Subscription name for debugging
 */
export const useTrackedSubscription = (subscription, name = 'Unknown') => {
  useEffect(() => {
    if (ENABLE_LEAK_DETECTION) {
      trackedResourcesRef.subscriptions.push({
        name,
        createdAt: new Date(),
        stack: new Error().stack, // Capture where subscription was created
      });
    }

    return () => {
      if (subscription?.remove) {
        subscription.remove();
      } else if (typeof subscription === 'function') {
        subscription();
      }

      if (ENABLE_LEAK_DETECTION) {
        trackedResourcesRef.subscriptions = trackedResourcesRef.subscriptions.filter(
          (s) => s.name !== name
        );
      }
    };
  }, [subscription, name]);
};

/**
 * useTrackedAsyncOperation - Track async operations that might leak
 * @param {function} asyncFn - The async function
 * @param {array} deps - Dependencies
 * @returns {function} - The wrapped async function
 */
export const useTrackedAsyncOperation = (asyncFn, deps = []) => {
  const isMountedRef = useRef(true);
  const operationRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const wrappedFn = useCallback(
    async (...args) => {
      if (!isMountedRef.current) return;

      const operationId = Math.random().toString(36).substr(2, 9);

      if (ENABLE_LEAK_DETECTION) {
        operationRef.current = {
          id: operationId,
          createdAt: new Date(),
          completed: false,
        };
        trackedResourcesRef.asyncOperations.push(operationRef.current);
      }

      try {
        const result = await asyncFn(...args);
        if (isMountedRef.current) {
          if (ENABLE_LEAK_DETECTION && operationRef.current) {
            operationRef.current.completed = true;
          }
          return result;
        }
      } catch (error) {
        if (isMountedRef.current) {
          throw error;
        } else if (ENABLE_LEAK_DETECTION) {
          console.warn('⚠️ Async operation error on unmounted component:', error);
        }
      }
    },
    [asyncFn]
  );

  return wrappedFn;
};

/**
 * Get memory leak detection report
 * @returns {object} - Report of tracked resources
 */
export const getMemoryLeakDetectionReport = () => {
  if (!ENABLE_LEAK_DETECTION) {
    return { error: 'Leak detection disabled - enable in dev mode' };
  }

  const unclearedIntervals = trackedResourcesRef.intervals;
  const unclearedTimeouts = trackedResourcesRef.timeouts;
  const unclearedSubscriptions = trackedResourcesRef.subscriptions;
  const incompleteOperations = trackedResourcesRef.asyncOperations.filter(
    (op) => !op.completed
  );

  return {
    unclearedIntervals,
    unclearedTimeouts,
    unclearedSubscriptions,
    incompleteOperations,
    hasLeaks:
      unclearedIntervals.length > 0 ||
      unclearedTimeouts.length > 0 ||
      unclearedSubscriptions.length > 0 ||
      incompleteOperations.length > 0,
  };
};

/**
 * Log memory leak detection report
 */
export const logMemoryLeakReport = () => {
  if (!ENABLE_LEAK_DETECTION) {
    console.log('❌ Leak detection not enabled');
    return;
  }

  const report = getMemoryLeakDetectionReport();

  console.log('\n🔍 MEMORY LEAK DETECTION REPORT\n');

  if (report.unclearedIntervals.length > 0) {
    console.warn(`⚠️ Uncleared Intervals: ${report.unclearedIntervals.length}`);
    report.unclearedIntervals.forEach((i) => {
      const age = Math.round(
        (Date.now() - i.createdAt.getTime()) / 1000
      );
      console.log(`  - ID: ${i.id} (${i.delay}ms, age: ${age}s)`);
    });
  }

  if (report.unclearedTimeouts.length > 0) {
    console.warn(`⚠️ Uncleared Timeouts: ${report.unclearedTimeouts.length}`);
    report.unclearedTimeouts.forEach((t) => {
      const age = Math.round((Date.now() - t.createdAt.getTime()) / 1000);
      console.log(`  - ID: ${t.id} (${t.delay}ms, age: ${age}s)`);
    });
  }

  if (report.unclearedSubscriptions.length > 0) {
    console.warn(
      `⚠️ Uncleared Subscriptions: ${report.unclearedSubscriptions.length}`
    );
    report.unclearedSubscriptions.forEach((s) => {
      const age = Math.round((Date.now() - s.createdAt.getTime()) / 1000);
      console.log(`  - ${s.name} (age: ${age}s)`);
    });
  }

  if (report.incompleteOperations.length > 0) {
    console.warn(
      `⚠️ Incomplete Async Operations: ${report.incompleteOperations.length}`
    );
    report.incompleteOperations.forEach((op) => {
      const age = Math.round((Date.now() - op.createdAt.getTime()) / 1000);
      console.log(`  - ID: ${op.id} (age: ${age}s)`);
    });
  }

  if (!report.hasLeaks) {
    console.log('✅ No memory leaks detected!');
  }

  console.log('\n');
};

/**
 * Reset all tracked resources
 */
export const resetMemoryTracking = () => {
  trackedResourcesRef.intervals = [];
  trackedResourcesRef.timeouts = [];
  trackedResourcesRef.subscriptions = [];
  trackedResourcesRef.asyncOperations = [];
};

export default {
  useTrackedSetInterval,
  useTrackedSetTimeout,
  useTrackedSubscription,
  useTrackedAsyncOperation,
  getMemoryLeakDetectionReport,
  logMemoryLeakReport,
  resetMemoryTracking,
};
