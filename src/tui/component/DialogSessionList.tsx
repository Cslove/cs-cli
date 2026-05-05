// 对标 opencode 的 component/dialog-session-list.tsx —— 会话列表选择对话框
// Ink 版本：简化了 opentui 的 workspace/search/delete 功能，保留核心的会话列表选择
import React, { useState, useMemo } from "react"
import { Box, Text, useInput } from "ink"
import { useDialog, DialogTitle, DialogItem, DialogFooter } from "../context/dialog.js"
import { useSync } from "../context/sync.js"
import { useRoute } from "../context/route.js"
import { useKeybind } from "../context/keybind.js"

export function DialogSessionList() {
  const dialog = useDialog()
  const route = useRoute()
  const sync = useSync()
  const keybind = useKeybind()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filter, setFilter] = useState("")

  const currentSessionId = route.route.type === "session" ? route.route.sessionId : undefined

  // 按 updated_at 降序排列，过滤掉 sub-session（有 parent_id 的）
  const sessions = useMemo(() => {
    const list = sync.data.session
      .filter((s) => !s.parent_id)
      .sort((a, b) => b.updated_at - a.updated_at)

    if (!filter) return list
    const q = filter.toLowerCase()
    return list.filter((s) => s.title.toLowerCase().includes(q))
  }, [sync.data.session, filter])

  const current = sessions[selectedIndex]

  useInput((ch, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : sessions.length - 1))
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < sessions.length - 1 ? prev + 1 : 0))
    } else if (key.return && current) {
      route.navigate({ type: "session", sessionId: current.id })
      dialog.clear()
    } else if (key.backspace || key.delete) {
      setFilter((prev) => prev.slice(0, -1))
      setSelectedIndex(0)
    } else if (ch && !key.return && !key.escape && !key.ctrl && !key.meta) {
      setFilter((prev) => prev + ch)
      setSelectedIndex(0)
    }
  })

  // 按日期分组
  const today = new Date().toDateString()
  const categories = new Map<string, typeof sessions>()
  for (const session of sessions) {
    const date = new Date(session.updated_at)
    const cat = date.toDateString() === today ? "Today" : date.toDateString()
    if (!categories.has(cat)) categories.set(cat, [])
    categories.get(cat)!.push(session)
  }

  // 扁平索引映射
  const flatItems = sessions

  return (
    <Box flexDirection="column">
      <DialogTitle>Sessions</DialogTitle>
      {filter && (
        <Box marginBottom={1}>
          <Text dimColor>Filter: </Text>
          <Text color="cyan">{filter}</Text>
        </Box>
      )}
      {Array.from(categories.entries()).map(([category, items]) => (
        <Box key={category} flexDirection="column" marginBottom={1}>
          <Text bold color="gray">{category}</Text>
          {items.map((session) => {
            const globalIdx = flatItems.indexOf(session)
            const isCurrent = session.id === currentSessionId
            return (
              <DialogItem
                key={session.id}
                label={session.title + (isCurrent ? " (current)" : "")}
                description={formatTime(session.updated_at)}
                selected={globalIdx === selectedIndex}
                keybind={isCurrent ? keybind.print("session_list") : undefined}
              />
            )
          })}
        </Box>
      ))}
      {sessions.length === 0 && (
        <Text dimColor>No sessions found</Text>
      )}
      <DialogFooter>
        <Text dimColor color="gray"> | ↑↓ Navigate | Enter: Select | Type to filter</Text>
      </DialogFooter>
    </Box>
  )
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return date.toLocaleDateString()
}
