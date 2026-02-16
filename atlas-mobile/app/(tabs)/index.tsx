import React, { useRef, useEffect, useCallback } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useAtlas } from '../../src/hooks/useAtlas';
import { useAudioCapture } from '../../src/hooks/useAudioCapture';
import { useAudioPlayback } from '../../src/hooks/useAudioPlayback';
import { useSettings } from '../../src/hooks/useSettings';
import { useAtlasStore } from '../../src/state/store';
import { ConnectionStatus } from '../../src/components/ConnectionStatus';
import { StateIndicator } from '../../src/components/StateIndicator';
import { WaveformBar } from '../../src/components/WaveformBar';
import { ConversationBubble } from '../../src/components/ConversationBubble';
import { RecordButton } from '../../src/components/RecordButton';

export default function ConversationScreen() {
  // Load persisted settings
  useSettings();

  const { sendAudio, stopRecording } = useAtlas();
  const { startCapture, stopCapture, isRecording } = useAudioCapture(sendAudio);
  const { playAudio, stopPlayback } = useAudioPlayback();

  const scrollRef = useRef<ScrollView>(null);

  const status = useAtlasStore((s) => s.status);
  const transcript = useAtlasStore((s) => s.transcript);
  const response = useAtlasStore((s) => s.response);
  const history = useAtlasStore((s) => s.history);
  const pendingAudioBase64 = useAtlasStore((s) => s.pendingAudioBase64);
  const setPendingAudioBase64 = useAtlasStore((s) => s.setPendingAudioBase64);

  // Auto-play audio when a response arrives with audio_base64
  useEffect(() => {
    if (pendingAudioBase64) {
      playAudio(pendingAudioBase64);
      setPendingAudioBase64(null);
    }
  }, [pendingAudioBase64]);

  // Auto-scroll on new history items
  useEffect(() => {
    if (history.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [history.length]);

  const handlePressIn = useCallback(async () => {
    await startCapture();
  }, [startCapture]);

  const handlePressOut = useCallback(async () => {
    await stopCapture();
    stopRecording();
  }, [stopCapture, stopRecording]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <ConnectionStatus />
        <StateIndicator />
      </View>

      {/* Live transcript */}
      {transcript && status !== 'idle' ? (
        <View
          style={{
            marginHorizontal: 16,
            marginVertical: 4,
            padding: 10,
            backgroundColor: '#1e293b',
            borderRadius: 8,
            borderLeftWidth: 3,
            borderLeftColor: '#3b82f6',
          }}
        >
          <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 2 }}>
            Transcript
          </Text>
          <Text style={{ color: '#f8fafc', fontSize: 14 }}>{transcript}</Text>
        </View>
      ) : null}

      {/* Conversation history */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 8 }}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
      >
        {history.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 80,
            }}
          >
            <Text style={{ color: '#475569', fontSize: 40, marginBottom: 12 }}>
              🎙
            </Text>
            <Text style={{ color: '#475569', fontSize: 16, fontWeight: '500' }}>
              Hold the button to talk to Atlas
            </Text>
            <Text
              style={{ color: '#334155', fontSize: 13, marginTop: 4 }}
            >
              Your conversations will appear here
            </Text>
          </View>
        ) : (
          history.map((turn) => (
            <ConversationBubble key={turn.id} turn={turn} />
          ))
        )}
      </ScrollView>

      {/* Waveform + Record button */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: '#1e293b',
          paddingBottom: 20,
        }}
      >
        <WaveformBar />
        <RecordButton
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          isRecording={isRecording}
        />
      </View>
    </View>
  );
}
