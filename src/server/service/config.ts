// 对标 opencode 的 config 相关服务 —— 应用配置
import { Provide, Scope, ScopeEnum, Init } from "@midwayjs/core"
import { getDb, scheduleSave } from "../../storage/database.js"
import type { ConfigEntity } from "../entity/config.js"
import type { Config } from "../../shared/types.js"

@Provide()
@Scope(ScopeEnum.Singleton)
export class ConfigService {
  @Init()
  async init() {
    getDb()
  }

  /** 获取全部配置，返回 key-value map */
  getAll(): Config {
    const db = getDb()
    const stmt = db.prepare("SELECT * FROM config")
    const config: Config = {}
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as ConfigEntity
      try {
        config[row.key] = JSON.parse(row.value) as string | number | boolean
      } catch {
        config[row.key] = row.value
      }
    }
    stmt.free()
    return config
  }

  get(key: string): string | number | boolean | undefined {
    const db = getDb()
    const stmt = db.prepare("SELECT value FROM config WHERE key = ?")
    stmt.bind([key])
    let result: string | number | boolean | undefined
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as ConfigEntity
      try {
        result = JSON.parse(row.value) as string | number | boolean
      } catch {
        result = row.value
      }
    }
    stmt.free()
    return result
  }

  set(key: string, value: string | number | boolean): void {
    const db = getDb()
    const serialized = typeof value === "string" ? value : JSON.stringify(value)
    db.run("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", [key, serialized])
    scheduleSave()
  }

  remove(key: string): void {
    const db = getDb()
    db.run("DELETE FROM config WHERE key = ?", [key])
    scheduleSave()
  }
}
