import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, LayoutAnimation, Platform, UIManager } from 'react-native';
import { ArrowLeft, ChevronDown, ChevronUp, MessageCircle, Mail } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQItem = ({ question, answer, colors }) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };
  
  return (
    <TouchableOpacity 
      style={[
        styles.menuOption,
        {
          flexDirection: 'column',
          alignItems: 'stretch',
          borderWidth: 1,
          borderColor: colors.glassBorder,
          marginBottom: 12,
        },
      ]}
      onPress={toggleExpand}
      activeOpacity={0.7}
    >
      <BlurView
        intensity={colors.glassIntensity}
        tint={colors.glassTint}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.textDark, fontWeight: '600', flex: 1, paddingRight: 10, lineHeight: 20 }}>
          {question}
        </Text>
        {expanded ? (
          <ChevronUp size={20} color={colors.gray} />
        ) : (
          <ChevronDown size={20} color={colors.gray} />
        )}
      </View>
      {expanded && (
        <Text style={{ color: colors.gray, marginTop: 12, lineHeight: 22, fontSize: 14 }}>
          {answer}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const HelpScreen = ({ onBack }) => {
  const { colors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  
  const faqs = [
    {
      question: "How do I join a hiking lobby?",
      answer: "Enter your username and the Group ID provided by your hiking group leader. Then tap 'Enter Lobby' to join."
    },
    {
      question: "How does the compass work?",
      answer: "The Radar in the Location tab also works as a compass. Enable Location Services in Settings so the app can access the needed sensors/permissions."
    },
    {
      question: "How do I add an emergency contact?",
      answer: "Go to Profile > Edit Profile and fill in the Emergency Contact section with your contact's name and phone number."
    },
    {
      question: "What happens if I lose signal?",
      answer: "HikeSafe will continue to track your last known location. When signal is restored, your data will sync automatically."
    },
    {
      question: "How do I create a new lobby?",
      answer: "On the login screen, tap 'Create Here' and fill out the lobby name, Group ID, and maximum members."
    },
  ];

  return (
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
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
              paddingTop: insets.top + 10,
              paddingBottom: 15,
              height: insets.top + 60,
            },
          ]}
        >
          <TouchableOpacity
            onPress={onBack}
            style={{ position: 'absolute', left: 16, bottom: 12, padding: 4 }}
          >
            <ArrowLeft size={24} color={colors.textDark} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: colors.textDark, fontWeight: '700', fontSize: 20, bottom: -4 }]}>
            HELP
          </Text>

          <Image
            source={require('../../assets/hike_logo.png')}
            style={{
              position: 'absolute',
              right: 16,
              bottom: 6,
              width: 36,
              height: 36,
              resizeMode: 'contain',
            }}
          />
        </View>

      <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ padding: 20, paddingBottom: 50 }} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionHeader, { marginTop: 0, color: colors.textDark }]}>Frequently Asked Questions</Text>
        
        {faqs.map((faq, index) => (
          <FAQItem key={index} question={faq.question} answer={faq.answer} colors={colors} />
        ))}

        <Text style={[styles.sectionHeader, { color: colors.textDark, marginTop: 10 }]}>Contact Support</Text>
        
        <TouchableOpacity
          style={[
            styles.menuOption,
            {
              borderWidth: 1,
              borderColor: colors.glassBorder,
            },
          ]}
        >
          <BlurView
            intensity={colors.glassIntensity}
            tint={colors.glassTint}
            style={StyleSheet.absoluteFillObject}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

          <Mail size={20} color={colors.textDark} />
          <Text style={[styles.menuLabel, { color: colors.textDark }]}>hikesafe.team@gmail.com</Text>
        </TouchableOpacity>

        <View style={{ 
          backgroundColor: colors.primary, 
          borderRadius: 12, 
          padding: 20, 
          marginTop: 20,
          alignItems: 'center'
        }}>
          <MessageCircle size={32} color="white" />
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16, marginTop: 10 }}>
            Need more help?
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 5 }}>
            Our support team is here to assist you with any questions.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default HelpScreen;
