import React from 'react';
import { View, StatusBar, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../styles';

const ScreenContainer = ({ children }) => (
  <View style={styles.container}>
    <StatusBar barStyle="dark-content" />
    <LinearGradient
      colors={['#ecfccb', '#ffffff']}
      style={styles.backgroundGradient}
    />
    {/* Abstract Tree/Mountain Shapes */}
    <View style={styles.bgTreeLeft} />
    <View style={styles.bgTreeRight} />
    <View style={styles.bgMountain} />
    
    <SafeAreaView style={styles.safeArea}>
      {children}
    </SafeAreaView>
  </View>
);

export default ScreenContainer;
