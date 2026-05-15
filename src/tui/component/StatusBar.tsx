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

  return (
    <Box flexShrink={0} justifyContent="flex-end" paddingX={1}>
      <Text>
        {agent && <Text color={theme.secondary}>{agent} · </Text>}
        <Text dimColor color={theme.textMuted}>{modelLabel}</Text>
        <Text color={statusColor}> · </Text>
        <Text color={statusColor}>
          {sessionStatus === "working" ? "thinking"
            : sessionStatus === "compacting" ? "compacting"
            : "ready"}
        </Text>
      </Text>
    </Box>
  )
}
