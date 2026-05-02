// 对标 opencode 的 session/message/part 相关服务 —— 消息分片
import { Provide, Scope, ScopeEnum, Init } from "@midwayjs/core"
import { v4 as uuid } from "uuid"
import { getDb, scheduleSave } from "../../storage/database.js"
import type { PartEntity } from "../entity/part.js"
import type { Part } from "../../shared/types.js"

@Provide()
@Scope(ScopeEnum.Singleton)
export class PartService {
  @Init()
  async init() {
    getDb()
  }

  async list(messageId: string): Promise<PartEntity[]> {
    const db = getDb()
    const stmt = db.prepare("SELECT * FROM part WHERE message_id = ? ORDER BY created_at ASC")
    stmt.bind([messageId])
    const results: PartEntity[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as PartEntity)
    }
    stmt.free()
    return results
  }

  async create(input: {
    messageId: string
    type: PartEntity["type"]
    text?: string
    tool_name?: string
    tool_input?: string
  }): Promise<PartEntity> {
    const part: PartEntity = {
      id: uuid(),
      message_id: input.messageId,
      type: input.type,
      text: input.text ?? "",
      tool_name: input.tool_name ?? "",
      tool_input: input.tool_input ?? "",
      tool_output: "",
      created_at: Date.now(),
    }
    const db = getDb()
    db.run(
      "INSERT INTO part (id, message_id, type, text, tool_name, tool_input, tool_output, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [part.id, part.message_id, part.type, part.text, part.tool_name, part.tool_input, part.tool_output, part.created_at],
    )
    scheduleSave()
    return part
  }

  async updateText(id: string, text: string): Promise<void> {
    const db = getDb()
    db.run("UPDATE part SET text = ? WHERE id = ?", [text, id])
    scheduleSave()
  }

  /** 对标 opencode 的 message.part.delta —— 追加文本增量 */
  async appendText(id: string, delta: string): Promise<void> {
    const db = getDb()
    db.run("UPDATE part SET text = text || ? WHERE id = ?", [delta, id])
    scheduleSave()
  }

  async updateToolOutput(id: string, output: string): Promise<void> {
    const db = getDb()
    db.run("UPDATE part SET tool_output = ? WHERE id = ?", [output, id])
    scheduleSave()
  }

  async remove(id: string): Promise<void> {
    const db = getDb()
    db.run("DELETE FROM part WHERE id = ?", [id])
    scheduleSave()
  }

  /** 批量获取多个 message 的 parts（用于 session sync） */
  async listBySession(sessionId: string): Promise<Record<string, PartEntity[]>> {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT p.* FROM part p
      JOIN message m ON p.message_id = m.id
      WHERE m.session_id = ?
      ORDER BY p.created_at ASC
    `)
    stmt.bind([sessionId])
    const result: Record<string, PartEntity[]> = {}
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as PartEntity
      if (!result[row.message_id]) result[row.message_id] = []
      result[row.message_id].push(row)
    }
    stmt.free()
    return result
  }
}
