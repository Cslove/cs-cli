// 对标 opencode 的 SyncProvider bootstrap + session sync —— 数据同步控制器
// 将多个并行请求合并为单次 HTTP 调用，减少 TUI 初始化时的网络开销
import { Controller, Get, Put, Inject, Param, Body } from "@midwayjs/core"
import { ProviderService } from "../service/provider.js"
import { AgentService } from "../service/agent.js"
import { ConfigService } from "../service/config.js"
import { CommandService } from "../service/command.js"
import { SessionService } from "../service/session.js"
import { TodoService } from "../service/todo.js"
import { PartService } from "../service/part.js"
import type { BootstrapData, SessionSyncData, Config } from "../../shared/types.js"

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

    return { provider, agent, config, session: sessions, command, session_status }
  }

  /**
   * 对标 opencode SyncProvider.session.sync()
   * 返回指定 session 的完整数据（session + messages with parts + todos）
   */
  @Get("/session/:id")
  async sessionSync(@Param() id: string): Promise<SessionSyncData> {
    const session = await this.sessionService.get(id)
    if (!session) throw new Error("Session not found")

    const [messages, todos, partsMap] = await Promise.all([
      this.sessionService.getMessages(id),
      this.todoService.list(id),
      this.partService.listBySession(id),
    ])

    return {
      session,
      messages: messages.map((m) => ({
        ...m,
        parts: partsMap[m.id] ?? [],
      })),
      todos,
    }
  }

  /** 更新配置 */
  @Put("/config")
  async updateConfig(@Body() body: { key: string; value: string | number | boolean }) {
    this.configService.set(body.key, body.value)
    return { success: true }
  }

  /** 批量更新 session 的 todos */
  @Put("/todo/:sessionId")
  async updateTodos(
    @Param() sessionId: string,
    @Body() body: { todos: Array<{ content: string; status: "pending" | "in_progress" | "completed" }> },
  ) {
    const todos = await this.todoService.replaceAll(sessionId, body.todos)
    return todos
  }
}
