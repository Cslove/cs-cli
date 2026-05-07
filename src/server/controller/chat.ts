// 对标 opencode 的 server/routes/instance/session.ts 中的 prompt 路由 —— 聊天控制器
// 本 controller 仅做参数校验 + 转发，全部业务逻辑放在 SessionPromptService
import { Controller, Post, Inject } from "@midwayjs/core"
import { Context } from "@midwayjs/koa"
import { SessionPromptService } from "../service/session/prompt.js"
import { EventService } from "../service/event.js"
import type { ChatPromptRequest, ChatPromptResponse } from "../../shared/types.js"
import type { PromptInput } from "../../shared/prompt.js"

@Controller("/api/chat")
export class ChatController {
  @Inject("sessionPromptService")
  promptService!: SessionPromptService

  @Inject()
  eventService!: EventService

  @Post("/prompt")
  async prompt(ctx: Context): Promise<ChatPromptResponse> {
    const body = ctx.request.body as ChatPromptRequest
    if (!body?.sessionId) throw new Error("sessionId is required")

    const parts = body.parts && body.parts.length > 0
      ? body.parts
      : [{ type: "text" as const, text: body.content ?? "" }]

    const input: PromptInput = {
      sessionID: body.sessionId,
      ...(body.agent !== undefined && { agent: body.agent }),
      ...(body.model !== undefined && {
        model: parseModelString(body.model),
      }),
      parts,
    }

    // 触发 prompt：异步执行，立即返回 streaming: true
    // 真正的 message/part/status 事件通过 SSE (/global/event) 推送到 TUI
    void this.promptService.prompt(input).catch((err: unknown) => {
      // 兜底：如果异常发生在 SessionPromptService 内 try 块之外（例如 getOrCreate / resolveModel 抛错），
      // 该路径不会自己 emit session.error，所以这里再发一次确保 TUI 能感知
      const message = err instanceof Error ? err.message : String(err)
      this.eventService.emit("session.error", { sessionID: body.sessionId, error: message })
    })

    return { sessionId: body.sessionId, streaming: true }
  }

  @Post("/cancel")
  async cancel(ctx: Context): Promise<{ sessionId: string; cancelled: boolean }> {
    const body = ctx.request.body as { sessionId?: string }
    if (!body?.sessionId) throw new Error("sessionId is required")
    this.promptService.cancel(body.sessionId)
    return { sessionId: body.sessionId, cancelled: true }
  }
}

/**
 * 把老的 model 字符串（"gpt-4o" 或 "openai/gpt-4o"）解析为 { providerID, modelID }
 * 缺省 providerID 留空，由 SessionPromptService.resolveModel 用默认 provider 兜底
 */
function parseModelString(model: string): { providerID: string; modelID: string } {
  const slashIdx = model.indexOf("/")
  if (slashIdx < 0) return { providerID: "", modelID: model }
  return { providerID: model.slice(0, slashIdx), modelID: model.slice(slashIdx + 1) }
}

