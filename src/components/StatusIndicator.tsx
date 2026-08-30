import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type AppStatus = 'idle' | 'converting' | 'complete' | 'error';

const statusMap: Record<
  AppStatus,
  { label: string; dotColor: string; backgroundColor: string }
> = {
  idle: {
    label: '待機中',
    dotColor: '#6B7280',
    backgroundColor: '#F3F4F6',
  },
  converting: {
    label: '変換中',
    dotColor: '#B7791F',
    backgroundColor: '#FFF7E6',
  },
  complete: {
    label: '完了',
    dotColor: '#2F855A',
    backgroundColor: '#ECFDF5',
  },
  error: {
    label: 'エラー',
    dotColor: '#C53030',
    backgroundColor: '#FFF1F2',
  },
};

export function StatusIndicator({ status }: { status: AppStatus }) {
  const item = statusMap[status];

  return (
    <View
      accessibilityLabel={`ステータス: ${item.label}`}
      style={[styles.container, { backgroundColor: item.backgroundColor }]}
    >
      <View style={[styles.dot, { backgroundColor: item.dotColor }]} />
      <Text style={styles.text}>{item.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  text: {
    color: '#263238',
    fontSize: 13,
    fontWeight: '700',
  },
});
