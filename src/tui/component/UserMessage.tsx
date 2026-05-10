// 对标 opencode session/index.tsx 的 UserMessage 渲染
import React, { useMemo, useState } from "react"
import { Box, Text } from "ink"
import { theme as t } from "../context/theme.js"
import { useLocal } from "../context/local.js"
import type { Message, RenderPart, TextPart, FilePart } from "../../shared/types.js"

interface UserMessageProps {
  message: Message
  parts: RenderPart[]
  index: number
  pending?: string
  onSelect?: () => void
  showTimestamps: boolean
}

export function UserMessage({ message, parts, index, pending, onSelect, showTimestamps }: UserMessageProps) {
  const local = useLocal()
  const [hover, setHover] = useState(false)

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

  // 队列状态：若有更高消息 ID 的 pending assistant
  const queued = !!(pending && message.id > pending)

  const agentColor = useMemo(() => {
    return t.primary
  }, [])

  const queuedFg = t.background

  return (
    <Box
      flexDirection="column"
      marginTop={index === 0 ? 0 : 1}
    >
      {/* 消息头部：序号 + 用户标识 */}
      <Box paddingLeft={2}>
        <Text>
          <Text color={agentColor} bold>You</Text>
          {queued && (
            <Text>
              {" "}
              <Text backgroundColor={agentColor} color={queuedFg} bold> QUEUED </Text>
            </Text>
          )}
          {showTimestamps && message.time && (
            <Text color={t.textMuted}> · {formatTime(message.time.created)}</Text>
          )}
        </Text>
      </Box>

      {/* 文本内容 */}
      {textContent && (
        <Box paddingLeft={3} marginTop={0}>
          <Text color={t.text}>{textContent}</Text>
        </Box>
      )}

      {/* 文件附件 */}
      {files.length > 0 && (
        <Box paddingLeft={3} flexDirection="column">
          {files.map((file, i) => (
            <Text key={i} color={t.textMuted}>
              📎 {file.filename ?? file.url}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
