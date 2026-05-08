import { useState, useEffect } from "react"
import { useStdout } from "ink"

/** 响应式终端尺寸：监听 resize 事件，带 50ms 防抖避免 IME 候选框等引起的布局抖动 */
export function useTerminalSize() {
  const { stdout } = useStdout()
  const [size, setSize] = useState({ columns: stdout.columns, rows: stdout.rows })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        setSize({ columns: stdout.columns, rows: stdout.rows })
      }, 50)
    }
    stdout.on("resize", onResize)
    return () => {
      stdout.off("resize", onResize)
      if (timer) clearTimeout(timer)
    }
  }, [stdout])

  return size
}
