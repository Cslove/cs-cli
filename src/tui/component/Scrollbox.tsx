// Ink 版 Scrollbox —— 对标 opencode 的 @opentui/core scrollbox
// 支持：视口裁剪、底部粘滞、滚动条、键盘导航、命令式 ref API
import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react"
import { Box, Text, useInput, measureElement } from "ink"
import { theme } from "../context/theme.js"

export interface ScrollboxHandle {
  /** 滚动到指定行号（0-based，从内容顶部算起） */
  scrollTo(line: number): void
  /** 滚动到底部并恢复粘滞 */
  scrollToBottom(): void
  /** 相对滚动 delta 行 */
  scrollBy(delta: number): void
}

export interface ScrollboxProps {
  /** 视口固定高度（行数），与 flexGrow 二选一 */
  height?: number
  /** 弹性伸缩权重，与 height 二选一 */
  flexGrow?: number
  /** 是否启用粘滞模式 */
  sticky?: boolean
  /** 粘滞方向 */
  stickyStart?: "top" | "bottom"
  /** 是否显示滚动条 */
  scrollbar?: boolean
  /** 是否启用键盘滚动 */
  keyboard?: boolean
  children: React.ReactNode
}

export const Scrollbox = forwardRef<ScrollboxHandle, ScrollboxProps>(
  function Scrollbox(
    {
      height,
      flexGrow = 0,
      sticky = true,
      stickyStart = "bottom",
      scrollbar = false,
      keyboard = true,
      children,
    },
    ref,
  ) {
    const [scrollTop, setScrollTop] = useState(0)
    const [contentHeight, setContentHeight] = useState(0)
    const [viewportHeight, setViewportHeight] = useState(height ?? 0)
    const isSticky = useRef(sticky && stickyStart === "bottom")
    const contentRef = useRef<any>(null)
    const viewportRef = useRef<any>(null)

    // ---- 测量内容高度 + 自动粘滞滚动 ----
    useEffect(() => {
      const ct = contentRef.current
      if (!ct) return
      const ctDims = measureElement(ct)
      if (ctDims.height === 0) return

      setContentHeight(ctDims.height)

      // 同步测量视口高度（flexGrow 模式下可能变化）
      const vp = viewportRef.current
      if (vp && !height) {
        const vpDims = measureElement(vp)
        if (vpDims.height > 0) setViewportHeight(vpDims.height)
      }

      // 粘滞底部：自动跟随新内容
      if (isSticky.current && stickyStart === "bottom") {
        const maxScroll = Math.max(0, ctDims.height - (height ?? viewportHeight))
        setScrollTop(maxScroll)
      }
    })

    // ---- 检测是否在底部（决定粘滞状态） ----
    const vh = height ?? viewportHeight
    const maxScroll = Math.max(0, contentHeight - vh)

    // 用 ref 保持最新值，避免 useInput 闭包捕获过期值
    const maxScrollRef = useRef(maxScroll)
    maxScrollRef.current = maxScroll
    const vhRef = useRef(vh)
    vhRef.current = vh

    useEffect(() => {
      if (scrollTop >= maxScroll - 1) {
        isSticky.current = sticky && stickyStart === "bottom"
      } else {
        isSticky.current = false
      }
    }, [scrollTop, maxScroll, sticky, stickyStart])

    // ---- 键盘导航 ----
    useInput(
      (_input, key) => {
        if (key.upArrow) {
          isSticky.current = false
          setScrollTop((prev) => Math.max(0, prev - 1))
        } else if (key.downArrow) {
          isSticky.current = false
          setScrollTop((prev) => Math.min(maxScrollRef.current, prev + 1))
        } else if (key.pageUp) {
          isSticky.current = false
          setScrollTop((prev) => Math.max(0, prev - Math.max(1, vhRef.current - 2)))
        } else if (key.pageDown) {
          isSticky.current = false
          setScrollTop((prev) => Math.min(maxScrollRef.current, prev + Math.max(1, vhRef.current - 2)))
        } else if (key.home) {
          isSticky.current = false
          setScrollTop(0)
        } else if (key.end) {
          isSticky.current = true
          setScrollTop(maxScrollRef.current)
        }
      },
      { isActive: keyboard },
    )

    // ---- 命令式 API ----
    useImperativeHandle(
      ref,
      () => ({
        scrollTo(line: number) {
          isSticky.current = false
          setScrollTop(Math.max(0, Math.min(line, maxScroll)))
        },
        scrollToBottom() {
          isSticky.current = true
          setScrollTop(maxScroll)
        },
        scrollBy(delta: number) {
          isSticky.current = false
          setScrollTop((prev) => Math.max(0, Math.min(prev + delta, maxScroll)))
        },
      }),
      [maxScroll],
    )

    // ---- 滚动条几何 ----
    const showScrollbar = scrollbar && contentHeight > vh
    const thumbSize = showScrollbar
      ? Math.max(1, Math.floor((vh / contentHeight) * vh))
      : 0
    const thumbTop = showScrollbar
      ? Math.floor((scrollTop / maxScroll) * (vh - thumbSize))
      : 0

    return (
      <Box
        ref={viewportRef}
        height={height}
        flexGrow={height ? 0 : flexGrow}
        overflow="hidden"
        position="relative"
      >
        {/* 内容区：绝对定位 + top 偏移实现滚动 */}
        <Box
          ref={contentRef}
          position="absolute"
          top={-scrollTop}
          left={0}
          flexDirection="column"
          paddingRight={showScrollbar ? 1 : 0}
        >
          {children}
        </Box>

        {/* 滚动条 */}
        {showScrollbar && (
          <Box position="absolute" right={0} top={0} width={1} height={vh} flexDirection="column">
            <Box height={thumbTop} flexShrink={0} />
            <Box height={thumbSize} backgroundColor={theme.backgroundElement} flexShrink={0}>
              <Text> </Text>
            </Box>
          </Box>
        )}
      </Box>
    )
  },
)
