// 对标 opencode 的 cli/cmd/tui/app.tsx —— TUI 根组件
import React from "react"
import { Box, Text, useInput, useApp } from "ink"
import { useTerminalSize } from "./hook/useTerminalSize.js"
import { ApiProvider } from "./context/api.js"
import { EventProvider } from "./context/event.js"
import { SessionProvider } from "./context/session.js"
import { ProjectProvider } from "./context/project.js"
import { SyncProvider } from "./context/sync.js"
import { LocalProvider } from "./context/local.js"
import { KeybindProvider } from "./context/keybind.js"
import { DialogProvider } from "./context/dialog.js"
import { CommandProvider } from "./context/command.js"
import { FrecencyProvider } from "./context/frecency.js"
import { PromptHistoryProvider } from "./context/prompt-history.js"
import { PromptRefProvider } from "./context/prompt-ref.js"
import { RouteProvider, useRoute } from "./context/route.js"
import { KVProvider } from "./context/kv.js"
import { ToastProvider, Toast } from "./context/toast.js"
import { ChatView } from "./component/ChatView.js"
import { HomeView } from "./component/HomeView.js"

interface AppProps {
  serverUrl: string
  project: string
  model?: string
  sessionId?: string
}

export function App(props: AppProps) {
  // 对标 opencode 的 Provider 嵌套顺序：SDKProvider → KVProvider → ToastProvider → ...
  return (
    <KVProvider>
      <ToastProvider>
        <ApiProvider serverUrl={props.serverUrl}>
          <EventProvider>
            <ProjectProvider>
              <SyncProvider>
                <LocalProvider>
                  <KeybindProvider>
                    <DialogProvider>
                      <CommandProvider>
                        <FrecencyProvider>
                          <PromptHistoryProvider>
                            <PromptRefProvider>
                              <SessionProvider>
                                <RouteProvider initialSessionId={props.sessionId}>
                                  <RawModeGuard />
                                  <AppContent model={props.model} />
                                </RouteProvider>
                              </SessionProvider>
                            </PromptRefProvider>
                          </PromptHistoryProvider>
                        </FrecencyProvider>
                      </CommandProvider>
                    </DialogProvider>
                  </KeybindProvider>
                </LocalProvider>
              </SyncProvider>
            </ProjectProvider>
          </EventProvider>
        </ApiProvider>
      </ToastProvider>
    </KVProvider>
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
  const { columns, rows } = useTerminalSize()

  return (
    <Box
      flexDirection="column"
      width={columns}
      height={rows}
    >
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
