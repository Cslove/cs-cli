// 对标 opencode 的 src/tool/index.ts 中的 ToolRegistry —— 工具注册表
// 当前为占位实现：list 始终返回空数组
// 后续接入：内建 tool（read/edit/bash/glob/grep ...）+ MCP tool
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"

/** 工具元数据（占位结构，不依赖任何 SDK） */
export interface ToolDefinition {
  id: string
  description: string
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class ToolRegistryService {
  list(): ToolDefinition[] {
    return []
  }
}
