// 对标 opencode 的 session/session.ts 中的 Session 实体定义
export interface SessionEntity {
  id: string
  title: string
  model: string
  project_path: string
  created_at: number
  updated_at: number
}
