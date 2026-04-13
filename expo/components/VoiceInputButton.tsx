import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Animated,
  View,
  Text,
  ActivityIndicator,
} from 'react-native';
import { Mic, Square } from 'lucide-react-native';
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from 'expo-audio';
import { useThemeColors } from '@/providers/ThemeProvider';

const STT_URL = 'https://toolkit.rork.com/stt/transcribe/';

interface VoiceInputButtonProps {
  onResult: (text: string) => void;
  size?: number;
  style?: any;
}

export function VoiceInputButton({ onResult, size = 44, style }: VoiceInputButtonProps) {
  const colors = useThemeColors();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const webRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      if (webStreamRef.current) {
        webStreamRef.current.getTracks().forEach(track => track.stop());
        webStreamRef.current = null;
      }
    };
  }, []);

  const startPulse = useCallback(() => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    if (pulseLoop.current) {
      pulseLoop.current.stop();
      pulseLoop.current = null;
    }
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const sendAudioToSTT = useCallback(async (formData: FormData): Promise<string | null> => {
    try {
      console.log('[VoiceInput] Sending audio to STT...');
      const response = await fetch(STT_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[VoiceInput] STT error:', response.status, errorText);
        throw new Error(`STT error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[VoiceInput] STT result:', data);
      return data.text || null;
    } catch (error) {
      console.error('[VoiceInput] STT request failed:', error);
      throw error;
    }
  }, []);

  const startRecordingNative = useCallback(async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert('Нет доступа', 'Разрешите доступ к микрофону в настройках устройства');
        return false;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      console.log('[VoiceInput] Native recording started');
      return true;
    } catch (error) {
      console.error('[VoiceInput] Failed to start native recording:', error);
      Alert.alert('Ошибка', 'Не удалось начать запись');
      return false;
    }
  }, [audioRecorder]);

  const stopRecordingNative = useCallback(async (): Promise<FormData | null> => {
    try {
      await audioRecorder.stop();
      await setAudioModeAsync({ allowsRecording: false });

      const uri = audioRecorder.uri;

      if (!uri) {
        console.error('[VoiceInput] No recording URI');
        return null;
      }

      console.log('[VoiceInput] Recording stopped, URI:', uri);

      const uriParts = uri.split('.');
      const fileType = uriParts[uriParts.length - 1];

      const formData = new FormData();
      const audioFile = {
        uri,
        name: `recording.${fileType}`,
        type: `audio/${fileType}`,
      };
      formData.append('audio', audioFile as any);
      formData.append('language', 'ru');

      return formData;
    } catch (error) {
      console.error('[VoiceInput] Failed to stop native recording:', error);
      return null;
    }
  }, [audioRecorder]);

  const startRecordingWeb = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      webStreamRef.current = stream;
      webChunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      webRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          webChunksRef.current.push(e.data);
        }
      };

      recorder.start();
      console.log('[VoiceInput] Web recording started');
      return true;
    } catch (error) {
      console.error('[VoiceInput] Failed to start web recording:', error);
      Alert.alert('Ошибка', 'Не удалось получить доступ к микрофону');
      return false;
    }
  }, []);

  const stopRecordingWeb = useCallback(async (): Promise<FormData | null> => {
    return new Promise((resolve) => {
      const recorder = webRecorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(webChunksRef.current, { type: 'audio/webm' });
        webChunksRef.current = [];

        if (webStreamRef.current) {
          webStreamRef.current.getTracks().forEach(track => track.stop());
          webStreamRef.current = null;
        }
        webRecorderRef.current = null;

        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');
        formData.append('language', 'ru');

        console.log('[VoiceInput] Web recording stopped, blob size:', blob.size);
        resolve(formData);
      };

      recorder.stop();
    });
  }, []);

  const handlePress = useCallback(async () => {
    if (isProcessing) return;

    if (isRecording) {
      setIsRecording(false);
      stopPulse();
      setIsProcessing(true);

      try {
        let formData: FormData | null = null;

        if (Platform.OS === 'web') {
          formData = await stopRecordingWeb();
        } else {
          formData = await stopRecordingNative();
        }

        if (!formData) {
          Alert.alert('Ошибка', 'Не удалось получить аудио');
          return;
        }

        const text = await sendAudioToSTT(formData);
        if (text && text.trim()) {
          onResult(text.trim());
        } else {
          Alert.alert('Не удалось распознать', 'Попробуйте говорить чётче и ближе к микрофону');
        }
      } catch {
        Alert.alert('Ошибка', 'Не удалось распознать речь. Проверьте интернет-соединение.');
      } finally {
        setIsProcessing(false);
      }
    } else {
      let started = false;
      if (Platform.OS === 'web') {
        started = await startRecordingWeb();
      } else {
        started = await startRecordingNative();
      }

      if (started) {
        setIsRecording(true);
        startPulse();
      }
    }
  }, [
    isRecording,
    isProcessing,
    onResult,
    startRecordingNative,
    stopRecordingNative,
    startRecordingWeb,
    stopRecordingWeb,
    sendAudioToSTT,
    startPulse,
    stopPulse,
  ]);

  const buttonSize = size;
  const iconSize = Math.round(size * 0.48);

  const statusText = isRecording ? 'Говорите...' : isProcessing ? 'Распознаю...' : null;
  const statusColor = isRecording ? colors.error : colors.textSecondary;

  return (
    <View style={[styles.wrapper, style]}>
      <View style={styles.buttonContainer}>
        {isRecording && (
          <Animated.View
            style={[
              styles.pulseRing,
              {
                width: buttonSize + 16,
                height: buttonSize + 16,
                borderRadius: (buttonSize + 16) / 2,
                backgroundColor: colors.error + '30',
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
        )}
        <TouchableOpacity
          onPress={handlePress}
          disabled={isProcessing}
          activeOpacity={0.7}
          style={[
            styles.button,
            {
              width: buttonSize,
              height: buttonSize,
              borderRadius: buttonSize / 2,
              backgroundColor: isRecording ? colors.error : colors.primary,
            },
          ]}
          testID="voice-input-button"
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : isRecording ? (
            <Square size={iconSize} color="#fff" fill="#fff" />
          ) : (
            <Mic size={iconSize} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
      {statusText && (
        <Text
          style={[styles.recordingLabel, { color: statusColor }]}
          numberOfLines={1}
        >
          {statusText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  recordingLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    marginTop: 4,
  },
});
