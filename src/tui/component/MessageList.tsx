import React from "react"
import { Box, Text } from "ink"
import type { Message } from "../../shared/types.js"

interface MessageListProps {
  messages: Message[]
  streamingText: string
}

export function MessageList({ messages, streamingText }: MessageListProps) {
  return (
    <Box flexDirection="column" flexGrow={1} overflowY="hidden">
      {messages.map((msg) => (
        <Box key={msg.id} marginBottom={0}>
          <Text color={msg.role === "user" ? "cyan" : "green"} bold>
            {msg.role === "user" ? "You" : "Assistant"}
          </Text>
          <Text>: {msg.content}</Text>
        </Box>
      ))}
      {streamingText && (
        <Box>
          <Text color="green" bold>
            Assistant
          </Text>
          <Text>: {streamingText}...</Text>
        </Box>
      )}
    </Box>
  )
}
