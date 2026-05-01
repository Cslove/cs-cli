// 对标 opencode 的 server/routes/instance/session.ts 中的 prompt 路由 —— 聊天控制器
import { Controller, Post, Inject, Body } from "@midwayjs/core"
import { SessionService } from "../service/session.js"
import { LlmService } from "../service/llm.js"
import { EventService } from "../service/event.js"
import type { ChatPromptRequest } from "../../shared/types.js"

@Controller("/api/chat")
export class ChatController {
  @Inject()
  sessionService!: SessionService

  @Inject()
  llmService!: LlmService

  @Inject()
  eventService!: EventService

  @Post("/prompt")
  async prompt(@Body() body: ChatPromptRequest) {
    const session = await this.sessionService.getOrCreate(body.sessionId)

    // 保存用户消息
    const userMessage = await this.sessionService.addMessage({
      sessionId: session.id,
      role: "user",
      content: body.content,
    })

    // 发送事件通知 TUI
    this.eventService.emit("message.created", userMessage)

    // 异步调用 LLM（流式推送 token）
    const messages = await this.sessionService.getChatMessages(session.id)
    this.llmService
      .chat({
        sessionId: session.id,
        messages,
        model: body.model,
        onToken: (token) => {
          this.eventService.emit("message.token", {
            sessionId: session.id,
            token,
          })
        },
        onComplete: async (fullContent) => {
          const assistantMessage = await this.sessionService.addMessage({
            sessionId: session.id,
            role: "assistant",
            content: fullContent,
            model: body.model,
          })
          this.eventService.emit("message.created", assistantMessage)
        },
      })
      .catch((e) => {
        this.eventService.emit("session.error", {
          sessionId: session.id,
          error: e instanceof Error ? e.message : String(e),
        })
      })

    return { sessionId: session.id, streaming: true }
  }
}
