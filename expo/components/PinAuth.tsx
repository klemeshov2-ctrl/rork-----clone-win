import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration, Animated, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Delete, RotateCcw, Fingerprint, ScanFace } from 'lucide-react-native';
import { useAuth } from '@/providers/AuthProvider';
import { useThemeColors } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';

export function PinAuth() {
  const { hasPin, login, setPin, isLoading, biometricAvailable, biometricEnabled, biometricType, loginWithBiometric } = useAuth();
  const colors = useThemeColors();
  const [pin, setPinValue] = useState('');
  const [error, setError] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [firstPin, setFirstPin] = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const dotScales = useRef([
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]).current;

  const handleBiometric = useCallback(async () => {
    if (!biometricAvailable || !biometricEnabled) return;
    const success = await loginWithBiometric();
    if (!success) {
      console.log('[PinAuth] Biometric auth failed or cancelled');
    }
  }, [biometricAvailable, biometricEnabled, loginWithBiometric]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    if (hasPin && biometricAvailable && biometricEnabled && Platform.OS !== 'web') {
      const timer = setTimeout(() => {
        void handleBiometric();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [hasPin, biometricAvailable, biometricEnabled, handleBiometric]);

  const animateDot = (index: number) => {
    Animated.sequence([
      Animated.timing(dotScales[index], { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.timing(dotScales[index], { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const shakeError = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 15, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -15, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleNumberPress = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPinValue(newPin);
      setError('');
      animateDot(newPin.length - 1);
      if (newPin.length === 4) {
        setTimeout(() => handlePinComplete(newPin), 200);
      }
    }
  };

  const handlePinComplete = async (completedPin: string) => {
    if (hasPin) {
      const success = await login(completedPin);
      if (!success) {
        Vibration.vibrate(200);
        shakeError();
        setError('Неверный PIN-код');
        setPinValue('');
      }
    } else {
      if (!isConfirming) {
        setFirstPin(completedPin);
        setIsConfirming(true);
        setPinValue('');
      } else {
        if (completedPin === firstPin) {
          await setPin(completedPin);
        } else {
          Vibration.vibrate(200);
          shakeError();
          setError('PIN-коды не совпадают');
          setIsConfirming(false);
          setFirstPin('');
          setPinValue('');
        }
      }
    }
  };

  const handleDelete = () => {
    setPinValue(prev => prev.slice(0, -1));
    setError('');
  };

  const handleReset = useCallback(() => {
    if (isConfirming) {
      setIsConfirming(false);
      setFirstPin('');
    }
    setPinValue('');
    setError('');
  }, [isConfirming]);

  const subtitle = hasPin
    ? 'Введите PIN-код'
    : isConfirming
      ? 'Повторите PIN-код'
      : 'Установите PIN-код';

  const BiometricIcon = Fingerprint;

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center' as const }}>
        <View style={styles.logoWrap}>
          <Image
            source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/10gmvv4g5zd8evsone5fr.png' }}
            style={styles.logoIcon}
          />
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Журнал мастера</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <Animated.View style={[styles.pinDisplay, { transform: [{ translateX: shakeAnim }] }]}>
          {[0, 1, 2, 3].map(i => (
            <Animated.View
              key={i}
              style={[
                styles.pinDot,
                pin.length > i && styles.pinDotFilled,
                { transform: [{ scale: dotScales[i] }] },
              ]}
            />
          ))}
        </Animated.View>

        {error ? <Text style={styles.error}>{error}</Text> : <View style={styles.errorPlaceholder} />}

        <View style={styles.keypad}>
          {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((row, rowIndex) => (
            <View key={rowIndex} style={styles.keypadRow}>
              {row.map(num => (
                <TouchableOpacity
                  key={num}
                  style={styles.keypadButton}
                  onPress={() => handleNumberPress(num)}
                  disabled={isLoading}
                  activeOpacity={0.6}
                >
                  <Text style={styles.keypadNumber}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <View style={styles.keypadRow}>
            <TouchableOpacity style={styles.keypadButton} onPress={handleReset} activeOpacity={0.6}>
              <RotateCcw size={22} color={colors.primary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.keypadButton}
              onPress={() => handleNumberPress('0')}
              disabled={isLoading}
              activeOpacity={0.6}
            >
              <Text style={styles.keypadNumber}>0</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.keypadButton} onPress={handleDelete} activeOpacity={0.6}>
              <Delete size={24} color={colors.textSecondary} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>
        </View>

        {hasPin && biometricAvailable && biometricEnabled && Platform.OS !== 'web' && (
          <TouchableOpacity
            style={styles.biometricButton}
            onPress={handleBiometric}
            activeOpacity={0.7}
          >
            <BiometricIcon size={24} color={colors.primary} />
            <Text style={styles.biometricText}>
  {'Войти по отпечатку пальца'}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    logoWrap: {
      marginBottom: 24,
    },
    logoIcon: {
      width: 160,
      height: 160,
      borderRadius: 40,
    },
    header: {
      alignItems: 'center' as const,
      marginBottom: 36,
    },
    title: {
      fontSize: 30,
      fontWeight: '700' as const,
      color: colors.text,
      marginBottom: 8,
      letterSpacing: 0.3,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      letterSpacing: 0.2,
    },
    pinDisplay: {
      flexDirection: 'row' as const,
      gap: 20,
      marginBottom: 28,
    },
    pinDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.textMuted,
      backgroundColor: 'transparent',
    },
    pinDotFilled: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    error: {
      color: colors.error,
      fontSize: 14,
      marginBottom: 20,
      height: 20,
    },
    errorPlaceholder: {
      height: 20,
      marginBottom: 20,
    },
    keypad: {
      width: '100%',
      maxWidth: 280,
    },
    keypadRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-around',
      marginBottom: 14,
    },
    keypadButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    keypadNumber: {
      fontSize: 26,
      fontWeight: '500' as const,
      color: colors.text,
    },
    biometricButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      marginTop: 20,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 16,
      backgroundColor: colors.primary + '15',
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    biometricText: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.primary,
    },
  });
}
