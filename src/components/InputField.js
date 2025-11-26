import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { styles } from '../styles';

const InputField = ({ label, placeholder, value, onChangeText, secureTextEntry, keyboardType, error, autoCapitalize }) => (
  <View style={styles.inputContainer}>
    {label && <Text style={styles.inputLabel}>{label}</Text>}
    <TextInput
      style={[styles.input, error ? { borderColor: 'red' } : null]}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
    />
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
  </View>
);

export default InputField;
