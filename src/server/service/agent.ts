// 对标 opencode 的 agent 相关服务 —— AI Agent 类型
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"
import type { Agent } from "../../shared/types.js"

@Provide()
@Scope(ScopeEnum.Singleton)
export class AgentService {
  private readonly agents: Agent[] = [
    { id: "code", name: "Code", description: "Write and edit code with full context awareness" },
    { id: "ask", name: "Ask", description: "Answer questions about your codebase" },
  ]

  list(): Agent[] {
    return this.agents
  }

  get(idOrName: string): Agent | undefined {
    // 对标 opencode agents.get(name)：同时支持按 id 和 name 查找
    return this.agents.find((a) => a.id === idOrName || a.name === idOrName)
  }

  /** 对标 opencode agents.defaultAgent() —— 返回默认 agent 名称 */
  defaultAgent(): string {
    return this.agents[0]?.name ?? "Code"
  }
}
