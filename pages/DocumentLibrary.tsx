import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Upload, Search, Tag, Folder, Link2, Trash2, ChevronDown, Plus, RefreshCw, Loader2, Download, Clock, MoreVertical } from 'lucide-react';
import api from '../lib/api';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'capability_statement', label: 'Capability Statement' },
  { value: 'past_performance', label: 'Past Performance' },
  { value: 'pricing_template', label: 'Pricing Template' },
  { value: 'technical_proposal', label: 'Technical Proposal' },
  { value: 'management_plan', label: 'Management Plan' },
  { value: 'resume', label: 'Resume / Key Personnel' },
  { value: 'certification', label: 'Certification' },
  { value: 'sf330', label: 'SF-330' },
  { value: 'sf1449', label: 'SF-1449' },
  { value: 'cover_letter', label: 'Cover Letter' },
  { value: 'teaming_agreement', label: 'Teaming Agreement' },
  { value: 'other', label: 'Other' },
];

const DocumentLibrary = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Upload form
  const [uploadName, setUploadName] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploadTags, setUploadTags] = useState('');

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listDocuments({ category: category || undefined, search: search || undefined });
      if (res.data) {
        setDocuments(res.data);
        setTotal(res.total || res.data.length);
      }
    } catch {
      setError('Failed to load documents. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadName) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', uploadName);
      formData.append('description', uploadDesc);
      formData.append('category', uploadCategory);
      formData.append('tags', uploadTags);

      await api.uploadDocument(formData);
      setShowUpload(false);
      setUploadName(''); setUploadDesc(''); setUploadTags('');
      if (fileRef.current) fileRef.current.value = '';
      loadDocuments();
    } catch {
      setError('Failed to upload document. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    await api.deleteDocument(id);
    loadDocuments();
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Library</h1>
          <p className="text-sm text-gray-500 mt-1">Reusable documents for proposals and submissions</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadDocuments} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800">
            <Upload size={14} /> Upload Document
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
        >
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs">Dismiss</button>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Upload Document</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input type="text" value={uploadName} onChange={(e) => setUploadName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900" placeholder="e.g. Company Capability Statement 2026" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-gray-900" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
                    {CATEGORIES.filter(c => c.value).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tags (comma-separated)</label>
                  <input type="text" value={uploadTags} onChange={(e) => setUploadTags(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="IT, Cloud, AWS" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">File *</label>
                <input ref={fileRef} type="file" className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowUpload(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleUpload} disabled={uploading || !uploadName || !fileRef.current?.files?.length}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Loading documents...
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-20">
          <Folder size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-sm">No documents yet. Upload your first reusable document.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <FileText size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 line-clamp-1">{doc.name}</h3>
                    <p className="text-xs text-gray-400">{doc.file_name}</p>
                  </div>
                </div>
                <button onClick={() => handleDelete(doc.id)} className="text-gray-300 hover:text-red-500 p-1">
                  <Trash2 size={14} />
                </button>
              </div>

              {doc.description && (
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{doc.description}</p>
              )}

              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  {CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                </span>
                {(doc.tags || []).slice(0, 3).map((tag: string) => (
                  <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                    <Tag size={10} className="mr-1" />{tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
                <span>{formatSize(doc.file_size)}</span>
                <span className="flex items-center gap-1">
                  <Link2 size={10} /> Used {doc.usage_count || 0}x
                </span>
                <span>v{doc.version}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center text-xs text-gray-400 pt-4">
        {total} document{total !== 1 ? 's' : ''} in library
      </div>
    </div>
  );
};

export default DocumentLibrary;
