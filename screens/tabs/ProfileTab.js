import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Modal, TextInput, Alert } from 'react-native';
import { User, Settings, HelpCircle, AlertOctagon, Star, LogOut } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useLobby } from '../../context/LobbyContext';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '../../context/UserContext';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MenuOption = ({ icon: Icon, label, onPress, colors }) => (
  <TouchableOpacity
    style={[
      styles.menuOption,
      {
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e0e0e0',
        paddingVertical: 20,
        paddingHorizontal: 20,
      },
    ]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center', zIndex: 1 }}>
      <Icon size={20} color={colors.textDark} />
      <Text style={[styles.menuLabel, { color: colors.textDark, marginLeft: 16, fontWeight: '600' }]}>
        {label}
      </Text>
    </View>
  </TouchableOpacity>
);

const ProfileTab = ({ onLogout, onEditProfile, onSettings, onHelp, onReportProblem, onRateApp }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { myNickname, clearRememberData, leaveLobby } = useLobby();
  const { firstName, lastName, memberId } = useUser();
  const [showRateModal, setShowRateModal] = useState(false);
  const [showRateAgainModal, setShowRateAgainModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [suggestion, setSuggestion] = useState('');
  const [hasRatedApp, setHasRatedApp] = useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  const initials = `${(firstName && firstName[0] ? firstName[0].toUpperCase() : (myNickname && myNickname[0] ? myNickname[0].toUpperCase() : ''))}${(lastName && lastName[0] ? lastName[0].toUpperCase() : '')}`;
  
  const handleLogout = async () => {
    try {
      await clearRememberData();
      await leaveLobby();
    } catch (e) {
      console.error('Logout cleanup failed', e);
    }
    if (onLogout) onLogout();
  };

  const handleRatePress = () => {
    if (hasRatedApp) {
      setShowRateAgainModal(true);
      return;
    }
    setShowRateModal(true);
  };

  const openRateAgain = () => {
    setShowRateAgainModal(false);
    setShowRateModal(true);
  };

  const handleSubmitRating = async () => {
    if (rating < 1) {
      Alert.alert('Rating required', 'Please select at least 1 star.');
      return;
    }

    try {
      setIsSubmittingRating(true);
      if (onRateApp) {
        await onRateApp({ rating, suggestion: suggestion.trim(), isRepeat: hasRatedApp });
      }
      setHasRatedApp(true);
      setShowRateModal(false);
      Alert.alert('Thank you!', 'Your rating and suggestion were submitted.');
    } catch (error) {
      console.error('Rating submission failed', error);
      Alert.alert('Something went wrong', 'Could not submit your rating. Please try again.');
    } finally {
      setIsSubmittingRating(false);
    }
  };
  
  return (
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      <View style={{ flex: 1, position: 'relative' }}>

        <View style={{ alignItems: 'center', paddingTop: Math.max(insets.top - 6, 0), paddingBottom: 10, zIndex: 20 }}>
          <Image
            source={require('../../assets/Assets.png')}
            style={{ width: 120, height: 25 }}
            resizeMode="contain"
          />
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
          showsVerticalScrollIndicator={false}
        >
        <LinearGradient
          colors={colors.greetBn}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{
            borderRadius: 16,
            padding: 30,
            paddingBottom: 15,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            marginHorizontal: 20,
            marginBottom: 20,
            overflow: 'hidden',
            marginTop: 1,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 27, color: colors.textDark, fontWeight: '600', marginTop: -10 }}>Hello!</Text>
            <Text style={{ fontSize: 28, color: colors.textDark, fontWeight: '700', lineHeight: 30 }}>
              {myNickname}
            </Text>
            <Text style={{ fontSize: 9.5, color: 'rgba(255, 255, 255, 0.84)', marginTop: 10 }}>
              <Text style={{ fontWeight: 'bold'}}>{'MEMBER ID: '}</Text> 
               {memberId }
            </Text>
          </View>

          <View style={{
            width: 108,
            height: 108,
            borderRadius: 60,
            borderWidth: 2.5,
            borderColor: 'rgba(255,255,255,0.5)',
            overflow: 'hidden',
            marginTop: -14,
            marginRight:-10,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <View style={{ flex: 1, backgroundColor: colors.primary || '#81c784', alignItems: 'center', justifyContent: 'center', width: '100%', }}>
              <Text
                style={{
                  color: 'rgba(255,255,255,0.95)',
                  fontSize: 40,
                  fontWeight: '700',
                  width: '100%',
                  textAlign: 'center',
                  lineHeight: 40,
                  includeFontPadding: false,
                  textAlignVertical: 'center',
                }}
              >
                {initials || 'HS'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, gap: 4 }}>
          <MenuOption icon={User} label="Edit Profile" onPress={onEditProfile} colors={colors} />
          <MenuOption icon={Settings} label="Settings" onPress={onSettings} colors={colors} />
          <MenuOption icon={HelpCircle} label="Help" onPress={onHelp} colors={colors} />
          <MenuOption icon={AlertOctagon} label="Report a Problem" onPress={onReportProblem} colors={colors} />
          <MenuOption icon={Star} label="Rate Our App" onPress={handleRatePress} colors={colors} />
          <MenuOption icon={LogOut} label="Logout" onPress={handleLogout} colors={colors} />
        </View>
        </ScrollView>

        <Modal visible={showRateAgainModal} transparent animationType="fade" onRequestClose={() => setShowRateAgainModal(false)}>
          <View style={[styles.modalOverlay, localStyles.centeredModalOverlay]}>
            <View style={localStyles.rateModalCard}>
              <Text style={localStyles.rateTitle}>Rate again?</Text>
              <Text style={localStyles.rateSubtitle}>You already rated the app. Would you like to submit a new rating?</Text>

              <View style={localStyles.rateButtonRow}>
                <TouchableOpacity style={localStyles.rateSecondaryButton} onPress={() => setShowRateAgainModal(false)}>
                  <Text style={localStyles.rateSecondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={localStyles.ratePrimaryButton} onPress={openRateAgain}>
                  <Text style={localStyles.ratePrimaryButtonText}>Rate Again</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={showRateModal} transparent animationType="fade" onRequestClose={() => setShowRateModal(false)}>
          <View style={[styles.modalOverlay, localStyles.centeredModalOverlay]}>
            <View style={localStyles.rateModalCard}>
              <Text style={localStyles.rateTitle}>Rate Our App</Text>
              <Text style={localStyles.rateSubtitle}>How was your HikeSafe experience?</Text>

              <View style={localStyles.rateStarsRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <TouchableOpacity key={value} onPress={() => setRating(value)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Star
                      size={30}
                      color={value <= rating ? '#f7b500' : '#c8ced6'}
                      fill={value <= rating ? '#f7b500' : 'transparent'}
                      strokeWidth={2}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                value={suggestion}
                onChangeText={setSuggestion}
                placeholder="Share a suggestion (optional)"
                placeholderTextColor="#8a94a6"
                multiline
                style={localStyles.rateSuggestionInput}
              />

              <View style={localStyles.rateButtonRow}>
                <TouchableOpacity
                  style={localStyles.rateSecondaryButton}
                  onPress={() => {
                    setShowRateModal(false);
                  }}
                >
                  <Text style={localStyles.rateSecondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[localStyles.ratePrimaryButton, isSubmittingRating && { opacity: 0.6 }]}
                  onPress={handleSubmitRating}
                  disabled={isSubmittingRating}
                >
                  <Text style={localStyles.ratePrimaryButtonText}>{isSubmittingRating ? 'Submitting...' : 'Submit'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
};

const localStyles = StyleSheet.create({
  centeredModalOverlay: {
    alignItems: 'center',
  },
  rateModalCard: {
    width: '88%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  rateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
  },
  rateSubtitle: {
    marginTop: 8,
    marginBottom: 14,
    fontSize: 14,
    lineHeight: 21,
    color: '#4a5568',
  },
  rateStarsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  rateSuggestionInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: '#d9e0e8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    color: '#1f2937',
    marginBottom: 16,
    backgroundColor: '#f8fafc',
  },
  rateButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  rateSecondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d4dbe3',
  },
  rateSecondaryButtonText: {
    color: '#4b5563',
    fontWeight: '600',
  },
  ratePrimaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#16a34a',
  },
  ratePrimaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});

export default ProfileTab;
