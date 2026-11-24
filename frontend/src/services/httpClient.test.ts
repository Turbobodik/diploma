import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';

import { normalizeAxiosError } from './httpClient';

function makeAxiosError(status: number, data: unknown, headers: Record<string, string> = {}) {
  const response = {
    status,
    statusText: 'Error',
    headers,
    config: { headers: {} },
    data,
  } as unknown as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, response);
}

describe('normalizeAxiosError', () => {
  it('extracts structured backend ErrorOut payloads and request_id', () => {
    const err = makeAxiosError(404, {
      code: 'not_found',
      message: 'Project not found',
      request_id: 'req-abc-123',
    });
    expect(normalizeAxiosError(err)).toEqual({
      status: 404,
      code: 'not_found',
      message: 'Project not found',
      requestId: 'req-abc-123',
    });
  });

  it('maps standard HTTP 401/403/429/500 statuses to user-friendly fallback messages', () => {
    expect(normalizeAxiosError(makeAxiosError(401, null)).code).toBe('unauthorized');
    expect(normalizeAxiosError(makeAxiosError(403, null)).code).toBe('forbidden');
    expect(normalizeAxiosError(makeAxiosError(429, null)).code).toBe('rate_limited');
    expect(normalizeAxiosError(makeAxiosError(500, null)).code).toBe('internal_error');
  });

  it('handles network failures without an HTTP response', () => {
    const networkErr = new AxiosError('Network Error', 'ERR_NETWORK');
    const normalized = normalizeAxiosError(networkErr);
    expect(normalized.status).toBe(0);
    expect(normalized.code).toBe('network_error');
  });
});
