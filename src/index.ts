// 对标 opencode 的 src/index.ts —— CLI 入口
import { Command } from "commander"
import path from "node:path"

const program = new Command()

program
  .name("cs")
  .description("A simple CLI agent powered by Midway + Ink")
  .version("0.1.0")
  .argument("[project]", "path to project directory", process.cwd())
  .option("-m, --model <model>", "model to use (e.g. gpt-4o)", "gpt-4o")
  .option("-s, --session <id>", "resume a session by id")
  .option("--port <port>", "server port (default: random)", "0")
  .action(async (project, options) => {
    const resolvedProject = path.resolve(project)   
    const { start } = await import("./cli/start.js")
    await start({
      project: resolvedProject,
      model: options.model,
      session: options.session,
      port: parseInt(options.port, 10),
    })
  })

program.parse()
