import React from "react"
import { Box, Text } from "ink"
import { theme } from "../context/theme.js"

interface StatusBarProps {
  model?: string
  loading: boolean
  /** session 状态 */
  status?: "idle" | "working" | "compacting"
  /** agent 名称 */
  agent?: string
}

export function StatusBar({ model, loading, status, agent }: StatusBarProps) {
  const modelLabel = model ?? "default"
  const sessionStatus = loading ? "working" : (status ?? "idle")

  const statusColor = sessionStatus === "working" ? theme.warning
    : sessionStatus === "compacting" ? theme.info
    : theme.textMuted

  const statusText = sessionStatus === "working" ? "Thinking..."
    : sessionStatus === "compacting" ? "Compacting..."
    : "Ready"

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box flexDirection="row" gap={2}>
        {agent && <Text color={theme.secondary}>{agent}</Text>}
        <Text dimColor color={theme.textMuted}>{modelLabel}</Text>
      </Box>
      <Box flexDirection="row" gap={2}>
        <Text color={statusColor}>{statusText}</Text>
      </Box>
      <Text dimColor color={theme.textMuted}>
        Ctrl+N: New | Ctrl+L: Sessions | Ctrl+P: Cmds
      </Text>
    </Box>
  )
}
