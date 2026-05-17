// 对标 opencode 的 src/session/processor.ts —— 流式事件 → message/part 写入 + 事件广播
// 把"创建 user message + 落 parts"和"流式回写 assistant 消息"两类副作用统一封装在这里
// 让 SessionPromptService 的 prompt(input) 主流程更清晰
import { Provide, Scope, ScopeEnum, Inject } from "@midwayjs/core"
import { SessionService } from "../session.js"
import { PartService } from "../part.js"
import { EventService } from "../event.js"
import type { MessageEntity } from "../../entity/message.js"
import type { PartEntity } from "../../entity/part.js"
import type { PartInput } from "../../../shared/types.js"
import { toMessage } from "../../util/convert.js"

/**
 * Assistant 流式写入 handle —— 对标 opencode SessionProcessor.Handle
 * 一个 prompt() 调用对应一个 handle，loop 里通过它持续写入流式 part
 */
export interface AssistantHandle {
  message: MessageEntity
  /** 当前正在写入的 text part（一次 LLM stream 对应一个） */
  textPart: PartEntity
  /** 流式追加 text delta，会同步 message.part.delta 事件 */
  appendText: (delta: string) => void
  /** 完成本次 assistant 输出，落最终全文 + 推 part.updated/message.updated */
  complete: () => Promise<void>
}

/** PartInput → PartEntity 创建参数 —— 同步纯函数，对未知 type 走 exhaustive check 报错 */
function buildPartCreateArgs(part: PartInput): {
  type: PartEntity["type"]
  text: string
  tool_name?: string
  tool_input?: string
  metadata: string
} {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text, metadata: JSON.stringify({ synthetic: part.synthetic ?? false }) }
    case "agent":
      return { type: "agent", text: part.name, metadata: JSON.stringify(part.source ? { source: part.source } : {}) }
    case "file":
      return {
        type: "file",
        text: part.filename ?? part.url,
        tool_input: part.url,
        metadata: JSON.stringify({ mime: part.mime, filename: part.filename, url: part.url, source: part.source }),
      }
    default: {
      // exhaustive check：未来 PartInput 增加新类型时编译期立即暴露
      const exhaustive: never = part
      throw new Error(`Unsupported PartInput type: ${JSON.stringify(exhaustive)}`)
    }
  }
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class SessionProcessorService {
  @Inject()
  sessionService!: SessionService

  @Inject()
  partService!: PartService

  @Inject()
  eventService!: EventService

  /**
   * 对标 opencode createUserMessage —— 写入 user message + 逐个落 parts + 推事件
   * 字段对齐 opencode message-v2.ts User：agent / model{providerID,modelID} / system? / tools?
   *
   * 客户端可预生成 messageID（用于乐观更新），缺省时由 SessionService 生成 uuid
   */
  async createUserMessage(input: {
    sessionID: string
    messageID?: string
    parts: PartInput[]
    /** 对标 User.agent */
    agent: string
    /** 对标 User.model.providerID */
    providerID: string
    /** 对标 User.model.modelID */
    modelID: string
    /** 对标 User.system —— 系统提示，缺省为空 */
    system?: string
    /** 对标 User.tools —— Record<string, boolean>，缺省为空 */
    tools?: Record<string, boolean>
  }): Promise<{ message: MessageEntity; parts: PartEntity[] }> {
    // 1. 取所有 text part 拼成 message.content
    //    （现有 entity 仍保留 content 字段，parts 数组才是真实的多模态结构）
    const content = input.parts
      .filter((p): p is Extract<PartInput, { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join("\n")

    // 2. 创建 user message（id 透传 + 字段透传到 SessionService）
    const message = await this.sessionService.addMessage({
      id: input.messageID,
      sessionId: input.sessionID,
      role: "user",
      content,
      agent: input.agent,
      providerID: input.providerID,
      modelID: input.modelID,
      ...(input.system !== undefined && { system: input.system }),
      ...(input.tools !== undefined && { tools: input.tools }),
    })
    this.eventService.emit("message.created", toMessage(message))

    // 3. 逐个落 parts 并推 message.part.updated 事件（与现有 sync.tsx 事件契约一致）
    const persisted: PartEntity[] = []
    for (const part of input.parts) {
      const created = await this.partService.create({
        messageId: message.id,
        ...buildPartCreateArgs(part),
      })
      persisted.push(created)
      this.eventService.emit("message.part.updated", {
        ...created,
        messageID: message.id,
      })
    }

    return { message, parts: persisted }
  }

  /**
   * 对标 opencode SessionProcessor —— 创建空的 assistant message + text part，返回写入 handle
   * 字段对齐 opencode message-v2.ts Assistant：parentID / providerID / modelID / agent / mode / path{cwd,root}
   *
   * loop 内会通过 handle 持续 appendText / 最终 complete
   */
  async createAssistantHandle(input: {
    sessionID: string
    /** 对标 Assistant.parentID —— 触发它的 user message id */
    parentID: string
    /** 对标 Assistant.providerID */
    providerID: string
    /** 对标 Assistant.modelID */
    modelID: string
    /** 对标 Assistant.agent */
    agent: string
    /** 对标 Assistant.mode（已废弃但仍写入） */
    mode?: string
    /** 对标 Assistant.path */
    path?: { cwd: string; root: string }
  }): Promise<AssistantHandle> {
    const message = await this.sessionService.addMessage({
      sessionId: input.sessionID,
      role: "assistant",
      content: "",
      providerID: input.providerID,
      modelID: input.modelID,
      agent: input.agent,
      parentID: input.parentID,
      ...(input.mode !== undefined && { mode: input.mode }),
      ...(input.path !== undefined && { path: input.path }),
    })
    this.eventService.emit("message.created", toMessage(message))

    const textPart = await this.partService.create({
      messageId: message.id,
      type: "text",
    })
    this.eventService.emit("message.part.updated", {
      ...textPart,
      messageID: message.id,
    })

    // buffered 由 handle 闭包内部维护完整文本，complete 不再接收任何参数
    let buffered = ""

    const appendText = (delta: string): void => {
      buffered += delta
      // 对标 opencode message.part.delta —— 仅推事件，不每次写库
      // 避免高频 token 触发频繁 sql.js 写入
      this.eventService.emit("message.part.delta", {
        messageID: message.id,
        partID: textPart.id,
        field: "text",
        delta,
      })
    }

    const complete = async (): Promise<void> => {
      const completedAt = Date.now()
      // 1. 落最终全文 + 推 part.updated
      await this.partService.updateText(textPart.id, buffered)
      this.eventService.emit("message.part.updated", {
        ...textPart,
        text: buffered,
        messageID: message.id,
      })

      // 2. 一次性更新 assistant message 的完成态字段：content + time_completed + updated_at
      //    对标 opencode Assistant.time.completed —— 标记本轮 LLM 调用结束
      //    cost / tokens / finish 当前未知（LlmService 还没把这些信息透出来），后续接入时再补
      await this.sessionService.updateAssistantCompletion({
        id: message.id,
        content: buffered,
        finish: "stop",
      })
      this.eventService.emit("message.updated", toMessage({
        ...message,
        content: buffered,
        time_completed: completedAt,
        updated_at: completedAt,
        finish: "stop",
      }))
    }

    return { message, textPart, appendText, complete }
  }
}
