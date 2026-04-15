import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Users, MapPin, Radio, AlertTriangle, CheckCircle, WifiOff, Navigation, Edit2, X, Trash2, UserMinus } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calculateDistance } from '../../utils/math';

const withAlpha = (color, alphaHex) => {
  if (typeof color !== 'string') return color;
  // Support #RRGGBB and #RRGGBBAA
  if (color.startsWith('#') && (color.length === 7 || color.length === 9)) {
    const base = color.slice(0, 7);
    return `${base}${alphaHex}`;
  }
  return color;
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

const MemberCard = ({ member, myLocation, colors, isMe, nickname, onEditNickname, myNickname, onRemove, myDeviceId, localMobileNicknames, remoteMobileNicknames }) => {
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
      return myNickname ? `${myNickname} (You)` : 'You';
    }
    return nickname;
  };

  const displayName = getDisplayName();

  return (
    <View style={[localStyles.memberCard, { backgroundColor: 'transparent', borderColor: colors.glassBorder }]}>
      <BlurView
        intensity={colors.glassIntensity}
        tint={colors.glassTint}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

      <View style={localStyles.memberHeader}>
        <View style={localStyles.memberInfo}>
          <View style={[localStyles.avatar, { backgroundColor: getStatusColor() }]}>
            {isMe ? (
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
      {(Number.isFinite(member.lat) && Number.isFinite(member.lng)) ? (
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

      {/* Mobile Devices (if any) */}
      {member.mobiles && member.mobiles.length > 0 && (
        <View style={[localStyles.mobilesSection, { borderTopColor: colors.borderColor }]}>
          <Text style={[localStyles.mobilesSectionTitle, { color: colors.gray }]}>
            📱 Phones ({member.mobiles.length})
          </Text>
          {member.mobiles.map((mobile) => {
            const canComputeDistance =
              myLocation?.valid === true &&
              Number.isFinite(myLocation?.lat) &&
              Number.isFinite(myLocation?.lng) &&
              Number.isFinite(mobile?.lat) &&
              Number.isFinite(mobile?.lng);

            const mobileDistance = canComputeDistance
              ? calculateDistance(myLocation.lat, myLocation.lng, mobile.lat, mobile.lng)
              : null;

            const mobileId = mobile?.mobileId;
            const isLocalHub = typeof member?.deviceId === 'number' && typeof myDeviceId === 'number' && member.deviceId === myDeviceId;
            const nick = (typeof mobileId === 'number' && mobileId >= 1 && mobileId <= 4)
              ? (isLocalHub
                ? (localMobileNicknames && localMobileNicknames[mobileId] ? String(localMobileNicknames[mobileId]) : '')
                : (remoteMobileNicknames && remoteMobileNicknames[`${member.deviceId}-m${mobileId}`] ? String(remoteMobileNicknames[`${member.deviceId}-m${mobileId}`]) : '')
              )
              : '';
            const label = (nick || '').trim() || 'Unnamed Phone';
            const avatarText = (nick && String(nick).trim().length > 0)
              ? String(nick).trim().charAt(0).toUpperCase()
              : '?';
            
            // RSSI signal strength interpretation
            const getRssiColor = (rssi) => {
              if (typeof rssi !== 'number' || Number.isNaN(rssi)) return colors.gray;
              if (rssi >= -50) return '#4CAF50'; // Excellent
              if (rssi >= -60) return '#8BC34A'; // Good
              if (rssi >= -70) return '#FFC107'; // Fair
              if (rssi >= -80) return '#FF9800'; // Weak
              return '#F44336'; // Very weak
            };
            
            const getRssiLabel = (rssi) => {
              if (typeof rssi !== 'number' || Number.isNaN(rssi)) return 'Unknown';
              if (rssi >= -50) return 'Excellent';
              if (rssi >= -60) return 'Good';
              if (rssi >= -70) return 'Fair';
              if (rssi >= -80) return 'Weak';
              return 'Very Weak';
            };

            const rssiText = (typeof mobile.rssi === 'number' && !Number.isNaN(mobile.rssi)) ? `${mobile.rssi}` : '--';
            const hasEstimatedDistance = typeof mobile.estimatedDistance === 'number' && !Number.isNaN(mobile.estimatedDistance) && mobile.estimatedDistance >= 0;

            return (
              <View key={mobile.mobileId} style={[localStyles.mobileCard, { backgroundColor: colors.background, borderColor: colors.borderColor }]}>
                <View style={localStyles.mobileHeader}>
                  <View style={[localStyles.mobileAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={localStyles.mobileAvatarText}>{avatarText}</Text>
                  </View>
                  <View style={localStyles.mobileInfo}>
                    <Text style={[localStyles.mobileName, { color: colors.textDark }]}>
                      {label}
                    </Text>
                    <View style={localStyles.rssiRow}>
                      <Radio size={12} color={getRssiColor(mobile.rssi)} />
                      <Text style={[localStyles.rssiLabel, { color: getRssiColor(mobile.rssi) }]}>
                        {getRssiLabel(mobile.rssi)} ({rssiText} dBm)
                      </Text>
                    </View>
                  </View>
                  {mobileDistance !== null && (
                    <View style={localStyles.mobileDistanceBadge}>
                      <Text style={[localStyles.mobileDistanceText, { color: colors.primary }]}>
                        {formatDistance(mobileDistance)}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={[localStyles.mobileLocationRow, { borderTopColor: colors.borderColor }]}>
                  <MapPin size={12} color={colors.gray} />
                  <Text style={[localStyles.mobileLocationText, { color: colors.gray }]}>
                    {(Number.isFinite(mobile.lat) && Number.isFinite(mobile.lng))
                      ? `${mobile.lat.toFixed(5)}, ${mobile.lng.toFixed(5)}`
                      : 'No GPS data'}
                  </Text>
                  {hasEstimatedDistance ? (
                    <Text style={[localStyles.mobileDistLabel, { color: colors.gray }]}>
                      ~{mobile.estimatedDistance}m away
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const MembersTab = ({ onNavigateToLocation }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { myLocation, phoneLocation, memberLocations, isConnected, removeMemberLocation, localMobileNicknames, remoteMobileNicknames } = useBluetoothDevice();
  const { lobbyCode, lobbyName, getMemberNickname, setMemberNickname, myNickname, lobbyMembers, myDeviceId } = useLobby();

  // Prefer phone GPS for distance calculations.
  const effectiveMyLocation = (phoneLocation && phoneLocation.valid)
    ? { lat: phoneLocation.lat, lng: phoneLocation.lng, valid: true }
    : myLocation;
  
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

  // Prefer LobbyContext member list (does not require GPS). Merge in location/alert/offline info from BluetoothContext.
  const mergedMembers = useMemo(() => {
    const byId = new Map();
    (memberLocations || []).forEach(m => {
      if (m && typeof m.deviceId === 'number') byId.set(m.deviceId, m);
    });

    // Derive remote phone membership from cross-hub nickname metadata.
    // Keys are "<deviceId>-m<mobileId>".
    const remoteMobilesByDevice = new Map();
    try {
      const entries = remoteMobileNicknames ? Object.entries(remoteMobileNicknames) : [];
      entries.forEach(([key, nickname]) => {
        const match = String(key).match(/^(\d+)-m(\d+)$/);
        if (!match) return;
        const deviceId = parseInt(match[1], 10);
        const mobileId = parseInt(match[2], 10);
        if (Number.isNaN(deviceId) || Number.isNaN(mobileId) || mobileId < 1 || mobileId > 4) return;

        const nick = String(nickname || '').trim();
        if (!nick) return;
        if (/^mobile\s*\d+$/i.test(nick)) return;

        const set = remoteMobilesByDevice.get(deviceId) || new Set();
        set.add(mobileId);
        remoteMobilesByDevice.set(deviceId, set);
      });
    } catch {
      // ignore
    }

    const ids = (lobbyMembers || [])
      .filter(m => m && !m.isSelf && typeof m.deviceId === 'number' && !Number.isNaN(m.deviceId))
      .map(m => m.deviceId);

    // Fallback: if lobbyMembers isn't populated yet, show whatever we have from memberLocations.
    const sourceIds = ids.length > 0 ? ids : Array.from(byId.keys());

    return sourceIds
      .map(deviceId => {
        // Never list our own hub as an "other member" card.
        if (typeof myDeviceId === 'number' && !Number.isNaN(myDeviceId) && deviceId === myDeviceId) {
          return null;
        }
        const base = byId.get(deviceId) || {
          deviceId,
          lat: null,
          lng: null,
          satellites: 0,
          lastUpdate: null,
          alertType: null,
          isOffline: false,
          mobiles: [],
        };

        // For remote hubs, attach a phone list from known nicknames so MembersTab can show
        // “Phones” even when we have no MOBILELOC telemetry for that hub.
        const remoteSet = remoteMobilesByDevice.get(deviceId);
        if (!remoteSet || remoteSet.size === 0) return base;

        const prevMobiles = Array.isArray(base.mobiles) ? base.mobiles : [];
        const existing = new Set(
          prevMobiles
            .map(m => (m ? parseInt(m.mobileId, 10) : NaN))
            .filter(n => !Number.isNaN(n) && n >= 1 && n <= 4)
        );

        const merged = [...prevMobiles];
        Array.from(remoteSet.values()).forEach((mid) => {
          if (existing.has(mid)) return;
          merged.push({
            mobileId: mid,
            lat: null,
            lng: null,
            rssi: null,
            estimatedDistance: null,
            lastUpdate: base.lastUpdate || null,
          });
        });

        merged.sort((a, b) => (a?.mobileId || 0) - (b?.mobileId || 0));
        return { ...base, mobiles: merged };
      })
      .filter(Boolean);
  }, [lobbyMembers, memberLocations, myDeviceId, remoteMobileNicknames]);

  const selfHubEntry = useMemo(() => {
    if (typeof myDeviceId !== 'number' || Number.isNaN(myDeviceId)) return null;
    const loc = (memberLocations || []).find(m => m && m.deviceId === myDeviceId) || null;
    return loc;
  }, [memberLocations, myDeviceId]);

  // Sort members: SOS first, then online, then offline
  const sortedMembers = useMemo(() => {
    return [...mergedMembers].sort((a, b) => {
      // SOS/MORSE alerts first
      const aAlert = a.alertType === 'SOS' || a.alertType === 'MORSE' ? 1 : 0;
      const bAlert = b.alertType === 'SOS' || b.alertType === 'MORSE' ? 1 : 0;
      if (bAlert !== aAlert) return bAlert - aAlert;
      
      // Then online before offline
      if (a.isOffline !== b.isOffline) return a.isOffline ? 1 : -1;
      
      // Then by device ID
      return a.deviceId - b.deviceId;
    });
  }, [mergedMembers]);

  const stats = useMemo(() => ({
    total: mergedMembers.length + 1, // +1 for self
    online: mergedMembers.filter(m => !m.isOffline).length + 1,
    offline: mergedMembers.filter(m => m.isOffline).length,
    alerts: mergedMembers.filter(m => m.alertType === 'SOS' || m.alertType === 'MORSE').length,
  }), [mergedMembers]);

  return (
    <View style={[localStyles.container, { backgroundColor: 'transparent' }]}>
      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {/* Header */}
      <View style={[localStyles.header, { backgroundColor: colors.primary }]}>
        <View style={localStyles.headerTop}>
          <View>
            <Text style={localStyles.headerTitle}>Group Members</Text>
            <Text style={localStyles.headerSubtitle}>
              {lobbyName || 'My Lobby'} • Code: {lobbyCode}
            </Text>
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
        contentContainerStyle={[localStyles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Self (Host) Card */}
        <MemberCard 
          member={{
            deviceId: (typeof myDeviceId === 'number' && !Number.isNaN(myDeviceId)) ? myDeviceId : 'You',
            lat: effectiveMyLocation.lat,
            lng: effectiveMyLocation.lng,
            isOffline: false,
            lastUpdate: Date.now(),
            mobiles: Array.isArray(selfHubEntry?.mobiles) ? selfHubEntry.mobiles : [],
          }}
          myLocation={effectiveMyLocation}
          colors={colors}
          isMe={true}
          myNickname={myNickname}
          myDeviceId={myDeviceId}
          localMobileNicknames={localMobileNicknames}
          remoteMobileNicknames={remoteMobileNicknames}
        />

        {/* Other Members */}
        {sortedMembers.length > 0 ? (
          sortedMembers.map((member) => (
            <MemberCard 
              key={member.deviceId}
              member={member}
              myLocation={effectiveMyLocation}
              colors={colors}
              isMe={false}
              nickname={getMemberNickname(member.deviceId)}
              onEditNickname={handleEditNickname}
              onRemove={handleRemoveMember}
              myDeviceId={myDeviceId}
              localMobileNicknames={localMobileNicknames}
              remoteMobileNicknames={remoteMobileNicknames}
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={localStyles.modalOverlay}
        >
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
              placeholderTextColor={withAlpha(colors.textDark, '99') || colors.gray}
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
        </KeyboardAvoidingView>
      </Modal>

      </View>
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
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  hostBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  reelectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  reelectText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
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
  },
  memberCard: {
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
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
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  candidateName: {
    fontSize: 15,
    fontWeight: '700',
  },
  candidateMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  // Mobile devices section styles
  mobilesSection: {
    borderTopWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  mobilesSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  mobileCard: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  mobileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mobileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileAvatarText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  mobileInfo: {
    marginLeft: 10,
    flex: 1,
  },
  mobileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  rssiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  rssiLabel: {
    fontSize: 11,
    marginLeft: 4,
    fontWeight: '500',
  },
  mobileDistanceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mobileDistanceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  mobileLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  mobileLocationText: {
    fontSize: 11,
    marginLeft: 6,
    flex: 1,
  },
  mobileDistLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
});

export default MembersTab;
