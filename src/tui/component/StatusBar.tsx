import React from "react"
import { Box, Text } from "ink"

interface StatusBarProps {
  model?: string
  loading: boolean
}

export function StatusBar({ model, loading }: StatusBarProps) {
  return (
    <Box justifyContent="space-between">
      <Text dimColor color="gray">
        {model ?? "gpt-4o"}
      </Text>
      <Text color={loading ? "yellow" : "green"}>{loading ? "Thinking..." : "Ready"}</Text>
      <Text dimColor color="gray">
        Ctrl+N: New | Enter: Send
      </Text>
    </Box>
  )
}
