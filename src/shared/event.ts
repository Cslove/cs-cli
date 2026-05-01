import type { Message, Session } from "./types.js"

// 对标 opencode 的 bus/global.ts 事件定义
export type AppEvent =
  | { type: "message.created"; data: Message }
  | { type: "message.token"; data: { sessionId: string; token: string } }
  | { type: "session.created"; data: Session }
  | { type: "session.updated"; data: Session }
  | { type: "session.deleted"; data: { sessionId: string } }

export type AppEventType = AppEvent["type"]
