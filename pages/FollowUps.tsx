import { useState, useEffect, useCallback } from 'react';
import { Eye, RefreshCw, Clock, CheckCircle, AlertTriangle, XCircle, Trophy, Search, Loader2, Play, Pause, Trash2, ChevronDown, ChevronUp, CalendarClock } from 'lucide-react';
import api from '../lib/api';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  checked: { label: 'Checked', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Eye },
  updated: { label: 'Updated', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: AlertTriangle },
  no_change: { label: 'No Change', color: 'bg-gray-50 text-gray-600 border-gray-200', icon: CheckCircle },
  awarded: { label: 'Awarded!', color: 'bg-green-50 text-green-700 border-green-200', icon: Trophy },
  lost: { label: 'Lost', color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500 border-gray-300', icon: XCircle },
};

const FollowUps = () => {
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checkHistory, setCheckHistory] = useState<any[]>([]);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFollowUps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listFollowUps({ status: statusFilter || undefined });
      if (res.data) {
        setFollowUps(res.data);
        setTotal(res.total || res.data.length);
      }
    } catch {
      setError('Failed to load follow-ups. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadFollowUps(); }, [loadFollowUps]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    try {
      const res = await api.getFollowUp(id);
      if (res.checks) setCheckHistory(res.checks);
    } catch {
      setError('Failed to load check history.');
    }
  };

  const handleManualCheck = async (id: string) => {
    setCheckingId(id);
    try {
      await api.triggerFollowUpCheck(id);
      loadFollowUps();
      if (expandedId === id) {
        const res = await api.getFollowUp(id);
        if (res.checks) setCheckHistory(res.checks);
      }
    } catch {
      setError('Manual check failed. Please try again.');
    } finally {
      setCheckingId(null);
    }
  };

  const handleToggleAuto = async (id: string, currentAuto: boolean) => {
    await api.updateFollowUp(id, { auto_check: !currentAuto });
    loadFollowUps();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this follow-up tracker?')) return;
    await api.deleteFollowUp(id);
    loadFollowUps();
  };

  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const formatTime = (d: string) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Application Follow-ups</h1>
          <p className="text-sm text-gray-500 mt-1">Track submitted applications and monitor for status changes</p>
        </div>
        <button onClick={loadFollowUps} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {['pending', 'checked', 'updated', 'awarded'].map((s) => {
          const config = STATUS_CONFIG[s];
          const count = followUps.filter(f => f.status === s).length;
          const Icon = config.icon;
          return (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              className={`p-3 rounded-xl border text-left transition-colors ${statusFilter === s ? config.color + ' border-2' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} />
                <span className="text-xs font-medium">{config.label}</span>
              </div>
              <span className="text-xl font-bold">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs">Dismiss</button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading follow-ups...
        </div>
      ) : followUps.length === 0 ? (
        <div className="text-center py-20">
          <CalendarClock size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-sm">No follow-ups yet. They are automatically created when you create a submission workspace.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {followUps.map((fu) => {
            const config = STATUS_CONFIG[fu.status] || STATUS_CONFIG.pending;
            const Icon = config.icon;
            const isExpanded = expandedId === fu.id;

            return (
              <div key={fu.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${config.color}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {fu.submission?.title || fu.opportunity?.title || 'Untitled'}
                      </h3>
                      <p className="text-xs text-gray-400">
                        {fu.opportunity?.agency || fu.submission?.portal || '—'} &middot; {fu.check_type}
                        &middot; {fu.checks_performed}/{fu.max_checks} checks
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${config.color}`}>
                      {config.label}
                    </span>

                    {fu.portal_status && (
                      <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600">{fu.portal_status}</span>
                    )}

                    <div className="flex items-center gap-1 text-xs text-gray-400 ml-2">
                      <Clock size={12} />
                      <span>Next: {formatDate(fu.next_check_at)}</span>
                    </div>

                    <button onClick={() => handleManualCheck(fu.id)} disabled={checkingId === fu.id}
                      className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" title="Check now">
                      {checkingId === fu.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    </button>

                    <button onClick={() => handleToggleAuto(fu.id, fu.auto_check)}
                      className={`p-1.5 rounded-lg border ${fu.auto_check ? 'border-green-200 bg-green-50 text-green-600' : 'border-gray-200 text-gray-400'}`} title={fu.auto_check ? 'Auto-check ON' : 'Auto-check OFF'}>
                      {fu.auto_check ? <RefreshCw size={14} /> : <Pause size={14} />}
                    </button>

                    <button onClick={() => handleExpand(fu.id)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    <button onClick={() => handleDelete(fu.id)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {fu.ai_change_summary && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg">{fu.ai_change_summary}</p>
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50">
                    <h4 className="text-xs font-semibold text-gray-600 mb-3">Check History</h4>
                    {checkHistory.length === 0 ? (
                      <p className="text-xs text-gray-400">No checks performed yet</p>
                    ) : (
                      <div className="space-y-2">
                        {checkHistory.map((check) => (
                          <div key={check.id} className="flex items-start gap-3 text-xs bg-white p-3 rounded-lg border border-gray-100">
                            <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${check.changes_detected ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>
                              {check.changes_detected ? <AlertTriangle size={10} /> : <CheckCircle size={10} />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-700">{check.check_type} check</span>
                                <span className="text-gray-400">{formatTime(check.checked_at)}</span>
                              </div>
                              {check.status_found && <p className="text-gray-500 mt-0.5">Status: {check.status_found}</p>}
                              {check.ai_analysis && <p className="text-purple-600 mt-1">{check.ai_analysis}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FollowUps;
