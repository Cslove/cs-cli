export interface Session {
  id: string
  slug: string
  version: string
  title: string
  model: string
  project_id: string
  parent_id: string | null
  workspace_id?: string
  share?: { url: string }
  revert?: { messageID: string; diff: string }
  time?: { created: number; updated: number }
  created_at: number
  updated_at: number
}

export interface RevertInfo {
  messageID: string
  reverted: Message[]
  diff: string
  diffFiles: Array<{ filename: string; additions: number; deletions: number }>
}

export interface Message {
  id: string
  session_id: string
  role: "user" | "assistant" | "system"
  content: string
  model: string
  created_at: number
  /** 对标 opencode SDK */
  time?: { created: number; completed?: number }
  agent?: string
  mode?: string
  tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  cost?: number
  error?: { name: string; data: { message: string } }
  finish?: string
  providerID?: string
  modelID?: string
  parentID?: string
}

export interface ChatPromptRequest {
  sessionId: string
  content: string
  model?: string
  /** agent 名称，对标 opencode session.prompt.agent */
  agent?: string
  /** 扁平化 parts 数组，对标 opencode session.prompt.parts */
  parts?: PartInput[]
}

export interface ChatPromptResponse {
  sessionId: string
  streaming: boolean
}

export interface ProjectCodeFile {
  path: string
  code: string
}

export interface Project {
  id: string
  name: string
  code: ProjectCodeFile[]
  created_at: number
  updated_at: number
}

// ---- 对标 opencode SyncProvider 所需类型 ----

export interface Provider {
  id: string
  name: string
  model: string
  base_url: string
  connected: boolean
}

export interface Agent {
  id: string
  name: string
  description: string
}

export interface Command {
  id: string
  name: string
  description: string
  keybind?: string
}

export interface Config {
  [key: string]: string | number | boolean | undefined
}

export interface Todo {
  id: string
  session_id: string
  content: string
  status: "pending" | "in_progress" | "completed"
  created_at: number
}

export type PartType = "text" | "tool" | "reasoning" | "file" | "tool_call" | "tool_result" | "agent"

// ---- 对标 opencode SDK v2 的 Part 类型（渲染用） ----

export interface TextPart {
  id: string
  sessionID?: string
  messageID?: string
  type: "text"
  text: string
  synthetic?: boolean
  ignored?: boolean
}

export interface ReasoningPart {
  id: string
  sessionID?: string
  messageID?: string
  type: "reasoning"
  text: string
}

export interface ToolState {
  status: "running" | "completed" | "error"
  title?: string
  error?: string
  time: { start: number; completed?: number; compacted?: boolean }
}

export interface ToolPart {
  id: string
  sessionID?: string
  messageID?: string
  type: "tool"
  callID: string
  tool: string
  state: ToolState
  metadata?: Record<string, unknown>
  input?: Record<string, unknown>
}

export interface FilePart {
  id: string
  sessionID?: string
  messageID?: string
  type: "file"
  mime: string
  filename?: string
  url: string
}

/** 用于渲染 agent mention 徽标（如 @Code） */
export interface AgentRenderPart {
  id: string
  sessionID?: string
  messageID?: string
  type: "agent"
  name: string
}

/** 渲染用的 Part 联合类型 */
export type RenderPart = TextPart | ToolPart | ReasoningPart | FilePart | AgentRenderPart

// ---- 对标 opencode SDK 的 PartInput 类型（提交时使用，不含 id/sessionID/messageID） ----

export interface TextPartInput {
  type: "text"
  text: string
  synthetic?: boolean
}

export interface FilePartInput {
  type: "file"
  mime: string
  filename?: string
  url: string
  source?: {
    type?: string
    path: string
    text?: { value: string; start: number; end: number }
  }
}

export interface AgentPartInput {
  type: "agent"
  name: string
  source?: { value: string; start: number; end: number }
}

export type PartInput = TextPartInput | FilePartInput | AgentPartInput

/** 兼容旧版 flat Part 类型 */
export interface Part {
  id: string
  message_id: string
  type: PartType
  text?: string
  tool_name?: string
  tool_input?: string
  tool_output?: string
  created_at: number
}

export interface PermissionRequest {
  id: string
  session_id: string
  description: string
  created_at: number
  /** 工具权限请求携带的 tool 信息 */
  tool?: { callID: string; tool: string; title?: string }
  /** 回答回调 */
  reply?: (allowed: boolean) => void
}

export interface QuestionRequest {
  id: string
  session_id: string
  question: string
  options?: string[]
  /** 是否为多选题 */
  multiSelect?: boolean
  created_at: number
  /** 回答回调 */
  reply?: (answers: string[]) => void
}

export type SessionStatus = "idle" | "working" | "compacting"

export interface BootstrapData {
  provider: Provider[]
  agent: Agent[]
  config: Config
  session: Session[]
  command: Command[]
  session_status: Record<string, SessionStatus>
}

export interface SessionSyncData {
  session: Session
  messages: Array<Message & { parts: Part[] }>
  todos: Todo[]
}
