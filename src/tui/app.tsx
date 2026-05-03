// 对标 opencode 的 cli/cmd/tui/app.tsx —— TUI 根组件
import React, { useEffect } from "react"
import { Box, Text, useInput, useApp } from "ink"
import { useTerminalSize } from "./hook/useTerminalSize.js"
import { ApiProvider } from "./context/api.js"
import { EventProvider, useEvent } from "./context/event.js"
import { SessionProvider } from "./context/session.js"
import { ProjectProvider } from "./context/project.js"
import { SyncProvider, useSync } from "./context/sync.js"
import { LocalProvider, useLocal } from "./context/local.js"
import { KeybindProvider } from "./context/keybind.js"
import { DialogProvider, useDialog } from "./context/dialog.js"
import { CommandProvider, useCommand } from "./context/command.js"
import { FrecencyProvider } from "./context/frecency.js"
import { PromptHistoryProvider } from "./context/prompt-history.js"
import { PromptRefProvider } from "./context/prompt-ref.js"
import { RouteProvider, useRoute } from "./context/route.js"
import { KVProvider, useKV } from "./context/kv.js"
import { ToastProvider, useToast, Toast } from "./context/toast.js"
import { ChatView } from "./component/ChatView.js"
import { HomeView } from "./component/HomeView.js"

interface AppProps {
  serverUrl: string
  project: string
  model?: string
  sessionId?: string
}

export function App(props: AppProps) {
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

function RawModeGuard() {
  const { exit } = useApp()
  useInput((ch, key) => {
    if (key.ctrl && ch === "c") {
      exit()
    }
  })
  return null
}

function setTerminalTitle(title: string) {
  process.stdout.write(`\x1b]0;${title}\x07`)
}

function AppContent({ model }: { model?: string }) {
  const { route, navigate } = useRoute()
  const { columns, rows } = useTerminalSize()
  const command = useCommand()
  const dialog = useDialog()
  const local = useLocal()
  const sync = useSync()
  const kv = useKV()
  const toast = useToast()
  const event = useEvent()
  const { exit } = useApp()

  const sessionId = route.type === "session" ? route.sessionId : undefined

  useEffect(() => {
    const unregister = command.register([
      {
        title: "New session",
        value: "session.new",
        keybind: "session_new",
        category: "Session",
        onSelect: () => {
          navigate({ type: "home" })
          dialog.clear()
        },
      },
      {
        title: "Switch model",
        value: "model.cycle_recent",
        keybind: "model_cycle",
        category: "Model",
        onSelect: () => {
          local.model.cycle(1)
        },
      },
      {
        title: "Switch agent",
        value: "agent.cycle",
        keybind: "agent_next",
        category: "Agent",
        onSelect: () => {
          local.agent.move(1)
        },
      },
      {
        title: "Suspend terminal",
        value: "terminal.suspend",
        keybind: "session_list",
        category: "System",
        onSelect: () => {
          process.once("SIGCONT", () => {
            setTerminalTitle("CS CLI")
          })
          process.kill(0, "SIGTSTP")
        },
      },
      {
        title: "Exit",
        value: "app.exit",
        keybind: "app_exit",
        category: "System",
        onSelect: () => exit(),
      },
    ])
    return unregister
  }, [])

  useEffect(() => {
    const titleEnabled = kv.get("terminal_title_enabled", true)
    if (!titleEnabled) return

    if (route.type === "home") {
      setTerminalTitle("CS CLI")
    } else if (route.type === "session") {
      const session = sync.data.session.find((s: { id: string }) => s.id === sessionId)
      const title = session?.title && session.title !== "New Session"
        ? `CS | ${session.title.length > 40 ? session.title.slice(0, 37) + "..." : session.title}`
        : "CS CLI"
      setTerminalTitle(title)
    }
  }, [route.type, sessionId, sync.data.session])

  useEffect(() => {
    const unsubs: Array<() => void> = []

    // session.deleted：如果当前会话被删除，导航回首页
    unsubs.push(event.on("session.deleted", (data: unknown) => {
      const info = (data as { info?: { id: string } } | undefined)?.info
      if (route.type === "session" && info?.id === sessionId) {
        navigate({ type: "home" })
        toast.show({ variant: "info", message: "The current session was deleted" })
      }
    }))

    // session.error：显示错误提示
    unsubs.push(event.on("session.error", (data: unknown) => {
      const error = (data as { error?: unknown } | undefined)?.error
      const message = error instanceof Error ? error.message : String(error ?? "Unknown error")
      toast.show({ variant: "error", message, duration: 5000 })
    }))

    // server.instance.disposed：服务器关闭时提示
    unsubs.push(event.on("server.instance.disposed", () => {
      toast.show({ variant: "warning", message: "Server connection lost", duration: 10000 })
    }))

    return () => {
      for (const unsub of unsubs) unsub()
    }
  }, [route.type, sessionId])

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
