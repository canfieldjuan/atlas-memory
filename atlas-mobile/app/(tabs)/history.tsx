import React from 'react';
import { View, Text, FlatList, Pressable, Alert } from 'react-native';
import { useAtlasStore } from '../../src/state/store';
import type { ConversationTurn } from '../../src/types';

export default function HistoryScreen() {
  const history = useAtlasStore((s) => s.history);
  const clearHistory = useAtlasStore((s) => s.clearHistory);

  const handleClear = () => {
    Alert.alert(
      'Clear History',
      'Are you sure you want to clear all conversation history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: clearHistory,
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: ConversationTurn }) => (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <Text
          style={{
            color: item.role === 'user' ? '#3b82f6' : '#22c55e',
            fontSize: 12,
            fontWeight: '600',
            textTransform: 'uppercase',
          }}
        >
          {item.role === 'user' ? 'You' : 'Atlas'}
        </Text>
        <Text style={{ color: '#64748b', fontSize: 11 }}>
          {new Date(item.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
      <Text style={{ color: '#f8fafc', fontSize: 14, lineHeight: 20 }}>
        {item.text}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      {history.length === 0 ? (
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#475569', fontSize: 40, marginBottom: 12 }}>
            📋
          </Text>
          <Text style={{ color: '#475569', fontSize: 16 }}>
            No conversation history yet
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
          />
          <Pressable
            onPress={handleClear}
            style={{
              margin: 16,
              paddingVertical: 12,
              backgroundColor: '#1e293b',
              borderRadius: 8,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#334155',
            }}
          >
            <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '500' }}>
              Clear History
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
