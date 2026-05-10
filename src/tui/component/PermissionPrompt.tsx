// 对标 opencode session/permission.tsx & question.tsx
// Ink 版本：用键盘输入代替 OpenTUI 的问答 UI
import React, { useState, useMemo } from "react"
import { Box, Text } from "ink"
import { theme } from "../context/theme.js"
import type { PermissionRequest, QuestionRequest } from "../../shared/types.js"

// ---- Permission Prompt ----

interface PermissionPromptProps {
  request: PermissionRequest
  onAllow?: () => void
  onDeny?: () => void
}

export function PermissionPrompt({ request, onAllow, onDeny }: PermissionPromptProps) {
  const [choice, setChoice] = useState<"allow" | "deny" | null>(null)

  const toolName = request.tool?.tool ?? "unknown"
  const toolTitle = request.tool?.title

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box
        borderStyle="single"
        borderLeft={true}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderLeftColor={theme.warning}
        backgroundColor={theme.backgroundPanel}
        paddingLeft={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={theme.warning} bold>⚠ Permission Required</Text>
          </Box>
          <Text color={theme.text}>{request.description}</Text>
          {toolTitle && (
            <Text color={theme.textMuted}>{toolName}: {toolTitle}</Text>
          )}
          <Box flexDirection="row" gap={2}>
            <Text color={theme.success}>[a] Allow</Text>
            <Text color={theme.error}>[d] Deny</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

// ---- Question Prompt ----

interface QuestionPromptProps {
  request: QuestionRequest
  onSubmit?: (answers: string[]) => void
}

export function QuestionPrompt({ request, onSubmit }: QuestionPromptProps) {
  const options = request.options ?? []
  const multiSelect = request.multiSelect ?? false
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [freeform, setFreeform] = useState("")

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box
        borderStyle="single"
        borderLeft={true}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderLeftColor={theme.accent}
        backgroundColor={theme.backgroundPanel}
        paddingLeft={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <Box flexDirection="column" gap={1}>
          <Text bold color={theme.accent}>❓ {request.question}</Text>
          {options.length > 0 && (
            <Box flexDirection="column" gap={0}>
              {options.map((opt, i) => {
                const isSelected = selected.has(i)
                return (
                  <Text key={i} color={isSelected ? theme.accent : theme.textMuted}>
                    {isSelected ? "▸" : " "} [{i + 1}] {opt}
                  </Text>
                )
              })}
            </Box>
          )}
          {options.length === 0 && (
            <Box flexDirection="column">
              <Text color={theme.textMuted}>Type your answer and press Enter</Text>
              <Text color={theme.text}>{freeform || " "}</Text>
            </Box>
          )}
          <Text color={theme.textMuted}>
            {multiSelect ? "space=toggle · " : ""}enter=confirm · esc=cancel
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
