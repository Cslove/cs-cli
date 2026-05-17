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
      ? `## ${lastUser.content.slice(0, 40)}${lastUser.content.length > 40 ? "…" : ""}

这是一条**联调测试**回复，覆盖常见 Markdown 语法。

### 基础语法

- **加粗** 与 *斜体*
- \`行内代码\` 与 [链接](https://example.com)

> 引用块 —— 提示或引用场景

### 代码块

\`\`\`typescript
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"

@Provide()
@Scope(ScopeEnum.Singleton)
export class DemoService {
  async greet(name: string): Promise<string> {
    return \`Hello, \${name}!\`
  }
}
\`\`\`

当前模型：**${options.model ?? "default"}**。`
      : `## Mock 回复

**加粗**、*斜体*、\`行内代码\`。

\`\`\`typescript
console.log("Hello from mock!")
\`\`\`

模型：**${options.model ?? "default"}**。`

    // 按空格+换行边界切 token，间隔 10ms 模拟流式（word 级别避免过长）
    const tokens = mockReply.match(/\S+\s*/g) ?? Array.from(mockReply)
    let fullContent = ""
    for (const token of tokens) {
      if (options.signal?.aborted) break
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          options.signal?.removeEventListener("abort", onAbort)
          resolve()
        }, 30)
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
