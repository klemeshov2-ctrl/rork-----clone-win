import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { useThemeColors } from '@/providers/ThemeProvider';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const colors = useThemeColors();

  const variantStyles: Record<string, ViewStyle> = {
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
    danger: { backgroundColor: colors.error },
    ghost: { backgroundColor: 'transparent' },
  };

  const variantTextStyles: Record<string, TextStyle> = {
    primary: { color: colors.text },
    secondary: { color: colors.text },
    danger: { color: colors.text },
    ghost: { color: colors.primary },
  };

  const sizeStyles: Record<string, ViewStyle> = {
    small: { paddingVertical: 8, paddingHorizontal: 12 },
    medium: { paddingVertical: 14, paddingHorizontal: 20 },
    large: { paddingVertical: 18, paddingHorizontal: 28 },
  };

  const sizeTextStyles: Record<string, TextStyle> = {
    small: { fontSize: 14 },
    medium: { fontSize: 16 },
    large: { fontSize: 18 },
  };

  const buttonStyles: (ViewStyle | undefined)[] = [
    styles.base,
    variantStyles[variant],
    sizeStyles[size],
    (disabled || loading) ? styles.disabled : undefined,
    style,
  ];

  const textStyles: (TextStyle | undefined)[] = [
    styles.text,
    variantTextStyles[variant],
    sizeTextStyles[size],
    textStyle,
  ];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={buttonStyles}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.text : colors.primary} />
      ) : (
        <>
          {icon}
          <Text style={textStyles}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    gap: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});
