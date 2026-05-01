// 对标 opencode 的 server/routes/global.ts —— 全局事件与健康检查控制器
import { Controller, Get, Inject } from "@midwayjs/core"
import { Context } from "@midwayjs/koa"
import { EventService } from "../service/event.js"

const GREETINGS = [
  "Hello, World! 🌍",
  "你好呀 👋",
  "Keep coding! 💻",
  "Stay curious! 🔍",
  "Built different 🏗️",
  "Ship it! 🚀",
  "Debug like a detective 🕵️",
  "Git push --force? No! 🙅",
  "rm -rf / ...just kidding 😄",
  "Coffee first ☕",
  "It works on my machine 🤷",
  "404: Motivation not found 😴",
  "console.log debugger 🐛",
  "Tabs or spaces? Both 💥",
  "sudo fix everything 🔧",
]

@Controller("/global")
export class GlobalController {
  @Inject()
  eventService!: EventService

  @Get("/health")
  async health() {
    return { healthy: true, version: "0.1.0" }
  }

  /**
   * SSE 端点，对标 opencode 的 /global/event
   * 流式推送全局事件到 TUI 客户端
   * 1. 连接后先推送 server.connected 事件
   * 2. 每 10s 发送 heartbeat 防止连接被代理/负载均衡器断开
   * 3. 订阅 EventService 的所有事件并转发
   * 4. 客户端断开时自动清理
   */
  @Get("/event")
  async event(ctx: Context) {
    ctx.set("Content-Type", "text/event-stream")
    ctx.set("Cache-Control", "no-cache, no-transform")
    ctx.set("Connection", "keep-alive")
    ctx.set("X-Accel-Buffering", "no")
    ctx.set("X-Content-Type-Options", "nosniff")

    // Koa 底层 Node.js 响应对象
    const res = ctx.res
    // 禁用 Koa 的自动响应处理
    ctx.respond = false

    // flushHeaders() 确保 SSE 响应头立即发送，不等第一个 res.write()
    // 不调用的话 Node.js 可能等到缓冲区满才发送，导致客户端收不到数据
    res.flushHeaders()

    const writeSSE = (data: string) => {
      if (res.writableEnded) return
      res.write(`data: ${data}\n\n`)
    }

    // 1. 推送 server.connected
    writeSSE(JSON.stringify({
      payload: { type: "server.connected", properties: {} },
    }))

    // 2. heartbeat 每 10s
    const heartbeat = setInterval(() => {
      writeSSE(JSON.stringify({
        payload: { type: "server.heartbeat", properties: {} },
      }))
    }, 10_000)

    // 2.5 随机打招呼 每 3s
    const greeting = setInterval(() => {
      const msg = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
      writeSSE(JSON.stringify({
        directory: "global",
        payload: { type: "greeting", properties: { message: msg } },
      }))
    }, 3_000)

    // 3. 订阅 EventService 事件
    const handler = (data: unknown) => {
      writeSSE(JSON.stringify({
        directory: "global",
        payload: data,
      }))
    }
    this.eventService.on("event", handler)

    // 4. 清理函数
    const cleanup = () => {
      clearInterval(heartbeat)
      clearInterval(greeting)
      this.eventService.off("event", handler)
      if (!res.writableEnded) res.end()
    }

    // 客户端断开时清理
    res.on("close", cleanup)

    // 保持连接，等待客户端断开
    return new Promise<void>((resolve) => {
      res.on("close", () => {
        cleanup()
        resolve()
      })
    })
  }
}
