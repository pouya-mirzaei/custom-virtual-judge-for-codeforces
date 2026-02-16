import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { ChevronLeft, Save, Loader2, FileText } from 'lucide-react';

export default function AdminProblemStatementsPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [contest, setContest] = useState(null);
  const [statements, setStatements] = useState({});
  const [saving, setSaving] = useState({});

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    loadContest();
  }, [id, isAdmin]);

  const loadContest = async () => {
    try {
      const { data } = await api.get(`/contests/${id}`);
      setContest(data);
      // Load existing custom statements
      const stmts = {};
      data.problems.forEach((p) => {
        stmts[p.order] = p.customStatement || '';
      });
      setStatements(stmts);
    } catch (err) {
      toast.error('Failed to load contest');
      navigate('/admin');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (order) => {
    setSaving((prev) => ({ ...prev, [order]: true }));
    try {
      await api.put(`/contests/${id}/problems/${order}/statement`, {
        statement: statements[order] || '',
      });
      toast.success(`Problem ${order} statement saved`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving((prev) => ({ ...prev, [order]: false }));
    }
  };

  const updateStatement = (order, value) => {
    setStatements((prev) => ({ ...prev, [order]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!contest) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary transition mb-3">
          <ChevronLeft size={16} />
          Back to Admin
        </Link>
        <h1 className="text-2xl font-bold text-text">{contest.title}</h1>
        <p className="text-text-muted text-sm mt-1">Edit custom problem statements (supports Markdown)</p>
      </div>

      {/* Problem Statements */}
      <div className="space-y-6">
        {contest.problems.map((problem) => (
          <div key={problem.order} className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary font-bold">
                  {problem.order}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-text">{problem.problemName || `Problem ${problem.order}`}</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    CF: {problem.contestId}/{problem.problemIndex}
                  </p>
                </div>
              </div>
              <a
                href={`https://codeforces.com/problemset/problem/${problem.contestId}/${problem.problemIndex}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:text-primary-light transition"
              >
                View on CF →
              </a>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-text mb-2">
                <FileText size={14} className="inline mr-1.5" />
                Custom Statement
              </label>
              <textarea
                value={statements[problem.order] || ''}
                onChange={(e) => updateStatement(problem.order, e.target.value)}
                placeholder="Leave empty to show only CF problem. Add custom description, hints, or additional constraints here..."
                rows={12}
                className="w-full px-4 py-3 bg-dark border border-border rounded-lg text-text text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-text-muted/50 resize-y"
              />
              <p className="text-xs text-text-muted mt-1.5">This will be displayed above the Codeforces problem on the problem page</p>
            </div>

            <button
              onClick={() => handleSave(problem.order)}
              disabled={saving[problem.order]}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition text-sm disabled:opacity-50"
            >
              {saving[problem.order] ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving[problem.order] ? 'Saving...' : 'Save Statement'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
