import type { MessageEntity } from "../entity/message.js"
import type { SessionEntity } from "../entity/session.js"
import type { Message, Session } from "../../shared/types.js"

export function toMessage(entity: MessageEntity): Message {
  const tokens = entity.tokens ? JSON.parse(entity.tokens) : undefined
  const error = entity.error ? JSON.parse(entity.error) : undefined
  return {
    id: entity.id,
    session_id: entity.session_id,
    role: entity.role,
    content: entity.content,
    model: entity.model,
    created_at: entity.created_at,
    time: { created: entity.created_at, completed: entity.time_completed || undefined },
    agent: entity.agent || undefined,
    mode: entity.mode || undefined,
    tokens,
    cost: entity.cost || undefined,
    error,
    finish: entity.finish || undefined,
    providerID: entity.provider_id || undefined,
    modelID: entity.model_id || undefined,
    parentID: entity.parent_id || undefined,
  }
}

export function toSession(entity: SessionEntity): Session {
  return {
    ...entity,
    time: { created: entity.created_at, updated: entity.updated_at },
  }
}
