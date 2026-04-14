import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Keyboard } from 'react-native';
import { Radio, Users, MessageCircle, Search, X } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MessageTab = ({ onOpenChat }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isConnected, memberLocations, getConversations, unreadCount } = useBluetoothDevice();
  const { getMemberNickname, lobbyMembers } = useLobby();
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const conversations = getConversations();
  
  // Get known devices from lobbyMembers (does not require GPS). Merge in online/offline from memberLocations when present.
  const knownDevices = (lobbyMembers || [])
    .filter(m => m && !m.isSelf && typeof m.deviceId === 'number' && !Number.isNaN(m.deviceId))
    .map(m => {
      const loc = (memberLocations || []).find(x => x && x.deviceId === m.deviceId) || null;
      const name = getMemberNickname(m.deviceId) || `Device ${m.deviceId}`;
      const online = loc
        ? (!loc.isOffline && (Date.now() - (loc.lastUpdate || 0) < 60000))
        : false;
      return { deviceId: m.deviceId, name, online };
    });
  
  // Filter conversations and devices based on search query
  const filteredConversations = conversations.filter(conv => 
    conv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (conv.lastMessage && conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  const filteredDevices = knownDevices.filter(d => 
    !conversations.find(c => c.deviceId === d.deviceId) &&
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };
  
  return (
    <View style={[styles.tabContainer, { backgroundColor: 'transparent' }]}>
      <View style={{ backgroundColor: colors.primaryLight, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, marginHorizontal: 16, marginTop: 16, marginBottom: 6, borderRadius: 12 }}>
        {isSearching ? (
          <TextInput
            style={{
              flex: 1,
              fontSize: 16,
              color: colors.textLight,
              backgroundColor: colors.glassOverlay,
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 10,
              minHeight: 38,
              marginRight: 8,
            }}
            placeholder="Search messages..."
            placeholderTextColor={colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 10}}>
            <Text style={[styles.headerTitle, { color: colors.textLight }]}>
              Messages</Text>
          </View>
        )}
        <TouchableOpacity 
          style={{ padding: 5 }}
          onPress={() => {
            if (isSearching) {
              setSearchQuery('');
              Keyboard.dismiss();
            }
            setIsSearching(!isSearching);
          }}
        >
          {isSearching ? (
            <X size={22} color={colors.textLight} />
          ) : (
            <Search size={22} color={colors.textLight} />
          )}
        </TouchableOpacity>
      </View>
      
      <ScrollView
        style={{ flex: 1, paddingHorizontal: 16, backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Group Chat - Broadcast - only show if not searching or matches */}
        {(!searchQuery || 'group chat broadcast'.includes(searchQuery.toLowerCase())) && (
          <TouchableOpacity 
            style={[styles.chatItem, { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary }]}
            onPress={() => onOpenChat({ type: 'broadcast', name: 'Group Chat', deviceId: 0 })}
          >
            <View style={[localStyles.groupIcon, { backgroundColor: colors.primary }]}>
              <Users size={18} color={colors.textLight} />
            </View>
            <View style={localStyles.chatInfo}>
              <Text style={[styles.chatName, { color: colors.textLight }]}>Group Chat (Broadcast)</Text>
              <Text style={[localStyles.chatPreview, { color: colors.textLight, opacity: 0.9 }]}>Send to all devices</Text>
            </View>
            <View style={localStyles.rightStatusRow}>
              {unreadCount > 0 && (
                <View style={[localStyles.unreadBadge, { backgroundColor: colors.primary }]}>
                  <Text style={localStyles.unreadText}>{unreadCount}</Text>
                </View>
              )}
              {isConnected && <View style={styles.onlineDot} />}
            </View>
          </TouchableOpacity>
        )}
        
        {/* Recent Conversations */}
        {filteredConversations.length > 0 && (
          <>
            <Text style={[localStyles.sectionTitle, { color: colors.textDark }]}>Recent Conversations</Text>
            {filteredConversations.map((conv) => (
              <TouchableOpacity 
                key={conv.deviceId}
                style={[styles.chatItem, { borderWidth: 1, borderColor: colors.glassBorder }]}
                onPress={() => onOpenChat({ type: 'direct', name: conv.name, deviceId: conv.deviceId })}
              >
                <BlurView
                  intensity={colors.glassIntensity}
                  tint={colors.glassTint}
                  style={StyleSheet.absoluteFillObject}
                />
                <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

                <View style={[localStyles.avatarCircle, { backgroundColor: colors.inputBg }]}>
                  <Radio size={16} color={colors.textDark} />
                </View>
                <View style={localStyles.chatInfo}>
                  <Text style={[styles.chatName, { color: colors.textDark }]}>{conv.name}</Text>
                  <Text style={[localStyles.chatPreview, { color: colors.gray }]} numberOfLines={1}>
                    {conv.lastMessage || 'No messages yet'}
                  </Text>
                </View>
                <View style={localStyles.chatMeta}>
                  <Text style={[localStyles.chatTime, { color: colors.gray }]}>{formatTime(conv.lastTimestamp)}</Text>
                  <View style={localStyles.rightStatusRow}>
                    {conv.unreadCount > 0 && (
                      <View style={[localStyles.unreadBadge, { backgroundColor: colors.primary }]}>
                        <Text style={localStyles.unreadText}>{conv.unreadCount}</Text>
                      </View>
                    )}
                    <View style={styles.onlineDot} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
        
        {/* Known Devices */}
        {filteredDevices.length > 0 && (
          <>
            <Text style={[localStyles.sectionTitle, { color: colors.textDark }]}>Nearby Devices</Text>
            {filteredDevices.map((device) => (
              <TouchableOpacity 
                key={device.deviceId}
                style={[styles.chatItem, { borderWidth: 1, borderColor: colors.glassBorder }]}
                onPress={() => onOpenChat({ type: 'direct', name: device.name, deviceId: device.deviceId })}
              >
                <BlurView
                  intensity={colors.glassIntensity}
                  tint={colors.glassTint}
                  style={StyleSheet.absoluteFillObject}
                />
                <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

                <View style={[localStyles.avatarCircle, { backgroundColor: colors.inputBg }]}>
                  <Radio size={16} color={colors.textDark} />
                </View>
                <View style={localStyles.chatInfo}>
                  <Text style={[styles.chatName, { color: colors.textDark }]}>{device.name}</Text>
                  <Text style={[localStyles.chatPreview, { color: colors.gray }]}>Tap to start conversation</Text>
                </View>
                {device.online && <View style={styles.onlineDot} />}
              </TouchableOpacity>
            ))}
          </>
        )}
        
        {/* Empty State */}
        {knownDevices.length === 0 && conversations.length === 0 && !searchQuery && (
          <View
            style={[
              localStyles.emptyState,
              {
                backgroundColor: 'transparent',
                borderColor: colors.glassBorder,
                overflow: 'hidden',
                position: 'relative',
              },
            ]}
          >
            <BlurView
              intensity={colors.glassIntensity}
              tint={colors.glassTint}
              style={StyleSheet.absoluteFillObject}
            />
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

            <MessageCircle size={40} color={colors.gray} />
            <Text style={[localStyles.emptyTitle, { color: colors.textDark }]}>No Contacts Yet</Text>
            <Text style={[localStyles.emptyText, { color: colors.gray }]}>
              {isConnected 
                ? 'Other devices will appear here when they broadcast their location via LoRa.'
                : 'Connect your device first to discover other hikers in range.'}
            </Text>
          </View>
        )}
        
        {/* No Search Results */}
        {searchQuery && filteredConversations.length === 0 && filteredDevices.length === 0 && (
          <View
            style={[
              localStyles.emptyState,
              {
                backgroundColor: 'transparent',
                borderColor: colors.glassBorder,
                overflow: 'hidden',
                position: 'relative',
              },
            ]}
          >
            <BlurView
              intensity={colors.glassIntensity}
              tint={colors.glassTint}
              style={StyleSheet.absoluteFillObject}
            />
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

            <Search size={40} color={colors.gray} />
            <Text style={[localStyles.emptyTitle, { color: colors.textDark }]}>No Results</Text>
            <Text style={[localStyles.emptyText, { color: colors.gray }]}>
              No conversations or devices match "{searchQuery}"
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const localStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  connectionText: {
    marginLeft: 10,
    flex: 1,
    fontSize: 13,
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatInfo: {
    flex: 1,
    marginLeft: 12,
  },
  chatPreview: {
    fontSize: 12,
    marginTop: 2,
  },
  chatMeta: {
    alignItems: 'flex-end',
  },
  chatTime: {
    fontSize: 11,
  },
  unreadBadge: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  rightStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});

export default MessageTab;
