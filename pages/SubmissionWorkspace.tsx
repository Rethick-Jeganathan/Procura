import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  FileText, CheckCircle, Circle, Upload, Send,
  ChevronRight, Clock, User, AlertTriangle, Sparkles,
  Download, Eye, Loader2, Shield, DollarSign, UserCheck,
  XCircle, ArrowRight
} from 'lucide-react';
import { api } from '../lib/api';

type SubmissionTask = {
  id: string;
  title: string;
  subtitle?: string | null;
  completed: boolean;
  locked: boolean;
  completed_at?: string | null;
};

type SubmissionFile = {
  id: string;
  file_name: string;
  file_size?: number | null;
  file_type?: string | null;
  storage_path: string;
  scan_status?: string | null;
  created_at?: string | null;
};

type SubmissionData = {
  id: string;
  title: string;
  portal: string;
  due_date: string;
  status: string;
  approval_status: string;
  opportunity?: {
    title?: string;
    agency?: string;
    external_ref?: string;
    ai_summary?: string;
    description?: string;
  } | null;
  files?: SubmissionFile[] | null;
  tasks?: SubmissionTask[] | null;
};

const SubmissionWorkspace: React.FC = () => {
  const { submissionId } = useParams();
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [tasks, setTasks] = useState<SubmissionTask[]>([]);
  const [documents, setDocuments] = useState<SubmissionFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [complianceResult, setComplianceResult] = useState<any>(null);
  const [approvingStep, setApprovingStep] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSubmission = async () => {
    if (!submissionId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const response = await api.getSubmission(submissionId);
    if (response.error || !response.data) {
      setError(response.error || 'Submission not found');
      setSubmission(null);
      setTasks([]);
      setDocuments([]);
      setIsLoading(false);
      return;
    }

    const data = response.data as SubmissionData;
    setSubmission(data);
    setTasks(data.tasks ?? []);
    setDocuments(data.files ?? []);
    setIsLoading(false);
  };

  useEffect(() => {
    loadSubmission();
  }, [submissionId]);

  const completedTasks = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);
  const progress = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value || 'TBD';
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleToggleTask = async (task: SubmissionTask) => {
    if (!submissionId || task.locked) return;
    const nextCompleted = !task.completed;
    const response = await api.updateSubmissionTask(submissionId, task.id, nextCompleted);
    if (response.error) {
      setError(response.error);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: nextCompleted } : t)));
  };

  const handleSubmit = async () => {
    if (!submissionId) return;
    setIsSubmitting(true);
    const response = await api.finalizeSubmission(submissionId, false);
    if (response.error) {
      setError(response.error);
    }
    await loadSubmission();
    setIsSubmitting(false);
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !submissionId) return;

    setIsUploading(true);
    setError(null);

    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);

        const headers: Record<string, string> = {};
        const token = api.getToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(`${apiBase}/submissions/${submissionId}/files`, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          throw new Error(errData?.detail || `Upload failed for ${files[i].name} (status ${response.status})`);
        }
      }
      await loadSubmission();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [submissionId]);

  const handleComplianceCheck = useCallback(async () => {
    if (!submission?.opportunity) {
      setError('No opportunity data available for compliance check');
      return;
    }

    setIsCheckingCompliance(true);
    setError(null);
    setComplianceResult(null);

    try {
      const opportunityId = submission.opportunity.external_ref || submission.id;
      const response = await api.qualifyOpportunity(opportunityId);
      if (response.error) {
        setError(response.error);
      } else {
        setComplianceResult(response.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compliance check failed');
    } finally {
      setIsCheckingCompliance(false);
    }
  }, [submission]);

  type ApprovalStepStatus = 'pending' | 'approved' | 'rejected' | 'locked';

  const getApprovalSteps = useCallback((): { label: string; stepName: string; icon: React.ReactNode; status: ApprovalStepStatus }[] => {
    const approvalStatus = submission?.approval_status || 'pending';

    const isRejected = approvalStatus === 'rejected';

    let legalStatus: ApprovalStepStatus = 'pending';
    let financeStatus: ApprovalStepStatus = 'locked';
    let executiveStatus: ApprovalStepStatus = 'locked';

    if (approvalStatus === 'legal_approved') {
      legalStatus = 'approved';
      financeStatus = 'pending';
    } else if (approvalStatus === 'finance_approved') {
      legalStatus = 'approved';
      financeStatus = 'approved';
      executiveStatus = 'pending';
    } else if (approvalStatus === 'complete') {
      legalStatus = 'approved';
      financeStatus = 'approved';
      executiveStatus = 'approved';
    } else if (isRejected) {
      // When rejected, mark the first non-approved step as rejected
      // Since we don't track which step rejected, we mark the earliest pending step
      legalStatus = 'rejected';
      financeStatus = 'locked';
      executiveStatus = 'locked';
    }

    return [
      { label: 'Legal Review', stepName: 'legal_review', icon: <Shield size={16} />, status: legalStatus },
      { label: 'Finance Review', stepName: 'finance_review', icon: <DollarSign size={16} />, status: financeStatus },
      { label: 'Executive Approval', stepName: 'executive_approval', icon: <UserCheck size={16} />, status: executiveStatus },
    ];
  }, [submission?.approval_status]);

  const handleApproveStep = useCallback(async (stepName: string) => {
    if (!submissionId) return;
    setApprovingStep(stepName);
    setError(null);
    try {
      const response = await api.approveSubmission(submissionId, stepName);
      if (response.error) {
        setError(response.error);
      }
      await loadSubmission();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setApprovingStep(null);
    }
  }, [submissionId]);

  const handleRejectStep = useCallback(async (stepName: string) => {
    if (!submissionId) return;
    const reason = window.prompt(`Reason for rejecting ${stepName.replace(/_/g, ' ')}:`);
    if (reason === null) return; // User cancelled the prompt
    if (!reason.trim()) {
      setError('A rejection reason is required.');
      return;
    }
    setApprovingStep(stepName);
    setError(null);
    try {
      const response = await api.rejectSubmission(submissionId, reason.trim());
      if (response.error) {
        setError(response.error);
      }
      await loadSubmission();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setApprovingStep(null);
    }
  }, [submissionId]);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
      in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
      submitted: { bg: 'bg-green-100', text: 'text-green-700', label: 'Submitted' },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
      approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Approved' },
      cancelled: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Cancelled' },
    };
    const entry = map[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${entry.bg} ${entry.text}`}>
        {entry.label}
      </span>
    );
  };

  const getApprovalBadge = (approvalStatus: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Approval Pending' },
      legal_approved: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Legal Approved' },
      finance_approved: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Finance Approved' },
      complete: { bg: 'bg-green-100', text: 'text-green-700', label: 'Fully Approved' },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
    };
    const entry = map[approvalStatus] || { bg: 'bg-gray-100', text: 'text-gray-700', label: approvalStatus };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${entry.bg} ${entry.text}`}>
        {entry.label}
      </span>
    );
  };

  if (!submissionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white text-gray-500">
        Select a submission from the Opportunities page to open its workspace.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white text-gray-500">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading workspace...
      </div>
    );
  }

  if (error && !submission) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="flex-1 flex bg-white min-h-0">
      <div className="flex-1 flex flex-col border-r border-gray-100 min-w-0">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <span>{submission?.id}</span>
                <ChevronRight size={14} />
                <span>{submission?.opportunity?.external_ref ?? 'N/A'}</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">{submission?.title ?? 'Submission Workspace'}</h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-gray-500">{submission?.opportunity?.agency ?? 'Unknown Agency'}</p>
                {submission?.status && getStatusBadge(submission.status)}
                {submission?.approval_status && getApprovalBadge(submission.approval_status)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
                <Eye size={16} />
                Preview
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {isSubmitting ? 'Submitting' : 'Submit'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Completion Progress</span>
                <span className="font-medium text-gray-900">{progress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Due Date</p>
              <p className="font-semibold text-gray-900">{formatDate(submission?.due_date ?? '')}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="px-6 py-3 border-b border-red-200 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Approval Workflow</h2>
          <div className="flex items-center gap-2">
            {getApprovalSteps().map((step, index) => (
              <React.Fragment key={step.label}>
                {index > 0 && (
                  <ArrowRight size={16} className="text-gray-300 shrink-0" />
                )}
                <div
                  className={`flex-1 p-3 rounded-lg border transition-all ${
                    step.status === 'approved'
                      ? 'bg-green-50 border-green-200'
                      : step.status === 'rejected'
                        ? 'bg-red-50 border-red-200'
                        : step.status === 'pending'
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`shrink-0 ${
                      step.status === 'approved'
                        ? 'text-green-600'
                        : step.status === 'rejected'
                          ? 'text-red-600'
                          : step.status === 'pending'
                            ? 'text-amber-600'
                            : 'text-gray-400'
                    }`}>
                      {step.status === 'approved' ? (
                        <CheckCircle size={18} />
                      ) : step.status === 'rejected' ? (
                        <XCircle size={18} />
                      ) : (
                        step.icon
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-medium truncate ${
                        step.status === 'approved'
                          ? 'text-green-800'
                          : step.status === 'rejected'
                            ? 'text-red-800'
                            : step.status === 'pending'
                              ? 'text-amber-800'
                              : 'text-gray-500'
                      }`}>
                        {step.label}
                      </p>
                      <p className={`text-xs ${
                        step.status === 'approved'
                          ? 'text-green-600'
                          : step.status === 'rejected'
                            ? 'text-red-600'
                            : step.status === 'pending'
                              ? 'text-amber-600'
                              : 'text-gray-400'
                      }`}>
                        {step.status === 'approved' ? 'Approved' : step.status === 'rejected' ? 'Rejected' : step.status === 'pending' ? 'Pending' : 'Waiting'}
                      </p>
                    </div>
                  </div>
                  {step.status === 'pending' && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <button
                        onClick={() => handleApproveStep(step.stepName)}
                        disabled={approvingStep !== null}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-all disabled:opacity-50"
                      >
                        {approvingStep === step.stepName ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle size={12} />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectStep(step.stepName)}
                        disabled={approvingStep !== null}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-all disabled:opacity-50"
                      >
                        {approvingStep === step.stepName ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <XCircle size={12} />
                        )}
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Checklist</h2>
          {tasks.length === 0 ? (
            <div className="text-sm text-gray-500">No tasks yet for this submission.</div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    task.completed
                      ? 'bg-green-50 border-green-100'
                      : task.locked
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-white border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <button className="shrink-0" onClick={() => handleToggleTask(task)} disabled={task.locked}>
                    {task.completed ? (
                      <CheckCircle size={20} className="text-green-600" />
                    ) : (
                      <Circle size={20} className={task.locked ? 'text-gray-300' : 'text-gray-400'} />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                      {task.title}
                    </p>
                    {task.subtitle && (
                      <p className="text-xs text-gray-500 mt-0.5">{task.subtitle}</p>
                    )}
                  </div>
                  {task.locked && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <AlertTriangle size={12} /> Locked
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mt-8 mb-4">Documents</h2>
          {documents.length === 0 ? (
            <div className="text-sm text-gray-500">No documents uploaded yet.</div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:border-gray-200 transition-all">
                  <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                    <FileText size={20} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(doc.file_size)} - {doc.created_at ? formatDate(doc.created_at) : 'Recently'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    doc.scan_status === 'clean'
                      ? 'bg-green-100 text-green-700'
                      : doc.scan_status === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    {doc.scan_status ?? 'pending'}
                  </span>
                  <button className="p-1.5 hover:bg-gray-100 rounded-lg">
                    <Download size={16} className="text-gray-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.png,.jpg,.jpeg"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center justify-center gap-2 w-full mt-4 py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-all disabled:opacity-60"
          >
            {isUploading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={16} />
                Upload Documents
              </>
            )}
          </button>
        </div>
      </div>

      <div className="w-80 flex flex-col bg-gray-50 shrink-0">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">AI Insights</h3>
              <p className="text-xs text-gray-500">Powered by configured LLM</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            {(submission?.opportunity?.ai_summary || submission?.opportunity?.description) && (
              <div className="p-3 rounded-lg border bg-white">
                <div className="flex items-start gap-2">
                  <Sparkles size={16} className="text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">
                    {submission?.opportunity?.ai_summary ?? submission?.opportunity?.description}
                  </p>
                </div>
              </div>
            )}

            {isCheckingCompliance && (
              <div className="p-3 rounded-lg border bg-white">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="text-purple-600 animate-spin shrink-0" />
                  <p className="text-sm text-gray-600">Running compliance check...</p>
                </div>
              </div>
            )}

            {complianceResult && (
              <div className="space-y-3">
                {complianceResult.fit_score !== undefined && (
                  <div className="p-3 rounded-lg border bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Fit Score</span>
                      <span className={`text-lg font-bold ${
                        complianceResult.fit_score >= 70
                          ? 'text-green-600'
                          : complianceResult.fit_score >= 40
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}>
                        {complianceResult.fit_score}/100
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          complianceResult.fit_score >= 70
                            ? 'bg-green-500'
                            : complianceResult.fit_score >= 40
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${complianceResult.fit_score}%` }}
                      />
                    </div>
                  </div>
                )}

                {complianceResult.qualification_reason && (
                  <div className="p-3 rounded-lg border bg-white">
                    <div className="flex items-start gap-2">
                      <CheckCircle size={16} className="text-green-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Assessment</p>
                        <p className="text-sm text-gray-700">{complianceResult.qualification_reason}</p>
                      </div>
                    </div>
                  </div>
                )}

                {complianceResult.ai_summary && (
                  <div className="p-3 rounded-lg border bg-white">
                    <div className="flex items-start gap-2">
                      <Sparkles size={16} className="text-purple-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">AI Summary</p>
                        <p className="text-sm text-gray-700">{complianceResult.ai_summary}</p>
                      </div>
                    </div>
                  </div>
                )}

                {complianceResult.risks && complianceResult.risks.length > 0 && (
                  <div className="p-3 rounded-lg border bg-white">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Risks</p>
                        <ul className="space-y-1">
                          {complianceResult.risks.map((risk: string, i: number) => (
                            <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                              <span className="text-amber-500 mt-1.5 shrink-0 block w-1 h-1 rounded-full bg-amber-500" />
                              {risk}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {complianceResult.strengths && complianceResult.strengths.length > 0 && (
                  <div className="p-3 rounded-lg border bg-white">
                    <div className="flex items-start gap-2">
                      <CheckCircle size={16} className="text-green-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Strengths</p>
                        <ul className="space-y-1">
                          {complianceResult.strengths.map((strength: string, i: number) => (
                            <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                              <span className="shrink-0 mt-1.5 block w-1 h-1 rounded-full bg-green-500" />
                              {strength}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!submission?.opportunity?.ai_summary && !submission?.opportunity?.description && !complianceResult && !isCheckingCompliance && (
              <div className="text-sm text-gray-500">No AI insights available yet. Run a compliance check to get started.</div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleComplianceCheck}
            disabled={isCheckingCompliance}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-60"
          >
            {isCheckingCompliance ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Run Compliance Check
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubmissionWorkspace;

