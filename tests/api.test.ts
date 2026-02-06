import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../lib/api';

/**
 * Helper to create a mock Response object that satisfies the API client's
 * expectations: .ok, .status, .headers.get('content-type'), and .json().
 */
function createMockResponse(status: number, data: any = null): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-type') {
          return data !== null ? 'application/json' : '';
        }
        return null;
      },
    },
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

describe('ProcuraAPI', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    api.clearToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // -------------------------------------------------------
  // Token Management
  // -------------------------------------------------------

  describe('Token management', () => {
    it('starts with null token after clearToken', () => {
      api.clearToken();
      expect(api.getToken()).toBeNull();
    });

    it('stores and retrieves a token via setToken / getToken', () => {
      api.setToken('my-jwt-token');
      expect(api.getToken()).toBe('my-jwt-token');
    });

    it('clearToken removes a previously set token', () => {
      api.setToken('my-jwt-token');
      api.clearToken();
      expect(api.getToken()).toBeNull();
    });
  });

  // -------------------------------------------------------
  // GET Requests
  // -------------------------------------------------------

  describe('GET requests', () => {
    it('getOpportunities builds correct URL with query params', async () => {
      fetchMock.mockResolvedValueOnce(
        createMockResponse(200, { items: [], total: 0 }),
      );

      const result = await api.getOpportunities({
        page: 2,
        limit: 25,
        status: 'qualified',
        source: 'sam_gov',
        min_fit_score: 70,
        search: 'cyber',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain('/opportunities?');
      expect(url).toContain('page=2');
      expect(url).toContain('limit=25');
      expect(url).toContain('status=qualified');
      expect(url).toContain('source=sam_gov');
      expect(url).toContain('min_fit_score=70');
      expect(url).toContain('search=cyber');
      expect(options.method).toBe('GET');

      expect(result.status).toBe(200);
      expect(result.data).toEqual({ items: [], total: 0 });
      expect(result.error).toBeUndefined();
    });

    it('getOpportunities works with no params', async () => {
      fetchMock.mockResolvedValueOnce(
        createMockResponse(200, { items: [] }),
      );

      const result = await api.getOpportunities();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('/opportunities?');
      expect(result.status).toBe(200);
    });
  });

  // -------------------------------------------------------
  // POST Requests
  // -------------------------------------------------------

  describe('POST requests', () => {
    it('createOpportunity sends correct POST with body', async () => {
      const opportunityData = {
        title: 'Cybersecurity Assessment',
        agency: 'DOD',
        external_ref: 'SAM-2025-001',
        source: 'sam_gov',
        posted_date: '2025-01-15',
        due_date: '2025-03-15',
        description: 'Full-scope cyber assessment',
        naics_code: '541512',
        estimated_value: 500000,
      };

      fetchMock.mockResolvedValueOnce(
        createMockResponse(201, { id: 'opp-123', ...opportunityData }),
      );

      const result = await api.createOpportunity(opportunityData);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain('/opportunities');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual(opportunityData);

      expect(result.status).toBe(201);
      expect(result.data).toMatchObject({ id: 'opp-123' });
    });

    it('createSubmission sends correct POST with body', async () => {
      const submissionData = {
        opportunity_id: 'opp-123',
        portal: 'sam.gov',
        due_date: '2025-03-15',
        title: 'Proposal for Cyber Assessment',
        notes: 'Priority submission',
      };

      fetchMock.mockResolvedValueOnce(
        createMockResponse(201, { id: 'sub-456', ...submissionData }),
      );

      const result = await api.createSubmission(submissionData);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain('/submissions');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual(submissionData);

      expect(result.status).toBe(201);
      expect(result.data).toMatchObject({ id: 'sub-456' });
    });
  });

  // -------------------------------------------------------
  // Auth Header
  // -------------------------------------------------------

  describe('Authorization header', () => {
    it('includes Bearer token when token is set', async () => {
      api.setToken('secret-jwt');
      fetchMock.mockResolvedValueOnce(createMockResponse(200, {}));

      await api.getOpportunities();

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer secret-jwt');
    });

    it('does not include Authorization header when no token is set', async () => {
      fetchMock.mockResolvedValueOnce(createMockResponse(200, {}));

      await api.getOpportunities();

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });
  });

  // -------------------------------------------------------
  // Retry Logic
  // -------------------------------------------------------

  describe('Retry logic', () => {
    it('retries on 5xx errors and eventually succeeds', async () => {
      vi.useFakeTimers();

      fetchMock
        .mockResolvedValueOnce(createMockResponse(500, { detail: 'Internal error' }))
        .mockResolvedValueOnce(createMockResponse(502, { detail: 'Bad gateway' }))
        .mockResolvedValueOnce(createMockResponse(200, { items: ['ok'] }));

      const promise = api.getOpportunities();
      await vi.runAllTimersAsync();
      const result = await promise;

      // 3 calls: initial + 2 retries
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ items: ['ok'] });
      expect(result.error).toBeUndefined();
    });

    it('returns error after all retries exhausted on 5xx', async () => {
      vi.useFakeTimers();

      fetchMock
        .mockResolvedValueOnce(createMockResponse(500, { detail: 'fail 1' }))
        .mockResolvedValueOnce(createMockResponse(500, { detail: 'fail 2' }))
        .mockResolvedValueOnce(createMockResponse(503, { detail: 'Service unavailable' }));

      const promise = api.getOpportunities();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.status).toBe(503);
      expect(result.error).toBe('Service unavailable');
    });

    it('does NOT retry on 4xx client errors', async () => {
      fetchMock.mockResolvedValueOnce(
        createMockResponse(400, { detail: 'Bad request' }),
      );

      const result = await api.getOpportunities();

      // Only 1 call - no retries for client errors
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(400);
      expect(result.error).toBe('Bad request');
    });

    it('does NOT retry on 404 errors', async () => {
      fetchMock.mockResolvedValueOnce(
        createMockResponse(404, { detail: 'Not found' }),
      );

      const result = await api.getOpportunity('nonexistent');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(404);
      expect(result.error).toBe('Not found');
    });

    it('does NOT retry on 401 unauthorized', async () => {
      fetchMock.mockResolvedValueOnce(
        createMockResponse(401, { detail: 'Unauthorized' }),
      );

      const result = await api.getOpportunities();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(401);
      expect(result.error).toBe('Unauthorized');
    });
  });

  // -------------------------------------------------------
  // Timeout Handling
  // -------------------------------------------------------

  describe('Timeout handling', () => {
    it('returns timeout error when all attempts abort', async () => {
      vi.useFakeTimers();

      const makeAbortError = () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return err;
      };

      fetchMock
        .mockRejectedValueOnce(makeAbortError())
        .mockRejectedValueOnce(makeAbortError())
        .mockRejectedValueOnce(makeAbortError());

      const promise = api.healthCheck();
      await vi.runAllTimersAsync();
      const result = await promise;

      // 3 calls: initial + 2 retries
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.status).toBe(0);
      expect(result.error).toContain('Request timeout');
    });

    it('retries on network errors and can succeed', async () => {
      vi.useFakeTimers();

      fetchMock
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(createMockResponse(200, { status: 'ok' }));

      const promise = api.healthCheck();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ status: 'ok' });
    });

    it('returns network error after all retries exhausted', async () => {
      vi.useFakeTimers();

      fetchMock
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const promise = api.healthCheck();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.status).toBe(0);
      expect(result.error).toContain('Failed to fetch');
    });
  });
});
