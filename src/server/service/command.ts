// 对标 opencode 的 command 相关服务 —— 可用命令
import { Provide, Scope, ScopeEnum } from "@midwayjs/core"
import type { Command } from "../../shared/types.js"

@Provide()
@Scope(ScopeEnum.Singleton)
export class CommandService {
  private readonly commands: Command[] = [
    { id: "session.new", name: "New Session", description: "Start a new chat session", keybind: "n" },
    { id: "session.list", name: "Session List", description: "View all sessions" },
    { id: "exit", name: "Exit", description: "Quit the application", keybind: "ctrl+c" },
  ]

  list(): Command[] {
    return this.commands
  }
}
