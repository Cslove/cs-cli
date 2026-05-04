// 对标 opencode 的 component/prompt/autocomplete.tsx —— 自动补全逻辑
// 触发条件：@ → agents + files，/ → commands
// 使用 React hook 封装，与 PromptInput 的 useRef+useInput 模式协作
//
// 设计要点：
// 1. useRef 存储可变状态（input、cursor、triggerIndex），避免 useCallback 闭包过期
// 2. useState 仅用于触发重渲染的状态（visible、options、selectedIndex、searchQuery）
// 3. 所有 context 值通过 ref 转发，保证内部函数始终读到最新值
// 4. base options 缓存在 ref 中，searchQuery 变化时仅做 filter，不全量重建
// 5. useEffect 不依赖 sync.data，避免 SSE 更新触发高频重算
import { useState, useRef, useCallback, useEffect } from "react"
import fs from "node:fs"
import path from "node:path"
import { useSync } from "../context/sync.js"
import { useLocal } from "../context/local.js"
import { useCommand } from "../context/command.js"
import { useFrecency } from "../context/frecency.js"
import type { Key } from "ink"

// ---- Types ----

export interface AutocompleteOption {
  display: string
  value?: string
  description?: string
  onSelect: () => AutocompleteInsert | void
}

export interface AutocompleteInsert {
  input: string
  cursor: number
}

// ---- Mention Span（对标 opencode extmark + prompt.parts） ----
// 记录输入字符串中 @agent / @file 的位置和类型，用于：
// 1. 渲染时着色区分（agent=cyan, file=blue）
// 2. backspace 时整块删除而非逐字符删除

export interface MentionSpan {
  /** mention 在 input 中的起始位置（含 '@'） */
  start: number
  /** mention 在 input 中的结束位置（不含尾部空格，exclusive） */
  end: number
  /** agent 或 file */
  type: "agent" | "file"
  /** 完整文本，如 "@Code" 或 "@src/index.ts" */
  text: string
}

export type AutocompleteVisible = false | "@" | "/"

export interface UseAutocompleteOptions {
  /** 选中后回调，由 PromptInput 执行 inputRef/cursorRef 更新 */
  onInsert: (result: AutocompleteInsert) => void
}

export interface UseAutocompleteReturn {
  visible: AutocompleteVisible
  options: AutocompleteOption[]
  selectedIndex: number
  /** 当前所有 mention span，用于渲染着色和整块删除 */
  mentions: MentionSpan[]
  /** 输入变化时调用，检测触发/隐藏条件 */
  onInput(value: string, cursor: number): void
  /** 键盘事件处理，返回 true 表示已消费（PromptInput 不再处理） */
  handleKey(ch: string, key: Key): boolean
  /** 强制隐藏 */
  hide(): void
  /** 查找 cursor 之前紧邻的 mention span（用于 backspace 整块删除） */
  getMentionBefore(cursor: number): MentionSpan | undefined
  /** 删除指定 mention span 并返回新的 input/cursor */
  deleteMention(span: MentionSpan): AutocompleteInsert
}

// ---- Simple Fuzzy Match (对标 opencode fuzzysort) ----

function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  const idx = t.indexOf(q)
  if (idx !== -1) return 100 - idx

  let qi = 0
  let score = 0
  let lastMatchIdx = -2

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10
      if (lastMatchIdx === ti - 1) score += 5
      if (ti === 0 || /[\s\-_.\/]/.test(t[ti - 1])) score += 3
      lastMatchIdx = ti
      qi++
    }
  }

  return qi === q.length ? score : 0
}

// ---- File Search (异步 + 缓存) ----

const MAX_FILES = 500
const IGNORED_DIRS = new Set([".git", "node_modules", ".next", ".turbo", "dist", "build", ".cache", "__pycache__"])

function scanFilesSync(dir: string, maxDepth = 6): string[] {
  const results: string[] = []

  function walk(currentDir: string, depth: number) {
    if (depth > maxDepth) return
    if (results.length >= MAX_FILES) return

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= MAX_FILES) break
      if (entry.name.startsWith(".") && entry.name !== ".github") continue
      if (IGNORED_DIRS.has(entry.name)) continue

      const fullPath = path.join(currentDir, entry.name)
      const relativePath = path.relative(dir, fullPath).split(path.sep).join("/")

      if (entry.isDirectory()) {
        results.push(relativePath + "/")
        walk(fullPath, depth + 1)
      } else {
        results.push(relativePath)
      }
    }
  }

  walk(dir, 0)
  return results
}

// ---- Filter options by query (对标 opencode fuzzysort.go) ----

function filterOptions(allOptions: AutocompleteOption[], query: string): AutocompleteOption[] {
  if (!query) return allOptions

  return allOptions
    .map((opt) => {
      const target = (opt.value ?? opt.display).trimEnd()
      let score = fuzzyMatch(query, target)
      if (opt.description) {
        const descScore = fuzzyMatch(query, opt.description)
        if (descScore > score) score = descScore
      }
      return { opt, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.opt)
}

// ---- Hook ----

export function useAutocomplete(opts: UseAutocompleteOptions): UseAutocompleteReturn {
  const sync = useSync()
  const local = useLocal()
  const command = useCommand()
  const frecency = useFrecency()

  // ---- 渲染触发状态 ----
  const [visible, setVisible] = useState<AutocompleteVisible>(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [options, setOptions] = useState<AutocompleteOption[]>([])

  // ---- 可变状态（ref，不触发渲染，避免闭包过期） ----
  const triggerIndexRef = useRef(0)
  const fileCache = useRef<string[] | null>(null)
  const inputRef = useRef("")
  const cursorRef = useRef(0)
  const visibleRef = useRef<AutocompleteVisible>(false)
  const selectedIndexRef = useRef(0)
  // base options 缓存：show() 时计算，searchQuery 变化时仅做 filter
  const baseOptionsRef = useRef<AutocompleteOption[]>([])
  const searchQueryRef = useRef("")

  // ---- Mention spans（对标 opencode prompt.parts + extmarks） ----
  const [mentions, setMentions] = useState<MentionSpan[]>([])
  const mentionsRef = useRef<MentionSpan[]>([])
  mentionsRef.current = mentions

  // 稳定引用：将 context 值存入 ref，避免 onInput/handleKey 闭包过期
  const syncRef = useRef(sync)
  const localRef = useRef(local)
  const commandRef = useRef(command)
  const frecencyRef = useRef(frecency)
  const onInsertRef = useRef(opts.onInsert)

  // 同步 ref → 保证函数内部始终读到最新值
  visibleRef.current = visible
  selectedIndexRef.current = selectedIndex
  syncRef.current = sync
  localRef.current = local
  commandRef.current = command
  frecencyRef.current = frecency
  onInsertRef.current = opts.onInsert

  // ---- Lazy File Cache ----

  const getFileList = useCallback((): string[] => {
    if (fileCache.current) return fileCache.current
    try {
      fileCache.current = scanFilesSync(process.cwd())
    } catch {
      fileCache.current = []
    }
    return fileCache.current ?? []
  }, [])

  // ---- Insert Logic ----

  // 校验并修复 mention spans：编辑后文本可能已移动，重新定位或删除失效的 span
  function validateMentions(input: string, cursor: number) {
    const valid = mentionsRef.current.filter((span) => {
      const actual = input.slice(span.start, span.end)
      return actual === span.text
    })
    if (valid.length !== mentionsRef.current.length) {
      mentionsRef.current = valid
      setMentions(valid)
    }
  }

  function insertMention(name: string, type: "agent" | "file") {
    const input = inputRef.current
    const cursor = cursorRef.current
    const triggerIdx = triggerIndexRef.current
    const before = input.slice(0, triggerIdx)
    const mentionText = "@" + name
    const insertText = mentionText + " "
    const newInput = before + insertText + input.slice(cursor)
    const newCursor = before.length + insertText.length

    // 记录 mention span（对标 opencode insertPart + extmark）
    const span: MentionSpan = {
      start: triggerIdx,
      end: triggerIdx + mentionText.length,
      type,
      text: mentionText,
    }
    // 更新后续 span 的位置（插入点之后的 span 需要偏移）
    const shift = insertText.length - (cursor - triggerIdx)
    const updatedMentions = mentionsRef.current
      .map((s) => s.start >= cursor ? { ...s, start: s.start + shift, end: s.end + shift } : s)
      .concat(span)
      .sort((a, b) => a.start - b.start)
    mentionsRef.current = updatedMentions
    setMentions(updatedMentions)

    if (type === "file") frecencyRef.current.updateFrecency(name)

    hide()
    onInsertRef.current({ input: newInput, cursor: newCursor })
  }

  // ---- Build Options ----

  function buildAgentOptions(): AutocompleteOption[] {
    return syncRef.current.data.agent
      .filter((agent) => agent.name !== localRef.current.agent.current()?.name)
      .map((agent) => ({
        display: "@" + agent.name,
        description: agent.description,
        value: agent.name,
        onSelect: () => insertMention(agent.name, "agent"),
      }))
  }

  function buildFileOptions(query: string): AutocompleteOption[] {
    const files = getFileList()
    const f = frecencyRef.current

    return files
      .map((filePath) => {
        const score = query ? fuzzyMatch(query, filePath) : f.getFrecency(filePath) + 1
        return { filePath, score }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        const aFrecency = f.getFrecency(a.filePath)
        const bFrecency = f.getFrecency(b.filePath)
        if (aFrecency !== bFrecency) return bFrecency - aFrecency
        const aDepth = a.filePath.split("/").length
        const bDepth = b.filePath.split("/").length
        if (aDepth !== bDepth) return aDepth - bDepth
        return a.filePath.localeCompare(b.filePath)
      })
      .slice(0, 10)
      .map((item) => ({
        display: item.filePath,
        value: item.filePath,
        onSelect: () => insertMention(item.filePath, "file"),
      }))
  }

  function buildCommandOptions(): AutocompleteOption[] {
    const results: AutocompleteOption[] = []
    const seen = new Set<string>()

    for (const slash of commandRef.current.slashes()) {
      seen.add(slash.display)
      results.push({
        display: slash.display,
        description: slash.description,
        value: slash.display,
        onSelect: () => {
          slash.onSelect()
          onInsertRef.current({ input: "", cursor: 0 })
        },
      })
    }

    for (const cmd of syncRef.current.data.command) {
      const display = "/" + cmd.name
      if (seen.has(display)) continue
      seen.add(display)
      results.push({
        display,
        description: cmd.description,
        value: cmd.id,
        onSelect: () => {
          commandRef.current.trigger(cmd.id)
          onInsertRef.current({ input: "", cursor: 0 })
        },
      })
    }

    results.sort((a, b) => a.display.localeCompare(b.display))
    return results
  }

  // ---- Show/Hide ----

  function show(mode: "@" | "/", idx: number) {
    commandRef.current.keybinds(false)
    triggerIndexRef.current = idx
    searchQueryRef.current = ""

    // 构建 base options 并缓存到 ref（避免 useEffect 重复重建）
    const base = mode === "@"
      ? [...buildAgentOptions(), ...buildFileOptions("")]
      : buildCommandOptions()

    baseOptionsRef.current = base
    setVisible(mode)
    setOptions(base)
    setSelectedIndex(0)
  }

  function hide() {
    if (visibleRef.current) {
      commandRef.current.keybinds(true)
    }
    setVisible(false)
    searchQueryRef.current = ""
    baseOptionsRef.current = []
    setOptions([])
    setSelectedIndex(0)
  }

  // ---- Navigation ----

  function move(direction: -1 | 1) {
    const len = baseOptionsRef.current.length
    if (len === 0) return
    let next = selectedIndexRef.current + direction
    if (next < 0) next = len - 1
    if (next >= len) next = 0
    setSelectedIndex(next)
  }

  function select() {
    const selected = baseOptionsRef.current[selectedIndexRef.current]
      ?? options[selectedIndexRef.current]
    if (!selected) return
    hide()
    selected.onSelect()
  }

  // ---- Filter on searchQuery change ----
  // 仅依赖 searchQueryRef，不依赖 sync.data —— 避免 SSE 更新触发高频重算

  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function applyFilter() {
    const query = searchQueryRef.current
    const base = baseOptionsRef.current
    if (!query || base.length === 0) {
      setOptions(base)
      return
    }
    const filtered = filterOptions(base, query)
    setOptions(filtered.length > 0 ? filtered : base)
    setSelectedIndex(0)
  }

  // 防抖过滤：快速连续输入时合并为一次 filter（32ms 合并窗口）
  function scheduleFilter() {
    if (filterTimerRef.current !== null) clearTimeout(filterTimerRef.current)
    filterTimerRef.current = setTimeout(() => {
      filterTimerRef.current = null
      applyFilter()
    }, 32)
  }

  // 清理 filter timer
  useEffect(() => {
    return () => {
      if (filterTimerRef.current !== null) clearTimeout(filterTimerRef.current)
    }
  }, [])

  // ---- Mention helpers ----

  // 查找 cursor 紧邻前面的 mention span（cursor 恰好在 span.end 位置，含尾部空格情况）
  function getMentionBefore(cursor: number): MentionSpan | undefined {
    return mentionsRef.current.find((span) => cursor === span.end || cursor === span.end + 1)
  }

  // 删除指定 mention span，返回新的 input/cursor
  function deleteMention(span: MentionSpan): AutocompleteInsert {
    const input = inputRef.current
    // 删除 mention 文本 + 尾部空格（如果有）
    const afterMention = input.slice(span.end)
    const hasTrailingSpace = afterMention[0] === " "
    const deleteEnd = hasTrailingSpace ? span.end + 1 : span.end
    const newInput = input.slice(0, span.start) + input.slice(deleteEnd)
    const newCursor = span.start

    // 更新后续 span 位置
    const deletedLen = deleteEnd - span.start
    const updatedMentions = mentionsRef.current
      .filter((s) => s !== span)
      .map((s) => s.start >= deleteEnd ? { ...s, start: s.start - deletedLen, end: s.end - deletedLen } : s)
    mentionsRef.current = updatedMentions
    setMentions(updatedMentions)

    return { input: newInput, cursor: newCursor }
  }

  // ---- Public API ----

  const onInput = useCallback((value: string, cursor: number) => {
    inputRef.current = value
    cursorRef.current = cursor

    if (visibleRef.current) {
      const query = value.slice(triggerIndexRef.current + 1, cursor)
      searchQueryRef.current = query

      // Auto-hide: cursor moved before trigger
      if (cursor <= triggerIndexRef.current) { hide(); return }
      // Auto-hide: space after trigger+text (对标 opencode onInput)
      const between = value.slice(triggerIndexRef.current, cursor)
      if (between.match(/\s/) && cursor > triggerIndexRef.current + 1) { hide(); return }
      // "/" mode: hide if multi-word content typed
      if (visibleRef.current === "/" && value.match(/^\S+\s+\S+\s*$/)) { hide(); return }

      // 防抖过滤，避免每次按键都重算
      scheduleFilter()
      return
    }

    // 编辑后校验 mention spans
    validateMentions(value, cursor)

    // Check if autocomplete should open
    if (cursor === 0) return

    // "/" at position 0
    if (value.startsWith("/") && !value.slice(0, cursor).match(/\s/)) {
      show("/", 0)
      return
    }

    // "@" trigger: find nearest "@" before cursor with no whitespace between
    const text = value.slice(0, cursor)
    const atIdx = text.lastIndexOf("@")
    if (atIdx === -1) return

    const between = text.slice(atIdx)
    const before = atIdx === 0 ? undefined : value[atIdx - 1]
    if ((before === undefined || /\s/.test(before)) && !between.match(/\s/)) {
      show("@", atIdx)
    }
  }, [])

  const handleKey = useCallback((ch: string, key: Key): boolean => {
    if (visibleRef.current) {
      if (key.upArrow || (key.ctrl && ch === "p")) {
        move(-1)
        return true
      }
      if (key.downArrow || (key.ctrl && ch === "n")) {
        move(1)
        return true
      }
      if (key.escape) {
        hide()
        return true
      }
      if (key.return) {
        select()
        return true
      }
      if (key.tab) {
        select()
        return true
      }
    }

    if (!visibleRef.current) {
      // "@" trigger (对标 opencode onKeyDown → show("@"))
      if (ch === "@") {
        const cursor = cursorRef.current
        const charBefore = cursor === 0 ? undefined : inputRef.current[cursor - 1]
        const canTrigger = charBefore === undefined || charBefore === "" || /\s/.test(charBefore)
        if (canTrigger) {
          // Defer show until after the "@" character is inserted into inputRef
          setTimeout(() => show("@", cursor), 0)
        }
      }

      // "/" trigger at position 0 (对标 opencode onKeyDown → show("/"))
      if (ch === "/" && cursorRef.current === 0) {
        setTimeout(() => show("/", 0), 0)
      }
    }

    return false
  }, [])

  // Cleanup: restore keybinds on unmount
  useEffect(() => {
    return () => {
      if (visibleRef.current) {
        commandRef.current.keybinds(true)
      }
    }
  }, [])

  return {
    visible,
    options,
    selectedIndex,
    mentions,
    onInput,
    handleKey,
    hide,
    getMentionBefore,
    deleteMention,
  }
}
