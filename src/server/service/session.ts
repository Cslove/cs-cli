// 对标 opencode 的 session/session.ts —— 会话服务
import { Provide, Scope, ScopeEnum, Init } from "@midwayjs/core"
import { v4 as uuid } from "uuid"
import { getDb, scheduleSave } from "../../storage/database.js"
import type { SessionEntity } from "../entity/session.js"
import type { MessageEntity } from "../entity/message.js"

@Provide()
@Scope(ScopeEnum.Singleton)
export class SessionService {
  @Init()
  async init() {
    // 确保数据库已初始化
    getDb()
  }

  async list(projectPath?: string): Promise<SessionEntity[]> {
    const db = getDb()
    if (projectPath) {
      const stmt = db.prepare("SELECT * FROM session WHERE project_path = ? ORDER BY updated_at DESC")
      stmt.bind([projectPath])
      const results: SessionEntity[] = []
      while (stmt.step()) {
        results.push(stmt.getAsObject() as unknown as SessionEntity)
      }
      stmt.free()
      return results
    }
    const stmt = db.prepare("SELECT * FROM session ORDER BY updated_at DESC")
    const results: SessionEntity[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as SessionEntity)
    }
    stmt.free()
    return results
  }

  async get(id: string): Promise<SessionEntity | undefined> {
    const db = getDb()
    const stmt = db.prepare("SELECT * FROM session WHERE id = ?")
    stmt.bind([id])
    let result: SessionEntity | undefined
    if (stmt.step()) {
      result = stmt.getAsObject() as unknown as SessionEntity
    }
    stmt.free()
    return result
  }

  async getOrCreate(id: string): Promise<SessionEntity> {
    const existing = await this.get(id)
    if (existing) return existing
    return this.create()
  }

  async create(title?: string): Promise<SessionEntity> {
    const now = Date.now()
    const session: SessionEntity = {
      id: uuid(),
      title: title ?? "New Session",
      model: process.env.CS_MODEL ?? "gpt-4o",
      project_path: process.env.CS_PROJECT ?? "",
      created_at: now,
      updated_at: now,
    }

    const db = getDb()
    db.run(
      "INSERT INTO session (id, title, model, project_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [session.id, session.title, session.model, session.project_path, session.created_at, session.updated_at],
    )
    scheduleSave()

    return session
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const db = getDb()
    db.run("UPDATE session SET title = ?, updated_at = ? WHERE id = ?", [title, Date.now(), id])
    scheduleSave()
  }

  async remove(id: string): Promise<void> {
    const db = getDb()
    db.run("DELETE FROM session WHERE id = ?", [id])
    scheduleSave()
  }

  async addMessage(input: {
    sessionId: string
    role: MessageEntity["role"]
    content: string
    model?: string
  }): Promise<MessageEntity> {
    const msg: MessageEntity = {
      id: uuid(),
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      model: input.model ?? "",
      created_at: Date.now(),
    }

    const db = getDb()
    db.run(
      "INSERT INTO message (id, session_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [msg.id, msg.session_id, msg.role, msg.content, msg.model, msg.created_at],
    )

    // 更新 session 的 updated_at
    db.run("UPDATE session SET updated_at = ? WHERE id = ?", [Date.now(), input.sessionId])
    scheduleSave()

    return msg
  }

  async getMessages(sessionId: string): Promise<MessageEntity[]> {
    const db = getDb()
    const stmt = db.prepare("SELECT * FROM message WHERE session_id = ? ORDER BY created_at ASC")
    stmt.bind([sessionId])
    const results: MessageEntity[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as MessageEntity)
    }
    stmt.free()
    return results
  }

  async getChatMessages(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    const messages = await this.getMessages(sessionId)
    return messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }))
  }
}
