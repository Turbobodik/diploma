import type {
  CreateProjectRequest,
  DeleteProjectResponse,
  ProjectItem,
  ProjectListResponse,
} from '../models/api';
import { httpClient } from './httpClient';

export const projectService = {
  async listProjects(limit = 50, offset = 0): Promise<ProjectListResponse> {
    const { data } = await httpClient.get<ProjectListResponse>('/api/v1/projects', {
      params: { limit, offset },
    });
    return data;
  },

  async getProject(projectId: string): Promise<ProjectItem> {
    const { data } = await httpClient.get<ProjectItem>(`/api/v1/projects/${projectId}`);
    return data;
  },

  async createProject(payload: CreateProjectRequest): Promise<ProjectItem> {
    const { data } = await httpClient.post<ProjectItem>('/api/v1/projects', payload);
    return data;
  },

  async renameProject(projectId: string, payload: CreateProjectRequest): Promise<ProjectItem> {
    const { data } = await httpClient.patch<ProjectItem>(`/api/v1/projects/${projectId}`, payload);
    return data;
  },

  async createDemoProject(preset?: string): Promise<ProjectItem> {
    const { data } = await httpClient.post<ProjectItem>('/api/v1/projects/demo', null, {
      params: preset ? { preset } : undefined,
    });
    return data;
  },

  async deleteProject(projectId: string): Promise<DeleteProjectResponse> {
    const { data } = await httpClient.delete<DeleteProjectResponse>(
      `/api/v1/projects/${projectId}`,
    );
    return data;
  },
};
