import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UserContext = createContext(null);

const FIRST_NAME_KEY = '@hikesafe_user_first_name';
const LAST_NAME_KEY = '@hikesafe_user_last_name';
const CONTACT_NAME_KEY = '@hikesafe_user_contact_name';
const CONTACT_PHONE_KEY = '@hikesafe_user_contact_phone';
const MEDICAL_CONDITION_KEY = '@hikesafe_user_medical_condition';

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return ctx;
};

export const UserProvider = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);

  const [firstName, setFirstNameState] = useState('');
  const [lastName, setLastNameState] = useState('');
  const [contactName, setContactNameState] = useState('');
  const [contactPhone, setContactPhoneState] = useState('');
  const [medicalCondition, setMedicalConditionState] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [fn, ln, cn, cp, mc] = await Promise.all([
          AsyncStorage.getItem(FIRST_NAME_KEY),
          AsyncStorage.getItem(LAST_NAME_KEY),
          AsyncStorage.getItem(CONTACT_NAME_KEY),
          AsyncStorage.getItem(CONTACT_PHONE_KEY),
          AsyncStorage.getItem(MEDICAL_CONDITION_KEY),
        ]);
        if (fn) setFirstNameState(fn);
        if (ln) setLastNameState(ln);
        if (cn) setContactNameState(cn);
        if (cp) setContactPhoneState(cp);
        if (mc) setMedicalConditionState(mc);
      } catch (e) {
        console.error('Failed to load user profile:', e);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const setFirstName = useCallback(async (value) => {
    const next = (value || '').toString();
    setFirstNameState(next);
    try {
      await AsyncStorage.setItem(FIRST_NAME_KEY, next);
    } catch (e) {
      console.error('Failed to persist first name:', e);
    }
  }, []);

  const setLastName = useCallback(async (value) => {
    const next = (value || '').toString();
    setLastNameState(next);
    try {
      await AsyncStorage.setItem(LAST_NAME_KEY, next);
    } catch (e) {
      console.error('Failed to persist last name:', e);
    }
  }, []);

  const setContactName = useCallback(async (value) => {
    const next = (value || '').toString();
    setContactNameState(next);
    try {
      await AsyncStorage.setItem(CONTACT_NAME_KEY, next);
    } catch (e) {
      console.error('Failed to persist contact name:', e);
    }
  }, []);

  const setContactPhone = useCallback(async (value) => {
    const next = (value || '').toString();
    setContactPhoneState(next);
    try {
      await AsyncStorage.setItem(CONTACT_PHONE_KEY, next);
    } catch (e) {
      console.error('Failed to persist contact phone:', e);
    }
  }, []);

  const setMedicalCondition = useCallback(async (value) => {
    const next = (value || '').toString();
    setMedicalConditionState(next);
    try {
      await AsyncStorage.setItem(MEDICAL_CONDITION_KEY, next);
    } catch (e) {
      console.error('Failed to persist medical condition:', e);
    }
  }, []);

  return (
    <UserContext.Provider
      value={{
        isLoading,
        firstName,
        lastName,
        contactName,
        contactPhone,
        medicalCondition,
        setFirstName,
        setLastName,
        setContactName,
        setContactPhone,
        setMedicalCondition,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
