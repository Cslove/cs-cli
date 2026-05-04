// 对标 opencode 的 component/prompt/autocomplete.tsx 渲染部分 —— 自动补全弹出层
// Ink 7 版本：position="absolute" + bottom="100"(百分比) 浮层，不改变输入框布局流
// Yoga 引擎：bottom="100" = 弹窗底边对齐父容器顶边，向上延伸
import React from "react"
import { Box, Text } from "ink"
import type { BoxStyle } from "cli-boxes"
import type { AutocompleteOption, AutocompleteVisible } from "../hook/useAutocomplete.js"

// ---- 对标 opencode SplitBorder：只显示左右竖线 ┃ ----

const SPLIT_BORDER: BoxStyle = {
  topLeft: "",
  top: " ",
  topRight: "",
  right: "┃",
  bottomRight: "",
  bottom: " ",
  bottomLeft: "",
  left: "┃",
}

// ---- Props ----

interface AutocompletePopupProps {
  visible: AutocompleteVisible
  options: AutocompleteOption[]
  selectedIndex: number
  /** 可用宽度（对标 opencode anchor().width） */
  width: number
}

// ---- Constants ----

const MAX_VISIBLE = 8

// ---- Helpers ----

function truncateMiddle(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text
  const half = Math.floor((maxWidth - 3) / 2)
  return text.slice(0, half) + "..." + text.slice(-half)
}

// ---- Component ----

export function AutocompletePopup(props: AutocompletePopupProps) {
  if (!props.visible) return null
  if (props.options.length === 0) {
    return (
      <Box
        position="absolute"
        bottom="100"
        borderStyle={SPLIT_BORDER}
        borderColor="gray"
        paddingLeft={1}
        paddingRight={1}
        width={props.width}
      >
        <Text dimColor>No matching items</Text>
      </Box>
    )
  }

  const displayCount = Math.min(MAX_VISIBLE, props.options.length)

  // Scroll viewport: keep selectedIndex visible
  let scrollOffset = 0
  if (props.selectedIndex >= MAX_VISIBLE) {
    scrollOffset = props.selectedIndex - MAX_VISIBLE + 1
  }
  const maxOffset = Math.max(0, props.options.length - displayCount)
  scrollOffset = Math.min(scrollOffset, maxOffset)

  const visibleOptions = props.options.slice(scrollOffset, scrollOffset + displayCount)

  return (
    <Box
      position="absolute"
      bottom="100"
      width={props.width}
      flexDirection="column"
    >
      {/* 对标 opencode：SplitBorder + backgroundMenu(gray) + borderColor */}
      <Box
        flexDirection="column"
        borderStyle={SPLIT_BORDER}
        borderColor="gray"
        backgroundColor="gray"
      >
        {visibleOptions.map((option, i) => {
          const globalIndex = scrollOffset + i
          const isSelected = globalIndex === props.selectedIndex
          const isDir = option.display.endsWith("/")

          // 对标 opencode：选中项 backgroundColor=primary(cyan)，文字白色
          // 非选中项：目录名 cyan，其他默认色
          return (
            <Box
              key={globalIndex}
              flexDirection="row"
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={isSelected ? "cyan" : undefined}
            >
              <Text
                color={isSelected ? "white" : isDir ? "cyan" : undefined}
                bold={isSelected}
              >
                {truncateMiddle(option.display, props.width - 4)}
              </Text>
              {/* 对标 opencode：description 列，选中时白色，未选中时 dimColor */}
              {option.description && (
                <Text
                  color={isSelected ? "white" : "gray"}
                  dimColor={!isSelected}
                >
                  {" "}
                  {truncateMiddle(option.description, props.width - option.display.length - 6)}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
