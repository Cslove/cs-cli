// 对标 opencode 的 server/server.ts 中的 Midway 配置
import { Configuration, Inject } from "@midwayjs/core"
import * as koa from "@midwayjs/koa"
import * as validate from "@midwayjs/validate"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { EventService } from "./service/event.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

@Configuration({
  imports: [koa, validate],
  importConfigs: [join(__dirname, "config")],
})
export class ContainerConfiguration {
  @Inject()
  eventService!: EventService

  async onReady() {
    const { initDatabase, getDb, scheduleSave } = await import("../storage/database.js")
    await initDatabase()
    // 确保至少有一个默认项目，避免 list 请求中创建导致 500 + 事件循环阻塞
    const db = getDb()
    const stmt = db.prepare("SELECT id FROM project LIMIT 1")
    const hasProject = stmt.step()
    stmt.free()
    if (!hasProject) {
      const { v4: uuid } = await import("uuid")
      const now = Date.now()
      const id = uuid()
      db.run(
        "INSERT INTO project (id, name, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [id, "default", "[]", now, now],
      )
      scheduleSave()
    }
  }

  async onStop() {
    // 对标 opencode 的 server.instance.disposed —— 通知 TUI 重新 bootstrap
    this.eventService.emit("server.instance.disposed", {})
  }
}
