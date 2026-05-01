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

  async chat(options: {
    sessionId: string
    messages: Array<{ role: string; content: string }>
    model?: string
    onToken: (token: string) => void
    onComplete: (fullContent: string) => void
  }): Promise<string> {
    const client = this.getClient()
    const model = options.model ?? process.env.SIRONG_MODEL ?? "gpt-4o"

    const stream = await client.chat.completions.create({
      model,
      messages: options.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      stream: true,
    })

    let fullContent = ""
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? ""
      if (token) {
        fullContent += token
        options.onToken(token)
      }
    }

    options.onComplete(fullContent)
    return fullContent
  }
}
