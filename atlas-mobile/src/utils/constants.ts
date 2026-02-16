export const DEFAULT_SERVER_URL = 'ws://localhost:8000/api/v1/ws/orchestrated';

export const AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  encoding: 'pcm_16bit' as const,
  interval: 100, // ms between audio callbacks
};

export const STORAGE_KEYS = {
  SERVER_URL: '@atlas/server-url',
  RECORDING_MODE: '@atlas/recording-mode',
};
