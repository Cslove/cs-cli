// 对标 opencode 的 context/sdk.tsx 中的 SSE 逻辑 —— 事件 Context
// 从 IPC 订阅改为 HTTP SSE 订阅，对标 opencode 的 sdk.global.event()
import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from "react"
import { useApi, type GlobalEvent } from "./api.js"

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

    const flush = () => {
      if (queue.length === 0) return
      const events = queue
      queue = []
      timer = undefined
      last = Date.now()
      for (const event of events) {
        const { type, properties } = event.payload
        const handlers = listeners.current.get(type)
        if (handlers) {
          for (const handler of handlers) {
            handler(properties)
          }
        }
      }
    }

    const handleEvent = (event: GlobalEvent) => {
      queue.push(event)
      const elapsed = Date.now() - last

      if (timer) return
      if (elapsed < 16) {
        timer = setTimeout(flush, 16)
        return
      }
      flush()
    }

    // 收到 server.connected 或 server.heartbeat 时标记连接正常
    function markConnected() {
      setConnected(true)
      // 15s 内没收到下一个心跳就判定断连（服务端每 10s 发一次）
      if (heartbeatTimer) clearTimeout(heartbeatTimer)
      heartbeatTimer = setTimeout(() => {
        if (!stopped) setConnected(false)
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
        setConnected(false)
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
