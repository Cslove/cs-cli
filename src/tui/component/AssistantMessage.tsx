// 对标 opencode session/index.tsx 的 AssistantMessage 渲染
import React, { useMemo } from "react"
import { Box, Text } from "ink"
import { theme } from "../context/theme.js"
import { useSync } from "../context/sync.js"
import { useLocal } from "../context/local.js"
import { useKeybind } from "../context/keybind.js"
import { ToolRenderer } from "./ToolRenderer.js"
import type { Message, RenderPart, TextPart, ReasoningPart, ToolPart } from "../../shared/types.js"

// ---- Context（从 ChatView 传递下来） ----

export interface AssistantContext {
  sessionID: string
  showThinking: boolean
  showTimestamps: boolean
  width: number
}

const AssistantCtx = React.createContext<AssistantContext | null>(null)

export function AssistantContextProvider({ value, children }: { value: AssistantContext; children: React.ReactNode }) {
  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>
}

export function useAssistantContext() {
  const ctx = React.useContext(AssistantCtx)
  if (!ctx) throw new Error("useAssistantContext must be used within AssistantContextProvider")
  return ctx
}

// ---- Props ----

interface AssistantMessageProps {
  message: Message
  parts: RenderPart[]
  isLast: boolean
}

// ---- 组件 ----

export function AssistantMessage({ message, parts, isLast }: AssistantMessageProps) {
  const ctx = useAssistantContext()
  const sync = useSync()
  const local = useLocal()
  const keybind = useKeybind()
  const messages = useMemo(() => sync.data.message[ctx.sessionID] ?? [], [sync.data.message, ctx.sessionID])

  const modelName = useMemo(() => {
    const provider = sync.data.provider.find(p => p.id === message.providerID)
    const model = provider?.model ?? message.modelID ?? message.model
    return model || "unknown"
  }, [sync.data.provider, message])

  const duration = useMemo(() => {
    if (!message.time?.completed) return 0
    const user = messages.find((x: Message) => x.role === "user" && x.id === message.parentID)
    if (!user?.time) return 0
    return message.time.completed - user.time.created
  }, [messages, message])

  const agentColor = useMemo(() => {
    const agent = local.agent.list().find(a => a.name === message.agent)
    return agent ? theme.primary : theme.accent
  }, [local, message.agent])

  const final = useMemo(() => {
    return !!message.finish && !["tool-calls", "unknown"].includes(message.finish!)
  }, [message.finish])

  const hasTask = parts.some(p => p.type === "tool" && (p as ToolPart).tool === "task")

  const formattedDuration = useMemo(() => {
    if (!duration) return ""
    const secs = Math.floor(duration / 1000)
    if (secs < 60) return `${secs}s`
    const mins = Math.floor(secs / 60)
    return `${mins}m ${secs % 60}s`
  }, [duration])

  return (
    <Box flexDirection="column">
      {/* Parts 渲染 */}
      <PartRenderer parts={parts} />

      {/* Task 提示：查看子 agent */}
      {hasTask && isLast && (
        <Box paddingTop={1} paddingLeft={3}>
          <Text>
            <Text color={theme.primary}>{keybind.print("session_child_first")}</Text>
            <Text color={theme.textMuted}> view subagents</Text>
          </Text>
        </Box>
      )}

      {/* 错误展示 */}
      {message.error && message.error.name !== "MessageAbortedError" && (
        <Box
          borderStyle="single"
          borderLeft={true}
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          borderLeftColor={theme.error}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={2}
          marginTop={1}
          backgroundColor={theme.backgroundPanel}
        >
          <Text color={theme.textMuted}>{message.error.data?.message ?? "Unknown error"}</Text>
        </Box>
      )}

      {/* Footer：agent · model · 耗时 */}
      {(isLast || final || message.error?.name === "MessageAbortedError") && (
        <Box paddingLeft={3} marginTop={1}>
          <Text>
            <Text color={message.error?.name === "MessageAbortedError" ? theme.textMuted : agentColor}>
              ▣{" "}
            </Text>
            <Text color={theme.text}>{message.mode ? titlecase(message.mode) : "Assistant"}</Text>
            <Text color={theme.textMuted}> · {modelName}</Text>
            {formattedDuration && (
              <Text color={theme.textMuted}> · {formattedDuration}</Text>
            )}
            {message.error?.name === "MessageAbortedError" && (
              <Text color={theme.textMuted}> · interrupted</Text>
            )}
          </Text>
        </Box>
      )}
    </Box>
  )
}

// ---- Part 渲染器 ----

function PartRenderer({ parts }: { parts: RenderPart[] }) {
  return (
    <>
      {parts.map((part, i) => (
        <PartDisplay key={part.id ?? i} part={part} isLast={i === parts.length - 1} />
      ))}
    </>
  )
}

function PartDisplay({ part, isLast }: { part: RenderPart; isLast: boolean }) {
  switch (part.type) {
    case "text":
      return <TextPartDisplay part={part as TextPart} />
    case "tool":
      return <ToolRenderer part={part as ToolPart} />
    case "reasoning":
      return <ReasoningDisplay part={part as ReasoningPart} />
    default:
      return null
  }
}

// ---- 文本 Part ----

function TextPartDisplay({ part }: { part: TextPart }) {
  const ctx = useAssistantContext()
  const text = part.text.trim()
  if (!text) return null

  // 简单 Markdown-ish 渲染
  return (
    <Box paddingLeft={3} marginTop={1} flexShrink={0}>
      <Text color={theme.text}>{text}</Text>
    </Box>
  )
}

// ---- 推理 Part ----

function ReasoningDisplay({ part }: { part: ReasoningPart }) {
  const ctx = useAssistantContext()
  if (!ctx.showThinking) return null

  const content = part.text.replace("[REDACTED]", "").trim()
  if (!content) return null

  return (
    <Box
      borderStyle="single"
      borderLeft={true}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderLeftColor={theme.backgroundElement}
      paddingLeft={2}
      marginTop={1}
      flexDirection="column"
    >
      <Text color={theme.textMuted}>Thinking: {content}</Text>
    </Box>
  )
}

// ---- 工具函数 ----

function titlecase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}


