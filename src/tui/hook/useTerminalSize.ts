import { useState, useEffect } from "react"
import { useStdout } from "ink"

/** 响应式终端尺寸：监听 resize 事件，终端大小变化时触发重渲染 */
export function useTerminalSize() {
  const { stdout } = useStdout()
  const [size, setSize] = useState({ columns: stdout.columns, rows: stdout.rows })

  useEffect(() => {
    const onResize = () => {
      setSize({ columns: stdout.columns, rows: stdout.rows })
    }
    stdout.on("resize", onResize)
    return () => {
      stdout.off("resize", onResize)
    }
  }, [stdout])

  return size
}
