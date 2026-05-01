// 对标 opencode 的 cli/cmd/tui/thread.ts —— 启动编排
import { fork, type ChildProcess } from "node:child_process"
import { render } from "ink"
import React from "react"
import { App } from "../tui/app.js"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import fs from "node:fs"

const __dirname = dirname(fileURLToPath(import.meta.url))

interface StartOptions {
  project: string
  model?: string
  session?: string
  port?: number
}

export async function start(options: StartOptions) {
  // 0. 进入 Alternate Screen Buffer + 清空 scrollback
  //    必须在 render() 之前执行，确保 Ink 所有输出都进入备用屏幕
  //    \x1b[?1049h = 切换到备用屏幕缓冲区
  //    \x1b[2J   = 清除可见屏幕
  //    \x1b[3J   = 清除回滚缓冲区（scrollback），防止上滑看到旧内容
  //    \x1b[H    = 光标归位
  process.stdout.write("\x1b[?1049h\x1b[2J\x1b[3J\x1b[H")

  // 兜底：process.exit() 会跳过 finally 块，但 process.on("exit") 回调仍会执行
  // 用 fs.writeSync 保证同步写入，确保终端恢复
  let restored = false
  const restoreTerminal = () => {
    if (restored) return
    restored = true
    fs.writeSync(1, "\x1b[?1049l")
  }
  process.on("exit", restoreTerminal)

  try {
    // 1. 拉起 Midway Server 子进程
    const serverProcess = fork(join(__dirname, "..", "server", "bootstrap.ts"), [], {
      env: {
        ...process.env,
        CS_PROJECT: options.project,
        CS_MODEL: options.model ?? "gpt-4o",
        CS_PORT: String(options.port ?? 0),
      },
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    })

    // 缓冲子进程日志（不直接转发，避免冲掉 Ink TUI 渲染）
    // 仅在子进程异常退出时输出缓冲内容用于调试
    let logBuf = ""
    serverProcess.stdout?.on("data", (data: Buffer) => { logBuf += data.toString() })
    serverProcess.stderr?.on("data", (data: Buffer) => { logBuf += data.toString() })

    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null && logBuf) {
        process.stderr.write(`\n[server] exited with code ${code}:\n${logBuf}\n`)
      }
    })

    // 2. 等待 Server 就绪
    const serverUrl = await waitForServerReady(serverProcess)

    // 服务器启动后，子进程退出不再影响 TUI
    // SSE 断连会通过 EventProvider 的 connected 状态反映到 HomeView
    serverProcess.removeAllListeners("exit")
    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null && logBuf) {
        process.stderr.write(`\n[server] exited with code ${code}:\n${logBuf}\n`)
      }
    })

    // 3. 渲染 Ink TUI（事件通过 SSE /global/event 订阅，不再需要 IPC）
    //    exitOnCtrlC: false — 禁止 Ink 直接 process.exit()，确保 finally 块执行
    const instance = render(
      <App
        serverUrl={serverUrl}
        project={options.project}
        model={options.model}
        sessionId={options.session}
      />,
      { exitOnCtrlC: false },
    )

    // 4. Ctrl+C 手动退出：先 unmount Ink，再走正常退出流程
    const onSigInt = () => {
      process.off("SIGINT", onSigInt)
      instance.unmount()
    }
    process.on("SIGINT", onSigInt)

    // 5. 等待 TUI 退出（用户主动退出，而非服务器断连）
    await instance.waitUntilExit()

    // 6. 关闭 Server 子进程
    if (serverProcess.connected) {
      serverProcess.send({ type: "shutdown" })
    }
    await gracefulExit(serverProcess)
  } finally {
    // 7. 切回主屏幕缓冲区（原始终端内容自动恢复）
    restoreTerminal()
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
