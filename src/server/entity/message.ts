// 对标 opencode 的 session/message-v2.ts 中的 User + Assistant 字段并集
// opencode 用 JSON `data` 列塞所有业务字段；这里改为平铺 snake_case 列（符合 AGENTS.md drizzle 风格）
//
// 字段分组：
//   通用：    id / session_id / role / content / created_at / updated_at
//   双方共有：agent / provider_id / model_id / mode（model 字段保留作向后兼容冗余）
//   user 专属：system / tools (JSON Record<string, boolean>)
//   assistant 专属：parent_id / time_completed / path_cwd / path_root / cost / tokens (JSON) / error (JSON) / finish
export interface MessageEntity {
  // ---- 通用 ----
  id: string
  session_id: string
  role: "user" | "assistant" | "system"
  content: string
  /** @deprecated 用 model_id 替代；此字段仍写入以兼容老查询代码 */
  model: string
  created_at: number
  updated_at: number

  // ---- 双方共有（对标 opencode User.agent + User.model / Assistant.agent + modelID + providerID + mode） ----
  agent: string
  provider_id: string
  model_id: string
  /** @deprecated 对标 opencode Assistant.mode（已废弃但仍写入） */
  mode: string

  // ---- assistant 专属（对标 Assistant.parentID / time.completed / path / cost / tokens / error / finish） ----
  /** assistant 消息指向触发它的 user message id；user 消息为空字符串 */
  parent_id: string
  /** assistant 流式结束时间戳；未完成时为 0 */
  time_completed: number
  path_cwd: string
  path_root: string
  cost: number
  /** JSON：{ input, output, reasoning, total?, cache: { read, write } } */
  tokens: string
  /** JSON：opencode AssistantError；正常时为空字符串 */
  error: string
  finish: string

  // ---- user 专属（对标 User.system / User.tools） ----
  system: string
  /** JSON：Record<string, boolean> */
  tools: string
}
