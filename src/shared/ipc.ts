import { EventEmitter } from "node:events"
import type { ChildProcess } from "node:child_process"

// IPC 消息协议 —— 对标 opencode 的 util/rpc.ts
export type IpcMessage =
  | { type: "server:ready"; url: string }
  | { type: "shutdown" }
  | { type: "event"; event: string; data: unknown }
  | { type: "rpc:request"; id: string; method: string; params: unknown }
  | { type: "rpc:response"; id: string; result?: unknown; error?: string }

export interface IpcBridge {
  send: (msg: IpcMessage) => void
  on: (event: string, handler: (msg: unknown) => void) => () => void
}

export function createIpcBridge(proc: ChildProcess): IpcBridge {
  const emitter = new EventEmitter()

  proc.on("message", (msg: IpcMessage) => {
    if (msg.type === "event") {
      emitter.emit("event", msg)
    } else if (msg.type === "rpc:response") {
      emitter.emit(`rpc:${(msg as { id: string }).id}`, msg)
    }
  })

  return {
    send: (msg) => {
      if (proc.connected) proc.send!(msg)
    },
    on: (event, handler) => {
      emitter.on(event, handler)
      return () => emitter.off(event, handler)
    },
  }
}
