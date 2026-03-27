import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UserContext = createContext(null);

// Storage keys
const FIRST_NAME_KEY = '@hikesafe_first_name';
const LAST_NAME_KEY = '@hikesafe_last_name';
const CONTACT_NAME_KEY = '@hikesafe_contact_name';
const CONTACT_PHONE_KEY = '@hikesafe_contact_phone';
const MEDICAL_CONDITION_KEY = '@hikesafe_medical_condition';

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const [firstName, setFirstNameState] = useState('');
  const [lastName, setLastNameState] = useState('');
  const [contactName, setContactNameState] = useState('');
  const [contactPhone, setContactPhoneState] = useState('');
  const [medicalCondition, setMedicalConditionState] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [f, l, cName, cPhone, med] = await Promise.all([
          AsyncStorage.getItem(FIRST_NAME_KEY),
          AsyncStorage.getItem(LAST_NAME_KEY),
          AsyncStorage.getItem(CONTACT_NAME_KEY),
          AsyncStorage.getItem(CONTACT_PHONE_KEY),
          AsyncStorage.getItem(MEDICAL_CONDITION_KEY),
        ]);

        if (f) setFirstNameState(f);
        if (l) setLastNameState(l);
        if (cName) setContactNameState(cName);
        if (cPhone) setContactPhoneState(cPhone);
        if (med) setMedicalConditionState(med);
      } catch (error) {
        console.error('Failed to load user data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const setFirstName = useCallback(async (value) => {
    setFirstNameState(value);
    try {
      await AsyncStorage.setItem(FIRST_NAME_KEY, value);
    } catch (e) {
      console.error('Failed to save first name:', e);
    }
  }, []);

  const setLastName = useCallback(async (value) => {
    setLastNameState(value);
    try {
      await AsyncStorage.setItem(LAST_NAME_KEY, value);
    } catch (e) {
      console.error('Failed to save last name:', e);
    }
  }, []);

  const setContactName = useCallback(async (value) => {
    setContactNameState(value);
    try {
      await AsyncStorage.setItem(CONTACT_NAME_KEY, value);
    } catch (e) {
      console.error('Failed to save contact name:', e);
    }
  }, []);

  const setContactPhone = useCallback(async (value) => {
    setContactPhoneState(value);
    try {
      await AsyncStorage.setItem(CONTACT_PHONE_KEY, value);
    } catch (e) {
      console.error('Failed to save contact phone:', e);
    }
  }, []);

  const setMedicalCondition = useCallback(async (value) => {
    setMedicalConditionState(value);
    try {
      await AsyncStorage.setItem(MEDICAL_CONDITION_KEY, value);
    } catch (e) {
      console.error('Failed to save medical condition:', e);
    }
  }, []);

  const clearUser = useCallback(async () => {
    setFirstNameState('');
    setLastNameState('');
    setContactNameState('');
    setContactPhoneState('');
    setMedicalConditionState('');
    try {
      await Promise.all([
        AsyncStorage.removeItem(FIRST_NAME_KEY),
        AsyncStorage.removeItem(LAST_NAME_KEY),
        AsyncStorage.removeItem(CONTACT_NAME_KEY),
        AsyncStorage.removeItem(CONTACT_PHONE_KEY),
        AsyncStorage.removeItem(MEDICAL_CONDITION_KEY),
      ]);
    } catch (e) {
      console.error('Failed to clear user data:', e);
    }
  }, []);

  const value = {
    firstName,
    lastName,
    contactName,
    contactPhone,
    medicalCondition,
    isLoading,
    setFirstName,
    setLastName,
    setContactName,
    setContactPhone,
    setMedicalCondition,
    clearUser,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export default UserContext;
