import React from 'react';
import { View, Text } from 'react-native';
import { useAtlasStore } from '../state/store';

const STATE_LABELS: Record<string, string> = {
  idle: 'Ready',
  listening: 'Listening...',
  processing: 'Processing...',
  speaking: 'Speaking...',
  error: 'Error',
};

const STATE_COLORS: Record<string, string> = {
  idle: '#94a3b8',
  listening: '#3b82f6',
  processing: '#eab308',
  speaking: '#22c55e',
  error: '#ef4444',
};

export function StateIndicator() {
  const status = useAtlasStore((s) => s.status);

  return (
    <View style={{ alignItems: 'center', paddingVertical: 8 }}>
      <Text
        style={{
          color: STATE_COLORS[status] || '#94a3b8',
          fontSize: 16,
          fontWeight: '600',
          letterSpacing: 0.5,
        }}
      >
        {STATE_LABELS[status] || status}
      </Text>
    </View>
  );
}
