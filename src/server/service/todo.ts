// 对标 opencode 的 session/todo 相关服务 —— 会话待办事项
import { Provide, Scope, ScopeEnum, Init } from "@midwayjs/core"
import { v4 as uuid } from "uuid"
import { getDb, scheduleSave } from "../../storage/database.js"
import type { TodoEntity } from "../entity/todo.js"
import type { Todo } from "../../shared/types.js"

@Provide()
@Scope(ScopeEnum.Singleton)
export class TodoService {
  @Init()
  async init() {
    getDb()
  }

  async list(sessionId: string): Promise<TodoEntity[]> {
    const db = getDb()
    const stmt = db.prepare("SELECT * FROM todo WHERE session_id = ? ORDER BY created_at ASC")
    stmt.bind([sessionId])
    const results: TodoEntity[] = []
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as TodoEntity)
    }
    stmt.free()
    return results
  }

  async create(sessionId: string, content: string, status: TodoEntity["status"] = "pending"): Promise<TodoEntity> {
    const todo: TodoEntity = {
      id: uuid(),
      session_id: sessionId,
      content,
      status,
      created_at: Date.now(),
    }
    const db = getDb()
    db.run(
      "INSERT INTO todo (id, session_id, content, status, created_at) VALUES (?, ?, ?, ?, ?)",
      [todo.id, todo.session_id, todo.content, todo.status, todo.created_at],
    )
    scheduleSave()
    return todo
  }

  async updateStatus(id: string, status: TodoEntity["status"]): Promise<void> {
    const db = getDb()
    db.run("UPDATE todo SET status = ? WHERE id = ?", [status, id])
    scheduleSave()
  }

  async remove(id: string): Promise<void> {
    const db = getDb()
    db.run("DELETE FROM todo WHERE id = ?", [id])
    scheduleSave()
  }

  /** 批量替换 session 的 todos（对标 opencode 的 todo.updated 事件全量更新） */
  async replaceAll(sessionId: string, todos: Array<Pick<Todo, "content" | "status">>): Promise<TodoEntity[]> {
    const db = getDb()
    db.run("DELETE FROM todo WHERE session_id = ?", [sessionId])

    const results: TodoEntity[] = []
    for (const t of todos) {
      const todo: TodoEntity = {
        id: uuid(),
        session_id: sessionId,
        content: t.content,
        status: t.status,
        created_at: Date.now(),
      }
      db.run(
        "INSERT INTO todo (id, session_id, content, status, created_at) VALUES (?, ?, ?, ?, ?)",
        [todo.id, todo.session_id, todo.content, todo.status, todo.created_at],
      )
      results.push(todo)
    }
    scheduleSave()
    return results
  }
}
