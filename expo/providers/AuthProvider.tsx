import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

interface AuthContextType {
  isAuthenticated: boolean;
  hasPin: boolean;
  pinEnabled: boolean;
  isLoading: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  biometricType: string | null;
  login: (pin: string) => Promise<boolean>;
  loginWithBiometric: () => Promise<boolean>;
  setPin: (pin: string) => Promise<void>;
  changePin: (oldPin: string, newPin: string) => Promise<boolean>;
  togglePinEnabled: (enabled: boolean) => Promise<void>;
  toggleBiometric: (enabled: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PIN_KEY = '@master_journal_pin';
const PIN_ENABLED_KEY = '@master_journal_pin_enabled';
const BIOMETRIC_ENABLED_KEY = '@master_journal_biometric_enabled';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, []);

  async function init() {
    try {
      const storedPin = await AsyncStorage.getItem(PIN_KEY);
      const pinEnabledStr = await AsyncStorage.getItem(PIN_ENABLED_KEY);
      setHasPin(!!storedPin);
      const enabled = pinEnabledStr === 'true';
      setPinEnabled(enabled);
      if (!!storedPin && !enabled) {
        setIsAuthenticated(true);
      }

      if (Platform.OS !== 'web') {
        try {
          const LocalAuth = await import('expo-local-authentication');
          console.log('[Auth] LocalAuth module loaded successfully');
          const compatible = await LocalAuth.hasHardwareAsync();
          console.log('[Auth] Hardware compatible:', compatible);
          if (compatible) {
            const enrolled = await LocalAuth.isEnrolledAsync();
            console.log('[Auth] Biometrics enrolled:', enrolled);
            if (enrolled) {
              setBiometricAvailable(true);
              const types = await LocalAuth.supportedAuthenticationTypesAsync();
              console.log('[Auth] Supported auth types:', types);
              if (types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) {
                setBiometricType('face');
              } else if (types.includes(LocalAuth.AuthenticationType.FINGERPRINT)) {
                setBiometricType('fingerprint');
              } else {
                setBiometricType('fingerprint');
              }
              const bioEnabledStr = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
              setBiometricEnabled(bioEnabledStr === 'true');
              console.log('[Auth] Biometric available, types:', types, 'enabled:', bioEnabledStr === 'true');
            } else {
              console.log('[Auth] Biometrics NOT enrolled on device');
              setBiometricAvailable(false);
              setBiometricType('fingerprint');
            }
          } else {
            console.log('[Auth] No biometric hardware detected');
            setBiometricAvailable(false);
            setBiometricType('fingerprint');
          }
        } catch (e) {
          console.log('[Auth] Biometric check error:', e);
          setBiometricAvailable(false);
          setBiometricType('fingerprint');
        }
      }

      console.log('[Auth] init: hasPin =', !!storedPin, 'pinEnabled =', enabled);
      setIsLoading(false);
    } catch (error) {
      console.error('[Auth] Error initializing:', error);
      setIsLoading(false);
    }
  }

  const login = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const storedPin = await AsyncStorage.getItem(PIN_KEY);
      if (storedPin === pin) {
        setIsAuthenticated(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Auth] Login error:', error);
      return false;
    }
  }, []);

  const loginWithBiometric = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      const LocalAuth = await import('expo-local-authentication');
      const result = await LocalAuth.authenticateAsync({
        promptMessage: 'Войти в Журнал мастера',
        cancelLabel: 'Отмена',
        disableDeviceFallback: true,
      });
      if (result.success) {
        setIsAuthenticated(true);
        return true;
      }
      return false;
    } catch (e) {
      console.log('[Auth] Biometric login error:', e);
      return false;
    }
  }, []);

  const setPin = useCallback(async (pin: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(PIN_KEY, pin);
      setHasPin(true);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('[Auth] Set PIN error:', error);
      throw error;
    }
  }, []);

  const changePin = useCallback(async (oldPin: string, newPin: string): Promise<boolean> => {
    try {
      const storedPin = await AsyncStorage.getItem(PIN_KEY);
      if (storedPin !== oldPin) {
        return false;
      }
      await AsyncStorage.setItem(PIN_KEY, newPin);
      console.log('[Auth] PIN changed successfully');
      return true;
    } catch (error) {
      console.error('[Auth] Change PIN error:', error);
      return false;
    }
  }, []);

  const togglePinEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(PIN_ENABLED_KEY, enabled ? 'true' : 'false');
      setPinEnabled(enabled);
      if (!enabled) {
        setIsAuthenticated(true);
      }
      console.log('[Auth] PIN enabled:', enabled);
    } catch (error) {
      console.error('[Auth] Toggle PIN error:', error);
    }
  }, []);

  const toggleBiometric = useCallback(async (enabled: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
      setBiometricEnabled(enabled);
      console.log('[Auth] Biometric enabled:', enabled);
    } catch (error) {
      console.error('[Auth] Toggle biometric error:', error);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setIsAuthenticated(false);
  }, []);

  const value = useMemo(() => ({
    isAuthenticated,
    hasPin,
    pinEnabled,
    isLoading,
    biometricAvailable,
    biometricEnabled,
    biometricType,
    login,
    loginWithBiometric,
    setPin,
    changePin,
    togglePinEnabled,
    toggleBiometric,
    logout,
  }), [isAuthenticated, hasPin, pinEnabled, isLoading, biometricAvailable, biometricEnabled, biometricType, login, loginWithBiometric, setPin, changePin, togglePinEnabled, toggleBiometric, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
