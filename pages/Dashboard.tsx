import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, Copy, ExternalLink, FileText, Loader2, Newspaper, RotateCw, Search, Sparkles, X, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import NewsFeed from '../components/NewsFeed';
import {
  type OpportunityRecord,
  type OpportunityStatus,
  daysUntil,
  extractContractMetadata,
  extractLinks,
  formatCurrency,
  formatDate,
  formatStatus,
  getOpportunityCategory,
  getPrimaryLink,
  getSamNoticeUrl,
  getSamSearchUrl,
  getSourceBadgeClass,
  getStatusBadgeClass,
  isRecord,
} from '../lib/dashboard';

type Notice = { kind: 'error' | 'success' | 'info'; message: string } | null;

type ColumnKey = 'source' | 'category' | 'naics' | 'set_aside' | 'notice_type' | 'psc' | 'value';

const COLUMN_LABELS: Record<ColumnKey, string> = {
  source: 'Source',
  category: 'Category',
  naics: 'NAICS',
  set_aside: 'Set-aside',
  notice_type: 'Notice type',
  psc: 'PSC',
  value: 'Value',
};

const LOCAL_STORAGE_COLUMNS_KEY = 'procura.dashboard.columns.v1';

const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  source: true,
  category: true,
  naics: true,
  set_aside: false,
  notice_type: false,
  psc: false,
  value: true,
};

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }

    // Safari fallback
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(onChange);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [opportunities, setOpportunities] = useState<OpportunityRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OpportunityStatus>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [naicsPrefix, setNaicsPrefix] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [minFitScore, setMinFitScore] = useState<number | 'any'>('any');
  const [dueSoonOnly, setDueSoonOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'due' | 'fit' | 'posted'>('posted');
  const [noticeTypeFilter, setNoticeTypeFilter] = useState<'all' | string>('all');
  const [pscPrefix, setPscPrefix] = useState('');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');

  const [columns, setColumns] = useState<Record<ColumnKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_COLUMNS_KEY);
      if (!raw) return DEFAULT_COLUMNS;
      const parsed = JSON.parse(raw);
      if (!isRecord(parsed)) return DEFAULT_COLUMNS;
      return { ...DEFAULT_COLUMNS, ...(parsed as any) };
    } catch {
      return DEFAULT_COLUMNS;
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isQualifying, setIsQualifying] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const [syncUntilMs, setSyncUntilMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [newsFeedOpen, setNewsFeedOpen] = useState(true);

  useEffect(() => {
    if (!syncUntilMs) return;
    if (syncUntilMs <= Date.now()) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [syncUntilMs]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_COLUMNS_KEY, JSON.stringify(columns));
    } catch {
      // Ignore storage errors (private mode, quota, etc.)
    }
  }, [columns]);

  const syncRemainingSeconds = useMemo(() => {
    if (!syncUntilMs) return 0;
    const remainingMs = Math.max(0, syncUntilMs - nowMs);
    return Math.ceil(remainingMs / 1000);
  }, [syncUntilMs, nowMs]);

  const filteredOpportunities = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const naicsNeedle = naicsPrefix.trim();
    const companyNeedle = companyFilter.trim().toLowerCase();
    const pscNeedle = pscPrefix.trim().toLowerCase();

    const parseNumber = (s: string) => {
      if (!s.trim()) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    const minValue = parseNumber(valueMin);
    const maxValue = parseNumber(valueMax);

    const base = opportunities.filter((opp) => {
      const matchesSearch =
        !needle ||
        opp.title.toLowerCase().includes(needle) ||
        opp.agency.toLowerCase().includes(needle) ||
        opp.external_ref.toLowerCase().includes(needle);
      if (!matchesSearch) return false;

      if (statusFilter !== 'all' && (opp.status ?? 'new') !== statusFilter) return false;
      if (sourceFilter !== 'all' && (opp.source ?? '').toLowerCase() !== sourceFilter.toLowerCase()) return false;

      if (minFitScore !== 'any') {
        const score = opp.fit_score ?? null;
        if (score === null) return false;
        if (score < minFitScore) return false;
      }

      if (dueSoonOnly) {
        const d = daysUntil(opp.due_date);
        if (d === null || d > 7) return false;
      }

      if (naicsNeedle) {
        const n = (opp.naics_code ?? '').toString();
        if (!n.startsWith(naicsNeedle)) return false;
      }

      const category = getOpportunityCategory(opp);
      if (categoryFilter !== 'all' && category !== categoryFilter) return false;

      if (noticeTypeFilter !== 'all') {
        const meta = extractContractMetadata(opp);
        if ((meta.noticeType ?? '').toLowerCase() !== noticeTypeFilter.toLowerCase()) return false;
      }

      if (pscNeedle) {
        const meta = extractContractMetadata(opp);
        const p = (meta.psc ?? '').toLowerCase();
        if (!p.startsWith(pscNeedle)) return false;
      }

      if (companyNeedle) {
        const meta = extractContractMetadata(opp);
        const company = (meta.company ?? '').toLowerCase();
        if (!company.includes(companyNeedle)) return false;
      }

      if (minValue !== null || maxValue !== null) {
        const raw = opp.estimated_value;
        const v = raw === null || raw === undefined || raw === '' ? null : (typeof raw === 'number' ? raw : Number(raw));
        if (!Number.isFinite(v as any)) return false;
        if (minValue !== null && (v as number) < minValue) return false;
        if (maxValue !== null && (v as number) > maxValue) return false;
      }

      return true;
    });

    const sorted = [...base].sort((a, b) => {
      if (sortBy === 'fit') {
        const as = a.fit_score ?? -1;
        const bs = b.fit_score ?? -1;
        return bs - as;
      }
      if (sortBy === 'posted') {
        return (b.posted_date ?? '').localeCompare(a.posted_date ?? '');
      }
      return (a.due_date ?? '').localeCompare(b.due_date ?? '');
    });

    return sorted;
  }, [
    opportunities,
    search,
    statusFilter,
    sourceFilter,
    categoryFilter,
    naicsPrefix,
    companyFilter,
    minFitScore,
    dueSoonOnly,
    sortBy,
    noticeTypeFilter,
    pscPrefix,
    valueMin,
    valueMax,
  ]);

  const selectedOpportunity = useMemo(
    () => opportunities.find((o) => o.id === selectedId) ?? null,
    [opportunities, selectedId]
  );

  const uniqueSources = useMemo(() => {
    const set = new Set(opportunities.map((o) => (o.source ?? '').toLowerCase()).filter(Boolean));
    return Array.from(set).sort();
  }, [opportunities]);

  const uniqueCategories = useMemo(() => {
    const set = new Set(opportunities.map((o) => getOpportunityCategory(o)));
    return Array.from(set).sort();
  }, [opportunities]);

  const uniqueNoticeTypes = useMemo(() => {
    const set = new Set<string>();
    for (const opp of opportunities) {
      const meta = extractContractMetadata(opp);
      if (meta.noticeType) set.add(meta.noticeType);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [opportunities]);

  const loadOpportunities = async () => {
    setIsLoading(true);
    setNotice(null);
    const response = await api.getOpportunities({ page: 1, limit: 100 });
    if (response.error) {
      setNotice({ kind: 'error', message: response.error });
      setOpportunities([]);
      setSelectedId(null);
      setIsLoading(false);
      return;
    }

    const list = (response.data as any)?.data ?? [];
    setOpportunities(list);
    setSelectedIds(new Set());
    setIsLoading(false);
  };

  useEffect(() => {
    loadOpportunities();
  }, []);

  // Auto-select first opportunity on desktop load
  useEffect(() => {
    if (isDesktop && !selectedId && filteredOpportunities.length > 0) {
      setSelectedId(filteredOpportunities[0].id);
    }
  }, [isDesktop, filteredOpportunities]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDesktop) {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDesktop]);


  const handleSync = async () => {
    if (isSyncing) return;
    if (syncRemainingSeconds > 0) return;

    setIsSyncing(true);
    setNotice({ kind: 'info', message: 'Sync started. This may take a few seconds...' });
    setSyncUntilMs(Date.now() + 30_000);

    const response = await api.triggerSync();
    if (response.error) {
      setNotice({ kind: 'error', message: response.error });
      setIsSyncing(false);
      return;
    }

    setNotice({ kind: 'success', message: (response.data as any)?.message ?? 'Sync completed.' });
    await loadOpportunities();
    setIsSyncing(false);
  };

  const handleQualify = async (opp: OpportunityRecord) => {
    if (isQualifying) return;
    setIsQualifying(true);
    setNotice(null);

    const response = await api.qualifyOpportunity(opp.id);
    if (response.error || !response.data) {
      setNotice({ kind: 'error', message: response.error || 'Qualification failed.' });
      setIsQualifying(false);
      return;
    }

    const updated = response.data as OpportunityRecord;
    setOpportunities((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setNotice({ kind: 'success', message: 'AI qualification updated.' });
    setIsQualifying(false);
  };

  const handleDisqualify = async (opp: OpportunityRecord) => {
    const reason = window.prompt('Disqualify reason (optional):') ?? undefined;
    const response = await api.disqualifyOpportunity(opp.id, reason);
    if (response.error || !response.data) {
      setNotice({ kind: 'error', message: response.error || 'Failed to disqualify.' });
      return;
    }
    const updated = response.data as OpportunityRecord;
    setOpportunities((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setNotice({ kind: 'success', message: 'Opportunity disqualified.' });
  };

  const handleCreateWorkspace = async (opp: OpportunityRecord) => {
    if (isCreatingWorkspace) return;
    setIsCreatingWorkspace(true);
    setNotice(null);

    const links = extractLinks(opp);
    const portal = links.samUrl ? 'SAM.gov' : (opp.source ?? 'unknown');
    const notesParts = [
      `source=${opp.source}`,
      `external_ref=${opp.external_ref}`,
      links.samUrl ? `sam_url=${links.samUrl}` : null,
      links.descriptionUrl ? `description_url=${links.descriptionUrl}` : null,
    ].filter(Boolean);

    const response = await api.createSubmission({
      opportunity_id: opp.id,
      portal,
      due_date: opp.due_date,
      title: opp.title,
      notes: notesParts.join('\\n'),
    });

    if (response.error || !response.data) {
      setNotice({ kind: 'error', message: response.error || 'Failed to create workspace.' });
      setIsCreatingWorkspace(false);
      return;
    }

    const submissionId = (response.data as any)?.id as string | undefined;
    if (!submissionId) {
      setNotice({ kind: 'error', message: 'Workspace created, but no submission id returned.' });
      setIsCreatingWorkspace(false);
      return;
    }

    setNotice({ kind: 'success', message: 'Workspace created.' });
    setIsCreatingWorkspace(false);
    navigate(`/workspace/${submissionId}`);
  };

  const toggleColumn = (key: ColumnKey) => {
    setColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice({ kind: 'success', message: 'Copied to clipboard.' });
    } catch {
      setNotice({ kind: 'error', message: 'Copy failed. (Browser blocked clipboard access)' });
    }
  };

  const openExternal = (url: string) => {
    // Window.open is intentional here: the user wants direct links to the source system.
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      if (filteredOpportunities.length === 0) return new Set();
      if (prev.size === filteredOpportunities.length) return new Set();
      return new Set(filteredOpportunities.map((o) => o.id));
    });
  };

  const runWithConcurrency = async <T,>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<void>) => {
    const concurrency = Math.max(1, Math.min(limit, 10));
    let cursor = 0;

    const workers = new Array(concurrency).fill(0).map(async () => {
      // Simple shared-cursor worker pool.
      while (cursor < items.length) {
        const idx = cursor;
        cursor += 1;
        await fn(items[idx], idx);
      }
    });

    await Promise.all(workers);
  };

  const bulkQualify = async () => {
    if (isBulkRunning) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsBulkRunning(true);
    setNotice({ kind: 'info', message: `Qualifying ${ids.length} opportunities...` });

    let ok = 0;
    let failed = 0;

    await runWithConcurrency(ids, 2, async (id: string) => {
      const res = await api.qualifyOpportunity(id);
      if (res.error || !res.data) {
        failed += 1;
        return;
      }
      const updated = res.data as OpportunityRecord;
      ok += 1;
      setOpportunities((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    });

    setNotice({ kind: failed ? 'error' : 'success', message: `Bulk qualify done. OK: ${ok}, failed: ${failed}` });
    setIsBulkRunning(false);
  };

  const bulkDisqualify = async () => {
    if (isBulkRunning) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const reason = window.prompt('Disqualify reason for all selected (optional):') ?? undefined;

    setIsBulkRunning(true);
    setNotice({ kind: 'info', message: `Disqualifying ${ids.length} opportunities...` });

    let ok = 0;
    let failed = 0;

    await runWithConcurrency(ids, 3, async (id: string) => {
      const res = await api.disqualifyOpportunity(id, reason);
      if (res.error || !res.data) {
        failed += 1;
        return;
      }
      const updated = res.data as OpportunityRecord;
      ok += 1;
      setOpportunities((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    });

    setNotice({ kind: failed ? 'error' : 'success', message: `Bulk disqualify done. OK: ${ok}, failed: ${failed}` });
    setIsBulkRunning(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      <div className="flex-1 flex min-h-0">
        {isDesktop ? (
          /* Desktop: Side-by-side grid layout */
          <>
            {/* Left: Opportunity list */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-gray-100">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold text-gray-900">Opportunity Inbox</h1>
                    <p className="text-sm text-gray-500 mt-1">
                      {filteredOpportunities.length} shown &middot; {opportunities.length} total
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleSync}
                      disabled={isSyncing || syncRemainingSeconds > 0}
                      className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60"
                      title="Fetch latest opportunities from SAM.gov and other sources"
                    >
                      {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
                      {syncRemainingSeconds > 0 ? `Sync (${syncRemainingSeconds}s)` : isSyncing ? 'Syncing...' : 'Sync Opportunities'}
                    </button>

                    <button
                      onClick={loadOpportunities}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-60"
                      title="Reload the current opportunity list"
                    >
                      {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
                      Refresh List
                    </button>
                  </div>
                </div>

                {notice && (
                  <div
                    className={`mt-4 px-4 py-3 rounded-lg border text-sm ${notice.kind === 'error'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : notice.kind === 'success'
                        ? 'bg-green-50 border-green-200 text-green-700'
                        : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                  >
                    <div className="flex items-start gap-2">
                      {notice.kind === 'error' ? <AlertTriangle size={16} className="mt-0.5" /> : null}
                      <div className="min-w-0">{notice.message}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search title, agency, or reference..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="qualified">Qualified</option>
                  <option value="disqualified">Disqualified</option>
                  <option value="submitted">Submitted</option>
                </select>

                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="all">All sources</option>
                  {uniqueSources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="all">All categories</option>
                  {uniqueCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  value={noticeTypeFilter}
                  onChange={(e) => setNoticeTypeFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="all">All notice types</option>
                  {uniqueNoticeTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <select
                  value={minFitScore}
                  onChange={(e) => setMinFitScore(e.target.value === 'any' ? 'any' : Number(e.target.value))}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="any">Any fit</option>
                  <option value="70">70+</option>
                  <option value="80">80+</option>
                  <option value="90">90+</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="due">Sort: Due</option>
                  <option value="fit">Sort: Fit</option>
                  <option value="posted">Sort: Posted</option>
                </select>

                <input
                  value={naicsPrefix}
                  onChange={(e) => setNaicsPrefix(e.target.value)}
                  placeholder="NAICS prefix..."
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-[140px]"
                />

                <input
                  value={pscPrefix}
                  onChange={(e) => setPscPrefix(e.target.value)}
                  placeholder="PSC prefix..."
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-[120px]"
                />

                <input
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  placeholder="Company..."
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-[180px]"
                />

                <input
                  value={valueMin}
                  onChange={(e) => setValueMin(e.target.value)}
                  placeholder="Min $..."
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-[120px]"
                />

                <input
                  value={valueMax}
                  onChange={(e) => setValueMax(e.target.value)}
                  placeholder="Max $..."
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-[120px]"
                />

                <label className="flex items-center gap-2 text-sm text-gray-700 px-2">
                  <input type="checkbox" checked={dueSoonOnly} onChange={(e) => setDueSoonOnly(e.target.checked)} />
                  Due &lt; 7d
                </label>

                <details className="relative">
                  <summary className="list-none cursor-pointer select-none px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Columns
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Visible columns</div>
                    {Object.keys(COLUMN_LABELS).map((key) => {
                      const k = key as ColumnKey;
                      return (
                        <label key={k} className="flex items-center justify-between gap-3 py-1 text-sm text-gray-700">
                          <span>{COLUMN_LABELS[k]}</span>
                          <input type="checkbox" checked={!!columns[k]} onChange={() => toggleColumn(k)} />
                        </label>
                      );
                    })}
                  </div>
                </details>
              </div>

              <div className="flex-1 overflow-x-auto overflow-y-auto">
                {selectedIds.size > 0 && (
                  <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center justify-between gap-3 sticky left-0 z-20">
                    <div className="text-sm text-gray-700">
                      <span className="font-semibold">{selectedIds.size}</span> selected
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        disabled={isBulkRunning}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Clear
                      </button>
                      <button
                        onClick={bulkQualify}
                        disabled={isBulkRunning}
                        className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
                      >
                        {isBulkRunning ? 'Working...' : 'Bulk Qualify (AI)'}
                      </button>
                      <button
                        onClick={bulkDisqualify}
                        disabled={isBulkRunning}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Bulk Disqualify
                      </button>
                    </div>
                  </div>
                )}

                {isLoading ? (
                  <div className="px-6 py-10 text-gray-500 flex items-center">
                    <Loader2 size={18} className="animate-spin mr-2" /> Loading opportunities...
                  </div>
                ) : filteredOpportunities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                    <Search size={64} className="text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No opportunities found</h3>
                    <p className="text-sm text-gray-500 mb-6 max-w-md">
                      {opportunities.length === 0
                        ? "Click \"Sync Opportunities\" to fetch the latest from SAM.gov and other sources"
                        : "Try adjusting your filters or search terms"
                      }
                    </p>
                    {opportunities.length === 0 && (
                      <button
                        onClick={handleSync}
                        disabled={isSyncing || syncRemainingSeconds > 0}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-60"
                      >
                        {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
                        {syncRemainingSeconds > 0 ? `Wait ${syncRemainingSeconds}s` : isSyncing ? 'Syncing...' : 'Sync Opportunities'}
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-left table-fixed border-collapse">
                    <thead className="bg-white sticky top-0 z-10 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={filteredOpportunities.length > 0 && selectedIds.size === filteredOpportunities.length}
                            onChange={toggleSelectAllFiltered}
                          />
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Ref</th>
                        <th className="px-2 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-12 text-center">Open</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-64">Title</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-64">Agency</th>
                        {columns.source && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Source</th>}
                        {columns.category && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Category</th>}
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Due</th>
                        {columns.naics && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">NAICS</th>}
                        {columns.set_aside && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Set-aside</th>}
                        {columns.notice_type && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Type</th>}
                        {columns.psc && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">PSC</th>}
                        {columns.value && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Value</th>}
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Fit</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredOpportunities.map((opp) => {
                        const meta = extractContractMetadata(opp);
                        const category = getOpportunityCategory(opp);
                        const links = extractLinks(opp);
                        const primaryLink = getPrimaryLink(opp);

                        return (
                          <tr
                            key={opp.id}
                            onClick={() => setSelectedId(opp.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedId(opp.id);
                              }
                            }}
                            tabIndex={0}
                            className={`cursor-pointer hover:bg-gray-50 transition-colors ${selectedId === opp.id ? 'bg-gray-50 border-l-4 border-l-gray-900' : 'border-l-4 border-l-transparent'}`}
                          >
                            <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={selectedIds.has(opp.id)} onChange={() => toggleSelected(opp.id)} />
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-gray-600">{opp.external_ref}</td>
                            <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => openExternal(getSamNoticeUrl(opp))}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                title="Open notice in SAM.gov"
                              >
                                <ExternalLink size={16} />
                              </button>
                            </td>
                            <td className="px-6 py-4 font-medium text-gray-900 truncate max-w-[360px]">{opp.title}</td>
                            <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-[220px]">{opp.agency}</td>
                            {columns.source && (
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getSourceBadgeClass(opp.source)}`}>
                                  {opp.source}
                                </span>
                              </td>
                            )}
                            {columns.category && <td className="px-6 py-4 text-sm text-gray-700">{category}</td>}
                            <td className="px-6 py-4 font-mono text-xs text-gray-600">
                              <div className="flex items-center gap-2">
                                <span>{formatDate(opp.due_date)}</span>
                                {meta.dueDateMissing ? (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                    assumed
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            {columns.naics && <td className="px-6 py-4 font-mono text-xs text-gray-600">{opp.naics_code ?? '---'}</td>}
                            {columns.set_aside && <td className="px-6 py-4 text-sm text-gray-600">{opp.set_aside ?? '---'}</td>}
                            {columns.notice_type && <td className="px-6 py-4 text-sm text-gray-600">{meta.noticeType ?? '---'}</td>}
                            {columns.psc && <td className="px-6 py-4 font-mono text-xs text-gray-600">{meta.psc ?? '---'}</td>}
                            {columns.value && <td className="px-6 py-4 text-sm text-gray-700">{formatCurrency(opp.estimated_value ?? null)}</td>}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-gray-900">{opp.fit_score ?? '---'}</span>
                                <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-gray-900" style={{ width: `${Math.max(0, Math.min(100, opp.fit_score ?? 0))}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadgeClass(opp.status)}`}>
                                {formatStatus(opp.status)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Right: Detail panel (desktop permanent, mobile modal) */}
            {selectedOpportunity ? (
              <div className="w-[400px] shrink-0 bg-white border-l border-gray-100 flex flex-col">
                <div className="p-6 border-b border-gray-100">
                  <div className="min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-xs font-mono text-gray-600">{selectedOpportunity.external_ref}</span>
                      <button
                        onClick={() => copyToClipboard(selectedOpportunity.external_ref)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
                        title="Copy reference"
                      >
                        <Copy size={14} /> Copy
                      </button>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadgeClass(selectedOpportunity.status)}`}>
                        {formatStatus(selectedOpportunity.status)}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getSourceBadgeClass(selectedOpportunity.source)}`}>
                        {selectedOpportunity.source}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 leading-tight truncate">{selectedOpportunity.title}</h2>
                    <p className="text-sm text-gray-500 mt-1 truncate">{selectedOpportunity.agency}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {(() => {
                    const meta = extractContractMetadata(selectedOpportunity);
                    const links = extractLinks(selectedOpportunity);
                    const category = getOpportunityCategory(selectedOpportunity);
                    const dueInDays = daysUntil(selectedOpportunity.due_date);
                    const primaryLink = getPrimaryLink(selectedOpportunity);
                    const samSearchUrl = getSamSearchUrl(selectedOpportunity);

                    return (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => openExternal(getSamNoticeUrl(selectedOpportunity))}
                            className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60"
                            title="Open original notice in SAM.gov"
                          >
                            <ExternalLink size={16} />
                            Open Source
                          </button>
                          <button
                            onClick={() => handleQualify(selectedOpportunity)}
                            disabled={isQualifying}
                            className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-60"
                            title="Score this opportunity using AI (fit, effort, urgency)"
                          >
                            {isQualifying ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            AI Qualify
                          </button>
                        </div>

                        <button
                          onClick={() => handleCreateWorkspace(selectedOpportunity)}
                          disabled={isCreatingWorkspace}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60"
                          title="Create submission workspace to start building your proposal"
                        >
                          {isCreatingWorkspace ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                          Start Proposal
                        </button>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Due date</span>
                            <div className="mt-1 flex items-center gap-2">
                              <p className="font-mono text-sm text-gray-900">{formatDate(selectedOpportunity.due_date)}</p>
                              {typeof dueInDays === 'number' ? (
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full border ${dueInDays <= 7 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                                    }`}
                                >
                                  {dueInDays >= 0 ? `${dueInDays}d` : 'past'}
                                </span>
                              ) : null}
                            </div>
                            {meta.dueDateMissing ? (
                              <p className="text-xs text-amber-700 mt-1">
                                Due date not provided by source. Assumed: <span className="font-mono">{formatDate(meta.dueDateAssumed)}</span>
                              </p>
                            ) : null}
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Posted</span>
                            <p className="font-mono text-sm text-gray-900 mt-1">{formatDate(selectedOpportunity.posted_date)}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Category</span>
                            <p className="text-sm text-gray-900 mt-1">{category}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Fit score</span>
                            <p className="font-mono text-sm text-gray-900 mt-1">{selectedOpportunity.fit_score ?? '---'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Effort</span>
                            <p className="font-mono text-sm text-gray-900 mt-1">{selectedOpportunity.effort_score ?? '---'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Urgency</span>
                            <p className="font-mono text-sm text-gray-900 mt-1">{selectedOpportunity.urgency_score ?? '---'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">NAICS</span>
                            <p className="font-mono text-sm text-gray-900 mt-1">{selectedOpportunity.naics_code ?? '---'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Value</span>
                            <p className="text-sm text-gray-900 mt-1">{formatCurrency(selectedOpportunity.estimated_value ?? null)}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Notice type</span>
                            <p className="text-sm text-gray-900 mt-1">{meta.noticeType ?? '---'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">PSC</span>
                            <p className="font-mono text-sm text-gray-900 mt-1">{meta.psc ?? '---'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Set-aside</span>
                            <p className="text-sm text-gray-900 mt-1">{selectedOpportunity.set_aside ?? '---'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Company</span>
                            <p className="text-sm text-gray-900 mt-1">{meta.company ?? '---'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Place</span>
                            <p className="text-sm text-gray-900 mt-1">{meta.place ?? '---'}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-medium">Last updated</span>
                            <p className="font-mono text-xs text-gray-700 mt-1">{formatDate(selectedOpportunity.updated_at ?? null)}</p>
                          </div>
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Source links</p>
                          <p className="text-xs text-gray-500 mt-1">Open the original notice and artifacts.</p>

                          <div className="mt-3 space-y-2">
                            <a
                              href={samSearchUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <span className="truncate">Search in SAM.gov</span>
                              <ExternalLink size={16} />
                            </a>
                            {links.samUrl ? (
                              <a
                                href={links.samUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <span className="truncate">Open in SAM.gov</span>
                                <ExternalLink size={16} />
                              </a>
                            ) : null}
                            {links.descriptionUrl ? (
                              <a
                                href={links.descriptionUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <span className="truncate">View description / attachments</span>
                                <ExternalLink size={16} />
                              </a>
                            ) : null}
                            {links.resourceLinks.slice(0, 5).map((u) => (
                              <a
                                key={u}
                                href={u}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <span className="truncate">{u}</span>
                                <ExternalLink size={16} />
                              </a>
                            ))}

                            {!links.samUrl && !links.descriptionUrl && links.resourceLinks.length === 0 ? (
                              <p className="text-sm text-gray-600">No source links were provided by this connector.</p>
                            ) : null}
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            <Sparkles size={16} />
                            AI Summary
                          </h3>
                          <div className="mt-2 bg-white border border-gray-200 rounded-lg p-4 text-sm leading-relaxed text-gray-700">
                            {selectedOpportunity.ai_summary ? selectedOpportunity.ai_summary : 'No AI summary yet. Click "Qualify (AI)".'}
                          </div>
                          {selectedOpportunity.status === 'disqualified' && selectedOpportunity.disqualified_reason ? (
                            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                              <div className="font-semibold">Disqualified reason</div>
                              <div className="mt-1 whitespace-pre-wrap">{selectedOpportunity.disqualified_reason}</div>
                            </div>
                          ) : null}
                        </div>

                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">Description</h3>
                          <div className="mt-2 bg-white border border-gray-200 rounded-lg p-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                            {selectedOpportunity.description ? selectedOpportunity.description : 'No description available.'}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 space-y-3">
                  <button
                    onClick={() => handleDisqualify(selectedOpportunity)}
                    className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
                    title="Mark this opportunity as not suitable (optional reason)"
                  >
                    <XCircle size={18} /> Disqualify Opportunity
                  </button>
                </div>
              </div>
            ) : (
              /* Empty state when no opportunity selected */
              <div className="w-[400px] shrink-0 bg-white border-l border-gray-100 flex flex-col items-center justify-center p-8 text-center">
                <FileText size={64} className="text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select an opportunity</h3>
                <p className="text-sm text-gray-500 max-w-xs">
                  Click on any opportunity from the list to view details, scores, and full description
                </p>
              </div>
            )}
          </>
        ) : (
          /* Mobile: Full-width list + modal drawer */
          <>
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold text-gray-900">Opportunity Inbox</h1>
                    <p className="text-sm text-gray-500 mt-1">
                      {filteredOpportunities.length} shown &middot; {opportunities.length} total
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleSync}
                      disabled={isSyncing || syncRemainingSeconds > 0}
                      className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60"
                      title="Fetch latest opportunities from SAM.gov and other sources"
                    >
                      {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
                      {syncRemainingSeconds > 0 ? `Sync (${syncRemainingSeconds}s)` : isSyncing ? 'Syncing...' : 'Sync Opportunities'}
                    </button>

                    <button
                      onClick={loadOpportunities}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-60"
                      title="Reload the current opportunity list"
                    >
                      {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
                      Refresh List
                    </button>
                  </div>
                </div>

                {notice && (
                  <div
                    className={`mt-4 px-4 py-3 rounded-lg border text-sm ${notice.kind === 'error'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : notice.kind === 'success'
                        ? 'bg-green-50 border-green-200 text-green-700'
                        : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                  >
                    <div className="flex items-start gap-2">
                      {notice.kind === 'error' ? <AlertTriangle size={16} className="mt-0.5" /> : null}
                      <div className="min-w-0">{notice.message}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search title, agency, or reference..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="qualified">Qualified</option>
                  <option value="disqualified">Disqualified</option>
                  <option value="submitted">Submitted</option>
                </select>

                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="all">All sources</option>
                  {uniqueSources.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="all">All categories</option>
                  {uniqueCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  value={noticeTypeFilter}
                  onChange={(e) => setNoticeTypeFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="all">All notice types</option>
                  {uniqueNoticeTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <select
                  value={minFitScore}
                  onChange={(e) => setMinFitScore(e.target.value === 'any' ? 'any' : Number(e.target.value))}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="any">Any fit</option>
                  <option value="70">70+</option>
                  <option value="80">80+</option>
                  <option value="90">90+</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                >
                  <option value="due">Sort: Due</option>
                  <option value="fit">Sort: Fit</option>
                  <option value="posted">Sort: Posted</option>
                </select>

                <input
                  value={naicsPrefix}
                  onChange={(e) => setNaicsPrefix(e.target.value)}
                  placeholder="NAICS prefix..."
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-[140px]"
                />

                <input
                  value={pscPrefix}
                  onChange={(e) => setPscPrefix(e.target.value)}
                  placeholder="PSC prefix..."
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-[120px]"
                />

                <input
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
                  placeholder="Company..."
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-[180px]"
                />

                <input
                  value={valueMin}
                  onChange={(e) => setValueMin(e.target.value)}
                  placeholder="Min $..."
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-[120px]"
                />

                <input
                  value={valueMax}
                  onChange={(e) => setValueMax(e.target.value)}
                  placeholder="Max $..."
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm w-[120px]"
                />

                <label className="flex items-center gap-2 text-sm text-gray-700 px-2">
                  <input type="checkbox" checked={dueSoonOnly} onChange={(e) => setDueSoonOnly(e.target.checked)} />
                  Due &lt; 7d
                </label>

                <details className="relative">
                  <summary className="list-none cursor-pointer select-none px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Columns
                  </summary>
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Visible columns</div>
                    {Object.keys(COLUMN_LABELS).map((key) => {
                      const k = key as ColumnKey;
                      return (
                        <label key={k} className="flex items-center justify-between gap-3 py-1 text-sm text-gray-700">
                          <span>{COLUMN_LABELS[k]}</span>
                          <input type="checkbox" checked={!!columns[k]} onChange={() => toggleColumn(k)} />
                        </label>
                      );
                    })}
                  </div>
                </details>
              </div>

              <div className="flex-1 overflow-auto">
                {selectedIds.size > 0 && (
                  <div className="px-6 py-3 border-b border-gray-100 bg-white flex items-center justify-between gap-3">
                    <div className="text-sm text-gray-700">
                      <span className="font-semibold">{selectedIds.size}</span> selected
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        disabled={isBulkRunning}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Clear
                      </button>
                      <button
                        onClick={bulkQualify}
                        disabled={isBulkRunning}
                        className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
                      >
                        {isBulkRunning ? 'Working...' : 'Bulk Qualify (AI)'}
                      </button>
                      <button
                        onClick={bulkDisqualify}
                        disabled={isBulkRunning}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Bulk Disqualify
                      </button>
                    </div>
                  </div>
                )}

                {isLoading ? (
                  <div className="px-6 py-10 text-gray-500 flex items-center">
                    <Loader2 size={18} className="animate-spin mr-2" /> Loading opportunities...
                  </div>
                ) : filteredOpportunities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                    <Search size={64} className="text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No opportunities found</h3>
                    <p className="text-sm text-gray-500 mb-6 max-w-md">
                      {opportunities.length === 0
                        ? "Click \"Sync Opportunities\" to fetch the latest from SAM.gov and other sources"
                        : "Try adjusting your filters or search terms"
                      }
                    </p>
                    {opportunities.length === 0 && (
                      <button
                        onClick={handleSync}
                        disabled={isSyncing || syncRemainingSeconds > 0}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-60"
                      >
                        {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
                        {syncRemainingSeconds > 0 ? `Wait ${syncRemainingSeconds}s` : isSyncing ? 'Syncing...' : 'Sync Opportunities'}
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-white sticky top-0 z-10 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={filteredOpportunities.length > 0 && selectedIds.size === filteredOpportunities.length}
                            onChange={toggleSelectAllFiltered}
                          />
                        </th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ref</th>
                        <th className="px-2 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-10">Open</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agency</th>
                        {columns.source && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Source</th>}
                        {columns.category && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>}
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Due</th>
                        {columns.naics && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">NAICS</th>}
                        {columns.set_aside && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Set-aside</th>}
                        {columns.notice_type && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>}
                        {columns.psc && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PSC</th>}
                        {columns.value && <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Value</th>}
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fit</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredOpportunities.map((opp) => {
                        const meta = extractContractMetadata(opp);
                        const category = getOpportunityCategory(opp);
                        const links = extractLinks(opp);
                        const primaryLink = getPrimaryLink(opp);

                        return (
                          <tr
                            key={opp.id}
                            onClick={() => setSelectedId(opp.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedId(opp.id);
                              }
                            }}
                            tabIndex={0}
                            className={`cursor-pointer hover:bg-gray-50 transition-colors ${selectedId === opp.id ? 'bg-gray-50 border-l-4 border-l-gray-900' : 'border-l-4 border-l-transparent'}`}
                          >
                            <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={selectedIds.has(opp.id)} onChange={() => toggleSelected(opp.id)} />
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-gray-600">{opp.external_ref}</td>
                            <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => openExternal(getSamNoticeUrl(opp))}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                title="Open notice in SAM.gov"
                              >
                                <ExternalLink size={16} />
                              </button>
                            </td>
                            <td className="px-6 py-4 font-medium text-gray-900 truncate max-w-[360px]">{opp.title}</td>
                            <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-[220px]">{opp.agency}</td>
                            {columns.source && (
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getSourceBadgeClass(opp.source)}`}>
                                  {opp.source}
                                </span>
                              </td>
                            )}
                            {columns.category && <td className="px-6 py-4 text-sm text-gray-700">{category}</td>}
                            <td className="px-6 py-4 font-mono text-xs text-gray-600">
                              <div className="flex items-center gap-2">
                                <span>{formatDate(opp.due_date)}</span>
                                {meta.dueDateMissing ? (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                    assumed
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            {columns.naics && <td className="px-6 py-4 font-mono text-xs text-gray-600">{opp.naics_code ?? '---'}</td>}
                            {columns.set_aside && <td className="px-6 py-4 text-sm text-gray-600">{opp.set_aside ?? '---'}</td>}
                            {columns.notice_type && <td className="px-6 py-4 text-sm text-gray-600">{meta.noticeType ?? '---'}</td>}
                            {columns.psc && <td className="px-6 py-4 font-mono text-xs text-gray-600">{meta.psc ?? '---'}</td>}
                            {columns.value && <td className="px-6 py-4 text-sm text-gray-700">{formatCurrency(opp.estimated_value ?? null)}</td>}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-gray-900">{opp.fit_score ?? '---'}</span>
                                <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-gray-900" style={{ width: `${Math.max(0, Math.min(100, opp.fit_score ?? 0))}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadgeClass(opp.status)}`}>
                                {formatStatus(opp.status)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Mobile modal drawer - only show when opportunity selected */}
            {selectedOpportunity && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 bg-black/50 z-40"
                  onClick={() => setSelectedId(null)}
                />

                {/* Modal panel */}
                <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-xs font-mono text-gray-600">{selectedOpportunity.external_ref}</span>
                        <button
                          onClick={() => copyToClipboard(selectedOpportunity.external_ref)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
                          title="Copy reference"
                        >
                          <Copy size={14} /> Copy
                        </button>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadgeClass(selectedOpportunity.status)}`}>
                          {formatStatus(selectedOpportunity.status)}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getSourceBadgeClass(selectedOpportunity.source)}`}>
                          {selectedOpportunity.source}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-gray-900 leading-tight line-clamp-2">{selectedOpportunity.title}</h2>
                      <p className="text-sm text-gray-500 mt-1 truncate">{selectedOpportunity.agency}</p>
                    </div>
                    <button
                      onClick={() => setSelectedId(null)}
                      className="ml-4 p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {(() => {
                      const meta = extractContractMetadata(selectedOpportunity);
                      const links = extractLinks(selectedOpportunity);
                      const category = getOpportunityCategory(selectedOpportunity);
                      const dueInDays = daysUntil(selectedOpportunity.due_date);
                      const primaryLink = getPrimaryLink(selectedOpportunity);
                      const samSearchUrl = getSamSearchUrl(selectedOpportunity);

                      return (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={() => openExternal(getSamNoticeUrl(selectedOpportunity))}
                              className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60"
                              title="Open original notice in SAM.gov"
                            >
                              <ExternalLink size={16} />
                              Open Source
                            </button>
                            <button
                              onClick={() => handleQualify(selectedOpportunity)}
                              disabled={isQualifying}
                              className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-60"
                            >
                              {isQualifying ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                              Qualify (AI)
                            </button>
                          </div>

                          <button
                            onClick={() => handleCreateWorkspace(selectedOpportunity)}
                            disabled={isCreatingWorkspace}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60"
                          >
                            {isCreatingWorkspace ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                            Create Workspace
                          </button>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Due date</span>
                              <div className="mt-1 flex items-center gap-2">
                                <p className="font-mono text-sm text-gray-900">{formatDate(selectedOpportunity.due_date)}</p>
                                {typeof dueInDays === 'number' ? (
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded-full border ${dueInDays <= 7 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-600 border-gray-200'
                                      }`}
                                  >
                                    {dueInDays >= 0 ? `${dueInDays}d` : 'past'}
                                  </span>
                                ) : null}
                              </div>
                              {meta.dueDateMissing ? (
                                <p className="text-xs text-amber-700 mt-1">
                                  Due date not provided by source. Assumed: <span className="font-mono">{formatDate(meta.dueDateAssumed)}</span>
                                </p>
                              ) : null}
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Posted</span>
                              <p className="font-mono text-sm text-gray-900 mt-1">{formatDate(selectedOpportunity.posted_date)}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Category</span>
                              <p className="text-sm text-gray-900 mt-1">{category}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Fit score</span>
                              <p className="font-mono text-sm text-gray-900 mt-1">{selectedOpportunity.fit_score ?? '---'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Effort</span>
                              <p className="font-mono text-sm text-gray-900 mt-1">{selectedOpportunity.effort_score ?? '---'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Urgency</span>
                              <p className="font-mono text-sm text-gray-900 mt-1">{selectedOpportunity.urgency_score ?? '---'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">NAICS</span>
                              <p className="font-mono text-sm text-gray-900 mt-1">{selectedOpportunity.naics_code ?? '---'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Value</span>
                              <p className="text-sm text-gray-900 mt-1">{formatCurrency(selectedOpportunity.estimated_value ?? null)}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Notice type</span>
                              <p className="text-sm text-gray-900 mt-1">{meta.noticeType ?? '---'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">PSC</span>
                              <p className="font-mono text-sm text-gray-900 mt-1">{meta.psc ?? '---'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Set-aside</span>
                              <p className="text-sm text-gray-900 mt-1">{selectedOpportunity.set_aside ?? '---'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Company</span>
                              <p className="text-sm text-gray-900 mt-1">{meta.company ?? '---'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Place</span>
                              <p className="text-sm text-gray-900 mt-1">{meta.place ?? '---'}</p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 font-medium">Last updated</span>
                              <p className="font-mono text-xs text-gray-700 mt-1">{formatDate(selectedOpportunity.updated_at ?? null)}</p>
                            </div>
                          </div>

                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Source links</p>
                            <p className="text-xs text-gray-500 mt-1">Open the original notice and artifacts.</p>

                            <div className="mt-3 space-y-2">
                              <a
                                href={samSearchUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <span className="truncate">Search in SAM.gov</span>
                                <ExternalLink size={16} />
                              </a>
                              {links.samUrl ? (
                                <a
                                  href={links.samUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <span className="truncate">Open in SAM.gov</span>
                                  <ExternalLink size={16} />
                                </a>
                              ) : null}
                              {links.descriptionUrl ? (
                                <a
                                  href={links.descriptionUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <span className="truncate">View description / attachments</span>
                                  <ExternalLink size={16} />
                                </a>
                              ) : null}
                              {links.resourceLinks.slice(0, 5).map((u) => (
                                <a
                                  key={u}
                                  href={u}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  <span className="truncate">{u}</span>
                                  <ExternalLink size={16} />
                                </a>
                              ))}

                              {!links.samUrl && !links.descriptionUrl && links.resourceLinks.length === 0 ? (
                                <p className="text-sm text-gray-600">No source links were provided by this connector.</p>
                              ) : null}
                            </div>
                          </div>

                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                              <Sparkles size={16} />
                              AI Summary
                            </h3>
                            <div className="mt-2 bg-white border border-gray-200 rounded-lg p-4 text-sm leading-relaxed text-gray-700">
                              {selectedOpportunity.ai_summary ? selectedOpportunity.ai_summary : 'No AI summary yet. Click "Qualify (AI)".'}
                            </div>
                            {selectedOpportunity.status === 'disqualified' && selectedOpportunity.disqualified_reason ? (
                              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                                <div className="font-semibold">Disqualified reason</div>
                                <div className="mt-1 whitespace-pre-wrap">{selectedOpportunity.disqualified_reason}</div>
                              </div>
                            ) : null}
                          </div>

                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">Description</h3>
                            <div className="mt-2 bg-white border border-gray-200 rounded-lg p-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                              {selectedOpportunity.description ? selectedOpportunity.description : 'No description available.'}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-3">
                    <button
                      onClick={() => handleDisqualify(selectedOpportunity)}
                      className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
                    >
                      <XCircle size={18} /> Disqualify Opportunity
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Market Intelligence - Collapsible News Feed */}
      <div className="border-t border-gray-200 shrink-0 bg-white">
        <button
          onClick={() => setNewsFeedOpen((prev) => !prev)}
          className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Newspaper size={16} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-900">Market Intelligence</span>
          </div>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform duration-200 ${newsFeedOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {newsFeedOpen && (
          <div className="border-t border-gray-100">
            <NewsFeed />
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
