// 对标 opencode 的 routes/home.tsx —— 首页组件
// 布局：Logo(SI RONG ASCII Art) + PromptInput(borderLeft+暗色背景+内联光标)
import React from "react"
import { Box, Text } from "ink"
import { useTerminalSize } from "../hook/useTerminalSize.js"
import { PromptInput } from "./PromptInput.js"

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

// ---- HomeView ----
export function HomeView() {
  const { columns, rows } = useTerminalSize()

  // Logo 宽度计算
  const maxSiWidth = Math.max(
    ...SI_LINES.map((l) => l.length + LOGO_SPACER.length + RONG_LINES[0].length),
  )
  const logoFits = columns >= maxSiWidth + 4

  // 内容总高度：Logo 6行 + 间距 1行 + 输入框约 6行 = 13行
  const contentHeight = logoFits ? 13 : 8
  // 顶部 padding：让内容整体垂直居中，最少保留 1 行
  const topPadding = Math.max(1, Math.floor((rows - contentHeight) / 2))

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

      {/* 输入框区域：状态/placeholder/PromptRef 均由 PromptInput 内部维护 */}
      <Box
        width={Math.floor(columns * 0.7)}
        flexDirection="column"
        flexShrink={0}
      >
        <PromptInput />
      </Box>
    </Box>
  )
}
