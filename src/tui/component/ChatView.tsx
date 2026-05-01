import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import { useSession } from "../context/session.js"
import { useRoute } from "../context/route.js"
import { MessageList } from "./MessageList.js"
import { InputBar } from "./InputBar.js"
import { StatusBar } from "./StatusBar.js"

export function ChatView({ model }: { model?: string }) {
  const { state, sendMessage, createSession } = useSession()
  const { navigate } = useRoute()
  const [input, setInput] = useState("")

  useInput((ch, key) => {
    if (key.ctrl && ch === "c") {
      // Ctrl+C 退出
      return
    }
    if (key.ctrl && ch === "n") {
      // Ctrl+N 新建会话
      navigate({ type: "home" })
      return
    }
    if (key.return && input.trim()) {
      const content = input.trim()
      setInput("")
      if (!state.current) {
        createSession().then((s) => {
          sendMessage(content)
        })
      } else {
        sendMessage(content)
      }
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1))
    } else if (ch && !key.return && !key.escape) {
      setInput((prev) => prev + ch)
    }
  })

  return (
    <Box flexDirection="column" height="100%">
      <MessageList messages={state.messages} streamingText={state.streamingText} />
      <StatusBar model={model} loading={state.loading} />
      <InputBar value={input} />
    </Box>
  )
}
