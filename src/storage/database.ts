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
  db.run(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_message_session ON message(session_id);
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS project (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('text', 'tool_call', 'tool_result')),
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
      session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
      created_at INTEGER NOT NULL
    );
  `)

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_todo_session ON todo(session_id);
  `)

  saveDatabase()
}
