export type AtlasState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export type RecordingMode = 'push-to-talk' | 'hands-free';

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface AudioAnalysis {
  volume: number;
  isActive: boolean;
}

export interface AtlasStore {
  // Connection
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // Pipeline state
  status: AtlasState;
  setStatus: (status: AtlasState) => void;

  // Current conversation
  transcript: string;
  setTranscript: (text: string) => void;
  response: string;
  setResponse: (text: string) => void;

  // History
  history: ConversationTurn[];
  addTurn: (turn: ConversationTurn) => void;
  clearHistory: () => void;

  // Audio
  audioAnalysis: AudioAnalysis;
  setAudioAnalysis: (analysis: AudioAnalysis) => void;
  pendingAudioBase64: string | null;
  setPendingAudioBase64: (b64: string | null) => void;

  // Settings
  serverUrl: string;
  setServerUrl: (url: string) => void;
  recordingMode: RecordingMode;
  setRecordingMode: (mode: RecordingMode) => void;

  // Reset
  reset: () => void;
}
