// 对标 opencode 的 server/server.ts 中的 Midway 配置
import { Configuration } from "@midwayjs/core"
import * as koa from "@midwayjs/koa"
import * as validate from "@midwayjs/validate"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

@Configuration({
  imports: [koa, validate],
  importConfigs: [join(__dirname, "config")],
})
export class ContainerConfiguration {
  async onReady() {
    const { initDatabase } = await import("../storage/database.js")
    await initDatabase()
  }
}
