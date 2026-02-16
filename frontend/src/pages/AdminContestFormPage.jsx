import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { ChevronRight, Plus, Trash2, Save, Loader2, GripVertical } from 'lucide-react';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function parseProblemCode(code) {
  // Parse "1234A" or "1234/A" → { contestId: 1234, problemIndex: "A" }
  const match = code.trim().match(/^(\d+)\/?([A-Za-z]\d?)$/);
  if (!match) return null;
  return { contestId: parseInt(match[1]), problemIndex: match[2].toUpperCase() };
}

export default function AdminContestFormPage() {
  const { id } = useParams(); // undefined for new
  const isEdit = !!id;
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(120);
  const [scoringType, setScoringType] = useState('ICPC');
  const [penaltyTime, setPenaltyTime] = useState(20);
  const [freezeTime, setFreezeTime] = useState(0);
  const [visibility, setVisibility] = useState('public');
  const [password, setPassword] = useState('');
  const [problemCodes, setProblemCodes] = useState(['']);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    if (isEdit) {
      loadContest();
    } else {
      // Default start time: 1 hour from now, rounded to next 5 min
      const d = new Date();
      d.setHours(d.getHours() + 1);
      d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
      setStartTime(toLocalDatetime(d));
    }
  }, [id, isAdmin]);

  const toLocalDatetime = (d) => {
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  const loadContest = async () => {
    try {
      const res = await api.get(`/contests/${id}`);
      const c = res.data;
      setTitle(c.title);
      setDescription(c.description || '');
      setStartTime(toLocalDatetime(new Date(c.startTime)));
      setDuration(c.duration);
      setScoringType(c.scoringType || 'ICPC');
      setPenaltyTime(c.penaltyTime ?? 20);
      setFreezeTime(c.freezeTime ?? 0);
      setVisibility(c.visibility || 'public');
      setProblemCodes(c.problems.length > 0 ? c.problems.map((p) => `${p.contestId}/${p.problemIndex}`) : ['']);
    } catch (err) {
      toast.error('Failed to load contest');
      navigate('/admin');
    } finally {
      setLoading(false);
    }
  };

  const addProblem = () => setProblemCodes((prev) => [...prev, '']);

  const removeProblem = (i) => {
    if (problemCodes.length <= 1) return;
    setProblemCodes((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateProblem = (i, value) => {
    setProblemCodes((prev) => prev.map((p, idx) => (idx === i ? value : p)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate
    if (!title.trim()) return toast.error('Title is required');
    if (!startTime) return toast.error('Start time is required');
    if (duration < 1) return toast.error('Duration must be at least 1 minute');

    // Parse problems
    const problems = [];
    for (let i = 0; i < problemCodes.length; i++) {
      const code = problemCodes[i].trim();
      if (!code) continue;

      const parsed = parseProblemCode(code);
      if (!parsed) {
        toast.error(`Invalid problem code "${code}" at row ${i + 1}. Use format: 1234A or 1234/A`);
        return;
      }

      problems.push({
        contestId: parsed.contestId,
        problemIndex: parsed.problemIndex,
        order: LETTERS[i] || String(i + 1),
        problemName: '',
        points: 1,
      });
    }

    if (problems.length === 0) {
      toast.error('At least one problem is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        startTime: new Date(startTime).toISOString(),
        duration: Number(duration),
        problems,
        scoringType,
        penaltyTime: Number(penaltyTime),
        freezeTime: Number(freezeTime),
        visibility,
      };

      if (visibility === 'password' && password) {
        payload.password = password;
      }

      if (isEdit) {
        await api.put(`/contests/${id}`, payload);
        toast.success('Contest updated!');
      } else {
        const res = await api.post('/contests', payload);
        toast.success('Contest created!');
        navigate(`/contest/${res.data._id}`);
        return;
      }

      navigate('/admin');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save contest');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-text-muted mt-4">Loading contest...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
        <Link to="/admin" className="hover:text-primary transition">
          Admin
        </Link>
        <ChevronRight size={14} />
        <span className="text-text font-medium">{isEdit ? 'Edit Contest' : 'Create Contest'}</span>
      </div>

      <h1 className="text-xl font-bold text-text mb-6">{isEdit ? 'Edit Contest' : 'Create New Contest'}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div className="bg-card border border-border rounded-xl p-6">
          <label className="block text-sm font-semibold text-text mb-2">Contest Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly Contest #1"
            maxLength={200}
            className="w-full px-3 py-2 bg-dark border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-text-muted/50"
          />
        </div>

        {/* Description */}
        <div className="bg-card border border-border rounded-xl p-6">
          <label className="block text-sm font-semibold text-text mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional contest description..."
            rows={3}
            maxLength={5000}
            className="w-full px-3 py-2 bg-dark border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-text-muted/50 resize-y"
          />
        </div>

        {/* Timing */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-text mb-4">Timing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Start Time *</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 bg-dark border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Duration (minutes) *</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                min={1}
                max={10080}
                className="w-full px-3 py-2 bg-dark border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Scoring */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-text mb-4">Scoring</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Scoring Type</label>
              <select
                value={scoringType}
                onChange={(e) => setScoringType(e.target.value)}
                className="w-full px-3 py-2 bg-dark border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              >
                <option value="ICPC">ICPC</option>
                <option value="IOI">IOI</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Penalty (min/wrong)</label>
              <input
                type="number"
                value={penaltyTime}
                onChange={(e) => setPenaltyTime(e.target.value)}
                min={0}
                className="w-full px-3 py-2 bg-dark border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Freeze (min before end)</label>
              <input
                type="number"
                value={freezeTime}
                onChange={(e) => setFreezeTime(e.target.value)}
                min={0}
                className="w-full px-3 py-2 bg-dark border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Visibility */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-text mb-4">Visibility</h2>
          <div className="flex gap-4 mb-3">
            {['public', 'private', 'password'].map((v) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value={v}
                  checked={visibility === v}
                  onChange={(e) => setVisibility(e.target.value)}
                  className="accent-primary"
                />
                <span className="text-sm text-text capitalize">{v}</span>
              </label>
            ))}
          </div>
          {visibility === 'password' && (
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter contest password"
              className="w-full md:w-64 px-3 py-2 bg-dark border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-text-muted/50 mt-2"
            />
          )}
        </div>

        {/* Problems */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-text">Problems *</h2>
            <button
              type="button"
              onClick={addProblem}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary-light transition"
            >
              <Plus size={14} />
              Add Problem
            </button>
          </div>
          <p className="text-xs text-text-muted mb-4">
            Enter Codeforces problem codes like <code className="text-primary-light">4A</code>,{' '}
            <code className="text-primary-light">1234/B</code>, or <code className="text-primary-light">71A</code>. Problems are
            auto-assigned letters A, B, C...
          </p>
          <div className="space-y-2">
            {problemCodes.map((code, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-primary/10 text-primary font-bold text-xs shrink-0">
                  {LETTERS[i] || i + 1}
                </span>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => updateProblem(i, e.target.value)}
                  placeholder={`e.g. ${1000 + i}A`}
                  className="flex-1 px-3 py-2 bg-dark border border-border rounded-lg text-text text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-text-muted/50"
                />
                <button
                  type="button"
                  onClick={() => removeProblem(i)}
                  disabled={problemCodes.length <= 1}
                  className="p-2 text-text-muted hover:text-danger transition disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <Link to="/admin" className="text-sm text-text-muted hover:text-primary transition">
            &larr; Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                {isEdit ? 'Update Contest' : 'Create Contest'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
