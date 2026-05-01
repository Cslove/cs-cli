import initSqlJs, { type Database as SqlJsDatabase } from "sql.js"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"

let db: SqlJsDatabase
let dbPath: string

// 对标 opencode 的 storage/storage.ts —— 简化版 SQLite 存储（sql.js WASM）
export async function initDatabase() {
  const dbDir = path.join(os.homedir(), ".sirong")
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

function runMigrations() {
  db.run(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      project_path TEXT NOT NULL DEFAULT '',
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

  saveDatabase()
}
