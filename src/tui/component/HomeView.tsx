import React, { useState, useEffect } from "react"
import { Box, Text, useInput } from "ink"
import { useSession } from "../context/session.js"
import { useProject } from "../context/project.js"
import { useRoute } from "../context/route.js"
import { useToast } from "../context/toast.js"
import { useEvent } from "../context/event.js"
import { useApi } from "../context/api.js"

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

  useInput((ch, key) => {
    if (ch === "n") {
      toast.show({
        title: "通知！",
        message: "CS CLI is ready!",
        variant: "info",
        duration: 3000,
      })
    }
  })

  const handleNewSession = async () => {
    try {
      const session = await createSession()
      navigate({ type: "session", sessionId: session.id })
    } catch (e) {
      toast.error(e)
    }
  }

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
      <Box marginTop={1}>
        <Text color="cyan">Press Enter to start a new session</Text>
      </Box>
      {greetings.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Greetings:</Text>
          {greetings.map((g, i) => (
            <Text key={i} color="yellow">  {g}</Text>
          ))}
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
