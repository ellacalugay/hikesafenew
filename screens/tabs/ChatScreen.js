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
    getMessagesForDevice, 
    sendMessage, 
    sendBroadcastMessage,
    markMessagesAsRead,
    clearChatHistory
  } = useBluetoothDevice();
  const { getMemberNickname } = useLobby();
  
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
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
  
  const isBroadcast = chatInfo.type === 'broadcast' || chatInfo.deviceId === 0;
  const deviceId = chatInfo.deviceId;
  
  // Get messages for this conversation
  const messages = deviceId !== null ? getMessagesForDevice(deviceId) : [];
  
  // Mark messages as read when viewing conversation
  useEffect(() => {
    if (deviceId !== null && deviceId !== 0) {
      markMessagesAsRead(deviceId);
    }
  }, [deviceId, messages.length]);

  const handleSend = async () => {
    if (!messageText.trim() || !isConnected) return;
    
    setSending(true);
    try {
      if (isBroadcast) {
        await sendBroadcastMessage(messageText.trim());
      } else {
        await sendMessage(deviceId, messageText.trim());
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

  const isOffline = !isConnected || !isDeviceReachable;

  // Match mock's red offline indicator without changing global theme.
  const lightPalette = useMemo(() => ({
    background: '#f8faf5',
    surface: '#f8faf5',
    surfaceContainerLow: '#f2f4ef',
    surfaceContainer: '#ecefea',
    surfaceContainerHigh: '#e7e9e4',
    surfaceContainerHighest: '#e1e3de',
    surfaceVariant: '#e1e3de',
    outline: '#707a6a',
    outlineVariant: '#bfcab7',
    primary: '#156e05',
    primaryContainer: '#77ce60',
    onPrimary: '#ffffff',
    onSurface: '#191c1a',
    onSurfaceVariant: '#404a3b',
    error: '#ba1a1a',
  }), []);

  const ui = useMemo(() => {
    if (isDarkMode) {
      return {
        background: colors.background,
        surface: colors.surfaceBg,
        surfaceContainer: colors.cardBg,
        surfaceContainerHigh: colors.surfaceBg,
        surfaceContainerHighest: colors.cardBg,
        surfaceVariant: colors.inputBg,
        outline: colors.borderColor,
        outlineVariant: colors.borderColor,
        primary: colors.primary,
        primaryContainer: colors.primaryLight,
        onPrimary: colors.textLight,
        onSurface: colors.textDark,
        onSurfaceVariant: colors.gray,
        error: '#ba1a1a',
      };
    }
    return lightPalette;
  }, [colors, isDarkMode, lightPalette]);

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
        await sendMessage(deviceId, msg.text);
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
          contentContainerStyle={{ paddingBottom: 150, paddingTop: 8, flexGrow: 1 }}
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
                {isBroadcast 
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
            messages.map((msg) => (
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
                      {getMemberNickname(msg.from)}{msg.mobileId > 0 ? ` (Mobile ${msg.mobileId})` : ''}
                    </Text>
                  </View>
                )}

                {/* Bubble variants (match mock): sent=primary, pending/failed=outlined light */}
                {msg.isMine ? (
                  <View
                    style={[
                      localStyles.bubble,
                      msg.pending || msg.failed
                        ? { backgroundColor: ui.surfaceContainerHighest, borderColor: msg.failed ? errorColor : ui.primary, borderWidth: 1 }
                        : { backgroundColor: ui.primary },
                      localStyles.bubbleMine,
                    ]}
                  >
                    <Text
                      style={[
                        localStyles.bubbleText,
                        msg.pending ? localStyles.pendingText : null,
                        { color: msg.pending || msg.failed ? ui.onSurface : ui.onPrimary },
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
                            color: msg.failed ? errorColor : msg.pending ? ui.onSurfaceVariant : ui.primary,
                          },
                        ]}
                      >
                        {formatTime(msg.timestamp)} · {msg.pending ? 'PENDING SYNC' : msg.failed ? 'FAILED TO SEND' : 'SENT'}
                      </Text>
                      {!msg.pending && !msg.failed && <CheckCircle size={14} color={ui.primary} />}
                      {msg.pending && <Clock size={14} color={ui.onSurfaceVariant} />}
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
            ))
          )}
        </ScrollView>

        {/* Input Area */}
        <View style={[localStyles.composeWrap, { paddingBottom: insets.bottom + (Platform.OS === 'ios' ? 12 : 8) }]}>
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
                maxLength={200}
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
        </View>
        
        {/* Character Counter */}
        {messageText.length > 150 && (
          <View style={[localStyles.charCounter, { backgroundColor: ui.surfaceContainerHigh, borderColor: ui.outlineVariant }]}>
            <Text style={{ color: messageText.length > 200 ? errorColor : ui.onSurfaceVariant, fontSize: 11, fontWeight: '700', fontFamily: 'PublicSans_700Bold' }}>
              {messageText.length}/200
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
};

const localStyles = StyleSheet.create({
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
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  bubbleMine: {
    borderTopRightRadius: 6,
  },
  bubbleTheirs: {
    borderTopLeftRadius: 6,
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
  composeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
  },
  composeInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    padding: 0,
    margin: 0,
    maxHeight: 90,
    fontFamily: 'PublicSans_600SemiBold',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  charCounter: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 92 : 84,
    right: 74,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
});

export default ChatScreen;
