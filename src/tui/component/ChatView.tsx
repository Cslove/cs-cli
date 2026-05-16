// 对标 opencode session/index.tsx —— Session 会话核心组件
import React, { useMemo, useState, useEffect, useRef } from "react"
import { Box, Text } from "ink"
import { theme } from "../context/theme.js"
import { useSession } from "../context/session.js"
import { useSync } from "../context/sync.js"
import { useRoute } from "../context/route.js"
import { useKV } from "../context/kv.js"
import { useCommand } from "../context/command.js"
import { useDialog } from "../context/dialog.js"
import { useToast } from "../context/toast.js"
import { useLocal } from "../context/local.js"
import { useEvent } from "../context/event.js"
import { usePromptRef } from "../context/prompt-ref.js"
import { useKeybind } from "../context/keybind.js"
import { useTerminalSize } from "../hook/useTerminalSize.js"
import { SessionSidebar } from "./SessionSidebar.js"
import { SubagentFooter } from "./SubagentFooter.js"
import { PermissionPrompt, QuestionPrompt } from "./PermissionPrompt.js"
import { UserMessage } from "./UserMessage.js"
import { AssistantMessage, AssistantContextProvider } from "./AssistantMessage.js"
import type { AssistantContext } from "./AssistantMessage.js"
import { PromptInput } from "./PromptInput.js"
import { Scrollbox } from "./Scrollbox.js"
import type { ScrollboxHandle } from "./Scrollbox.js"
import type { RenderPart, TextPart, ToolPart, Message } from "../../shared/types.js"
import { debug } from "../util/debug.js"

export function ChatView({ model }: { model?: string }) {
  const { route, navigate } = useRoute()
  const sync = useSync()
  const command = useCommand()
  const dialog = useDialog()
  const kv = useKV()
  const toast = useToast()
  const { columns } = useTerminalSize()
  const local = useLocal()
  const event = useEvent()
  const promptRef = usePromptRef()
  const keybind = useKeybind()

  const sessionID = route.type === "session" ? route.sessionId : undefined

  useEffect(() => {
    if (sessionID) { void sync.session.sync(sessionID) }
  }, [sessionID, sync.session])

  // ---- 派生状态 ----

  const session = useMemo(() => {
    if (!sessionID) return undefined
    return sync.data.session.find(s => s.id === sessionID)
  }, [sync.data.session, sessionID])

  const children = useMemo(() => {
    if (!session) return []
    const parentID = session.parent_id ?? session.id
    return sync.data.session
      .filter(s => s.parent_id === parentID || s.id === parentID)
      .sort((a, b) => (a.time?.created ?? a.created_at) - (b.time?.created ?? b.created_at))
  }, [sync.data.session, session])

  const messages = useMemo(() => {
    if (!sessionID) return []
    return sync.data.message[sessionID] ?? []
  }, [sync.data.message, sessionID])

  const partsMap = useMemo(() => sync.data.part, [sync.data.part])

  const permissions = useMemo(() => {
    if (session?.parent_id) return []
    return children.flatMap(c => sync.data.permission[c.id] ?? [])
  }, [children, sync.data.permission, session])

  const questions = useMemo(() => {
    if (session?.parent_id) return []
    return children.flatMap(c => sync.data.question[c.id] ?? [])
  }, [children, sync.data.question, session])

  const visible = !session?.parent_id && permissions.length === 0 && questions.length === 0

  const pending = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && !messages[i].time?.completed) return messages[i].id
    }
    return undefined
  }, [messages])

  const disabled = permissions.length > 0 || questions.length > 0 || !!pending

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i]
    }
    return undefined
  }, [messages])

  // ---- UI 偏好状态 ----

  const [showSidebar, setShowSidebar] = useState(kv.get<string>("sidebar", "auto") !== "hide")
  const [conceal, setConceal] = useState(kv.get<boolean>("conceal", true))
  const [showThinking, setShowThinking] = useState(kv.get<boolean>("thinking_visibility", true))
  const [showTimestamps, setShowTimestamps] = useState(kv.get<string>("timestamps", "show") === "show")
  const [showDetails, setShowDetails] = useState(kv.get<boolean>("tool_details_visibility", true))
  const [showScrollbar, setShowScrollbar] = useState(true)
  const [autocompleteFocused, setAutocompleteFocused] = useState(false)

  const scrollRef = useRef<ScrollboxHandle>(null)

  const wide = columns > 120
  const sidebarVisible = !session?.parent_id && showSidebar && wide

  // ---- 子会话导航 ----

  function moveFirstChild() {
    if (children.length <= 1) return
    const next = children.find(c => !!c.parent_id)
    if (next) navigate({ type: "session", sessionId: next.id })
  }

  function moveChild(direction: number) {
    if (children.length <= 1) return
    const siblings = children.filter(c => !!c.parent_id)
    const idx = siblings.findIndex(c => c.id === session?.id)
    let next = idx - direction
    if (next >= siblings.length) next = 0
    if (next < 0) next = siblings.length - 1
    if (siblings[next]) navigate({ type: "session", sessionId: siblings[next].id })
  }

  function goToParent() {
    const parentID = session?.parent_id
    if (parentID) navigate({ type: "session", sessionId: parentID })
  }

  // ---- Revert 状态 ----

  const revertInfo = useMemo(() => session?.revert, [session])
  const revertMessageID = revertInfo?.messageID

  const revertDiffFiles = useMemo(() => {
    if (!revertInfo?.diff) return []
    const files: Array<{ filename: string; additions: number; deletions: number }> = []
    const lines = revertInfo.diff.split("\n")
    let current: { filename: string; additions: number; deletions: number } | undefined
    for (const line of lines) {
      const fileMatch = line.match(/^diff --git a\/(.+?) b\//)
      if (fileMatch) {
        if (current) files.push(current)
        current = { filename: fileMatch[1], additions: 0, deletions: 0 }
      }
      if (current && line.startsWith("+") && !line.startsWith("+++")) current.additions++
      if (current && line.startsWith("-") && !line.startsWith("---")) current.deletions++
    }
    if (current) files.push(current)
    return files
  }, [revertInfo])

  const revertRevertedMessages = useMemo(() => {
    if (!revertMessageID) return []
    return messages.filter(m => m.id >= revertMessageID && m.role === "user")
  }, [messages, revertMessageID])

  const revert = useMemo(() => {
    if (!revertInfo?.messageID) return undefined
    return {
      messageID: revertInfo.messageID,
      reverted: revertRevertedMessages,
      diff: revertInfo.diff,
      diffFiles: revertDiffFiles,
    }
  }, [revertInfo, revertRevertedMessages, revertDiffFiles])

  // ---- 辅助函数：part 格式化 ----

  function getParts(msgID: string): RenderPart[] {
    const raw = partsMap[msgID] ?? []
    return raw.map(p => {
      const base = { id: p.id, sessionID, messageID: msgID }
      if (p.type === "text" || p.type === "reasoning") {
        return { ...base, type: p.type, text: p.text ?? "" } as unknown as RenderPart
      }
      if (p.type === "tool" || p.type === "tool_call") {
        const tp = p as unknown as Record<string, unknown>
        return {
          ...base, type: "tool" as const,
          callID: (tp.callID as string) ?? p.id,
          tool: (tp.tool as string) ?? (p.tool_name as string) ?? "unknown",
          state: (tp.state as ToolPart["state"]) ?? { status: "completed", time: { start: p.created_at } },
          input: tp.input as Record<string, unknown> | undefined,
          metadata: tp.metadata as Record<string, unknown> | undefined,
        } as ToolPart
      }
      return { ...base, type: "text" as const, text: p.text ?? "" } as TextPart
    })
  }

  // ---- 状态 ----

  const sessionStatus = useMemo(() => {
    if (!sessionID) return "idle" as const
    return (sync.data.session_status[sessionID] as "idle" | "working" | "compacting" | undefined) ?? "idle"
  }, [sync.data.session_status, sessionID])

  const promptHint = useMemo(() => {
    const cmdKey = keybind.print("command_list")
    return (
      <Box width="100%" flexDirection="row" justifyContent="space-between">
        <Box>
          {sessionStatus === "working" && (
            <Text color={theme.warning}>⟳ thinking…</Text>
          )}
        </Box>
        <Text>
          <Text color={theme.text}>{cmdKey}</Text>
          <Text dimColor color={theme.textMuted}> Commands</Text>
        </Text>
      </Box>
    )
  }, [sessionStatus, keybind])

  // ---- 命令注册 ----

  useEffect(() => {
    if (!sessionID) return (() => {})

    const unregister = command.register([
      {
        title: "Share session",
        value: "session.share",
        keybind: "session_share",
        category: "Session",
        enabled: sync.data.config.share !== "disabled",
        onSelect: () => { toast.show({ variant: "info", message: "Share feature coming soon" }) },
      },
      {
        title: "Rename session",
        value: "session.rename",
        keybind: "session_rename",
        category: "Session",
        onSelect: () => { toast.show({ variant: "info", message: "Rename feature coming soon" }) },
      },
      {
        title: "Jump to message",
        value: "session.timeline",
        keybind: "session_timeline",
        category: "Session",
        onSelect: () => { toast.show({ variant: "info", message: "Timeline coming soon" }) },
      },
      {
        title: "Fork session",
        value: "session.fork",
        keybind: "session_fork",
        category: "Session",
        onSelect: () => { toast.show({ variant: "info", message: "Fork feature coming soon" }) },
      },
      {
        title: "Compact session",
        value: "session.compact",
        keybind: "session_compact",
        category: "Session",
        onSelect: () => { toast.show({ variant: "info", message: "Compact feature coming soon" }) },
      },
      {
        title: "Undo previous message",
        value: "session.undo",
        keybind: "messages_undo",
        category: "Session",
        onSelect: () => { toast.show({ variant: "info", message: "Undo feature coming soon" }) },
      },
      {
        title: "Redo",
        value: "session.redo",
        keybind: "messages_redo",
        category: "Session",
        enabled: !!session?.revert?.messageID,
        onSelect: () => { toast.show({ variant: "info", message: "Redo feature coming soon" }) },
      },
      {
        title: sidebarVisible ? "Hide sidebar" : "Show sidebar",
        value: "session.sidebar.toggle",
        keybind: "sidebar_toggle",
        category: "View",
        onSelect: () => {
          setShowSidebar(prev => { kv.set("sidebar", prev ? "hide" : "auto"); return !prev })
        },
      },
      {
        title: showThinking ? "Hide thinking" : "Show thinking",
        value: "session.toggle.thinking",
        keybind: "display_thinking",
        category: "View",
        onSelect: () => {
          setShowThinking(prev => { kv.set("thinking_visibility", !prev); return !prev })
        },
      },
      {
        title: showDetails ? "Hide tool details" : "Show tool details",
        value: "session.toggle.actions",
        keybind: "tool_details",
        category: "View",
        onSelect: () => {
          setShowDetails(prev => { kv.set("tool_details_visibility", !prev); return !prev })
        },
      },
      {
        title: conceal ? "Disable code conceal" : "Enable code conceal",
        value: "session.toggle.conceal",
        keybind: "messages_toggle_conceal",
        category: "View",
        onSelect: () => {
          setConceal(prev => { kv.set("conceal", !prev); return !prev })
        },
      },
      {
        title: showTimestamps ? "Hide timestamps" : "Show timestamps",
        value: "session.toggle.timestamps",
        category: "View",
        onSelect: () => {
          setShowTimestamps(prev => { kv.set("timestamps", prev ? "hide" : "show"); return !prev })
        },
      },
      {
        title: showScrollbar ? "Hide scrollbar" : "Show scrollbar",
        value: "session.toggle.scrollbar",
        category: "View",
        onSelect: () => setShowScrollbar(prev => !prev),
      },
      {
        title: "Copy last assistant message",
        value: "messages.copy",
        keybind: "messages_copy",
        category: "Session",
        onSelect: () => {
          if (!lastAssistant) { toast.show({ variant: "warning", message: "No assistant messages" }); return }
          toast.show({ variant: "success", message: "Copied!" })
        },
      },
      {
        title: "Go to parent session",
        value: "session.parent",
        keybind: "session_parent",
        category: "Session",
        hidden: true,
        enabled: !!session?.parent_id,
        onSelect: () => goToParent(),
      },
      {
        title: "Go to child session",
        value: "session.child.first",
        keybind: "session_child_first",
        category: "Session",
        hidden: true,
        onSelect: () => moveFirstChild(),
      },
      {
        title: "Next child session",
        value: "session.child.next",
        keybind: "session_child_cycle",
        category: "Session",
        hidden: true,
        enabled: !!session?.parent_id,
        onSelect: () => moveChild(1),
      },
      {
        title: "Previous child session",
        value: "session.child.previous",
        keybind: "session_child_cycle_reverse",
        category: "Session",
        hidden: true,
        enabled: !!session?.parent_id,
        onSelect: () => moveChild(-1),
      },
    ])
    return unregister
  }, [sessionID, session, sidebarVisible, showThinking, showDetails, showTimestamps, conceal, showScrollbar, lastAssistant, sync.data.config.share])

  // ---- 上下文 ----

  const assistantContext: AssistantContext = useMemo(() => ({
    sessionID: sessionID ?? "",
    showThinking,
    showTimestamps,
    width: columns,
  }), [sessionID, showThinking, showTimestamps, columns])

  // ---- 渲染 ----

  if (!sessionID) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <PromptInput />
      </Box>
    )
  }

  return (
    <AssistantContextProvider value={assistantContext}>
      <Box flexDirection="row" flexGrow={1} paddingLeft={2} paddingRight={2} paddingBottom={1} width="100%">
        {/* 主内容区 */}
        <Box flexDirection="column" flexGrow={1} gap={1} width="100%">
          {/* 消息区域：Scrollbox 底部粘滞 + 可滚动 */}
          <Scrollbox ref={scrollRef} flexGrow={1} sticky stickyStart="bottom" scrollbar={showScrollbar} keyboard={!autocompleteFocused}>
            {messages.map((msg, idx) => {
              const msgParts = getParts(msg.id)

              // Revert 分界点
              if (msg.id === revert?.messageID) {
                return (
                  <Box key={msg.id} flexShrink={0}
                    borderStyle="single" borderLeft={true} borderRight={false} borderTop={false} borderBottom={false}
                    borderLeftColor={theme.backgroundPanel} marginTop={1}
                  >
                    <Box
                      paddingTop={1} paddingBottom={1} paddingLeft={2}
                      backgroundColor={theme.backgroundPanel}
                      flexDirection="column"
                    >
                    <Text color={theme.textMuted}>{revert.reverted.length} message(s) reverted</Text>
                    <Text color={theme.textMuted}>
                      <Text color={theme.text}>Ctrl+Shift+Z</Text> or /redo to restore
                    </Text>
                    {revert.diffFiles.length > 0 && (
                      <Box marginTop={1} flexDirection="column">
                        {revert.diffFiles.map((f, i) => (
                          <Text key={i} color={theme.text}>
                            {f.filename}
                            {f.additions > 0 && <Text color={theme.diffAdded}> +{f.additions}</Text>}
                            {f.deletions > 0 && <Text color={theme.diffRemoved}> -{f.deletions}</Text>}
                          </Text>
                        ))}
                      </Box>
                    )}
                    </Box>
                  </Box>
                )
              }

              // 隐藏被 revert 的消息
              if (revert?.messageID && msg.id >= revert.messageID) return null

              // 用户消息
              if (msg.role === "user") {
                return (
                  <UserMessage
                    key={msg.id}
                    message={msg}
                    parts={msgParts}
                    index={idx}
                    showTimestamps={showTimestamps}
                  />
                )
              }

              // Assistant 消息
              if (msg.role === "assistant") {
                return (
                  <AssistantMessage
                    key={msg.id}
                    message={msg}
                    parts={msgParts}
                    isLast={lastAssistant?.id === msg.id}
                  />
                )
              }

              return null
            })}
          </Scrollbox>

          {/* 底部区域 */}
          <Box flexShrink={0} flexDirection="column">
            {permissions.length > 0 && (
              <PermissionPrompt request={permissions[0]} />
            )}
            {permissions.length === 0 && questions.length > 0 && (
              <QuestionPrompt request={questions[0]} />
            )}
            {session?.parent_id && (
              <SubagentFooter sessionID={sessionID} />
            )}
            {visible && (
              <PromptInput
                visible={visible}
                disabled={disabled}
                sessionID={sessionID}
                hint={promptHint}
                onAutocompleteFocusChange={setAutocompleteFocused}
              />
            )}
          </Box>
        </Box>

        {/* 侧边栏 */}
        {sidebarVisible && (
          <Box flexShrink={0}>
            <SessionSidebar sessionID={sessionID} />
          </Box>
        )}
      </Box>
    </AssistantContextProvider>
  )
}
