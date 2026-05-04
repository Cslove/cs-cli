// TUI 调试日志工具 —— 写入文件，不干扰 Ink 渲染
//
// 使用方式：
//   import { debug } from "../util/debug.js"
//   debug("SSE event", event.type, data)
//   debug.count("render")           // 计数器
//   debug.time("fetch")             // 计时器
//   debug.timeEnd("fetch")         // 输出耗时
//
// 查看日志：
//   tail -f /tmp/cs-debug.log
//
// 环境变量控制：
//   CS_DEBUG=1  启用调试日志（默认关闭）
//   CS_DEBUG_FILE=/tmp/custom.log  自定义日志路径

import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const ENABLED = process.env.CS_DEBUG === "1"
const LOG_FILE = process.env.CS_DEBUG_FILE ?? path.join(os.tmpdir(), "cs-debug.log")

// 计数器和计时器
const counters = new Map<string, number>()
const timers = new Map<string, number>()

function timestamp(): string {
  const d = new Date()
  return d.toTimeString().split(" ")[0] + "." + String(d.getMilliseconds()).padStart(3, "0")
}

function write(level: string, ...args: unknown[]) {
  if (!ENABLED) return
  const prefix = `[${timestamp()}] [${level}]`
  const line = [prefix, ...args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))].join(" ")
  try {
    fs.appendFileSync(LOG_FILE, line + "\n")
  } catch {
    // 写入失败则静默忽略
  }
}

export const debug = {
  /** 常规日志 */
  log: (...args: unknown[]) => write("LOG", ...args),

  /** 警告 */
  warn: (...args: unknown[]) => write("WRN", ...args),

  /** 错误 */
  error: (...args: unknown[]) => write("ERR", ...args),

  /** 计数器：每次调用 +1 并输出当前计数 */
  count: (label: string) => {
    const n = (counters.get(label) ?? 0) + 1
    counters.set(label, n)
    write("CNT", `${label}: ${n}`)
  },

  /** 开始计时 */
  time: (label: string) => {
    timers.set(label, performance.now())
  },

  /** 结束计时并输出耗时（ms） */
  timeEnd: (label: string) => {
    const start = timers.get(label)
    if (start === undefined) return
    timers.delete(label)
    write("TMR", `${label}: ${(performance.now() - start).toFixed(2)}ms`)
  },

  /** 清空日志文件 */
  clear: () => {
    try {
      fs.writeFileSync(LOG_FILE, "")
    } catch {
      // 静默
    }
  },

  /** 日志文件路径 */
  get logFile() {
    return LOG_FILE
  },

  /** 是否已启用 */
  get enabled() {
    return ENABLED
  },
}

// 启动时写一条分隔线
if (ENABLED) {
  debug.clear()
  debug.log("=== CS Debug Log Started ===")
  debug.log(`Log file: ${LOG_FILE}`)
  debug.log(`PID: ${process.pid}`)
}
