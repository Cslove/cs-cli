export interface TodoEntity {
  id: string
  session_id: string
  content: string
  status: "pending" | "in_progress" | "completed"
  created_at: number
}
