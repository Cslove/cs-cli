// 对标 opencode 的 cli/cmd/tui/app.tsx —— TUI 根组件
import React from "react"
import { Box, Text } from "ink"
import { ApiProvider } from "./context/api.js"
import { EventProvider } from "./context/event.js"
import { SessionProvider } from "./context/session.js"
import { RouteProvider, useRoute } from "./context/route.js"
import { ChatView } from "./component/ChatView.js"
import { HomeView } from "./component/HomeView.js"
import type { IpcBridge } from "../shared/ipc.js"

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

function AppContent({ model }: { model?: string }) {
  const { route } = useRoute()

  switch (route.type) {
    case "home":
      return <HomeView />
    case "session":
      return <ChatView model={model} />
    default:
      return (
        <Box>
          <Text color="red">Unknown route</Text>
        </Box>
      )
  }
}
