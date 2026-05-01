// 对标 opencode 的 cli/cmd/tui/thread.ts —— 启动编排
import { fork, type ChildProcess } from "node:child_process"
import { render } from "ink"
import React from "react"
import { App } from "../tui/app.js"
import { createIpcBridge } from "../shared/ipc.js"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

interface StartOptions {
  project: string
  model?: string
  session?: string
  port?: number
}

export async function start(options: StartOptions) {
  // 0. 切换到终端 Alternate Screen Buffer，进入后原始终端内容被隐藏
  //    退出时恢复原始终端内容（与 vim/less/opencode 行为一致）
  process.stdout.write("\x1b[?1049h")
  // 清除备用屏幕可能残留的内容
  process.stdout.write("\x1b[2J\x1b[H")

  try {
    // 1. 拉起 Midway Server 子进程
    const serverProcess = fork(join(__dirname, "..", "server", "bootstrap.ts"), [], {
      env: {
        ...process.env,
        SIRONG_PROJECT: options.project,
        SIRONG_MODEL: options.model ?? "gpt-4o",
        SIRONG_PORT: String(options.port ?? 0),
      },
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    })

    // 转发子进程 stderr 到主进程（用于调试）
    serverProcess.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(data)
    })

    // 2. 等待 Server 就绪
    const serverUrl = await waitForServerReady(serverProcess)

    // 3. 创建 IPC 通信桥接
    const ipcBridge = createIpcBridge(serverProcess)

    // 4. 渲染 Ink TUI
    const { waitUntilExit } = render(
      <App
        serverUrl={serverUrl}
        ipcBridge={ipcBridge}
        project={options.project}
        model={options.model}
        sessionId={options.session}
      />,
    )

    // 5. 等待 TUI 退出
    await waitUntilExit()

    // 6. 关闭 Server 子进程
    if (serverProcess.connected) {
      serverProcess.send({ type: "shutdown" })
    }
    await gracefulExit(serverProcess)
  } finally {
    // 7. 恢复原始终端缓冲区
    process.stdout.write("\x1b[?1049l")
  }
}

function waitForServerReady(proc: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server startup timeout (10s)")), 10_000)

    proc.on("message", (msg: any) => {
      if (msg.type === "server:ready") {
        clearTimeout(timeout)
        resolve(msg.url)
      }
    })

    proc.on("error", (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    proc.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout)
        reject(new Error(`Server process exited with code ${code}`))
      }
    })
  })
}

function gracefulExit(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL")
      resolve()
    }, 5000)

    proc.on("exit", () => {
      clearTimeout(timeout)
      resolve()
    })

    // 先尝试优雅退出
    if (proc.connected) {
      proc.send({ type: "shutdown" })
    } else {
      proc.kill("SIGTERM")
    }
  })
}
