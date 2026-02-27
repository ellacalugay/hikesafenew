import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Radio, Users, AlertCircle, Bluetooth } from 'lucide-react-native';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';
import { useBluetoothDevice } from '../../context/BluetoothContext';

const ChatScreen = ({ onBack, chatName }) => {
  const { colors } = useTheme();
  const { 
    isConnected, 
    getMessagesForDevice, 
    sendMessage, 
    sendBroadcastMessage,
    markMessagesAsRead 
  } = useBluetoothDevice();
  
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollViewRef = useRef();
  
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.headerBar, { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity 
          onPress={onBack} 
          style={{ position: 'absolute', left: 20, top: 15, padding: 5 }}
        >
          <ArrowLeft size={24} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textDark }]}>{chatInfo.name || 'Chat'}</Text>
      </View>
    <KeyboardAvoidingView 
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >

        {/* Not Connected Banner */}
        {!isConnected && (
          <View style={[localStyles.warningBanner, { backgroundColor: '#FFF3CD', borderColor: '#FFE69C' }]}>
            <Bluetooth size={18} color="#856404" />
            <Text style={[localStyles.warningText, { color: '#856404' }]}>
              Connect to your device to send messages
            </Text>
          </View>
        )}

        {/* Messages */}
        <ScrollView 
          ref={scrollViewRef}
          style={{ flex: 1, padding: 15, backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
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
              <Text style={[localStyles.emptyText, { color: colors.gray }]}>
                {isBroadcast 
                  ? 'Messages sent here will be broadcast to all devices in LoRa range.'
                  : 'Start a conversation. Messages are sent via LoRa radio.'}
              </Text>
              <View style={[localStyles.infoBox, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
                <AlertCircle size={16} color={colors.gray} />
                <Text style={[localStyles.infoText, { color: colors.gray }]}>
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
                  marginBottom: 10,
                }}
              >
                {!msg.isMine && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <View style={[styles.avatarSmall, { width: 24, height: 24, marginRight: 6, backgroundColor: colors.primary }]}>
                      <Radio size={12} color="white" />
                    </View>
                    <Text style={{ fontSize: 12, color: colors.gray }}>Device {msg.from}</Text>
                  </View>
                )}
                <View style={{
                  backgroundColor: msg.isMine ? colors.primary : colors.cardBg,
                  padding: 12,
                  borderRadius: 16,
                  borderTopRightRadius: msg.isMine ? 4 : 16,
                  borderTopLeftRadius: !msg.isMine ? 4 : 16,
                  shadowColor: '#000',
                  shadowOpacity: 0.05,
                  elevation: 1,
                  opacity: msg.pending ? 0.7 : 1,
                }}>
                  <Text style={{ 
                    color: msg.isMine ? 'white' : colors.textDark,
                    fontSize: 15,
                  }}>
                    {msg.text}
                  </Text>
                  {msg.pending && (
                    <ActivityIndicator size="small" color={msg.isMine ? '#fff' : colors.primary} style={{ marginTop: 4 }} />
                  )}
                  {msg.failed && (
                    <Text style={{ color: colors.accent, fontSize: 11, marginTop: 4 }}>Failed to send</Text>
                  )}
                </View>
                <Text style={{ 
                  fontSize: 10, 
                  color: colors.gray, 
                  marginTop: 4,
                  alignSelf: msg.isMine ? 'flex-end' : 'flex-start',
                }}>
                  {formatTime(msg.timestamp)}
                </Text>
              </View>
            ))
          )}
        </ScrollView>

        {/* Input Area */}
        <View style={{
          flexDirection: 'row',
          padding: 10,
          paddingBottom: Platform.OS === 'ios' ? 20 : 10,
          paddingHorizontal: 15,
          backgroundColor: colors.surfaceBg,
          borderTopWidth: 1,
          borderTopColor: colors.borderColor,
          alignItems: 'flex-end',
          minHeight: 60,
        }}>
          <TextInput
            style={{
              flex: 1,
              backgroundColor: colors.inputBg,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: Platform.OS === 'ios' ? 12 : 10,
              fontSize: 15,
              marginRight: 10,
              maxHeight: 100,
              minHeight: 40,
              color: colors.textDark,
            }}
            placeholder={isConnected ? "Type a message..." : "Connect device to send"}
            placeholderTextColor={colors.gray}
            value={messageText}
            onChangeText={setMessageText}
            multiline
            editable={isConnected}
            maxLength={200}
          />
          <TouchableOpacity 
            onPress={handleSend}
            disabled={!isConnected || !messageText.trim() || sending}
            style={{
              backgroundColor: isConnected && messageText.trim() ? colors.primary : colors.gray,
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 2,
            }}
          >
            {sending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Send size={20} color="white" />
            )}
          </TouchableOpacity>
        </View>
        
        {/* Character Counter */}
        {messageText.length > 150 && (
          <View style={[localStyles.charCounter, { backgroundColor: colors.surfaceBg }]}>
            <Text style={{ color: messageText.length > 200 ? colors.accent : colors.gray, fontSize: 11 }}>
              {messageText.length}/200
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const localStyles = StyleSheet.create({
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectedDot: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  warningText: {
    marginLeft: 10,
    flex: 1,
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
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
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
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
  charCounter: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 78 : 68,
    right: 80,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
});

export default ChatScreen;
