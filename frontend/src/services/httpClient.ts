import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import type { ApiErrorPayload, NormalizedApiError } from '../models/api';
import { logger } from './logger';
import { tokenStorage } from './tokenStorage';

export class ApiClientError extends Error implements NormalizedApiError {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(error: NormalizedApiError) {
    super(error.message);
    this.name = 'ApiClientError';
    this.status = error.status;
    this.code = error.code;
    this.requestId = error.requestId;
  }
}

type UnauthorizedHandler = () => void;
type GlobalErrorHandler = (error: NormalizedApiError) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let globalErrorHandler: GlobalErrorHandler | null = null;

export function registerHttpHandlers(handlers: {
  onUnauthorized?: UnauthorizedHandler;
  onGlobalError?: GlobalErrorHandler;
}): void {
  unauthorizedHandler = handlers.onUnauthorized ?? null;
  globalErrorHandler = handlers.onGlobalError ?? null;
}

const DEFAULT_STATUS_MESSAGES: Record<number, { code: string; message: string }> = {
  400: { code: 'bad_request', message: 'The request could not be processed. Check your inputs.' },
  401: { code: 'unauthorized', message: 'Your session has expired. Please sign in again.' },
  403: { code: 'forbidden', message: 'You do not have permission to access this resource.' },
  404: { code: 'not_found', message: 'The requested resource was not found.' },
  409: { code: 'conflict', message: 'A conflicting resource already exists.' },
  413: {
    code: 'payload_too_large',
    message: 'The uploaded file is empty or exceeds the 20 MB limit.',
  },
  415: {
    code: 'unsupported_media_type',
    message: 'Only PDF and plain text (.txt) files are supported.',
  },
  422: {
    code: 'validation_error',
    message: 'Validation failed. Please review the highlighted fields.',
  },
  429: { code: 'rate_limited', message: 'Too many requests. Please wait a moment and try again.' },
  500: { code: 'internal_error', message: 'A server error occurred. Please retry in a moment.' },
  502: { code: 'bad_gateway', message: 'The API server is temporarily unavailable.' },
  503: { code: 'service_unavailable', message: 'The service is temporarily unavailable.' },
};

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.message === 'string' && typeof candidate.code === 'string';
}

export function normalizeAxiosError(error: unknown): NormalizedApiError {
  if (error instanceof ApiClientError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      requestId: error.requestId,
    };
  }

  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<unknown>;
    const status = axiosErr.response?.status ?? 0;
    const headerReqId =
      typeof axiosErr.response?.headers?.['x-request-id'] === 'string'
        ? axiosErr.response.headers['x-request-id']
        : undefined;

    if (!axiosErr.response) {
      return {
        status: 0,
        code: 'network_error',
        message: 'Unable to reach the FactMap API server. Check your connection or backend status.',
      };
    }

    const data = axiosErr.response.data;
    if (isApiErrorPayload(data)) {
      return {
        status,
        code: data.code,
        message: data.message,
        requestId: data.request_id ?? headerReqId,
      };
    }

    const fallback = DEFAULT_STATUS_MESSAGES[status] ?? {
      code: `http_${status}`,
      message: `Unexpected server response (HTTP ${status}).`,
    };
    return {
      status,
      code: fallback.code,
      message: fallback.message,
      requestId: headerReqId,
    };
  }

  return {
    status: 0,
    code: 'unknown_error',
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
  };
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createHttpClient(baseURL?: string): AxiosInstance {
  const resolvedBaseUrl = baseURL ?? import.meta.env.VITE_API_BASE_URL ?? '';
  const instance = axios.create({
    baseURL: resolvedBaseUrl,
    timeout: 30_000,
    headers: {
      Accept: 'application/json',
    },
  });

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (!config.headers['X-Request-ID']) {
      config.headers['X-Request-ID'] = generateRequestId();
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const normalized = normalizeAxiosError(error);
      const reqUrl = axios.isAxiosError(error) ? (error.config?.url ?? '') : '';

      logger.error('API request failed', {
        url: reqUrl,
        status: normalized.status,
        code: normalized.code,
        requestId: normalized.requestId,
      });

      const isAuthEndpoint = reqUrl.includes('/auth/login') || reqUrl.includes('/auth/register');
      if (normalized.status === 401 && !isAuthEndpoint) {
        tokenStorage.clearToken();
        unauthorizedHandler?.();
      }

      if (
        normalized.status === 0 ||
        normalized.status === 403 ||
        normalized.status === 429 ||
        normalized.status >= 500
      ) {
        globalErrorHandler?.(normalized);
      }

      return Promise.reject(new ApiClientError(normalized));
    },
  );

  return instance;
}

export const httpClient = createHttpClient();
