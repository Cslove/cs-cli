// 对标 opencode 的 context/sdk.tsx —— API Client Context
import React, { createContext, useContext } from "react"
import type { Session, Message } from "../../shared/types.js"

interface ApiClient {
  session: {
    list: (projectPath?: string) => Promise<Session[]>
    get: (id: string) => Promise<Session>
    create: () => Promise<Session>
    remove: (id: string) => Promise<void>
  }
  chat: {
    prompt: (sessionId: string, content: string, model?: string) => Promise<{ sessionId: string; streaming: boolean }>
  }
  message: {
    list: (sessionId: string) => Promise<Message[]>
  }
}

const ApiContext = createContext<ApiClient | null>(null)

export function ApiProvider({ serverUrl, children }: { serverUrl: string; children: React.ReactNode }) {
  const client = createApiClient(serverUrl)

  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
}

export function useApi(): ApiClient {
  const ctx = useContext(ApiContext)
  if (!ctx) throw new Error("useApi must be used within ApiProvider")
  return ctx
}

function createApiClient(baseUrl: string): ApiClient {
  const request = async <T,>(path: string, options?: RequestInit): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    })
    if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`)
    return res.json() as Promise<T>
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
  }
}
