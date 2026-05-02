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

  get(id: string): Agent | undefined {
    return this.agents.find((a) => a.id === id)
  }
}
