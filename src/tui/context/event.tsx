// 对标 opencode 的 context/sdk.tsx 中的 SSE 逻辑 —— 事件 Context
// 从 IPC 订阅改为 HTTP SSE 订阅，对标 opencode 的 sdk.global.event()
//
// 性能关键设计：
// 1. flush 合并窗口 33ms（匹配 Ink 30fps 节流），避免每帧多次 dispatch
// 2. 使用 React unstable_batchedUpdates 将一批事件的 dispatch 合并为单次 commit
// 3. connected 状态用 ref 追踪，仅在变化时 setState，避免心跳每次触发重渲染
import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from "react"
import { useApi, type GlobalEvent } from "./api.js"

// React 批量更新 API（React 18+ 自动批量化，但手动调用确保在异步回调中也生效）
let batchedUpdates: <T>(fn: () => T) => T
try {
  // @ts-expect-error -- React 内部 API，React 19 中可能不存在但不会报错
  batchedUpdates = React.unstable_batchedUpdates ?? ((fn) => fn())
} catch {
  batchedUpdates = (fn) => fn()
}

type EventHandler = (data: unknown) => void

interface EventContextValue {
  on: (event: string, handler: EventHandler) => () => void
  off: (event: string, handler: EventHandler) => void
  /** SSE 连接状态 */
  connected: boolean
}

const EventCtx = createContext<EventContextValue | null>(null)

export function EventProvider({ children }: { children: React.ReactNode }) {
  const api = useApi()
  const listeners = useRef<Map<string, Set<EventHandler>>>(new Map())
  const [connected, setConnected] = useState(false)
  // 用 ref 追踪连接状态，避免心跳每次都触发 setConnected → React commit
  const connectedRef = useRef(false)

  useEffect(() => {
    const abort = new AbortController()
    let attempt = 0
    const retryDelay = 1000
    const maxRetryDelay = 30000
    let stopped = false
    let heartbeatTimer: NodeJS.Timeout | undefined

    let queue: GlobalEvent[] = []
    let timer: NodeJS.Timeout | undefined
    let last = 0

    // FLUSH_INTERVAL: 匹配 Ink 的 33ms (30fps) 节流窗口
    // 确保同一帧内的多个 SSE 事件合并为一次 React commit
    const FLUSH_INTERVAL = 33

    const flush = () => {
      if (queue.length === 0) return
      const events = queue
      queue = []
      timer = undefined
      last = Date.now()

      // 使用 batchedUpdates 将一批事件的所有 dispatch 合并为一次 React commit
      // 这样即使一批有 10 个 PART_DELTA，Ink 也只做一次全量重绘
      batchedUpdates(() => {
        for (const event of events) {
          const { type, properties } = event.payload
          const handlers = listeners.current.get(type)
          if (handlers) {
            for (const handler of handlers) {
              handler(properties)
            }
          }
        }
      })
    }

    const handleEvent = (event: GlobalEvent) => {
      queue.push(event)
      const elapsed = Date.now() - last

      if (timer) return
      if (elapsed < FLUSH_INTERVAL) {
        timer = setTimeout(flush, FLUSH_INTERVAL)
        return
      }
      flush()
    }

    // 收到 server.connected 或 server.heartbeat 时标记连接正常
    function markConnected() {
      // 仅在状态变化时调用 setState，避免心跳每次触发 React commit
      if (!connectedRef.current) {
        connectedRef.current = true
        setConnected(true)
      }
      // 15s 内没收到下一个心跳就判定断连（服务端每 10s 发一次）
      if (heartbeatTimer) clearTimeout(heartbeatTimer)
      heartbeatTimer = setTimeout(() => {
        if (!stopped) {
          connectedRef.current = false
          setConnected(false)
        }
      }, 15_000)
    }

    // 对标 opencode 的 startSSE() —— 指数退避重连
    async function startSSE() {
      while (!stopped) {
        try {
          const stream = api.global.event(abort.signal)
          for await (const event of stream) {
            if (stopped) break
            // server.connected / server.heartbeat 表示连接正常
            if (event.payload.type === "server.connected" || event.payload.type === "server.heartbeat") {
              markConnected()
            }
            handleEvent(event)
          }
        } catch {
          if (stopped) break
        }

        // SSE 流断开，标记断连
        if (connectedRef.current) {
          connectedRef.current = false
          setConnected(false)
        }
        if (heartbeatTimer) clearTimeout(heartbeatTimer)

        // 重连前先把积压事件刷完
        if (timer) clearTimeout(timer)
        if (queue.length > 0) flush()

        attempt += 1
        const backoff = Math.min(retryDelay * 2 ** (attempt - 1), maxRetryDelay)
        await new Promise((resolve) => setTimeout(resolve, backoff))
      }
    }

    startSSE().catch(() => {})

    return () => {
      stopped = true
      abort.abort()
      if (heartbeatTimer) clearTimeout(heartbeatTimer)
      if (timer) clearTimeout(timer)
      if (queue.length > 0) flush()
    }
  }, [api])

  const on = useCallback((event: string, handler: EventHandler) => {
    if (!listeners.current.has(event)) {
      listeners.current.set(event, new Set())
    }
    listeners.current.get(event)!.add(handler)
    return () => {
      listeners.current.get(event)?.delete(handler)
    }
  }, [])

  const off = useCallback((event: string, handler: EventHandler) => {
    listeners.current.get(event)?.delete(handler)
  }, [])

  return <EventCtx.Provider value={{ on, off, connected }}>{children}</EventCtx.Provider>
}

export function useEvent() {
  const ctx = useContext(EventCtx)
  if (!ctx) throw new Error("useEvent must be used within EventProvider")
  return ctx
}
