// 对标 opencode 的 context/sync.tsx —— Session 状态 Context
import React, { createContext, useContext, useReducer, useEffect, useCallback } from "react"
import { useApi } from "./api.js"
import { useEvent } from "./event.js"
import type { Session, Message } from "../../shared/types.js"

interface SessionState {
  current: Session | null
  list: Session[]
  messages: Message[]
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
  | { type: "SET_MESSAGES"; messages: Message[] }

function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "SET_CURRENT":
      return { ...state, current: action.session, messages: [], streamingText: "" }
    case "SET_LIST":
      return { ...state, list: action.list }
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] }
    case "APPEND_STREAM":
      return { ...state, streamingText: state.streamingText + action.token }
    case "CLEAR_STREAM":
      return { ...state, streamingText: "" }
    case "SET_LOADING":
      return { ...state, loading: action.loading }
    case "SET_MESSAGES":
      return { ...state, messages: action.messages }
  }
}

const SessionCtx = createContext<{
  state: SessionState
  createSession: () => Promise<Session>
  sendMessage: (content: string) => Promise<void>
  loadSession: (id: string) => Promise<void>
  loadSessionList: () => Promise<void>
} | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const api = useApi()
  const eventBus = useEvent()
  const [state, dispatch] = useReducer(reducer, {
    current: null,
    list: [],
    messages: [],
    streamingText: "",
    loading: false,
  })

  // 监听服务端事件
  useEffect(() => {
    const unsubs = [
      eventBus.on("message.created", (data) => {
        const msg = data as Message
        dispatch({ type: "ADD_MESSAGE", message: msg })
      }),
      eventBus.on("message.token", (data) => {
        const d = data as { sessionId: string; token: string }
        dispatch({ type: "APPEND_STREAM", token: d.token })
      }),
      eventBus.on("session.error", () => {
        dispatch({ type: "SET_LOADING", loading: false })
      }),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [eventBus])

  const createSession = useCallback(async () => {
    const session = await api.session.create()
    dispatch({ type: "SET_CURRENT", session })
    return session
  }, [api])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!state.current) return
      dispatch({ type: "SET_LOADING", loading: true })
      dispatch({ type: "CLEAR_STREAM" })

      // 先将用户消息添加到本地
      const optimisticMsg: Message = {
        id: `temp-${Date.now()}`,
        session_id: state.current.id,
        role: "user",
        content,
        model: "",
        created_at: Date.now(),
      }
      dispatch({ type: "ADD_MESSAGE", message: optimisticMsg })

      try {
        await api.chat.prompt(state.current.id, content)
        // streaming 完成后由事件触发 ADD_MESSAGE 和 SET_LOADING
      } catch (e) {
        dispatch({ type: "SET_LOADING", loading: false })
        throw e
      }
    },
    [api, state.current],
  )

  const loadSession = useCallback(
    async (id: string) => {
      const session = await api.session.get(id)
      dispatch({ type: "SET_CURRENT", session })
      const messages = await api.message.list(id)
      dispatch({ type: "SET_MESSAGES", messages })
    },
    [api],
  )

  const loadSessionList = useCallback(async () => {
    const list = await api.session.list()
    dispatch({ type: "SET_LIST", list })
  }, [api])

  return (
    <SessionCtx.Provider value={{ state, createSession, sendMessage, loadSession, loadSessionList }}>
      {children}
    </SessionCtx.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionCtx)
  if (!ctx) throw new Error("useSession must be used within SessionProvider")
  return ctx
}
