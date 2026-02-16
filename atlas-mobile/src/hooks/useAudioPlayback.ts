import { useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { writeBase64WavToFile } from '../utils/audio';
import { useAtlasStore } from '../state/store';

/**
 * Play base64-encoded WAV audio responses.
 */
export function useAudioPlayback() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const { setStatus, setAudioAnalysis } = useAtlasStore();

  const playAudio = useCallback(async (base64Wav: string) => {
    try {
      // Stop any current playback
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      // Write to temp file (synchronous in new expo-file-system)
      const uri = writeBase64WavToFile(base64Wav);

      // Create and play
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
      );
      soundRef.current = sound;

      // Monitor playback status
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;

        if (status.didJustFinish) {
          setStatus('idle');
          setAudioAnalysis({ volume: 0, isActive: false });
          sound.unloadAsync();
          soundRef.current = null;

          // Re-enable recording mode
          Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
          });
        }
      });
    } catch (e) {
      console.error('[Playback] Error:', e);
      setStatus('idle');
    }
  }, []);

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setAudioAnalysis({ volume: 0, isActive: false });
  }, []);

  return { playAudio, stopPlayback };
}
