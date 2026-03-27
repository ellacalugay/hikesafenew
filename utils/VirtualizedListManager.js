/**
 * VirtualizedListManager - Utilities for optimizing large lists
 * 
 * Provides two approaches:
 * 1. Use built-in FlatList with proper optimization settings
 * 2. Use external FlashList library for very large lists (100+ items)
 * 
 * For now, we'll provide FlatList optimization patterns.
 * If you need FlashList, run: npm install @shopify/flash-list
 */

import React, { memo } from 'react';
import { FlatList } from 'react-native';

/**
 * OptimizedFlatList - Drop-in replacement for FlatList with recommended performance settings
 * 
 * Usage:
 * import { OptimizedFlatList } from './utils/VirtualizedListManager';
 * 
 * <OptimizedFlatList
 *   data={items}
 *   renderItem={renderItem}
 *   keyExtractor={(item) => item.id}
 *   itemSize={60} // Height of each item in pixels
 * />
 */
export const OptimizedFlatList = React.memo(
  ({
    data,
    renderItem,
    keyExtractor,
    itemSize = 60,
    columnCount = 1,
    ...restProps
  }) => {
    const numColumns = columnCount;
    const itemsPerScreen = Math.ceil(400 / itemSize); // Assuming ~400px viewport height
    const initialNumToRender = itemsPerScreen + 10; // Render a bit extra to avoid flashing

    return (
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        // Performance optimizations
        removeClippedSubviews={true}
        initialNumToRender={initialNumToRender}
        maxToRenderPerBatch={itemsPerScreen}
        updateCellsBatchingPeriod={50}
        scrollEventThrottle={16} // ~60fps updates
        numColumns={numColumns}
        // Standard props
        {...restProps}
      />
    );
  }
);

OptimizedFlatList.displayName = 'OptimizedFlatList';

/**
 * Memoized list item component - prevents unnecessary re-renders
 * 
 * Usage:
 * const MyListItem = memo(({ item, colors }) => (
 *   <View>...</View>
 * ), (prevProps, nextProps) => {
 *   return JSON.stringify(prevProps.item) === JSON.stringify(nextProps.item);
 * });
 * 
 * Then use in OptimizedFlatList:
 * renderItem={({ item }) => <MyListItem item={item} colors={colors} />}
 */
export const createMemoizedListItem = (Component) => {
  return memo(Component, (prevProps, nextProps) => {
    // Return true if props are equal (skip re-render)
    // Return false if props changed (do re-render)
    const propsEqual =
      JSON.stringify(prevProps) === JSON.stringify(nextProps);
    return propsEqual;
  });
};

/**
 * Hook for optimizing list performance with data updates
 * Debounces rapid list updates to prevent excessive re-renders
 * 
 * Usage:
 * const debouncedData = useOptimizedListData(data, 300);
 * <FlatList data={debouncedData} ... />
 */
export const useOptimizedListData = (data, debounceMs = 300) => {
  const [displayData, setDisplayData] = React.useState(data);
  const timeoutRef = React.useRef(null);

  React.useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setDisplayData(data);
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, debounceMs]);

  return displayData;
};

/**
 * List rendering optimization configuration
 * Apply these settings to any FlatList for better performance
 */
export const OPTIMIZED_FLAT_LIST_CONFIG = {
  removeClippedSubviews: true, // Unmount off-screen items (memory optimization)
  initialNumToRender: 15, // Initial items to render
  maxToRenderPerBatch: 10, // Items to render per batch
  updateCellsBatchingPeriod: 50, // ms between render batches
  scrollEventThrottle: 16, // Throttle to ~60fps
  windowSize: 10, // Number of cells to keep cached around viewport
};

/**
 * Conversion guide for existing FlatList to Optimized version:
 * 
 * BEFORE:
 * <FlatList
 *   data={items}
 *   renderItem={renderItem}
 * />
 * 
 * AFTER (Option 1 - Use OptimizedFlatList):
 * <OptimizedFlatList
 *   data={items}
 *   renderItem={renderItem}
 *   itemSize={60}
 * />
 * 
 * AFTER (Option 2 - Manual optimization):
 * <FlatList
 *   data={items}
 *   renderItem={renderItem}
 *   {...OPTIMIZED_FLAT_LIST_CONFIG}
 * />
 */

/**
 * Instructions for adding FlashList (if you need it later):
 * 
 * 1. Install: npm install @shopify/flash-list
 * 2. Wrap app root with FlashListProvider (in App.js):
 *    import { FlashListProvider } from '@shopify/flash-list';
 *    <FlashListProvider>
 *      <NavigationContainer>...</NavigationContainer>
 *    </FlashListProvider>
 * 3. Replace FlatList with FlashList:
 *    import { FlashList } from '@shopify/flash-list';
 *    <FlashList
 *      data={items}
 *      renderItem={renderItem}
 *      estimatedItemSize={60}
 *    />
 */

export default {
  OptimizedFlatList,
  createMemoizedListItem,
  useOptimizedListData,
  OPTIMIZED_FLAT_LIST_CONFIG,
};
