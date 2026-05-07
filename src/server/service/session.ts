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
    // 级联删除：先删 part（通过 message），再删 message/todo，最后删 session
    // 无 REFERENCES / ON DELETE CASCADE 约束，由代码层控制
    const msgIds = db.exec("SELECT id FROM message WHERE session_id = ?", [id])
    if (msgIds[0]?.values?.length) {
      const ids = msgIds[0].values.flat() as string[]
      const placeholders = ids.map(() => "?").join(",")
      db.run(`DELETE FROM part WHERE message_id IN (${placeholders})`, ids)
    }
    db.run("DELETE FROM message WHERE session_id = ?", [id])
    db.run("DELETE FROM todo WHERE session_id = ?", [id])
    db.run("DELETE FROM session WHERE id = ?", [id])
    scheduleSave()
  }

  /**
   * 对标 opencode message-v2.ts 的 User+Assistant 字段并集
   * 老入参 (id/sessionId/role/content/model) 完全兼容；新字段全部可选
   *
   * @param input.agent       共有 —— 当前 agent 名（对标 User.agent / Assistant.agent）
   * @param input.providerID  共有 —— 对标 User.model.providerID / Assistant.providerID
   * @param input.modelID     共有 —— 对标 User.model.modelID / Assistant.modelID（同时冗余写入老 model 列）
   * @param input.parentID    assistant 专属 —— 触发它的 user message id
   * @param input.path        assistant 专属 —— 当前 cwd / root（对标 Assistant.path）
   * @param input.system      user 专属 —— 系统提示（对标 User.system）
   * @param input.tools       user 专属 —— Record<string, boolean>（对标 User.tools）
   */
  async addMessage(input: {
    /** 可选：客户端预生成的 messageID（对标 opencode 的乐观更新场景），缺省时服务端 uuid 生成 */
    id?: string
    sessionId: string
    role: MessageEntity["role"]
    content: string
    /** @deprecated 透传到 model 列；新代码请用 modelID */
    model?: string
    agent?: string
    providerID?: string
    modelID?: string
    mode?: string
    parentID?: string
    path?: { cwd: string; root: string }
    system?: string
    tools?: Record<string, boolean>
  }): Promise<MessageEntity> {
    const now = Date.now()
    // modelID 优先用显式字段；缺省时回落到老的 model 字段以兼容老调用点
    const modelID = input.modelID ?? input.model ?? ""
    const msg: MessageEntity = {
      // ---- 通用 ----
      id: input.id ?? uuid(),
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      model: input.model ?? modelID,
      created_at: now,
      updated_at: now,
      // ---- 共有 ----
      agent: input.agent ?? "",
      provider_id: input.providerID ?? "",
      model_id: modelID,
      mode: input.mode ?? "",
      // ---- assistant 专属 ----
      parent_id: input.parentID ?? "",
      time_completed: 0,
      path_cwd: input.path?.cwd ?? "",
      path_root: input.path?.root ?? "",
      cost: 0,
      tokens: "",
      error: "",
      finish: "",
      // ---- user 专属 ----
      system: input.system ?? "",
      tools: input.tools ? JSON.stringify(input.tools) : "",
    }

    const db = getDb()
    db.run(
      `INSERT INTO message (
        id, session_id, role, content, model, created_at, updated_at,
        agent, provider_id, model_id, mode,
        parent_id, time_completed, path_cwd, path_root, cost, tokens, error, finish,
        system, tools
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        msg.id, msg.session_id, msg.role, msg.content, msg.model, msg.created_at, msg.updated_at,
        msg.agent, msg.provider_id, msg.model_id, msg.mode,
        msg.parent_id, msg.time_completed, msg.path_cwd, msg.path_root, msg.cost, msg.tokens, msg.error, msg.finish,
        msg.system, msg.tools,
      ],
    )

    // 更新 session 的 updated_at
    db.run("UPDATE session SET updated_at = ? WHERE id = ?", [now, input.sessionId])
    scheduleSave()

    return msg
  }

  /** 对标 opencode sessions.updateMessage —— 更新已存在 message 的 content（assistant 流式 complete 时用） */
  async updateMessageContent(id: string, content: string): Promise<void> {
    const db = getDb()
    const now = Date.now()
    db.run("UPDATE message SET content = ?, updated_at = ? WHERE id = ?", [content, now, id])
    scheduleSave()
  }

  /**
   * 对标 opencode Assistant.time.completed + cost + tokens + finish 一起落库
   * assistant 流式 complete 时一次性更新所有完成态字段
   */
  async updateAssistantCompletion(input: {
    id: string
    content: string
    /** 对标 Assistant.tokens —— 已是序列化好的 JSON 字符串，缺省不更新 */
    tokens?: string
    /** 对标 Assistant.cost，缺省不更新 */
    cost?: number
    /** 对标 Assistant.finish，缺省不更新 */
    finish?: string
    /** 对标 Assistant.error（JSON 字符串），缺省不更新 */
    error?: string
  }): Promise<void> {
    const db = getDb()
    const now = Date.now()
    // 动态拼 SET 段：只更新调用方明确传了的字段，其余保持原值
    const sets: string[] = ["content = ?", "updated_at = ?", "time_completed = ?"]
    const args: Array<string | number> = [input.content, now, now]
    if (input.tokens !== undefined) { sets.push("tokens = ?"); args.push(input.tokens) }
    if (input.cost !== undefined) { sets.push("cost = ?"); args.push(input.cost) }
    if (input.finish !== undefined) { sets.push("finish = ?"); args.push(input.finish) }
    if (input.error !== undefined) { sets.push("error = ?"); args.push(input.error) }
    args.push(input.id)
    db.run(`UPDATE message SET ${sets.join(", ")} WHERE id = ?`, args)
    scheduleSave()
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
