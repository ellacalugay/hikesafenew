import React, { useMemo, useRef, useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { ArrowLeft, Send, Radio, Users, AlertCircle, Bluetooth, Trash2, Signal, BatteryCharging, Satellite, CheckCircle, Clock, RefreshCw, PlusCircle, MapPin } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';
import { useLobby } from '../../context/LobbyContext';

const ChatScreen = ({ onBack, chatName }) => {
  const { colors, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { 
    isConnected, 
    isDeviceReachable,
    connectionHealth,
    loraSignalStrength,
    myLocation,
    myMobileId,
    getMessagesForDevice, 
    sendMessage,
    sendDirectMessage,
    sendBroadcastMessage,
    sendLocalBroadcastMessage,
    markMessagesAsRead,
    clearChatHistory,
    localMobileNicknames,
    remoteMobileNicknames
  } = useBluetoothDevice();
  const { getMemberNickname, myDeviceId } = useLobby();

  const getIncomingSenderLabel = useMemo(() => {
    return (msg) => {
      if (!msg) return 'Unknown';

      const fromDeviceId = msg.from;
      const isDm = typeof msg.dmToMobileId === 'number' || typeof msg.dmFromMobileId === 'number';

      if (isDm) {
        const fromMobile = msg.dmFromMobileId || msg.mobileId;
        const mobileId = (typeof fromMobile === 'number' && fromMobile >= 1 && fromMobile <= 4) ? fromMobile : null;
        const isSelfHub = typeof myDeviceId === 'number' && typeof fromDeviceId === 'number' && fromDeviceId === myDeviceId;

        const rawNick = mobileId
          ? (
            isSelfHub
              ? (localMobileNicknames?.[mobileId] || '')
              : (remoteMobileNicknames?.[`${fromDeviceId}-m${mobileId}`] || '')
          )
          : '';

        const nick = /^mobile\s*\d+$/i.test(String(rawNick).trim()) ? '' : String(rawNick).trim();
        if (nick) return nick;
        if (mobileId) {
          return isSelfHub ? `M${mobileId}` : `Hiker #${fromDeviceId} - M${mobileId}`;
        }
        return typeof fromDeviceId === 'number' && fromDeviceId > 0 ? `Hiker #${fromDeviceId}` : 'Unknown';
      }

      // Non-DM: show device nickname (never "Device 0" unless truly unknown)
      if (typeof fromDeviceId === 'number' && fromDeviceId > 0) {
        const nick = (getMemberNickname(fromDeviceId) || '').toString().trim();
        if (nick && !/^device\s*#?\s*\d+$/i.test(nick)) return nick;
        return `Hiker #${fromDeviceId}`;
      }
      return 'This Hub';
    };
  }, [getMemberNickname, localMobileNicknames, myDeviceId, remoteMobileNicknames]);
  
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [dmTarget, setDmTarget] = useState(null); // null | 1..4
  const scrollViewRef = useRef();

  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);
  
  // Handle both old string format and new object format
  const chatInfo = typeof chatName === 'object' ? chatName : { 
    type: 'direct', 
    name: chatName, 
    deviceId: null 
  };
  
  const isLocalBroadcast = chatInfo.type === 'localBroadcast' || chatInfo.deviceId === -1;
  const isBroadcast = isLocalBroadcast || chatInfo.type === 'broadcast' || chatInfo.deviceId === 0;
  const deviceId = isLocalBroadcast ? -1 : chatInfo.deviceId;
  const initialMobileId = chatInfo && typeof chatInfo.mobileId === 'number' ? chatInfo.mobileId : null;
  const hasLockedDmTarget = !!(initialMobileId && initialMobileId >= 1 && initialMobileId <= 4);

  const isSelfHubChat = !isBroadcast && typeof myDeviceId === 'number' && myDeviceId !== null && deviceId === myDeviceId;
  const canUseDeviceLevelChat = !isBroadcast && !isLocalBroadcast && !isSelfHubChat && !hasLockedDmTarget;
  const dmTargets = useMemo(() => {
    if (isBroadcast || deviceId === null || deviceId === 0) return [];

    // Prefer explicit nickname mappings; if we know none, don't show a confusing picker.
    if (isSelfHubChat) {
      const keys = localMobileNicknames ? Object.keys(localMobileNicknames) : [];
      const ids = keys
        .map(k => parseInt(k, 10))
        .filter(n => !Number.isNaN(n) && n >= 1 && n <= 4);
      const unique = Array.from(new Set(ids)).sort((a, b) => a - b);
      const selfId = (typeof myMobileId === 'number' && myMobileId >= 1 && myMobileId <= 4) ? myMobileId : null;
      return selfId ? unique.filter(t => t !== selfId) : unique;
    }

    const entries = remoteMobileNicknames ? Object.keys(remoteMobileNicknames) : [];
    const ids = entries
      .map(k => {
        const m = String(k).match(new RegExp(`^${deviceId}-m(\\d+)$`));
        if (!m) return NaN;
        return parseInt(m[1], 10);
      })
      .filter(n => !Number.isNaN(n) && n >= 1 && n <= 4);
    const unique = Array.from(new Set(ids)).sort((a, b) => a - b);

    // For remote hubs, only offer mobile targets we actually know.
    // If we know none yet, fall back to device-level chat (hub-to-hub) instead of forcing DM.
    return unique;
  }, [deviceId, isBroadcast, isSelfHubChat, localMobileNicknames, myMobileId, remoteMobileNicknames]);

  const shouldShowDmPicker = useMemo(() => {
    if (isBroadcast || deviceId === null || deviceId === 0) return false;
    if (canUseDeviceLevelChat) return false;
    if (hasLockedDmTarget) return false;
    // Only show picker when we have multiple *named* choices.
    return Array.isArray(dmTargets) && dmTargets.length > 1;
  }, [canUseDeviceLevelChat, deviceId, dmTargets, hasLockedDmTarget, isBroadcast]);

  const maxMessageLength = useMemo(() => {
    const baseLimit = 50;
    if (isBroadcast || isLocalBroadcast || canUseDeviceLevelChat) return baseLimit;

    const targetMobile = typeof dmTarget === 'number' ? dmTarget : null;
    const fromMobile = (typeof myMobileId === 'number' && myMobileId >= 1 && myMobileId <= 4) ? myMobileId : 0;
    if (!targetMobile) return baseLimit;

    const prefix = `__DM__:${targetMobile}:${fromMobile}:`;
    return Math.max(1, baseLimit - prefix.length);
  }, [canUseDeviceLevelChat, dmTarget, isBroadcast, isLocalBroadcast, myMobileId]);

  // When opening a DM thread (device + mobile), preselect that mobile.
  useEffect(() => {
    if (isBroadcast) {
      setDmTarget(null);
      return;
    }
    if (canUseDeviceLevelChat) {
      // Default to device-level chat; DM can be enabled by opening a per-mobile thread.
      setDmTarget(null);
      return;
    }
    if (initialMobileId && initialMobileId >= 1 && initialMobileId <= 4) {
      setDmTarget(initialMobileId);
      return;
    }
    // If there's exactly one sensible target, select it automatically.
    if (Array.isArray(dmTargets) && dmTargets.length === 1) {
      setDmTarget(dmTargets[0]);
      return;
    }
    // Otherwise, keep unselected until the user has enough info (nicknames) to pick.
    setDmTarget(null);
  }, [deviceId, dmTargets, initialMobileId, isBroadcast]);
  
  // Get messages for this conversation
  const baseMessages = deviceId !== null ? getMessagesForDevice(deviceId) : [];
  const messages = useMemo(() => {
    if (isBroadcast) return baseMessages;
    if (canUseDeviceLevelChat) {
      // Device-level chat (hub-to-hub): show non-DM direct messages.
      return baseMessages.filter((m) => {
        if (!m) return false;
        const isDm = typeof m.dmToMobileId === 'number' || typeof m.dmFromMobileId === 'number';
        return !isDm;
      });
    }

    if (!dmTarget) return [];
    // Personal chat = DM to a specific mobile on a hub.
    return baseMessages.filter((m) => {
      if (!m) return false;
      const isDm = typeof m.dmToMobileId === 'number' || typeof m.dmFromMobileId === 'number';
      if (!isDm) return false;
      if (m.isMine) return m.dmToMobileId === dmTarget;
      const fromMobile = m.dmFromMobileId || m.mobileId;
      return fromMobile === dmTarget;
    });
  }, [baseMessages, canUseDeviceLevelChat, dmTarget, isBroadcast]);
  
  // Mark messages as read when viewing conversation
  useEffect(() => {
    if (deviceId !== null && deviceId !== 0) {
      markMessagesAsRead(deviceId);
    }
  }, [deviceId, messages.length]);

  const handleSend = async () => {
    const text = messageText.trim();
    if (!text || !isConnected) return;

    if (text.length > maxMessageLength) {
      Alert.alert('Message Too Long', `Max ${maxMessageLength} characters for this chat.`);
      return;
    }
    
    setSending(true);
    try {
      if (isLocalBroadcast) {
        await sendLocalBroadcastMessage(text);
      } else if (isBroadcast) {
        await sendBroadcastMessage(text);
      } else {
        if (canUseDeviceLevelChat) {
          // Hub-to-hub chat: send to the remote device.
          await sendMessage(deviceId, text);
        } else {
          if (!dmTarget) {
            Alert.alert('Choose Recipient', 'Choose a recipient phone (set a nickname on the other phone to make this easier).');
            return;
          }
          if (isSelfHubChat && typeof myMobileId === 'number' && myMobileId >= 1 && myMobileId <= 4 && dmTarget === myMobileId) {
            Alert.alert("Can't Message Yourself", 'Choose a different phone on this hub.');
            return;
          }
          await sendDirectMessage(deviceId, dmTarget, text);
        }
      }
      setMessageText('');
    } catch (error) {
      console.error('Send error:', error);
    } finally {
      setSending(false);
    }
  };
  
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Detect system messages like __JOINED_TS__:... or __LEFT_TS__:...
  const parseSystemMessage = (text) => {
    if (typeof text !== 'string') return null;
    const t = text.trim();
    if (
      t.startsWith('__JOINED_TS__:') ||
      t.startsWith('__JOIN_TS__:') ||
      t.startsWith('JOIN_TS:') ||
      t.startsWith('JOIN TS:') ||
      t === '__JOINED_TS__' ||
      t === '__JOIN_TS__' ||
      t === 'JOIN_TS' ||
      t === 'JOIN TS'
    ) {
      return { type: 'joined' };
    }
    if (
      t.startsWith('__LEFT_TS__:') ||
      t.startsWith('__LEAVE_TS__:') ||
      t.startsWith('LEFT_TS:') ||
      t.startsWith('LEAVE_TS:') ||
      t === '__LEFT_TS__' ||
      t === '__LEAVE_TS__' ||
      t === 'LEFT_TS' ||
      t === 'LEAVE_TS'
    ) {
      return { type: 'left' };
    }
    return null;
  };

  const isOffline = !isConnected || !isDeviceReachable;

  // Unified Theme Mapping: derive all surfaces from ThemeContext (no hardcoded light palette)
  const ui = useMemo(() => {
    return {
      background: colors.background,
      surface: colors.surfaceBg,
      surfaceContainerLow: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      surfaceContainer: colors.cardBg,
      surfaceContainerHigh: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
      surfaceContainerHighest: isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.09)',
      surfaceVariant: colors.inputBg,
      outline: colors.borderColor,
      outlineVariant: colors.borderColor,
      primary: colors.primary,
      primaryContainer: colors.primaryLight,
      onPrimary: colors.textLight,
      onSurface: colors.textDark,
      onSurfaceVariant: colors.gray,
      error: isDarkMode ? '#ef4444' : '#ba1a1a',
    };
  }, [colors, isDarkMode]);

  const errorColor = ui.error;

  const reliabilityPercent = useMemo(() => {
    if (typeof loraSignalStrength !== 'number') return null;
    // Map RSSI (-120..-30 dBm) -> (0..100)
    const clamped = Math.max(-120, Math.min(-30, loraSignalStrength));
    const pct = Math.round(((clamped + 120) / 90) * 100);
    return Math.max(0, Math.min(100, pct));
  }, [loraSignalStrength]);

  const reliabilityLabel = useMemo(() => {
    if (!isConnected) return 'DEVICE: DISCONNECTED';
    if (!isDeviceReachable) return 'LINK: OFFLINE';
    if (reliabilityPercent !== null) return `LINK RELIABILITY: ${reliabilityPercent}%`;
    if (connectionHealth && connectionHealth !== 'unknown') return `LINK: ${String(connectionHealth).toUpperCase()}`;
    return 'LINK: CONNECTED';
  }, [connectionHealth, isConnected, isDeviceReachable, reliabilityPercent]);

  const locationText = useMemo(() => {
    if (!myLocation?.valid) return null;
    const lat = Number(myLocation.lat);
    const lng = Number(myLocation.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const latAbs = Math.abs(lat).toFixed(4);
    const lngAbs = Math.abs(lng).toFixed(4);
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${latAbs}° ${latDir}, ${lngAbs}° ${lngDir}`;
  }, [myLocation?.lat, myLocation?.lng, myLocation?.valid]);

  const handleRetry = async (msg) => {
    if (!msg?.isMine || !msg?.failed) return;
    if (!isConnected) return;
    try {
      if (isBroadcast) {
        await sendBroadcastMessage(msg.text);
      } else {
        if (canUseDeviceLevelChat) {
          await sendMessage(deviceId, msg.text);
          return;
        }
        if (typeof msg.dmToMobileId === 'number') {
          await sendDirectMessage(deviceId, msg.dmToMobileId, msg.text);
          return;
        }
        Alert.alert('Cannot Retry', 'This message was not a mobile-targeted DM.');
      }
    } catch (error) {
      console.error('Retry error:', error);
    }
  };

  const handleClearChat = () => {
    Alert.alert(
      'Clear Chat History',
      'Are you sure you want to delete all messages? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete All', 
          style: 'destructive',
          onPress: async () => {
            const success = await clearChatHistory();
            if (success) {
              Alert.alert('Cleared', 'All chat history has been deleted.');
            }
          }
        }
      ]
    );
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: ui.background,
        marginTop: -insets.top,
        marginBottom: -insets.bottom,
      }}
    >
      {/* Top App Bar */}
      <View style={[localStyles.topBar, { paddingTop: insets.top }]}>
        <BlurView
          tint={isDarkMode ? 'dark' : 'light'}
          intensity={60}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.25)' : 'rgba(248,250,245,0.75)' },
          ]}
        />

        <View style={localStyles.topBarInner}>
          <View style={localStyles.topBarLeft}>
            <TouchableOpacity onPress={onBack} style={localStyles.iconBtn}>
              <ArrowLeft size={22} color={ui.onSurface} />
            </TouchableOpacity>

            <Signal size={18} color={ui.primary} />

            <View style={{ marginLeft: 8 }}>
              <Text style={[localStyles.brandTitle, { color: ui.onSurface }]}>HikeSafe</Text>
              <Text style={[localStyles.chatSubtitle, { color: ui.onSurfaceVariant }]} numberOfLines={1}>
                {chatInfo.name || 'Chat'}
              </Text>
            </View>
          </View>

          <View style={localStyles.topBarRight}>
            <View
              style={[
                localStyles.statusPill,
                { backgroundColor: ui.surfaceContainerHigh, borderColor: ui.outlineVariant },
              ]}
            >
              <Animated.View
                style={[
                  localStyles.statusDot,
                  {
                    backgroundColor: isOffline ? errorColor : ui.primary,
                    opacity: isOffline
                      ? pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] })
                      : 1,
                    transform: isOffline
                      ? [
                          {
                            scale: pulseAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.85, 1.15],
                            }),
                          },
                        ]
                      : [{ scale: 1 }],
                  },
                ]}
              />
              <Text style={[localStyles.statusText, { color: ui.onSurfaceVariant }]}>
                {isOffline ? 'OFFLINE' : 'ONLINE'}
              </Text>
            </View>

            <BatteryCharging size={18} color={ui.primary} />

            <TouchableOpacity onPress={handleClearChat} style={localStyles.iconBtn}>
              <Trash2 size={18} color={ui.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >

        {/* Reliability Status Label */}
        <View style={localStyles.reliabilityWrap}>
          <View style={[localStyles.reliabilityPill, { backgroundColor: ui.surfaceContainer, borderColor: ui.outlineVariant }]}> 
            <Satellite size={14} color={ui.onSurfaceVariant} />
            <Text style={[localStyles.reliabilityText, { color: ui.onSurfaceVariant }]}>{reliabilityLabel}</Text>
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1, paddingHorizontal: 16, backgroundColor: ui.background }}
          contentContainerStyle={{ paddingBottom: 14, paddingTop: 8, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {/* System Information Node (Auto-Location Tag) */}
          {locationText && (
            <View style={[localStyles.systemCard, { backgroundColor: ui.surfaceContainerLow, borderColor: ui.outlineVariant, borderLeftColor: ui.primary }]}>
              <View style={[localStyles.systemIcon, { backgroundColor: ui.primaryContainer }]}>
                <MapPin size={16} color={ui.onPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[localStyles.systemLabel, { color: ui.onSurfaceVariant }]}>AUTO-LOCATION TAG</Text>
                <Text style={[localStyles.systemValue, { color: ui.onSurface }]}>{locationText}</Text>
              </View>
            </View>
          )}

          {messages.length === 0 ? (
            <View style={localStyles.emptyContainer}>
              <View style={[localStyles.emptyIcon, { backgroundColor: colors.primaryLight }]}>
                {isBroadcast ? (
                  <Users size={32} color={colors.primary} />
                ) : (
                  <Radio size={32} color={colors.primary} />
                )}
              </View>
              <Text style={[localStyles.emptyTitle, { color: colors.textDark }]}>
                {isBroadcast ? 'Group Chat' : `Chat with ${chatInfo.name}`}
              </Text>
              <Text style={[localStyles.emptyText, { color: ui.onSurfaceVariant }]}>
                {isLocalBroadcast
                  ? 'Messages sent here go only to phones connected to this hub.'
                  : isBroadcast
                    ? 'Messages sent here will be broadcast to all devices in LoRa range.'
                    : 'Start a conversation. Messages are sent via LoRa radio.'}
              </Text>
              <View style={[localStyles.infoBox, { backgroundColor: ui.surfaceContainer, borderColor: ui.outlineVariant }]}> 
                <AlertCircle size={16} color={ui.onSurfaceVariant} />
                <Text style={[localStyles.infoText, { color: ui.onSurfaceVariant }]}>
                  LoRa messages are limited to ~200 characters
                </Text>
              </View>
            </View>
          ) : (
            messages.map((msg) => {
              // ── System message (join / leave) ──────────────────────────
              const sys = parseSystemMessage(msg.text);
              if (sys) {
                const senderName = getMemberNickname(msg.from) || `Device ${msg.from}`;
                const label = sys.type === 'joined'
                  ? `${senderName} joined the group.`
                  : `${senderName} left the group.`;
                return (
                  <View key={msg.id} style={localStyles.systemEventRow}>
                    <View style={[localStyles.systemEventLine, { backgroundColor: ui.outlineVariant }]} />
                    <Text style={[localStyles.systemEventText, { color: ui.onSurfaceVariant }]}>
                      {label}
                    </Text>
                    <View style={[localStyles.systemEventLine, { backgroundColor: ui.outlineVariant }]} />
                  </View>
                );
              }

              // ── Regular message ────────────────────────────────────────
              return (
                <View 
                  key={msg.id} 
                  style={{
                    alignSelf: msg.isMine ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    marginBottom: 14,
                  }}
                >
                  {!msg.isMine && (
                    <View style={localStyles.incomingHeader}>
                      <View style={[localStyles.avatar, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}> 
                        <Radio size={12} color={colors.primary} />
                      </View>
                      <Text style={[localStyles.incomingMeta, { color: colors.gray }]}>
                        {getIncomingSenderLabel(msg)}
                      </Text>
                    </View>
                  )}

                  {/* Bubble variants (match mock): sent=primary, pending/failed=outlined light */}
                  {msg.isMine ? (
                    <View
                      style={[
                        localStyles.bubble,
                        msg.pending || msg.awaitingAck || msg.failed
                          ? { backgroundColor: ui.surfaceContainerHighest, borderColor: msg.failed ? errorColor : ui.primary, borderWidth: 1 }
                          : { backgroundColor: ui.primary },
                        localStyles.bubbleMine,
                      ]}
                    >
                      <Text
                        style={[
                          localStyles.bubbleText,
                          (msg.pending || msg.awaitingAck) ? localStyles.pendingText : null,
                          { color: (msg.pending || msg.awaitingAck || msg.failed) ? ui.onSurface : ui.onPrimary },
                        ]}
                      >
                        {msg.text}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        localStyles.bubble,
                        { backgroundColor: ui.surfaceContainerHighest, borderColor: ui.outlineVariant, borderWidth: 1 },
                        localStyles.bubbleTheirs,
                      ]}
                    >
                      <Text style={[localStyles.bubbleText, { color: ui.onSurface }]}>{msg.text}</Text>
                    </View>
                  )}

                  <View style={[localStyles.deliveryRow, { justifyContent: msg.isMine ? 'flex-end' : 'flex-start' }]}>
                    {msg.isMine ? (
                      <>
                        <Text
                          style={[
                            localStyles.deliveryText,
                            {
                              color: msg.failed ? errorColor : (msg.pending || msg.awaitingAck) ? ui.onSurfaceVariant : ui.primary,
                            },
                          ]}
                        >
                          {formatTime(msg.timestamp)} · {msg.waitingForClaim ? 'CLAIMING SLOT' : msg.pending ? 'PENDING SYNC' : msg.awaitingAck ? 'WAITING FOR RECEIPT' : msg.failed ? (msg.deliveryUnconfirmed ? 'NOT CONFIRMED' : 'FAILED TO SEND') : (msg.delivered ? 'DELIVERED' : 'SENT')}
                        </Text>
                        {!msg.pending && !msg.awaitingAck && !msg.failed && <CheckCircle size={14} color={ui.primary} />}
                        {(msg.pending || msg.awaitingAck) && <Clock size={14} color={ui.onSurfaceVariant} />}
                        {msg.failed && <AlertCircle size={14} color={errorColor} />}
                      </>
                    ) : (
                      <Text style={[localStyles.deliveryText, { color: ui.onSurfaceVariant }]}>{formatTime(msg.timestamp)}</Text>
                    )}
                  </View>

                  {msg.isMine && msg.failed && (
                    <TouchableOpacity
                      onPress={() => handleRetry(msg)}
                      style={localStyles.retryBtn}
                      disabled={!isConnected}
                    >
                      <Text style={[localStyles.retryText, { color: ui.primary }]}>RETRY TRANSMISSION</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Input Area */}
        <View style={[localStyles.composeWrap, { paddingBottom: insets.bottom + (Platform.OS === 'ios' ? 12 : 8) }]}>
          {/* DM Recipient Picker (direct chats only) */}
          {!isBroadcast && deviceId !== null && deviceId !== 0 && shouldShowDmPicker && (
            <View
              style={[
                localStyles.dmPicker,
                { backgroundColor: ui.surfaceContainerHigh, borderColor: ui.outlineVariant },
              ]}
            >
              <Text style={[localStyles.dmPickerLabel, { color: ui.onSurfaceVariant }]}>TO</Text>
              {dmTargets.map((t) => {
                const key = String(t);
                const selected = dmTarget === t;

                const nick = isSelfHubChat
                  ? (localMobileNicknames && localMobileNicknames[t] ? String(localMobileNicknames[t]) : '')
                  : (remoteMobileNicknames && remoteMobileNicknames[`${deviceId}-m${t}`] ? String(remoteMobileNicknames[`${deviceId}-m${t}`]) : '');

                const label = nick || 'Unnamed Phone';
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setDmTarget(t)}
                    style={[
                      localStyles.dmPill,
                      {
                        borderColor: selected ? ui.primary : ui.outlineVariant,
                        backgroundColor: selected ? ui.primaryContainer : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected ? ui.onSurface : ui.onSurfaceVariant,
                        fontSize: 12,
                        fontWeight: '800',
                        fontFamily: 'PublicSans_700Bold',
                      }}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {myMobileId ? null : null}
            </View>
          )}

          <View
            style={[
              localStyles.composeBar,
              {
                borderColor: ui.outlineVariant,
                opacity: isOffline ? 0.75 : 1,
              },
            ]}
          >
            <BlurView
              tint={isDarkMode ? 'dark' : 'light'}
              intensity={70}
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.25)' : 'rgba(231,233,228,0.70)' }]} />

            <TouchableOpacity style={localStyles.addBtn} disabled>
              <PlusCircle size={22} color={ui.onSurfaceVariant} />
            </TouchableOpacity>

            <View style={localStyles.composeLeft}>
              <TextInput
                style={[localStyles.composeInput, { color: ui.onSurface }]}
                placeholder={isOffline ? 'Offline: Reconnecting…' : 'Type a message…'}
                placeholderTextColor={ui.onSurfaceVariant}
                value={messageText}
                onChangeText={setMessageText}
                multiline
                editable={!isOffline}
                maxLength={maxMessageLength}
              />
            </View>

            <TouchableOpacity
              onPress={handleSend}
              disabled={isOffline || !messageText.trim() || sending}
              style={[
                localStyles.sendBtn,
                {
                  backgroundColor: !isOffline && messageText.trim() ? ui.primary : ui.surfaceVariant,
                },
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color={!isOffline && messageText.trim() ? ui.onPrimary : ui.onSurfaceVariant} />
              ) : (
                <Send size={18} color={!isOffline && messageText.trim() ? ui.onPrimary : ui.onSurfaceVariant} />
              )}
            </TouchableOpacity>
          </View>

          {/* Character Counter */}
          {messageText.length > Math.max(0, maxMessageLength - 20) && (
            <View style={[localStyles.charCounter, { backgroundColor: ui.surfaceContainerHigh, borderColor: ui.outlineVariant }]}>
              <Text style={{ color: messageText.length > maxMessageLength ? errorColor : ui.onSurfaceVariant, fontSize: 11, fontWeight: '700', fontFamily: 'PublicSans_700Bold' }}>
                {messageText.length}/{maxMessageLength}
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const localStyles = StyleSheet.create({
  dmPicker: {
    marginHorizontal: 14,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dmPickerLabel: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'PublicSans_700Bold',
    letterSpacing: 1.2,
    marginRight: 4,
  },
  dmPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  dmPickerHint: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'PublicSans_700Bold',
  },
  topBar: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  topBarInner: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    marginRight: 8,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  chatSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginTop: 1,
    maxWidth: 180,
    fontFamily: 'PublicSans_700Bold',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    fontFamily: 'PublicSans_700Bold',
  },
  reliabilityWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  reliabilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  reliabilityText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    fontFamily: 'PublicSans_700Bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 120,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    fontFamily: 'PublicSans_400Regular',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  infoText: {
    marginLeft: 8,
    fontSize: 12,
  },
  incomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
  },
  incomingMeta: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'PublicSans_600SemiBold',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
  },
  bubbleMine: {
    borderTopRightRadius: 14,
  },
  bubbleTheirs: {
    borderTopLeftRadius: 14,
  },
  bubbleText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    fontFamily: 'PublicSans_600SemiBold',
  },
  pendingText: {
    fontStyle: 'italic',
    opacity: 0.8,
  },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  deliveryText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: 'PublicSans_700Bold',
  },
  retryBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  retryText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textDecorationLine: 'underline',
    fontFamily: 'PublicSans_700Bold',
  },
  systemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderLeftWidth: 4,
    borderLeftColor: 'rgba(0,0,0,0.0)',
    marginBottom: 18,
    borderWidth: 1,
  },
  systemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    fontFamily: 'PublicSans_700Bold',
  },
  systemValue: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  // Join/leave event row
  systemEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginVertical: 12,
    paddingHorizontal: 8,
    gap: 10,
    width: '100%',
  },
  systemEventLine: {
    flex: 1,
    height: 1,
    opacity: 0.5,
  },
  systemEventText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'PublicSans_400Regular',
    fontStyle: 'italic',
    flexShrink: 1,
  },
  composeWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'transparent',
  },
  composeBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  addBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
  composeLeft: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 2,
    minHeight: 40,
    maxHeight: 96,
    backgroundColor: 'transparent',
  },
  composeInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    padding: 0,
    margin: 0,
    maxHeight: 90,
    fontFamily: 'PublicSans_600SemiBold',
    backgroundColor: 'transparent',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  charCounter: {
    alignSelf: 'flex-end',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
});

export default ChatScreen;