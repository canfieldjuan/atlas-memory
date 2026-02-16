import { create } from 'zustand';
import type { AtlasStore } from '../types';
import { DEFAULT_SERVER_URL } from '../utils/constants';

export const useAtlasStore = create<AtlasStore>((set) => ({
  // Connection
  connectionStatus: 'disconnected',
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  // Pipeline state
  status: 'idle',
  setStatus: (status) => set({ status }),

  // Current conversation
  transcript: '',
  setTranscript: (transcript) => set({ transcript }),
  response: '',
  setResponse: (response) => set({ response }),

  // History
  history: [],
  addTurn: (turn) =>
    set((state) => ({ history: [...state.history, turn] })),
  clearHistory: () => set({ history: [] }),

  // Audio
  audioAnalysis: { volume: 0, isActive: false },
  setAudioAnalysis: (audioAnalysis) => set({ audioAnalysis }),
  pendingAudioBase64: null,
  setPendingAudioBase64: (pendingAudioBase64) => set({ pendingAudioBase64 }),

  // Settings
  serverUrl: DEFAULT_SERVER_URL,
  setServerUrl: (serverUrl) => set({ serverUrl }),
  recordingMode: 'push-to-talk',
  setRecordingMode: (recordingMode) => set({ recordingMode }),

  // Reset
  reset: () =>
    set({
      status: 'idle',
      transcript: '',
      response: '',
      audioAnalysis: { volume: 0, isActive: false },
    }),
}));
