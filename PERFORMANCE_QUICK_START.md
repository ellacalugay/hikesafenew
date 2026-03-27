# Performance Optimization - Quick Start Guide

## 🚀 30-Second Setup

### Step 1: Add FPS Monitor to App.js

```javascript
import { PerformanceMonitor } from './utils/PerformanceMonitor';

export default function App() {
  return (
    <>
      {__DEV__ && <PerformanceMonitor />}  {/* Add this line */}
      {/* Rest of your app */}
    </>
  );
}
```

### Step 2: Test the App

```bash
# Run in development mode
npm start
# or
eas build --platform android --profile preview
```

**You should see a small FPS monitor in the top-right corner showing:**
- Current FPS (green = good, red = laggy)
- Average FPS over 30 seconds
- Performance status bar

### Step 3: Use During Testing

- Navigate around the app
- Connect/disconnect devices
- Connect multiple phones
- Watch the FPS counter for drops below 50fps

---

## 📊 Measuring Performance

### Check Component Render Times

```javascript
// In browser console or React Native debugger:
import { logPerformanceReport } from './utils/PerformanceProfiler';
logPerformanceReport();
```

### Check for Memory Leaks

```javascript
// In browser console:
import { logMemoryLeakReport } from './utils/MemoryLeakDetector';
logMemoryLeakReport();
```

### Check All Settings

```javascript
import { getDeveloperSettings } from './utils/DeveloperSettings';
getDeveloperSettings().then(console.log);
```

---

## 🎯 What to Do If FPS Drops Below 50

### 1. Identify the Problem
- Note which screen shows the drop
- Note what action triggers it (e.g., "connecting second phone")
- Call `logPerformanceReport()` to see slow components

### 2. Quick Fixes (in priority order)
- ✅ Wrap large FlatLists with `OptimizedFlatList`
- ✅ Add memoization to list items
- ✅ Debounce rapid state updates
- ✅ Profile the slow component specifically

### 3. If Still Slow
- Check for memory leaks with `logMemoryLeakReport()`
- Profile with Android Studio or Xcode profiler
- Ask for help with specific metrics

---

## 📦 Files Created

| File | Purpose | Where Used |
|------|---------|-----------|
| `utils/PerformanceMonitor.js` | FPS overlay widget | Add to App.js |
| `utils/PerformanceProfiler.js` | Component timing measurement | Wrap slow components |
| `utils/MemoryLeakDetector.js` | Leak detection hooks | Use in components |
| `utils/VirtualizedListManager.js` | Optimized list rendering | Replace FlatList |
| `utils/PerformanceUtils.js` | Unified exports | Import from here |
| `utils/DeveloperSettings.js` | Dev settings manager | Optional, for UI toggles |

---

## ✨ Best Practices

### ✅ DO
- [ ] Enable FPS monitor during development
- [ ] Profile after major code changes
- [ ] Use OptimizedFlatList for lists > 50 items
- [ ] Test on low-end Android phones
- [ ] Log reports before/after optimizations

### ❌ DON'T
- [ ] Ship with PerformanceMonitor visible (add `{__DEV__ &&}` condition)
- [ ] Ignore memory leak warnings
- [ ] Render 100+ items in a FlatList
- [ ] Optimize before measuring

---

## 🔧 Common Problems & Solutions

### "FPS Monitor not showing"
```javascript
// Make sure this is in App.js (not earlier in your imports)
{__DEV__ && <PerformanceMonitor />}
```

### "Memory leak warnings after disconnect"
```javascript
// Use tracked versions of timers/subscriptions:
import { useTrackedSetInterval } from './utils/MemoryLeakDetector';
useTrackedSetInterval(() => { ... }, 1000); // Auto-cleanup on unmount
```

### "Large list is slow"
```javascript
// Replace FlatList:
import { OptimizedFlatList } from './utils/VirtualizedListManager';
<OptimizedFlatList data={...} itemSize={60} ... />
```

---

## 🎓 Understanding the Reports

### Performance Report
```
HomeTab | 15 renders | avg: 4.2ms (min: 2.1ms, max: 8.5ms) ✅
```
- **4.2ms average** = Good (target ~6-8ms for smooth 60fps)
- **15 renders** = How many times component re-rendered during test
- **min/max** = Fastest and slowest render times

### Memory Leak Report
```
⚠️ Uncleared Intervals: 1
  - ID: 123 (5000ms, age: 45s)
```
- **Age: 45s** = Interval has been running for 45 seconds without cleanup
- **Action**: Find the component and add proper cleanup in useEffect

---

## 📱 Testing Checklist

### Single Phone Connection
- [ ] Open app → FPS stays ~60
- [ ] Navigate between screens → FPS stays ~60
- [ ] Enable dark mode → FPS stays ~60
- [ ] Connect to device → FPS stays ~60

### Multi-Phone Scenario
- [ ] Connect phone 1 → FPS ~60
- [ ] Connect phone 2 → FPS drops? Record it
- [ ] Connect phone 3 → FPS drops? Record it
- [ ] Run `logPerformanceReport()` and check slow components

### Disconnect/Reconnect
- [ ] Disconnect → No memory leaks
- [ ] Run `logMemoryLeakReport()` → "No leaks detected!"

---

## 🚀 Next Steps

1. **Now**: Add FPS monitor to App.js
2. **Today**: Profile 3 main screens (HomeTab, MembersTab, MessageTab)
3. **This Week**: Identify slow components and optimize
4. **Before Launch**: Run full test suite with monitor active

---

**Questions?** Check [PERFORMANCE_SETUP.md](PERFORMANCE_SETUP.md) for detailed documentation.
