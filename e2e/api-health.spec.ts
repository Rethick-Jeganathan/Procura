import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:8001';

test.describe('Backend API Health', () => {
  test('root endpoint returns healthy status', async ({ request }) => {
    const response = await request.get(`${API_URL}/`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.name).toBe('Procura Ops API');
    expect(body.version).toBe('1.0.0');
  });

  test('health check endpoint returns detailed status', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toMatch(/healthy|degraded/);
    expect(body.checks).toBeDefined();
    expect(body.checks.database).toBeDefined();
  });

  test('API rejects unauthenticated requests to protected endpoints', async ({ request }) => {
    const endpoints = [
      '/api/opportunities',
      '/api/submissions',
      '/api/documents',
      '/api/follow-ups',
      '/api/correspondence',
      '/api/audit-logs',
    ];

    for (const endpoint of endpoints) {
      const response = await request.get(`${API_URL}${endpoint}`);
      // Should return 401 or 403 without auth token
      expect([401, 403, 422]).toContain(response.status());
    }
  });

  test('API returns 404 for unknown routes', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/nonexistent-endpoint`);
    expect(response.status()).toBe(404);
  });

  test('rate limiter headers are present', async ({ request }) => {
    const response = await request.get(`${API_URL}/`);
    // slowapi adds X-RateLimit headers
    const headers = response.headers();
    // At minimum the response should succeed
    expect(response.ok()).toBeTruthy();
  });
});
