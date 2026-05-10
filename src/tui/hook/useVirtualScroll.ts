import { useMemo } from "react"

/**
 * 终端 UI 虚拟滚动计算 hook
 *
 * 根据可用高度和选中索引，计算应渲染的可视条目窗口。
 * selectIndex 始终保持在可视区中间位置。
 *
 * @param maxHeight  弹窗最大可用行数
 * @param selectedIndex  当前选中项的扁平索引
 * @param overhead  标题/filter/footer/分类头等固定占用行数
 * @returns scrollOffset — 可视窗口起始索引，visibleEnd — 可视窗口结束索引（不含）
 */
export function useVirtualScroll(maxHeight: number, selectedIndex: number, overhead: number) {
  return useMemo(() => {
    const visibleSlots = Math.max(5, maxHeight - overhead)
    const scrollOffset = Math.max(0, selectedIndex - Math.floor(visibleSlots / 2))
    const visibleEnd = scrollOffset + visibleSlots
    return { scrollOffset, visibleEnd }
  }, [maxHeight, selectedIndex, overhead])
}
