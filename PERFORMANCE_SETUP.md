# Performance Optimization Implementation Guide

## Overview

The HikeSafe app now includes comprehensive performance monitoring and optimization tools. This guide shows how to use them for development, testing, and debugging.

---

## Table of Contents

1. [Priority 1: Frame Rate Profiling](#priority-1-frame-rate-profiling)
2. [Priority 2: Memory Leak Detection](#priority-2-memory-leak-detection)
3. [Priority 3: Virtual Scrolling](#priority-3-virtual-scrolling)
4. [Debugging Workflow](#debugging-workflow)
5. [Console Commands](#console-commands)
6. [Best Practices](#best-practices)

---

## Priority 1: Frame Rate Profiling

### 1.1 FPS Monitor Overlay

Display real-time FPS metrics in the top-right corner of your app during development.

**Files:**
- [utils/PerformanceMonitor.js](utils/PerformanceMonitor.js) - FPS monitoring component
- [utils/PerformanceProfiler.js](utils/PerformanceProfiler.js) - Render time profiling

**Usage:**

Add to [App.js](App.js) in your main render (development only):

```javascript
import { PerformanceMonitor } from './utils/PerformanceMonitor';

// In your App render:
return (
  <>
    {__DEV__ && <PerformanceMonitor />}
    {/* Rest of app */}
  </>
);
```

**What it shows:**
- Current FPS (green = 60fps, red = <50fps)
- Average FPS over 30 seconds
- Performance status bar
- ⚠️ Warning if drops below 50fps

### 1.2 Component Render Profiling

Measure individual component render times to find bottlenecks.

**Usage:**

Wrap components you want to profile:

```javascript
import { PerformanceProfiler } from './utils/PerformanceProfiler';

export default function HomeTab() {
  return (
    <PerformanceProfiler name="HomeTab">
      <View>
        {/* Component content */}
      </View>
    </PerformanceProfiler>
  );
}
```

**Check results in console:**

```javascript
import { logPerformanceReport } from './utils/PerformanceProfiler';

// In your app, after testing:
logPerformanceReport();

// Output:
// 📊 PERFORMANCE REPORT
// HomeTab | 15 renders | avg: 4.2ms (min: 2.1ms, max: 8.5ms) ✅
// MembersList | 12 renders | avg: 18.3ms (min: 15.2ms, max: 25.1ms) 🐌
```

**Interpreting results:**
- `< 8ms` = Excellent ✅
- `8-16ms` = Good ⚠️
- `> 16ms` = Slow 🐌 (impacts 60fps)

---

## Priority 2: Memory Leak Detection

### 2.1 Tracked Timers & Intervals

Use these instead of `setInterval` / `setTimeout` to automatically detect leaks.

**Usage:**

```javascript
import { useTrackedSetInterval } from './utils/MemoryLeakDetector';

export function MyComponent() {
  useTrackedSetInterval(() => {
    console.log('This interval will be tracked');
  }, 1000);
  // Automatically cleaned up on unmount
}
```

**Usage for setTimeout:**

```javascript
import { useTrackedSetTimeout } from './utils/MemoryLeakDetector';

useTrackedSetTimeout(() => {
  updateLocation();
}, 2000);
// Auto-cleanup on unmount
```

### 2.2 Tracked Subscriptions

Track BLE, event, or notification subscriptions.

**Usage:**

```javascript
import { useTrackedSubscription } from './utils/MemoryLeakDetector';

export function BluetoothComponent() {
  const subscription = bleDevice.onNotify((data) => {
    handleData(data);
  });

  useTrackedSubscription(subscription, 'BLE_RX_Subscription');
  // Automatically cleaned up on unmount
}
```

### 2.3 Check for Memory Leaks

Run this in console after replicating a scenario (like disconnect/reconnect):

```javascript
import { logMemoryLeakReport } from './utils/MemoryLeakDetector';

logMemoryLeakReport();

// Output:
// 🔍 MEMORY LEAK DETECTION REPORT
// 
// ✅ No memory leaks detected!
//
// OR if leaks found:
//
// ⚠️ Uncleared Intervals: 2
//   - ID: 123 (5000ms, age: 45s)
//
// ⚠️ Uncleared Timeouts: 1
//   - ID: 456 (2000ms, age: 30s)
```

---

## Priority 3: Virtual Scrolling

### 3.1 Optimized List Rendering

Use `OptimizedFlatList` for better performance with large lists.

**Files:**
- [utils/VirtualizedListManager.js](utils/VirtualizedListManager.js)

**Usage:**

Replace regular `FlatList`:

```javascript
// BEFORE:
import { FlatList } from 'react-native';
<FlatList data={items} renderItem={renderItem} />

// AFTER:
import { OptimizedFlatList } from './utils/VirtualizedListManager';
<OptimizedFlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  itemSize={60} // Height of each item in pixels
/>
```

**What it optimizes:**
- Only renders visible items + small buffer
- Unmounts off-screen items to free memory
- Batches DOM updates for smoother scrolling
- Throttles scroll events to 60fps

### 3.2 Memoize List Items

Prevent unnecessary re-renders of list items:

```javascript
import { createMemoizedListItem } from './utils/VirtualizedListManager';

const PhoneListItem = createMemoizedListItem(({ item, colors }) => (
  <View style={[styles.card, { backgroundColor: colors.cardBg }]}>
    <Text>{item.name}</Text>
  </View>
));

// Use in list:
<OptimizedFlatList
  renderItem={({ item }) => <PhoneListItem item={item} colors={colors} />}
  // ...
/>
```

### 3.3 Debounce High-Frequency Updates

Prevent too many rapid list updates:

```javascript
import { useOptimizedListData } from './utils/VirtualizedListManager';

export function MembersList({ memberLocations }) {
  // Batch updates every 500ms instead of per-update
  const optimizedData = useOptimizedListData(memberLocations, 500);

  return (
    <OptimizedFlatList
      data={optimizedData}
      renderItem={renderMember}
      itemSize={80}
    />
  );
}
```

**Benefits:**
- Reduces re-renders from 10/sec to 2/sec
- Smoother scrolling
- Lower CPU usage

---

## Debugging Workflow

### During Development

**Step 1: Add Performance Monitor**
```javascript
// In App.js
{__DEV__ && <PerformanceMonitor />}
```

**Step 2: Profile Suspect Components**
```javascript
// Wrap components you want to measure
<PerformanceProfiler name="ComponentName">
  <YourComponent />
</PerformanceProfiler>
```

**Step 3: Test on Slow Device**
- Use Android emulator with reduced specs
- Or use actual low-end phone if available
- Watch FPS monitor during interactions

**Step 4: Review Results**
```javascript
// In browser console or debug console:
logPerformanceReport();
logMemoryLeakReport();
```

### Test Scenario: Multi-Phone Connection

1. Start app with performance monitor visible
2. Connect to device
3. Watch FPS while:
   - First phone navigates
   - Second phone connects
   - Third phone connects
4. Note FPS drops in monitor
5. Call `logPerformanceReport()` to see which components are slow

### Test Scenario: Disconnect/Reconnect Cycle

1. Enable memory leak detection
2. Connect to device
3. Disconnect
4. Reconnect
5. Repeat 5 times
6. Call `logMemoryLeakReport()` to check for leaks

---

## Console Commands

### Performance Reports

```javascript
// Import at runtime in browser console
import { logPerformanceReport, getPerformanceMetrics } from './utils/PerformanceProfiler';

// Log full report
logPerformanceReport();

// Get raw metrics as JSON
console.log(getPerformanceMetrics());

// Reset metrics between test runs
resetPerformanceMetrics();
```

### Memory Reports

```javascript
import { logMemoryLeakReport, getMemoryLeakDetectionReport } from './utils/MemoryLeakDetector';

// Log full report
logMemoryLeakReport();

// Get raw report as JSON
console.log(getMemoryLeakDetectionReport());

// Reset tracking
resetMemoryTracking();
```

### Developer Settings

Toggle debug features from code:

```javascript
import { getDeveloperSettings, setDeveloperSetting, DEV_SETTINGS } from './utils/DeveloperSettings';

// Check if performance monitor should show
const showMonitor = await getDeveloperSetting(DEV_SETTINGS.SHOW_PERFORMANCE_MONITOR);

// Toggle it
setDeveloperSetting(DEV_SETTINGS.SHOW_PERFORMANCE_MONITOR, true);

// See all settings
console.log(await getDeveloperSettings());
```

---

## Best Practices

### ✅ DO

1. **Profile regularly during development**
   - Don't wait until release to measure performance
   - Catch regressions early

2. **Test on low-end devices**
   - Performance on your dev machine ≠ user experience
   - Target Android 6+, iPhone SE era phones

3. **Use OptimizedFlatList for lists > 50 items**
   - Prevents memory bloat with large datasets
   - Smooth scrolling guaranteed

4. **Place performance monitor in top-right corner**
   - Easy to see while testing
   - Doesn't obscure app content

5. **Log reports after significant changes**
   - Before/after comparisons
   - Document improvements

### ❌ DON'T

1. **Don't ship with PerformanceMonitor active**
   - Add condition: `{__DEV__ && <PerformanceMonitor />}`
   - Hides it in production builds

2. **Don't ignore memory leak warnings**
   - Leaks compound over time
   - Fix before they affect users

3. **Don't render 100+ items at once**
   - Always use virtual scrolling
   - Or paginate/lazy-load data

4. **Don't profile without reproduction steps**
   - "It's slow" is not actionable
   - Capture: "MultiPhoneConnection causes frame drops"

5. **Don't optimize prematurely**
   - Measure first, optimize based on data
   - Most components are fine as-is

---

## Common Issues & Solutions

### "FPS Monitor not showing"
- Check `__DEV__` evaluates to true
- Ensure `PerformanceMonitor` is imported correctly
- Verify it's at app root level

### "Memory leak reports show false positives"
- Some frameworks intentionally hold timers
- Cross-reference with actual memory growth
- Use Android Studio profiler for confirmation

### "OptimizedFlatList is slower than FlatList"
- Tweak `itemSize` parameter (should match your item height)
- Verify `keyExtractor` is implemented correctly
- Check `removeClippedSubviews` doesn't break your items

### "Performance reports show components I didn't wrap"
- Only wrapped components will show in reports
- Wrap the parent if you want child metrics too

---

## Next Steps

1. ✅ Add `PerformanceMonitor` to [App.js](App.js)
2. ✅ Update SettingsScreen with developer toggle
3. ✅ Profile HomeTab, MembersTab, MessageTab
4. ✅ Identify components with >16ms render time
5. ✅ Convert large FlatLists to OptimizedFlatList
6. ✅ Test multi-phone scenarios with monitor active
7. ✅ Log reports before/after optimizations

---

## Files Overview

| File | Purpose | When to Use |
|------|---------|------------|
| [PerformanceMonitor.js](utils/PerformanceMonitor.js) | Real-time FPS overlay | Always during dev testing |
| [PerformanceProfiler.js](utils/PerformanceProfiler.js) | Component render timing | Finding slow components |
| [MemoryLeakDetector.js](utils/MemoryLeakDetector.js) | Leak detection | After connect/disconnect cycles |
| [VirtualizedListManager.js](utils/VirtualizedListManager.js) | List optimization | For lists > 50 items |
| [DeveloperSettings.js](utils/DeveloperSettings.js) | Dev settings UI | Toggle features |
| [PerformanceUtils.js](utils/PerformanceUtils.js) | Unified exports | Import from here |

---

**Happy optimizing!** 🚀
