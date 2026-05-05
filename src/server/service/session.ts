// 对标 opencode 的 session/session.ts —— 会话服务
import { Provide, Scope, ScopeEnum, Init } from "@midwayjs/core"
import { v4 as uuid } from "uuid"
import { getDb, scheduleSave } from "../../storage/database.js"
import type { SessionEntity } from "../entity/session.js"
import type { MessageEntity } from "../entity/message.js"

// 降序 ID：用 (MAX_TIMESTAMP - now) 作为前缀，使最新 session 的 ID 字符串最大
// list 查询时 ORDER BY id DESC 即按创建时间从新到旧排列
const MAX_TIMESTAMP = 9999999999999 // 13位时间戳上限

function createSessionID(): string {
  const now = Date.now()
  const prefix = (MAX_TIMESTAMP - now).toString().padStart(13, "0")
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${suffix}`
}

// 生成 URL 友好的短标识（3组随机字母数字）
function createSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  const pick = () => Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  return `${pick()}-${pick()}-${pick()}`
}

export interface SessionCreateInput {
  title?: string
  parentID?: string
}

function createDefaultTitle(isSubSession: boolean): string {
  return isSubSession ? "Sub-session" : "New Session"
}

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
      const stmt = db.prepare("SELECT * FROM session WHERE project_id = ? ORDER BY id DESC")
      stmt.bind([projectPath])
      const results: SessionEntity[] = []
      while (stmt.step()) {
        results.push(stmt.getAsObject() as unknown as SessionEntity)
      }
      stmt.free()
      return results
    }
    const stmt = db.prepare("SELECT * FROM session ORDER BY id DESC")
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

  async create(input?: SessionCreateInput): Promise<SessionEntity> {
    const now = Date.now()
    const isSubSession = !!input?.parentID
    const session: SessionEntity = {
      id: createSessionID(),                                              // 对标 opencode SessionID.descending()
      slug: createSlug(),                                                 // 对标 opencode Slug.create()
      version: process.env.npm_package_version ?? "0.0.0",               // 对标 opencode InstallationVersion
      title: input?.title ?? createDefaultTitle(isSubSession),           // 对标 opencode createDefaultTitle()
      model: process.env.CS_MODEL ?? "gpt-4o",
      project_id: process.env.CS_PROJECT ?? "",
      parent_id: input?.parentID ?? null,                                 // 对标 opencode input.parentID
      created_at: now,
      updated_at: now,
    }

    const db = getDb()
    db.run(
      "INSERT INTO session (id, slug, version, title, model, project_id, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [session.id, session.slug, session.version, session.title, session.model, session.project_id, session.parent_id, session.created_at, session.updated_at],
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
