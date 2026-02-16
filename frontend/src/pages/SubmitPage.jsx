import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { ChevronRight, Send, Loader2, Code, Upload } from 'lucide-react';

// Common Codeforces languages with their programTypeId
const CF_LANGUAGES = [
  { id: '89', name: 'C++23 (GCC 14-64)' },
  { id: '73', name: 'C++17 (GCC 7-32)' },
  { id: '54', name: 'C++17 (G++ 7-64)' },
  { id: '91', name: 'C++20 (GCC 14-64)' },
  { id: '65', name: 'C# 8 (.NET Core 3.1)' },
  { id: '9', name: 'C# Mono 6.8' },
  { id: '28', name: 'D (DMD64 v2.101)' },
  { id: '32', name: 'Go 1.22' },
  { id: '60', name: 'Java 17 (64bit)' },
  { id: '87', name: 'Java 21 (64bit)' },
  { id: '36', name: 'Java 8 (32bit)' },
  { id: '77', name: 'Kotlin 1.7' },
  { id: '19', name: 'OCaml 4' },
  { id: '3', name: 'Delphi 7' },
  { id: '4', name: 'Free Pascal 3.2' },
  { id: '13', name: 'Perl 5.20' },
  { id: '6', name: 'PHP 8.1' },
  { id: '7', name: 'Python 2.7' },
  { id: '31', name: 'Python 3.8' },
  { id: '70', name: 'PyPy 3-64' },
  { id: '40', name: 'PyPy 2-64' },
  { id: '67', name: 'Ruby 3' },
  { id: '75', name: 'Rust 1.75' },
  { id: '20', name: 'Scala 2.12' },
  { id: '34', name: 'JavaScript (V8)' },
  { id: '55', name: 'Node.js 15' },
  { id: '12', name: 'Haskell GHC 8.10' },
];

export default function SubmitPage() {
  const { id: contestId, order } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [contest, setContest] = useState(null);
  const [problemEntry, setProblemEntry] = useState(null);
  const [code, setCode] = useState('');
  const [languageId, setLanguageId] = useState('89');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load contest to get problem mapping
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/contests/${contestId}`);
        setContest(res.data);
        const entry = res.data.problems.find((p) => p.order === order.toUpperCase());
        setProblemEntry(entry || null);
      } catch {
        toast.error('Failed to load contest');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [contestId, order]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 256 * 1024) {
      toast.error('File too large (max 256 KB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setCode(ev.target.result);
      toast.success(`Loaded ${file.name}`);
    };
    reader.onerror = () => toast.error('Failed to read file');
    reader.readAsText(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!code.trim()) {
      toast.error('Please enter your source code');
      return;
    }

    if (!problemEntry) {
      toast.error('Problem not found in contest');
      return;
    }

    const selectedLang = CF_LANGUAGES.find((l) => l.id === languageId);

    setSubmitting(true);
    try {
      const res = await api.post('/submissions', {
        contestId,
        problemId: problemEntry.problemId,
        code: code.trim(),
        language: selectedLang?.name || languageId,
        languageId,
      });

      toast.success('Solution submitted!');
      // Navigate to submissions page (or contest page for now)
      navigate(`/contest/${contestId}/submissions`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Submission failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-text-muted mt-4">Loading...</p>
      </div>
    );
  }

  if (!problemEntry) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-danger mb-4">Problem {order?.toUpperCase()} not found in this contest</p>
        <Link to={`/contest/${contestId}`} className="text-primary hover:text-primary-light transition">
          &larr; Back to contest
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
        <Link to={`/contest/${contestId}`} className="hover:text-primary transition">
          {contest?.title || 'Contest'}
        </Link>
        <ChevronRight size={14} />
        <Link to={`/contest/${contestId}/problem/${order.toUpperCase()}`} className="hover:text-primary transition">
          Problem {order.toUpperCase()}
        </Link>
        <ChevronRight size={14} />
        <span className="text-text font-medium">Submit</span>
      </div>

      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h1 className="text-xl font-bold text-text flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary font-bold text-sm">
            {order.toUpperCase()}
          </span>
          Submit Solution — {problemEntry.problemName || `Problem ${order.toUpperCase()}`}
        </h1>
        <p className="text-text-muted text-sm mt-2">
          CF Source: {problemEntry.contestId}/{problemEntry.problemIndex}
        </p>
      </div>

      {/* Submit Form */}
      <form onSubmit={handleSubmit}>
        {/* Language Selector */}
        <div className="bg-card border border-border rounded-xl p-6 mb-4">
          <label className="block text-sm font-semibold text-text mb-2">Language</label>
          <select
            value={languageId}
            onChange={(e) => setLanguageId(e.target.value)}
            className="w-full md:w-80 px-3 py-2 bg-dark border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          >
            {CF_LANGUAGES.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* Code Editor */}
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-6 py-3 border-b border-border">
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Code size={16} />
              Source Code
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-muted">{code.length} chars</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-dark border border-border rounded-lg text-text-muted hover:text-text hover:border-primary/30 transition"
              >
                <Upload size={12} />
                Upload File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept=".cpp,.c,.py,.java,.js,.rs,.go,.kt,.cs,.rb,.hs,.scala,.pas,.d,.ml,.php,.pl"
              />
            </div>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste your solution here..."
            spellCheck={false}
            className="w-full h-96 px-4 py-3 bg-dark text-text font-mono text-sm leading-relaxed resize-y focus:outline-none placeholder:text-text-muted/50"
          />
        </div>

        {/* Submit button */}
        <div className="flex items-center justify-between">
          <Link
            to={`/contest/${contestId}/problem/${order.toUpperCase()}`}
            className="text-sm text-text-muted hover:text-primary transition"
          >
            &larr; Back to problem
          </Link>
          <button
            type="submit"
            disabled={submitting || !code.trim()}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send size={16} />
                Submit
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
