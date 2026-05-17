// 对标 opencode 的 session/llm.ts —— LLM 调用服务
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"
import OpenAI from "openai"

@Provide()
@Scope(ScopeEnum.Singleton)
export class LlmService {
  private clients: Map<string, OpenAI> = new Map()

  private getClient(baseUrl?: string): OpenAI {
    const key = baseUrl ?? "default"
    if (!this.clients.has(key)) {
      this.clients.set(
        key,
        new OpenAI({
          apiKey: process.env.OPENAI_API_KEY ?? "",
          baseURL: baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        }),
      )
    }
    return this.clients.get(key)!
  }

  /**
   * 流式调用 LLM
   * @param options.signal AbortSignal —— 透传给 OpenAI SDK 真正断开 HTTP 连接（对标 opencode 的 abort）
   *                                      同时 stream 循环里也会检查 signal.aborted 立即 break
   * @param options.onComplete 可选回调；调用方通常通过 onToken 自行累积全文，也可不传
   *
   * ⚠️ 当前为 MOCK 实现：未真正调用 OpenAI，按 token 节奏吐固定回复，便于在没有 API key 时调试整体链路。
   *    恢复真实调用时请把 MOCK 块替换成原 client.chat.completions.create 调用。
   */
  async chat(options: {
    sessionId: string
    messages: Array<{ role: string; content: string }>
    model?: string
    signal?: AbortSignal
    onToken: (token: string) => void
    onComplete?: (fullContent: string) => void
  }): Promise<string> {
    // ---- MOCK 块开始 ----
    // 取最后一条 user 消息作为 mock echo 内容；找不到就给一段默认文案
    const lastUser = [...options.messages].reverse().find((m) => m.role === "user")
    const mockReply = lastUser
      ? `## 关于「${lastUser.content.slice(0, 40)}${lastUser.content.length > 40 ? "…" : ""}」的回复

这是一条用于**联调测试**的模拟回复，包含各类 Markdown 语法和 TypeScript 代码示例。

### Markdown 基础

- **加粗文字** — \`theme.markdownStrong\` 色值
- *斜体文字* — \`theme.markdownEmph\` 色值
- \`行内代码\` — \`theme.markdownCode\` 色值
- [链接示例](https://example.com) — \`theme.markdownLink\` 色值

> 这是一个引用块，使用 \`theme.markdownBlockQuote\` 颜色渲染。
> 可以用在提示、引用等场景。

### TypeScript 代码示例

下面是一个服务层的代码块，展示依赖注入和 CRUD 操作：

\`\`\`typescript
import { Provide, Scope, ScopeEnum, Inject } from "@midwayjs/core"

interface User {
  id: string
  name: string
  email: string
  createdAt: number
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class UserService {
  private users: Map<string, User> = new Map()

  async findById(id: string): Promise<User | undefined> {
    return this.users.get(id)
  }

  async create(input: { name: string; email: string }): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email,
      createdAt: Date.now(),
    }
    this.users.set(user.id, user)
    return user
  }

  async list(): Promise<User[]> {
    return Array.from(this.users.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    )
  }
}
\`\`\`

### Hook 示例

下面是一个 React Hook 示例，展示 \`useEffect\` + \`useRef\` 配合滚动监听：

\`\`\`typescript
import { useEffect, useRef } from "react"

function useScrollToBottom(deps: unknown[]) {
  const prevCount = useRef(0)

  useEffect(() => {
    const count = Array.isArray(deps[0]) ? deps[0].length : 0
    if (count > prevCount.current && prevCount.current > 0) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
    }
    prevCount.current = count
  }, deps)
}
\`\`\`

### 有序列表

1. 第一步：安装依赖 \`npm install\`
2. 第二步：启动服务 \`npm run dev\`
3. 第三步：打开终端 TUI \`cs chat\`

### 表格

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| \`id\` | string | ✅ | 唯一标识 |
| \`name\` | string | ✅ | 用户名 |
| \`email\` | string | ❌ | 邮箱地址 |
| \`role\` | enum | ✅ | 角色类型 |

---

src/
├── controller/   # 控制器（路由）
├── service/      # 业务逻辑
├── entity/       # 数据模型
├── config/       # 配置
└── configuration.ts  # 生命周期配置

以上是模拟回复的全部内容。当前模型：**${options.model ?? "default"}**。`
      : `## Mock 回复

这是一条**模拟回复**，包含 Markdown 语法和 TypeScript 代码块用于联调测试。

\`\`\`typescript
function hello() {
  console.log("Hello from mock LLM!")
}
\`\`\`

当前模型：**${options.model ?? "default"}**。`

    // 按空格+换行边界切 token，间隔 10ms 模拟流式（word 级别避免过长）
    const tokens = mockReply.match(/\S+\s*/g) ?? Array.from(mockReply)
    let fullContent = ""
    for (const token of tokens) {
      if (options.signal?.aborted) break
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          options.signal?.removeEventListener("abort", onAbort)
          resolve()
        }, 10)
        const onAbort = () => {
          clearTimeout(timer)
          resolve()
        }
        options.signal?.addEventListener("abort", onAbort, { once: true })
        void reject
      })
      if (options.signal?.aborted) break
      fullContent += token
      options.onToken(token)
    }

    options.onComplete?.(fullContent)
    return fullContent
    // ---- MOCK 块结束 ----

    // ---- 真实实现（恢复时启用） ----
    // const client = this.getClient()
    // const model = options.model ?? process.env.CS_MODEL ?? "gpt-4o"
    // const stream = await client.chat.completions.create(
    //   {
    //     model,
    //     messages: options.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    //     stream: true,
    //   },
    //   options.signal ? { signal: options.signal } : undefined,
    // )
    // let fullContent = ""
    // for await (const chunk of stream) {
    //   if (options.signal?.aborted) break
    //   const token = chunk.choices[0]?.delta?.content ?? ""
    //   if (token) {
    //     fullContent += token
    //     options.onToken(token)
    //   }
    // }
    // options.onComplete?.(fullContent)
    // return fullContent
  }
}
