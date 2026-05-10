// 对标 opencode session/subagent-footer.tsx —— 子 Agent Footer
import React, { useMemo, useState } from "react"
import { Box, Text } from "ink"
import { theme } from "../context/theme.js"
import { useSync } from "../context/sync.js"
import { useCommand } from "../context/command.js"
import { useKeybind } from "../context/keybind.js"
import type { Message } from "../../shared/types.js"

interface SubagentFooterProps {
  sessionID: string
}

export function SubagentFooter({ sessionID }: SubagentFooterProps) {
  const sync = useSync()
  const command = useCommand()
  const keybind = useKeybind()
  const session = useMemo(() => sync.data.session.find(s => s.id === sessionID), [sync.data.session, sessionID])
  const messages = useMemo(() => sync.data.message[sessionID] ?? [], [sync.data.message, sessionID])

  const subagentInfo = useMemo(() => {
    if (!session) return { label: "Subagent", index: 0, total: 0 }
    const agentMatch = session.title.match(/@(\w+)\s*subagent/i)
    const label = agentMatch ? titlecase(agentMatch[1]) : "Subagent"

    if (!session.parent_id) return { label, index: 0, total: 0 }

    const siblings = sync.data.session
      .filter(x => x.parent_id === session.parent_id)
      .sort((a, b) => (a.time?.created ?? a.created_at) - (b.time?.created ?? b.created_at))
    const index = siblings.findIndex(x => x.id === session.id)

    return { label, index: index + 1, total: siblings.length }
  }, [session, sync.data.session])

  const usage = useMemo(() => {
    let lastAssistant: Message | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === "assistant" && (m.tokens?.output ?? 0) > 0) {
        lastAssistant = m
        break
      }
    }
    if (!lastAssistant?.tokens) return undefined

    const tokens = lastAssistant.tokens.input + lastAssistant.tokens.output +
      lastAssistant.tokens.reasoning + lastAssistant.tokens.cache.read + lastAssistant.tokens.cache.write
    if (tokens <= 0) return undefined

    const cost = messages.reduce((sum, m) => sum + (m.role === "assistant" ? (m.cost ?? 0) : 0), 0)
    const costStr = cost > 0 ? `$${cost.toFixed(4)}` : undefined

    return { tokens: `${tokens}`, cost: costStr }
  }, [messages])

  const [hover, setHover] = useState<"parent" | "prev" | "next" | null>(null)

  return (
    <Box flexShrink={0} flexDirection="column">
      <Box
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={1}
        borderStyle="single"
        borderLeft={true}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderLeftColor={theme.border}
        flexShrink={0}
        backgroundColor={theme.backgroundPanel}
      >
        <Box flexDirection="row" justifyContent="space-between" gap={1}>
          {/* 左侧信息 */}
          <Box flexDirection="row" gap={1}>
            <Text bold color={theme.text}>{subagentInfo.label}</Text>
            {subagentInfo.total > 0 && (
              <Text color={theme.textMuted}>
                ({subagentInfo.index} of {subagentInfo.total})
              </Text>
            )}
            {usage && (
              <Text color={theme.textMuted}>
                {[usage.tokens, usage.cost].filter(Boolean).join(" · ")}
              </Text>
            )}
          </Box>

          {/* 右侧导航 */}
          <Box flexDirection="row" gap={2}>
            <Box
              backgroundColor={hover === "parent" ? theme.backgroundElement : undefined}
            >
              <Text color={theme.text}>
                Parent <Text color={theme.textMuted}>{keybind.print("session_parent")}</Text>
              </Text>
            </Box>
            <Box backgroundColor={hover === "prev" ? theme.backgroundElement : undefined}>
              <Text color={theme.text}>
                Prev <Text color={theme.textMuted}>{keybind.print("session_child_cycle_reverse")}</Text>
              </Text>
            </Box>
            <Box backgroundColor={hover === "next" ? theme.backgroundElement : undefined}>
              <Text color={theme.text}>
                Next <Text color={theme.textMuted}>{keybind.print("session_child_cycle")}</Text>
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function titlecase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
