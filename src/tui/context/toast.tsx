// 对标 opencode 的 ui/toast.tsx —— 单例通知 + 自动超时
import React, { createContext, useContext, useState, useCallback, useRef } from "react"
import { Box, Text } from "ink"
import type { BoxStyle } from "cli-boxes"
import { useTerminalSize } from "../hook/useTerminalSize.js"

// 对标 opencode 的 SplitBorder.customBorderChars
// 只显示左右竖线 ┃，其他边为空
const SPLIT_BORDER: BoxStyle = {
  topLeft: "",
  top: " ",
  topRight: "",
  right: "",
  bottomRight: "",
  bottom: " ",
  bottomLeft: "",
  left: "┃",
}

type ToastVariant = "info" | "success" | "warning" | "error"

interface ToastOptions {
  title?: string
  message: string
  variant?: ToastVariant
  duration?: number
}

interface ToastContext {
  show: (options: ToastOptions) => void
  error: (err: unknown) => void
  currentToast: ToastOptions | null
}

const ctx = createContext<ToastContext | null>(null)

const VARIANT_COLORS: Record<ToastVariant, string> = {
  info: "cyan",
  success: "green",
  warning: "yellow",
  error: "red",
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [currentToast, setCurrentToast] = useState<ToastOptions | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const show = useCallback((options: ToastOptions) => {
    setCurrentToast(options)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setCurrentToast(null)
    }, options.duration ?? 3000)
    // unref() 确保定时器不阻止进程退出
    timeoutRef.current.unref()
  }, [])

  const error = useCallback((err: unknown) => {
    if (err instanceof Error) {
      show({ variant: "error", message: err.message })
    } else {
      show({ variant: "error", message: "An unknown error has occurred" })
    }
  }, [show])

  return (
    <ctx.Provider value={{ show, error, currentToast }}>
      {children}
    </ctx.Provider>
  )
}

export function useToast() {
  const value = useContext(ctx)
  if (!value) throw new Error("useToast must be used within a ToastProvider")
  return value
}

/** Toast 渲染组件，完全对标 opencode 右上角浮层
 *  Ink 7 支持: top/right 定位、Box backgroundColor、maxWidth、自定义 borderStyle
 *  对标 opencode: position=absolute top=2 right=2 border={["left","right"]}
 *                customBorderChars={SplitBorder.customBorderChars}
 *                backgroundColor={theme.backgroundPanel} maxWidth={60}
 *                justifyContent="center" alignItems="flex-start"
 */
export function Toast() {
  const { currentToast } = useToast()
  const { columns } = useTerminalSize()
  if (!currentToast) return null

  const color = VARIANT_COLORS[currentToast.variant ?? "info"]

  return (
    <Box
      position="absolute"
      justifyContent="center"
      alignItems="flex-start"
      top={2}
      right={2}
      maxWidth={Math.min(60, columns - 6)}
      flexDirection="column"
      borderStyle={SPLIT_BORDER}
      borderLeft
      borderLeftColor={color}
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      backgroundColor="black"
    >
      {currentToast.title && (
        <Box marginBottom={1}>
          <Text bold color={color}>{currentToast.title}</Text>
        </Box>
      )}
      <Text wrap="wrap">{currentToast.message}</Text>
    </Box>
  )
}
