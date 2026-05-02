// 对标 opencode 的 server/routes/instance/session.ts 中的 prompt 路由 —— 聊天控制器
import { Controller, Post, Inject, Body } from "@midwayjs/core"
import { SessionService } from "../service/session.js"
import { LlmService } from "../service/llm.js"
import { PartService } from "../service/part.js"
import { EventService } from "../service/event.js"
import type { ChatPromptRequest } from "../../shared/types.js"

@Controller("/api/chat")
export class ChatController {
  @Inject()
  sessionService!: SessionService

  @Inject()
  llmService!: LlmService

  @Inject()
  partService!: PartService

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
    this.eventService.emit("message.created", userMessage)

    // 对标 opencode：prompt 开始时标记 session 为 working
    this.eventService.emit("session.status", { sessionID: session.id, status: "working" })
    this.eventService.emit("session.updated", session)

    // 对标 opencode：先创建空的 assistant message + text part，流式时用 part.delta 追加
    const assistantMessage = await this.sessionService.addMessage({
      sessionId: session.id,
      role: "assistant",
      content: "",
      model: body.model,
    })
    this.eventService.emit("message.created", assistantMessage)

    const textPart = await this.partService.create({
      messageId: assistantMessage.id,
      type: "text",
    })
    this.eventService.emit("message.part.updated", {
      ...textPart,
      messageID: assistantMessage.id,
    })

    // 异步调用 LLM（流式推送 token）
    const messages = await this.sessionService.getChatMessages(session.id)
    this.llmService
      .chat({
        sessionId: session.id,
        messages: messages.filter((m) => m.role !== "assistant" || m !== assistantMessage),
        model: body.model,
        onToken: (token) => {
          // 对标 opencode 的 message.part.delta
          this.eventService.emit("message.part.delta", {
            messageID: assistantMessage.id,
            partID: textPart.id,
            field: "text",
            delta: token,
          })
        },
        onComplete: async (fullContent) => {
          // 更新 assistant message 和 part
          await this.sessionService.addMessage({
            sessionId: session.id,
            role: "assistant",
            content: fullContent,
            model: body.model,
          })
          this.eventService.emit("message.updated", { ...assistantMessage, content: fullContent })
          this.eventService.emit("message.part.updated", {
            ...textPart,
            messageID: assistantMessage.id,
            text: fullContent,
          })
          // 对标 opencode：prompt 完成时标记 session 为 idle
          this.eventService.emit("session.status", { sessionID: session.id, status: "idle" })
          this.eventService.emit("session.updated", session)
        },
      })
      .catch((e) => {
        this.eventService.emit("session.error", {
          sessionId: session.id,
          error: e instanceof Error ? e.message : String(e),
        })
        this.eventService.emit("session.status", { sessionID: session.id, status: "idle" })
      })

    return { sessionId: session.id, streaming: true }
  }
}
