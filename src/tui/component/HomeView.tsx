// 对标 opencode 的 routes/home.tsx —— 首页组件
// 布局：Logo(SI RONG ASCII Art) + 输入框(borderLeft+暗色背景+内联光标) + 状态栏
import React, { useState, useEffect, useCallback, useRef } from "react"
import { Box, Text, useInput } from "ink"
import stringWidth from "string-width"
import { useSession } from "../context/session.js"
import { useRoute } from "../context/route.js"
import { useToast } from "../context/toast.js"
import { usePromptRef } from "../context/prompt-ref.js"
import { usePromptHistory } from "../context/prompt-history.js"
import { useSync } from "../context/sync.js"
import { useLocal } from "../context/local.js"
import { useTerminalSize } from "../hook/useTerminalSize.js"

// ---- ASCII Art Logo ----
const SI_LINES = [
  "███████╗██╗",
  "██╔════╝██║",
  "███████╗██║",
  "╚════██║██║",
  "███████║██║",
  "╚══════╝╚═╝",
]

const LOGO_SPACER = "   "

const RONG_LINES = [
  "██████╗ ████████╗███╗   ██╗██████╗ ",
  "██╔══██╗██╔═══██╗████╗  ██║██╔═════╝",
  "██████╔╝██║   ██║██╔██╗ ██║██║ ████╗",
  "██╔══██╗██║   ██║██║╚██╗██║██║   ██║",
  "██║  ██║╚██████╔╝██║ ╚████║╚██████╔╝",
  "╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═══╝╚═════╝ ",
]

const PLACEHOLDERS = [
  "Fix a TODO in the codebase",
  "What is the tech stack of this project?",
  "Fix broken tests",
]

// ---- 光标宽度计算（仅用于渲染） ----
// cursor 使用 JS 字符索引（0 到 value.length），不需要显示列转换
// stringWidth 仅在渲染光标块大小时使用

// ---- Prompt Input Component ----
// 对标 opencode 的 Prompt 组件样式：
// borderLeft + 暗色背景 + placeholder + 内联光标（反色字符）
function PromptInput({
  value,
  cursor,
  onChange,
  onCursorChange,
  onSubmit,
  placeholder,
  agentName,
  modelName,
}: {
  value: string
  cursor: number
  onChange: (v: string) => void
  onCursorChange: (pos: number) => void
  onSubmit: (v: string) => void
  placeholder: string
  agentName: string
  modelName: string
}) {
  useInput((ch, key) => {
    if (key.escape) return
    if (key.return) {
      if (value.trim()) onSubmit(value)
      return
    }
    if (key.leftArrow) {
      if (cursor > 0) onCursorChange(cursor - 1)
      return
    }
    if (key.rightArrow) {
      if (cursor < value.length) onCursorChange(cursor + 1)
      return
    }
    if (key.backspace) {
      if (cursor > 0) {
        onChange(value.slice(0, cursor - 1) + value.slice(cursor))
        onCursorChange(cursor - 1)
      }
      return
    }
    if (key.delete) {
      if (cursor < value.length) {
        onChange(value.slice(0, cursor) + value.slice(cursor + 1))
      }
      return
    }
    if (key.ctrl || key.meta) return
    if (ch && !key.return && !key.escape) {
      onChange(value.slice(0, cursor) + ch + value.slice(cursor))
      onCursorChange(cursor + ch.length)
    }
  })

  // cursor 是 JS 字符索引，直接用于 slice 分割
  const before = value.slice(0, cursor)
  const cursorChar = value[cursor]
  const after = value.slice(cursor + 1)
  // 光标块宽度：中文占2列，末尾占1列
  const cursorBlockWidth = cursorChar ? stringWidth(cursorChar) : 1

  return (
    <Box
      borderStyle="bold"
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderLeft={true}
      borderLeftColor="magenta"
      backgroundColor="gray"
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={1}
      flexGrow={1}
    >
      <Box flexDirection="column">
        {value ? (
          <Text>
            <Text color="white">{before}</Text>
            {cursorChar ? (
              <Text color="white" backgroundColor="magenta">{cursorChar}</Text>
            ) : (
              // 光标在末尾，显示白色方块
              <Text backgroundColor="white">{" ".repeat(cursorBlockWidth)}</Text>
            )}
            <Text color="white">{after}</Text>
          </Text>
        ) : (
          // 无内容时，白色光标块在 placeholder 的 A 处（开头）
          <Text>
            <Text backgroundColor="white" color="black">{"A"}</Text>
            <Text dimColor color="gray">{`sk anything... "${placeholder}"`}</Text>
          </Text>
        )}
        {/* agent/model 信息：输入框内部左下角 */}
        <Box flexDirection="row" gap={1} paddingTop={1}>
          <Text color="magenta">{agentName}</Text>
          <Text dimColor color="gray">·</Text>
          <Text dimColor color="gray">{modelName}</Text>
        </Box>
      </Box>
    </Box>
  )
}

// ---- HomeView ----
export function HomeView() {
  const { createSession } = useSession()
  const { navigate } = useRoute()
  const toast = useToast()
  const promptRef = usePromptRef()
  const promptHistory = usePromptHistory()
  const sync = useSync()
  const local = useLocal()
  const { columns, rows } = useTerminalSize()
  const [input, setInput] = useState("")
  const [cursor, setCursor] = useState(0)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const submitted = useRef(false)

  // 轮换 placeholder
  useEffect(() => {
    const timer = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  // 绑定 promptRef，让外部可以操作输入框
  useEffect(() => {
    promptRef.set({
      focused: true,
      get current() { return input },
      set(ref: string | { input?: string }) {
        if (typeof ref === "string") {
          setInput(ref)
          setCursor(ref.length)
        } else {
          setInput(ref.input ?? "")
          setCursor(ref.input?.length ?? 0)
        }
      },
      reset() { setInput(""); setCursor(0) },
      submit() {
        if (input.trim()) handleSubmit(input)
      },
    })
    return () => promptRef.set(undefined)
  }, [input])

  const handleSubmit = useCallback(async (text: string) => {
    if (submitted.current) return
    submitted.current = true
    setInput("")
    setCursor(0)
    promptHistory.append({ input: text })

    try {
      const session = await createSession()
      navigate({ type: "session", sessionId: session.id })
    } catch (e) {
      toast.error(e)
    } finally {
      submitted.current = false
    }
  }, [createSession, navigate, toast, promptHistory])

  // Logo 宽度计算
  const maxSiWidth = Math.max(
    ...SI_LINES.map((l) => l.length + LOGO_SPACER.length + RONG_LINES[0].length),
  )
  const logoFits = columns >= maxSiWidth + 4

  // 内容总高度：Logo 6行 + 间距 1行 + 输入框 4行 = 11行
  const contentHeight = logoFits ? 11 : 6
  // 顶部 padding：让内容整体垂直居中，最少保留 1 行
  const topPadding = Math.max(1, Math.floor((rows - contentHeight) / 2))

  // 当前 agent/model 信息，对标 opencode 输入框下方的状态栏
  const currentAgent = local.agent.current()
  const currentModel = local.model.current()
  const agentName = currentAgent?.name ?? "Code"
  const modelName = currentModel?.modelID ?? "default"

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      alignItems="center"
    >
      {/* 顶部弹性空白，根据终端高度动态计算使内容居中 */}
      <Box height={topPadding} flexShrink={0} />

      {/* Logo */}
      {logoFits ? (
        <Box flexDirection="column" flexShrink={0}>
          {SI_LINES.map((line, i) => (
            <Box key={i} flexDirection="row">
              <Text color="magenta" bold>{line}</Text>
              <Text>{LOGO_SPACER}</Text>
              <Text color="cyan" bold>{RONG_LINES[i]}</Text>
            </Box>
          ))}
        </Box>
      ) : (
        <Box flexShrink={0} paddingBottom={1}>
          <Text bold color="magenta">SI RONG</Text>
        </Box>
      )}

      {/* Logo 与输入框间距 */}
      <Box height={1} flexShrink={0} />

      {/* 输入框区域 */}
      <Box
        width={columns - 8}
        flexDirection="column"
        flexShrink={0}
      >
        <PromptInput
          value={input}
          cursor={cursor}
          onChange={setInput}
          onCursorChange={setCursor}
          onSubmit={handleSubmit}
          placeholder={PLACEHOLDERS[placeholderIndex]}
          agentName={agentName}
          modelName={modelName}
        />
      </Box>
    </Box>
  )
}
