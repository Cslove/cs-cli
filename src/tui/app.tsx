// 对标 opencode 的 cli/cmd/tui/app.tsx —— TUI 根组件
import React from "react"
import { Box, Text, useInput, useApp, useStdout } from "ink"
import { ApiProvider } from "./context/api.js"
import { EventProvider } from "./context/event.js"
import { SessionProvider } from "./context/session.js"
import { RouteProvider, useRoute } from "./context/route.js"
import { KVProvider } from "./context/kv.js"
import { ToastProvider, Toast } from "./context/toast.js"
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
  // 对标 opencode 的 Provider 嵌套顺序：KVProvider → ToastProvider → ...
  return (
    <ApiProvider serverUrl={props.serverUrl}>
      <EventProvider ipcBridge={props.ipcBridge}>
        <KVProvider>
          <ToastProvider>
            <SessionProvider>
              <RouteProvider initialSessionId={props.sessionId}>
                <RawModeGuard />
                <AppContent model={props.model} />
              </RouteProvider>
            </SessionProvider>
          </ToastProvider>
        </KVProvider>
      </EventProvider>
    </ApiProvider>
  )
}

/**
 * 在根组件注册 useInput，确保 raw mode 全程开启。
 * Ink 的 useInput 是按组件启用/关闭的，
 * 如果只有 ChatView 注册了 useInput，在 HomeView 时 raw mode 就关了，
 * 按键会被直接回显为乱码。
 */
function RawModeGuard() {
  const { exit } = useApp()
  useInput((ch, key) => {
    if (key.ctrl && ch === "c") {
      exit()
    }
  })
  return null
}

function AppContent({ model }: { model?: string }) {
  const { route } = useRoute()
  const { stdout } = useStdout()

  return (
    // 对标 opencode 的根 <box>：撑满终端 + 背景色填充
    // 不这样做的话，内容只占自身高度，终端剩余空间会露出底层 shell 内容
    <Box
      flexDirection="column"
      width={stdout.columns}
      height={stdout.rows}
    >
      {/* Toast 在顶部右侧，对标 opencode 的 position=absolute top=2 right=2 */}
      <Toast />
      <Box flexDirection="column" flexGrow={1} padding={1}>
        {route.type === "home" ? (
          <HomeView />
        ) : route.type === "session" ? (
          <ChatView model={model} />
        ) : (
          <Box>
            <Text color="red">Unknown route</Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}
