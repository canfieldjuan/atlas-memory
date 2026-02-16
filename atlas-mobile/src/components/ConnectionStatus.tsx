import React from 'react';
import { View, Text } from 'react-native';
import { useAtlasStore } from '../state/store';

const STATUS_COLORS = {
  connected: '#22c55e',
  connecting: '#eab308',
  disconnected: '#ef4444',
};

const STATUS_LABELS = {
  connected: 'Connected',
  connecting: 'Connecting...',
  disconnected: 'Disconnected',
};

export function ConnectionStatus() {
  const connectionStatus = useAtlasStore((s) => s.connectionStatus);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: STATUS_COLORS[connectionStatus],
        }}
      />
      <Text style={{ color: '#94a3b8', fontSize: 12 }}>
        {STATUS_LABELS[connectionStatus]}
      </Text>
    </View>
  );
}
