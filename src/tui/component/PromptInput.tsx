// 对标 opencode 的 component/prompt/index.tsx —— Prompt 输入框组件
// 封装：输入状态、cursor、placeholder 轮换、PromptRef 绑定、历史导航、提交逻辑
//
// 性能优化策略：
// 1. useRef 存储真实输入状态，不触发渲染
// 2. 单一 display state 对象，合并 3 个 setState 为 1 个
// 3. React 18 自动批处理合并同一事件循环内的 setState，无需手动合并窗口
// 4. useMemo 缓存渲染计算（stringWidth 等）
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react"
import { Box, Text, useInput, usePaste, useApp, useCursor } from "ink"
import stringWidth from "string-width"
import { useSession } from "../context/session.js"
import { theme } from "../context/theme.js"
import { useRoute } from "../context/route.js"
import { useToast } from "../context/toast.js"
import { useDialog } from "../context/dialog.js"
import { usePromptRef } from "../context/prompt-ref.js"
import { usePromptHistory } from "../context/prompt-history.js"
import { useSync } from "../context/sync.js"
import { useLocal } from "../context/local.js"
import { useTerminalSize } from "../hook/useTerminalSize.js"
import { useAutocomplete, type MentionSpan } from "../hook/useAutocomplete.js"
import { AutocompletePopup } from "./AutocompletePopup.js"
import { debug } from "../util/debug.js"
import type { PartInput, AgentPartInput, FilePartInput } from "../../shared/types.js"

// ---- Placeholders ----

const PLACEHOLDERS = ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"]

// ---- Stash (跨路由保存未提交输入，对标 opencode 的 let stashed) ----

let stashed: { input: string; cursor: number } | undefined

// ---- Mention Rendering Segments ----
// 对标 opencode extmark + fileStyleId/agentStyleId：将 input 拆分为着色片段

interface RenderSegment {
  start: number
  end: number
  text: string
  type: "agent" | "file" | "text"
}

function buildSegments(input: string, mentions: MentionSpan[]): RenderSegment[] {
  if (mentions.length === 0) {
    return input ? [{ start: 0, end: input.length, text: input, type: "text" as const }] : []
  }

  const sorted = [...mentions].sort((a, b) => a.start - b.start)
  const segments: RenderSegment[] = []
  let pos = 0

  for (const mention of sorted) {
    // mention 之前的普通文本
    if (pos < mention.start) {
      segments.push({ start: pos, end: mention.start, text: input.slice(pos, mention.start), type: "text" })
    }
    // mention 本身
    segments.push({ start: mention.start, end: mention.end, text: mention.text, type: mention.type })
    pos = mention.end
  }

  // 最后一段普通文本
  if (pos < input.length) {
    segments.push({ start: pos, end: input.length, text: input.slice(pos), type: "text" })
  }

  return segments
}

// ---- 内联视觉光标渲染 ----
// 仿 ink-text-input 方案：将光标作为反色字符渲染在文本内部
// 彻底消除 yoga 坐标换算导致的定位偏差问题
// 光标随文本一起渲染 → 位置永远正确、换行自然跟随、无坐标计算开销

function renderSegmentsWithCursor(segments: RenderSegment[], input: string, cursor: number): React.ReactNode[] {
  const elements: React.ReactNode[] = []
  let keyIdx = 0

  const segProps = (type: string) =>
    type === "agent"
      ? { color: theme.background, backgroundColor: theme.accent }
      : type === "file"
        ? { color: theme.text, backgroundColor: theme.primary }
        : { color: theme.text }

  for (const seg of segments) {
    if (cursor >= seg.start && cursor < seg.end) {
      // 光标在本段内，拆分为 [前部] + [光标字符(反色)] + [后部]
      const local = cursor - seg.start
      const before = seg.text.slice(0, local)
      const ch = seg.text[local] ?? " "
      const after = seg.text.slice(local + 1)
      const style = segProps(seg.type)
      if (before)
        elements.push(
          <Text key={keyIdx++} {...style}>
            {before}
          </Text>,
        )
      elements.push(
        <Text key={keyIdx++} color={theme.background} backgroundColor={theme.text}>
          {ch}
        </Text>,
      )
      if (after)
        elements.push(
          <Text key={keyIdx++} {...style}>
            {after}
          </Text>,
        )
    } else {
      // 光标不在本段，原样渲染
      elements.push(
        <Text key={keyIdx++} {...segProps(seg.type)}>
          {seg.text}
        </Text>,
      )
    }
  }

  // 光标在输入末尾（追加位置）——渲染一个反色空格
  if (cursor === input.length) {
    elements.push(
      <Text key={keyIdx++} color={theme.background} backgroundColor={theme.text}>
        {" "}
      </Text>,
    )
  }

  return elements
}

// ---- IME 光标终端位置计算 ----
// 终端光标仅服务于输入法候选框（IME）定位
// 视觉显示由内联反色光标承担，终端光标位置允许一定误差

const YOGA_EDGE_LEFT = 0
const YOGA_EDGE_TOP = 1

function getAbsolutePosition(inkNode: any): { x: number; y: number } {
  let x = 0
  let y = 0
  let node: any = inkNode
  while (node) {
    const yoga = node.yogaNode
    if (yoga) {
      const layout = yoga.getComputedLayout()
      x += layout.left
      y += layout.top
      x += yoga.getComputedPadding(YOGA_EDGE_LEFT) + yoga.getComputedBorder(YOGA_EDGE_LEFT)
      y += yoga.getComputedPadding(YOGA_EDGE_TOP) + yoga.getComputedBorder(YOGA_EDGE_TOP)
    }
    node = node.parentNode
  }
  return { x: Math.round(x), y: Math.round(y) }
}

function getCursorVisualPosition(
  input: string,
  cursor: number,
  contentWidth: number,
): { xOffset: number; yOffset: number } {
  if (contentWidth <= 0) return { xOffset: 0, yOffset: 0 }
  const beforeCursor = input.slice(0, cursor)
  let currentCol = 0
  let currentRow = 0
  for (const char of beforeCursor) {
    const w = stringWidth(char)
    if (currentCol + w > contentWidth) {
      currentRow++
      currentCol = w
    } else {
      currentCol += w
    }
  }
  if (currentCol >= contentWidth) {
    currentRow++
    currentCol = 0
  }
  return { xOffset: currentCol, yOffset: currentRow }
}

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
  sessionID?: string
  /** autocomplete 焦点变化回调：弹出时通知上层屏蔽其他组件键盘 */
  onAutocompleteFocusChange?: (focused: boolean) => void
}

// ---- Component ----

export function PromptInput(props: PromptInputProps) {
  const { createSession, sendMessage } = useSession()
  const { navigate } = useRoute()
  const toast = useToast()
  const dialog = useDialog()
  const promptRef = usePromptRef()
  const promptHistory = usePromptHistory()
  const sync = useSync()
  const local = useLocal()
  const { exit } = useApp()
  const { setCursorPosition } = useCursor()
  const textRef = useRef<any>(null)
  const { columns } = useTerminalSize()

  // ---- Autocomplete ----
  const autocomplete = useAutocomplete({
    onInsert: (result) => {
      inputRef.current = result.input
      cursorRef.current = result.cursor
      syncRender()
    },
  })

  // 通知上层 autocomplete 焦点状态，屏蔽 Scrollbox 等其他组件键盘
  useEffect(() => {
    props.onAutocompleteFocusChange?.(autocomplete.visible !== false)
  }, [autocomplete.visible])

  // ---- 真实输入状态（ref，不触发渲染） ----
  const inputRef = useRef(stashed?.input ?? "")
  const cursorRef = useRef(stashed?.cursor ?? 0)
  const submitted = useRef(false)

  // ---- 单一渲染状态（3 合 1，减少 setState 调用次数） ----
  type DisplayState = { input: string; cursor: number }
  const [display, setDisplay] = useState<DisplayState>(() => ({
    input: stashed?.input ?? "",
    cursor: stashed?.cursor ?? 0,
  }))
  const placeholderIndex = useRef(Math.floor(Math.random() * PLACEHOLDERS.length))

  // ---- 同步渲染：按键/提交时立即更新 display state ----
  // React 18 自动批处理合并同一事件循环内的 setState，无需手动 32ms 合并窗口
  const syncRender = useCallback(() => {
    setDisplay({ input: inputRef.current, cursor: cursorRef.current })
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

  // ---- 当前 agent/model 信息 ----
  const currentAgent = local.agent.current()
  const currentModel = local.model.current()
  const agentName = currentAgent?.name ?? "Code"
  const modelName = currentModel?.modelID ?? "default"

  // ---- 提交逻辑 ----
  // 对标 opencode submit()：将输入态的虚拟文本 + mention spans 转换为扁平化 parts 数组
  const handleSubmit = useCallback(
    async (text: string) => {
      if (submitted.current) return
      if (props.disabled) return
      if (autocomplete.visible) return
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
      syncRender()

      // === 数据转换：对标 opencode submit() Phase 3 ===
      // 1. 从 mention spans 构建 agent/file parts
      // 2. 从输入文本构建 text part
      // 3. 构建 parts 数组传给 sendMessage
      const mentions = autocomplete.mentions
      const parts: PartInput[] = []
      let inputText = text

      if (mentions.length > 0) {
        // 对标 opencode：从后往前将 mention 的虚拟文本从 inputText 中剥离
        // 因为 mention 文本（如 "@Code"）是虚拟占位，实际内容由 part 携带
        // 剥离后 inputText 只剩普通文本部分
        const sorted = [...mentions].sort((a, b) => b.start - a.start)

        for (const mention of sorted) {
          // 从后往前剥离 mention 文本 + 尾部空格
          const hasTrailingSpace = inputText[mention.end] === " "
          const deleteEnd = hasTrailingSpace ? mention.end + 1 : mention.end
          inputText = inputText.slice(0, mention.start) + inputText.slice(deleteEnd)

          // 构建 part（对标 opencode 的 nonTextParts）
          if (mention.type === "agent") {
            const agentPart: AgentPartInput = {
              type: "agent",
              name: mention.text.slice(1), // 去掉 "@" 前缀
              source: {
                value: mention.text,
                start: mention.start,
                end: mention.end,
              },
            }
            parts.push(agentPart)
          } else if (mention.type === "file") {
            const filePath = mention.text.slice(1) // 去掉 "@" 前缀
            const filePart: FilePartInput = {
              type: "file",
              mime: "text/plain", // 文件引用默认 text/plain
              url: filePath,
              source: {
                path: filePath,
                text: {
                  value: mention.text,
                  start: mention.start,
                  end: mention.end,
                },
              },
            }
            parts.push(filePart)
          }
        }
      }

      // 对标 opencode：用户输入文本作为 text part 放在 parts 最前面
      parts.unshift({ type: "text", text: inputText })

      // 对标 opencode：agent 信息传入请求
      const agentName = local.agent.current()?.name

      promptHistory.append({ input: trimmed, parts })
      debug.log("Input: ", { input: trimmed, parts })

      try {
        let sessionID = props.sessionID
        if (sessionID == null) {
          const session = await createSession()
          sessionID = session.id
        }

        await sendMessage(inputText, agentName, parts, sessionID)

        if (!props.sessionID) {
          setTimeout(() => {
            navigate({ type: "session", sessionId: sessionID })
          }, 50)
        }
      } catch (e) {
        toast.error(e)
      } finally {
        submitted.current = false
        props.onSubmit?.()
      }
    },
    [
      props.disabled,
      props.sessionID,
      props.onSubmit,
      createSession,
      navigate,
      sendMessage,
      toast,
      promptHistory,
      exit,
      syncRender,
      autocomplete.mentions,
      local,
    ],
  )

  // ---- 绑定 PromptRef，让外部可以操作输入框 ----
  // 注意：这里读取 inputRef 而非 displayInput，确保外部拿到的是最新值
  // 关键：只依赖 promptRef.set（useState setter，引用稳定），不依赖整个 promptRef 对象
  // 否则 promptRef 每次 PromptRefProvider re-render 都是新对象 → 无限循环
  const promptRefSet = promptRef.set
  useEffect(() => {
    promptRefSet({
      focused: true,
      get current() {
        return inputRef.current
      },
      set(ref: string | { input?: string }) {
        const value = typeof ref === "string" ? ref : (ref.input ?? "")
        inputRef.current = value
        cursorRef.current = value.length
        syncRender()
      },
      reset() {
        inputRef.current = ""
        cursorRef.current = 0
        syncRender()
      },
      submit() {
        if (inputRef.current.trim()) handleSubmit(inputRef.current)
      },
    })
    return () => promptRefSet(undefined)
  }, [handleSubmit, promptRefSet, syncRender])

  // ---- 粘贴处理（usePaste 与 useInput 互不干扰） ----
  usePaste((text) => {
    if (props.visible === false || props.disabled) return
    const cursor = cursorRef.current
    const next = inputRef.current.slice(0, cursor) + text + inputRef.current.slice(cursor)
    inputRef.current = next
    cursorRef.current = cursor + text.length
    syncRender()
    // 粘贴后隐藏 autocomplete（对标 opencode onPaste 行为）
    if (autocomplete.visible) autocomplete.hide()
  })

  // ---- 键盘输入 ----
  useInput((ch, key) => {
    if (props.visible === false || props.disabled) return
    // 对话框打开时（命令面板/会话列表等）跳过输入处理，避免按键穿透
    if (!dialog.isEmpty) return

    // Autocomplete 键盘优先处理（对标 opencode 的 autocomplete.onKeyDown）
    // autocomplete 打开时独占上下键等，屏蔽所有其他按键逻辑
    if (autocomplete.visible) {
      if (autocomplete.handleKey(ch, key)) return
    }

    if (key.escape) return

    if (key.return) {
      if (autocomplete.visible) return
      if (inputRef.current.trim()) handleSubmit(inputRef.current)
      return
    }

    if (key.leftArrow) {
      if (cursorRef.current > 0) {
        cursorRef.current -= 1
        syncRender()
      }
      return
    }
    if (key.rightArrow) {
      if (cursorRef.current < inputRef.current.length) {
        cursorRef.current += 1
        syncRender()
      }
      return
    }
    if (key.backspace) {
      if (cursorRef.current > 0) {
        // 对标 opencode：backspace 到 mention 边界时整块删除（而非逐字符）
        const mentionSpan = autocomplete.getMentionBefore(cursorRef.current)
        if (mentionSpan) {
          const result = autocomplete.deleteMention(mentionSpan)
          inputRef.current = result.input
          cursorRef.current = result.cursor
          syncRender()
          autocomplete.onInput(inputRef.current, cursorRef.current)
        } else {
          const c = cursorRef.current
          inputRef.current = inputRef.current.slice(0, c - 1) + inputRef.current.slice(c)
          cursorRef.current = c - 1
          syncRender()
          autocomplete.onInput(inputRef.current, cursorRef.current)
        }
      }
      return
    }
    if (key.delete) {
      const c = cursorRef.current
      if (c < inputRef.current.length) {
        inputRef.current = inputRef.current.slice(0, c) + inputRef.current.slice(c + 1)
        syncRender()
        autocomplete.onInput(inputRef.current, cursorRef.current)
      }
      return
    }

    // 历史导航（仅在输入非空时触发；空输入时留给 Scrollbox 滚动消息区）
    if (key.upArrow && cursorRef.current === 0 && inputRef.current.length > 0) {
      const item = promptHistory.move(-1, inputRef.current)
      if (item) {
        inputRef.current = item.input
        cursorRef.current = item.input.length
        syncRender()
      }
      return
    }
    if (key.downArrow && cursorRef.current === inputRef.current.length && inputRef.current.length > 0) {
      const item = promptHistory.move(1, inputRef.current)
      if (item) {
        inputRef.current = item.input
        cursorRef.current = item.input.length
        syncRender()
      }
      return
    }

    if (key.ctrl || key.meta) return
    if (ch && !key.return && !key.escape) {
      const c = cursorRef.current
      inputRef.current = inputRef.current.slice(0, c) + ch + inputRef.current.slice(c)
      cursorRef.current = c + ch.length
      syncRender()
      // 对标 opencode onContentChange → autocomplete.onInput
      autocomplete.onInput(inputRef.current, cursorRef.current)
    }
  })

  // ---- IME 光标定位（终端光标服务于输入法候选框） ----
  const cursorBaseRef = useRef<{ x: number; y: number; contentWidth: number } | null>(null)

  useLayoutEffect(() => {
    const node = textRef.current
    if (!node?.yogaNode) return
    const pos = getAbsolutePosition(node)
    setCursorPosition({ x: pos.x - 2, y: pos.y })
  }, [columns, props.visible, props.disabled, dialog.isEmpty])

  // Ink 的 setCursorPosition 会附带 \x1B[?25h（显示光标块），
  // 在 layout effect 中立即写入 hide 序列，隐藏终端光标块但保留位置给 IME
  useLayoutEffect(() => {
    if (props.visible === false || props.disabled || !dialog.isEmpty) return
    process.stdout.write("\x1B[?25l")
  })

  // ---- 渲染 ----
  if (props.visible === false) return null

  const input = display.input
  const cursor = display.cursor

  const placeholderText = `Ask anything... "${PLACEHOLDERS[placeholderIndex.current % PLACEHOLDERS.length]}"`

  const borderColor = theme.secondary

  // 对标 opencode extmark + fileStyleId/agentStyleId：根据 mention spans 分段着色
  // agent = cyan 背景，file = blue 背景，普通文本 = 白色
  const segments = useMemo(() => buildSegments(input, autocomplete.mentions), [input, autocomplete.mentions])

  debug.log("PromptInput", { input, cursor })

  return (
    <Box flexDirection="column" width="100%" backgroundColor={theme.background}>
      {/* 对标 opencode：Autocomplete 绝对定位浮层，不改变输入框布局流 */}
      <AutocompletePopup
        visible={autocomplete.visible}
        options={autocomplete.options}
        selectedIndex={autocomplete.selectedIndex}
        width="100%"
      />
      <Box
        borderStyle="bold"
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderLeft={true}
        borderLeftColor={borderColor}
        borderBackgroundColor={theme.backgroundElement}
        backgroundColor={theme.backgroundElement}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        flexGrow={1}
      >
        <Box flexDirection="column">
          <Box ref={textRef}>
            {input ? (
              <Text>{renderSegmentsWithCursor(segments, input, cursor)}</Text>
            ) : (
              <Text>
                <Text color={theme.background} backgroundColor={theme.text}>
                  {" "}
                </Text>
                <Text dimColor color={theme.textMuted}>
                  {placeholderText}
                </Text>
              </Text>
            )}
          </Box>
          {/* agent/model 信息：输入框内部左下角 */}
          <Box flexDirection="row" gap={1} paddingTop={1}>
            <Text color={theme.secondary}>{agentName}</Text>
            <Text dimColor color={theme.textMuted}>
              ·
            </Text>
            <Text dimColor color={theme.textMuted}>
              {modelName}
            </Text>
            {/* 右侧额外内容 */}
            {props.right && (
              <>
                <Text dimColor color={theme.textMuted}>
                  ·
                </Text>
                {props.right}
              </>
            )}
          </Box>
        </Box>
      </Box>

      <Box
        width="100%"
        flexDirection="row"
        justifyContent="space-between"
        paddingTop={1}
        backgroundColor={theme.background}
      >
        {props.hint !== undefined ? (
          props.hint
        ) : (
          <Box flexDirection="column" gap={1} width="100%">
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor color={theme.textMuted}>
                ctrl+n New session
              </Text>
              <Text dimColor color={theme.textMuted}>
                ctrl+p Commands
              </Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor color={theme.textMuted}>
                ctrl+l Sessions
              </Text>
              <Text dimColor color={theme.textMuted}>
                ctrl+m Switch model
              </Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}
