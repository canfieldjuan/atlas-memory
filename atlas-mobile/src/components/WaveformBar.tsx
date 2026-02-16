import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { useAtlasStore } from '../state/store';

const BAR_COUNT = 20;

export function WaveformBar() {
  const { volume, isActive } = useAtlasStore((s) => s.audioAnalysis);
  const bars = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(4))
  ).current;

  useEffect(() => {
    if (!isActive) {
      // Reset all bars
      bars.forEach((bar) => {
        Animated.timing(bar, {
          toValue: 4,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
      return;
    }

    // Animate bars based on volume
    bars.forEach((bar, i) => {
      const distance = Math.abs(i - BAR_COUNT / 2) / (BAR_COUNT / 2);
      const height = Math.max(4, (volume / 100) * 40 * (1 - distance * 0.6));
      // Add slight randomness
      const jitter = Math.random() * 8;

      Animated.timing(bar, {
        toValue: height + jitter,
        duration: 100,
        useNativeDriver: false,
      }).start();
    });
  }, [volume, isActive]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 48,
        gap: 2,
      }}
    >
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height: bar,
            backgroundColor: '#3b82f6',
            borderRadius: 1.5,
          }}
        />
      ))}
    </View>
  );
}
