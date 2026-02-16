import React, { useCallback } from 'react';
import { Pressable, View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAtlasStore } from '../state/store';

interface Props {
  onPressIn: () => void;
  onPressOut: () => void;
  isRecording: boolean;
}

export function RecordButton({ onPressIn, onPressOut, isRecording }: Props) {
  const status = useAtlasStore((s) => s.status);
  const connectionStatus = useAtlasStore((s) => s.connectionStatus);
  const isDisabled = connectionStatus !== 'connected' || status === 'processing' || status === 'speaking';

  const handlePressIn = useCallback(() => {
    if (isDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPressIn();
  }, [isDisabled, onPressIn]);

  const handlePressOut = useCallback(() => {
    if (isDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPressOut();
  }, [isDisabled, onPressOut]);

  return (
    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={({ pressed }) => ({
          width: 88,
          height: 88,
          borderRadius: 44,
          backgroundColor: isRecording
            ? '#ef4444'
            : isDisabled
            ? '#334155'
            : pressed
            ? '#2563eb'
            : '#3b82f6',
          alignItems: 'center',
          justifyContent: 'center',
          // Outer ring
          borderWidth: 3,
          borderColor: isRecording ? '#fca5a5' : '#1e40af',
          // Shadow
          shadowColor: isRecording ? '#ef4444' : '#3b82f6',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isRecording ? 0.6 : 0.3,
          shadowRadius: isRecording ? 20 : 10,
          elevation: 8,
        })}
      >
        {isRecording ? (
          // Stop icon (square)
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              backgroundColor: '#fff',
            }}
          />
        ) : (
          // Mic icon (circle)
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: 'rgba(255,255,255,0.9)',
            }}
          />
        )}
      </Pressable>
      <Text
        style={{
          color: '#94a3b8',
          fontSize: 12,
          marginTop: 10,
        }}
      >
        {isRecording ? 'Release to send' : 'Hold to talk'}
      </Text>
    </View>
  );
}
