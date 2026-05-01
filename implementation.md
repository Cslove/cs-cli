# CS CLI - 简易命令行 Agent 应用实现方案

> 本文档参考 opencode 仓库的底层架构设计，为 "CS" 命令行 Agent 应用起草最简易版实现方案。后端使用 Midway，TUI 使用 Ink。

---

## 一、架构总览

### 1.1 opencode 架构参考

opencode 的核心架构模式：

```
┌─────────────────────────────────────────────────────┐
│                    CLI Entry (yargs)                │
│                         │                           │
│                    TuiThreadCommand                  │
│                         │                           │
│              ┌──────────┴──────────┐                │
│              ▼                     ▼                │
│        Main Thread            Worker Thread          │
│        (TUI 渲染)            (Server 运行)           │
│              │                     │                │
│         Ink/opentui           Hono Server            │
│              │                     │                │
│         SDK Client ◄── RPC ──► Server Routes        │
│              │                     │                │
│         Context Providers     Session/Provider/Tool  │
│              │                     │                │
│         Event Bus ◄──── SSE ─── Event Emitter       │
└─────────────────────────────────────────────────────┘
```

关键设计点：

- **Worker/Thread 分离**：主线程运行 TUI（SolidJS + opentui），Worker 线程运行 Server（Hono）。参考 `packages/opencode/src/cli/cmd/tui/thread.ts` 和 `worker.ts`。
- **RPC 通信**：TUI 与 Server 通过 RPC 桥接，内部请求不走 HTTP，而是直接通过 RPC 调用 Hono handler。参考 `createWorkerFetch`。
- **Context Provider 模式**：TUI 使用嵌套的 Context Provider 管理状态（SDKProvider -> ProjectProvider -> SyncProvider -> ThemeProvider 等）。参考 `app.tsx`。
- **SDK Client 封装**：TUI 通过 SDK Client 与后端交互，而非直接调用 API。
- **Event Bus**：通过 SSE/RPC 事件推送实现实时状态同步。

### 1.2 CS 简化架构

```
┌─────────────────────────────────────────────────────┐
│                  CLI Entry (commander)               │
│                         │                           │
│                    CS command                     │
│                         │                           │
│              ┌──────────┴──────────┐                │
│              ▼                     ▼                │
│        Main Process          Child Process           │
│        (Ink TUI)            (Midway Server)          │
│              │                     │                │
│         React/Ink            Midway + Koa            │
│              │                     │                │
│         API Client ◄── IPC ──► Midway Controllers   │
│              │                     │                │
│         Context Hooks        Session/Provider/Tool   │
│              │                     │                │
│         EventEmitter ◄── IPC ─── Event Emitter      │
└─────────────────────────────────────────────────────┘
```

### 1.3 与 opencode 的核心差异

| 维度 | opencode | CS |
|------|----------|--------|
| 运行时 | Bun | Node.js |
| CLI 框架 | yargs | commander |
| TUI 框架 | SolidJS + opentui | React + Ink |
| 后端框架 | Hono + Effect | Midway + Koa |
| 进程间通信 | Worker + RPC (Bun Worker) | child_process + IPC |
| 存储 | SQLite + Drizzle | SQLite + better-sqlite3 |
| Provider | 多模型多供应商 | 仅 OpenAI 兼容 API |
| Agent 系统 | 多 Agent + 工具链 | 单 Agent + 简易工具 |
| 插件系统 | 完整插件体系 | 无 |

---

## 二、项目目录结构

```
CS/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # CLI 入口，解析命令行参数
│   ├── cli/
│   │   └── start.ts              # 启动命令：拉起 Server 子进程 + 渲染 Ink TUI
│   ├── server/                   # Midway 后端服务
│   │   ├── bootstrap.ts          # Midway 应用引导
│   │   ├── configuration.ts      # Midway 配置
│   │   ├── controller/
│   │   │   ├── session.ts        # 会话控制器
│   │   │   └── chat.ts           # 聊天控制器
│   │   ├── service/
│   │   │   ├── session.ts        # 会话服务
│   │   │   ├── llm.ts            # LLM 调用服务
│   │   │   └── event.ts          # 事件总线服务
│   │   └── entity/
│   │       ├── session.ts        # 会话实体
│   │       └── message.ts        # 消息实体
│   ├── tui/                      # Ink TUI 前端
│   │   ├── app.tsx               # TUI 根组件
│   │   ├── context/
│   │   │   ├── api.tsx           # API Client Context
│   │   │   ├── event.tsx         # Event Context
│   │   │   ├── session.tsx       # Session Context
│   │   │   └── route.tsx         # 路由 Context
│   │   ├── component/
│   │   │   ├── ChatView.tsx      # 聊天界面
│   │   │   ├── MessageList.tsx   # 消息列表
│   │   │   ├── InputBar.tsx      # 输入框
│   │   │   └── StatusBar.tsx     # 状态栏
│   │   └── hook/
│   │       ├── useApi.ts         # API 调用 Hook
│   │       └── useEvent.ts       # 事件监听 Hook
│   ├── shared/                   # 共享类型与工具
│   │   ├── types.ts              # 共享类型定义
│   │   ├── ipc.ts                # IPC 通信协议
│   │   └── event.ts              # 事件类型定义
│   └── storage/
│       ├── database.ts           # SQLite 数据库初始化
│       └── migration.ts          # 数据库迁移
```

---

## 三、启动流程

对标 opencode 的 `thread.ts` + `worker.ts` 启动模式：

```
用户执行 CS 命令
        │
        ▼
  index.ts (commander 解析参数)
        │
        ▼
  cli/start.ts
        │
        ├──► 拉起 Midway Server 子进程 (child_process.fork)
        │         │
        │         ▼
        │    server/bootstrap.ts
        │         │
        │         ├── 初始化 Midway 应用
        │         ├── 初始化数据库
        │         ├── 注册 Controller/Service
        │         └── 通知主进程就绪 (IPC: server:ready)
        │
        └──► 等待 server:ready 后渲染 Ink TUI
                  │
                  ▼
             tui/app.tsx
                  │
                  ├── 初始化 API Client Context
                  ├── 初始化 Event Context
                  ├── 初始化 Session Context
                  └── 渲染 ChatView
```

### 3.1 CLI 入口 (`src/index.ts`)

```typescript
import { Command } from "commander"

const program = new Command()

program
  .name("CS")
  .description("A simple CLI agent")
  .version("0.1.0")
  .argument("[project]", "path to project directory", process.cwd())
  .option("-m, --model <model>", "model to use", "openai/gpt-4o")
  .option("-s, --session <id>", "resume a session")
  .action(async (project, options) => {
    const { start } = await import("./cli/start")
    await start({ project, ...options })
  })

program.parse()
```

### 3.2 启动命令 (`src/cli/start.ts`)

参考 opencode 的 `thread.ts`，管理子进程生命周期：

```typescript
import { fork, type ChildProcess } from "child_process"
import { render } from "ink"
import React from "react"
import { App } from "../tui/app"

interface StartOptions {
  project: string
  model?: string
  session?: string
}

export async function start(options: StartOptions) {
  // 1. 拉起 Midway Server 子进程
  const serverProcess = fork(require.resolve("../server/bootstrap"), [], {
    env: {
      ...process.env,
      SIRONG_PROJECT: options.project,
      SIRONG_MODEL: options.model,
    },
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  })

  // 2. 等待 Server 就绪
  const serverUrl = await waitForServerReady(serverProcess)

  // 3. 创建 IPC 通信桥接
  const ipcBridge = createIpcBridge(serverProcess)

  // 4. 渲染 Ink TUI
  const { waitUntilExit } = render(
    <App
      serverUrl={serverUrl}
      ipcBridge={ipcBridge}
      project={options.project}
      model={options.model}
      sessionId={options.session}
    />
  )

  // 5. 等待 TUI 退出
  await waitUntilExit()

  // 6. 关闭 Server 子进程
  serverProcess.send({ type: "shutdown" })
  await gracefulExit(serverProcess)
}

function waitForServerReady(proc: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 10000)
    proc.on("message", (msg: any) => {
      if (msg.type === "server:ready") {
        clearTimeout(timeout)
        resolve(msg.url)
      }
    })
    proc.on("error", reject)
  })
}
```

---

## 四、后端服务设计 (Midway)

对标 opencode 的 `server/server.ts` (Hono) + `server/routes/` 目录结构。

### 4.1 Midway 引导 (`src/server/bootstrap.ts`)

```typescript
import { Bootstrap } from "@midwayjs/core"
import { Application } from "@midwayjs/koa"

async function main() {
  const app = await Bootstrap.configure({
    imports: [
      import("@midwayjs/koa"),
    ],
  }).run()

  const server = app.getServer("koaServer") as any
  const port = 0 // 使用随机可用端口
  const httpServer = server.listen(port)

  const address = httpServer.address()
  const actualPort = typeof address === "object" ? address.port : port

  // 通知主进程 Server 已就绪
  process.send!({
    type: "server:ready",
    url: `http://127.0.0.1:${actualPort}`,
  })

  // 监听主进程的 shutdown 信号
  process.on("message", (msg: any) => {
    if (msg.type === "shutdown") {
      httpServer.close()
      process.exit(0)
    }
  })
}

main().catch(console.error)
```

### 4.2 Midway 配置 (`src/server/configuration.ts`)

```typescript
import { Configuration, IMidwayContainer } from "@midwayjs/core"
import * as koa from "@midwayjs/koa"

@Configuration({
  imports: [koa],
  importConfigs: [],
})
export class ContainerConfiguration {
  async onReady(container: IMidwayContainer) {
    // 初始化数据库
    const { initDatabase } = await import("../storage/database")
    await initDatabase()
  }
}
```

### 4.3 会话控制器 (`src/server/controller/session.ts`)

对标 opencode 的 `server/routes/instance/session.ts`：

```typescript
import { Controller, Get, Post, Inject, Del } from "@midwayjs/core"
import { Context } from "@midwayjs/koa"
import { SessionService } from "../service/session"

@Controller("/api/session")
export class SessionController {
  @Inject()
  sessionService: SessionService

  @Get("/")
  async list() {
    return this.sessionService.list()
  }

  @Get("/:id")
  async get(ctx: Context) {
    const session = await this.sessionService.get(ctx.params.id)
    if (!session) ctx.throw(404)
    return session
  }

  @Post("/")
  async create() {
    return this.sessionService.create()
  }

  @Del("/:id")
  async remove(ctx: Context) {
    await this.sessionService.remove(ctx.params.id)
    return { success: true }
  }
}
```

### 4.4 聊天控制器 (`src/server/controller/chat.ts`)

对标 opencode 的 `server/routes/instance/session.ts` 中的 prompt 相关路由：

```typescript
import { Controller, Post, Inject, Body } from "@midwayjs/core"
import { SessionService } from "../service/session"
import { LlmService } from "../service/llm"
import { EventService } from "../service/event"

@Controller("/api/chat")
export class ChatController {
  @Inject()
  sessionService: SessionService

  @Inject()
  llmService: LlmService

  @Inject()
  eventService: EventService

  @Post("/prompt")
  async prompt(
    @Body() body: { sessionId: string; content: string; model?: string }
  ) {
    const session = await this.sessionService.getOrCreate(body.sessionId)

    // 保存用户消息
    const userMessage = await this.sessionService.addMessage({
      sessionId: session.id,
      role: "user",
      content: body.content,
    })

    // 发送事件通知 TUI
    this.eventService.emit("message.created", userMessage)

    // 调用 LLM 并流式返回
    const stream = this.llmService.chat({
      sessionId: session.id,
      messages: await this.sessionService.getMessages(session.id),
      model: body.model,
      onToken: (token) => {
        this.eventService.emit("message.token", {
          sessionId: session.id,
          token,
        })
      },
      onComplete: async (fullContent) => {
        const assistantMessage = await this.sessionService.addMessage({
          sessionId: session.id,
          role: "assistant",
          content: fullContent,
        })
        this.eventService.emit("message.created", assistantMessage)
      },
    })

    return { sessionId: session.id, streaming: true }
  }
}
```

### 4.5 LLM 服务 (`src/server/service/llm.ts`)

对标 opencode 的 `session/llm.ts`，简化为 OpenAI API 调用：

```typescript
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"
import OpenAI from "openai"

@Provide()
@Scope(ScopeEnum.Singleton)
export class LlmService {
  private clients: Map<string, OpenAI> = new Map()

  private getClient(baseUrl?: string): OpenAI {
    const key = baseUrl ?? "default"
    if (!this.clients.has(key)) {
      this.clients.set(key, new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      }))
    }
    return this.clients.get(key)!
  }

  async chat(options: {
    sessionId: string
    messages: Array<{ role: string; content: string }>
    model?: string
    onToken: (token: string) => void
    onComplete: (fullContent: string) => void
  }) {
    const client = this.getClient()
    const model = options.model ?? process.env.SIRONG_MODEL ?? "gpt-4o"

    const stream = await client.chat.completions.create({
      model,
      messages: options.messages as any,
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
```

### 4.6 事件总线服务 (`src/server/service/event.ts`)

对标 opencode 的 `bus/global.ts`，简化版：

```typescript
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"
import { EventEmitter } from "events"

@Provide()
@Scope(ScopeEnum.Singleton)
export class EventService extends EventEmitter {
  // 使用 Node.js 原生 EventEmitter 即可
  // 当有 IPC 桥接时，自动将事件转发给主进程

  private ipcSend: ((msg: any) => void) | null = null

  setIpcSender(send: (msg: any) => void) {
    this.ipcSend = send
  }

  emit(event: string, data: any): boolean {
    // 转发给 IPC
    if (this.ipcSend) {
      this.ipcSend({ type: "event", event, data })
    }
    return super.emit(event, data)
  }
}
```

---

## 五、TUI 前端设计 (Ink)

对标 opencode 的 `cli/cmd/tui/app.tsx` + `context/` 目录。

### 5.1 TUI 根组件 (`src/tui/app.tsx`)

对标 opencode 的 `tui()` 函数和 `App` 组件，用 Ink 的 Context Provider 替代 SolidJS 的 Context：

```tsx
import React, { useState, useEffect } from "react"
import { Box, Text } from "ink"
import { ApiProvider } from "./context/api"
import { EventProvider } from "./context/event"
import { SessionProvider } from "./context/session"
import { RouteProvider, useRoute } from "./context/route"
import { ChatView } from "./component/ChatView"
import { HomeView } from "./component/HomeView"

interface AppProps {
  serverUrl: string
  ipcBridge: IpcBridge
  project: string
  model?: string
  sessionId?: string
}

export function App(props: AppProps) {
  return (
    <ApiProvider serverUrl={props.serverUrl}>
      <EventProvider ipcBridge={props.ipcBridge}>
        <SessionProvider>
          <RouteProvider initialSessionId={props.sessionId}>
            <AppContent model={props.model} />
          </RouteProvider>
        </SessionProvider>
      </EventProvider>
    </ApiProvider>
  )
}

function AppContent(props: { model?: string }) {
  const { route } = useRoute()

  switch (route.type) {
    case "home":
      return <HomeView />
    case "session":
      return <ChatView model={props.model} />
  }
}
```

### 5.2 API Client Context (`src/tui/context/api.tsx`)

对标 opencode 的 `context/sdk.tsx`，封装 HTTP 调用：

```tsx
import React, { createContext, useContext } from "react"
import type { IpcBridge } from "../../shared/ipc"

interface ApiClient {
  session: {
    list: () => Promise<any[]>
    get: (id: string) => Promise<any>
    create: () => Promise<any>
    remove: (id: string) => Promise<void>
  }
  chat: {
    prompt: (sessionId: string, content: string, model?: string) => Promise<any>
  }
}

const ApiContext = createContext<ApiClient | null>(null)

export function ApiProvider({ serverUrl, children }: {
  serverUrl: string
  children: React.ReactNode
}) {
  const client = createApiClient(serverUrl)

  return (
    <ApiContext.Provider value={client}>
      {children}
    </ApiContext.Provider>
  )
}

export function useApi(): ApiClient {
  const ctx = useContext(ApiContext)
  if (!ctx) throw new Error("useApi must be used within ApiProvider")
  return ctx
}

function createApiClient(baseUrl: string): ApiClient {
  const request = async (path: string, options?: RequestInit) => {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  }

  return {
    session: {
      list: () => request("/api/session"),
      get: (id) => request(`/api/session/${id}`),
      create: () => request("/api/session", { method: "POST" }),
      remove: (id) => request(`/api/session/${id}`, { method: "DELETE" }),
    },
    chat: {
      prompt: (sessionId, content, model) =>
        request("/api/chat/prompt", {
          method: "POST",
          body: JSON.stringify({ sessionId, content, model }),
        }),
    },
  }
}
```

### 5.3 Event Context (`src/tui/context/event.tsx`)

对标 opencode 的 `context/event.ts` + `context/sdk.tsx` 中的 SSE 逻辑，简化为 IPC 事件：

```tsx
import React, { createContext, useContext, useEffect, useRef } from "react"
import type { IpcBridge } from "../../shared/ipc"

type EventHandler = (data: any) => void

interface EventContext {
  on: (event: string, handler: EventHandler) => () => void
  off: (event: string, handler: EventHandler) => void
}

const EventCtx = createContext<EventContext | null>(null)

export function EventProvider({
  ipcBridge,
  children,
}: {
  ipcBridge: IpcBridge
  children: React.ReactNode
}) {
  const listeners = useRef<Map<string, Set<EventHandler>>>(new Map())

  useEffect(() => {
    // 监听子进程发来的事件
    const unsubscribe = ipcBridge.on("event", (msg: { event: string; data: any }) => {
      const handlers = listeners.current.get(msg.event)
      if (handlers) {
        handlers.forEach((handler) => handler(msg.data))
      }
    })

    return unsubscribe
  }, [ipcBridge])

  const context: EventContext = {
    on(event, handler) {
      if (!listeners.current.has(event)) {
        listeners.current.set(event, new Set())
      }
      listeners.current.get(event)!.add(handler)
      return () => this.off(event, handler)
    },
    off(event, handler) {
      listeners.current.get(event)?.delete(handler)
    },
  }

  return (
    <EventCtx.Provider value={context}>
      {children}
    </EventCtx.Provider>
  )
}

export function useEvent() {
  const ctx = useContext(EventCtx)
  if (!ctx) throw new Error("useEvent must be used within EventProvider")
  return ctx
}
```

### 5.4 Session Context (`src/tui/context/session.tsx`)

对标 opencode 的 `context/sync.tsx`，简化版：

```tsx
import React, { createContext, useContext, useReducer, useEffect } from "react"
import { useApi } from "./api"
import { useEvent } from "./event"

interface Session {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: number
}

interface SessionState {
  current: Session | null
  list: Session[]
  streamingText: string
  loading: boolean
}

type SessionAction =
  | { type: "SET_CURRENT"; session: Session }
  | { type: "SET_LIST"; list: Session[] }
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "APPEND_STREAM"; token: string }
  | { type: "CLEAR_STREAM" }
  | { type: "SET_LOADING"; loading: boolean }

function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "SET_CURRENT":
      return { ...state, current: action.session }
    case "SET_LIST":
      return { ...state, list: action.list }
    case "ADD_MESSAGE":
      if (!state.current) return state
      return {
        ...state,
        current: {
          ...state.current,
          messages: [...state.current.messages, action.message],
        },
      }
    case "APPEND_STREAM":
      return { ...state, streamingText: state.streamingText + action.token }
    case "CLEAR_STREAM":
      return { ...state, streamingText: "" }
    case "SET_LOADING":
      return { ...state, loading: action.loading }
  }
}

const SessionCtx = createContext<{
  state: SessionState
  dispatch: React.Dispatch<SessionAction>
  createSession: () => Promise<void>
  sendMessage: (content: string) => Promise<void>
} | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const api = useApi()
  const eventBus = useEvent()
  const [state, dispatch] = useReducer(reducer, {
    current: null,
    list: [],
    streamingText: "",
    loading: false,
  })

  // 监听服务端事件
  useEffect(() => {
    const unsubs = [
      eventBus.on("message.created", (msg: Message) => {
        dispatch({ type: "ADD_MESSAGE", message: msg })
      }),
      eventBus.on("message.token", (data: { sessionId: string; token: string }) => {
        dispatch({ type: "APPEND_STREAM", token: data.token })
      }),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [eventBus])

  const createSession = async () => {
    const session = await api.session.create()
    dispatch({ type: "SET_CURRENT", session })
  }

  const sendMessage = async (content: string) => {
    if (!state.current) return
    dispatch({ type: "SET_LOADING", loading: true })
    dispatch({ type: "CLEAR_STREAM" })
    try {
      await api.chat.prompt(state.current.id, content)
    } finally {
      dispatch({ type: "SET_LOADING", loading: false })
    }
  }

  return (
    <SessionCtx.Provider value={{ state, dispatch, createSession, sendMessage }}>
      {children}
    </SessionCtx.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionCtx)
  if (!ctx) throw new Error("useSession must be used within SessionProvider")
  return ctx
}
```

### 5.5 Route Context (`src/tui/context/route.tsx`)

对标 opencode 的 `context/route.tsx`：

```tsx
import React, { createContext, useContext, useState } from "react"

type Route = { type: "home" } | { type: "session"; sessionId: string }

const RouteCtx = createContext<{
  route: Route
  navigate: (route: Route) => void
} | null>(null)

export function RouteProvider({
  initialSessionId,
  children,
}: {
  initialSessionId?: string
  children: React.ReactNode
}) {
  const [route, setRoute] = useState<Route>(
    initialSessionId ? { type: "session", sessionId: initialSessionId } : { type: "home" }
  )

  return (
    <RouteCtx.Provider value={{ route, navigate: setRoute }}>
      {children}
    </RouteCtx.Provider>
  )
}

export function useRoute() {
  const ctx = useContext(RouteCtx)
  if (!ctx) throw new Error("useRoute must be used within RouteProvider")
  return ctx
}
```

### 5.6 聊天界面 (`src/tui/component/ChatView.tsx`)

```tsx
import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import { useSession } from "../context/session"
import { MessageList } from "./MessageList"
import { InputBar } from "./InputBar"
import { StatusBar } from "./StatusBar"

export function ChatView({ model }: { model?: string }) {
  const { state, sendMessage } = useSession()
  const [input, setInput] = useState("")

  useInput((ch, key) => {
    if (key.return && input.trim()) {
      sendMessage(input.trim())
      setInput("")
    } else if (key.backspace) {
      setInput((prev) => prev.slice(0, -1))
    } else if (ch && !key.return) {
      setInput((prev) => prev + ch)
    }
  })

  return (
    <Box flexDirection="column" height="100%">
      <MessageList
        messages={state.current?.messages ?? []}
        streamingText={state.streamingText}
      />
      <StatusBar model={model} loading={state.loading} />
      <InputBar value={input} />
    </Box>
  )
}
```

---

## 六、IPC 通信协议

对标 opencode 的 `util/rpc.ts`，使用 Node.js 原生 IPC 机制替代 Bun Worker RPC：

### 6.1 IPC 类型定义 (`src/shared/ipc.ts`)

```typescript
import { EventEmitter } from "events"
import type { ChildProcess } from "child_process"

// IPC 消息协议
export type IpcMessage =
  | { type: "server:ready"; url: string }
  | { type: "shutdown" }
  | { type: "event"; event: string; data: any }
  | { type: "rpc:request"; id: string; method: string; params: any }
  | { type: "rpc:response"; id: string; result?: any; error?: string }

export interface IpcBridge {
  send: (msg: IpcMessage) => void
  on: (event: string, handler: (msg: any) => void) => () => void
}

export function createIpcBridge(proc: ChildProcess): IpcBridge {
  const emitter = new EventEmitter()

  proc.on("message", (msg: IpcMessage) => {
    if (msg.type === "event") {
      emitter.emit("event", msg)
    } else if (msg.type === "rpc:response") {
      emitter.emit(`rpc:${msg.id}`, msg)
    }
  })

  return {
    send: (msg) => proc.send!(msg),
    on: (event, handler) => {
      emitter.on(event, handler)
      return () => emitter.off(event, handler)
    },
  }
}
```

---

## 七、数据模型

对标 opencode 的 `storage/schema.ts` + `session/session.ts`，简化版：

### 7.1 Session 实体

```typescript
export interface Session {
  id: string           // UUID
  title: string        // 会话标题
  model: string        // 使用的模型
  project_path: string // 项目路径
  created_at: number   // 创建时间戳
  updated_at: number   // 更新时间戳
}
```

### 7.2 Message 实体

```typescript
export interface Message {
  id: string           // UUID
  session_id: string   // 所属会话
  role: "user" | "assistant" | "system"
  content: string      // 消息内容
  model: string        // 使用的模型（仅 assistant）
  created_at: number   // 创建时间戳
}
```

### 7.3 数据库初始化 (`src/storage/database.ts`)

```typescript
import Database from "better-sqlite3"
import path from "path"
import os from "os"

let db: Database.Database

export async function initDatabase() {
  const dbPath = path.join(
    os.homedir(),
    ".CS",
    "data.db"
  )
  db = new Database(dbPath)
  db.pragma("journal_mode = WAL")

  db.exec(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      project_path TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES session(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_message_session ON message(session_id);
  `)
}

export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialized")
  return db
}
```

---

## 八、通信流程详解

### 8.1 内部通信模式（默认）

```
Ink TUI (主进程)              Midway Server (子进程)
     │                              │
     │  IPC: rpc:request            │
     │  {method, params}            │
     ├─────────────────────────────►│
     │                              │ 调用 Controller
     │                              │ 执行业务逻辑
     │  IPC: rpc:response           │
     │◄─────────────────────────────┤
     │                              │
     │                              │
     │  IPC: event                  │
     │  {event, data}               │
     │◄─────────────────────────────┤
     │ (Event Context 分发)         │
```

对标 opencode 中 `createWorkerFetch` 的设计思路，内部模式下不启动 HTTP 监听，所有请求通过 IPC 传递。

### 8.2 HTTP 通信模式（可选）

当需要支持外部客户端连接时（如 Web UI），Server 可监听端口：

```
Ink TUI (主进程)              Midway Server (子进程)
     │                              │
     │  HTTP fetch                  │ Koa HTTP Server
     ├─────────────────────────────►│ :port
     │                              │
     │  SSE stream                  │
     │◄─────────────────────────────┤
```

此模式对标 opencode 中 `--port` 参数启动外部 HTTP 服务的逻辑。

---

## 九、依赖清单

```json
{
  "dependencies": {
    "@midwayjs/core": "^3",
    "@midwayjs/koa": "^3",
    "commander": "^12",
    "ink": "^5",
    "react": "^18",
    "openai": "^4",
    "better-sqlite3": "^11",
    "uuid": "^10"
  },
  "devDependencies": {
    "@types/react": "^18",
    "@types/better-sqlite3": "^7",
    "typescript": "^5",
    "tsx": "^4"
  }
}
```

---

## 十、开发与构建

### 10.1 开发模式

```bash
# 安装依赖
npm install

# 开发运行
npx tsx src/index.ts

# 或使用 nodemon 热重载
npx nodemon --exec tsx src/index.ts
```

### 10.2 构建发布

```bash
# TypeScript 编译
npx tsc

# 使用 pkg 打包为独立可执行文件
npx pkg dist/index.js --targets node18 --output CS
```

### 10.3 全局安装

```bash
# 本地链接
npm link

# 之后即可直接使用
CS
CS /path/to/project
CS -m gpt-4o
CS -s <session-id>
```

---

## 十一、架构对标总结

| opencode 模块 | CS 对应 | 文件位置 |
|---|---|---|
| `src/index.ts` (yargs CLI) | `src/index.ts` (commander CLI) | 入口 |
| `src/cli/cmd/tui/thread.ts` | `src/cli/start.ts` | 启动编排 |
| `src/cli/cmd/tui/worker.ts` | `src/server/bootstrap.ts` | 服务引导 |
| `src/util/rpc.ts` | `src/shared/ipc.ts` | 进程间通信 |
| `src/server/server.ts` (Hono) | `src/server/` (Midway + Koa) | HTTP 服务 |
| `src/server/routes/instance/session.ts` | `src/server/controller/session.ts` | 会话路由 |
| `src/session/session.ts` | `src/server/service/session.ts` | 会话服务 |
| `src/session/llm.ts` | `src/server/service/llm.ts` | LLM 调用 |
| `src/bus/global.ts` | `src/server/service/event.ts` | 事件总线 |
| `src/storage/storage.ts` | `src/storage/database.ts` | 数据存储 |
| `src/cli/cmd/tui/app.tsx` (SolidJS) | `src/tui/app.tsx` (Ink/React) | TUI 根组件 |
| `src/cli/cmd/tui/context/sdk.tsx` | `src/tui/context/api.tsx` | API 客户端 |
| `src/cli/cmd/tui/context/event.ts` | `src/tui/context/event.tsx` | 事件监听 |
| `src/cli/cmd/tui/context/sync.tsx` | `src/tui/context/session.tsx` | 状态同步 |
| `src/cli/cmd/tui/context/route.tsx` | `src/tui/context/route.tsx` | 路由管理 |
| `src/cli/cmd/tui/context/helper.tsx` | React Context API | 上下文封装 |
