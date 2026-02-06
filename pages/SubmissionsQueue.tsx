import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Download, MoreHorizontal, Building2, Calendar, User, Loader2
} from 'lucide-react';
import { api } from '../lib/api';

type SubmissionRow = {
  id: string;
  title: string;
  opportunityRef: string;
  agency: string;
  status: string;
  approvalStatus: string;
  progress: number;
  dueDate: string;
  assignee: string;
  value?: number | null;
};

const SubmissionsQueue: React.FC = () => {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (value?: number | null) => {
    if (!value) return 'TBD';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value || 'TBD';
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const progressForStatus = (status: string) => {
    switch (status) {
      case 'draft':
        return 20;
      case 'pending_approval':
        return 60;
      case 'approved':
        return 80;
      case 'submitted':
        return 100;
      case 'rejected':
        return 0;
      default:
        return 40;
    }
  };

  const formatStatus = (status: string) =>
    status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const loadSubmissions = async () => {
    setIsLoading(true);
    setError(null);
    const response = await api.getSubmissions({ page: 1, limit: 100 });
    if (response.error) {
      setError(response.error);
      setSubmissions([]);
      setIsLoading(false);
      return;
    }

    const list = response.data?.data ?? [];
    const mapped = list.map((sub: any) => ({
      id: sub.id,
      title: sub.title ?? 'Untitled Submission',
      opportunityRef: sub.opportunity?.external_ref ?? sub.opportunity?.id ?? 'N/A',
      agency: sub.opportunity?.agency ?? 'Unknown Agency',
      status: sub.status ?? 'draft',
      approvalStatus: sub.approval_status ?? 'pending',
      progress: progressForStatus(sub.status ?? 'draft'),
      dueDate: sub.due_date ?? 'TBD',
      assignee: sub.owner?.full_name ?? sub.owner?.email ?? 'Unassigned',
      value: sub.estimated_value ?? null,
    }));

    setSubmissions(mapped);
    setIsLoading(false);
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      const matchesSearch =
        sub.title.toLowerCase().includes(search.toLowerCase()) ||
        sub.opportunityRef.toLowerCase().includes(search.toLowerCase()) ||
        sub.agency.toLowerCase().includes(search.toLowerCase());

      const matchesFilter = filter === 'all' || sub.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [submissions, search, filter]);

  const getStatusStyle = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      pending_approval: 'bg-amber-100 text-amber-700',
      approved: 'bg-blue-100 text-blue-700',
      submitted: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return styles[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Opportunities In Pursuit</h1>
            <p className="text-sm text-gray-500 mt-1">{submissions.length} active submissions</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(filteredSubmissions, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `submissions_${new Date().toISOString().slice(0, 10)}.json`;
                link.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search submissions..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="submitted">Submitted</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading submissions...
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            No submissions yet. Create one from the dashboard.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSubmissions.map((sub) => (
              <div
                key={sub.id}
                className="p-4 border border-gray-100 rounded-xl hover:border-gray-200 transition-all cursor-pointer"
                onClick={() => navigate(`/workspace/${sub.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusStyle(sub.status)}`}>
                        {formatStatus(sub.status)}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{sub.id}</span>
                    </div>
                    <h3 className="font-medium text-gray-900 truncate">{sub.title}</h3>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                      <Building2 size={14} />
                      {sub.agency} - {sub.opportunityRef}
                    </p>
                  </div>
                  <button className="p-1.5 hover:bg-gray-100 rounded-lg" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal size={16} className="text-gray-400" />
                  </button>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Progress</span>
                    <span className="font-medium text-gray-700">{sub.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${sub.progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${sub.progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      Due {formatDate(sub.dueDate)}
                    </span>
                    <span className="flex items-center gap-1">
                      <User size={12} />
                      {sub.assignee}
                    </span>
                  </div>
                  <span className="font-medium text-gray-700">{formatCurrency(sub.value)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubmissionsQueue;

