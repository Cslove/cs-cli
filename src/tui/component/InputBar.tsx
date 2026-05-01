import React from "react"
import { Box, Text } from "ink"

interface InputBarProps {
  value: string
}

export function InputBar({ value }: InputBarProps) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="yellow">&gt; </Text>
      <Text>{value}</Text>
      <Text color="gray">▎</Text>
    </Box>
  )
}
