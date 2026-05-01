export interface Session {
  id: string
  title: string
  model: string
  project_path: string
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
