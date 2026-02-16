import React from 'react';
import { View, Text } from 'react-native';
import type { ConversationTurn } from '../types';

interface Props {
  turn: ConversationTurn;
}

export function ConversationBubble({ turn }: Props) {
  const isUser = turn.role === 'user';

  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        marginVertical: 4,
        marginHorizontal: 12,
      }}
    >
      <View
        style={{
          backgroundColor: isUser ? '#3b82f6' : '#1e293b',
          borderRadius: 16,
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: '#f8fafc', fontSize: 15, lineHeight: 21 }}>
          {turn.text}
        </Text>
      </View>
      <Text
        style={{
          color: '#64748b',
          fontSize: 11,
          marginTop: 2,
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          marginHorizontal: 4,
        }}
      >
        {new Date(turn.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
}
