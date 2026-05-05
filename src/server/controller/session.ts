// 对标 opencode 的 server/routes/instance/session.ts —— 会话控制器
import { Controller, Get, Post, Inject, Del, Param } from "@midwayjs/core"
import { Context } from "@midwayjs/koa"
import { SessionService, type SessionCreateInput } from "../service/session.js"
import { EventService } from "../service/event.js"

@Controller("/api/session")
export class SessionController {
  @Inject()
  sessionService!: SessionService

  @Inject()
  eventService!: EventService

  @Get("/")
  async list(ctx: Context) {
    const projectId = ctx.query.projectId as string | undefined
    return this.sessionService.list(projectId)
  }

  @Get("/:id")
  async get(@Param() id: string) {
    const session = await this.sessionService.get(id)
    if (!session) throw new Error("Session not found")
    return session
  }

  @Post("/")
  async create(ctx: Context) {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>
    const input: SessionCreateInput = {
      ...body.title != null && { title: String(body.title) },
      ...body.parentID != null && { parentID: String(body.parentID) },
    }
    const session = await this.sessionService.create(input)
    this.eventService.emit("session.created", session)
    this.eventService.emit("session.updated", session)
    return session
  }

  @Del("/:id")
  async remove(@Param() id: string) {
    await this.sessionService.remove(id)
    this.eventService.emit("session.deleted", { id })
    return { success: true }
  }
}
