import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  KeyboardAvoidingView,
  Platform,
  SafeAreaView
} from 'react-native';
import { ArrowLeft, Send, User } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles/styles';
import { useTheme } from '../../context/ThemeContext';

const ChatScreen = ({ onBack, chatName = 'Chat' }) => {
  const { colors } = useTheme();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    { id: 1, text: 'Hello! How are you?', sender: 'other', time: '10:30 AM' },
    { id: 2, text: 'I\'m good, thanks! Ready for the hike?', sender: 'me', time: '10:31 AM' },
    { id: 3, text: 'Yes! Meeting at the trail entrance in 30 mins.', sender: 'other', time: '10:32 AM' },
  ]);
  const scrollViewRef = useRef();

  const handleSend = () => {
    if (message.trim()) {
      setMessages([...messages, {
        id: messages.length + 1,
        text: message,
        sender: 'me',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
      setMessage('');
    }
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
        <Text style={[styles.headerTitle, { color: colors.textDark }]}>{chatName}</Text>
      </View>
    <KeyboardAvoidingView 
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >

      <ScrollView 
        ref={scrollViewRef}
        style={{ flex: 1, padding: 15, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg) => (
          <View 
            key={msg.id} 
            style={{
              alignSelf: msg.sender === 'me' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              marginBottom: 10,
            }}
          >
            {msg.sender === 'other' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <View style={[styles.avatarSmall, { width: 24, height: 24, marginRight: 6, backgroundColor: colors.primary }]}>
                  <User size={12} color="white" />
                </View>
                <Text style={{ fontSize: 12, color: colors.gray }}>Hiker</Text>
              </View>
            )}
            <View style={{
              backgroundColor: msg.sender === 'me' ? colors.primary : colors.cardBg,
              padding: 12,
              borderRadius: 16,
              borderTopRightRadius: msg.sender === 'me' ? 4 : 16,
              borderTopLeftRadius: msg.sender === 'other' ? 4 : 16,
              shadowColor: '#000',
              shadowOpacity: 0.05,
              elevation: 1,
            }}>
              <Text style={{ 
                color: msg.sender === 'me' ? 'white' : colors.textDark,
                fontSize: 15,
              }}>
                {msg.text}
              </Text>
            </View>
            <Text style={{ 
              fontSize: 10, 
              color: colors.gray, 
              marginTop: 4,
              alignSelf: msg.sender === 'me' ? 'flex-end' : 'flex-start',
            }}>
              {msg.time}
            </Text>
          </View>
        ))}
      </ScrollView>

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
          placeholder="Type a message..."
          placeholderTextColor={colors.gray}
          value={message}
          onChangeText={setMessage}
          multiline
        />
        <TouchableOpacity 
          onPress={handleSend}
          style={{
            backgroundColor: colors.primary,
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 2,
          }}
        >
          <Send size={20} color="white" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ChatScreen;
