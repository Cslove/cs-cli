// 对标 opencode 的 bus/global.ts —— 事件总线服务
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"
import { EventEmitter } from "node:events"

@Provide()
@Scope(ScopeEnum.Singleton)
export class EventService extends EventEmitter {
  private ipcSend: ((msg: unknown) => void) | null = null

  setIpcSender(send: (msg: unknown) => void) {
    this.ipcSend = send
  }

  emit(event: string, data: unknown): boolean {
    // 转发给 IPC 通道（通知主进程 / TUI）
    if (this.ipcSend) {
      this.ipcSend({ type: "event", event, data })
    }
    return super.emit(event, data)
  }
}
