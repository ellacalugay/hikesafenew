import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/styles';

export default function TermsModal({ visible, onClose }) {
  return (
    <Modal visible={!!visible} transparent animationType="slide">
      <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient
          colors={['#46981D', '#3A8619', '#2F7315']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ width: '90%', height: '90%', borderRadius: 20, padding: 20, flexDirection: 'column' }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[styles.modalTitleWhite, { textAlign: 'center', marginBottom: 12 }]}
          >
            Terms and Conditions
          </Text>

          <ScrollView style={{ flex: 1, marginBottom: 12 }} showsVerticalScrollIndicator={false}>
            <View style={{ paddingRight: 8 }}>
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={styles.modalNumber}>1.</Text>
                  <Text style={styles.modalSectionTitle}>Acceptance of Terms</Text>
                </View>
                <Text style={[styles.modalParagraph, { textAlign: 'justify' }]}>
                  By using the HikeSafe app, you agree to comply with these Terms and Conditions. Please read them carefully before using the app.
                </Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={styles.modalNumber}>2.</Text>
                  <Text style={styles.modalSectionTitle}>Purpose of the App</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  HikeSafe is designed to help hikers stay safe by offering tools such as GPS tracking, emergency alerts, and route recording. It is intended as a supportive tool not a replacement for personal preparation, awareness, or professional guidance during outdoor activities.
                </Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
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

              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={styles.modalNumber}>4.</Text>
                  <Text style={styles.modalSectionTitle}>Safety Disclaimer</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  While HikeSafe aims to enhance hiking safety, we do not guarantee complete safety or uninterrupted service. You acknowledge that hiking involves risks, and you are responsible for your own safety and decisions while on the trail.
                </Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={styles.modalNumber}>5.</Text>
                  <Text style={styles.modalSectionTitle}>Privacy and Data Use</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We collect limited data (such as location, contact, and device information) to provide safety features and improve performance. Your data is used only for app functionality and emergency purposes, and will not be sold to third parties.
                </Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={styles.modalNumber}>6.</Text>
                  <Text style={styles.modalSectionTitle}>App Updates and Availability</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We may update or modify HikeSafe without prior notice. We do not guarantee that all features will always be available or free of errors.
                </Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={styles.modalNumber}>7.</Text>
                  <Text style={styles.modalSectionTitle}>Intellectual Property</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  All content, design, and code within HikeSafe are owned by the HikeSafe Team. You may not copy, modify, or redistribute any part of the app without written permission.
                </Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={styles.modalNumber}>8.</Text>
                  <Text style={styles.modalSectionTitle}>Limitation of Liability</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  HikeSafe and its developers will not be liable for any injury, loss or damage resulting from your use of the app. Use it at your own risk and always practice caution when hiking.
                </Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={styles.modalNumber}>9.</Text>
                  <Text style={styles.modalSectionTitle}>Termination of Use</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  We reserve the right to suspend or terminate access to HikeSafe for violations of these Terms or misuse of the app.
                </Text>
              </View>

              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                  <Text style={styles.modalNumber}>10.</Text>
                  <Text style={styles.modalSectionTitle}>Contact Us</Text>
                </View>
                <Text style={styles.modalParagraph}>
                  If you have questions about these Terms, please reach out at hikesafe.team@gmail.com
                </Text>
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={{ backgroundColor: 'white', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, alignItems: 'center' }}
            onPress={onClose}
          >
            <Text style={{ color: '#2E8B57', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
              I UNDERSTAND
            </Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </Modal>
  );
}
