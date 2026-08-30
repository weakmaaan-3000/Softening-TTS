import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  style?: ViewStyle;
};

export function ActionButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? '#FFFFFF' : '#1F4B7A'}
        />
      ) : null}
      <Text
        style={[
          styles.label,
          variant === 'primary' ? styles.primaryLabel : styles.secondaryLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primary: {
    backgroundColor: '#1F4B7A',
  },
  secondary: {
    backgroundColor: '#EDF4FA',
    borderWidth: 1,
    borderColor: '#B8CEE1',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
  primaryLabel: {
    color: '#FFFFFF',
  },
  secondaryLabel: {
    color: '#1F4B7A',
  },
});
