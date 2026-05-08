// 对标 opencode 的 component/dialog-session-list.tsx —— 会话列表选择对话框
// Ink 版本：delete(ctrl+d 双击确认) + rename(ctrl+r 行内编辑) + filter 始终显示
import React, { useState, useMemo, useRef } from "react"
import { Box, Text, useInput } from "ink"
import { useDialog, DialogTitle, DialogItem } from "../context/dialog.js"
import { useSync } from "../context/sync.js"
import { useRoute } from "../context/route.js"
import { useKeybind } from "../context/keybind.js"
import { useApi } from "../context/api.js"
import { useToast } from "../context/toast.js"
import { theme } from "../context/theme.js"

type Mode = "select" | "rename"

export function DialogSessionList() {
  const dialog = useDialog()
  const route = useRoute()
  const sync = useSync()
  const keybind = useKeybind()
  const api = useApi()
  const toast = useToast()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filter, setFilter] = useState("")
  const [toDelete, setToDelete] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("select")
  const [renameText, setRenameText] = useState("")
  const renameRef = useRef("")

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

  // ---- Rename 模式键盘处理 ----
  useInput((ch, key) => {
    if (mode !== "rename") return

    if (key.escape) {
      setMode("select")
      return
    }

    if (key.return) {
      const newTitle = renameRef.current.trim()
      if (newTitle && current) {
        api.session.rename(current.id, newTitle).then((result) => {
          if (!result) toast.show({ variant: "error", message: "Failed to rename session" })
        })
      }
      setMode("select")
      return
    }

    if (key.backspace) {
      renameRef.current = renameRef.current.slice(0, -1)
      setRenameText(renameRef.current)
      return
    }

    if (ch && !key.ctrl && !key.meta) {
      renameRef.current += ch
      setRenameText(renameRef.current)
    }
  })

  // ---- 选择模式键盘处理 ----
  useInput((ch, key) => {
    if (mode !== "select") return

    if (key.upArrow) {
      setToDelete(null)
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : sessions.length - 1))
    } else if (key.downArrow) {
      setToDelete(null)
      setSelectedIndex((prev) => (prev < sessions.length - 1 ? prev + 1 : 0))
    } else if (key.return && current) {
      // delete 确认态下回车也确认删除
      if (toDelete === current.id) {
        void deleteSession(current.id)
        return
      }
      route.navigate({ type: "session", sessionId: current.id })
      dialog.clear()
    } else if (key.backspace || key.delete) {
      if (toDelete) { setToDelete(null); return }
      setFilter((prev) => prev.slice(0, -1))
      setSelectedIndex(0)
    } else if (ch && !key.return && !key.escape && !key.ctrl && !key.meta) {
      if (toDelete) setToDelete(null)
      setFilter((prev) => prev + ch)
      setSelectedIndex(0)
    } else if (keybind.match("session_delete", key, ch) && current) {
      if (toDelete === current.id) {
        void deleteSession(current.id)
      } else {
        setToDelete(current.id)
      }
    } else if (keybind.match("session_rename", key, ch) && current) {
      renameRef.current = current.title
      setRenameText(current.title)
      setMode("rename")
      setToDelete(null)
    }
  })

  async function deleteSession(id: string) {
    const result = await api.session.remove(id)
    if (result === null) {
      toast.show({ variant: "error", message: "Failed to delete session" })
    }
    setToDelete(null)
    // 如果删除的是当前会话，导航回首页
    if (id === currentSessionId) {
      route.navigate({ type: "home" })
    }
  }

  // 按日期分组
  const today = new Date().toDateString()
  const categories = new Map<string, typeof sessions>()
  for (const session of sessions) {
    const date = new Date(session.updated_at)
    const cat = date.toDateString() === today ? "Today" : date.toDateString()
    if (!categories.has(cat)) categories.set(cat, [])
    categories.get(cat)!.push(session)
  }

  return (
    <Box flexDirection="column">
      <DialogTitle>Sessions</DialogTitle>
      {/* filter 始终显示 */}
      <Box marginBottom={1}>
        <Text dimColor>Filter: </Text>
        <Text color={filter ? theme.accent : theme.textMuted}>{filter || "type to search..."}</Text>
      </Box>
      {mode === "rename" && current && (
        <Box marginBottom={1}>
          <Text color={theme.warning}>Rename: </Text>
          <Text color={theme.text}>{renameText}</Text>
          <Text backgroundColor={theme.text}>{" "}</Text>
        </Box>
      )}
      {Array.from(categories.entries()).map(([category, items]) => (
        <Box key={category} flexDirection="column" marginBottom={1}>
          <Text bold color={theme.textMuted}>{category}</Text>
          {items.map((session) => {
            const globalIdx = sessions.indexOf(session)
            const isCurrent = session.id === currentSessionId
            const isDeleting = toDelete === session.id
            const isRenaming = mode === "rename" && globalIdx === selectedIndex
            const label = isDeleting
              ? `Press ${keybind.print("session_delete")} again to confirm`
              : isRenaming
                ? renameText
                : session.title + (isCurrent ? " (current)" : "")
            return (
              <DialogItem
                key={session.id}
                label={label}
                description={isDeleting ? undefined : formatTime(session.updated_at)}
                selected={globalIdx === selectedIndex}
              />
            )
          })}
        </Box>
      ))}
      {sessions.length === 0 && (
        <Text dimColor>No sessions found</Text>
      )}
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Text dimColor color={theme.textMuted}>{keybind.print("session_delete")} delete</Text>
        <Text dimColor color={theme.textMuted}>{keybind.print("session_rename")} rename</Text>
        <Text dimColor color={theme.textMuted}>↑↓ navigate</Text>
      </Box>
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
