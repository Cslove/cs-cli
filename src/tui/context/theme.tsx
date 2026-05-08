// 对标 opencode 的 one-dark 主题色 —— 仅取 dark 模式色值
// 源文件: packages/opencode/src/cli/cmd/tui/context/theme/one-dark.json

export const theme = {
  // ---- 主色 ----
  primary: "#61afef",         // darkBlue — 主操作色
  secondary: "#c678dd",      // darkPurple — 次要强调
  accent: "#56b6c2",         // darkCyan — 点缀色

  // ---- 语义色 ----
  error: "#e06c75",          // darkRed
  warning: "#e5c07b",        // darkYellow
  success: "#98c379",        // darkGreen
  info: "#d19a66",           // darkOrange

  // ---- 文字 ----
  text: "#abb2bf",           // darkFg — 正文
  textMuted: "#5c6370",      // darkFgMuted — 弱化/注释

  // ---- 背景 ----
  background: "#282c34",     // darkBg — 全局背景
  backgroundPanel: "#21252b", // darkBgAlt — 面板/次级背景
  backgroundElement: "#353b45", // darkBgPanel — 元素/选中项背景

  // ---- 边框 ----
  border: "#393f4a",
  borderActive: "#61afef",   // = primary
  borderSubtle: "#2c313a",

  // ---- Markdown ----
  markdownHeading: "#c678dd", // = secondary
  markdownLink: "#61afef",    // = primary
  markdownLinkText: "#56b6c2", // = accent
  markdownCode: "#98c379",    // = success
  markdownBlockQuote: "#5c6370", // = textMuted
  markdownEmph: "#e5c07b",    // = warning
  markdownStrong: "#d19a66",  // = info

  // ---- 语法高亮 ----
  syntaxComment: "#5c6370",   // = textMuted
  syntaxKeyword: "#c678dd",   // = secondary
  syntaxFunction: "#61afef",  // = primary
  syntaxVariable: "#e06c75",  // = error
  syntaxString: "#98c379",    // = success
  syntaxNumber: "#d19a66",    // = info
  syntaxType: "#e5c07b",      // = warning
  syntaxOperator: "#56b6c2",  // = accent
  syntaxPunctuation: "#abb2bf", // = text

  // ---- Diff ----
  diffAdded: "#98c379",
  diffRemoved: "#e06c75",
  diffAddedBg: "#2c382b",
  diffRemovedBg: "#3a2d2f",
} as const

export type ThemeColor = keyof typeof theme
