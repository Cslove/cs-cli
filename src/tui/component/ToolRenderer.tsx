// 对标 opencode session/index.tsx 的工具渲染器
// InlineTool: 轻量单行工具 | BlockTool: 块级展开工具
import React, { useState, useMemo, useEffect } from "react"
import { Box, Text } from "ink"
import { theme } from "../context/theme.js"
import { useSync } from "../context/sync.js"
import { useRoute } from "../context/route.js"
import type { RenderPart, ToolPart, ToolState } from "../../shared/types.js"

// ---- 工具 Props ----

interface ToolProps {
  part: ToolPart
  width?: number
}

// ---- 工具状态帮助函数 ----

function isRunning(state: ToolState) { return state.status === "running" }
function isCompleted(state: ToolState) { return state.status === "completed" }
function isError(state: ToolState) { return state.status === "error" }

// ---- Spinner 组件 ----

function Spinner({ text }: { text: string }) {
  const [frame, setFrame] = useState(0)
  const chars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

  useEffect(() => {
    const timer = setInterval(() => setFrame(f => (f + 1) % chars.length), 80)
    return () => clearInterval(timer)
  }, [])

  return (
    <Text color={theme.text}>
      <Text color={theme.accent}>{chars[frame]}</Text> {text}
    </Text>
  )
}

// ---- InlineTool ----

interface InlineToolProps {
  icon: string
  pending: string
  complete: React.ReactNode
  part: ToolPart
  spinner?: boolean
  onClick?: () => void
  children?: React.ReactNode
}

function InlineTool({ icon, pending, complete, part, spinner: showSpinner, onClick }: InlineToolProps) {
  const isDone = isCompleted(part.state)
  const isErr = isError(part.state)
  const running = isRunning(part.state) || showSpinner
  const denied = isErr && (part.state.error?.includes("rejected") || part.state.error?.includes("dismissed"))

  const color = denied ? theme.textMuted : running ? theme.warning : isErr ? theme.error : theme.textMuted

  return (
    <Box paddingLeft={3} marginTop={0}>
      <Text color={color} strikethrough={denied}>
        {running
          ? <Spinner text={pending} />
          : isDone
            ? <><Text color={theme.textMuted}>{icon}</Text> {complete}</>
            : isErr
              ? <>✗ {part.tool}: {part.state.error}</>
              : <>{icon} {pending}</>
        }
      </Text>
    </Box>
  )
}

// ---- BlockTool ----

interface BlockToolProps {
  title: string
  part?: ToolPart
  spinner?: boolean
  children: React.ReactNode
  onClick?: () => void
}

function BlockTool({ title, part, spinner, children }: BlockToolProps) {
  const isErr = part && isError(part.state)

  return (
    <Box
      borderStyle="single"
      borderLeft={true}
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderLeftColor={theme.border}
      paddingLeft={2}
      paddingTop={1}
      paddingBottom={1}
      marginTop={1}
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
    >
      <Box paddingLeft={1}>
        {spinner
          ? <Spinner text={title.replace(/^# /, "")} />
          : <Text color={theme.textMuted}>{title}</Text>
        }
      </Box>
      {children}
      {isErr && part?.state.error && !part.state.error.includes("rejected") &&
        <Box paddingLeft={1}>
          <Text color={theme.error}>{part.state.error}</Text>
        </Box>
      }
    </Box>
  )
}

// ---- 具体工具渲染器 ----

function BashTool({ part }: ToolProps) {
  const input = part.input as Record<string, string> | undefined
  const output = useMemo(() => (part.metadata?.output as string ?? "").trim(), [part.metadata])
  const [expanded, setExpanded] = useState(false)
  const lines = useMemo(() => output.split("\n"), [output])
  const overflow = lines.length > 10

  const limited = useMemo(() => {
    if (expanded || !overflow) return output
    return [...lines.slice(0, 10), "…"].join("\n")
  }, [expanded, overflow, lines, output])

  const command = input?.command ?? ""
  const desc = input?.description ?? "Shell"

  if (!isCompleted(part.state)) {
    return <InlineTool icon="$" pending="Writing command..." complete={command} part={part}>{command}</InlineTool>
  }

  return (
    <BlockTool title={`# ${desc}`} part={part} spinner={isRunning(part.state)}>
      <Box flexDirection="column" gap={1}>
        <Text color={theme.text}>$ {command}</Text>
        {output ? <Text color={theme.text}>{limited}</Text> : null}
        {overflow && !isRunning(part.state) &&
          <Text color={theme.textMuted}>{expanded ? "Collapse" : "Expand"} (click)</Text>
        }
      </Box>
    </BlockTool>
  )
}

function ReadTool({ part }: ToolProps) {
  const input = part.input as Record<string, string> | undefined
  const filePath = input?.filePath ?? ""

  return (
    <InlineTool icon="→" pending="Reading file..." complete={filePath} part={part}>
      Read {filePath}
    </InlineTool>
  )
}

function WriteTool({ part }: ToolProps) {
  const input = part.input as Record<string, string> | undefined
  const filePath = input?.filePath ?? ""
  const content = input?.content as string ?? ""

  if (!isCompleted(part.state)) {
    return <InlineTool icon="←" pending="Preparing write..." complete={filePath} part={part}>
      Write {filePath}
    </InlineTool>
  }

  return (
    <BlockTool title={`# Wrote ${filePath}`} part={part}>
      <Box paddingLeft={1} flexDirection="column">
        <Text color={theme.text}>{content.slice(0, 500)}{content.length > 500 ? "…" : ""}</Text>
      </Box>
    </BlockTool>
  )
}

function EditTool({ part }: ToolProps) {
  const input = part.input as Record<string, unknown> | undefined
  const filePath = (input?.filePath as string) ?? ""
  const diff = part.metadata?.diff as string | undefined

  if (!diff) {
    return <InlineTool icon="←" pending="Preparing edit..." complete={filePath} part={part}>
      Edit {filePath}
    </InlineTool>
  }

  return (
    <BlockTool title={`← Edit ${filePath}`} part={part}>
      <Box paddingLeft={1} flexDirection="column">
        {diff.split("\n").slice(0, 30).map((line, i) => {
          const style = line.startsWith("+") ? { color: theme.diffAdded }
            : line.startsWith("-") ? { color: theme.diffRemoved }
            : { color: theme.textMuted }
          return <Text key={i} {...style}>{line}</Text>
        })}
        {diff.split("\n").length > 30 && <Text color={theme.textMuted}>…</Text>}
      </Box>
    </BlockTool>
  )
}

function GlobTool({ part }: ToolProps) {
  const input = part.input as Record<string, string> | undefined
  const pattern = input?.pattern ?? ""
  const count = part.metadata?.count as number | undefined

  return (
    <InlineTool icon="✱" pending="Finding files..." complete={pattern} part={part}>
      Glob "{pattern}" {count !== undefined ? `(${count} match${count !== 1 ? "es" : ""})` : ""}
    </InlineTool>
  )
}

function GrepTool({ part }: ToolProps) {
  const input = part.input as Record<string, string> | undefined
  const pattern = input?.pattern ?? ""
  const matches = part.metadata?.matches as number | undefined

  return (
    <InlineTool icon="✱" pending="Searching content..." complete={pattern} part={part}>
      Grep "{pattern}" {matches !== undefined ? `(${matches} match${matches !== 1 ? "es" : ""})` : ""}
    </InlineTool>
  )
}

function WebFetchTool({ part }: ToolProps) {
  const input = part.input as Record<string, string> | undefined
  const url = input?.url ?? ""

  return (
    <InlineTool icon="%" pending="Fetching from the web..." complete={url} part={part}>
      WebFetch {url}
    </InlineTool>
  )
}

function WebSearchTool({ part }: ToolProps) {
  const input = part.input as Record<string, string> | undefined
  const query = input?.query ?? ""

  return (
    <InlineTool icon="◈" pending="Searching web..." complete={query} part={part}>
      WebSearch "{query}"
    </InlineTool>
  )
}

function CodeSearchTool({ part }: ToolProps) {
  const input = part.input as Record<string, string> | undefined
  const query = input?.query ?? ""

  return (
    <InlineTool icon="◇" pending="Searching code..." complete={query} part={part}>
      CodeSearch "{query}"
    </InlineTool>
  )
}

function TaskTool({ part }: ToolProps) {
  const input = part.input as Record<string, unknown> | undefined
  const desc = (input?.description as string) ?? ""
  const subagentType = (input?.subagent_type as string) ?? "General"
  const sessionId = part.metadata?.sessionId as string | undefined
  const { navigate } = useRoute()
  const sync = useSync()

  // 同步 subagent session 数据
  useEffect(() => {
    if (sessionId && !sync.data.message[sessionId]?.length) {
      void sync.session.sync(sessionId)
    }
  }, [sessionId])

  const subMessages = useMemo(() => sync.data.message[sessionId ?? ""] ?? [], [sync.data.message, sessionId])

  const tools = useMemo(() => {
    const result: Array<{ tool: string; state: ToolState }> = []
    for (const msg of subMessages) {
      const parts = sync.data.part[msg.id] ?? []
      for (const p of parts) {
        const tp = p as unknown as ToolPart
        if (tp.type === "tool" && tp.tool) {
          result.push({ tool: tp.tool, state: tp.state })
        }
      }
    }
    return result
  }, [subMessages, sync.data.part])

  const current = useMemo(() => {
    for (let i = tools.length - 1; i >= 0; i--) {
      const x = tools[i]
      if ((x.state.status === "running" || x.state.status === "completed") && x.state.title) return x
    }
    return undefined
  }, [tools])

  const duration = useMemo(() => {
    const first = subMessages.find(x => x.role === "user")?.time?.created
    let assistant: typeof subMessages[0] | undefined
    for (let i = subMessages.length - 1; i >= 0; i--) {
      if (subMessages[i].role === "assistant") { assistant = subMessages[i]; break }
    }
    if (!first || !assistant?.time?.completed) return 0
    return assistant!.time!.completed! - first
  }, [subMessages])

  const content = useMemo(() => {
    let label = `${subagentType} Task — ${desc}`

    if (isRunning(part.state) && tools.length > 0) {
      if (current) {
        const title = current.state.status === "running" || current.state.status === "completed" ? current.state.title : undefined
        label += `\n↳ ${current.tool}${title ? ` ${title}` : ""}`
      } else {
        label += `\n↳ ${tools.length} toolcalls`
      }
    }

    if (isCompleted(part.state)) {
      const mins = Math.floor(duration / 60000)
      const secs = Math.floor((duration % 60000) / 1000)
      label += `\n└ ${tools.length} toolcalls · ${mins}m ${secs}s`
    }

    return label
  }, [subagentType, desc, part.state, tools, current, duration])

  return (
    <InlineTool
      icon="│"
      spinner={isRunning(part.state)}
      complete={desc}
      pending="Delegating..."
      part={part}
      onClick={() => { if (sessionId) navigate({ type: "session", sessionId }) }}
    >
      {content}
    </InlineTool>
  )
}

function TodoWriteTool({ part }: ToolProps) {
  const todos = (part.input as Record<string, Array<{ status: string; content: string }>> | undefined)?.todos ?? []

  if (!isCompleted(part.state)) {
    return <InlineTool icon="⚙" pending="Updating todos..." complete={false as unknown as React.ReactNode} part={part}>
      Updating todos...
    </InlineTool>
  }

  return (
    <BlockTool title="# Todos" part={part}>
      <Box flexDirection="column">
        {todos.map((todo, i) => (
          <Box key={i} paddingLeft={1}>
            <Text color={theme.textMuted}>
              {todo.status === "completed" ? "☑" : todo.status === "in_progress" ? "◐" : "☐"} {todo.content}
            </Text>
          </Box>
        ))}
      </Box>
    </BlockTool>
  )
}

function QuestionTool({ part }: ToolProps) {
  const input = part.input as Record<string, unknown> | undefined
  const questions = input?.questions as Array<{ question: string }> | undefined
  const answers = part.metadata?.answers as string[][] | undefined
  const count = questions?.length ?? 0

  if (!answers) {
    return <InlineTool icon="→" pending="Asking questions..." complete={count} part={part}>
      Asked {count} question{count !== 1 ? "s" : ""}
    </InlineTool>
  }

  return (
    <BlockTool title="# Questions" part={part}>
      <Box flexDirection="column" gap={1}>
        {questions?.map((q, i) => (
          <Box key={i} flexDirection="column">
            <Text color={theme.textMuted}>{q.question}</Text>
            <Text color={theme.text}>{answers[i]?.join(", ") ?? "(no answer)"}</Text>
          </Box>
        ))}
      </Box>
    </BlockTool>
  )
}

function SkillTool({ part }: ToolProps) {
  const input = part.input as Record<string, string> | undefined
  const name = input?.name ?? ""

  return (
    <InlineTool icon="→" pending="Loading skill..." complete={name} part={part}>
      Skill "{name}"
    </InlineTool>
  )
}

function ApplyPatchTool({ part }: ToolProps) {
  const files = (part.metadata?.files as Array<{ type: string; relativePath: string; filePath: string; deletions: number; patch?: string; movePath?: string }>) ?? []

  if (files.length === 0) {
    return <InlineTool icon="%" pending="Preparing patch..." complete={false as unknown as React.ReactNode} part={part}>
      Patch
    </InlineTool>
  }

  function title(file: typeof files[0]) {
    if (file.type === "delete") return `# Deleted ${file.relativePath}`
    if (file.type === "add") return `# Created ${file.relativePath}`
    if (file.type === "move") return `# Moved ${file.filePath} → ${file.relativePath}`
    return `← Patched ${file.relativePath}`
  }

  return (
    <>
      {files.map((file, i) => (
        <BlockTool key={i} title={title(file)} part={part}>
          {file.type !== "delete" && file.patch
            ? <Box paddingLeft={1} flexDirection="column">
                {file.patch.split("\n").slice(0, 20).map((line, j) => {
                  const style = line.startsWith("+") ? { color: theme.diffAdded }
                    : line.startsWith("-") ? { color: theme.diffRemoved }
                    : { color: theme.textMuted }
                  return <Text key={j} {...style}>{line}</Text>
                })}
              </Box>
            : <Box paddingLeft={1}>
                <Text color={theme.diffRemoved}>-{file.deletions} line{file.deletions !== 1 ? "s" : ""}</Text>
              </Box>
          }
        </BlockTool>
      ))}
    </>
  )
}

// ---- 工具映射表 ----

type PartType = RenderPart["type"]

const TOOL_MAPPING: Record<string, React.FC<ToolProps>> = {
  bash: BashTool,
  write: WriteTool,
  read: ReadTool,
  glob: GlobTool,
  grep: GrepTool,
  edit: EditTool,
  apply_patch: ApplyPatchTool,
  todo_write: TodoWriteTool,
  web_fetch: WebFetchTool,
  web_search: WebSearchTool,
  code_search: CodeSearchTool,
  task: TaskTool,
  question: QuestionTool,
  skill: SkillTool,
}

// ---- 导出 ----

export function ToolRenderer({ part }: { part: ToolPart }) {
  const Component = TOOL_MAPPING[part.tool]
  if (!Component) {
    return <InlineTool icon="⚙" pending={`Running ${part.tool}...`} complete={part.tool} part={part}>
      {part.tool}: {part.state.status}
    </InlineTool>
  }
  return <Component part={part} />
}

export { InlineTool, BlockTool, Spinner }
