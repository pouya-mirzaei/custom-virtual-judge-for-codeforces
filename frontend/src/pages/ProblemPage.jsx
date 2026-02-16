import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Clock, HardDrive, Tag, ArrowLeft, Copy, Check, ChevronRight } from 'lucide-react';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <button onClick={handleCopy} className="p-1 text-text-muted hover:text-primary transition rounded" title="Copy to clipboard">
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  );
}

function SampleTest({ index, input, output }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-text-muted">Input #{index + 1}</span>
          <CopyButton text={input} />
        </div>
        <pre className="bg-dark border border-border rounded-lg p-3 text-sm text-text font-mono whitespace-pre-wrap overflow-x-auto">
          {input}
        </pre>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-text-muted">Output #{index + 1}</span>
          <CopyButton text={output} />
        </div>
        <pre className="bg-dark border border-border rounded-lg p-3 text-sm text-text font-mono whitespace-pre-wrap overflow-x-auto">
          {output}
        </pre>
      </div>
    </div>
  );
}

export default function ProblemPage() {
  const { id: contestId, order } = useParams();
  const [contest, setContest] = useState(null);
  const [problem, setProblem] = useState(null);
  const [problemEntry, setProblemEntry] = useState(null); // Contest problem entry with customStatement
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadProblem = async () => {
      try {
        setLoading(true);
        setError('');

        // 1) Fetch the contest to find the CF mapping for this letter
        const contestRes = await api.get(`/contests/${contestId}`);
        const c = contestRes.data;
        setContest(c);

        const entry = c.problems.find((p) => p.order === order.toUpperCase());
        if (!entry) {
          setError(`Problem ${order.toUpperCase()} not found in this contest`);
          setLoading(false);
          return;
        }

        setProblemEntry(entry); // Save the contest problem entry

        // 2) Fetch the problem content from cache / CF
        const problemRes = await api.get(`/problems/${entry.contestId}/${entry.problemIndex}`);
        setProblem(problemRes.data);
      } catch (err) {
        const msg = err.response?.data?.error || 'Failed to load problem';
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };

    loadProblem();
  }, [contestId, order]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-text-muted mt-4">Loading problem...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-danger mb-4">{error}</p>
        <Link to={`/contest/${contestId}`} className="text-primary hover:text-primary-light transition">
          &larr; Back to contest
        </Link>
      </div>
    );
  }

  // Find adjacent problems for navigation
  const letters = (contest?.problems || []).map((p) => p.order);
  const currentIdx = letters.indexOf(order.toUpperCase());
  const prevLetter = currentIdx > 0 ? letters[currentIdx - 1] : null;
  const nextLetter = currentIdx < letters.length - 1 ? letters[currentIdx + 1] : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
        <Link to={`/contest/${contestId}`} className="hover:text-primary transition">
          {contest?.title || 'Contest'}
        </Link>
        <ChevronRight size={14} />
        <span className="text-text font-medium">
          Problem {order.toUpperCase()} — {problem?.name || ''}
        </span>
      </div>

      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-text mb-2">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary font-bold text-sm mr-3">
                {order.toUpperCase()}
              </span>
              {problem?.name || 'Problem'}
            </h1>
          </div>

          <Link
            to={`/contest/${contestId}/problem/${order.toUpperCase()}/submit`}
            className="px-4 py-2 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition text-sm"
          >
            Submit Solution
          </Link>
        </div>

        {/* Limits + meta */}
        <div className="flex flex-wrap gap-4 mt-4 text-sm text-text-muted">
          {problem?.timeLimit && (
            <span className="flex items-center gap-1.5">
              <Clock size={14} className="text-primary-light" />
              {problem.timeLimit}
            </span>
          )}
          {problem?.memoryLimit && (
            <span className="flex items-center gap-1.5">
              <HardDrive size={14} className="text-primary-light" />
              {problem.memoryLimit}
            </span>
          )}
          {problem?.rating && (
            <span className="flex items-center gap-1.5">
              <Tag size={14} className="text-primary-light" />
              Rating: {problem.rating}
            </span>
          )}
          <span className="font-mono text-xs">
            CF {problem?.contestId}/{problem?.problemIndex}
          </span>
        </div>
      </div>

      {/* Custom Statement (if admin added one) */}
      {problemEntry?.customStatement && (
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-text mb-3 pb-3 border-b border-border">Custom Problem Statement</h2>
          <div className="prose prose-invert max-w-none text-text-muted whitespace-pre-wrap">{problemEntry.customStatement}</div>
        </div>
      )}

      {/* Problem Statement */}
      {problem?.htmlContent && (
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="problem-statement prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: problem.htmlContent }} />
        </div>
      )}

      {/* Sample Tests */}
      {problem?.samples && problem.samples.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-text mb-4">Sample Tests</h2>
          <div className="space-y-4">
            {problem.samples.map((s, i) => (
              <SampleTest key={i} index={i} input={s.input} output={s.output} />
            ))}
          </div>
        </div>
      )}

      {/* Tags (collapsed by default) */}
      {problem?.tags && problem.tags.length > 0 && (
        <details className="bg-card border border-border rounded-xl p-6 mb-6">
          <summary className="text-sm text-text-muted cursor-pointer hover:text-text transition font-medium">Tags (spoiler)</summary>
          <div className="flex flex-wrap gap-2 mt-3">
            {problem.tags.map((tag) => (
              <span key={tag} className="px-2 py-1 text-xs bg-primary/10 text-primary-light rounded-md">
                {tag}
              </span>
            ))}
          </div>
        </details>
      )}

      {/* Problem navigation */}
      <div className="flex items-center justify-between mt-8">
        {prevLetter ? (
          <Link
            to={`/contest/${contestId}/problem/${prevLetter}`}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-primary transition"
          >
            <ArrowLeft size={16} />
            Problem {prevLetter}
          </Link>
        ) : (
          <div />
        )}

        <Link to={`/contest/${contestId}`} className="text-sm text-text-muted hover:text-primary transition">
          All Problems
        </Link>

        {nextLetter ? (
          <Link
            to={`/contest/${contestId}/problem/${nextLetter}`}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-primary transition"
          >
            Problem {nextLetter}
            <ChevronRight size={16} />
          </Link>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
