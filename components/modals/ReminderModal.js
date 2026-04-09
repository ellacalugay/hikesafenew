import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../styles/styles';

export default function ReminderModal({ visible, onAccept, onShowTerms }) {
  return (
    <Modal visible={!!visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContentGreen}>
          <Text style={styles.modalTitleWhite}>HikeSafe Reminder</Text>
          <Text style={styles.modalTextWhite}>
            Before continuing, please read and agree to our{' '}
            <Text onPress={onShowTerms} style={{ fontWeight: '700' }}>
              Terms and Conditions
            </Text>
            .{'\n'}{'\n'}
            By tapping "Accept and Continue", you agree that:{'\n'}
            • You'll use HikeSafe responsibly.{"\n"}
            • HikeSafe is a tool to assist safety but does not replace personal responsibility.{"\n"}
          </Text>

          <TouchableOpacity
            style={[styles.buttonWhite, { alignSelf: 'center', width: '80%' }]}
            onPress={onAccept}
          >
            <Text style={[styles.buttonTextGreen, { textAlign: 'center' }]}>
              ACCEPT AND CONTINUE
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
