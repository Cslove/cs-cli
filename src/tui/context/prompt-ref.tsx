// 对标 opencode 的 context/prompt.tsx —— Prompt 组件引用持有者
// 允许外部代码（如路由、命令面板）操作当前 Prompt 组件
// 纯内存状态，无需持久化
import React, { createContext, useContext, useState, useCallback } from "react"

// ---- Types ----

export interface PromptRef {
  /** 当前是否聚焦 */
  focused: boolean
  /** 当前输入内容 */
  current: string
  /** 设置输入内容 */
  set(input: string): void
  /** 重置输入 */
  reset(): void
  /** 提交当前输入 */
  submit(): void
}

// ---- Context ----

interface PromptRefContextValue {
  /** 获取当前 Prompt 引用 */
  current: PromptRef | undefined
  /** 设置 Prompt 引用（由 Prompt 组件挂载时调用） */
  set(ref: PromptRef | undefined): void
}

const PromptRefCtx = createContext<PromptRefContextValue | null>(null)

// ---- Provider ----

export function PromptRefProvider({ children }: { children: React.ReactNode }) {
  const [ref, setRef] = useState<PromptRef | undefined>(undefined)

  const value: PromptRefContextValue = {
    current: ref,
    set: setRef,
  }

  return (
    <PromptRefCtx.Provider value={value}>
      {children}
    </PromptRefCtx.Provider>
  )
}

export function usePromptRef() {
  const ctx = useContext(PromptRefCtx)
  if (!ctx) throw new Error("usePromptRef must be used within PromptRefProvider")
  return ctx
}
