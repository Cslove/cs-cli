// 对标 opencode 的 context/event.ts + context/sdk.tsx 中的 SSE 逻辑 —— IPC 事件 Context
import React, { createContext, useContext, useEffect, useRef, useCallback } from "react"
import type { IpcBridge } from "../../shared/ipc.js"

type EventHandler = (data: unknown) => void

interface EventContextValue {
  on: (event: string, handler: EventHandler) => () => void
  off: (event: string, handler: EventHandler) => void
}

const EventCtx = createContext<EventContextValue | null>(null)

export function EventProvider({ ipcBridge, children }: { ipcBridge: IpcBridge; children: React.ReactNode }) {
  const listeners = useRef<Map<string, Set<EventHandler>>>(new Map())

  useEffect(() => {
    const unsubscribe = ipcBridge.on("event", (msg: unknown) => {
      const { event, data } = msg as { event: string; data: unknown }
      const handlers = listeners.current.get(event)
      if (handlers) {
        for (const handler of handlers) {
          handler(data)
        }
      }
    })
    return unsubscribe
  }, [ipcBridge])

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

  return <EventCtx.Provider value={{ on, off }}>{children}</EventCtx.Provider>
}

export function useEvent() {
  const ctx = useContext(EventCtx)
  if (!ctx) throw new Error("useEvent must be used within EventProvider")
  return ctx
}
