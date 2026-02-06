import React, { useEffect, useMemo, useState } from 'react';
import {
  Download, Search, ChevronDown, Filter, FileText, Image, Copy, Loader2,
  ShieldCheck, ShieldAlert, CheckCircle, XCircle, RefreshCw
} from 'lucide-react';
import { api } from '../lib/api';

type AuditLog = {
  id: string;
  submissionId: string;
  timestamp: string;
  portal: string;
  status: string;
  receiptId: string;
  hash: string;
  action?: string;
};

type VerifyResult = {
  valid: boolean;
  message?: string;
} | null;

const AuditVault = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResult>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const loadLogs = async () => {
    setIsLoading(true);
    setError(null);
    const response = await api.getAuditLogs({ limit: 200 });
    if (response.error) {
      setError(response.error);
      setLogs([]);
      setIsLoading(false);
      return;
    }
    const data = response.data?.data ?? [];
    const mapped = data.map((log: any) => ({
      id: log.id,
      submissionId: log.submission_ref ?? log.submission_id ?? 'N/A',
      timestamp: log.timestamp ?? '',
      portal: log.portal ?? 'Unknown',
      status: log.status ?? 'PENDING',
      receiptId: log.receipt_id ?? 'N/A',
      hash: log.confirmation_hash ?? '',
      action: log.action ?? '',
    }));
    setLogs(mapped);
    setIsLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) =>
      log.submissionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.receiptId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.hash.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [logs, searchQuery]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await api.exportAuditLogs();
      const exportData = response.data?.data ?? filteredLogs;
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleVerify = async (log: AuditLog) => {
    setVerifyingId(log.id);
    try {
      const response = await api.verifyAuditLog(log.id);
      if (response.data) {
        setVerifyResults(prev => ({
          ...prev,
          [log.id]: {
            valid: response.data.valid ?? response.data.verified ?? false,
            message: response.data.message ?? (response.data.valid ? 'Integrity verified' : 'Verification failed'),
          },
        }));
      } else {
        setVerifyResults(prev => ({
          ...prev,
          [log.id]: { valid: false, message: response.error || 'Verification request failed' },
        }));
      }
    } catch {
      setVerifyResults(prev => ({
        ...prev,
        [log.id]: { valid: false, message: 'Network error during verification' },
      }));
    } finally {
      setVerifyingId(null);
    }
  };

  const formatTimestamp = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value || 'N/A';
    return parsed.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-[#191919]">
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-[1200px] mx-auto flex flex-col gap-8">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <span className="hover:text-gray-900 dark:hover:text-white cursor-pointer transition-colors">Operations</span>
            <span>{'>'}</span>
            <span className="hover:text-gray-900 dark:hover:text-white cursor-pointer transition-colors">Submissions</span>
            <span>{'>'}</span>
            <span className="font-medium text-gray-900 dark:text-white">Audit Vault</span>
          </nav>

          <div className="flex justify-between items-start">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Evidence & Audit Vault</h1>
              <p className="text-gray-500 mt-2">Immutable record of external portal interactions and submission receipts.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadLogs}
                disabled={isLoading}
                className="px-4 py-2.5 rounded-lg border border-gray-200 dark:border-neutral-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors flex items-center gap-2"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting || isLoading}
                className="bg-gray-900 dark:bg-white text-white dark:text-black px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-70 disabled:active:scale-100"
              >
                {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                {isExporting ? 'Exporting...' : 'Export Audit Trail'}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="bg-white dark:bg-[#1e1e1e] p-1 rounded-xl flex flex-wrap gap-4 items-center border border-gray-200 dark:border-neutral-800 shadow-sm">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Submission ID, Receipt ID, or Hash..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-neutral-800 rounded-lg text-sm border-none focus:ring-2 focus:ring-gray-900 outline-none transition-shadow"
              />
            </div>
            <div className="flex gap-2 p-1">
              <button className="h-9 px-3 rounded-lg border border-gray-200 dark:border-neutral-700 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition-colors">
                Date: Last 30 Days <ChevronDown size={16} className="text-gray-400" />
              </button>
              <button className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-500 transition-colors">
                <Filter size={18} />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-gray-200 dark:border-neutral-800 shadow-sm overflow-hidden min-h-[400px]">
            <table className="w-full text-left">
              <thead className="border-b border-gray-200 dark:border-neutral-800">
                <tr>
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-gray-500">Submission ID</th>
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-gray-500">Timestamp (UTC)</th>
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-gray-500">Portal</th>
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-gray-500">Receipt ID</th>
                  <th className="py-4 px-6 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-500">
                      <Loader2 size={18} className="inline-block animate-spin mr-2" /> Loading audit logs...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-500">No records found matching your search.</td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const vResult = verifyResults[log.id];
                    return (
                      <React.Fragment key={log.id}>
                        <tr className="hover:bg-gray-50 dark:hover:bg-neutral-800/50 group transition-colors">
                          <td className="py-4 px-6">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{log.submissionId}</span>
                          </td>
                          <td className="py-4 px-6 text-sm font-mono text-gray-600 dark:text-gray-400">{formatTimestamp(log.timestamp)}</td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-gray-900 dark:bg-white"></div>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{log.portal}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              log.status === 'CONFIRMED'
                                ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                                : 'bg-white border border-gray-300 text-gray-700'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2 group/hash">
                              <code className="text-xs font-mono bg-gray-100 dark:bg-neutral-800 px-2 py-1 rounded text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-neutral-700">
                                {log.receiptId}
                              </code>
                              {log.hash && (
                                <Copy
                                  size={14}
                                  className="opacity-0 group-hover/hash:opacity-100 text-gray-400 cursor-pointer hover:text-gray-900 transition-all"
                                  onClick={() => navigator.clipboard.writeText(log.hash)}
                                  title="Copy confirmation hash"
                                />
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleVerify(log)}
                                disabled={verifyingId === log.id}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                  vResult?.valid === true
                                    ? 'bg-green-50 text-green-700 border border-green-200'
                                    : vResult?.valid === false
                                      ? 'bg-red-50 text-red-700 border border-red-200'
                                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                                }`}
                                title="Verify cryptographic integrity"
                              >
                                {verifyingId === log.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : vResult?.valid === true ? (
                                  <ShieldCheck size={12} />
                                ) : vResult?.valid === false ? (
                                  <ShieldAlert size={12} />
                                ) : (
                                  <ShieldCheck size={12} />
                                )}
                                {vResult?.valid === true ? 'Verified' : vResult?.valid === false ? 'Failed' : 'Verify'}
                              </button>
                              <button
                                onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                                title="View details"
                              >
                                <FileText size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Expanded detail row */}
                        {selectedLog?.id === log.id && (
                          <tr>
                            <td colSpan={6} className="px-6 py-4 bg-gray-50 dark:bg-neutral-900/50">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Confirmation Hash</p>
                                  <code className="block text-xs font-mono bg-white dark:bg-neutral-800 p-2 rounded border border-gray-200 dark:border-neutral-700 break-all">
                                    {log.hash || 'No hash recorded'}
                                  </code>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Action</p>
                                  <p className="text-sm text-gray-700 dark:text-gray-300">{log.action || 'N/A'}</p>
                                </div>
                                {vResult && (
                                  <div className="col-span-2">
                                    <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Verification Result</p>
                                    <div className={`flex items-center gap-2 p-2 rounded-lg text-sm font-medium ${
                                      vResult.valid ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                    }`}>
                                      {vResult.valid ? <CheckCircle size={16} /> : <XCircle size={16} />}
                                      {vResult.message}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-neutral-800 flex justify-between items-center">
              <p className="text-xs text-gray-500">Showing <span className="font-bold text-gray-900 dark:text-white">{filteredLogs.length}</span> entries</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditVault;
