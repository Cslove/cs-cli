// 对标 opencode 的 ui/dialog.tsx —— 模态对话框栈
// Ink 7 支持 position="absolute" 和 backgroundColor，可完全对标 opencode 的蒙版+面板样式
import React, { createContext, useContext, useReducer, useCallback, useRef } from "react"
import { Box, Text, useInput } from "ink"
import { useTerminalSize } from "../hook/useTerminalSize.js"

// ---- State ----

interface DialogEntry {
  id: string
  element: React.ReactNode
  onClose?: () => void
}

interface DialogState {
  stack: DialogEntry[]
  size: "medium" | "large"
}

type DialogAction =
  | { type: "REPLACE"; entry: DialogEntry }
  | { type: "PUSH"; entry: DialogEntry }
  | { type: "POP" }
  | { type: "CLEAR" }
  | { type: "SET_SIZE"; size: DialogState["size"] }

const initialState: DialogState = {
  stack: [],
  size: "medium",
}

let dialogIdCounter = 0

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case "REPLACE":
      return { ...state, stack: [action.entry] }
    case "PUSH":
      return { ...state, stack: [...state.stack, action.entry] }
    case "POP":
      return { ...state, stack: state.stack.slice(0, -1) }
    case "CLEAR":
      return { ...state, stack: [] }
    case "SET_SIZE":
      return { ...state, size: action.size }
    default:
      return state
  }
}

// ---- Context ----

export interface DialogContextValue {
  /** 替换整个栈，显示一个新对话框 */
  replace(element: React.ReactNode, onClose?: () => void): void
  /** 在栈顶推入一个新对话框 */
  push(element: React.ReactNode, onClose?: () => void): void
  /** 关闭当前对话框 */
  close(): void
  /** 关闭所有对话框 */
  clear(): void
  /** 设置对话框尺寸 */
  setSize(size: DialogState["size"]): void
  /** 当前栈是否为空 */
  isEmpty: boolean
  /** 当前栈深度 */
  depth: number
}

const DialogCtx = createContext<DialogContextValue | null>(null)

// ---- Provider ----

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(dialogReducer, initialState)
  // 跟踪刚打开的对话框，避免同一帧 Escape 既打开又关闭
  const justOpened = useRef(false)

  const replace = useCallback((element: React.ReactNode, onClose?: () => void) => {
    dispatch({ type: "REPLACE", entry: { id: String(++dialogIdCounter), element, onClose } })
    justOpened.current = true
    setTimeout(() => { justOpened.current = false }, 0)
  }, [])

  const push = useCallback((element: React.ReactNode, onClose?: () => void) => {
    dispatch({ type: "PUSH", entry: { id: String(++dialogIdCounter), element, onClose } })
    justOpened.current = true
    setTimeout(() => { justOpened.current = false }, 0)
  }, [])

  const close = useCallback(() => {
    const current = state.stack.at(-1)
    current?.onClose?.()
    dispatch({ type: "POP" })
  }, [state.stack])

  const clear = useCallback(() => {
    for (const entry of state.stack) {
      entry.onClose?.()
    }
    dispatch({ type: "CLEAR" })
  }, [state.stack])

  const setSize = useCallback((size: DialogState["size"]) => {
    dispatch({ type: "SET_SIZE", size })
  }, [])

  // Escape 关闭当前对话框（跳过刚打开的帧，避免打开即关闭）
  useInput((ch, key) => {
    if (key.escape && state.stack.length > 0 && !justOpened.current) {
      close()
    }
  })

  const value: DialogContextValue = {
    replace,
    push,
    close,
    clear,
    setSize,
    isEmpty: state.stack.length === 0,
    depth: state.stack.length,
  }

  return (
    <DialogCtx.Provider value={value}>
      {children}
      {/* 对标 opencode：对话框渲染在 Provider 内部，绝对定位覆盖全屏 */}
      {state.stack.length > 0 && (
        <DialogOverlay size={state.size}>
          {state.stack.at(-1)!.element}
        </DialogOverlay>
      )}
    </DialogCtx.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(DialogCtx)
  if (!ctx) throw new Error("useDialog must be used within DialogProvider")
  return ctx
}

// ---- Dialog Overlay Component ----
// 绝对定位居中面板，无蒙版，圆角边框
function DialogOverlay({ children, size }: { children: React.ReactNode; size: DialogState["size"] }) {
  const { columns, rows } = useTerminalSize()
  const width = size === "large" ? Math.min(88, columns - 4) : Math.min(60, columns - 4)

  return (
    <Box
      position="absolute"
      width={columns}
      height={rows}
      left={0}
      top={0}
      alignItems="center"
      justifyContent="center"
    >
      <Box
        flexDirection="column"
        width={width}
        backgroundColor="black"
        paddingX={2}
        paddingY={1}
      >
        {children}
      </Box>
    </Box>
  )
}

// ---- Reusable Dialog Content Components ----

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return (
    <Box marginBottom={1}>
      <Text bold>{children}</Text>
    </Box>
  )
}

export function DialogItem({
  label,
  description,
  selected,
  keybind,
  onSelect,
}: {
  label: string
  description?: string
  selected?: boolean
  keybind?: string
  onSelect?: () => void
}) {
  return (
    <Box flexDirection="row" gap={1}>
      <Text color={selected ? "cyan" : undefined}>{selected ? "▸" : " "} </Text>
      <Text bold={selected}>{label}</Text>
      {description && <Text dimColor> {description}</Text>}
      {keybind && <Text dimColor color="gray"> [{keybind}]</Text>}
    </Box>
  )
}

export function DialogFooter({ children }: { children?: React.ReactNode }) {
  return (
    <Box marginTop={1} flexDirection="row" gap={1}>
      <Text dimColor color="gray">Esc to close</Text>
      {children}
    </Box>
  )
}
