import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { ScreenContainer } from './components/shared';
import { styles } from './styles/styles';
import { ThemeProvider } from './context/ThemeContext';
import OnboardingName from './screens/OnboardingName';
import OnboardingDetails from './screens/OnboardingDetails';
import LobbyScreen from './screens/LobbyScreen';
import Dashboard from './screens/Dashboard';

function AppContent() {
  const [screen, setScreen] = useState('onboarding1');
  const [showReminder, setShowReminder] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lobbyData, setLobbyData] = useState({ lobbyName: '', groupId: '', maxMember: '' });

  const handleNextOnboarding = () => setScreen('onboarding2');
  
  const handleShowReminder = () => setShowReminder(true);
  
  const handleAcceptTerms = () => {
    setShowReminder(false);
    setScreen('lobby');
  };

  const handleCreateLobbySuccess = (data) => {
    setLobbyData(data);
    setShowSuccess(true);
  };
  
  const handleEnterDashboard = () => {
    setShowSuccess(false);
    setScreen('dashboard');
  };

  const handleLogout = () => setScreen('onboarding1');

  return (
    <ScreenContainer>
      {screen === 'onboarding1' && <OnboardingName next={handleNextOnboarding} />}
      {screen === 'onboarding2' && <OnboardingDetails next={handleShowReminder} onShowReminder={handleShowReminder} />}
      {screen === 'lobby' && <LobbyScreen onLogin={handleEnterDashboard} onShowCreateSuccess={handleCreateLobbySuccess} />}
      {screen === 'dashboard' && <Dashboard onLogout={handleLogout} />}

      {/* HikeSafe Reminder Modal */}
      <Modal visible={showReminder} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentGreen}>
                <Text style={styles.modalTitleWhite}>HikeSafe Reminder</Text>
                <Text style={styles.modalTextWhite}>
                  Before continuing, please read and agree to our {' '}
                  <Text
                    onPress={() => setShowTerms(true)}
                    style={{ textDecorationLine: 'underline', fontWeight: '700' }}
                  >
                    Terms and Conditions
                  </Text>
                  .{"\n"}{"\n"}
                  By tapping "Accept and Continue", you agree that:{'\n'}
                  • You'll use HikeSafe responsibly.{'\n'}
                  • HikeSafe is a tool to assist safety but does not replace personal responsibility.{'\n'}
                </Text>

                <TouchableOpacity style={[styles.buttonWhite, { alignSelf: 'center', width: '80%'}]} onPress={handleAcceptTerms}>
                  <Text style={[styles.buttonTextGreen, {textAlign: 'center'}]}>ACCEPT AND CONTINUE</Text>
                </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Terms Modal */}
      <Modal visible={showTerms} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentGreen}>
            <Text style={[styles.modalTitleWhite, {textAlign: 'center'}]}>Terms and Condition</Text>
            <ScrollView style={{maxHeight: 360, marginVertical: 10}}>
              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>1.</Text>
                  <Text style={styles.modalSectionTitle}>Acceptance of Terms</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  By using the HikeSafe app, you agree to comply with these Terms and Conditions. Please read them carefully before using the app.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>2.</Text>
                  <Text style={styles.modalSectionTitle}>Purpose of the App</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  HikeSafe is designed to help hikers stay safe by offering tools such as GPS tracking, emergency alerts, and route recording. It is intended as a supportive tool not a replacement for personal preparation, awareness, or professional guidance during outdoor activities.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>3.</Text>
                  <Text style={styles.modalSectionTitle}>User Responsibilities</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  • Use HikeSafe responsibly and only for lawful purposes
                  {'\n'}• Ensure your device has enough battery, storage, and connectivity
                  {'\n'}• Provide accurate personal and emergency contact details
                  {'\n'}• Do not misuse the app (e.g., sending false emergency alerts or sharing misleading data)
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>4.</Text>
                  <Text style={styles.modalSectionTitle}>Safety Disclaimer</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  While HikeSafe aims to enhance hiking safety, we do not guarantee complete safety or uninterrupted service. You acknowledge that hiking involves risks, and you are responsible for your own safety and decisions while on the trail.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>5.</Text>
                  <Text style={styles.modalSectionTitle}>Privacy and Data Use</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We collect limited data (such as location, contact, and device information) to provide safety features and improve performance. Your data is used only for app functionality and emergency purposes, and will not be sold to third parties.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>6.</Text>
                  <Text style={styles.modalSectionTitle}>App Updates and Availability</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We may update or modify HikeSafe without prior notice. We do not guarantee that all features will always be available or free of errors.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>7.</Text>
                  <Text style={styles.modalSectionTitle}>Intellectual Property</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  All content, design, and code within HikeSafe are owned by the HikeSafe Team. You may not copy, modify, or redistribute any part of the app without written permission.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>8.</Text>
                  <Text style={styles.modalSectionTitle}>Limitation of Liability</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  HikeSafe and its developers will not be liable for any injury, loss or damage resulting from your use of the app. Use it at your own risk and always practice caution when hiking.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>9.</Text>
                  <Text style={styles.modalSectionTitle}>Termination of Use</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We reserve the right to suspend or terminate access to HikeSafe for violations of these Terms or misuse of the app.
                </Text>
              </View>

              <View style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6}}>
                  <Text style={styles.modalNumber}>10.</Text>
                  <Text style={styles.modalSectionTitle}>Contact Us</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  If you have questions about these Terms, please reach out at hikesafe.team@gmail.com
                </Text>
              </View>
            </ScrollView>
            <TouchableOpacity style={[styles.buttonWhite, { alignSelf: 'center', width: '80%'}]} onPress={() => setShowTerms(false)}>
              <Text style={[styles.buttonTextGreen, {textAlign: 'center'}]}>I UNDERSTAND</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Lobby Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.modalOverlay}>
           <View style={styles.cardGreen}>
             <Text style={styles.cardTitleWhite}>Lobby Creation Successful</Text>
             <View style={styles.separatorWhite} />
             <Text style={styles.cardSubtitleWhite}>Your lobby has been successfully created.</Text>
             
             <View style={styles.infoRow}>
               <Text style={styles.infoLabel}>Lobby Name:</Text>
               <Text style={styles.infoValue}>{lobbyData.lobbyName || 'N/A'}</Text>
             </View>
             <View style={styles.infoRow}>
               <Text style={styles.infoLabel}>Group ID:</Text>
               <Text style={styles.infoValue}>{lobbyData.groupId || 'N/A'}</Text>
             </View>
             <View style={styles.infoRow}>
               <Text style={styles.infoLabel}>Max Member:</Text>
               <Text style={styles.infoValue}>{lobbyData.maxMember || 'N/A'}</Text>
             </View>
             
             <TouchableOpacity style={styles.buttonWhite} onPress={handleEnterDashboard}>
               <Text style={styles.buttonTextGreen}>GO TO DASHBOARD</Text>
             </TouchableOpacity>
           </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
