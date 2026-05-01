// 对标 opencode 的 server/routes/instance/session.ts —— 会话控制器
import { Controller, Get, Post, Inject, Del, Param } from "@midwayjs/core"
import { Context } from "@midwayjs/koa"
import { SessionService } from "../service/session.js"

@Controller("/api/session")
export class SessionController {
  @Inject()
  sessionService!: SessionService

  @Get("/")
  async list(ctx: Context) {
    const projectPath = ctx.query.projectPath as string | undefined
    return this.sessionService.list(projectPath)
  }

  @Get("/:id")
  async get(@Param() id: string) {
    const session = await this.sessionService.get(id)
    if (!session) throw new Error("Session not found")
    return session
  }

  @Post("/")
  async create() {
    return this.sessionService.create()
  }

  @Del("/:id")
  async remove(@Param() id: string) {
    await this.sessionService.remove(id)
    return { success: true }
  }
}
