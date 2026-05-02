import type { ProjectCodeFile } from "../../shared/types.js"

export interface ProjectEntity {
  id: string
  name: string
  code: string // JSON string of ProjectCodeFile[]
  created_at: number
  updated_at: number
}

export function encodeCode(files: ProjectCodeFile[]): string {
  return JSON.stringify(files)
}

export function decodeCode(json: string): ProjectCodeFile[] {
  try {
    return JSON.parse(json) as ProjectCodeFile[]
  } catch {
    return []
  }
}
