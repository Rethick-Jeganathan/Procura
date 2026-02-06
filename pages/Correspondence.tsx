import { useState, useEffect, useCallback } from 'react';
import { Mail, Trophy, AlertTriangle, MessageSquare, FileText, Search, Plus, RefreshCw, Loader2, ChevronDown, ChevronUp, Brain, Send, Archive, Eye, Bell, Check } from 'lucide-react';
import api from '../lib/api';

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  award_notice: { label: 'Award', color: 'bg-green-50 text-green-700 border-green-200', icon: Trophy },
  rejection_notice: { label: 'Rejection', color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
  amendment: { label: 'Amendment', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: FileText },
  question: { label: 'Question', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: MessageSquare },
  clarification: { label: 'Clarification', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: MessageSquare },
  extension: { label: 'Extension', color: 'bg-teal-50 text-teal-700 border-teal-200', icon: FileText },
  cancellation: { label: 'Cancellation', color: 'bg-gray-100 text-gray-600 border-gray-300', icon: AlertTriangle },
  general: { label: 'General', color: 'bg-gray-50 text-gray-600 border-gray-200', icon: Mail },
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  read: 'bg-gray-100 text-gray-600',
  action_required: 'bg-amber-100 text-amber-700',
  responded: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-400',
};

const Correspondence = () => {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseNotes, setResponseNotes] = useState('');

  // Notifications
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Create form
  const [createType, setCreateType] = useState('general');
  const [createSubject, setCreateSubject] = useState('');
  const [createBody, setCreateBody] = useState('');
  const [createSender, setCreateSender] = useState('');
  const [createAwardAmount, setCreateAwardAmount] = useState('');
  const [createContractNumber, setCreateContractNumber] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listCorrespondence({
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
      });
      if (res.data) {
        setItems(res.data);
        setTotal(res.total || res.data.length);
      }
    } catch {
      setError('Failed to load correspondence. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, search]);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.getCorrespondenceStats();
      if (res.data) setStats(res.data);
    } catch { /* stats are non-critical, skip */ }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.listNotifications(true);
      if (res.data) setNotifications(res.data);
    } catch { /* notifications are non-critical, skip */ }
  }, []);

  useEffect(() => { loadItems(); loadStats(); loadNotifications(); }, [loadItems, loadStats, loadNotifications]);

  const handleCreate = async () => {
    if (!createSubject) return;
    setCreating(true);
    try {
      await api.createCorrespondence({
        type: createType,
        subject: createSubject,
        body: createBody || undefined,
        sender: createSender || undefined,
        source: 'manual',
        award_amount: createAwardAmount ? parseFloat(createAwardAmount) : undefined,
        contract_number: createContractNumber || undefined,
      });
      setShowCreate(false);
      setCreateSubject(''); setCreateBody(''); setCreateSender('');
      setCreateAwardAmount(''); setCreateContractNumber('');
      loadItems();
      loadStats();
    } catch {
      setError('Failed to create correspondence. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleAIAnalyze = async (id: string) => {
    setAnalyzing(id);
    try {
      await api.aiAnalyzeCorrespondence(id);
      loadItems();
    } catch {
      setError('AI analysis failed. Please try again.');
    } finally {
      setAnalyzing(null);
    }
  };

  const handleRespond = async (id: string) => {
    if (!responseNotes.trim()) return;
    await api.respondToCorrespondence(id, responseNotes);
    setRespondingTo(null);
    setResponseNotes('');
    loadItems();
  };

  const handleArchive = async (id: string) => {
    await api.updateCorrespondenceStatus(id, 'archived');
    loadItems();
    loadStats();
  };

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead();
    loadNotifications();
  };

  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Correspondence</h1>
          <p className="text-sm text-gray-500 mt-1">Award notices, communications, and AI-powered follow-up</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNotifications(!showNotifications)} className="relative flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            <Bell size={14} />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{notifications.length}</span>
            )}
          </button>
          <button onClick={() => { loadItems(); loadStats(); }} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800">
            <Plus size={14} /> Log Correspondence
          </button>
        </div>
      </div>

      {/* Notifications Dropdown */}
      {showNotifications && notifications.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Unread Notifications</h3>
            <button onClick={handleMarkAllRead} className="text-xs text-blue-600 hover:underline">Mark all read</button>
          </div>
          {notifications.slice(0, 5).map((n) => (
            <div key={n.id} className={`flex items-start gap-2 p-2 rounded-lg text-sm ${n.priority === 'urgent' ? 'bg-red-50' : n.priority === 'high' ? 'bg-amber-50' : 'bg-gray-50'}`}>
              <Bell size={14} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-gray-800">{n.title}</p>
                <p className="text-xs text-gray-500">{n.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl border border-gray-200 bg-white">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="p-3 rounded-xl border border-green-200 bg-green-50">
            <p className="text-xs text-green-600">Awards</p>
            <p className="text-xl font-bold text-green-700">{stats.awards}</p>
          </div>
          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50">
            <p className="text-xs text-amber-600">Action Required</p>
            <p className="text-xl font-bold text-amber-700">{stats.action_required}</p>
          </div>
          <div className="p-3 rounded-xl border border-blue-200 bg-blue-50">
            <p className="text-xs text-blue-600">Unread</p>
            <p className="text-xl font-bold text-blue-700">{stats.unread}</p>
          </div>
          <div className="p-3 rounded-xl border border-gray-200 bg-white">
            <p className="text-xs text-gray-500">Responded</p>
            <p className="text-xl font-bold text-gray-700">{stats.by_status?.responded || 0}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search correspondence..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
          <option value="">All Types</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
          <option value="">All Status</option>
          <option value="new">New</option>
          <option value="read">Read</option>
          <option value="action_required">Action Required</option>
          <option value="responded">Responded</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Log Correspondence</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={createType} onChange={(e) => setCreateType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                  <input type="text" value={createSender} onChange={(e) => setCreateSender(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="Sender name/email" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject *</label>
                <input type="text" value={createSubject} onChange={(e) => setCreateSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="e.g. Contract Award: IT Services" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Body</label>
                <textarea value={createBody} onChange={(e) => setCreateBody(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" rows={4} placeholder="Paste email content..." />
              </div>
              {createType === 'award_notice' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Award Amount ($)</label>
                    <input type="number" value={createAwardAmount} onChange={(e) => setCreateAwardAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contract Number</label>
                    <input type="text" value={createContractNumber} onChange={(e) => setCreateContractNumber(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreate} disabled={creating || !createSubject}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading correspondence...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <Mail size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-sm">No correspondence yet. Log an award notice, email, or portal notification.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.general;
            const Icon = config.icon;
            const isExpanded = expandedId === item.id;

            return (
              <div key={item.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${config.color}`}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-gray-900 line-clamp-1">{item.subject}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {item.sender && `From: ${item.sender} · `}
                          {formatDate(item.received_at || item.created_at)}
                          {item.submission?.title && ` · ${item.submission.title}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>{config.label}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] || 'bg-gray-100'}`}>{item.status}</span>
                    </div>
                  </div>

                  {item.ai_summary && (
                    <p className="text-xs text-gray-500 mt-2 ml-12">{item.ai_summary}</p>
                  )}

                  {item.type === 'award_notice' && item.award_amount && (
                    <div className="mt-2 ml-12 flex items-center gap-4 text-xs">
                      <span className="px-2 py-1 bg-green-50 text-green-700 rounded-lg font-medium">
                        ${item.award_amount.toLocaleString()}
                      </span>
                      {item.contract_number && <span className="text-gray-500">Contract: {item.contract_number}</span>}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 mt-3 ml-12">
                    <button onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {isExpanded ? 'Less' : 'More'}
                    </button>
                    <button onClick={() => handleAIAnalyze(item.id)} disabled={analyzing === item.id}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-purple-600 border border-purple-200 rounded-lg hover:bg-purple-50 disabled:opacity-50">
                      {analyzing === item.id ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                      AI Analyze
                    </button>
                    <button onClick={() => { setRespondingTo(respondingTo === item.id ? null : item.id); setResponseNotes(''); }}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
                      <Send size={12} /> Respond
                    </button>
                    <button onClick={() => handleArchive(item.id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50">
                      <Archive size={12} /> Archive
                    </button>
                  </div>
                </div>

                {/* Response input */}
                {respondingTo === item.id && (
                  <div className="border-t border-gray-100 p-4 bg-blue-50/30">
                    <div className="flex gap-2">
                      <input type="text" value={responseNotes} onChange={(e) => setResponseNotes(e.target.value)}
                        placeholder="Record your response or action taken..."
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" />
                      <button onClick={() => handleRespond(item.id)} disabled={!responseNotes.trim()}
                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded view */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50">
                    {item.body && (
                      <div className="mb-3">
                        <h4 className="text-xs font-semibold text-gray-600 mb-1">Content</h4>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.body}</p>
                      </div>
                    )}
                    {item.ai_suggested_actions && (
                      <div className="mb-3">
                        <h4 className="text-xs font-semibold text-gray-600 mb-1">AI Suggested Actions</h4>
                        <ul className="space-y-1">
                          {(Array.isArray(item.ai_suggested_actions) ? item.ai_suggested_actions : []).map((action: string, i: number) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                              <span className="h-4 w-4 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {item.response_notes && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-600 mb-1">Your Response</h4>
                        <p className="text-xs text-gray-600 bg-white p-2 rounded-lg border border-gray-100">{item.response_notes}</p>
                        <p className="text-[10px] text-gray-400 mt-1">Responded {formatDate(item.responded_at)}</p>
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

export default Correspondence;
