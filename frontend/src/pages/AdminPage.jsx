import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  Plus,
  Users,
  Trophy,
  Shield,
  Edit,
  UserCheck,
  UserX,
  Link2,
  Unlink,
  CheckCircle,
  AlertCircle,
  Loader2,
  Settings,
  FileText,
} from 'lucide-react';

function ContestRow({ contest }) {
  return (
    <tr className="border-b border-border/50 hover:bg-card-hover transition">
      <td className="px-4 py-3">
        <Link to={`/contest/${contest._id}`} className="text-text hover:text-primary-light transition font-medium text-sm">
          {contest.title}
        </Link>
      </td>
      <td className="px-4 py-3">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            contest.status === 'running'
              ? 'bg-success/15 text-success'
              : contest.status === 'upcoming'
                ? 'bg-warning/15 text-warning'
                : 'bg-text-muted/15 text-text-muted'
          }`}
        >
          {contest.status?.toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-text-muted">{format(new Date(contest.startTime), 'MMM d, yyyy HH:mm')}</td>
      <td className="px-4 py-3 text-sm text-text-muted">{contest.duration}m</td>
      <td className="px-4 py-3 text-sm text-text-muted">{contest.problems?.length || 0}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <Link
            to={`/admin/contest/${contest._id}/edit`}
            className="inline-flex items-center gap-1 text-text-muted hover:text-primary transition text-sm"
          >
            <Edit size={14} />
            Edit
          </Link>
          <Link
            to={`/admin/contest/${contest._id}/statements`}
            className="inline-flex items-center gap-1 text-text-muted hover:text-primary transition text-sm"
          >
            <FileText size={14} />
            Statements
          </Link>
        </div>
      </td>
    </tr>
  );
}

function UserRow({ u, onRoleChange }) {
  const [changing, setChanging] = useState(false);

  const toggleRole = async () => {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    setChanging(true);
    try {
      await api.put(`/admin/users/${u._id}/role`, { role: newRole });
      toast.success(`${u.username} is now ${newRole}`);
      onRoleChange(u._id, newRole);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change role');
    } finally {
      setChanging(false);
    }
  };

  return (
    <tr className="border-b border-border/50 hover:bg-card-hover transition">
      <td className="px-4 py-3 text-sm text-text font-medium">{u.username}</td>
      <td className="px-4 py-3 text-sm text-text-muted">{u.email}</td>
      <td className="px-4 py-3">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            u.role === 'admin' ? 'bg-primary/15 text-primary-light' : 'bg-text-muted/15 text-text-muted'
          }`}
        >
          {u.role}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={toggleRole}
          disabled={changing}
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary transition disabled:opacity-50"
          title={u.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
        >
          {u.role === 'admin' ? <UserX size={14} /> : <UserCheck size={14} />}
          {u.role === 'admin' ? 'Demote' : 'Promote'}
        </button>
      </td>
    </tr>
  );
}

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [contests, setContests] = useState([]);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState('contests');
  const [loading, setLoading] = useState(true);

  // CF Settings state
  const [cfStatus, setCfStatus] = useState(null);
  const [cfCookies, setCfCookies] = useState('');
  const [cfLinking, setCfLinking] = useState(false);
  const [cfUnlinking, setCfUnlinking] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    loadData();
  }, [isAdmin]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [contestsRes, usersRes, cfRes] = await Promise.all([
        api.get('/contests'),
        api.get('/admin/users'),
        api.get('/admin/cf-status'),
      ]);
      setContests(contestsRes.data);
      setUsers(usersRes.data);
      setCfStatus(cfRes.data);
    } catch (err) {
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (userId, newRole) => {
    setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, role: newRole } : u)));
  };

  const handleCfLink = async (e) => {
    e.preventDefault();
    if (!cfCookies.trim()) {
      toast.error('Please paste the Codeforces cookies');
      return;
    }
    setCfLinking(true);
    try {
      const { data } = await api.post('/admin/cf-cookies', { cookies: cfCookies.trim() });
      toast.success(`Platform CF account linked as ${data.codeforcesHandle}`);
      setCfCookies('');
      setCfStatus({ linked: true, codeforcesHandle: data.codeforcesHandle, cookiesValidatedAt: data.cookiesValidatedAt });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to link CF account');
    } finally {
      setCfLinking(false);
    }
  };

  const handleCfUnlink = async () => {
    setCfUnlinking(true);
    try {
      await api.delete('/admin/cf-cookies');
      toast.success('Platform CF account unlinked');
      setCfStatus({ linked: false });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to unlink');
    } finally {
      setCfUnlinking(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-text-muted mt-4">Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text flex items-center gap-3">
          <Shield size={22} className="text-primary" />
          Admin Panel
        </h1>
        <Link
          to="/admin/contest/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition text-sm"
        >
          <Plus size={16} />
          Create Contest
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-card border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('contests')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
            tab === 'contests' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
          }`}
        >
          <Trophy size={14} />
          Contests ({contests.length})
        </button>
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
            tab === 'users' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
          }`}
        >
          <Users size={14} />
          Users ({users.length})
        </button>
        <button
          onClick={() => setTab('cf')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
            tab === 'cf' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
          }`}
        >
          <Settings size={14} />
          CF Settings
        </button>
      </div>

      {/* Contests Tab */}
      {tab === 'contests' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {contests.length === 0 ? (
            <div className="p-8 text-center text-text-muted">No contests yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-text-muted text-xs uppercase border-b border-border">
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Start</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Problems</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {contests.map((c) => (
                    <ContestRow key={c._id} contest={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-text-muted text-xs uppercase border-b border-border">
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow key={u._id} u={u} onRoleChange={handleRoleChange} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CF Settings Tab */}
      {tab === 'cf' && (
        <div className="max-w-2xl">
          <div className="bg-card border border-border rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-text mb-2">Platform Codeforces Account</h2>
            <p className="text-sm text-text-muted mb-4">
              All submissions from users go through this Codeforces account. Only one account can be active at a time.
            </p>

            {cfStatus?.linked ? (
              <div>
                <div className="flex items-center gap-3 mb-4 p-4 bg-success/10 border border-success/20 rounded-lg">
                  <CheckCircle size={20} className="text-success" />
                  <div>
                    <p className="text-text font-medium">
                      Linked as{' '}
                      <a
                        href={`https://codeforces.com/profile/${cfStatus.codeforcesHandle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary-light transition underline"
                      >
                        {cfStatus.codeforcesHandle}
                      </a>
                    </p>
                    {cfStatus.cookiesValidatedAt && (
                      <p className="text-text-muted text-sm mt-0.5">
                        Validated: {format(new Date(cfStatus.cookiesValidatedAt), 'MMM d, yyyy HH:mm')}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleCfUnlink}
                  disabled={cfUnlinking}
                  className="flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger border border-danger/20 rounded-lg hover:bg-danger/20 transition disabled:opacity-50"
                >
                  {cfUnlinking ? <Loader2 size={16} className="animate-spin" /> : <Unlink size={16} />}
                  {cfUnlinking ? 'Unlinking...' : 'Unlink CF Account'}
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-start gap-3 mb-4 p-4 bg-warning/10 border border-warning/20 rounded-lg">
                  <AlertCircle size={20} className="text-warning mt-0.5" />
                  <div>
                    <p className="text-text font-medium">No Codeforces account linked</p>
                    <p className="text-text-muted text-sm mt-1">Users cannot submit solutions until you link a CF account here.</p>
                  </div>
                </div>

                <div className="mb-4 p-4 bg-dark rounded-lg border border-border">
                  <h3 className="text-sm font-semibold text-text mb-2">How to get the cookies:</h3>
                  <ol className="text-sm text-text-muted space-y-1.5 list-decimal list-inside">
                    <li>Open Codeforces in your browser and log in</li>
                    <li>
                      Open DevTools (<code className="text-primary-light">F12</code>) → Application → Cookies
                    </li>
                    <li>Copy the full cookie string (all cookies for codeforces.com)</li>
                    <li>
                      Must include: <code className="text-primary-light">JSESSIONID</code>,{' '}
                      <code className="text-primary-light">cf_clearance</code>, and <code className="text-primary-light">X-User</code>
                    </li>
                    <li>Paste the entire string below</li>
                  </ol>
                </div>

                <form onSubmit={handleCfLink}>
                  <textarea
                    value={cfCookies}
                    onChange={(e) => setCfCookies(e.target.value)}
                    placeholder="Paste the Codeforces cookie string here..."
                    rows={4}
                    className="w-full px-4 py-3 bg-dark border border-border rounded-lg text-text text-sm font-mono placeholder-text-muted/50 focus:outline-none focus:border-primary transition resize-none"
                  />
                  <button
                    type="submit"
                    disabled={cfLinking || !cfCookies.trim()}
                    className="mt-3 flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cfLinking ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                    {cfLinking ? 'Validating & Linking...' : 'Link Codeforces Account'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
