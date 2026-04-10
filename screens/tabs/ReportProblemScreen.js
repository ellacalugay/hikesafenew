import React, { useState, useEffect, useRef  } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, StyleSheet, Image, Linking, AppState } from 'react-native';
import { ArrowLeft, AlertTriangle, Bug, MessageSquare, Zap } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { MainButton } from '../../components/shared';
import { useTheme } from '../../context/ThemeContext';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ProblemTypeOption = ({ icon: Icon, label, selected, onPress, colors }) => (
  <TouchableOpacity 
    style={[
      styles.menuOption, 
      { 
        borderWidth: 2, 
        borderColor: selected ? colors.primary : colors.glassBorder,
      }
    ]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <BlurView
      intensity={colors.glassIntensity}
      tint={colors.glassTint}
      style={StyleSheet.absoluteFillObject}
    />
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: selected ? `${colors.primary}20` : colors.glassOverlay },
      ]}
    />

    <Icon size={20} color={selected ? colors.primary : colors.textDark} />
    <Text style={[styles.menuLabel, { color: selected ? colors.primary : colors.textDark, fontWeight: selected ? '700' : '600' }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const ReportProblemScreen = ({ onBack }) => {
  const { colors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [problemType, setProblemType] = useState('');
  const [description, setDescription] = useState('');
  const appState = useRef(AppState.currentState);
  const didOpenMail = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      // User returned to the app from background
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        didOpenMail.current
      ) {
        didOpenMail.current = false; // reset flag
        Alert.alert(
          'Report Submitted',
          'Thank you for your feedback! Our team will review your report shortly.',
          [{ text: 'OK', onPress: onBack }]
        );
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [onBack]);

  const problemTypes = [
    { id: 'bug', icon: Bug, label: 'Bug / Error' },
    { id: 'feature', icon: Zap, label: 'Feature Request' },
    { id: 'feedback', icon: MessageSquare, label: 'General Feedback' },
    { id: 'safety', icon: AlertTriangle, label: 'Safety Concern' },
  ];

  const handleSubmit = async () => {
    if (!problemType) {
      Alert.alert('Select Problem Type', 'Please select the type of problem you want to report.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Description Required', 'Please describe the problem you encountered.');
      return;
    }
    
    const selectedType = problemTypes.find((type) => type.id === problemType);
    const subject = encodeURIComponent(`[HikeSafe Report] ${selectedType?.label}`);
    const body = encodeURIComponent(description);
    const email = 'hikesafe.team@gmail.com';

    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
    if (canOpen) {
      didOpenMail.current = true; // add this
      await Linking.openURL(mailtoUrl);
    } else {
      Alert.alert('Error', 'No email app found on this device.');
    }
    } catch (e) {
      console.error('Failed to open mail client:', e);
      Alert.alert('Error', 'Unable to open email client.');
    }
  };

  return (
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      <KeyboardAvoidingView
        style={[styles.tabContainer, { backgroundColor: 'transparent' }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[
            styles.headerBar,
            {
              backgroundColor: colors.headerBg,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
              elevation: 5,
              zIndex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 15,
              paddingBottom: 10,
              height: 55,
            },
          ]}
        >
          <TouchableOpacity onPress={onBack} style={{ position: 'absolute', left: 16, bottom: 10, padding: 4 }}>
            <ArrowLeft size={24} color={colors.textDark} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: colors.textDark, fontWeight: '700', fontSize: 20, bottom: 0, lineHeight: 24 }]}>
            REPORT A PROBLEM
          </Text>

          <Image
            source={require('../../assets/hike_logo.png')}
            style={{ position: 'absolute', right: 16, bottom: 10, width: 34, height: 34, resizeMode: 'contain' }}
          />
        </View>

        <ScrollView
          style={{ flex: 1, padding: 20 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 20, 50) }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionHeader, { marginTop: 0, color: colors.textDark }]}>What type of problem?</Text>

          {problemTypes.map((type) => (
            <ProblemTypeOption
              key={type.id}
              icon={type.icon}
              label={type.label}
              selected={problemType === type.id}
              onPress={() => setProblemType(type.id)}
              colors={{ ...colors, isDark: isDarkMode }}
            />
          ))}

          <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Describe the problem</Text>

          <View
            style={{
              borderWidth: 1,
              borderColor: colors.glassBorder,
              borderRadius: 16,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <BlurView
              intensity={colors.glassIntensity}
              tint={colors.glassTint}
              style={StyleSheet.absoluteFillObject}
            />
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

            <TextInput
              style={{
                backgroundColor: 'transparent',
                borderWidth: 0,
                borderColor: 'transparent',
                borderRadius: 16,
                padding: 15,
                fontSize: 15,
                color: colors.textDark,
                minHeight: 150,
                textAlignVertical: 'top',
              }}
              placeholder="Please provide details about the problem you encountered..."
              placeholderTextColor={colors.gray}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={6}
            />
          </View>

          <Text style={{ color: colors.textDark, fontSize: 12, marginTop: 10, fontWeight: '575' }}>
            Your feedback helps us improve HikeSafe for everyone.
          </Text>

          <MainButton
            title="SUBMIT REPORT"
            onPress={handleSubmit}
            style={{ marginTop: 20 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default ReportProblemScreen;
