// 对标 opencode 的 context/route.tsx —— 路由 Context
import React, { createContext, useContext, useState, useCallback, useMemo } from "react"

export type Route = { type: "home" } | { type: "session"; sessionId: string }

interface RouteContextValue {
  route: Route
  navigate: (route: Route) => void
}

const RouteCtx = createContext<RouteContextValue | null>(null)

export function RouteProvider({
  initialSessionId,
  children,
}: {
  initialSessionId?: string
  children: React.ReactNode
}) {
  const [route, setRoute] = useState<Route>(
    initialSessionId ? { type: "session", sessionId: initialSessionId } : { type: "home" },
  )

  const navigate = useCallback((r: Route) => setRoute(r), [])

  const value = useMemo(() => ({ route, navigate }), [route, navigate])

  return <RouteCtx.Provider value={value}>{children}</RouteCtx.Provider>
}

export function useRoute() {
  const ctx = useContext(RouteCtx)
  if (!ctx) throw new Error("useRoute must be used within RouteProvider")
  return ctx
}
