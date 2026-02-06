/**
 * Procura API Client
 * Handles all communication with the backend API
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

interface APIResponse<T> {
    data?: T;
    error?: string;
    status: number;
}

class ProcuraAPI {
    private token: string | null = null;

    setToken(token: string) {
        this.token = token;
    }

    clearToken() {
        this.token = null;
    }

    private async request<T>(
        method: string,
        endpoint: string,
        body?: any,
        retries = 2
    ): Promise<APIResponse<T>> {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                };

                if (this.token) {
                    headers['Authorization'] = `Bearer ${this.token}`;
                }

                // Create abort controller for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

                const response = await fetch(`${API_BASE}${endpoint}`, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                const contentType = response.headers.get('content-type') || '';
                const data = contentType.includes('application/json')
                    ? await response.json()
                    : null;

                if (!response.ok) {
                    // Don't retry 4xx errors (client errors)
                    if (response.status >= 400 && response.status < 500) {
                        return {
                            error: (data as any)?.detail || (data as any)?.message || `Request failed with status ${response.status}`,
                            status: response.status,
                            data: data as T,
                        };
                    }

                    // Retry 5xx errors
                    if (attempt < retries) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
                        continue;
                    }

                    return {
                        error: (data as any)?.detail || (data as any)?.message || `Server error (${response.status})`,
                        status: response.status,
                        data: data as T,
                    };
                }

                return {
                    data: data as T,
                    status: response.status,
                };
            } catch (error) {
                // Handle timeout and network errors
                if (error instanceof Error && error.name === 'AbortError') {
                    if (attempt < retries) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                        continue;
                    }
                    return {
                        error: `Request timeout after 30 seconds (${method} ${endpoint})`,
                        status: 0,
                    };
                }

                // Retry network errors
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                }

                return {
                    error: error instanceof Error ? `${error.message} (${method} ${endpoint})` : 'Unknown error',
                    status: 0,
                };
            }
        }

        // Fallback (should never reach here)
        return {
            error: 'Request failed after retries',
            status: 0,
        };
    }

    // Health Check
    async healthCheck() {
        return this.request<{ status: string; version: string }>('GET', '/health');
    }

    // ============================================
    // Opportunities
    // ============================================

    async getOpportunities(params?: {
        page?: number;
        limit?: number;
        status?: string;
        source?: string;
        min_fit_score?: number;
        search?: string;
    }) {
        const query = new URLSearchParams();
        if (params?.page) query.set('page', params.page.toString());
        if (params?.limit) query.set('limit', params.limit.toString());
        if (params?.status) query.set('status', params.status);
        if (params?.source) query.set('source', params.source);
        if (params?.min_fit_score !== undefined) query.set('min_fit_score', params.min_fit_score.toString());
        if (params?.search) query.set('search', params.search);

        return this.request<any>('GET', `/opportunities?${query.toString()}`);
    }

    async getOpportunity(id: string) {
        return this.request<any>('GET', `/opportunities/${id}`);
    }

    async updateOpportunity(id: string, data: any) {
        return this.request<any>('PATCH', `/opportunities/${id}`, data);
    }

    async qualifyOpportunity(id: string) {
        return this.request<any>('POST', `/opportunities/${id}/qualify`);
    }

    async disqualifyOpportunity(id: string, reason?: string) {
        const query = reason ? `?reason=${encodeURIComponent(reason)}` : '';
        return this.request<any>('PATCH', `/opportunities/${id}/disqualify${query}`);
    }

    async triggerSync(connector_name?: string) {
        return this.request<any>('POST', '/opportunities/sync', { connector_name });
    }

    // ============================================
    // Submissions
    // ============================================

    async getSubmissions(params?: {
        page?: number;
        limit?: number;
        status?: string;
        approval_status?: string;
        owner_id?: string;
        search?: string;
    }) {
        const query = new URLSearchParams();
        if (params?.page) query.set('page', params.page.toString());
        if (params?.limit) query.set('limit', params.limit.toString());
        if (params?.status) query.set('status', params.status);
        if (params?.approval_status) query.set('approval_status', params.approval_status);
        if (params?.owner_id) query.set('owner_id', params.owner_id);
        if (params?.search) query.set('search', params.search);

        return this.request<any>('GET', `/submissions?${query.toString()}`);
    }

    async getSubmission(id: string) {
        return this.request<any>('GET', `/submissions/${id}`);
    }

    async createSubmission(data: {
        opportunity_id: string;
        portal: string;
        due_date: string;
        title?: string;
        notes?: string;
    }) {
        return this.request<any>('POST', '/submissions', data);
    }

    async updateSubmission(id: string, data: any) {
        return this.request<any>('PATCH', `/submissions/${id}`, data);
    }

    // ============================================
    // Connectors
    // ============================================

    async getConnectors() {
        return this.request<any[]>('GET', '/connectors');
    }

    async getConnector(id: string) {
        return this.request<any>('GET', `/connectors/${id}`);
    }

    async testConnector(id: string) {
        return this.request<any>('POST', `/connectors/${id}/test`);
    }

    async updateConnector(id: string, data: any) {
        return this.request<any>('PATCH', `/connectors/${id}`, data);
    }

    // ============================================
    // Audit Logs
    // ============================================

    async getAuditLogs(params?: {
        submission_id?: string;
        portal?: string;
        limit?: number;
    }) {
        const query = new URLSearchParams();
        if (params?.limit) query.set('limit', params.limit.toString());
        if (params?.submission_id) query.set('submission_id', params.submission_id);
        if (params?.portal) query.set('portal', params.portal);

        return this.request<any>('GET', `/audit-logs?${query.toString()}`);
    }

    async verifyAuditLog(id: string) {
        return this.request<any>('GET', `/audit-logs/${id}/verify`);
    }

    // ============================================
    // Feeds
    // ============================================

    async getNewsFeed(params?: { q?: string; days?: number; page_size?: number }) {
        const query = new URLSearchParams();
        if (params?.q) query.set('q', params.q);
        if (params?.days !== undefined) query.set('days', params.days.toString());
        if (params?.page_size !== undefined) query.set('page_size', params.page_size.toString());

        const qs = query.toString();
        return this.request<any>('GET', `/feeds/news${qs ? `?${qs}` : ''}`);
    }

    // ============================================
    // Admin
    // ============================================

    async getAdminMetrics() {
        return this.request<any>('GET', '/admin/metrics');
    }

    async getSystemSettings() {
        return this.request<any>('GET', '/admin/settings');
    }

    async updateSystemSetting(key: string, value: any) {
        return this.request<any>('PUT', `/admin/settings/${key}`, { value });
    }

    async getFeatureFlags() {
        return this.request<any>('GET', '/admin/feature-flags');
    }

    async updateFeatureFlag(key: string, enabled: boolean, description?: string) {
        return this.request<any>('PUT', `/admin/feature-flags/${key}`, { enabled, description });
    }

    async getDiscoveryConfig() {
        return this.request<any>('GET', '/admin/discovery/config');
    }

    async triggerDiscovery(source?: string) {
        return this.request<any>('POST', '/admin/discovery/trigger', { source });
    }

    async getAIConfig() {
        return this.request<any>('GET', '/admin/ai/config');
    }

    async testAIConnection() {
        return this.request<any>('POST', '/admin/ai/test');
    }

    async getWorkflowConfig() {
        return this.request<any>('GET', '/admin/workflows/config');
    }

    async getJobs(status?: string) {
        const query = status ? `?status=${status}` : '';
        return this.request<any>('GET', `/admin/jobs${query}`);
    }

    async retryJob(jobId: string) {
        return this.request<any>('POST', `/admin/jobs/${jobId}/retry`);
    }

    async clearCache(cacheType?: string) {
        return this.request<any>('POST', '/admin/cache/clear', { cache_type: cacheType });
    }

    // ============================================
    // Export
    // ============================================

    async exportOpportunities(format: 'json' | 'csv' = 'json') {
        return this.request<any>('GET', `/admin/export/opportunities?format=${format}`);
    }

    async exportSubmissions(format: 'json' | 'csv' = 'json') {
        return this.request<any>('GET', `/admin/export/submissions?format=${format}`);
    }

    async exportAuditLogs(format: 'json' | 'csv' = 'json') {
        return this.request<any>('GET', `/admin/export/audit-logs?format=${format}`);
    }

    // ============================================
    // Users (Admin only)
    // ============================================

    async getUsers() {
        return this.request<any[]>('GET', '/admin/users');
    }

    async getUser(id: string) {
        return this.request<any>('GET', `/admin/users/${id}`);
    }

    async updateUser(id: string, data: any) {
        return this.request<any>('PATCH', `/admin/users/${id}`, data);
    }

    async inviteUser(email: string, role: string) {
        return this.request<any>('POST', '/admin/users/invite', { email, role });
    }

    async deleteUser(id: string) {
        return this.request<any>('DELETE', `/admin/users/${id}`);
    }

    // ============================================
    // Settings
    // ============================================

    async getAPIKeys() {
        return this.request<any>('GET', '/settings/api-keys');
    }

    async updateAPIKey(keyName: string, value: string) {
        return this.request<any>('PUT', `/settings/api-keys/${keyName}`, { value });
    }

    async bulkUpdateAPIKeys(keys: Record<string, string>) {
        return this.request<any>('PUT', '/settings/api-keys', { keys });
    }

    async deleteAPIKey(keyName: string) {
        return this.request<any>('DELETE', `/settings/api-keys/${keyName}`);
    }

    async testAPIKey(keyName: string) {
        return this.request<any>('POST', `/settings/api-keys/${keyName}/test`);
    }

    async getGeneralSettings() {
        return this.request<any>('GET', '/settings/general');
    }

    async updateGeneralSettings(data: {
        llm_provider?: string;
        llm_model?: string;
        llm_temperature?: number;
        llm_max_tokens?: number;
        openmanus_url?: string;
    }) {
        return this.request<any>('PUT', '/settings/general', data);
    }

    async reloadSettings() {
        return this.request<any>('POST', '/settings/reload');
    }

    async approveSubmission(id: string, step: string, notes?: string) {
        const query = new URLSearchParams();
        query.set('step', step);
        if (notes) query.set('notes', notes);
        return this.request<any>('POST', `/submissions/${id}/approve?${query.toString()}`);
    }

    async rejectSubmission(id: string, reason: string) {
        return this.request<any>('POST', `/submissions/${id}/reject?reason=${encodeURIComponent(reason)}`);
    }

    async finalizeSubmission(id: string, dry_run: boolean = false) {
        return this.request<any>('POST', `/submissions/${id}/finalize?dry_run=${dry_run}`);
    }

    async updateSubmissionTask(submissionId: string, taskId: string, completed: boolean) {
        return this.request<any>('PATCH', `/submissions/${submissionId}/tasks/${taskId}?completed=${completed}`);
    }
}

// Export singleton instance
export const api = new ProcuraAPI();
export default api;
