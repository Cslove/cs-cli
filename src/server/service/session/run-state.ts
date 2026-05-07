// 对标 opencode 的 src/session/run-state.ts —— Session 运行状态服务
// 维护 sessionID → AbortController 映射，支持取消正在进行的 prompt
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"

@Provide()
@Scope(ScopeEnum.Singleton)
export class SessionRunStateService {
  private readonly controllers = new Map<string, AbortController>()

  /** 为 session 注册一个新的 AbortController，已存在时会先 abort 旧的 */
  register(sessionID: string): AbortController {
    const existing = this.controllers.get(sessionID)
    if (existing) existing.abort()
    const controller = new AbortController()
    this.controllers.set(sessionID, controller)
    return controller
  }

  /** 获取 session 当前的 AbortController（无则返回 undefined） */
  get(sessionID: string): AbortController | undefined {
    return this.controllers.get(sessionID)
  }

  /** 取消 session 当前正在进行的 prompt */
  cancel(sessionID: string): void {
    const controller = this.controllers.get(sessionID)
    if (!controller) return
    controller.abort()
    this.controllers.delete(sessionID)
  }

  /** prompt 正常结束时调用，清理 controller 引用 */
  release(sessionID: string): void {
    this.controllers.delete(sessionID)
  }

  /** session 是否正在运行 */
  isRunning(sessionID: string): boolean {
    return this.controllers.has(sessionID)
  }
}
