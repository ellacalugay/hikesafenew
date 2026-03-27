/**
 * Performance Utilities - Development debugging tools
 * 
 * Usage in development:
 * 
 * 1. Show FPS Monitor overlay:
 *    import { PerformanceMonitor } from './utils/PerformanceUtils';
 *    <PerformanceMonitor /> // Add to App component
 * 
 * 2. Profile component render times:
 *    import { PerformanceProfiler, logPerformanceReport } from './utils/PerformanceUtils';
 *    <PerformanceProfiler name="HomeTab">
 *      <YourComponent />
 *    </PerformanceProfiler>
 *    // Call logPerformanceReport() in console after testing
 * 
 * 3. Detect memory leaks:
 *    import { logMemoryLeakReport } from './utils/PerformanceUtils';
 *    // Call in console: logMemoryLeakReport()
 */

export { PerformanceMonitor as default } from './PerformanceMonitor';
export { PerformanceMonitor } from './PerformanceMonitor';
export {
  PerformanceProfiler,
  useRenderProfiler,
  getPerformanceMetrics,
  resetPerformanceMetrics,
  logPerformanceReport,
} from './PerformanceProfiler';
export {
  useTrackedSetInterval,
  useTrackedSetTimeout,
  useTrackedSubscription,
  useTrackedAsyncOperation,
  getMemoryLeakDetectionReport,
  logMemoryLeakReport,
  resetMemoryTracking,
} from './MemoryLeakDetector';
