export interface PartEntity {
  id: string
  message_id: string
  type: "text" | "tool_call" | "tool_result"
  text: string
  tool_name: string
  tool_input: string
  tool_output: string
  created_at: number
}
