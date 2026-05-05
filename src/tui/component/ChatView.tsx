import React from "react"
import { Box, Text } from "ink"
import { useSession } from "../context/session.js"
import { useRoute } from "../context/route.js"
import { MessageList } from "./MessageList.js"
import { PromptInput } from "./PromptInput.js"
import { StatusBar } from "./StatusBar.js"

export function ChatView({ model }: { model?: string }) {
  const { state } = useSession()
  const { route } = useRoute()
  const sessionId = route.type === "session" ? route.sessionId : undefined

  return (
    <Box flexDirection="column" height="100%">
      <MessageList messages={state.messages} streamingText={state.streamingText} />
      <StatusBar model={model} loading={state.loading} />
      <PromptInput sessionID={sessionId} />
    </Box>
  )
}
