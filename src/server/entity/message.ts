// 对标 opencode 的 session/message.ts 中的 Message 实体定义
export interface MessageEntity {
  id: string
  session_id: string
  role: "user" | "assistant" | "system"
  content: string
  model: string
  created_at: number
}
