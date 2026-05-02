// 对标 opencode 的 context/keybind.tsx —— 快捷键配置与匹配
// Ink 的 useInput 提供 (ch, key) 对象，这里提供 keybind 注册与匹配机制
import React, { createContext, useContext, useCallback, useRef } from "react"
import { useInput, Key } from "ink"
import { useKV } from "./kv.js"

// ---- Types ----

export interface KeybindInfo {
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  name: string
}

export interface KeybindDef {
  /** 快捷键 ID，如 "app_exit", "command_list" */
  id: string
  /** 默认按键描述，如 "ctrl+c", "escape" */
  default: string
  /** 描述文本 */
  description: string
  /** 分类 */
  category?: string
}

// ---- Keybind Parsing ----

/** 将字符串 "ctrl+c" 解析为 KeybindInfo */
export function parseKeybind(str: string): KeybindInfo[] {
  const parts = str.split("+").map((p) => p.trim().toLowerCase())
  const result: KeybindInfo = { name: "" }

  for (const part of parts) {
    if (part === "ctrl") result.ctrl = true
    else if (part === "meta" || part === "alt" || part === "option") result.meta = true
    else if (part === "shift") result.shift = true
    else if (part === "leader") result.name = "leader"
    else result.name = normalizeKeyName(part)
  }

  return [result]
}

/** 将 Ink Key 对象转为标准化的 key name */
function normalizeKeyName(name: string): string {
  const map: Record<string, string> = {
    "return": "enter",
    "backspace": "backspace",
    "delete": "delete",
    "escape": "escape",
    "tab": "tab",
    "space": "space",
    "up": "up",
    "down": "down",
    "left": "left",
    "right": "right",
    "pageup": "pageup",
    "pagedown": "pagedown",
    "home": "home",
    "end": "end",
  }
  return map[name.toLowerCase()] ?? name.toLowerCase()
}

/** 将 KeybindInfo 转为人类可读字符串 */
export function printKeybind(info: KeybindInfo): string {
  const parts: string[] = []
  if (info.ctrl) parts.push("Ctrl")
  if (info.meta) parts.push("Alt")
  if (info.shift) parts.push("Shift")
  parts.push(info.name)
  return parts.join("+")
}

/** 判断 Ink Key 是否匹配 KeybindInfo */
function matchKey(key: Key, ch: string, info: KeybindInfo): boolean {
  // Ink Key 没有统一的 .name 属性，需要从特殊按键字段推断
  const keyName = inkKeyName(key, ch)
  if (normalizeKeyName(keyName) !== info.name) return false

  // 修饰键匹配
  if (info.ctrl && !key.ctrl) return false
  if (info.meta && !key.meta) return false
  if (info.shift && !key.shift) return false

  // 如果 info 不需要修饰键，确保 key 也没按
  if (!info.ctrl && key.ctrl) return false
  if (!info.meta && key.meta) return false

  return true
}

/** 从 Ink Key 对象提取标准化键名 */
function inkKeyName(key: Key, ch: string): string {
  // Ink 对特殊按键设置了独立的 boolean 字段
  if (key.escape) return "escape"
  if (key.return) return "return"
  if (key.backspace) return "backspace"
  if (key.delete) return "delete"
  if (key.tab) return "tab"
  if (key.upArrow) return "up"
  if (key.downArrow) return "down"
  if (key.leftArrow) return "left"
  if (key.rightArrow) return "right"
  if (key.pageUp) return "pageup"
  if (key.pageDown) return "pagedown"
  if (key.home) return "home"
  if (key.end) return "end"
  // 普通字符键
  if (ch.length === 1) return ch.toLowerCase()
  // 兜底：尝试读取 .name（某些 Ink 版本可能支持）
  return ((key as Record<string, unknown>).name as string | undefined) ?? ""
}

// ---- Default Keybinds ----

const DEFAULT_KEYBINDS: KeybindDef[] = [
  { id: "app_exit", default: "ctrl+c", description: "Quit the application", category: "System" },
  { id: "command_list", default: "escape", description: "Open command palette", category: "System" },
  { id: "session_new", default: "ctrl+n", description: "New session", category: "Session" },
  { id: "session_list", default: "ctrl+l", description: "Session list", category: "Session" },
  { id: "model_cycle", default: "ctrl+m", description: "Cycle model", category: "Model" },
  { id: "model_favorite", default: "ctrl+shift+m", description: "Cycle favorite model", category: "Model" },
  { id: "agent_next", default: "ctrl+tab", description: "Next agent", category: "Agent" },
  { id: "input_submit", default: "return", description: "Submit input", category: "Input" },
  { id: "input_newline", default: "shift+return", description: "New line", category: "Input" },
]

// ---- Context ----

interface KeybindContextValue {
  /** 所有快捷键定义 */
  definitions: KeybindDef[]
  /** 匹配 Ink key 事件是否对应指定快捷键 */
  match(keybindId: string, key: Key, ch: string): boolean
  /** 获取快捷键的可读文本 */
  print(keybindId: string): string
  /** 注册自定义 keybind handler（返回取消函数） */
  register(keybindId: string, handler: () => void): () => void
}

const KeybindCtx = createContext<KeybindContextValue | null>(null)

// ---- Provider ----

export function KeybindProvider({ children }: { children: React.ReactNode }) {
  const kv = useKV()
  const handlers = useRef<Map<string, Set<() => void>>>(new Map())

  // 加载用户自定义 keybind 映射
  const customKeybinds = kv.ready ? kv.get<Record<string, string>>("keybinds", {}) : {}

  const definitions = DEFAULT_KEYBINDS.map((def) => ({
    ...def,
    default: customKeybinds[def.id] ?? def.default,
  }))

  const getKeybindInfos = useCallback((keybindId: string): KeybindInfo[] => {
    const def = definitions.find((d) => d.id === keybindId)
    if (!def) return []
    return parseKeybind(def.default)
  }, [definitions])

  const match = useCallback((keybindId: string, key: Key, ch: string): boolean => {
    const infos = getKeybindInfos(keybindId)
    for (const info of infos) {
      if (matchKey(key, ch, info)) return true
    }
    return false
  }, [getKeybindInfos])

  const print = useCallback((keybindId: string): string => {
    const infos = getKeybindInfos(keybindId)
    if (infos.length === 0) return keybindId
    return printKeybind(infos[0])
  }, [getKeybindInfos])

  const register = useCallback((keybindId: string, handler: () => void): (() => void) => {
    if (!handlers.current.has(keybindId)) {
      handlers.current.set(keybindId, new Set())
    }
    handlers.current.get(keybindId)!.add(handler)
    return () => {
      handlers.current.get(keybindId)?.delete(handler)
    }
  }, [])

  // 全局按键监听：匹配快捷键并调用注册的 handler
  useInput((ch, key) => {
    for (const def of definitions) {
      if (match(def.id, key, ch)) {
        const handlerSet = handlers.current.get(def.id)
        if (handlerSet) {
          for (const handler of handlerSet) handler()
        }
      }
    }
  })

  const value: KeybindContextValue = {
    definitions,
    match,
    print,
    register,
  }

  return <KeybindCtx.Provider value={value}>{children}</KeybindCtx.Provider>
}

export function useKeybind() {
  const ctx = useContext(KeybindCtx)
  if (!ctx) throw new Error("useKeybind must be used within KeybindProvider")
  return ctx
}
