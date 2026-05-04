// 对标 opencode 的 context/sync.tsx —— SyncProvider
// 中央状态管理：bootstrap 初始化 + SSE 事件驱动更新 + session 按需同步
import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from "react"
import { useApi } from "./api.js"
import { useEvent } from "./event.js"
import { useProject } from "./project.js"
import type {
  Provider,
  Agent,
  Command,
  Config,
  Todo,
  Part,
  Session,
  Message,
  SessionStatus,
  PermissionRequest,
  QuestionRequest,
} from "../../shared/types.js"

// ---- State ----

export interface SyncState {
  status: "loading" | "partial" | "complete"
  provider: Provider[]
  agent: Agent[]
  command: Command[]
  config: Config
  session: Session[]
  session_status: Record<string, SessionStatus>
  todo: Record<string, Todo[]>
  message: Record<string, Message[]>
  part: Record<string, Part[]>
  permission: Record<string, PermissionRequest[]>
  question: Record<string, QuestionRequest[]>
}

const initialState: SyncState = {
  status: "loading",
  provider: [],
  agent: [],
  command: [],
  config: {},
  session: [],
  session_status: {},
  todo: {},
  message: {},
  part: {},
  permission: {},
  question: {},
}

// ---- Actions ----

type SyncAction =
  | { type: "BOOTSTRAP"; data: Omit<SyncState, "status" | "todo" | "message" | "part" | "permission" | "question"> }
  | { type: "SET_STATUS"; status: SyncState["status"] }
  | { type: "SET_SESSIONS"; sessions: Session[] }
  | { type: "SESSION_UPSERT"; session: Session }
  | { type: "SESSION_DELETE"; sessionId: string }
  | { type: "SESSION_STATUS"; sessionId: string; status: SessionStatus }
  | { type: "MESSAGE_UPSERT"; sessionId: string; message: Message }
  | { type: "MESSAGE_REMOVE"; sessionId: string; messageId: string }
  | { type: "PART_UPSERT"; messageId: string; part: Part }
  | { type: "PART_DELTA"; messageId: string; partId: string; field: string; delta: string }
  | { type: "PART_REMOVE"; messageId: string; partId: string }
  | { type: "TODO_SET"; sessionId: string; todos: Todo[] }
  | { type: "PERMISSION_ASK"; request: PermissionRequest }
  | { type: "PERMISSION_REPLY"; sessionId: string; requestId: string }
  | { type: "QUESTION_ASK"; request: QuestionRequest }
  | { type: "QUESTION_REPLY"; sessionId: string; requestId: string }
  | { type: "CONFIG_UPDATE"; key: string; value: string | number | boolean }

// ---- Reducer ----

function syncReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case "BOOTSTRAP":
      return {
        ...state,
        provider: action.data.provider,
        agent: action.data.agent,
        command: action.data.command,
        config: action.data.config,
        session: action.data.session,
        session_status: action.data.session_status,
      }

    case "SET_STATUS":
      return { ...state, status: action.status }

    case "SET_SESSIONS":
      return { ...state, session: action.sessions }

    case "SESSION_UPSERT": {
      const idx = state.session.findIndex((s) => s.id === action.session.id)
      if (idx >= 0) {
        const next = [...state.session]
        next[idx] = action.session
        return { ...state, session: next }
      }
      return { ...state, session: [...state.session, action.session] }
    }

    case "SESSION_DELETE": {
      return {
        ...state,
        session: state.session.filter((s) => s.id !== action.sessionId),
      }
    }

    case "SESSION_STATUS":
      return {
        ...state,
        session_status: { ...state.session_status, [action.sessionId]: action.status },
      }

    case "MESSAGE_UPSERT": {
      const messages = state.message[action.sessionId] ?? []
      const idx = messages.findIndex((m) => m.id === action.message.id)
      let next: Message[]
      if (idx >= 0) {
        next = [...messages]
        next[idx] = action.message
      } else {
        next = [...messages, action.message]
      }
      // 对标 opencode：限制每个 session 最多 100 条消息
      if (next.length > 100) next = next.slice(-100)
      return { ...state, message: { ...state.message, [action.sessionId]: next } }
    }

    case "MESSAGE_REMOVE": {
      const messages = state.message[action.sessionId]
      if (!messages) return state
      return {
        ...state,
        message: {
          ...state.message,
          [action.sessionId]: messages.filter((m) => m.id !== action.messageId),
        },
      }
    }

    case "PART_UPSERT": {
      const parts = state.part[action.messageId] ?? []
      const idx = parts.findIndex((p) => p.id === action.part.id)
      let next: Part[]
      if (idx >= 0) {
        next = [...parts]
        next[idx] = action.part
      } else {
        next = [...parts, action.part]
      }
      return { ...state, part: { ...state.part, [action.messageId]: next } }
    }

    case "PART_DELTA": {
      const parts = state.part[action.messageId]
      if (!parts) return state
      const idx = parts.findIndex((p) => p.id === action.partId)
      if (idx < 0) return state
      // 直接原地修改：由于 batchedUpdates 保证了同一批 dispatch 只触发一次 commit，
      // 且 reducer 的多次执行中只有最终 state 会被使用，所以原地修改是安全的
      const existing = parts[idx] as unknown as Record<string, unknown>
      const field = action.field as keyof Part
      const prev = (existing[field] as string) ?? ""
      parts[idx] = { ...parts[idx], [field]: prev + action.delta }
      // 触发 React 检测变化：创建新的 part 引用（浅拷贝最外层）
      return { ...state, part: { ...state.part, [action.messageId]: [...parts] } }
    }

    case "PART_REMOVE": {
      const parts = state.part[action.messageId]
      if (!parts) return state
      return {
        ...state,
        part: {
          ...state.part,
          [action.messageId]: parts.filter((p) => p.id !== action.partId),
        },
      }
    }

    case "TODO_SET":
      return { ...state, todo: { ...state.todo, [action.sessionId]: action.todos } }

    case "PERMISSION_ASK": {
      const list = state.permission[action.request.session_id] ?? []
      return {
        ...state,
        permission: { ...state.permission, [action.request.session_id]: [...list, action.request] },
      }
    }

    case "PERMISSION_REPLY": {
      const list = state.permission[action.sessionId]
      if (!list) return state
      return {
        ...state,
        permission: {
          ...state.permission,
          [action.sessionId]: list.filter((r) => r.id !== action.requestId),
        },
      }
    }

    case "QUESTION_ASK": {
      const list = state.question[action.request.session_id] ?? []
      return {
        ...state,
        question: { ...state.question, [action.request.session_id]: [...list, action.request] },
      }
    }

    case "QUESTION_REPLY": {
      const list = state.question[action.sessionId]
      if (!list) return state
      return {
        ...state,
        question: {
          ...state.question,
          [action.sessionId]: list.filter((r) => r.id !== action.requestId),
        },
      }
    }

    case "CONFIG_UPDATE":
      return { ...state, config: { ...state.config, [action.key]: action.value } }

    default:
      return state
  }
}

// ---- Context ----

interface SyncContextValue {
  data: SyncState
  /** bootstrap loading 状态 */
  get status(): SyncState["status"]
  /** status !== "loading" 时为 true */
  get ready(): boolean
  /** 重新拉取 bootstrap 数据 */
  bootstrap: () => Promise<void>
  session: {
    /** 从 store 中获取 session */
    get(sessionId: string): Session | undefined
    /** 刷新 session 列表 */
    refresh(): Promise<void>
    /** 根据 messages 推断 session status */
    status(sessionId: string): SessionStatus
    /** 拉取指定 session 的完整数据（messages + parts + todos） */
    sync(sessionId: string): Promise<void>
  }
}

const SyncCtx = createContext<SyncContextValue | null>(null)

// ---- Provider ----

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(syncReducer, initialState)
  const api = useApi()
  const event = useEvent()
  const project = useProject()
  const fullSyncedSessions = useRef(new Set<string>())

  // ---- Bootstrap ----

  const bootstrap = useCallback(async () => {
    const data = await api.sync.bootstrap()
    if (!data) return

    dispatch({
      type: "BOOTSTRAP",
      data: {
        provider: data.provider,
        agent: data.agent,
        command: data.command,
        config: data.config,
        session: data.session,
        session_status: data.session_status,
      },
    })
    dispatch({ type: "SET_STATUS", status: "partial" })

    // non-blocking: 标记完成
    dispatch({ type: "SET_STATUS", status: "complete" })
  }, [api])

  // ---- Session methods ----

  const sessionGet = useCallback((sessionId: string) => {
    return state.session.find((s) => s.id === sessionId)
  }, [state.session])

  const sessionRefresh = useCallback(async () => {
    const data = await api.sync.bootstrap()
    if (!data) return
    dispatch({ type: "SET_SESSIONS", sessions: data.session })
  }, [api])

  const sessionStatus = useCallback((sessionId: string): SessionStatus => {
    const status = state.session_status[sessionId]
    if (status) return status
    const messages = state.message[sessionId] ?? []
    const last = messages.at(-1)
    if (!last) return "idle"
    if (last.role === "user") return "working"
    return "idle"
  }, [state.session_status, state.message])

  const sessionSync = useCallback(async (sessionId: string) => {
    if (fullSyncedSessions.current.has(sessionId)) return
    const data = await api.sync.sessionSync(sessionId)
    if (!data) return

    // 更新 session
    dispatch({ type: "SESSION_UPSERT", session: data.session })
    // 更新 messages
    for (const msg of data.messages) {
      dispatch({ type: "MESSAGE_UPSERT", sessionId: data.session.id, message: msg })
      // 更新 parts
      for (const part of msg.parts) {
        dispatch({ type: "PART_UPSERT", messageId: msg.id, part: part as unknown as Part })
      }
    }
    // 更新 todos
    dispatch({ type: "TODO_SET", sessionId: data.session.id, todos: data.todos })

    fullSyncedSessions.current.add(sessionId)
  }, [api])

  // ---- SSE Event Subscriptions ----
  // 使用 ref 存储最新的 state，避免 useEffect 依赖 state 导致反复重新订阅
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const unsubscribers: Array<() => void> = []

    // server.instance.disposed → re-bootstrap
    unsubscribers.push(event.on("server.instance.disposed", () => {
      fullSyncedSessions.current.clear()
      void bootstrap()
    }))

    // session.updated → upsert
    unsubscribers.push(event.on("session.updated", (data) => {
      const d = data as { id: string; title?: string; model?: string }
      const existing = stateRef.current.session.find((s) => s.id === d.id)
      dispatch({
        type: "SESSION_UPSERT",
        session: {
          id: d.id,
          title: d.title ?? existing?.title ?? "",
          model: d.model ?? existing?.model ?? "",
          project_id: existing?.project_id ?? "",
          created_at: existing?.created_at ?? Date.now(),
          updated_at: Date.now(),
        },
      })
    }))

    // session.deleted → remove
    unsubscribers.push(event.on("session.deleted", (data) => {
      const d = data as { id: string }
      dispatch({ type: "SESSION_DELETE", sessionId: d.id })
    }))

    // session.status
    unsubscribers.push(event.on("session.status", (data) => {
      const d = data as { sessionID: string; status: SessionStatus }
      dispatch({ type: "SESSION_STATUS", sessionId: d.sessionID, status: d.status })
    }))

    // message.created / message.updated → upsert message
    unsubscribers.push(event.on("message.created", (data) => {
      const msg = data as Message
      dispatch({ type: "MESSAGE_UPSERT", sessionId: msg.session_id, message: msg })
    }))

    unsubscribers.push(event.on("message.updated", (data) => {
      const msg = data as Message
      dispatch({ type: "MESSAGE_UPSERT", sessionId: msg.session_id, message: msg })
    }))

    // message.removed → remove message
    unsubscribers.push(event.on("message.removed", (data) => {
      const d = data as { sessionID: string; messageID: string }
      dispatch({ type: "MESSAGE_REMOVE", sessionId: d.sessionID, messageId: d.messageID })
    }))

    // message.part.updated → upsert part
    unsubscribers.push(event.on("message.part.updated", (data) => {
      const part = data as Part & { messageID: string }
      dispatch({ type: "PART_UPSERT", messageId: part.messageID ?? part.message_id, part })
    }))

    // message.part.delta → append text delta
    unsubscribers.push(event.on("message.part.delta", (data) => {
      const d = data as { messageID: string; partID: string; field: string; delta: string }
      dispatch({ type: "PART_DELTA", messageId: d.messageID, partId: d.partID, field: d.field, delta: d.delta })
    }))

    // message.part.removed → remove part
    unsubscribers.push(event.on("message.part.removed", (data) => {
      const d = data as { messageID: string; partID: string }
      dispatch({ type: "PART_REMOVE", messageId: d.messageID, partId: d.partID })
    }))

    // todo.updated → set todos
    unsubscribers.push(event.on("todo.updated", (data) => {
      const d = data as { sessionID: string; todos: Todo[] }
      dispatch({ type: "TODO_SET", sessionId: d.sessionID, todos: d.todos })
    }))

    // permission.asked
    unsubscribers.push(event.on("permission.asked", (data) => {
      dispatch({ type: "PERMISSION_ASK", request: data as PermissionRequest })
    }))

    // permission.replied
    unsubscribers.push(event.on("permission.replied", (data) => {
      const d = data as { sessionID: string; requestID: string }
      dispatch({ type: "PERMISSION_REPLY", sessionId: d.sessionID, requestId: d.requestID })
    }))

    // question.asked
    unsubscribers.push(event.on("question.asked", (data) => {
      dispatch({ type: "QUESTION_ASK", request: data as QuestionRequest })
    }))

    // question.replied / question.rejected
    unsubscribers.push(event.on("question.replied", (data) => {
      const d = data as { sessionID: string; requestID: string }
      dispatch({ type: "QUESTION_REPLY", sessionId: d.sessionID, requestId: d.requestID })
    }))

    unsubscribers.push(event.on("question.rejected", (data) => {
      const d = data as { sessionID: string; requestID: string }
      dispatch({ type: "QUESTION_REPLY", sessionId: d.sessionID, requestId: d.requestID })
    }))

    // 兼容现有的 message.token 事件（.nodejs 特有，opencode 用 part.delta）
    unsubscribers.push(event.on("message.token", (data) => {
      const d = data as { sessionId: string; token: string }
      // 如果该 session 有 messages 且最后一条是 assistant，追加 token
      const messages = stateRef.current.message[d.sessionId] ?? []
      const last = messages.at(-1)
      if (last && last.role === "assistant") {
        dispatch({
          type: "MESSAGE_UPSERT",
          sessionId: d.sessionId,
          message: { ...last, content: last.content + d.token },
        })
      }
    }))

    return () => {
      for (const unsub of unsubscribers) unsub()
    }
  }, [event, bootstrap])

  // ---- Mount: bootstrap ----

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  // ---- Context value ----

  const value: SyncContextValue = {
    data: state,
    get status() { return state.status },
    get ready() { return state.status !== "loading" },
    bootstrap,
    session: {
      get: sessionGet,
      refresh: sessionRefresh,
      status: sessionStatus,
      sync: sessionSync,
    },
  }

  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>
}

export function useSync() {
  const ctx = useContext(SyncCtx)
  if (!ctx) throw new Error("useSync must be used within SyncProvider")
  return ctx
}
