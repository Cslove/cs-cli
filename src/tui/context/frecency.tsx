// 对标 opencode 的 component/prompt/frecency.tsx —— 文件访问频率+时间衰减评分
// 用于自动补全中按 frecency 排序（频繁+最近访问的文件排名更高）
// 持久化使用 KVProvider 而非 JSONL 文件
import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useKV } from "./kv.js"

// ---- Frecency Algorithm ----

interface FrecencyEntry {
  frequency: number
  lastOpen: number
}

function calculateFrecency(entry?: FrecencyEntry): number {
  if (!entry) return 0
  const daysSince = (Date.now() - entry.lastOpen) / 86400000
  const weight = 1 / (1 + daysSince)
  return entry.frequency * weight
}

const MAX_ENTRIES = 1000
const KV_KEY = "frecency"

// ---- Context ----

interface FrecencyContextValue {
  /** 获取指定路径的 frecency 分数 */
  getFrecency(filePath: string): number
  /** 更新指定路径的 frecency（访问+1） */
  updateFrecency(filePath: string): void
  /** 获取所有数据 */
  data: Record<string, FrecencyEntry>
}

const FrecencyCtx = createContext<FrecencyContextValue | null>(null)

// ---- Provider ----

export function FrecencyProvider({ children }: { children: React.ReactNode }) {
  const kv = useKV()
  const [data, setData] = useState<Record<string, FrecencyEntry>>(() => kv.get(KV_KEY, {}))

  // KV 就绪后加载
  useEffect(() => {
    if (kv.ready) {
      setData(kv.get(KV_KEY, {}))
    }
  }, [kv.ready])

  const persist = useCallback((next: Record<string, FrecencyEntry>) => {
    kv.set(KV_KEY, next)
  }, [kv])

  const getFrecency = useCallback((filePath: string): number => {
    return calculateFrecency(data[filePath])
  }, [data])

  const updateFrecency = useCallback((filePath: string) => {
    setData((prev) => {
      const entry = prev[filePath]
      const newEntry: FrecencyEntry = {
        frequency: (entry?.frequency ?? 0) + 1,
        lastOpen: Date.now(),
      }
      let next = { ...prev, [filePath]: newEntry }

      // 超过上限时淘汰最旧的条目
      if (Object.keys(next).length > MAX_ENTRIES) {
        const sorted = Object.entries(next)
          .sort(([, a], [, b]) => b.lastOpen - a.lastOpen)
          .slice(0, MAX_ENTRIES)
        next = Object.fromEntries(sorted)
      }

      persist(next)
      return next
    })
  }, [persist])

  return (
    <FrecencyCtx.Provider value={{ getFrecency, updateFrecency, data }}>
      {children}
    </FrecencyCtx.Provider>
  )
}

export function useFrecency() {
  const ctx = useContext(FrecencyCtx)
  if (!ctx) throw new Error("useFrecency must be used within FrecencyProvider")
  return ctx
}
