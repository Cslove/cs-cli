// 对标 opencode 的 component/prompt/history.tsx —— 输入历史记录
// 支持上下翻页浏览历史输入，对标 shell 的 history 功能
// 持久化使用 KVProvider 而非 JSONL 文件
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react"
import { useKV } from "./kv.js"

// ---- Types ----

export interface PromptInfo {
  input: string
  mode?: "normal" | "shell"
  parts?: Array<{ type: string; [key: string]: unknown }>
}

const MAX_ENTRIES = 50
const KV_KEY = "prompt-history"

// ---- Context ----

interface PromptHistoryContextValue {
  /** 向上/下浏览历史，返回匹配的历史条目或 undefined */
  move(direction: 1 | -1, currentInput: string): PromptInfo | undefined
  /** 追加一条历史记录 */
  append(item: PromptInfo): void
  /** 获取所有历史记录 */
  history: PromptInfo[]
}

const PromptHistoryCtx = createContext<PromptHistoryContextValue | null>(null)

// ---- Provider ----

export function PromptHistoryProvider({ children }: { children: React.ReactNode }) {
  const kv = useKV()
  const [history, setHistory] = useState<PromptInfo[]>([])
  const [index, setIndex] = useState(0)

  // KV 就绪后加载
  useEffect(() => {
    if (kv.ready) {
      setHistory(kv.get(KV_KEY, []))
    }
  }, [kv.ready])

  const persist = useCallback((next: PromptInfo[]) => {
    kv.set(KV_KEY, next)
  }, [kv])

  const move = useCallback((direction: 1 | -1, currentInput: string): PromptInfo | undefined => {
    if (!history.length) return undefined

    // 如果当前输入与历史中指向的条目不同，且有内容，则不移动
    const current = history.at(index)
    if (current && current.input !== currentInput && currentInput.length) return undefined

    const next = index + direction
    if (Math.abs(next) > history.length) return undefined
    if (next > 0) return undefined

    setIndex(next)

    // index 0 表示"当前输入"，返回空
    if (next === 0) return { input: "", parts: [] }
    return history.at(next)
  }, [history, index])

  const append = useCallback((item: PromptInfo) => {
    setHistory((prev) => {
      const next = [...prev, { ...item }]
      // 超出上限时截断
      const trimmed = next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
      persist(trimmed)
      return trimmed
    })
    setIndex(0)
  }, [persist])

  const value = useMemo(() => ({ move, append, history }), [move, append, history])

  return (
    <PromptHistoryCtx.Provider value={value}>
      {children}
    </PromptHistoryCtx.Provider>
  )
}

export function usePromptHistory() {
  const ctx = useContext(PromptHistoryCtx)
  if (!ctx) throw new Error("usePromptHistory must be used within PromptHistoryProvider")
  return ctx
}
