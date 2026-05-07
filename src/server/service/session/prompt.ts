// 对标 opencode 的 src/session/prompt.ts —— Session Prompt 编排服务
// 负责把 controller 收到的 PromptInput 转换成完整的对话流程：
//   1. 解析 session / agent / model
//   2. 通过 SessionProcessor 落 user message + parts，推事件
//   3. status.set(working) + 注册 AbortController
//   4. 进入 loop（当前实现单轮 LLM stream，预留多轮 tool-calls 扩展点）
//   5. status.set(idle) + 释放 AbortController
//
// 当前不实现：Command、MCP、LSP、Permission、Plan、Compaction、Title、Subtask、StructuredOutput、Plugin
import { Provide, Scope, ScopeEnum, Inject } from "@midwayjs/core"
import { SessionService } from "../session.js"
import { AgentService } from "../agent.js"
import { ProviderService } from "../provider.js"
import { LlmService } from "../llm.js"
import { EventService } from "../event.js"
import { SessionProcessorService } from "./processor.js"
import { SessionRunStateService } from "./run-state.js"
import { SessionStatusService } from "./status.js"
import { SystemPromptService } from "./system-prompt.js"
import { ToolRegistryService } from "./tool-registry.js"
import type { PromptInput, LoopInput } from "../../../shared/prompt.js"
import type { MessageEntity } from "../../entity/message.js"
import type { PartEntity } from "../../entity/part.js"
import type { Agent } from "../../../shared/types.js"

/** 对标 opencode SessionPrompt.prompt 的返回值：assistant 消息 + 它的 parts */
export interface PromptResult {
  message: MessageEntity
  parts: PartEntity[]
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class SessionPromptService {
  @Inject()
  sessionService!: SessionService

  @Inject()
  agentService!: AgentService

  @Inject()
  providerService!: ProviderService

  @Inject()
  llmService!: LlmService

  @Inject()
  processor!: SessionProcessorService

  @Inject()
  runState!: SessionRunStateService

  @Inject()
  status!: SessionStatusService

  @Inject()
  systemPrompt!: SystemPromptService

  @Inject()
  toolRegistry!: ToolRegistryService

  @Inject()
  eventService!: EventService

  /**
   * 对标 opencode SessionPrompt.prompt —— 主入口
   * 整个调用链均在本方法内编排，loop 抽出去单独一个方法以便后续扩展多轮
   */
  async prompt(input: PromptInput): Promise<PromptResult> {
    // 1. 确保 session 存在（路由层已校验过路径参数，这里二次确认）
    const session = await this.sessionService.getOrCreate(input.sessionID)

    // 2. 解析 agent（按 name → id 兼容查找；缺省取 defaultAgent）
    const agent = this.resolveAgent(input.agent)

    // 3. 解析 model（input.model > session.model > provider 默认）
    const model = this.resolveModel(input.model, session.model)

    // 4. 创建 user message + 落 parts + 推事件
    //    user 消息字段对齐 opencode message-v2.ts User：agent / model{providerID,modelID} / system?
    const systemSegments = this.systemPrompt.build(agent)
    const { message: userMessage } = await this.processor.createUserMessage({
      sessionID: session.id,
      messageID: input.messageID,
      parts: input.parts,
      agent: agent.name,
      providerID: model.providerID,
      modelID: model.modelID,
      system: systemSegments.join("\n\n"),
    })

    // 5. 标记 session 为 working，并注册 AbortController（供后续 cancel 使用）
    this.status.set(session.id, "working")
    const controller = this.runState.register(session.id)

    // path 对标 opencode Assistant.path —— 当前 .nodejs 没有 ProjectService 暴露 cwd/root，
    // 用 process.cwd() 双填兜底；后续接入 ProjectService 后再细化
    const cwd = process.cwd()
    const path = { cwd, root: cwd }

    try {
      // 6. 进入 loop（当前单轮 LLM stream）
      const result = await this.loop(
        {
          sessionID: session.id,
          agentName: agent.name,
          model,
          userMessageID: userMessage.id,
          system: systemSegments,
          path,
        },
        controller.signal,
      )
      return result
    } catch (err) {
      // loop 内异常：推 session.error 事件 + 标记 idle，让 TUI 红色提示但不崩
      const message = err instanceof Error ? err.message : String(err)
      this.eventService.emit("session.error", { sessionID: session.id, error: message })
      throw err
    } finally {
      this.status.set(session.id, "idle")
      this.runState.release(session.id)
    }
  }

  /**
   * 对标 opencode SessionPrompt.cancel —— 取消 session 当前正在进行的 prompt
   * 仅触发 abort，状态与事件清理由 prompt() 的 finally 完成
   */
  cancel(sessionID: string): void {
    this.runState.cancel(sessionID)
  }

  // ---- 内部：loop ----

  /**
   * 对标 opencode SessionPrompt.loop —— 驱动 LLM 多轮调用
   * 当前实现：单轮 LLM stream（无 tool-calls）
   * 预留扩展点：tool-calls 多轮、reasoning、structured-output 等
   */
  private async loop(input: LoopInput, signal: AbortSignal): Promise<PromptResult> {
    // 1. 先取历史（包含本轮刚写入的 user message），再创建 assistant handle，
    //    避免历史里混入本轮的空 assistant message
    const history = await this.sessionService.getChatMessages(input.sessionID)
    const systemMessages = input.system.map((text) => ({ role: "system" as const, content: text }))
    const messages = [...systemMessages, ...history]

    // 2. 创建 assistant message handle（空 message + 空 text part，事件已推）
    //    字段对齐 opencode Assistant：parentID / providerID / modelID / agent / path
    const handle = await this.processor.createAssistantHandle({
      sessionID: input.sessionID,
      parentID: input.userMessageID,
      providerID: input.model.providerID,
      modelID: input.model.modelID,
      agent: input.agentName,
      path: input.path,
    })

    // 3. 调 LLM；abort 通过 signal 真正传给 OpenAI SDK 断开 HTTP 连接
    //    abort 会让 chat() reject（AbortError），用 try/catch 区分：abort → 容忍，其它错误 → 抛出
    try {
      await this.llmService.chat({
        sessionId: input.sessionID,
        messages,
        model: input.model.modelID,
        signal,
        onToken: (token) => handle.appendText(token),
      })
    } catch (err) {
      // signal.aborted 表示是用户主动取消，吞掉异常并继续走 complete 把已收到的 buffered 文本落库
      // 否则向上抛，由 prompt() 的 catch 推 session.error 事件
      if (!signal.aborted) {
        await handle.complete().catch(() => {})
        throw err
      }
    }

    // 4. 收尾：落最终全文（即使 abort，buffered 里已收到的 token 也会被持久化）
    await handle.complete()

    // 5. 工具能力占位：当前 toolRegistry.list() 始终返回空，loop 不会发起 tool-calls
    //    后续接入工具时，此处需要：检测 LLM 返回的 tool-call → 执行 tool → 把 tool-result 喂回 LLM 再循环
    void this.toolRegistry.list()

    return { message: handle.message, parts: [handle.textPart] }
  }

  // ---- 内部：resolve helpers ----

  private resolveAgent(name: string | undefined): Agent {
    const candidate = name ? this.agentService.get(name) : undefined
    if (candidate) return candidate
    const fallback = this.agentService.get(this.agentService.defaultAgent())
    if (!fallback) {
      throw new Error("No agent available; check AgentService configuration")
    }
    return fallback
  }

  private resolveModel(
    requested: PromptInput["model"],
    sessionModel: string,
  ): { providerID: string; modelID: string } {
    if (requested?.providerID && requested.modelID) return requested

    // session.model 字段当前存的是 modelID（如 "gpt-4o"），providerID 取默认 provider
    const provider = this.providerService.getDefault()
    const modelID = sessionModel && sessionModel.length > 0 ? sessionModel : provider.model
    return { providerID: provider.id, modelID }
  }
}
