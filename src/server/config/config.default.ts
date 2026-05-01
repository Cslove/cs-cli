// Midway 通过 require() 加载 ESM 配置文件时会注入 __esModule，
// 导致 Object.keys(exports) 包含 ["__esModule", "default"]，
// 触发 MidwayConfigService 的 "should not have both" 校验。
// 用 named export 避免 default + __esModule 冲突
export const keys = "cs-session-keys"
export const koa = {
  port: parseInt(process.env.CS_PORT ?? "0", 10),
  hostname: "127.0.0.1",
}
