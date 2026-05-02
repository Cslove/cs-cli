// 对标 opencode 的 context/sdk.tsx —— API Client + SSE Context
import React, { createContext, useContext } from "react"
import http from "node:http"
import type { Session, Message, Project, ProjectCodeFile, BootstrapData, SessionSyncData, Config, Todo, Part } from "../../shared/types.js"
import { useToast } from "./toast.js"

export interface GlobalEvent {
  directory: string
  payload: {
    type: string
    properties: unknown
  }
}

interface ApiClient {
  session: {
    list: (projectPath?: string) => Promise<Session[] | null>
    get: (id: string) => Promise<Session | null>
    create: () => Promise<Session | null>
    remove: (id: string) => Promise<void | null>
  }
  chat: {
    prompt: (sessionId: string, content: string, model?: string) => Promise<{ sessionId: string; streaming: boolean } | null>
  }
  message: {
    list: (sessionId: string) => Promise<Message[] | null>
  }
  project: {
    list: () => Promise<Array<Pick<Project, "id" | "name" | "created_at" | "updated_at">> | null>
    get: (id: string) => Promise<Project | null>
    create: (name: string, code?: ProjectCodeFile[]) => Promise<Project | null>
    update: (id: string, input: { name?: string; code?: ProjectCodeFile[] }) => Promise<Project | null>
  }
  sync: {
    bootstrap: () => Promise<BootstrapData | null>
    sessionSync: (sessionId: string) => Promise<SessionSyncData | null>
    updateConfig: (key: string, value: string | number | boolean) => Promise<{ success: boolean } | null>
    updateTodos: (sessionId: string, todos: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>) => Promise<Todo[] | null>
  }
  global: {
    health: () => Promise<{ healthy: boolean; version: string } | null>
    /** 对标 opencode 的 sdk.global.event() —— SSE 流订阅 */
    event: (signal?: AbortSignal) => AsyncIterable<GlobalEvent>
  }
  /** 服务器地址 */
  serverUrl: string
}

const ApiContext = createContext<ApiClient | null>(null)

export function ApiProvider({ serverUrl, children }: { serverUrl: string; children: React.ReactNode }) {
  const toast = useToast()
  const client = createApiClient(serverUrl, (msg) => {
    toast.show({ variant: "error", message: msg, duration: 5000 })
  })

  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
}

export function useApi(): ApiClient {
  const ctx = useContext(ApiContext)
  if (!ctx) throw new Error("useApi must be used within ApiProvider")
  return ctx
}

function createApiClient(baseUrl: string, onError: (msg: string) => void): ApiClient {
  const request = async <T,>(path: string, options?: RequestInit): Promise<T | null> => {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
      })
      if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`)
      return res.json() as Promise<T>
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const friendly = msg.includes("ECONNREFUSED") || msg.includes("fetch failed")
        ? `Server unreachable: ${baseUrl}`
        : msg
      onError(friendly)
      return null
    }
  }

  // 对标 opencode 的 sdk.global.event() —— SSE 流式读取
  // Node.js fetch (undici) 会缓冲 SSE 数据，reader.read() 阻塞直到连接关闭
  // 必须用 http 模块直接建立 SSE 连接，IncomingMessage 才是真正的逐块流
  async function* sseStream(signal?: AbortSignal): AsyncIterable<GlobalEvent> {
    const url = new URL(`${baseUrl}/global/event`)

    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        },
        resolve,
      )
      req.on("error", reject)
      if (signal) {
        signal.addEventListener("abort", () => req.destroy(), { once: true })
      }
      req.end()
    })

    // SSE 端点因 ctx.respond=false 可能返回非200状态码，但数据流正常
    // 只要 Content-Type 是 text/event-stream 就接受连接
    const contentType = res.headers["content-type"] ?? ""
    if (!contentType.includes("text/event-stream")) {
      res.resume()
      throw new Error(`SSE connection failed: status ${res.statusCode}, content-type ${contentType}`)
    }

    // 防止 IncomingMessage 的 error 事件未被 for await 捕获
    // 当服务器被 kill 后 TCP 连接断开，res 会 emit ECONNRESET error
    // 如果 for await 暂停在 yield 时发生，error 不会被捕获导致进程崩溃
    let streamError: Error | undefined
    res.on("error", (err) => { streamError = err })

    let buffer = ""
    try {
      for await (const chunk of res) {
        if (streamError) throw streamError
        buffer += chunk.toString()

        // SSE 格式: "data: {...}\n\n"，一个事件以双换行分隔
        const parts = buffer.split("\n\n")
        // 最后一段可能不完整，保留在 buffer 中
        buffer = parts.pop() ?? ""

        for (const part of parts) {
          const dataLine = part
            .split("\n")
            .find((line) => line.startsWith("data: "))
          if (dataLine) {
            const json = dataLine.slice(6)
            try {
              yield JSON.parse(json) as GlobalEvent
            } catch {
              // 忽略解析失败的行
            }
          }
        }
      }
      // 流正常结束后再次检查是否有延迟到达的 error
      if (streamError) throw streamError
    } finally {
      res.destroy()
    }
  }

  return {
    session: {
      list: (projectPath) =>
        request<Session[]>(`/api/session${projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : ""}`),
      get: (id) => request<Session>(`/api/session/${id}`),
      create: () => request<Session>("/api/session", { method: "POST" }),
      remove: (id) => request<void>(`/api/session/${id}`, { method: "DELETE" }),
    },
    chat: {
      prompt: (sessionId, content, model) =>
        request("/api/chat/prompt", {
          method: "POST",
          body: JSON.stringify({ sessionId, content, model }),
        }),
    },
    message: {
      list: (sessionId) => request<Message[]>(`/api/session/${sessionId}/messages`),
    },
    project: {
      list: () => request<Array<Pick<Project, "id" | "name" | "created_at" | "updated_at">>>("/api/project/list"),
      get: (id) => request<Project>(`/api/project/detail/${id}`),
      create: (name, code) =>
        request<Project>("/api/project/create", {
          method: "POST",
          body: JSON.stringify({ name, code }),
        }),
      update: (id, input) =>
        request<Project>(`/api/project/update/${id}`, {
          method: "PUT",
          body: JSON.stringify(input),
        }),
    },
    sync: {
      bootstrap: () => request<BootstrapData>("/api/sync/bootstrap"),
      sessionSync: (sessionId) => request<SessionSyncData>(`/api/sync/session/${sessionId}`),
      updateConfig: (key, value) =>
        request<{ success: boolean }>('/api/sync/config', {
          method: "PUT",
          body: JSON.stringify({ key, value }),
        }),
      updateTodos: (sessionId, todos) =>
        request<Todo[]>(`/api/sync/todo/${sessionId}`, {
          method: "PUT",
          body: JSON.stringify({ todos }),
        }),
    },
    global: {
      health: () => request<{ healthy: boolean; version: string }>('/global/health'),
      event: (signal) => sseStream(signal),
    },
    serverUrl: baseUrl,
  }
}
