// 对标 opencode 的 cli/cmd/tui/worker.ts —— 子进程入口
import { initializeGlobalApplicationContext, MidwayApplicationManager } from "@midwayjs/core"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
// 显式导入 Configuration 模块，确保 tsx 环境下装饰器元数据被正确解析
import "./configuration.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const container = await initializeGlobalApplicationContext({
    baseDir: __dirname,
  })

  // 通过 MidwayApplicationManager 获取 Koa Framework，再取实际监听端口
  let port = 0
  try {
    const appManager = await container.getAsync(MidwayApplicationManager)
    const framework = appManager.getFramework("koa") as any
    // framework 已注册但 Server 可能还没开始监听
    // 用轮询等待端口绑定完成（Midway 的 koa.listen 是异步的）
    for (let i = 0; i < 50; i++) {
      const addr = framework?.getServer?.()?.address?.()
      if (typeof addr === "object" && addr?.port) {
        port = addr.port
        break
      }
      await new Promise(r => setTimeout(r, 100))
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
