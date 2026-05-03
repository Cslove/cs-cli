// 对标 opencode 的 component/prompt/index.tsx —— Prompt 输入框组件
// 封装：输入状态、cursor、placeholder 轮换、PromptRef 绑定、历史导航、提交逻辑
//
// 性能优化策略：
// 1. useRef 存储真实输入状态，不触发渲染
// 2. 单一 display state 对象，合并 3 个 setState 为 1 个
// 3. 32ms 合并窗口（~30fps），避免快速打字/长按删除时卡顿
// 4. useMemo 缓存渲染计算（stringWidth 等）
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Box, Text, useInput, usePaste, useApp } from "ink"
import stringWidth from "string-width"
import { useSession } from "../context/session.js"
import { useRoute } from "../context/route.js"
import { useToast } from "../context/toast.js"
import { usePromptRef } from "../context/prompt-ref.js"
import { usePromptHistory } from "../context/prompt-history.js"
import { useSync } from "../context/sync.js"
import { useLocal } from "../context/local.js"
import { useTerminalSize } from "../hook/useTerminalSize.js"

// ---- Placeholders ----

const PLACEHOLDERS_NORMAL = [
  "Fix a TODO in the codebase",
  "What is the tech stack of this project?",
  "Fix broken tests",
]

const PLACEHOLDERS_SHELL = [
  "ls -la",
  "git status",
  "pwd",
]

// ---- Stash (跨路由保存未提交输入，对标 opencode 的 let stashed) ----

let stashed: { input: string; cursor: number } | undefined

// ---- Props ----

export interface PromptInputProps {
  /** 可见性控制，默认 true */
  visible?: boolean
  /** 禁用输入 */
  disabled?: boolean
  /** 提交成功回调 */
  onSubmit?: () => void
  /** 右侧额外内容 */
  right?: React.ReactNode
  /** 底部提示行 */
  hint?: React.ReactNode
}

// ---- Component ----

export function PromptInput(props: PromptInputProps) {
  const { createSession } = useSession()
  const { navigate } = useRoute()
  const toast = useToast()
  const promptRef = usePromptRef()
  const promptHistory = usePromptHistory()
  const sync = useSync()
  const local = useLocal()
  const { exit } = useApp()
  const { columns } = useTerminalSize()
  // ---- 真实输入状态（ref，不触发渲染） ----
  const inputRef = useRef(stashed?.input ?? "")
  const cursorRef = useRef(stashed?.cursor ?? 0)
  const modeRef = useRef<"normal" | "shell">("normal")
  const submitted = useRef(false)

  // ---- 单一渲染状态（3 合 1，减少 setState 调用次数） ----
  type DisplayState = { input: string; cursor: number; mode: "normal" | "shell" }
  const [display, setDisplay] = useState<DisplayState>(() => ({
    input: stashed?.input ?? "",
    cursor: stashed?.cursor ?? 0,
    mode: "normal",
  }))
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const timerId = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- 批量更新渲染：多个按键合并为一次渲染（32ms 合并窗口 ~30fps） ----
  const scheduleRender = useCallback(() => {
    if (timerId.current !== null) clearTimeout(timerId.current)
    timerId.current = setTimeout(() => {
      timerId.current = null
      setDisplay({ input: inputRef.current, cursor: cursorRef.current, mode: modeRef.current })
    }, 32)
  }, [])

  // ---- 立即同步渲染（用于提交等需要即时反馈的场景） ----
  const syncRender = useCallback(() => {
    if (timerId.current !== null) {
      clearTimeout(timerId.current)
      timerId.current = null
    }
    setDisplay({ input: inputRef.current, cursor: cursorRef.current, mode: modeRef.current })
  }, [])

  // ---- 恢复 stash ----
  useEffect(() => {
    if (stashed && stashed.input) {
      inputRef.current = stashed.input
      cursorRef.current = stashed.cursor
      syncRender()
      stashed = undefined
    }
  }, [])

  // ---- 保存 stash on unmount ----
  useEffect(() => {
    return () => {
      if (inputRef.current) {
        stashed = { input: inputRef.current, cursor: cursorRef.current }
      }
    }
  }, [])

  // ---- Placeholder 轮换 ----
  useEffect(() => {
    const placeholders = modeRef.current === "shell" ? PLACEHOLDERS_SHELL : PLACEHOLDERS_NORMAL
    const timer = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % placeholders.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [display.mode])

  // ---- 当前 agent/model 信息 ----
  const currentAgent = local.agent.current()
  const currentModel = local.model.current()
  const agentName = currentAgent?.name ?? "Code"
  const modelName = currentModel?.modelID ?? "default"

  // ---- 提交逻辑 ----
  const handleSubmit = useCallback(async (text: string) => {
    if (submitted.current) return
    if (props.disabled) return
    const trimmed = text.trim()
    if (!trimmed) return

    // 快捷退出
    if (trimmed === "exit" || trimmed === "quit" || trimmed === ":q") {
      exit()
      return
    }

    submitted.current = true
    inputRef.current = ""
    cursorRef.current = 0
    modeRef.current = "normal"
    syncRender()
    promptHistory.append({ input: trimmed, mode: modeRef.current })

    try {
      const session = await createSession()
      navigate({ type: "session", sessionId: session.id })
    } catch (e) {
      toast.error(e)
    } finally {
      submitted.current = false
      props.onSubmit?.()
    }
  }, [props.disabled, props.onSubmit, createSession, navigate, toast, promptHistory, exit, syncRender])

  // ---- 绑定 PromptRef，让外部可以操作输入框 ----
  // 注意：这里读取 inputRef 而非 displayInput，确保外部拿到的是最新值
  useEffect(() => {
    promptRef.set({
      focused: true,
      get current() { return inputRef.current },
      set(ref: string | { input?: string }) {
        const value = typeof ref === "string" ? ref : (ref.input ?? "")
        inputRef.current = value
        cursorRef.current = value.length
        syncRender()
      },
      reset() {
        inputRef.current = ""
        cursorRef.current = 0
        modeRef.current = "normal"
        syncRender()
      },
      submit() {
        if (inputRef.current.trim()) handleSubmit(inputRef.current)
      },
    })
    return () => promptRef.set(undefined)
  }, [handleSubmit, promptRef, syncRender])

  // ---- 粘贴处理（usePaste 与 useInput 互不干扰） ----
  usePaste((text) => {
    if (props.visible === false || props.disabled) return
    const cursor = cursorRef.current
    const next = inputRef.current.slice(0, cursor) + text + inputRef.current.slice(cursor)
    inputRef.current = next
    cursorRef.current = cursor + text.length
    scheduleRender()
  })

  // ---- 键盘输入 ----
  useInput((ch, key) => {
    if (props.visible === false || props.disabled) return
    if (key.escape) {
      if (modeRef.current === "shell") {
        modeRef.current = "normal"
        scheduleRender()
      }
      return
    }

    if (key.return) {
      if (inputRef.current.trim()) handleSubmit(inputRef.current)
      return
    }

    // ! 或 R 在空输入时进入 shell 模式
    if ((ch === "!" || ch === "R") && cursorRef.current === 0 && inputRef.current === "") {
      modeRef.current = "shell"
      setPlaceholderIndex(0)
      scheduleRender()
      return
    }

    if (key.leftArrow) {
      if (cursorRef.current > 0) {
        cursorRef.current -= 1
        scheduleRender()
      }
      return
    }
    if (key.rightArrow) {
      if (cursorRef.current < inputRef.current.length) {
        cursorRef.current += 1
        scheduleRender()
      }
      return
    }
    if (key.backspace) {
      if (modeRef.current === "shell" && cursorRef.current === 0 && inputRef.current === "") {
        modeRef.current = "normal"
        scheduleRender()
        return
      }
      if (cursorRef.current > 0) {
        const c = cursorRef.current
        inputRef.current = inputRef.current.slice(0, c - 1) + inputRef.current.slice(c)
        cursorRef.current = c - 1
        scheduleRender()
      }
      return
    }
    if (key.delete) {
      const c = cursorRef.current
      if (c < inputRef.current.length) {
        inputRef.current = inputRef.current.slice(0, c) + inputRef.current.slice(c + 1)
        scheduleRender()
      }
      return
    }

    // 历史导航
    if (key.upArrow && cursorRef.current === 0) {
      const item = promptHistory.move(-1, inputRef.current)
      if (item) {
        inputRef.current = item.input
        cursorRef.current = item.input.length
        if (item.mode) modeRef.current = item.mode
        scheduleRender()
      }
      return
    }
    if (key.downArrow && cursorRef.current === inputRef.current.length) {
      const item = promptHistory.move(1, inputRef.current)
      if (item) {
        inputRef.current = item.input
        cursorRef.current = item.input.length
        if (item.mode) modeRef.current = item.mode
        scheduleRender()
      }
      return
    }

    if (key.ctrl || key.meta) return
    if (ch && !key.return && !key.escape) {
      const c = cursorRef.current
      inputRef.current = inputRef.current.slice(0, c) + ch + inputRef.current.slice(c)
      cursorRef.current = c + ch.length
      scheduleRender()
    }
  })

  // ---- 渲染 ----
  if (props.visible === false) return null

  const input = display.input
  const cursor = display.cursor
  const mode = display.mode

  const placeholders = mode === "shell" ? PLACEHOLDERS_SHELL : PLACEHOLDERS_NORMAL
  const placeholderText = mode === "shell"
    ? `Run a command... "${placeholders[placeholderIndex % placeholders.length]}"`
    : `Ask anything... "${placeholders[placeholderIndex % placeholders.length]}"`

  const borderColor = mode === "shell" ? "yellow" : "magenta"

  // useMemo 缓存渲染计算，避免每次渲染重复 stringWidth
  const { before, cursorChar, after, cursorBlockWidth } = useMemo(() => {
    const before = input.slice(0, cursor)
    const cursorChar = input[cursor]
    const after = input.slice(cursor + 1)
    const cursorBlockWidth = cursorChar ? stringWidth(cursorChar) : 1
    return { before, cursorChar, after, cursorBlockWidth }
  }, [input, cursor])

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="bold"
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderLeft={true}
        borderLeftColor={borderColor}
        backgroundColor="gray"
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        flexGrow={1}
      >
        <Box flexDirection="column">
          {input ? (
            <Text>
              <Text color="white">{before}</Text>
              {cursorChar ? (
                <Text color="white" backgroundColor={borderColor}>{cursorChar}</Text>
              ) : (
                <Text backgroundColor="white">{" ".repeat(cursorBlockWidth)}</Text>
              )}
              <Text color="white">{after}</Text>
            </Text>
          ) : (
            <Text>
              <Text backgroundColor="white">{" "}</Text>
              <Text dimColor color="gray">{placeholderText}</Text>
            </Text>
          )}
          {/* agent/model 信息：输入框内部左下角 */}
          <Box flexDirection="row" gap={1} paddingTop={1}>
            <Text color={borderColor}>{mode === "shell" ? "Shell" : agentName}</Text>
            {mode === "normal" && (
              <>
                <Text dimColor color="gray">·</Text>
                <Text dimColor color="gray">{modelName}</Text>
              </>
            )}
            {/* 右侧额外内容 */}
            {props.right && (
              <>
                <Text dimColor color="gray">·</Text>
                {props.right}
              </>
            )}
          </Box>
        </Box>
      </Box>

      {/* 底部提示行 */}
      <Box
        width="100%"
        flexDirection="row"
        justifyContent="space-between"
        paddingTop={1}
      >
        {props.hint ?? (
          <Box flexDirection="column" gap={1} width="100%">
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor color="gray">ctrl+n  New session</Text>
              <Text dimColor color="gray">ctrl+p  Commands</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor color="gray">ctrl+m  Switch model</Text>
              <Text dimColor color="gray">ctrl+q  Exit</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}
