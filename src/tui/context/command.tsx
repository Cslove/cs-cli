// 对标 opencode 的 component/dialog-command.tsx —— 命令面板
// Ink 版本：简化了 opentui 的 fuzzy search 和复杂 UI，保留核心的命令注册 + 列表选择
import React, { createContext, useContext, useState, useCallback } from "react"
import { Box, Text, useInput } from "ink"
import { useDialog, DialogTitle, DialogItem, DialogFooter } from "./dialog.js"
import { useKeybind } from "./keybind.js"

// ---- Types ----

export interface CommandOption {
  /** 显示标题 */
  title: string
  /** 命令 ID */
  value: string
  /** 描述 */
  description?: string
  /** 绑定的快捷键 ID */
  keybind?: string
  /** 分类 */
  category?: string
  /** 是否建议命令 */
  suggested?: boolean
  /** 是否隐藏 */
  hidden?: boolean
  /** 是否启用 */
  enabled?: boolean
  /** 选中回调 */
  onSelect?: () => void
}

// ---- Context ----

interface CommandContextValue {
  /** 注册一组命令，返回取消注册函数 */
  register(commands: CommandOption[]): () => void
  /** 按 value 触发命令 */
  trigger(name: string): void
  /** 打开命令面板 */
  show(): void
  /** 挂起/恢复快捷键匹配 */
  keybinds(enabled: boolean): void
  /** 是否已挂起 */
  suspended: boolean
  /** 获取所有斜杠命令 */
  slashes(): Array<{ display: string; description: string; onSelect: () => void }>
}

const CommandCtx = createContext<CommandContextValue | null>(null)

// ---- Provider ----

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const dialog = useDialog()
  const keybind = useKeybind()
  const [registrations, setRegistrations] = useState<CommandOption[][]>([])
  const [suspendCount, setSuspendCount] = useState(0)

  const suspended = suspendCount > 0

  // 汇总所有注册的命令
  const allCommands = useCallback(() => {
    return registrations.flat()
  }, [registrations])

  const isVisible = (option: CommandOption) =>
    (option.enabled !== false) && !option.hidden

  const visibleCommands = useCallback(() => {
    return allCommands().filter(isVisible)
  }, [allCommands])

  const isEnabled = (option: CommandOption) => option.enabled !== false

  // 触发命令
  const trigger = useCallback((name: string) => {
    for (const option of allCommands()) {
      if (option.value === name) {
        if (!isEnabled(option)) return
        option.onSelect?.()
        return
      }
    }
  }, [allCommands])

  // 注册命令
  const register = useCallback((commands: CommandOption[]): (() => void) => {
    let removed = false
    setRegistrations((prev) => [...prev, commands])
    return () => {
      if (removed) return
      removed = true
      setRegistrations((prev) => prev.filter((r) => r !== commands))
    }
  }, [])

  // 斜杠命令
  const slashes = useCallback(() => {
    return visibleCommands().flatMap((option) => {
      if (!option.title) return []
      const name = option.title.toLowerCase().replace(/\s+/g, "-")
      return {
        display: `/${name}`,
        description: option.description ?? option.title,
        onSelect: () => trigger(option.value),
      }
    })
  }, [visibleCommands, trigger])

  // 挂起/恢复快捷键
  const keybindsToggle = useCallback((enabled: boolean) => {
    setSuspendCount((count) => count + (enabled ? -1 : 1))
  }, [])

  // 打开命令面板
  const show = useCallback(() => {
    const options = visibleCommands()
    dialog.replace(
      <CommandPanel options={options} onSelect={(option) => {
        dialog.close()
        option.onSelect?.()
      }} />,
    )
  }, [dialog, visibleCommands])

  // 全局键盘监听：快捷键直触命令
  useInput((ch, key) => {
    if (suspended) return
    if (!dialog.isEmpty) return
    for (const option of allCommands()) {
      if (!isEnabled(option)) continue
      if (option.keybind && keybind.match(option.keybind, key, ch)) {
        option.onSelect?.()
        return
      }
    }
  })

  // command_list 快捷键打开面板
  useInput((ch, key) => {
    if (suspended) return
    if (!dialog.isEmpty) return
    if (keybind.match("command_list", key, ch)) {
      show()
    }
  })

  const value: CommandContextValue = {
    register,
    trigger,
    show,
    keybinds: keybindsToggle,
    suspended,
    slashes,
  }

  return <CommandCtx.Provider value={value}>{children}</CommandCtx.Provider>
}

export function useCommandDialog() {
  const ctx = useContext(CommandCtx)
  if (!ctx) throw new Error("useCommandDialog must be used within CommandProvider")
  return ctx
}

// ---- Command Panel Component ----

function CommandPanel({
  options,
  onSelect,
}: {
  options: CommandOption[]
  onSelect: (option: CommandOption) => void
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filter, setFilter] = useState("")
  const keybind = useKeybind()

  // 过滤
  const filtered = options.filter((o) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return o.title.toLowerCase().includes(q) || (o.description ?? "").toLowerCase().includes(q)
  })

  // 分类
  const categories = new Map<string, CommandOption[]>()
  for (const option of filtered) {
    const cat = option.category ?? "General"
    if (!categories.has(cat)) categories.set(cat, [])
    categories.get(cat)!.push(option)
  }

  // 计算扁平索引映射
  const flatItems: CommandOption[] = []
  for (const [, items] of categories) {
    flatItems.push(...items)
  }

  const current = flatItems[selectedIndex]

  useInput((ch, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : flatItems.length - 1))
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0))
    } else if (key.return && current) {
      onSelect(current)
    } else if (key.backspace || key.delete) {
      setFilter((prev) => prev.slice(0, -1))
      setSelectedIndex(0)
    } else if (ch && !key.return && !key.escape && !key.ctrl && !key.meta) {
      setFilter((prev) => prev + ch)
      setSelectedIndex(0)
    }
  })

  return (
    <Box flexDirection="column">
      <DialogTitle>Commands</DialogTitle>
      {filter && (
        <Box marginBottom={1}>
          <Text dimColor>Filter: </Text>
          <Text color="cyan">{filter}</Text>
        </Box>
      )}
      {Array.from(categories.entries()).map(([category, items]) => (
        <Box key={category} flexDirection="column" marginBottom={1}>
          <Text bold color="gray">{category}</Text>
          {items.map((option) => {
            const globalIdx = flatItems.indexOf(option)
            return (
              <DialogItem
                key={option.value}
                label={option.title}
                description={option.description}
                selected={globalIdx === selectedIndex}
                keybind={option.keybind ? keybind.print(option.keybind) : undefined}
              />
            )
          })}
        </Box>
      ))}
      {flatItems.length === 0 && (
        <Text dimColor>No matching commands</Text>
      )}
      <DialogFooter>
        <Text dimColor color="gray"> | ↑↓ Navigate | Enter: Select | Type to filter</Text>
      </DialogFooter>
    </Box>
  )
}
