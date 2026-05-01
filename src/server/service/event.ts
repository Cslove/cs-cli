// 对标 opencode 的 bus/global.ts —— 事件总线服务
// GlobalBus.emit("event", { directory, payload }) 是统一事件通道
// EventService 在每次 emit 时同时触发 "event" 通用事件，供 SSE 订阅
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"
import { EventEmitter } from "node:events"

@Provide()
@Scope(ScopeEnum.Singleton)
export class EventService extends EventEmitter {
  emit(event: string, data: unknown): boolean {
    // 同时触发通用 "event" 通道，供 /global/event SSE 订阅
    // 对标 opencode 的 GlobalBus.emit("event", { directory, payload })
    super.emit("event", { directory: "global", payload: { type: event, properties: data } })
    return super.emit(event, data)
  }
}
