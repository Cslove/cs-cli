export default {
  keys: "sirong-session-keys",
  koa: {
    port: parseInt(process.env.SIRONG_PORT ?? "0", 10),
    hostname: "127.0.0.1",
  },
}
