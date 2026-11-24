export type NliLabel = 'entailment' | 'contradiction' | 'neutral';

export type DocumentStatus = 'queued' | 'processing' | 'ready' | 'failed';

export type JobKind = 'extract_text' | 'extract_claims' | 'retrieve' | 'nli';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type GraphNodeType = 'document' | 'claim' | 'passage';

export type GraphEdgeKind = 'extracted_from' | 'evidence';

export type ExportFormat = 'json' | 'csv';

export interface ApiErrorPayload {
  code: string;
  message: string;
  request_id?: string | null;
}

export interface NormalizedApiError {
  status: number;
  code: string;
  message: string;
  requestId?: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  ml_backend: string;
  embedding_model: string;
  nli_model: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
}

export interface AuthResponse {
  token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export interface CreateProjectRequest {
  name: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  document_count: number;
  claim_count: number;
  created_at: string;
}

export interface ProjectListResponse {
  projects: ProjectItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface DeleteProjectResponse {
  deleted: string;
}

export interface DocumentItem {
  id: string;
  original_name: string;
  media_type: string;
  size_bytes: number;
  status: DocumentStatus;
  error_message: string | null;
  page_count: number | null;
  created_at: string;
}

export interface DocumentListResponse {
  documents: DocumentItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface JobItem {
  id: string;
  kind: JobKind;
  status: JobStatus;
  progress_pct: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface JobListResponse {
  jobs: JobItem[];
}

export interface AnalyzeStartedResponse {
  status: string;
  project_id: string;
  job_ids: string[];
}

export interface EvidenceItem {
  id: string;
  passage_id: string;
  document_id: string;
  document_name: string;
  page_no: number | null;
  char_start: number;
  char_end: number;
  passage_text: string;
  model_name: string;
  model_label: NliLabel;
  model_score: number;
  user_label: NliLabel | null;
  effective_label: NliLabel;
}

export interface ClaimItem {
  id: string;
  source_document_id: string;
  source_name: string;
  page_no: number | null;
  char_start: number;
  char_end: number;
  text: string;
  confidence: number;
  extractor_name: string;
  has_evidence: boolean;
  evidence: EvidenceItem[];
}

export interface ClaimsResponse {
  claims: ClaimItem[];
  total: number;
  limit: number;
  offset: number;
  jobs: JobItem[];
}

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  document_id: string | null;
  page_no: number | null;
  has_evidence: boolean | null;
  confidence: number | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  label: NliLabel | null;
  model_label: NliLabel | null;
  user_label: NliLabel | null;
  score: number | null;
}

export interface GraphResponse {
  project_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface OverrideRequest {
  user_label: NliLabel | null;
}

export interface OverrideResponse {
  id: string;
  user_label: NliLabel | null;
}
