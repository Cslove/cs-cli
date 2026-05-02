// 对标 opencode 的 provider 相关服务 —— AI 模型供应商
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"
import type { Provider } from "../../shared/types.js"

@Provide()
@Scope(ScopeEnum.Singleton)
export class ProviderService {
  /** 从环境变量构建可用 Provider 列表 */
  list(): Provider[] {
    const providers: Provider[] = []
    const apiKey = process.env.OPENAI_API_KEY ?? ""
    const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
    const model = process.env.CS_MODEL ?? "gpt-4o"

    if (apiKey) {
      providers.push({
        id: "openai",
        name: "OpenAI",
        model,
        base_url: baseUrl,
        connected: true,
      })
    }

    // 支持额外配置的 provider（逗号分隔）
    const extraProviders = process.env.CS_PROVIDERS ?? ""
    if (extraProviders) {
      for (const entry of extraProviders.split(",")) {
        const [id, name, base] = entry.split(":")
        if (id && name) {
          providers.push({
            id,
            name,
            model,
            base_url: base ?? baseUrl,
            connected: !!apiKey,
          })
        }
      }
    }

    // 始终返回至少一个默认 provider（即使未配置 API key）
    if (providers.length === 0) {
      providers.push({
        id: "openai",
        name: "OpenAI",
        model,
        base_url: baseUrl,
        connected: false,
      })
    }

    return providers
  }

  getDefault(): Provider {
    return this.list()[0]
  }
}
