import initSqlJs, { type Database as SqlJsDatabase } from "sql.js"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"

let db: SqlJsDatabase
let dbPath: string
let saveTimer: NodeJS.Timeout | undefined

// 对标 opencode 的 storage/storage.ts —— 简化版 SQLite 存储（sql.js WASM）
export async function initDatabase() {
  const dbDir = path.join(os.homedir(), ".cs")
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  dbPath = path.join(dbDir, "data.db")

  const SQL = await initSqlJs()

  // 如果已有数据库文件，加载它
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  runMigrations()
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error("Database not initialized")
  return db
}

export function closeDatabase() {
  if (db) {
    saveDatabase()
    db.close()
  }
}

export function saveDatabase() {
  if (!db || !dbPath) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

/** 延迟写入：合并短时间内的多次写操作为一次磁盘写入，避免事件循环阻塞 */
export function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    saveDatabase()
  }, 500)
  saveTimer.unref()
}

function runMigrations() {
  // 建表只做最简定义：列名 + 类型 + PRIMARY KEY
  // 无 REFERENCES / CHECK / ON DELETE CASCADE 等约束
  // 所有关联、校验、级联删除逻辑由代码层控制，保持最大向后兼容性

  db.run(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '0.0.0',
      title TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL DEFAULT '',
      parent_id TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  // message 表字段对齐 opencode message-v2.ts 的 User+Assistant 字段并集
  // 所有新增列都给 SQL DEFAULT，确保 ALTER TABLE 后老数据查询也能正常返回
  db.run(`
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0,
      agent TEXT NOT NULL DEFAULT '',
      provider_id TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT '',
      parent_id TEXT NOT NULL DEFAULT '',
      time_completed INTEGER NOT NULL DEFAULT 0,
      path_cwd TEXT NOT NULL DEFAULT '',
      path_root TEXT NOT NULL DEFAULT '',
      cost REAL NOT NULL DEFAULT 0,
      tokens TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      finish TEXT NOT NULL DEFAULT '',
      system TEXT NOT NULL DEFAULT '',
      tools TEXT NOT NULL DEFAULT ''
    );
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_message_session ON message(session_id);
  `)

  // 老数据库列迁移：ALTER TABLE ADD COLUMN 对已存在的表安全
  // sql.js 不支持 IF NOT EXISTS 语法，用 try/catch 吞掉"列已存在"错误
  for (const col of [
    "updated_at INTEGER NOT NULL DEFAULT 0",
    "agent TEXT NOT NULL DEFAULT ''",
    "provider_id TEXT NOT NULL DEFAULT ''",
    "model_id TEXT NOT NULL DEFAULT ''",
    "mode TEXT NOT NULL DEFAULT ''",
    "parent_id TEXT NOT NULL DEFAULT ''",
    "time_completed INTEGER NOT NULL DEFAULT 0",
    "path_cwd TEXT NOT NULL DEFAULT ''",
    "path_root TEXT NOT NULL DEFAULT ''",
    "cost REAL NOT NULL DEFAULT 0",
    "tokens TEXT NOT NULL DEFAULT ''",
    "error TEXT NOT NULL DEFAULT ''",
    "finish TEXT NOT NULL DEFAULT ''",
    "system TEXT NOT NULL DEFAULT ''",
    "tools TEXT NOT NULL DEFAULT ''",
  ]) {
    try { db.run(`ALTER TABLE message ADD COLUMN ${col}`) } catch {}
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS project (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      tool_name TEXT NOT NULL DEFAULT '',
      tool_input TEXT NOT NULL DEFAULT '',
      tool_output TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_part_message ON part(message_id);
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS todo (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_todo_session ON todo(session_id);
  `)

  // 列迁移：ALTER TABLE ADD COLUMN 对已存在的表安全，不会影响已有数据
  try { db.run("ALTER TABLE session ADD COLUMN slug TEXT NOT NULL DEFAULT ''") } catch {}
  try { db.run("ALTER TABLE session ADD COLUMN version TEXT NOT NULL DEFAULT '0.0.0'") } catch {}
  try { db.run("ALTER TABLE session ADD COLUMN parent_id TEXT DEFAULT NULL") } catch {}
  // 旧表列名 project_path → project_id，新表 CREATE TABLE 已用 project_id
  try { db.run("ALTER TABLE session RENAME COLUMN project_path TO project_id") } catch {}

  saveDatabase()
}
