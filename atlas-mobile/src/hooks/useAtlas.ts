import { useEffect, useRef, useCallback } from 'react';
import { useAtlasStore } from '../state/store';

/**
 * WebSocket connection to the Atlas orchestrated endpoint.
 * Handles reconnection, message parsing, and state updates.
 */
export function useAtlas() {
  const {
    serverUrl,
    setConnectionStatus,
    setStatus,
    setTranscript,
    setResponse,
    setPendingAudioBase64,
    addTurn,
    reset,
  } = useAtlasStore();

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;

  const connect = useCallback(() => {
    if (
      ws.current &&
      (ws.current.readyState === WebSocket.OPEN ||
        ws.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (!serverUrl) return;

    setConnectionStatus('connecting');
    ws.current = new WebSocket(serverUrl);
    ws.current.binaryType = 'arraybuffer';

    ws.current.onopen = () => {
      console.log('[Atlas] Connected');
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
    };

    ws.current.onclose = () => {
      console.log('[Atlas] Disconnected');
      setConnectionStatus('disconnected');

      // Auto-reconnect with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = 1000 * Math.pow(2, reconnectAttempts.current);
        console.log(`[Atlas] Reconnecting in ${delay}ms`);
        reconnectTimer.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    };

    ws.current.onerror = (e) => {
      console.error('[Atlas] WebSocket error:', e);
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.state) {
          case 'idle':
            setStatus('idle');
            break;
          case 'recording':
            setStatus('listening');
            break;
          case 'transcript':
            setTranscript(data.text || '');
            break;
          case 'transcribing':
          case 'processing':
            setStatus('processing');
            break;
          case 'responding':
            setStatus('speaking');
            break;
          case 'response': {
            setResponse(data.text || '');
            setStatus('speaking');
            // Add to history
            const currentTranscript = useAtlasStore.getState().transcript;
            if (currentTranscript) {
              addTurn({
                id: `user-${Date.now()}`,
                role: 'user',
                text: currentTranscript,
                timestamp: Date.now(),
              });
            }
            if (data.text) {
              addTurn({
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                text: data.text,
                timestamp: Date.now(),
              });
            }
            // Queue audio for playback
            if (data.audio_base64) {
              setPendingAudioBase64(data.audio_base64);
            }
            break;
          }
          case 'error':
            setStatus('error');
            console.error('[Atlas] Error:', data.message);
            break;
        }
      } catch (e) {
        console.error('[Atlas] Parse error:', e);
      }
    };
  }, [serverUrl]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const sendAudio = useCallback((pcmBuffer: ArrayBuffer) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(pcmBuffer);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ command: 'stop_recording' }));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectAttempts.current = maxReconnectAttempts; // Prevent reconnect
    ws.current?.close();
  }, []);

  return {
    connect,
    disconnect,
    sendAudio,
    stopRecording,
  };
}
