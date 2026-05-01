import { getDb, saveDatabase } from "./database.js"

const MIGRATIONS: Array<{ version: number; up: string }> = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS _migration (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `,
  },
]

export function runMigrations() {
  const db = getDb()

  db.run(`
    CREATE TABLE IF NOT EXISTS _migration (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `)

  // 获取已应用的版本
  const applied = new Set<number>()
  const stmt = db.prepare("SELECT version FROM _migration")
  while (stmt.step()) {
    const row = stmt.getAsObject() as { version: number }
    applied.add(row.version)
  }
  stmt.free()

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    db.run(migration.up)
    db.run("INSERT INTO _migration (version, applied_at) VALUES (?, ?)", [migration.version, Date.now()])
  }

  saveDatabase()
}
