// 对标 opencode 的 context/kv.tsx —— 轻量 KV 持久化存储
import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import { readFile, writeFile, rename, rm, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { homedir } from "node:os"

const KV_DIR = join(homedir(), ".cs")
const KV_FILE = join(KV_DIR, "kv.json")

type KVStore = Record<string, any>

interface KVContext {
  get: <T = any>(key: string, defaultValue?: T) => T
  set: (key: string, value: any) => void
  ready: boolean
}

const ctx = createContext<KVContext | null>(null)

export function KVProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<KVStore>({})
  const [ready, setReady] = useState(false)
  // 串行化写入，防止快速连续 set 时并发写入冲突
  const [writeQueue] = useState(() => ({ current: Promise.resolve() }))

  // 启动时读取持久化数据
  useEffect(() => {
    readFile(KV_FILE, "utf-8")
      .then((text) => {
        setStore(JSON.parse(text))
      })
      .catch(() => {
        // 文件不存在或解析失败，使用空 store
      })
      .finally(() => setReady(true))
  }, [])

  // 原子写入：先写临时文件再 rename，防止中断导致文件损坏
  const persist = useCallback((snapshot: KVStore) => {
    writeQueue.current = writeQueue.current
      .then(async () => {
        await mkdir(KV_DIR, { recursive: true })
        const tmpPath = `${KV_FILE}.${process.pid}.${Date.now()}.tmp`
        await writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf-8")
        await rename(tmpPath, KV_FILE)
      })
      .catch(async (error) => {
        console.error("Failed to persist KV state", error)
      })
  }, [writeQueue])

  const get = useCallback<KVContext["get"]>((key, defaultValue) => {
    const val = store[key]
    return val !== undefined ? val : defaultValue
  }, [store])

  const set = useCallback<KVContext["set"]>((key, value) => {
    setStore((prev) => {
      const next = { ...prev, [key]: value }
      persist(next)
      return next
    })
  }, [persist])

  return (
    <ctx.Provider value={{ get, set, ready }}>
      {children}
    </ctx.Provider>
  )
}

export function useKV() {
  const value = useContext(ctx)
  if (!value) throw new Error("useKV must be used within a KVProvider")
  return value
}
