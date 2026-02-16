import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAtlasStore } from '../state/store';
import { STORAGE_KEYS, DEFAULT_SERVER_URL } from '../utils/constants';
import type { RecordingMode } from '../types';

/**
 * Load persisted settings from AsyncStorage on mount,
 * and provide save functions.
 */
export function useSettings() {
  const { serverUrl, setServerUrl, recordingMode, setRecordingMode } = useAtlasStore();

  // Load on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedUrl, savedMode] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.SERVER_URL),
          AsyncStorage.getItem(STORAGE_KEYS.RECORDING_MODE),
        ]);
        if (savedUrl) setServerUrl(savedUrl);
        if (savedMode) setRecordingMode(savedMode as RecordingMode);
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }
    })();
  }, []);

  const saveServerUrl = async (url: string) => {
    setServerUrl(url);
    await AsyncStorage.setItem(STORAGE_KEYS.SERVER_URL, url);
  };

  const saveRecordingMode = async (mode: RecordingMode) => {
    setRecordingMode(mode);
    await AsyncStorage.setItem(STORAGE_KEYS.RECORDING_MODE, mode);
  };

  return {
    serverUrl,
    recordingMode,
    saveServerUrl,
    saveRecordingMode,
  };
}
