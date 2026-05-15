// 对标 opencode session/index.tsx 的 UserMessage 渲染
// ╻ 左竖线 agent 色  ╻ 文本 paddingLeft=3  ╻ 文件徽标
import React, { useMemo } from "react"
import { Box, Text } from "ink"
import { theme as t } from "../context/theme.js"
import type { Message, RenderPart, TextPart, FilePart } from "../../shared/types.js"

// ---- MIME 缩写 ----

const MIME_BADGE: Record<string, string> = {
  "text/plain": "txt",
  "image/png": "img",
  "image/jpeg": "img",
  "image/gif": "img",
  "image/webp": "img",
  "application/pdf": "pdf",
  "application/x-directory": "dir",
}

function mimeBadge(mime: string) {
  return MIME_BADGE[mime] ?? mime
}

function mimeBg(mime: string) {
  if (mime.startsWith("image/")) return t.accent
  if (mime === "application/pdf") return t.primary
  return t.secondary
}

// ---- 接口 ----

interface UserMessageProps {
  message: Message
  parts: RenderPart[]
  index: number
  showTimestamps: boolean
}

// ---- 组件 ----

export function UserMessage({ message, parts, index, showTimestamps }: UserMessageProps) {
  // 提取文本内容（非 synthetic 的 text parts）
  const textContent = useMemo(() => {
    return parts
      .filter((p): p is TextPart => p.type === "text" && !p.synthetic)
      .map(p => p.text)
      .join("\n\n")
  }, [parts])

  // 提取文件附件
  const files = useMemo(() => {
    return parts.filter((p): p is FilePart => p.type === "file")
  }, [parts])

  const agentColor = t.secondary

  if (!textContent) {
    // 纯文件消息也显示
    if (files.length === 0) return null
  }

  return (
    <Box
      borderStyle="bold"
      borderLeft={true}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      width="100%"
      borderLeftColor={agentColor}
      marginTop={index === 0 ? 0 : 1}
      flexShrink={0}
    >
      <Box
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        width="100%"
        backgroundColor={t.backgroundPanel}
      >
        <Box flexDirection="column">
          {/* 文本内容 */}
          {textContent && (
            <Text color={t.text}>{textContent}</Text>
          )}

          {/* 文件附件：徽标样式 */}
          {files.length > 0 && (
            <Box flexDirection="row" paddingBottom={showTimestamps && message.time ? 1 : 0} paddingTop={1}>
              {files.map((file, i) => (
                <Text key={i}>
                  <Text backgroundColor={mimeBg(file.mime)} color={t.background}> {mimeBadge(file.mime)} </Text>
                  <Text backgroundColor={t.backgroundElement} color={t.textMuted}>
                    {file.filename ?? file.url}
                  </Text>
                  {i < files.length - 1 && <Text> </Text>}
                </Text>
              ))}
            </Box>
          )}

          {/* Footer：时间戳 */}
          {showTimestamps && message.time && (
            <Text color={t.textMuted} dimColor>
              {formatTime(message.time.created)}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  )
}

// ---- 工具函数 ----

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const h = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${y}-${m}-${day} ${h}:${min}`
}
