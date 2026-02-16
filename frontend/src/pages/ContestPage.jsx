import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { format, differenceInSeconds } from 'date-fns';
import { Clock, Trophy, Users, Calendar, LogIn, CheckCircle, XCircle, Loader2, BarChart3, FileText, Lock, X } from 'lucide-react';

function StatusBadge({ status }) {
  const styles = {
    RUNNING: 'bg-success/20 text-success',
    UPCOMING: 'bg-warning/20 text-warning',
    ENDED: 'bg-text-muted/20 text-text-muted',
  };
  return <span className={`text-sm font-semibold px-3 py-1 rounded-full ${styles[status] || styles.ENDED}`}>{status}</span>;
}

function ContestTimer({ contest }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const target = contest.status === 'UPCOMING' ? new Date(contest.startTime) : new Date(contest.endTime);
    const label = contest.status === 'UPCOMING' ? 'Starts in' : 'Ends in';

    const update = () => {
      const diff = differenceInSeconds(target, new Date());
      if (diff <= 0) {
        setTimeLeft('');
        return;
      }
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      const parts = [];
      if (d > 0) parts.push(`${d}d`);
      parts.push(`${h}h`, `${m}m`, `${s}s`);
      setTimeLeft(`${label}: ${parts.join(' ')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [contest]);

  if (!timeLeft) return null;
  return <p className="text-primary-light font-mono text-lg">{timeLeft}</p>;
}

const PROBLEM_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export default function ContestPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [contest, setContest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [contestPassword, setContestPassword] = useState('');

  useEffect(() => {
    const fetchContest = async () => {
      try {
        const { data } = await api.get(`/contests/${id}`);
        setContest(data);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load contest');
      } finally {
        setLoading(false);
      }
    };
    fetchContest();
  }, [id]);

  const handleJoin = async (password = '') => {
    if (!user) {
      toast.error('Please log in to join');
      return;
    }

    // If password-protected and no password provided, show the modal
    if (contest.visibility === 'password' && !password && !showPasswordModal) {
      setShowPasswordModal(true);
      return;
    }

    setJoining(true);
    try {
      await api.post(`/contests/${id}/join`, { password });
      toast.success('Joined contest!');
      setShowPasswordModal(false);
      setContestPassword('');
      const { data } = await api.get(`/contests/${id}`);
      setContest(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to join contest');
    } finally {
      setJoining(false);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (!contestPassword.trim()) {
      toast.error('Please enter the contest password');
      return;
    }
    handleJoin(contestPassword.trim());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-danger text-lg">{error}</p>
        <Link to="/" className="text-primary mt-4 inline-block hover:underline">
          Back to contests
        </Link>
      </div>
    );
  }

  const isParticipant = user && contest.participants?.some((p) => (p._id || p) === user._id);
  const canSeeProblems = contest.status !== 'UPCOMING' || isParticipant;

  return (
    <>
      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text flex items-center gap-2">
                <Lock size={18} className="text-primary" />
                Contest Password
              </h3>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setContestPassword('');
                }}
                className="text-text-muted hover:text-text transition"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-text-muted mb-4">This contest is password-protected. Enter the password to join.</p>
            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                value={contestPassword}
                onChange={(e) => setContestPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                className="w-full px-4 py-2.5 bg-dark border border-border rounded-lg text-text text-sm placeholder-text-muted/50 focus:outline-none focus:border-primary transition mb-4"
              />
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setContestPassword('');
                  }}
                  className="px-4 py-2 text-sm text-text-muted hover:text-text transition rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joining || !contestPassword.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition text-sm disabled:opacity-50"
                >
                  {joining ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                  {joining ? 'Joining...' : 'Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div>
        {/* Header */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-text">{contest.title}</h1>
              {contest.description && <p className="text-text-muted mt-1">{contest.description}</p>}
            </div>
            <StatusBadge status={contest.status} />
          </div>

          <ContestTimer contest={contest} />

          <div className="flex flex-wrap items-center gap-6 mt-4 text-sm text-text-muted">
            <span className="flex items-center gap-1.5">
              <Calendar size={15} />
              {format(new Date(contest.startTime), 'MMM d, yyyy HH:mm')}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={15} />
              {contest.duration} min
            </span>
            <span className="flex items-center gap-1.5">
              <Trophy size={15} />
              {contest.scoringType}
            </span>
            <span className="flex items-center gap-1.5">
              <Users size={15} />
              {contest.participants?.length || 0} participant{(contest.participants?.length || 0) !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Join / Status */}
          <div className="mt-5">
            {!user ? (
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition"
              >
                <LogIn size={16} />
                Log in to participate
              </Link>
            ) : isParticipant ? (
              <span className="inline-flex items-center gap-2 text-success text-sm font-medium">
                <CheckCircle size={16} />
                You are registered for this contest
              </span>
            ) : contest.status === 'ENDED' ? (
              <span className="inline-flex items-center gap-2 text-text-muted text-sm">
                <XCircle size={16} />
                Contest has ended
              </span>
            ) : (
              <button
                onClick={() => handleJoin()}
                disabled={joining}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {joining ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                {joining ? 'Joining...' : contest.visibility === 'password' ? 'Join Contest (Password)' : 'Join Contest'}
              </button>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="flex gap-3 mb-6">
          <Link
            to={`/contest/${id}/standings`}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-text-muted hover:text-text hover:border-primary/30 transition text-sm"
          >
            <BarChart3 size={16} />
            Standings
          </Link>
          <Link
            to={`/contest/${id}/submissions`}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-text-muted hover:text-text hover:border-primary/30 transition text-sm"
          >
            <FileText size={16} />
            My Submissions
          </Link>
        </div>

        {/* Problem List */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-text">Problems</h2>
          </div>

          {!canSeeProblems ? (
            <div className="p-6 text-center text-text-muted">Problems will be visible when the contest starts</div>
          ) : !contest.problems || contest.problems.length === 0 ? (
            <div className="p-6 text-center text-text-muted">No problems added yet</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-text-muted text-sm border-b border-border">
                  <th className="px-6 py-3 w-16">#</th>
                  <th className="px-6 py-3">Problem</th>
                  <th className="px-6 py-3 w-32 text-right">CF Source</th>
                </tr>
              </thead>
              <tbody>
                {contest.problems.map((p, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-card-hover transition">
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary font-bold text-sm">
                        {PROBLEM_LETTERS[i] || i + 1}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        to={`/contest/${id}/problem/${PROBLEM_LETTERS[i] || i + 1}`}
                        className="text-text hover:text-primary-light transition font-medium"
                      >
                        {p.title || `Problem ${PROBLEM_LETTERS[i] || i + 1}`}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-right text-text-muted text-sm font-mono">
                      {p.codeforcesContestId}/{p.codeforcesIndex}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
