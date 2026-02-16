import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useContestSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';
import { ChevronRight, Trophy, RefreshCw, Medal } from 'lucide-react';

function ProblemCell({ problemData }) {
  if (!problemData) return <td className="px-2 py-3 text-center text-text-muted text-sm">—</td>;

  const { solved, attempts, solveTime } = problemData;

  if (solved) {
    const wrongTries = attempts - 1;
    return (
      <td className="px-2 py-3 text-center">
        <div className="bg-success/15 rounded px-1 py-0.5">
          <div className="text-success font-bold text-sm">+{wrongTries > 0 ? wrongTries : ''}</div>
          <div className="text-success/70 text-xs">{solveTime}m</div>
        </div>
      </td>
    );
  }

  if (attempts > 0) {
    return (
      <td className="px-2 py-3 text-center">
        <div className="bg-danger/15 rounded px-1 py-0.5">
          <div className="text-danger font-bold text-sm">-{attempts}</div>
        </div>
      </td>
    );
  }

  return <td className="px-2 py-3 text-center text-text-muted text-sm">—</td>;
}

function RankBadge({ rank }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-500/20">
        <Medal size={14} className="text-yellow-400" />
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-300/20">
        <Medal size={14} className="text-gray-300" />
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-400/20">
        <Medal size={14} className="text-orange-400" />
      </span>
    );
  return <span className="text-text-muted text-sm font-mono">{rank}</span>;
}

export default function StandingsPage() {
  const { id: contestId } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStandings = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await api.get(`/standings/${contestId}`);
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load standings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStandings();
  }, [contestId]);

  // Live standings updates via Socket.io
  const handleStandingsUpdate = useCallback((standings) => {
    setData(standings);
  }, []);

  useContestSocket(contestId, { onStandingsUpdate: handleStandingsUpdate });

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="text-text-muted mt-4">Loading standings...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <p className="text-danger mb-4">Failed to load standings</p>
        <Link to={`/contest/${contestId}`} className="text-primary hover:text-primary-light transition">
          &larr; Back to contest
        </Link>
      </div>
    );
  }

  const { problems, standings } = data;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
        <Link to={`/contest/${contestId}`} className="hover:text-primary transition">
          {data.contestTitle || 'Contest'}
        </Link>
        <ChevronRight size={14} />
        <span className="text-text font-medium">Standings</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text flex items-center gap-3">
          <Trophy size={22} className="text-primary" />
          Standings
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted px-2 py-1 bg-card border border-border rounded">
            {data.scoringType?.toUpperCase() || 'ICPC'}
          </span>
          <button
            onClick={() => fetchStandings(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-card border border-border rounded-lg text-text-muted hover:text-text hover:border-primary/30 transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Standings table */}
      {standings.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Trophy size={32} className="mx-auto text-text-muted mb-3" />
          <p className="text-text-muted">No standings yet — waiting for submissions</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-text-muted text-xs uppercase border-b border-border">
                  <th className="px-3 py-3 w-14 text-center">#</th>
                  <th className="px-3 py-3">User</th>
                  <th className="px-3 py-3 text-center w-16">Solved</th>
                  <th className="px-3 py-3 text-center w-20">Penalty</th>
                  {problems.map((p) => (
                    <th key={p.problemId} className="px-2 py-3 text-center w-20">
                      <Link
                        to={`/contest/${contestId}/problem/${p.order}`}
                        className="hover:text-primary transition font-bold"
                        title={p.problemName}
                      >
                        {p.order}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => {
                  const isCurrentUser = user && row.userId?._id === user._id;
                  // Build a map of problemId → standing data for this user
                  const problemMap = {};
                  (row.problems || []).forEach((p) => {
                    problemMap[p.problemId] = p;
                  });

                  return (
                    <tr
                      key={row._id}
                      className={`border-b border-border/50 hover:bg-card-hover transition ${isCurrentUser ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-3 py-3 text-center">
                        <RankBadge rank={row.rank} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium text-sm ${isCurrentUser ? 'text-primary-light' : 'text-text'}`}>
                            {row.userId?.username || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-bold text-text">{row.problemsSolved}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-text-muted font-mono">{row.totalPenalty}</td>
                      {problems.map((p) => (
                        <ProblemCell key={p.problemId} problemData={problemMap[p.problemId]} />
                      ))}
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
