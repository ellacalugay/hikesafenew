import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../styles/styles';

export default function SuccessModal({ visible, lobbyData, onContinue }) {
  return (
    <Modal visible={!!visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.cardGreen}>
          <Text style={styles.cardTitleWhite}>Lobby Creation Successful</Text>
          <View style={styles.separatorWhite} />
          <Text style={styles.cardSubtitleWhite}>Your lobby has been successfully created.</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Lobby Name:</Text>
            <Text style={styles.infoValue}>{lobbyData?.lobbyName || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Group ID:</Text>
            <Text style={styles.infoValue}>{lobbyData?.groupId || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Max Member:</Text>
            <Text style={styles.infoValue}>{lobbyData?.maxMember || 'N/A'}</Text>
          </View>

          <TouchableOpacity style={styles.buttonWhite} onPress={onContinue}>
            <Text style={styles.buttonTextGreen}>GO TO DASHBOARD</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
