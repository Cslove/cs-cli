// 对标 opencode 的 cli/cmd/tui/worker.ts —— 子进程入口
import { initializeGlobalApplicationContext } from "@midwayjs/core"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const container = await initializeGlobalApplicationContext({
    baseDir: __dirname,
  })

  // 从 Midway 容器获取 Koa Application，再取实际监听端口
  let port = 0
  try {
    const koaApp = (container as any).getServer?.("koaServer")
    const httpServer = koaApp?.getServer?.() ?? koaApp?.server
    const addr = httpServer?.address?.()
    if (typeof addr === "object" && addr) {
      port = addr.port
    }
  } catch {
    // fallback: 尝试从环境变量读取
    port = parseInt(process.env.SIRONG_PORT ?? "0", 10)
  }

  // 通知主进程 Server 已就绪
  if (process.send) {
    process.send({
      type: "server:ready",
      url: `http://127.0.0.1:${port}`,
    })
  }

  // 监听主进程的 shutdown 信号
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
