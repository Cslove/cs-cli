// 对标 opencode 的 src/session/status.ts —— Session 状态服务
// 维护 sessionID → idle/working/compacting，并通过 EventService 推送 session.status 事件
import { Provide, Scope, ScopeEnum, Inject } from "@midwayjs/core"
import { EventService } from "../event.js"
import type { SessionRunStatus } from "../../../shared/prompt.js"

@Provide()
@Scope(ScopeEnum.Singleton)
export class SessionStatusService {
  @Inject()
  eventService!: EventService

  private readonly status = new Map<string, SessionRunStatus>()

  get(sessionID: string): SessionRunStatus {
    return this.status.get(sessionID) ?? "idle"
  }

  /** 设置状态并广播 session.status 事件（与现有 chat.ts 保持事件契约一致） */
  set(sessionID: string, status: SessionRunStatus): void {
    const previous = this.status.get(sessionID) ?? "idle"
    if (previous === status) return
    this.status.set(sessionID, status)
    this.eventService.emit("session.status", { sessionID, status })
  }
}
