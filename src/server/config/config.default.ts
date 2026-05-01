export default {
  keys: "cs-session-keys",
  koa: {
    port: parseInt(process.env.CS_PORT ?? "0", 10),
    hostname: "127.0.0.1",
  },
}
