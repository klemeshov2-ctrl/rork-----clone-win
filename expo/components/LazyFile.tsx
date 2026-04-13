import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Image, Alert } from 'react-native';
import { Download, AlertCircle, RefreshCw } from 'lucide-react-native';
import { useThemeColors } from '@/providers/ThemeProvider';

import { ensureFileLocal, isRemoteUrl } from '@/lib/fileManager';
import { useBackup } from '@/providers/BackupProvider';

interface LazyImageProps {
  uri: string;
  style?: any;
  onPress?: () => void;
  onResolved?: (localUri: string) => void;
}

export function LazyImage({ uri, style, onPress, onResolved }: LazyImageProps) {
  const colors = useThemeColors();
  const { accessToken, activeMasterPublicUrl } = useBackup();
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const needsDownload = isRemoteUrl(uri) || uri.startsWith('yadisk://');

  const resolve = useCallback(async () => {
    if (!uri) return;
    if (!needsDownload) {
      setResolvedUri(uri);
      onResolved?.(uri);
      return;
    }
    setIsLoading(true);
    setError(false);
    try {
      const localPath = await ensureFileLocal(uri, accessToken, activeMasterPublicUrl);
      setResolvedUri(localPath);
      onResolved?.(localPath);
    } catch (e: any) {
      console.log('[LazyImage] Failed to resolve:', uri, e);
      setError(true);
      Alert.alert(
        'Ошибка загрузки изображения',
        `Не удалось загрузить файл.\nСсылка: ${uri}\nОшибка: ${e?.message || 'Неизвестная ошибка'}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [uri, accessToken, activeMasterPublicUrl, needsDownload, onResolved]);

  useEffect(() => {
    if (!needsDownload) {
      setResolvedUri(uri);
      return;
    }
    void resolve();
  }, [uri, needsDownload, resolve]);

  if (isLoading) {
    return (
      <View style={[style, styles.placeholder, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Загрузка...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <TouchableOpacity
        style={[style, styles.placeholder, { backgroundColor: colors.surface }]}
        onPress={resolve}
        activeOpacity={0.7}
      >
        <RefreshCw size={16} color={colors.textMuted} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Повторить</Text>
      </TouchableOpacity>
    );
  }

  if (!resolvedUri) {
    return (
      <View style={[style, styles.placeholder, { backgroundColor: colors.surface }]}>
        <Download size={16} color={colors.textMuted} />
      </View>
    );
  }

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <Image source={{ uri: resolvedUri }} style={style} />
      </TouchableOpacity>
    );
  }

  return <Image source={{ uri: resolvedUri }} style={style} />;
}

interface LazyFileResolverProps {
  fileRef: string;
  children: (state: { resolvedUri: string | null; isLoading: boolean; error: boolean; retry: () => void }) => React.ReactNode;
}

export function LazyFileResolver({ fileRef, children }: LazyFileResolverProps) {
  const { accessToken, activeMasterPublicUrl } = useBackup();
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const needsDownload = isRemoteUrl(fileRef) || fileRef.startsWith('yadisk://');

  const resolve = useCallback(async () => {
    if (!fileRef) return;
    if (!needsDownload) {
      setResolvedUri(fileRef);
      return;
    }
    setIsLoading(true);
    setError(false);
    try {
      const localPath = await ensureFileLocal(fileRef, accessToken, activeMasterPublicUrl);
      setResolvedUri(localPath);
    } catch (e: any) {
      console.log('[LazyFileResolver] Failed to resolve:', fileRef, e);
      setError(true);
      Alert.alert(
        'Ошибка загрузки файла',
        `Не удалось загрузить файл.\nСсылка: ${fileRef}\nОшибка: ${e?.message || 'Неизвестная ошибка'}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [fileRef, accessToken, activeMasterPublicUrl, needsDownload]);

  useEffect(() => {
    if (!needsDownload) {
      setResolvedUri(fileRef);
      return;
    }
  }, [fileRef, needsDownload]);

  return <>{children({ resolvedUri, isLoading, error, retry: resolve })}</>;
}

interface FileDownloadButtonProps {
  fileRef: string;
  fileName: string;
  onFileReady: (localPath: string) => void;
}

export function FileDownloadButton({ fileRef, fileName: _fileName, onFileReady }: FileDownloadButtonProps) {
  const colors = useThemeColors();
  const { accessToken, activeMasterPublicUrl } = useBackup();
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState(false);

  const needsDownload = isRemoteUrl(fileRef) || fileRef.startsWith('yadisk://');

  const handleDownload = useCallback(async () => {
    if (!needsDownload) {
      onFileReady(fileRef);
      return;
    }
    setIsDownloading(true);
    setError(false);
    try {
      const localPath = await ensureFileLocal(fileRef, accessToken, activeMasterPublicUrl);
      onFileReady(localPath);
    } catch (e: any) {
      console.log('[FileDownloadButton] Download failed:', e);
      setError(true);
      Alert.alert(
        'Ошибка скачивания',
        `Не удалось скачать файл.\nСсылка: ${fileRef}\nОшибка: ${e?.message || 'Неизвестная ошибка'}`
      );
    } finally {
      setIsDownloading(false);
    }
  }, [fileRef, accessToken, activeMasterPublicUrl, needsDownload, onFileReady]);

  if (!needsDownload) return null;

  return (
    <TouchableOpacity
      style={[styles.downloadBtn, { backgroundColor: colors.primary + '20' }]}
      onPress={handleDownload}
      disabled={isDownloading}
      activeOpacity={0.7}
    >
      {isDownloading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : error ? (
        <AlertCircle size={16} color={colors.error} />
      ) : (
        <Download size={16} color={colors.primary} />
      )}
      <Text style={[styles.downloadText, { color: isDownloading ? colors.textMuted : colors.primary }]}>
        {isDownloading ? 'Загрузка...' : error ? 'Ошибка. Повторить' : 'Скачать'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 8,
    gap: 4,
  },
  loadingText: {
    fontSize: 10,
    marginTop: 2,
  },
  downloadBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  downloadText: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
});
