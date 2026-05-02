// 对标 opencode 的 context/local.tsx —— 本地 UI 状态（agent/model 选择、持久化）
import React, { createContext, useContext, useReducer, useCallback, useEffect } from "react"
import { useSync } from "./sync.js"
import { useKV } from "./kv.js"
import { useToast } from "./toast.js"
import type { Agent, Provider } from "../../shared/types.js"

// ---- State ----

export interface ModelKey {
  providerID: string
  modelID: string
}

interface LocalState {
  /** 当前 agent id */
  agentId: string | undefined
  /** 每个 agent 选择的 model */
  agentModel: Record<string, ModelKey>
  /** 最近使用的 model 列表 */
  recentModels: ModelKey[]
  /** 收藏的 model 列表 */
  favoriteModels: ModelKey[]
}

type LocalAction =
  | { type: "SET_AGENT"; agentId: string }
  | { type: "SET_MODEL"; agentId: string; model: ModelKey }
  | { type: "SET_RECENT"; models: ModelKey[] }
  | { type: "SET_FAVORITE"; models: ModelKey[] }
  | { type: "LOAD_PERSISTED"; data: Partial<Pick<LocalState, "recentModels" | "favoriteModels" | "agentModel">> }

const initialState: LocalState = {
  agentId: undefined,
  agentModel: {},
  recentModels: [],
  favoriteModels: [],
}

function localReducer(state: LocalState, action: LocalAction): LocalState {
  switch (action.type) {
    case "SET_AGENT":
      return { ...state, agentId: action.agentId }
    case "SET_MODEL":
      return { ...state, agentModel: { ...state.agentModel, [action.agentId]: action.model } }
    case "SET_RECENT":
      return { ...state, recentModels: action.models }
    case "SET_FAVORITE":
      return { ...state, favoriteModels: action.models }
    case "LOAD_PERSISTED":
      return {
        ...state,
        recentModels: action.data.recentModels ?? state.recentModels,
        favoriteModels: action.data.favoriteModels ?? state.favoriteModels,
        agentModel: action.data.agentModel ?? state.agentModel,
      }
    default:
      return state
  }
}

// ---- Context ----

interface LocalContextValue {
  agent: {
    list(): Agent[]
    current(): Agent | undefined
    set(name: string): void
    move(direction: 1 | -1): void
  }
  model: {
    current(): ModelKey | undefined
    parsed(): { provider: string; model: string }
    recent(): ModelKey[]
    favorite(): ModelKey[]
    set(model: ModelKey, options?: { recent?: boolean }): void
    cycle(direction: 1 | -1): void
    cycleFavorite(direction: 1 | -1): void
    toggleFavorite(model: ModelKey): void
  }
}

const LocalCtx = createContext<LocalContextValue | null>(null)

// ---- Provider ----

export function LocalProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(localReducer, initialState)
  const sync = useSync()
  const kv = useKV()
  const toast = useToast()

  // 加载持久化数据
  useEffect(() => {
    if (!kv.ready) return
    dispatch({
      type: "LOAD_PERSISTED",
      data: {
        recentModels: kv.get<ModelKey[]>("local.recentModels", []),
        favoriteModels: kv.get<ModelKey[]>("local.favoriteModels", []),
        agentModel: kv.get<Record<string, ModelKey>>("local.agentModel", {}),
      },
    })
  }, [kv.ready])

  // 持久化
  const persist = useCallback((key: string, value: unknown) => {
    kv.set(key, value)
  }, [kv])

  // 验证 model 是否在可用 provider 列表中
  const isModelValid = useCallback((model: ModelKey) => {
    const provider = sync.data.provider.find((x) => x.id === model.providerID)
    if (!provider) return false
    return provider.model === model.modelID || provider.connected
  }, [sync.data.provider])

  // 初始化默认 agent
  useEffect(() => {
    if (state.agentId !== undefined) return
    if (sync.data.agent.length > 0) {
      dispatch({ type: "SET_AGENT", agentId: sync.data.agent[0].id })
    }
  }, [sync.data.agent, state.agentId])

  // ---- Agent ----

  const agentList = useCallback(() => sync.data.agent, [sync.data.agent])

  const agentCurrent = useCallback(() => {
    return sync.data.agent.find((a) => a.id === state.agentId) ?? sync.data.agent.at(0)
  }, [sync.data.agent, state.agentId])

  const agentSet = useCallback((id: string) => {
    if (!sync.data.agent.some((a) => a.id === id)) {
      toast.show({ variant: "warning", message: `Agent not found: ${id}`, duration: 3000 })
      return
    }
    dispatch({ type: "SET_AGENT", agentId: id })
  }, [sync.data.agent, toast])

  const agentMove = useCallback((direction: 1 | -1) => {
    const agents = sync.data.agent
    if (agents.length === 0) return
    const currentIdx = agents.findIndex((a) => a.id === state.agentId)
    let next = currentIdx + direction
    if (next < 0) next = agents.length - 1
    if (next >= agents.length) next = 0
    dispatch({ type: "SET_AGENT", agentId: agents[next].id })
  }, [sync.data.agent, state.agentId])

  // ---- Model ----

  const fallbackModel = useCallback((): ModelKey | undefined => {
    // 优先使用 SyncProvider 中的 config.model
    const configModel = sync.data.config.model as string | undefined
    if (configModel) {
      const parsed = parseModel(configModel)
      if (isModelValid(parsed)) return parsed
    }
    // 其次用 recent
    for (const item of state.recentModels) {
      if (isModelValid(item)) return item
    }
    // 最后用第一个 provider 的默认 model
    const provider = sync.data.provider[0]
    if (!provider) return undefined
    return { providerID: provider.id, modelID: provider.model }
  }, [sync.data.config, sync.data.provider, state.recentModels, isModelValid])

  const modelCurrent = useCallback((): ModelKey | undefined => {
    const agent = agentCurrent()
    if (agent) {
      const agentModel = state.agentModel[agent.id]
      if (agentModel && isModelValid(agentModel)) return agentModel
    }
    return fallbackModel()
  }, [agentCurrent, state.agentModel, fallbackModel, isModelValid])

  const modelParsed = useCallback(() => {
    const value = modelCurrent()
    if (!value) return { provider: "Connect a provider", model: "No provider selected" }
    const provider = sync.data.provider.find((x) => x.id === value.providerID)
    return {
      provider: provider?.name ?? value.providerID,
      model: value.modelID,
    }
  }, [modelCurrent, sync.data.provider])

  const modelSet = useCallback((model: ModelKey, options?: { recent?: boolean }) => {
    if (!isModelValid(model)) {
      toast.show({ variant: "warning", message: `Model ${model.providerID}/${model.modelID} is not valid`, duration: 3000 })
      return
    }
    const agent = agentCurrent()
    if (!agent) return
    dispatch({ type: "SET_MODEL", agentId: agent.id, model })
    persist("local.agentModel", { ...state.agentModel, [agent.id]: model })
    if (options?.recent) {
      const uniq = dedupModels([model, ...state.recentModels]).slice(0, 10)
      dispatch({ type: "SET_RECENT", models: uniq })
      persist("local.recentModels", uniq)
    }
  }, [isModelValid, agentCurrent, state.agentModel, state.recentModels, persist, toast])

  const modelCycle = useCallback((direction: 1 | -1) => {
    const current = modelCurrent()
    if (!current) return
    const recent = state.recentModels
    const idx = recent.findIndex((x) => x.providerID === current.providerID && x.modelID === current.modelID)
    if (idx === -1) return
    let next = idx + direction
    if (next < 0) next = recent.length - 1
    if (next >= recent.length) next = 0
    const val = recent[next]
    if (!val) return
    const agent = agentCurrent()
    if (!agent) return
    dispatch({ type: "SET_MODEL", agentId: agent.id, model: val })
  }, [modelCurrent, state.recentModels, agentCurrent])

  const modelCycleFavorite = useCallback((direction: 1 | -1) => {
    const favorites = state.favoriteModels.filter(isModelValid)
    if (favorites.length === 0) {
      toast.show({ variant: "info", message: "Add a favorite model to use this shortcut", duration: 3000 })
      return
    }
    const current = modelCurrent()
    let idx = -1
    if (current) {
      idx = favorites.findIndex((x) => x.providerID === current.providerID && x.modelID === current.modelID)
    }
    if (idx === -1) {
      idx = direction === 1 ? 0 : favorites.length - 1
    } else {
      idx += direction
      if (idx < 0) idx = favorites.length - 1
      if (idx >= favorites.length) idx = 0
    }
    const next = favorites[idx]
    if (!next) return
    modelSet(next, { recent: true })
  }, [state.favoriteModels, modelCurrent, modelSet, isModelValid, toast])

  const modelToggleFavorite = useCallback((model: ModelKey) => {
    if (!isModelValid(model)) return
    const exists = state.favoriteModels.some(
      (x) => x.providerID === model.providerID && x.modelID === model.modelID,
    )
    const next = exists
      ? state.favoriteModels.filter((x) => x.providerID !== model.providerID || x.modelID !== model.modelID)
      : [model, ...state.favoriteModels]
    dispatch({ type: "SET_FAVORITE", models: next })
    persist("local.favoriteModels", next)
  }, [isModelValid, state.favoriteModels, persist])

  // ---- Context Value ----

  const value: LocalContextValue = {
    agent: {
      list: agentList,
      current: agentCurrent,
      set: agentSet,
      move: agentMove,
    },
    model: {
      current: modelCurrent,
      parsed: modelParsed,
      recent: () => state.recentModels,
      favorite: () => state.favoriteModels,
      set: modelSet,
      cycle: modelCycle,
      cycleFavorite: modelCycleFavorite,
      toggleFavorite: modelToggleFavorite,
    },
  }

  return <LocalCtx.Provider value={value}>{children}</LocalCtx.Provider>
}

export function useLocal() {
  const ctx = useContext(LocalCtx)
  if (!ctx) throw new Error("useLocal must be used within LocalProvider")
  return ctx
}

// ---- Helpers ----

export function parseModel(model: string): ModelKey {
  const [providerID, ...rest] = model.split("/")
  return { providerID, modelID: rest.join("/") }
}

function dedupModels(models: ModelKey[]): ModelKey[] {
  const seen = new Set<string>()
  return models.filter((m) => {
    const key = `${m.providerID}/${m.modelID}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
