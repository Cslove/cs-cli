// 对标 opencode 的 src/session/system.ts —— 系统提示生成
// 当前为占位实现：返回固定的极简 system prompt
// 后续可接入：项目 AGENTS.md、OS 信息、用户 rules、agent 自定义 prompt 等
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"
import type { Agent } from "../../../shared/types.js"

@Provide()
@Scope(ScopeEnum.Singleton)
export class SystemPromptService {
  /**
   * 返回一组 system prompt 字符串，loop 内会与 user/assistant 消息组合发给 LLM
   * 多段返回是为了对齐 opencode 的拼装方式（不同来源的 prompt 段独立）
   */
  build(agent?: Agent): string[] {
    const segments: string[] = []
    segments.push("You are a helpful AI coding assistant.")
    if (agent) {
      segments.push(`You are running as the "${agent.name}" agent: ${agent.description}`)
    }
    return segments
  }
}
