import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Keyboard, KeyboardAvoidingView, ScrollView, Platform, ImageBackground, Animated } from 'react-native';
import { User } from 'lucide-react-native';
import { styles } from '../styles/styles';
import { InputField, MainButton } from '../components/shared';
import { useTheme } from '../context/ThemeContext';
import { useLobby } from '../context/LobbyContext';
import { useUser } from '../context/UserContext';

const OnboardingName = ({ next, disableMountAnimation = false }) => {
  const { colors } = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const { setFirstName: setCtxFirstName, setLastName: setCtxLastName } = useUser();
  const { setMyNickname } = useLobby();
  const titleOpacity = useRef(new Animated.Value(disableMountAnimation ? 1 : 0)).current;
  const titleTranslateY = useRef(new Animated.Value(disableMountAnimation ? 0 : -20)).current;
  const formOpacity = useRef(new Animated.Value(disableMountAnimation ? 1 : 0)).current;
  const formTranslateY = useRef(new Animated.Value(disableMountAnimation ? 0 : 20)).current;
  const buttonsOpacity = useRef(new Animated.Value(disableMountAnimation ? 1 : 0)).current;
  const buttonsScale = useRef(new Animated.Value(disableMountAnimation ? 1 : 0.9)).current;
  
  useEffect(() => {
    if (disableMountAnimation) return;

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
    Keyboard.dismiss();

    const chosen = (nickname || '').trim();
    if (!chosen) {
      setNicknameError('Nickname is required');
      return;
    }

    setNicknameError('');

    // Persist to UserContext (main-branch onboarding expectations)
    try {
      // Keep first/last name if provided, but ensure we persist something
      // so onboarding can be considered completed on next launch.
      await setCtxFirstName((firstName || chosen).trim());
      await setCtxLastName((lastName || '').trim());
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
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.onboardingPage}>
            <View style={styles.onboardingHeader}>
              <View style={{ width: 42 }} />
              <View style={styles.onboardingProgress}>
                <Text style={[styles.onboardingProgressText, { color: colors.gray, marginRight: 8 }]}>1 of 2</Text>
                <View style={styles.onboardingDots}>
                  <View style={[styles.onboardingDot, { backgroundColor: colors.primary, borderColor: colors.primary }]} />
                  <View style={[styles.onboardingDot, { backgroundColor: 'transparent', borderColor: colors.borderColor }]} />
                </View>
              </View>
            </View>

            <View style={styles.onboardingBody}>
              <View style={{ marginTop: 18 }}>
                <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleTranslateY }] }}>
                  <Text style={[styles.titleLarge, { color: colors.textDark, top: 0, marginTop: 42, marginBottom: 16, textAlign: 'center', fontSize: 44, lineHeight: 48 }]}>
                    What do we{"\n"}call you?
                  </Text>
                </Animated.View>

                <Animated.View style={{ opacity: formOpacity, transform: [{ translateY: formTranslateY }], marginTop: 10 }}>
                  <InputField
                    label="First Name"
                    placeholder="e.g. John"
                    value={firstName}
                    onChangeText={setFirstName}
                    icon={<User size={16} color={colors.gray} />}
                    containerStyle={styles.onboardingFieldGap}
                  />
                  <InputField
                    label="Last Name"
                    placeholder="e.g. Doe"
                    value={lastName}
                    onChangeText={setLastName}
                    icon={<User size={16} color={colors.gray} />}
                    containerStyle={styles.onboardingFieldGap}
                  />
                  <InputField
                    label="Nickname"
                    placeholder="e.g. JD"
                    value={nickname}
                    onChangeText={(t) => {
                      setNickname(t);
                      if (nicknameError) setNicknameError('');
                    }}
                    icon={<User size={16} color={colors.gray} />}
                    error={nicknameError}
                  />
                </Animated.View>
              </View>

              <Animated.View style={[styles.onboardingFooter, { opacity: buttonsOpacity, transform: [{ scale: buttonsScale }] }]}>
                <MainButton title="NEXT" onPress={handleNext} style={{ marginBottom: 8 }} />
                <TouchableOpacity style={styles.skipButton} onPress={handleNext}>
                  <Text style={[styles.skipText, { color: colors.gray }]}>SKIP</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
};

export default OnboardingName;
