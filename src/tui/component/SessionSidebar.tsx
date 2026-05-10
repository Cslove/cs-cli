// 对标 opencode session/sidebar.tsx —— 会话侧边栏
import React, { useMemo } from "react"
import { Box, Text } from "ink"
import { theme } from "../context/theme.js"
import { useSync } from "../context/sync.js"

interface SidebarProps {
  sessionID: string
  overlay?: boolean
}

export function SessionSidebar({ sessionID, overlay }: SidebarProps) {
  const sync = useSync()
  const session = useMemo(() => sync.data.session.find(s => s.id === sessionID), [sync.data.session, sessionID])

  if (!session) return null

  return (
    <Box
      backgroundColor={theme.backgroundPanel}
      width={42}
      height="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="column"
    >
      {/* 标题区域 */}
      <Box flexDirection="column" gap={1} flexGrow={1}>
        <Box paddingRight={1}>
          <Text bold color={theme.text}>{session.title}</Text>
        </Box>

        {session.workspace_id && (
          <Text color={theme.textMuted}>
            <Text color={theme.success}>●</Text> Workspace
          </Text>
        )}

        {session.share?.url && (
          <Text color={theme.textMuted}>{session.share.url}</Text>
        )}

        {/* 会话信息 */}
        {session.time && (
          <Text color={theme.textMuted}>
            Created {formatDate(session.time.created)}
          </Text>
        )}
      </Box>

      {/* Footer */}
      <Box flexShrink={0} gap={1} paddingTop={1}>
        <Text color={theme.textMuted}>
          <Text color={theme.success}>•</Text> <Text bold>Open</Text>
          <Text bold color={theme.text}>Code</Text>
        </Text>
      </Box>
    </Box>
  )
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}
