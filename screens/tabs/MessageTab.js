import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Keyboard } from 'react-native';
import { Radio, Users, MessageCircle, Search, X } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MessageTab = ({ onOpenChat, onOpenMorseLegend }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    isConnected,
    memberLocations,
    messages,
    getMessagesForDevice,
    getConversations,
    unreadCount,
    myMobileId,
    localMobileNicknames,
    remoteMobileNicknames,
    connectedDevicesCount,
  } = useBluetoothDevice();
  const { getMemberNickname, lobbyMembers, myDeviceId } = useLobby();
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchLower = (searchQuery || '').toLowerCase();

  const remoteMobilesByDevice = useMemo(() => {
    const byDevice = new Map();
    const entries = remoteMobileNicknames ? Object.entries(remoteMobileNicknames) : [];

    entries.forEach(([key, nickname]) => {
      if (!key) return;
      const match = String(key).match(/^(\d+)-m(\d+)$/);
      if (!match) return;
      const deviceId = parseInt(match[1], 10);
      const mobileId = parseInt(match[2], 10);
      if (Number.isNaN(deviceId) || Number.isNaN(mobileId) || mobileId < 1 || mobileId > 4) return;
      const nick = (nickname || '').toString().trim();
      if (!nick) return;

      const arr = byDevice.get(deviceId) || [];
      arr.push({ deviceId, mobileId, nickname: nick });
      byDevice.set(deviceId, arr);
    });

    // De-dupe + sort by mobileId for stable UI.
    byDevice.forEach((arr, deviceId) => {
      const dedup = new Map();
      arr.forEach((e) => dedup.set(e.mobileId, e));
      byDevice.set(deviceId, Array.from(dedup.values()).sort((a, b) => a.mobileId - b.mobileId));
    });

    // Also include mobiles we've actually *seen* (via MOBILELOC telemetry), even if no nickname exists.
    // This lets users DM phones without ever showing a hub-level row.
    (memberLocations || []).forEach((m) => {
      if (!m || typeof m.deviceId !== 'number' || Number.isNaN(m.deviceId)) return;
      const mobiles = Array.isArray(m.mobiles) ? m.mobiles : [];
      const ids = mobiles
        .map(x => (x ? parseInt(x.mobileId, 10) : NaN))
        .filter(id => !Number.isNaN(id) && id >= 1 && id <= 4);
      if (ids.length === 0) return;

      const existing = byDevice.get(m.deviceId) || [];
      const next = [...existing];
      ids.forEach((mobileId) => {
        if (next.some(e => e.mobileId === mobileId)) return;
        next.push({ deviceId: m.deviceId, mobileId, nickname: '' });
      });
      byDevice.set(m.deviceId, next.sort((a, b) => a.mobileId - b.mobileId));
    });

    return byDevice;
  }, [memberLocations, remoteMobileNicknames]);

  // Local phones (M1–M4) connected to this same hub.
  // Prefer what we've actually seen (via MOBILELOC mobiles list) and MNICK broadcasts.
  const localMobilesSeen = (() => {
    if (typeof myDeviceId !== 'number' || Number.isNaN(myDeviceId)) return [];
    const entry = (memberLocations || []).find(m => m && m.deviceId === myDeviceId) || null;
    const mobiles = Array.isArray(entry?.mobiles) ? entry.mobiles : [];
    const ids = mobiles
      .map(m => (m ? parseInt(m.mobileId, 10) : NaN))
      .filter(id => !Number.isNaN(id) && id >= 1 && id <= 4);
    return Array.from(new Set(ids)).sort((a, b) => a - b);
  })();

  const localMobileTargets = (() => {
    const selfId = (typeof myMobileId === 'number' && myMobileId >= 1 && myMobileId <= 4) ? myMobileId : null;
    if (!selfId) {
      // Until this phone claims its slot, we can't safely map “This Hub” entries.
      return [];
    }
    const nickKeys = localMobileNicknames ? Object.keys(localMobileNicknames) : [];
    const nickIds = nickKeys
      .map(k => parseInt(k, 10))
      .filter(id => !Number.isNaN(id) && id >= 1 && id <= 4);

    const known = Array.from(new Set([...(localMobilesSeen || []), ...(nickIds || [])]))
      .filter(id => id !== selfId)
      .sort((a, b) => a - b);

    // Only show local phone DM rows when we have a concrete signal that another phone exists.
    return known;
  })();

  const showLocalPhones =
    isConnected &&
    typeof myDeviceId === 'number' &&
    !Number.isNaN(myDeviceId) &&
    typeof myMobileId === 'number' &&
    myMobileId >= 1 &&
    myMobileId <= 4 &&
    localMobileTargets.length > 0;
  
  // Get known devices from lobbyMembers (does not require GPS). Merge in online/offline from memberLocations when present.
  const knownDevices = (lobbyMembers || [])
    .filter(m => m && !m.isSelf && typeof m.deviceId === 'number' && !Number.isNaN(m.deviceId))
    .map(m => {
      const loc = (memberLocations || []).find(x => x && x.deviceId === m.deviceId) || null;
      const rawBase = getMemberNickname(m.deviceId) || '';
      const base = String(rawBase || '').trim();
      const defaultLabel = `Hiker #${m.deviceId}`;
      const name = base && !/^device\s*#?\s*\d+$/i.test(base) ? base : defaultLabel;
      const online = loc
        ? (!loc.isOffline && (Date.now() - (loc.lastUpdate || 0) < 60000))
        : false;
      return { deviceId: m.deviceId, name, online };
    })
    // Never show our own device as a contact.
    .filter(d => !(typeof myDeviceId === 'number' && !Number.isNaN(myDeviceId) && d.deviceId === myDeviceId));
  
  // Keep devices visible even if we already have a DM thread with a different mobile on the same hub.
  const filteredDevices = knownDevices.filter(d =>
    d.name.toLowerCase().includes(searchLower) ||
    (remoteMobilesByDevice.get(d.deviceId) || []).some(e =>
      (e.nickname || '').toLowerCase().includes(searchLower) ||
      (`m${e.mobileId}`).includes(searchLower)
    )
  );

  const dmConversationMeta = useMemo(() => {
    try {
      const list = (typeof getConversations === 'function') ? (getConversations() || []) : [];
      const byKey = new Map();
      const byDevice = new Map();

      list.forEach((c) => {
        if (!c) return;
        const deviceId = c.deviceId;
        const mobileId = c.mobileId;
        if (typeof deviceId !== 'number' || Number.isNaN(deviceId)) return;
        if (typeof mobileId !== 'number' || Number.isNaN(mobileId)) return;
        const key = `${deviceId}-m${mobileId}`;
        byKey.set(key, c);

        const existing = byDevice.get(deviceId);
        if (!existing || (c.lastTimestamp || 0) >= (existing.lastTimestamp || 0)) {
          byDevice.set(deviceId, c);
        }
      });

      return { byKey, byDevice };
    } catch {
      return { byKey: new Map(), byDevice: new Map() };
    }
  }, [getConversations]);

  const getLastMessageMeta = useCallback((deviceId) => {
    if (typeof getMessagesForDevice !== 'function') return { lastText: '', lastTimestamp: 0, unreadCount: 0 };
    const list = getMessagesForDevice(deviceId) || [];
    let last = null;
    let unread = 0;
    for (const m of list) {
      if (!m) continue;
      if (!last || (m.timestamp || 0) > (last.timestamp || 0)) last = m;
      if (!m.isMine && !m.read) unread++;
    }
    return { lastText: (last && last.text) ? String(last.text) : '', lastTimestamp: (last && last.timestamp) ? last.timestamp : 0, unreadCount: unread };
  }, [getMessagesForDevice, messages]);

  const getLastDeviceChatMeta = useCallback((deviceId) => {
    if (typeof getMessagesForDevice !== 'function') return { lastText: '', lastTimestamp: 0, unreadCount: 0 };
    const list = getMessagesForDevice(deviceId) || [];
    let last = null;
    let unread = 0;
    for (const m of list) {
      if (!m) continue;
      const isDm = typeof m.dmToMobileId === 'number' || typeof m.dmFromMobileId === 'number';
      if (isDm) continue;
      if (!last || (m.timestamp || 0) > (last.timestamp || 0)) last = m;
      if (!m.isMine && !m.read) unread++;
    }
    return { lastText: (last && last.text) ? String(last.text) : '', lastTimestamp: (last && last.timestamp) ? last.timestamp : 0, unreadCount: unread };
  }, [getMessagesForDevice, messages]);
  
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
        {(!searchQuery || 'morse code legend sos'.includes(searchLower)) && (
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.chatItem, { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary }]}
            onPress={onOpenMorseLegend}
          >
            <View style={[localStyles.groupIcon, { backgroundColor: colors.primary }]}>
              <MessageCircle size={16} color={colors.textLight} />
            </View>

            <View style={localStyles.chatInfo}>
              <Text style={[styles.chatName, { color: colors.textLight }]}>Morse Code Tab</Text>
              <Text style={[localStyles.chatPreview, { color: colors.textLight, opacity: 0.9 }]} numberOfLines={1}>
                Tap to open full Morse legend page
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {(!searchQuery || 'group chat broadcast'.includes(searchQuery.toLowerCase())) && (
          (() => {
            const meta = getLastMessageMeta(0);
            const preview = meta.lastText ? meta.lastText : 'Send to all devices';
            const unread = meta.unreadCount || 0;
            return (
          <TouchableOpacity 
            style={[styles.chatItem, { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary }]}
            onPress={() => onOpenChat({ type: 'broadcast', name: 'Group Chat', deviceId: 0 })}
          >
            <View style={[localStyles.groupIcon, { backgroundColor: colors.primary }]}>
              <Users size={18} color={colors.textLight} />
            </View>
            <View style={localStyles.chatInfo}>
              <Text style={[styles.chatName, { color: colors.textLight }]}>Group Chat (Broadcast)</Text>
              <Text style={[localStyles.chatPreview, { color: colors.textLight, opacity: 0.9 }]} numberOfLines={1}>{preview}</Text>
            </View>
            <View style={localStyles.rightStatusRow}>
              {unread > 0 && (
                <View style={[localStyles.unreadBadge, { backgroundColor: colors.primary }]}>
                  <Text style={localStyles.unreadText}>{unread}</Text>
                </View>
              )}
              {isConnected && <View style={styles.onlineDot} />}
            </View>
          </TouchableOpacity>
            );
          })()
        )}

        {/* This Hub (Local Phones) - show same-hub phone slots as direct-message threads */}
        {showLocalPhones &&
          (!searchQuery || 'this hub local phones direct message m1 m2 m3 m4'.includes(searchQuery.toLowerCase())) &&
          localMobileTargets.map((mobileId) => {
            const rawNick = (localMobileNicknames && localMobileNicknames[mobileId])
              ? String(localMobileNicknames[mobileId])
              : '';
            const nick = /^mobile\s*\d+$/i.test(rawNick.trim()) ? '' : rawNick.trim();

            const title = nick || `M${mobileId}`;
            const conv = dmConversationMeta.byKey.get(`${myDeviceId}-m${mobileId}`) || null;
            const preview = (conv && conv.lastMessage)
              ? String(conv.lastMessage)
              : (localMobilesSeen.includes(mobileId) ? 'Connected now' : 'Direct message');
            const unread = (conv && conv.unreadCount) ? conv.unreadCount : 0;

            return (
              <TouchableOpacity
                key={`hub-m${mobileId}`}
                style={[styles.chatItem, { borderWidth: 1, borderColor: colors.glassBorder }]}
                onPress={() => onOpenChat({ type: 'dm', name: title, deviceId: myDeviceId, mobileId })}
              >
              <BlurView
                intensity={colors.glassIntensity}
                tint={colors.glassTint}
                style={StyleSheet.absoluteFillObject}
              />
              <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.glassOverlay }]} />

              <View style={[localStyles.avatarCircle, { backgroundColor: colors.inputBg }]}>
                <Users size={16} color={colors.textDark} />
              </View>
              <View style={localStyles.chatInfo}>
                <Text style={[styles.chatName, { color: colors.textDark }]}>{title}</Text>
                <Text style={[localStyles.chatPreview, { color: colors.gray }]} numberOfLines={1}>
                  {preview}
                </Text>
              </View>
              <View style={localStyles.chatMeta}>
                <View style={localStyles.rightStatusRow}>
                  {unread > 0 && (
                    <View style={[localStyles.unreadBadge, { backgroundColor: colors.primary }]}>
                      <Text style={localStyles.unreadText}>{unread}</Text>
                    </View>
                  )}
                  <View style={styles.onlineDot} />
                </View>
              </View>
              </TouchableOpacity>
            );
          })}
        
        {/* Known Devices */}
        {filteredDevices.length > 0 && (
          <>
            <Text style={[localStyles.sectionTitle, { color: colors.textDark }]}>Nearby Devices</Text>
            {filteredDevices.flatMap((device) => {
              const remoteMobiles = remoteMobilesByDevice.get(device.deviceId) || [];

              // If we know at least one remote mobile nickname on that hub, show per-mobile entries.
              if (remoteMobiles.length > 0) {
                return remoteMobiles.map((m) => {
                  const nick = (m.nickname || '').toString().trim();
                  const hubLabel = (device.name || '').toString().trim() || `Hiker #${device.deviceId}`;
                  const title = nick ? `${nick} (${hubLabel})` : `${hubLabel} - M${m.mobileId}`;
                  const conv = dmConversationMeta.byKey.get(`${device.deviceId}-m${m.mobileId}`) || null;
                  const preview = (conv && conv.lastMessage) ? String(conv.lastMessage) : 'Tap to message';
                  const unread = (conv && conv.unreadCount) ? conv.unreadCount : 0;
                  return (
                    <TouchableOpacity
                      key={`${device.deviceId}-m${m.mobileId}`}
                      style={[styles.chatItem, { borderWidth: 1, borderColor: colors.glassBorder }]}
                      onPress={() => onOpenChat({ type: 'dm', name: title, deviceId: device.deviceId, mobileId: m.mobileId })}
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
                        <Text style={[styles.chatName, { color: colors.textDark }]}>{title}</Text>
                        <Text style={[localStyles.chatPreview, { color: colors.gray }]} numberOfLines={1}>{preview}</Text>
                      </View>
                      <View style={localStyles.rightStatusRow}>
                        {unread > 0 && (
                          <View style={[localStyles.unreadBadge, { backgroundColor: colors.primary }]}>
                            <Text style={localStyles.unreadText}>{unread}</Text>
                          </View>
                        )}
                        {device.online && <View style={styles.onlineDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                });
              }

              // Hub-level row hidden by request.
              return [];
            })}
          </>
        )}
        
        {/* Empty State */}
        {knownDevices.length === 0 && !showLocalPhones && !searchQuery && (
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
        {(() => {
          if (!searchQuery) return null;
          const groupMatches = 'group chat broadcast'.includes(searchLower);
          const morseMatches = 'morse code legend sos'.includes(searchLower);
          const localMatches =
            showLocalPhones &&
            'this hub local phones direct message m1 m2 m3 m4'.includes(searchLower);
          const hasResults = groupMatches || morseMatches || localMatches || filteredDevices.length > 0;
          if (hasResults) return null;
          return (
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
              No devices match "{searchQuery}"
            </Text>
          </View>
          );
        })()}
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
