import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatDistanceToNow, format } from 'date-fns';
import { ChevronRight, FileText, Clock, Cpu, CheckCircle, XCircle, AlertTriangle, Loader } from 'lucide-react';

const VERDICT_CONFIG = {
  ACCEPTED: { label: 'Accepted', color: 'text-success', bg: 'bg-success/15', icon: CheckCircle },
  OK: { label: 'Accepted', color: 'text-success', bg: 'bg-success/15', icon: CheckCircle },
  WRONG_ANSWER: { label: 'Wrong Answer', color: 'text-danger', bg: 'bg-danger/15', icon: XCircle },
  TIME_LIMIT_EXCEEDED: { label: 'Time Limit Exceeded', color: 'text-danger', bg: 'bg-danger/15', icon: Clock },
  MEMORY_LIMIT_EXCEEDED: { label: 'Memory Limit Exceeded', color: 'text-danger', bg: 'bg-danger/15', icon: Cpu },
  RUNTIME_ERROR: { label: 'Runtime Error', color: 'text-danger', bg: 'bg-danger/15', icon: AlertTriangle },
  COMPILATION_ERROR: { label: 'Compilation Error', color: 'text-warning', bg: 'bg-warning/15', icon: AlertTriangle },
  PENDING: { label: 'Pending', color: 'text-pending', bg: 'bg-pending/15', icon: Loader },
  TESTING: { label: 'Testing...', color: 'text-pending', bg: 'bg-pending/15', icon: Loader },
};

export default function SubmissionDetailPage() {
  const { id: contestId, subId } = useParams();
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get(`/submissions/${subId}`);
        setSubmission(res.data);
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to load submission');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [subId]);

  // Poll if pending
  useEffect(() => {
    if (!submission || (submission.verdict !== 'PENDING' && submission.verdict !== 'TESTING')) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/submissions/${subId}`);
        setSubmission(res.data);
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [submission?.verdict, subId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-text-muted mt-4">Loading submission...</p>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-danger">Submission not found</p>
        <Link to={`/contest/${contestId}/submissions`} className="text-primary hover:text-primary-light text-sm mt-2 inline-block">
          &larr; Back to submissions
        </Link>
      </div>
    );
  }

  const vc = VERDICT_CONFIG[submission.verdict] || VERDICT_CONFIG.PENDING;
  const VerdictIcon = vc.icon;
  const isPending = submission.verdict === 'PENDING' || submission.verdict === 'TESTING';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-muted mb-6 flex-wrap">
        <Link to={`/contest/${contestId}`} className="hover:text-primary transition">
          Contest
        </Link>
        <ChevronRight size={14} />
        <Link to={`/contest/${contestId}/submissions`} className="hover:text-primary transition">
          My Submissions
        </Link>
        <ChevronRight size={14} />
        <span className="text-text font-medium">Submission Detail</span>
      </div>

      {/* Verdict banner */}
      <div className={`${vc.bg} rounded-xl p-6 mb-6 flex items-center gap-4 ${isPending ? 'animate-pulse' : ''}`}>
        <VerdictIcon size={32} className={vc.color} />
        <div>
          <h1 className={`text-2xl font-bold ${vc.color}`}>{vc.label}</h1>
          {submission.testsPassed > 0 && submission.verdict !== 'ACCEPTED' && submission.verdict !== 'OK' && (
            <p className="text-text-muted text-sm mt-1">Failed on test {submission.testsPassed + 1}</p>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <InfoCard label="Problem" value={submission.problemId} />
        <InfoCard label="Language" value={submission.language} />
        <InfoCard label="Time" value={submission.timeTaken > 0 ? `${submission.timeTaken} ms` : '—'} />
        <InfoCard label="Memory" value={submission.memoryUsed > 0 ? `${Math.round(submission.memoryUsed / 1024)} KB` : '—'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <InfoCard label="Submitted" value={format(new Date(submission.submittedAt), 'MMM d, yyyy HH:mm:ss')} />
        <InfoCard label="Time ago" value={formatDistanceToNow(new Date(submission.submittedAt), { addSuffix: true })} />
      </div>

      {/* Source code */}
      {submission.code && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-card-hover border-b border-border">
            <span className="text-sm font-medium text-text flex items-center gap-2">
              <FileText size={14} className="text-primary" />
              Source Code
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(submission.code);
                toast.success('Code copied!');
              }}
              className="text-xs text-text-muted hover:text-primary transition px-2 py-1 rounded bg-bg"
            >
              Copy
            </button>
          </div>
          <pre className="p-4 overflow-x-auto text-sm font-mono text-text leading-relaxed whitespace-pre">{submission.code}</pre>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <p className="text-xs text-text-muted uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-semibold text-text truncate">{value}</p>
    </div>
  );
}
