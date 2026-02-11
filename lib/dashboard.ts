export type OpportunityStatus = 'new' | 'reviewing' | 'qualified' | 'disqualified' | 'submitted' | string;

export type OpportunityRecord = {
  id: string;
  external_ref: string;
  source: string;
  title: string;
  agency: string;
  description?: string | null;
  naics_code?: string | null;
  set_aside?: string | null;
  posted_date: string;
  due_date: string;
  estimated_value?: number | string | null;
  fit_score?: number | null;
  effort_score?: number | null;
  urgency_score?: number | null;
  status?: OpportunityStatus | null;
  disqualified_reason?: string | null;
  ai_summary?: string | null;
  raw_data?: any;
  updated_at?: string | null;
};

export type OpportunityLinks = {
  samUrl: string | null;
  descriptionUrl: string | null;
  resourceLinks: string[];
};

export type OpportunityContractMeta = {
  noticeType: string | null;
  psc: string | null;
  company: string | null;
  place: string | null;
  dueDateMissing: boolean;
  dueDateAssumed: string | null;
};

export const isRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const coerceRawData = (rawData: unknown): Record<string, any> => {
  if (isRecord(rawData)) return rawData;
  if (typeof rawData === 'string') {
    try {
      const parsed = JSON.parse(rawData);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

export const formatDate = (value?: string | null) => {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatCurrency = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') return 'TBD';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 'TBD';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};

export const formatStatus = (status?: string | null) =>
  (status ?? 'new').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const daysUntil = (dateStr?: string | null) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

export const getOpportunityCategory = (opp: OpportunityRecord) => {
  const naics = (opp.naics_code ?? '').trim();
  const text = `${opp.title} ${opp.description ?? ''}`.toLowerCase();

  if (naics.startsWith('5415') || text.includes('software') || text.includes('cloud') || text.includes('cyber')) return 'IT / Software';
  if (naics.startsWith('236') || naics.startsWith('237') || naics.startsWith('238') || text.includes('construction')) return 'Construction';
  if (naics.startsWith('561') || text.includes('janitorial') || text.includes('security guard')) return 'Facilities / Ops';
  if (naics.startsWith('5413') || text.includes('engineering')) return 'Engineering';
  if (naics.startsWith('621') || text.includes('medical') || text.includes('clinical')) return 'Healthcare';

  return 'Other';
};

export const extractLinks = (opp: OpportunityRecord): OpportunityLinks => {
  const raw = coerceRawData(opp.raw_data);

  // SAM.gov API returns `uiLink` with direct notice URLs
  // Also check for noticeId to construct direct link
  let samUrl: string | null =
    raw.uiLink || raw.ui_link ||
    raw.sam_url || raw.samUrl || raw.sam_link || raw.url || null;

  // If no direct URL found but we have a noticeId, construct one
  const nid = raw.noticeId || raw.notice_id;
  if (!samUrl && nid) {
    samUrl = `https://sam.gov/opp/${nid}/view`;
  }

  const descriptionUrl = raw.description_url || raw.descriptionUrl || raw.additional_info_link || raw.additionalInfoLink || null;

  const resourcesRaw = raw.resource_links_array || raw.resourceLinks || raw.resource_links || [];
  const resourceLinks = Array.isArray(resourcesRaw)
    ? resourcesRaw
      .map((r) => (typeof r === 'string' ? r : r?.url))
      .filter((r) => typeof r === 'string' && r.startsWith('http'))
    : [];

  return {
    samUrl: typeof samUrl === 'string' ? samUrl : null,
    descriptionUrl: typeof descriptionUrl === 'string' ? descriptionUrl : null,
    resourceLinks,
  };
};

export const extractContractMetadata = (opp: OpportunityRecord): OpportunityContractMeta => {
  const raw = coerceRawData(opp.raw_data);
  const noticeType = raw.notice_type || raw.noticeType || null;
  const psc = raw.psc || null;
  const company = raw.awardee_name || raw.recipient_name || raw.vendor_name || raw.company_name || null;
  const place = raw.performance_state_name || raw.performance_city_name || raw.office_country_name || null;

  return {
    noticeType: typeof noticeType === 'string' ? noticeType : null,
    psc: typeof psc === 'string' ? psc : null,
    company: typeof company === 'string' ? company : null,
    place: typeof place === 'string' ? place : null,
    dueDateMissing: !!raw._due_date_missing,
    dueDateAssumed: typeof raw._due_date_assumed === 'string' ? raw._due_date_assumed : null,
  };
};

export const getStatusBadgeClass = (status?: OpportunityStatus | null) => {
  const s = (status ?? 'new').toLowerCase();
  const map: Record<string, string> = {
    new: 'bg-gray-100 text-gray-700 border-gray-200',
    reviewing: 'bg-amber-100 text-amber-700 border-amber-200',
    qualified: 'bg-green-100 text-green-700 border-green-200',
    disqualified: 'bg-red-100 text-red-700 border-red-200',
    submitted: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  return map[s] ?? 'bg-gray-100 text-gray-700 border-gray-200';
};

export const getSourceBadgeClass = (source?: string | null) => {
  const s = (source ?? '').toLowerCase();
  if (s === 'govcon') return 'bg-violet-100 text-violet-700 border-violet-200';
  if (s === 'sam') return 'bg-sky-100 text-sky-700 border-sky-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

export const getSamSearchUrl = (opp: OpportunityRecord) => {
  const q = opp.external_ref || opp.title;
  return `https://sam.gov/search/?index=opp&keywords=${encodeURIComponent(q)}`;
};

export const getSamNoticeUrl = (opp: OpportunityRecord) => {
  // Construct direct link if possible. 
  // SAM.gov notice IDs are often the external_ref, or we can use the solicitation number.
  // Format: https://sam.gov/opp/[noticeId]/view
  // However, without the internal SAM.gov ID (which is a UUID), we can't deep link reliably 
  // EXCEPT via the search or if we store the `uiLink` from the API.

  // If we have a direct URL in the raw data, use it.
  const links = extractLinks(opp);
  if (links.samUrl) return links.samUrl;

  // Fallback to search if no direct link
  return getSamSearchUrl(opp);
};

export const getPrimaryLink = (opp: OpportunityRecord) => {
  const links = extractLinks(opp);
  // Prefer the direct SAM URL if invalid, otherwise search
  return links.samUrl || links.descriptionUrl || links.resourceLinks[0] || getSamSearchUrl(opp);
};

