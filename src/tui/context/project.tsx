// 对标 opencode 的 context/project.tsx —— Project 状态 Context
// 简化版：不需要 instance 和 workspace，只保留 project 信息
import React, { createContext, useContext, useReducer, useEffect, useCallback } from "react"
import { useApi } from "./api.js"
import type { Project, ProjectCodeFile } from "../../shared/types.js"

interface ProjectState {
  current: Project | null
  list: Array<Pick<Project, "id" | "name" | "created_at" | "updated_at">>
  loading: boolean
}

type ProjectAction =
  | { type: "SET_CURRENT"; project: Project }
  | { type: "SET_CURRENT_SUMMARY"; summary: ProjectState["list"][number] }
  | { type: "SET_LIST"; list: ProjectState["list"] }
  | { type: "SET_LOADING"; loading: boolean }

function reducer(state: ProjectState, action: ProjectAction): ProjectState {
  switch (action.type) {
    case "SET_CURRENT":
      return { ...state, current: action.project }
    case "SET_CURRENT_SUMMARY":
      // 从列表摘要构建部分 current（无 code），减少初始化时额外请求
      return { ...state, current: { ...action.summary, code: [] } }
    case "SET_LIST":
      return { ...state, list: action.list }
    case "SET_LOADING":
      return { ...state, loading: action.loading }
  }
}

const ProjectCtx = createContext<{
  state: ProjectState
  loadProjectList: () => Promise<void>
  loadProject: (id: string) => Promise<void>
  createProject: (name: string, code?: ProjectCodeFile[]) => Promise<Project>
  updateProject: (id: string, input: { name?: string; code?: ProjectCodeFile[] }) => Promise<Project>
} | null>(null)

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const api = useApi()
  const [state, dispatch] = useReducer(reducer, {
    current: null,
    list: [],
    loading: false,
  })

  const loadProjectList = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true })
    const list = await api.project.list()
    if (list) {
      dispatch({ type: "SET_LIST", list })
      // 初始化时用列表摘要直接设置 current，避免额外 GET 请求
      if (!state.current && list.length > 0) {
        dispatch({ type: "SET_CURRENT_SUMMARY", summary: list[0] })
      }
    }
    dispatch({ type: "SET_LOADING", loading: false })
  }, [api])

  const loadProject = useCallback(async (id: string) => {
    dispatch({ type: "SET_LOADING", loading: true })
    const project = await api.project.get(id)
    if (project) dispatch({ type: "SET_CURRENT", project })
    dispatch({ type: "SET_LOADING", loading: false })
  }, [api])

  const createProject = useCallback(async (name: string, code?: ProjectCodeFile[]) => {
    const project = await api.project.create(name, code)
    if (!project) throw new Error("Failed to create project")
    dispatch({ type: "SET_CURRENT", project })
    await loadProjectList()
    return project
  }, [api, loadProjectList])

  const updateProject = useCallback(async (id: string, input: { name?: string; code?: ProjectCodeFile[] }) => {
    const project = await api.project.update(id, input)
    if (!project) throw new Error("Failed to update project")
    dispatch({ type: "SET_CURRENT", project })
    await loadProjectList()
    return project
  }, [api, loadProjectList])

  // 初始化加载项目列表
  useEffect(() => {
    loadProjectList()
  }, [loadProjectList])

  return (
    <ProjectCtx.Provider value={{ state, loadProjectList, loadProject, createProject, updateProject }}>
      {children}
    </ProjectCtx.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectCtx)
  if (!ctx) throw new Error("useProject must be used within ProjectProvider")
  return ctx
}
