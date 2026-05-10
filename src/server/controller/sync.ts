// 对标 opencode 的 SyncProvider bootstrap + session sync —— 数据同步控制器
// 将多个并行请求合并为单次 HTTP 调用，减少 TUI 初始化时的网络开销
import { Controller, Get, Put, Inject } from "@midwayjs/core"
import { Context } from "@midwayjs/koa"
import { ProviderService } from "../service/provider.js"
import { AgentService } from "../service/agent.js"
import { ConfigService } from "../service/config.js"
import { CommandService } from "../service/command.js"
import { SessionService } from "../service/session.js"
import { TodoService } from "../service/todo.js"
import { PartService } from "../service/part.js"
import { EventService } from "../service/event.js"
import type { BootstrapData, SessionSyncData, Config, Session, Message } from "../../shared/types.js"
import type { MessageEntity } from "../entity/message.js"
import type { SessionEntity } from "../entity/session.js"

function toMessage(entity: MessageEntity): Message {
  const tokens = entity.tokens ? JSON.parse(entity.tokens) : undefined
  const error = entity.error ? JSON.parse(entity.error) : undefined
  return {
    id: entity.id,
    session_id: entity.session_id,
    role: entity.role,
    content: entity.content,
    model: entity.model,
    created_at: entity.created_at,
    time: { created: entity.created_at, completed: entity.time_completed || undefined },
    agent: entity.agent || undefined,
    mode: entity.mode || undefined,
    tokens,
    cost: entity.cost || undefined,
    error,
    finish: entity.finish || undefined,
    providerID: entity.provider_id || undefined,
    modelID: entity.model_id || undefined,
    parentID: entity.parent_id || undefined,
  }
}

function toSession(entity: SessionEntity): Session {
  return {
    ...entity,
    time: { created: entity.created_at, updated: entity.updated_at },
  }
}

@Controller("/api/sync")
export class SyncController {
  @Inject()
  providerService!: ProviderService

  @Inject()
  agentService!: AgentService

  @Inject()
  configService!: ConfigService

  @Inject()
  commandService!: CommandService

  @Inject()
  sessionService!: SessionService

  @Inject()
  todoService!: TodoService

  @Inject()
  partService!: PartService

  @Inject()
  eventService!: EventService

  /**
   * 对标 opencode SyncProvider.bootstrap()
   * 一次性返回 TUI 初始化所需的全部数据
   * blocking: provider, agent, config
   * non-blocking: session, command, session_status
   */
  @Get("/bootstrap")
  async bootstrap(): Promise<BootstrapData> {
    const [provider, agent, config, sessions, command] = await Promise.all([
      Promise.resolve(this.providerService.list()),
      Promise.resolve(this.agentService.list()),
      Promise.resolve(this.configService.getAll()),
      this.sessionService.list(),
      Promise.resolve(this.commandService.list()),
    ])

    // 对标 opencode：根据最后一条消息的 role 判断 session status
    const session_status: BootstrapData["session_status"] = {}
    for (const s of sessions) {
      const messages = await this.sessionService.getMessages(s.id)
      const last = messages.at(-1)
      if (!last) {
        session_status[s.id] = "idle"
      } else if (last.role === "user") {
        session_status[s.id] = "working"
      } else {
        session_status[s.id] = "idle"
      }
    }

    return { provider, agent, config, session: sessions.map(toSession), command, session_status }
  }

  /**
   * 对标 opencode SyncProvider.session.sync()
   * 返回指定 session 的完整数据（session + messages with parts + todos）
   */
  @Get("/session/:id")
  async sessionSync(ctx: Context): Promise<SessionSyncData> {
    const id = ctx.params.id
    const session = await this.sessionService.get(id)
    if (!session) throw new Error("Session not found")

    const [messages, todos, partsMap] = await Promise.all([
      this.sessionService.getMessages(id),
      this.todoService.list(id),
      this.partService.listBySession(id),
    ])

    return {
      session: toSession(session),
      messages: messages.map((m) => ({
        ...toMessage(m),
        parts: partsMap[m.id] ?? [],
      })),
      todos,
    }
  }

  /** 更新配置 */
  @Put("/config")
  async updateConfig(ctx: Context) {
    const body = ctx.request.body as { key: string; value: string | number | boolean }
    this.configService.set(body.key, body.value)
    return { success: true }
  }

  /** 批量更新 session 的 todos */
  @Put("/todo/:sessionId")
  async updateTodos(ctx: Context) {
    const sessionId = ctx.params.id
    const body = ctx.request.body as { todos: Array<{ content: string; status: "pending" | "in_progress" | "completed" }> }
    const todos = await this.todoService.replaceAll(sessionId, body.todos)
    this.eventService.emit("todo.updated", { sessionID: sessionId, todos })
    return todos
  }
}
