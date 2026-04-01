import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, ScrollView, Platform, ImageBackground, Animated } from 'react-native';
import { styles } from '../styles/styles';
import { InputField, MainButton } from '../components/shared';
import { useTheme } from '../context/ThemeContext';
import { useLobby } from '../context/LobbyContext';
import { useUser } from '../context/UserContext';

const OnboardingName = ({ next }) => {
  const { colors } = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const { setFirstName: setCtxFirstName, setLastName: setCtxLastName } = useUser();
  const { setMyNickname } = useLobby();
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(-20)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(20)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;
  const buttonsScale = useRef(new Animated.Value(0.9)).current;
  
  useEffect(() => {
    Animated.stagger(150, [
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(formTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(buttonsOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(buttonsScale, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);
  
  const handleNext = async () => {
    const chosen = (nickname || `${firstName} ${lastName}`.trim() || firstName || '').trim();

    // Persist to UserContext (main-branch onboarding expectations)
    try {
      await setCtxFirstName(firstName);
      await setCtxLastName(lastName);
    } catch (e) {
      // Non-blocking
    }

    // Persist to LobbyContext for BLE/LoRa nickname sync
    if (chosen && setMyNickname) {
      try {
        await setMyNickname(chosen);
      } catch (e) {
        // Non-blocking; proceed even if storage fails
      }
    }
    next && next();
  };

  return (
    <ImageBackground
      source={require('../assets/int bg 1.png')}
      resizeMode="cover"
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={[styles.contentContainer, { justifyContent: 'center' }]}>
            <Text style={[styles.titleLarge, { color: colors.textDark, top: 0, marginTop: 0, marginBottom: 18 }]}>
              What do we{'\n'}call you?
            </Text>
          
            <View style={[styles.formSection, { marginTop: 16 }]}>
              <InputField label="First Name" placeholder="e.g. John" value={firstName} onChangeText={setFirstName} />
              <InputField label="Last Name" placeholder="e.g. Doe" value={lastName} onChangeText={setLastName} />
              <InputField label="Nickname" placeholder="e.g. JD" value={nickname} onChangeText={setNickname} />
            </View>

            <View style={[styles.footer, { marginTop: 20 }]}>
              <MainButton title="NEXT" onPress={handleNext} style={{ marginBottom: 8 }} />
              <TouchableOpacity style={styles.skipButton} onPress={handleNext}>
                <Text style={[styles.skipText, { color: colors.gray }]}>SKIP</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
};

export default OnboardingName;
