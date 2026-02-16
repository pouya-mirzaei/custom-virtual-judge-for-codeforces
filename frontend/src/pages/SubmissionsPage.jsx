import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useContestSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { ChevronRight, FileText, RefreshCw, ExternalLink } from 'lucide-react';

const VERDICT_STYLES = {
  ACCEPTED: 'bg-success/15 text-success',
  OK: 'bg-success/15 text-success',
  WRONG_ANSWER: 'bg-danger/15 text-danger',
  TIME_LIMIT_EXCEEDED: 'bg-danger/15 text-danger',
  MEMORY_LIMIT_EXCEEDED: 'bg-danger/15 text-danger',
  RUNTIME_ERROR: 'bg-danger/15 text-danger',
  COMPILATION_ERROR: 'bg-warning/15 text-warning',
  PENDING: 'bg-pending/15 text-pending',
  TESTING: 'bg-pending/15 text-pending',
};

const VERDICT_SHORT = {
  ACCEPTED: 'AC',
  OK: 'AC',
  WRONG_ANSWER: 'WA',
  TIME_LIMIT_EXCEEDED: 'TLE',
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  RUNTIME_ERROR: 'RE',
  COMPILATION_ERROR: 'CE',
  PENDING: 'Pending',
  TESTING: 'Testing...',
};

function VerdictBadge({ verdict, testsPassed }) {
  const style = VERDICT_STYLES[verdict] || 'bg-text-muted/15 text-text-muted';
  const short = VERDICT_SHORT[verdict] || verdict;
  const showTests = testsPassed > 0 && verdict !== 'ACCEPTED' && verdict !== 'OK';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${style}`}>
      {short}
      {showTests && <span className="opacity-70">on test {testsPassed + 1}</span>}
    </span>
  );
}

export default function SubmissionsPage() {
  const { id: contestId } = useParams();
  const [contest, setContest] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Build problem letter lookup from contest
  const problemLetterMap = {};
  if (contest?.problems) {
    contest.problems.forEach((p) => {
      problemLetterMap[p.problemId] = p.order;
    });
  }

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [contestRes, subsRes] = await Promise.all([api.get(`/contests/${contestId}`), api.get(`/submissions?contestId=${contestId}`)]);

      setContest(contestRes.data);
      setSubmissions(subsRes.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load submissions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [contestId]);

  // Live verdict updates via Socket.io
  const handleSubmissionUpdate = useCallback((update) => {
    setSubmissions((prev) =>
      prev.map((s) =>
        s._id === update._id
          ? { ...s, verdict: update.verdict, testsPassed: update.testsPassed, timeTaken: update.timeTaken, memoryUsed: update.memoryUsed }
          : s,
      ),
    );
  }, []);

  useContestSocket(contestId, { onSubmissionUpdate: handleSubmissionUpdate });

  // Fallback polling if any submission is still pending
  useEffect(() => {
    const hasPending = submissions.some((s) => s.verdict === 'PENDING' || s.verdict === 'TESTING');
    if (!hasPending) return;

    const interval = setInterval(() => fetchData(true), 10000);
    return () => clearInterval(interval);
  }, [submissions]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-text-muted mt-4">Loading submissions...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
        <Link to={`/contest/${contestId}`} className="hover:text-primary transition">
          {contest?.title || 'Contest'}
        </Link>
        <ChevronRight size={14} />
        <span className="text-text font-medium">My Submissions</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text flex items-center gap-3">
          <FileText size={22} className="text-primary" />
          My Submissions
        </h1>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-card border border-border rounded-lg text-text-muted hover:text-text hover:border-primary/30 transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Submissions table */}
      {submissions.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <FileText size={32} className="mx-auto text-text-muted mb-3" />
          <p className="text-text-muted">No submissions yet</p>
          <Link to={`/contest/${contestId}`} className="text-primary hover:text-primary-light text-sm mt-2 inline-block transition">
            Go to contest problems
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-text-muted text-xs uppercase border-b border-border">
                  <th className="px-4 py-3">Problem</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="px-4 py-3">Verdict</th>
                  <th className="px-4 py-3 text-right">Time</th>
                  <th className="px-4 py-3 text-right">Memory</th>
                  <th className="px-4 py-3 text-right">Submitted</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => {
                  const letter = problemLetterMap[sub.problemId] || sub.problemId;
                  const isPending = sub.verdict === 'PENDING' || sub.verdict === 'TESTING';

                  return (
                    <tr
                      key={sub._id}
                      className={`border-b border-border/50 hover:bg-card-hover transition ${isPending ? 'animate-pulse' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/contest/${contestId}/problem/${letter}`}
                          className="inline-flex items-center gap-2 text-text hover:text-primary-light transition font-medium"
                        >
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-primary/10 text-primary font-bold text-xs">
                            {letter}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-muted">{sub.language}</td>
                      <td className="px-4 py-3">
                        <VerdictBadge verdict={sub.verdict} testsPassed={sub.testsPassed} />
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-text-muted font-mono">
                        {sub.timeTaken > 0 ? `${sub.timeTaken} ms` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-text-muted font-mono">
                        {sub.memoryUsed > 0 ? `${Math.round(sub.memoryUsed / 1024)} KB` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-text-muted">
                        {formatDistanceToNow(new Date(sub.submittedAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/contest/${contestId}/submission/${sub._id}`}
                          className="text-text-muted hover:text-primary transition"
                          title="View details"
                        >
                          <ExternalLink size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
