import React, { useState, useEffect } from "react"
import { Box, Text } from "ink"
import { useSession } from "../context/session.js"
import { useProject } from "../context/project.js"
import { useRoute } from "../context/route.js"
import { useToast } from "../context/toast.js"
import { useEvent } from "../context/event.js"
import { useApi } from "../context/api.js"
import { useCommand } from "../context/command.js"
import { useDialog, DialogTitle, DialogFooter } from "../context/dialog.js"

export function HomeView() {
  const { state, createSession } = useSession()
  const { state: projectState } = useProject()
  const { navigate } = useRoute()
  const toast = useToast()
  const { connected, on } = useEvent()
  const api = useApi()
  const [greetings, setGreetings] = useState<string[]>([])

  useEffect(() => on("greeting", (data) => {
    const msg = (data as { message: string }).message
    setGreetings((prev) => [...prev.slice(-9), msg])
  }), [on])

  const command = useCommand()
  const dialog = useDialog()

  const handleNewSession = async () => {
    try {
      const session = await createSession()
      navigate({ type: "session", sessionId: session.id })
    } catch (e) {
      toast.error(e)
    }
  }

  // 注册测试命令
  useEffect(() => {
    const unregister = command.register([
      {
        title: "Show Greeting",
        value: "test_greeting",
        description: "Show a greeting dialog",
        category: "Test",
        keybind: "session_new",
        onSelect: () => {
          dialog.replace(
            <Box flexDirection="column">
              <DialogTitle>Hello from CommandProvider!</DialogTitle>
              <Text>This is a test dialog opened via command panel.</Text>
              <Text dimColor>You pressed a command that triggered this popup.</Text>
              <DialogFooter />
            </Box>,
          )
        },
      },
      {
        title: "New Session",
        value: "new_session",
        description: "Create a new chat session",
        category: "Session",
        suggested: true,
        onSelect: handleNewSession,
      },
      {
        title: "Show Toast",
        value: "test_toast",
        description: "Show a test toast notification",
        category: "Test",
        onSelect: () => {
          toast.show({
            title: "Toast Test",
            message: "This is a test notification from CommandProvider!",
            variant: "info",
            duration: 3000,
          })
        },
      },
    ])
    return unregister
  }, [])

  return (
    <Box flexDirection="column" padding={1}>
      {/* 服务器连接状态指示器 */}
      <Box flexDirection="row" gap={1}>
        <Text color={connected ? "green" : "red"}>{connected ? "●" : "●"}</Text>
        <Text dimColor>{connected ? "Connected" : "Lost server connection"}</Text>
        <Text dimColor>|</Text>
        <Text dimColor>{api.serverUrl}</Text>
      </Box>
      <Box marginTop={1}>
        <Text bold color="magenta">
          CS CLI
        </Text>
      </Box>
      {projectState.current
        ? <Text dimColor>Project: {projectState.current.name} ({projectState.current.id.slice(0, 8)})</Text>
        : <Text dimColor>No active project</Text>
      }
      {projectState.list.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Projects:</Text>
          {projectState.list.map((p) => (
            <Box key={p.id} flexDirection="row" gap={1}>
              <Text color={projectState.current?.id === p.id ? "cyan" : "gray"}>
                {projectState.current?.id === p.id ? "▸" : " "} {p.name}
              </Text>
              <Text dimColor>{p.id.slice(0, 8)}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text color="cyan">Press Enter to start a new session</Text>
        <Text dimColor>Press Escape to open command panel</Text>
      </Box>
      {greetings.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>{greetings[greetings.length - 1]}</Text>
        </Box>
      )}
      {state.list.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Recent Sessions:</Text>
          {state.list.slice(0, 5).map((s) => (
            <Box key={s.id}>
              <Text color="gray">
                {s.id.slice(0, 8)} - {s.title || "Untitled"}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
