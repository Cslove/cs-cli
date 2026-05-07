// 对标 opencode 的 cli/cmd/tui/worker.ts —— 子进程入口
import { initializeGlobalApplicationContext, MidwayApplicationManager } from "@midwayjs/core"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { readdir, stat } from "node:fs/promises"
import { createConnection } from "node:net"
import { ContainerConfiguration } from "./configuration.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port })
    socket.on("connect", () => {
      socket.destroy()
      resolve(false)
    })
    socket.on("error", () => resolve(true))
  })
}

async function loadModules() {
  const ext = import.meta.url.endsWith(".ts") ? ".ts" : ".js"
  const modules: any[] = []

  async function scanDir(absDir: string) {
    let entries: string[]
    try { entries = await readdir(absDir) } catch { return }
    for (const entry of entries) {
      const full = join(absDir, entry)
      const s = await stat(full)
      if (s.isDirectory()) {
        await scanDir(full)
      } else if (entry.endsWith(ext)) {
        modules.push(await import(full))
      }
    }
  }

  for (const dir of ["controller", "service", "entity"]) {
    await scanDir(join(__dirname, dir))
  }
  return modules
}

async function main() {
  const requestedPort = parseInt(process.env.CS_PORT ?? "0", 10)
  if (requestedPort > 0 && !(await isPortAvailable(requestedPort))) {
    console.warn(`Port ${requestedPort} is in use, falling back to random port`)
    process.env.CS_PORT = "0"
  }
  const modules = await loadModules()
  const container = await initializeGlobalApplicationContext({
    imports: [ContainerConfiguration],
    preloadModules: modules,
  })

  let port = 0
  try {
    const appManager = await container.getAsync(MidwayApplicationManager)
    const framework = appManager.getFramework("koa") as any
    for (let i = 0; i < 50; i++) {
      const addr = framework?.getServer?.()?.address?.()
      if (typeof addr === "object" && addr?.port) {
        port = addr.port
        break
      }
      await new Promise(r => setTimeout(r, 100))
    }
  } catch {
    port = parseInt(process.env.CS_PORT ?? "0", 10)
  }

  if (process.send) {
    process.send({
      type: "server:ready",
      url: `http://127.0.0.1:${port}`,
    })
  }

  process.on("message", (msg: any) => {
    if (msg.type === "shutdown") {
      process.exit(0)
    }
  })
}

main().catch((e) => {
  console.error("Server bootstrap failed:", e)
  process.exit(1)
})
