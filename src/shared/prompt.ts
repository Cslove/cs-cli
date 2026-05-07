// 对标 opencode 的 src/session/prompt.ts 中的 PromptInput / LoopInput 类型定义
// 这里只保留架构必要的最小字段，复杂能力（format/system 数组/variant/tools 选择等）后续再补
import type { PartInput } from "./types.js"

/**
 * 对标 opencode SessionPrompt.PromptInput
 * - sessionID 由 controller 路径参数补齐（客户端可不传）
 * - messageID 客户端可预生成（用于本地乐观更新），缺省时服务端自动生成
 * - parts 是 draft：缺 id / messageID / sessionID，由 service 补齐后落库
 */
export interface PromptInput {
  sessionID: string
  messageID?: string
  agent?: string
  model?: { providerID: string; modelID: string }
  parts: PartInput[]
}

/** 对标 opencode SessionPrompt.LoopInput —— 真正驱动 LLM 的循环参数 */
export interface LoopInput {
  sessionID: string
  /** 对标 opencode loop input.agent —— 当前 agent 名（assistant.agent 字段会用） */
  agentName: string
  model: { providerID: string; modelID: string }
  /** 本轮 user message id，loop 内部 assistant 消息会以它为 parent（对标 Assistant.parentID） */
  userMessageID: string
  /** 系统提示，多段拼接 */
  system: string[]
  /** 对标 opencode Assistant.path —— 当前工作目录与项目根 */
  path: { cwd: string; root: string }
}

/** 对标 opencode session/run-state.ts 的 SessionRunStatus */
export type SessionRunStatus = "idle" | "working" | "compacting"
