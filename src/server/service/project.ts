import { Provide, Scope, ScopeEnum, Init } from "@midwayjs/core"
import { v4 as uuid } from "uuid"
import { getDb, scheduleSave } from "../../storage/database.js"
import { decodeCode, encodeCode } from "../entity/project.js"
import type { ProjectEntity } from "../entity/project.js"
import type { Project, ProjectCodeFile } from "../../shared/types.js"

@Provide()
@Scope(ScopeEnum.Singleton)
export class ProjectService {
  @Init()
  async init() {
    getDb()
  }

  async list(): Promise<Array<Pick<Project, "id" | "name" | "created_at" | "updated_at">>> {
    const db = getDb()
    const stmt = db.prepare("SELECT id, name, created_at, updated_at FROM project ORDER BY updated_at DESC")
    const results: Array<Pick<Project, "id" | "name" | "created_at" | "updated_at">> = []
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as Omit<ProjectEntity, "code">
      results.push(row)
    }
    stmt.free()
    return results
  }

  /** 服务启动时确保至少有一个默认项目，不在 list 请求中创建 */
  async ensureDefault(): Promise<void> {
    const db = getDb()
    const stmt = db.prepare("SELECT id FROM project LIMIT 1")
    const hasProject = stmt.step()
    stmt.free()
    if (!hasProject) {
      await this.create("default")
    }
  }

  async get(id: string): Promise<Project | undefined> {
    const db = getDb()
    const stmt = db.prepare("SELECT * FROM project WHERE id = ?")
    stmt.bind([id])
    let result: Project | undefined
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as ProjectEntity
      result = { ...row, code: decodeCode(row.code) }
    }
    stmt.free()
    return result
  }

  async create(name: string, code?: ProjectCodeFile[]): Promise<Project> {
    const now = Date.now()
    const id = uuid()
    const codeJson = encodeCode(code ?? [])

    const db = getDb()
    db.run(
      "INSERT INTO project (id, name, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [id, name, codeJson, now, now],
    )
    scheduleSave()

    return { id, name, code: code ?? [], created_at: now, updated_at: now }
  }

  async update(id: string, input: { name?: string; code?: ProjectCodeFile[] }): Promise<Project> {
    const existing = await this.get(id)
    if (!existing) throw new Error("Project not found")

    const name = input.name ?? existing.name
    const code = input.code ?? existing.code
    const codeJson = encodeCode(code)
    const now = Date.now()

    const db = getDb()
    db.run(
      "UPDATE project SET name = ?, code = ?, updated_at = ? WHERE id = ?",
      [name, codeJson, now, id],
    )
    scheduleSave()

    return { id, name, code, created_at: existing.created_at, updated_at: now }
  }
}
