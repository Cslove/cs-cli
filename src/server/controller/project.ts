import { Controller, Get, Post, Put, Inject, Param, Body, Query } from "@midwayjs/core"
import { Context } from "@midwayjs/koa"
import { ProjectService } from "../service/project.js"
import type { ProjectCodeFile } from "../../shared/types.js"

@Controller("/api/project")
export class ProjectController {
  @Inject()
  projectService!: ProjectService

  @Get("/list")
  async list() {
    return this.projectService.list()
  }

  @Get("/detail/:id")
  async get(@Param() id: string) {
    const project = await this.projectService.get(id)
    if (!project) throw new Error("Project not found")
    return project
  }

  @Post("/create")
  async create(@Body() body: { name: string; code?: ProjectCodeFile[] }) {
    if (!body.name) throw new Error("name is required")
    return this.projectService.create(body.name, body.code)
  }

  @Put("/update/:id")
  async update(@Param() id: string, @Body() body: { name?: string; code?: ProjectCodeFile[] }) {
    return this.projectService.update(id, body)
  }
}
