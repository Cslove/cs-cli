export interface SessionEntity {
  id: string
  slug: string
  version: string
  title: string
  model: string
  project_id: string
  parent_id: string | null
  created_at: number
  updated_at: number
}
