import { Platform } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
export const isMobile = isIOS || isAndroid;
export const isWindows = isWeb && typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
export const isDesktop = isWindows || (isWeb && typeof navigator !== 'undefined' && /Macintosh|Linux/i.test(navigator.userAgent));
