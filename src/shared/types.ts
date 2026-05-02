export interface Session {
  id: string
  title: string
  model: string
  project_id: string
  created_at: number
  updated_at: number
}

export interface Message {
  id: string
  session_id: string
  role: "user" | "assistant" | "system"
  content: string
  model: string
  created_at: number
}

export interface ChatPromptRequest {
  sessionId: string
  content: string
  model?: string
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

export type PartType = "text" | "tool_call" | "tool_result"

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
}

export interface QuestionRequest {
  id: string
  session_id: string
  question: string
  created_at: number
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
