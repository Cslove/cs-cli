import React from "react"
import { Box, Text, useInput } from "ink"
import { useSession } from "../context/session.js"
import { useRoute } from "../context/route.js"
import { useToast } from "../context/toast.js"

export function HomeView() {
  const { state, createSession } = useSession()
  const { navigate } = useRoute()
  const toast = useToast()

  useInput((ch, key) => {
    if (ch === "n") {
      toast.show({
        title: "通知！",
        message: "Sirong CLI is ready!",
        variant: "info",
        duration: 3000,
      })
    }
  })

  const handleNewSession = async () => {
    const session = await createSession()
    navigate({ type: "session", sessionId: session.id })
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="magenta">
        Sirong CLI
      </Text>
      <Text dimColor>A simple CLI agent</Text>
      <Box marginTop={1}>
        <Text color="cyan">Press Enter to start a new session</Text>
      </Box>
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
