import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const UserContext = createContext(null);

// Storage keys
const FIRST_NAME_KEY = '@hikesafe_first_name';
const LAST_NAME_KEY = '@hikesafe_last_name';
const CONTACT_NAME_KEY = '@hikesafe_contact_name';
const CONTACT_PHONE_KEY = '@hikesafe_contact_phone';
const MEDICAL_CONDITION_KEY = '@hikesafe_medical_condition';
const PROFILE_PICTURE_KEY = '@hikesafe_profile_picture';
const MEMBER_ID_KEY = '@hikesafe_member_id';

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return ctx;
};

export const UserProvider = ({ children }) => {
  const [firstName, setFirstNameState] = useState('');
  const [lastName, setLastNameState] = useState('');
  const [contactName, setContactNameState] = useState('');
  const [contactPhone, setContactPhoneState] = useState('');
  const [medicalCondition, setMedicalConditionState] = useState('');
  const [profilePicture, setProfilePictureState] = useState(null); 
  const [memberId, setMemberIdState] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [f, l, cName, cPhone, med, pic, mid] = await Promise.all([
          AsyncStorage.getItem(FIRST_NAME_KEY),
          AsyncStorage.getItem(LAST_NAME_KEY),
          AsyncStorage.getItem(CONTACT_NAME_KEY),
          AsyncStorage.getItem(CONTACT_PHONE_KEY),
          AsyncStorage.getItem(MEDICAL_CONDITION_KEY),
          AsyncStorage.getItem(PROFILE_PICTURE_KEY),
          AsyncStorage.getItem(MEMBER_ID_KEY),
        ]);

        if (f) setFirstNameState(f);
        if (l) setLastNameState(l);
        if (cName) setContactNameState(cName);
        if (cPhone) setContactPhoneState(cPhone);
        if (med) setMedicalConditionState(med);
        if (pic) setProfilePictureState(pic);

         if (mid) {
          setMemberIdState(mid);
        } else {
          const newId = uuidv4();
          setMemberIdState(newId);
          await AsyncStorage.setItem(MEMBER_ID_KEY, newId);
        } 

      } catch (error) {
        console.error('Failed to load user data:', error);
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

  const setProfilePicture = useCallback(async (uri) => {
    setProfilePictureState(uri);
    try {
      if (uri) {
        await AsyncStorage.setItem(PROFILE_PICTURE_KEY, uri);
      } else {
        await AsyncStorage.removeItem(PROFILE_PICTURE_KEY);
      }
    } catch (e) { console.error('Failed to save profile picture:', e); 

    }
    }, []);

  const clearUser = useCallback(async () => {
    setFirstNameState('');
    setLastNameState('');
    setContactNameState('');
    setContactPhoneState('');
    setMedicalConditionState('');
    setProfilePictureState(null);
    try {
      await Promise.all([
        AsyncStorage.removeItem(FIRST_NAME_KEY),
        AsyncStorage.removeItem(LAST_NAME_KEY),
        AsyncStorage.removeItem(CONTACT_NAME_KEY),
        AsyncStorage.removeItem(CONTACT_PHONE_KEY),
        AsyncStorage.removeItem(MEDICAL_CONDITION_KEY),
        AsyncStorage.removeItem(PROFILE_PICTURE_KEY),
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
    profilePicture,
    memberId,
    isLoading,
    setFirstName,
    setLastName,
    setContactName,
    setContactPhone,
    setMedicalCondition,
    setProfilePicture,
    clearUser,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
