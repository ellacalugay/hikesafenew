import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ImageBackground } from 'react-native';
import { Image } from 'react-native';
import { ArrowLeft, ChevronDown, ChevronUp, MessageCircle, Mail, Phone } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';

const FAQItem = ({ question, answer, colors }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <TouchableOpacity 
      style={[styles.menuOption, { flexDirection: 'column', alignItems: 'stretch', backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}
      onPress={() => setExpanded(!expanded)}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.textDark, fontWeight: '600', flex: 1, paddingRight: 10 }}>
          {question}
        </Text>
        {expanded ? (
          <ChevronUp size={20} color={colors.gray} />
        ) : (
          <ChevronDown size={20} color={colors.gray} />
        )}
      </View>
      {expanded && (
        <Text style={{ color: colors.gray, marginTop: 10, lineHeight: 20 }}>
          {answer}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const HelpScreen = ({ onBack }) => {
  const { colors, isDarkMode } = useTheme();
  
  const faqs = [
    {
      question: "How do I join a hiking lobby?",
      answer: "Enter your username and the Group ID provided by your hiking group leader. Then tap 'Enter Lobby' to join."
    },
    {
      question: "How does the compass work?",
      answer: "Enable Location Services in the Compass tab. The compass will show your heading direction and current location coordinates."
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
    <ImageBackground 
      source={require('../../assets/dashboard_bg.png')} 
      style={[styles.tabContainer, { backgroundColor: colors.background }]}
      imageStyle={{ resizeMode: 'cover', width: '100%', height: '100%' }}
    > 
    {isDarkMode && (
      <View style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)', 
        zIndex: 0,
      }} />
    )}
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      <View style={[styles.headerBar, { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity 
          onPress={onBack} 
          style={{ position: 'absolute', left: 20, top: 15, padding: 5 }}
        >
          <ArrowLeft size={24} color={colors.textDark} style={{ marginTop: 13 }} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textDark, fontWeight: '700', fontSize: 22, marginLeft: -160, marginTop: -10, paddingBottom: 10 }]}>HELP</Text>
      </View>
  
        <Image 
          source={require('../../assets/hike_logo.png')} 
          style={{ 
            position: 'absolute', 
            right: 30, 
            top: 17,
            width: 50, 
            height: 50, 
            resizeMode: 'contain' 
          }} 
        />
      <ScrollView style={{ flex: 1, padding: 20 }}>
        <Text style={[styles.sectionHeader, { marginTop: 0, color: colors.textDark }]}>Frequently Asked Questions</Text>
        
        {faqs.map((faq, index) => (
          <FAQItem key={index} question={faq.question} answer={faq.answer} colors={colors} />
        ))}

        <Text style={[styles.sectionHeader, { color: colors.textDark }]}>Contact Support</Text>
        
        <TouchableOpacity style={[styles.menuOption, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
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
    </ImageBackground>
  );
};

export default HelpScreen;
