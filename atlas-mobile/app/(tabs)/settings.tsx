import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { useSettings } from '../../src/hooks/useSettings';
import { useAtlasStore } from '../../src/state/store';

export default function SettingsScreen() {
  const { serverUrl, recordingMode, saveServerUrl, saveRecordingMode } =
    useSettings();
  const connectionStatus = useAtlasStore((s) => s.connectionStatus);

  const [urlInput, setUrlInput] = useState(serverUrl);
  const [testing, setTesting] = useState(false);

  const handleSaveUrl = useCallback(async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Server URL cannot be empty');
      return;
    }
    await saveServerUrl(trimmed);
    Alert.alert('Saved', 'Server URL updated. Reconnecting...');
  }, [urlInput, saveServerUrl]);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    try {
      // Quick WS connect test
      const ws = new WebSocket(urlInput.trim());
      const timeout = setTimeout(() => {
        ws.close();
        setTesting(false);
        Alert.alert('Timeout', 'Connection timed out after 5 seconds');
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        ws.close();
        setTesting(false);
        Alert.alert('Success', 'Connected to Atlas server!');
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        setTesting(false);
        Alert.alert('Failed', 'Could not connect to server');
      };
    } catch (e) {
      setTesting(false);
      Alert.alert('Error', `Connection test failed: ${e}`);
    }
  }, [urlInput]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0f172a' }}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* Server URL */}
      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            color: '#f8fafc',
            fontSize: 16,
            fontWeight: '600',
            marginBottom: 8,
          }}
        >
          Server URL
        </Text>
        <TextInput
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder="ws://100.x.x.x:8000/api/v1/ws/orchestrated"
          placeholderTextColor="#475569"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            borderRadius: 8,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 14,
            borderWidth: 1,
            borderColor: '#334155',
            marginBottom: 10,
          }}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={handleSaveUrl}
            style={{
              flex: 1,
              backgroundColor: '#3b82f6',
              borderRadius: 8,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
          </Pressable>
          <Pressable
            onPress={handleTestConnection}
            disabled={testing}
            style={{
              flex: 1,
              backgroundColor: testing ? '#334155' : '#1e293b',
              borderRadius: 8,
              paddingVertical: 12,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#334155',
            }}
          >
            <Text style={{ color: '#f8fafc', fontWeight: '500' }}>
              {testing ? 'Testing...' : 'Test Connection'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Recording Mode */}
      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            color: '#f8fafc',
            fontSize: 16,
            fontWeight: '600',
            marginBottom: 8,
          }}
        >
          Recording Mode
        </Text>
        <View
          style={{
            backgroundColor: '#1e293b',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#334155',
            overflow: 'hidden',
          }}
        >
          <Pressable
            onPress={() => saveRecordingMode('push-to-talk')}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 14,
              backgroundColor:
                recordingMode === 'push-to-talk' ? '#334155' : 'transparent',
            }}
          >
            <View>
              <Text style={{ color: '#f8fafc', fontSize: 14, fontWeight: '500' }}>
                Push to Talk
              </Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                Hold the button while speaking
              </Text>
            </View>
            {recordingMode === 'push-to-talk' && (
              <Text style={{ color: '#3b82f6', fontSize: 16 }}>✓</Text>
            )}
          </Pressable>
          <View style={{ height: 1, backgroundColor: '#334155' }} />
          <Pressable
            onPress={() => saveRecordingMode('hands-free')}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 14,
              paddingVertical: 14,
              backgroundColor:
                recordingMode === 'hands-free' ? '#334155' : 'transparent',
            }}
          >
            <View>
              <Text style={{ color: '#f8fafc', fontSize: 14, fontWeight: '500' }}>
                Hands-free
              </Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                Auto-record on connection
              </Text>
            </View>
            {recordingMode === 'hands-free' && (
              <Text style={{ color: '#3b82f6', fontSize: 16 }}>✓</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Status */}
      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            color: '#f8fafc',
            fontSize: 16,
            fontWeight: '600',
            marginBottom: 8,
          }}
        >
          Status
        </Text>
        <View
          style={{
            backgroundColor: '#1e293b',
            borderRadius: 8,
            padding: 14,
            borderWidth: 1,
            borderColor: '#334155',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <Text style={{ color: '#94a3b8', fontSize: 13 }}>Connection</Text>
            <Text
              style={{
                color:
                  connectionStatus === 'connected' ? '#22c55e' : '#ef4444',
                fontSize: 13,
                fontWeight: '500',
              }}
            >
              {connectionStatus}
            </Text>
          </View>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ color: '#94a3b8', fontSize: 13 }}>Server</Text>
            <Text
              style={{ color: '#64748b', fontSize: 13 }}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {serverUrl}
            </Text>
          </View>
        </View>
      </View>

      {/* About */}
      <View
        style={{
          backgroundColor: '#1e293b',
          borderRadius: 8,
          padding: 14,
          borderWidth: 1,
          borderColor: '#334155',
        }}
      >
        <Text style={{ color: '#f8fafc', fontSize: 14, fontWeight: '600' }}>
          Atlas Mobile
        </Text>
        <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
          Voice assistant client for Atlas Brain
        </Text>
        <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
          v1.0.0
        </Text>
      </View>
    </ScrollView>
  );
}
