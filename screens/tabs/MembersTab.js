import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Alert } from 'react-native';
import { Users, MapPin, Radio, AlertTriangle, CheckCircle, WifiOff, Crown, Navigation, Edit2, X, Trash2, UserMinus } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';

// Calculate distance between two GPS coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // meters
};

const formatDistance = (meters) => {
  if (meters === null) return '--';
  if (meters < 1000) return `${meters.toFixed(0)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

const formatTimeSince = (timestamp) => {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const MemberCard = ({ member, myLocation, colors, isMe, nickname, onEditNickname, myNickname, onRemove, isUserHost }) => {
  const distance = myLocation.valid && member.lat && member.lng
    ? calculateDistance(myLocation.lat, myLocation.lng, member.lat, member.lng)
    : null;

  const getStatusColor = () => {
    if (member.isOffline) return '#9E9E9E';
    if (member.alertType === 'SOS' || member.alertType === 'MORSE') return colors.accent;
    return colors.primary;
  };

  const getStatusIcon = () => {
    if (member.isOffline) return <WifiOff size={16} color="#9E9E9E" />;
    if (member.alertType === 'SOS' || member.alertType === 'MORSE') return <AlertTriangle size={16} color={colors.accent} />;
    return <CheckCircle size={16} color={colors.primary} />;
  };

  const getStatusText = () => {
    if (member.isOffline) return 'Offline';
    if (member.alertType === 'SOS') return 'SOS ACTIVE';
    if (member.alertType === 'MORSE') return 'MORSE SOS';
    return 'Online';
  };

  // Show correct host/member label
  const getDisplayName = () => {
    if (isMe) {
      const roleSuffix = isUserHost ? 'Host' : 'Member';
      return myNickname ? `${myNickname} (You - ${roleSuffix})` : `You (${roleSuffix})`;
    }
    return nickname;
  };

  const displayName = getDisplayName();

  return (
    <View style={[localStyles.memberCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
      <View style={localStyles.memberHeader}>
        <View style={localStyles.memberInfo}>
          <View style={[localStyles.avatar, { backgroundColor: getStatusColor() }]}>
            {isMe && isUserHost ? (
              <Crown size={20} color="#fff" />
            ) : isMe ? (
              <Text style={localStyles.avatarText}>ME</Text>
            ) : (
              <Text style={localStyles.avatarText}>D{member.deviceId}</Text>
            )}
          </View>
          <View style={localStyles.memberDetails}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[localStyles.memberName, { color: colors.textDark }]}>
                {displayName}
              </Text>
              {!isMe && onEditNickname && (
                <TouchableOpacity 
                  onPress={() => onEditNickname(member.deviceId, nickname)}
                  style={{ marginLeft: 6, padding: 4 }}
                >
                  <Edit2 size={14} color={colors.gray} />
                </TouchableOpacity>
              )}
            </View>
            <View style={localStyles.statusRow}>
              {getStatusIcon()}
              <Text style={[localStyles.statusText, { color: getStatusColor() }]}>
                {getStatusText()}
              </Text>
            </View>
          </View>
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {distance !== null && (
            <View style={localStyles.distanceBadge}>
              <Navigation size={12} color={colors.primary} />
              <Text style={[localStyles.distanceText, { color: colors.primary }]}>
                {formatDistance(distance)}
              </Text>
            </View>
          )}
          {!isMe && onRemove && (
            <TouchableOpacity 
              onPress={() => onRemove(member.deviceId, nickname)}
              style={{ marginLeft: 8, padding: 6 }}
            >
              <UserMinus size={18} color="#F44336" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Location Info */}
      {(member.lat && member.lng) ? (
        <View style={[localStyles.locationRow, { borderTopColor: colors.borderColor }]}>
          <MapPin size={14} color={colors.gray} />
          <Text style={[localStyles.locationText, { color: colors.gray }]}>
            {member.lat.toFixed(5)}, {member.lng.toFixed(5)}
          </Text>
          <Text style={[localStyles.timeText, { color: colors.gray }]}>
            {formatTimeSince(member.lastUpdate)}
          </Text>
        </View>
      ) : (
        <View style={[localStyles.locationRow, { borderTopColor: colors.borderColor }]}>
          <MapPin size={14} color={colors.gray} />
          <Text style={[localStyles.locationText, { color: colors.gray }]}>
            No GPS data
          </Text>
        </View>
      )}

      {/* Alert Banner */}
      {(member.alertType === 'SOS' || member.alertType === 'MORSE') && (
        <View style={[localStyles.alertBanner, { backgroundColor: colors.accent + '20' }]}>
          <AlertTriangle size={14} color={colors.accent} />
          <Text style={[localStyles.alertText, { color: colors.accent }]}>
            Emergency alert active! Check on this member.
          </Text>
        </View>
      )}
    </View>
  );
};

const MembersTab = ({ onNavigateToLocation }) => {
  const { colors } = useTheme();
  const { myLocation, memberLocations, isConnected, removeMemberLocation } = useBluetoothDevice();
  const { lobbyCode, lobbyName, isHost, lobbyMembers, getMemberNickname, setMemberNickname, myNickname } = useLobby();
  
  // Nickname editing state
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [editingNickname, setEditingNickname] = useState('');

  const handleEditNickname = (deviceId, currentNickname) => {
    setEditingDeviceId(deviceId);
    setEditingNickname(currentNickname || '');
    setShowNicknameModal(true);
  };

  const handleSaveNickname = async () => {
    if (editingDeviceId !== null) {
      await setMemberNickname(editingDeviceId, editingNickname.trim() || `Device ${editingDeviceId}`);
    }
    setShowNicknameModal(false);
    setEditingDeviceId(null);
    setEditingNickname('');
  };

  const handleRemoveMember = (deviceId, nickname) => {
    Alert.alert(
      'Remove Member',
      `Remove ${nickname} from the lobby? They will no longer appear in your member list until they reconnect.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: () => removeMemberLocation(deviceId)
        }
      ]
    );
  };

  // Sort members: SOS first, then online, then offline
  const sortedMembers = useMemo(() => {
    return [...memberLocations].sort((a, b) => {
      // SOS/MORSE alerts first
      const aAlert = a.alertType === 'SOS' || a.alertType === 'MORSE' ? 1 : 0;
      const bAlert = b.alertType === 'SOS' || b.alertType === 'MORSE' ? 1 : 0;
      if (bAlert !== aAlert) return bAlert - aAlert;
      
      // Then online before offline
      if (a.isOffline !== b.isOffline) return a.isOffline ? 1 : -1;
      
      // Then by device ID
      return a.deviceId - b.deviceId;
    });
  }, [memberLocations]);

  const stats = useMemo(() => ({
    total: memberLocations.length + 1, // +1 for self
    online: memberLocations.filter(m => !m.isOffline).length + 1,
    offline: memberLocations.filter(m => m.isOffline).length,
    alerts: memberLocations.filter(m => m.alertType === 'SOS' || m.alertType === 'MORSE').length,
  }), [memberLocations]);

  if (!isHost) {
    // Non-hosts can see members but not manage them
    return (
      <View style={[localStyles.container, { backgroundColor: colors.background }]}>
        {/* Header for Members */}
        <View style={[localStyles.header, { backgroundColor: colors.primary }]}>
          <View style={localStyles.headerTop}>
            <View>
              <Text style={localStyles.headerTitle}>Group Members</Text>
              <Text style={localStyles.headerSubtitle}>
                {lobbyName || 'My Lobby'} • Code: {lobbyCode}
              </Text>
            </View>
            <View style={[localStyles.hostBadge, { backgroundColor: colors.cardBg }]}>
              <Text style={[localStyles.hostBadgeText, { color: colors.gray }]}>MEMBER</Text>
            </View>
          </View>
          
          {/* Stats Row */}
          <View style={localStyles.statsRow}>
            <View style={localStyles.stat}>
              <Text style={localStyles.statValue}>{stats.total}</Text>
              <Text style={localStyles.statLabel}>Total</Text>
            </View>
            <View style={localStyles.stat}>
              <Text style={[localStyles.statValue, { color: '#4CAF50' }]}>{stats.online}</Text>
              <Text style={localStyles.statLabel}>Online</Text>
            </View>
            <View style={localStyles.stat}>
              <Text style={[localStyles.statValue, { color: '#9E9E9E' }]}>{stats.offline}</Text>
              <Text style={localStyles.statLabel}>Offline</Text>
            </View>
            <View style={localStyles.stat}>
              <Text style={[localStyles.statValue, { color: '#F44336' }]}>{stats.alerts}</Text>
              <Text style={localStyles.statLabel}>Alerts</Text>
            </View>
          </View>
        </View>

        <ScrollView 
          contentContainerStyle={localStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Self Card */}
          <MemberCard 
            member={{
              deviceId: 'You',
              lat: myLocation.lat,
              lng: myLocation.lng,
              isOffline: false,
              lastUpdate: Date.now(),
            }}
            myLocation={myLocation}
            colors={colors}
            isMe={true}
            myNickname={myNickname}
            isUserHost={false}
          />

          {/* Other Members (read-only for non-hosts) */}
          {sortedMembers.length > 0 ? (
            sortedMembers.map((member) => (
              <MemberCard 
                key={member.deviceId}
                member={member}
                myLocation={myLocation}
                colors={colors}
                isMe={false}
                nickname={getMemberNickname(member.deviceId)}
                // No onEditNickname or onRemove for non-hosts
              />
            ))
          ) : (
            <View style={localStyles.emptyState}>
              <Radio size={40} color={colors.gray} />
              <Text style={[localStyles.emptyTitle, { color: colors.textDark }]}>
                No other members yet
              </Text>
              <Text style={[localStyles.emptyText, { color: colors.gray }]}>
                Waiting for others to join with code: {lobbyCode}
              </Text>
            </View>
          )}

          {/* Connection Warning */}
          {!isConnected && (
            <View style={[localStyles.warningBanner, { backgroundColor: '#FFF3E0' }]}>
              <WifiOff size={18} color="#F57C00" />
              <Text style={localStyles.warningText}>
                Device not connected. Connect to your HikeSafe device to see real-time member data.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[localStyles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[localStyles.header, { backgroundColor: colors.primary }]}>
        <View style={localStyles.headerTop}>
          <View>
            <Text style={localStyles.headerTitle}>Manage Members</Text>
            <Text style={localStyles.headerSubtitle}>
              {lobbyName || 'Your Lobby'} • Code: {lobbyCode}
            </Text>
          </View>
          <View style={localStyles.hostBadge}>
            <Crown size={14} color={colors.primary} />
            <Text style={[localStyles.hostBadgeText, { color: colors.primary }]}>HOST</Text>
          </View>
        </View>
        
        {/* Stats Row */}
        <View style={localStyles.statsRow}>
          <View style={localStyles.stat}>
            <Text style={localStyles.statValue}>{stats.total}</Text>
            <Text style={localStyles.statLabel}>Total</Text>
          </View>
          <View style={localStyles.stat}>
            <Text style={[localStyles.statValue, { color: '#4CAF50' }]}>{stats.online}</Text>
            <Text style={localStyles.statLabel}>Online</Text>
          </View>
          <View style={localStyles.stat}>
            <Text style={[localStyles.statValue, { color: '#9E9E9E' }]}>{stats.offline}</Text>
            <Text style={localStyles.statLabel}>Offline</Text>
          </View>
          <View style={localStyles.stat}>
            <Text style={[localStyles.statValue, { color: '#F44336' }]}>{stats.alerts}</Text>
            <Text style={localStyles.statLabel}>Alerts</Text>
          </View>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={localStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Self (Host) Card */}
        <MemberCard 
          member={{
            deviceId: 'You',
            lat: myLocation.lat,
            lng: myLocation.lng,
            isOffline: false,
            lastUpdate: Date.now(),
          }}
          myLocation={myLocation}
          colors={colors}
          isMe={true}
          myNickname={myNickname}
          isUserHost={true}
        />

        {/* Other Members */}
        {sortedMembers.length > 0 ? (
          sortedMembers.map((member) => (
            <MemberCard 
              key={member.deviceId}
              member={member}
              myLocation={myLocation}
              colors={colors}
              isMe={false}
              nickname={getMemberNickname(member.deviceId)}
              onEditNickname={handleEditNickname}
              onRemove={handleRemoveMember}
            />
          ))
        ) : (
          <View style={localStyles.emptyState}>
            <Radio size={40} color={colors.gray} />
            <Text style={[localStyles.emptyTitle, { color: colors.textDark }]}>
              No other members yet
            </Text>
            <Text style={[localStyles.emptyText, { color: colors.gray }]}>
              Share your lobby code ({lobbyCode}) with others to invite them.
            </Text>
          </View>
        )}

        {/* Connection Warning */}
        {!isConnected && (
          <View style={[localStyles.warningBanner, { backgroundColor: '#FFF3E0' }]}>
            <WifiOff size={18} color="#F57C00" />
            <Text style={localStyles.warningText}>
              Device not connected. Connect to your HikeSafe device to see real-time member data.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Nickname Edit Modal */}
      <Modal
        visible={showNicknameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNicknameModal(false)}
      >
        <View style={localStyles.modalOverlay}>
          <View style={[localStyles.modalContent, { backgroundColor: colors.modalBg }]}>
            <View style={localStyles.modalHeader}>
              <Text style={[localStyles.modalTitle, { color: colors.textDark }]}>Edit Nickname</Text>
              <TouchableOpacity onPress={() => setShowNicknameModal(false)}>
                <X size={24} color={colors.gray} />
              </TouchableOpacity>
            </View>
            
            <Text style={[localStyles.modalLabel, { color: colors.gray }]}>
              Set a nickname for Device {editingDeviceId}
            </Text>
            
            <TextInput
              style={[localStyles.modalInput, { 
                backgroundColor: colors.inputBg, 
                color: colors.textDark,
                borderColor: colors.borderColor 
              }]}
              placeholder="Enter nickname (e.g., John, Sarah)"
              placeholderTextColor={colors.gray}
              value={editingNickname}
              onChangeText={setEditingNickname}
              maxLength={20}
              autoFocus
            />
            
            <View style={localStyles.modalButtons}>
              <TouchableOpacity 
                style={[localStyles.modalButton, { backgroundColor: colors.inputBg }]}
                onPress={() => setShowNicknameModal(false)}
              >
                <Text style={{ color: colors.textDark, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[localStyles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveNickname}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 15,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 2,
  },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  hostBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 12,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 2,
  },
  scrollContent: {
    padding: 15,
    paddingBottom: 100,
  },
  memberCard: {
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  memberDetails: {
    marginLeft: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  statusText: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(27, 67, 50, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  locationText: {
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  timeText: {
    fontSize: 11,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    paddingHorizontal: 15,
  },
  alertText: {
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 15,
  },
  emptyText: {
    fontSize: 13,
    marginTop: 5,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
  },
  warningText: {
    flex: 1,
    marginLeft: 10,
    color: '#F57C00',
    fontSize: 13,
  },
  notHostContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  notHostTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
  },
  notHostText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalLabel: {
    fontSize: 14,
    marginBottom: 10,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
});

export default MembersTab;
