import type {
  AnalyzeStartedResponse,
  ClaimsResponse,
  DeleteProjectResponse,
  DocumentContextResponse,
  DocumentItem,
  DocumentListResponse,
  ExportFormat,
  GraphResponse,
  HealthResponse,
  JobListResponse,
  NliLabel,
  OverrideResponse,
  VerifyClaimRequest,
  VerifyClaimResponse,
} from '../models/api';
import { httpClient } from './httpClient';

export interface ClaimsQueryParams {
  label?: NliLabel;
  document_id?: string;
  search?: string;
  cross_document_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface GraphQueryParams {
  label?: NliLabel;
  document_id?: string;
  include_neutral?: boolean;
  cross_document_only?: boolean;
}

export interface DocumentContextParams {
  char_start: number;
  char_end: number;
  window?: number;
}

export const workspaceService = {
  async listDocuments(projectId: string, limit = 50, offset = 0): Promise<DocumentListResponse> {
    const { data } = await httpClient.get<DocumentListResponse>(
      `/api/v1/projects/${projectId}/documents`,
      { params: { limit, offset } },
    );
    return data;
  },

  async getDocumentContext(
    projectId: string,
    documentId: string,
    params: DocumentContextParams,
  ): Promise<DocumentContextResponse> {
    const { data } = await httpClient.get<DocumentContextResponse>(
      `/api/v1/projects/${projectId}/documents/${documentId}/context`,
      { params },
    );
    return data;
  },

  async deleteDocument(projectId: string, documentId: string): Promise<DeleteProjectResponse> {
    const { data } = await httpClient.delete<DeleteProjectResponse>(
      `/api/v1/projects/${projectId}/documents/${documentId}`,
    );
    return data;
  },

  async uploadDocument(projectId: string, file: File): Promise<DocumentItem> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await httpClient.post<DocumentItem>(
      `/api/v1/projects/${projectId}/documents`,
      formData,
    );
    return data;
  },

  async startAnalysis(projectId: string, sync = false): Promise<AnalyzeStartedResponse> {
    const { data } = await httpClient.post<AnalyzeStartedResponse>(
      `/api/v1/projects/${projectId}/analyze`,
      undefined,
      { params: sync ? { sync: true } : undefined },
    );
    return data;
  },

  async listJobs(projectId: string): Promise<JobListResponse> {
    const { data } = await httpClient.get<JobListResponse>(`/api/v1/projects/${projectId}/jobs`);
    return data;
  },

  async listClaims(projectId: string, params: ClaimsQueryParams = {}): Promise<ClaimsResponse> {
    const { data } = await httpClient.get<ClaimsResponse>(`/api/v1/projects/${projectId}/claims`, {
      params,
    });
    return data;
  },

  async getGraph(projectId: string, params: GraphQueryParams = {}): Promise<GraphResponse> {
    const { data } = await httpClient.get<GraphResponse>(`/api/v1/projects/${projectId}/graph`, {
      params,
    });
    return data;
  },

  async verifyClaim(projectId: string, payload: VerifyClaimRequest): Promise<VerifyClaimResponse> {
    const { data } = await httpClient.post<VerifyClaimResponse>(
      `/api/v1/projects/${projectId}/verify`,
      payload,
    );
    return data;
  },

  async overrideEvidenceLabel(
    evidenceId: string,
    userLabel: NliLabel | null,
  ): Promise<OverrideResponse> {
    const { data } = await httpClient.patch<OverrideResponse>(`/api/v1/evidence/${evidenceId}`, {
      user_label: userLabel,
    });
    return data;
  },

  async exportProject(
    projectId: string,
    format: ExportFormat,
    filters: { label?: NliLabel; document_id?: string; cross_document_only?: boolean } = {},
  ): Promise<Blob> {
    const { data } = await httpClient.get<Blob>(`/api/v1/projects/${projectId}/export`, {
      params: { format, ...filters },
      responseType: 'blob',
    });
    return data;
  },

  async getHealth(): Promise<HealthResponse> {
    const { data } = await httpClient.get<HealthResponse>('/health');
    return data;
  },
};
