import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { Trophy, Clock, Users, Calendar, ArrowRight } from 'lucide-react';
import { format, formatDistanceToNow, differenceInSeconds } from 'date-fns';

function StatusBadge({ status }) {
  const styles = {
    RUNNING: 'bg-success/20 text-success',
    UPCOMING: 'bg-warning/20 text-warning',
    ENDED: 'bg-text-muted/20 text-text-muted',
  };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${styles[status] || styles.ENDED}`}>{status}</span>;
}

function CountdownTimer({ targetDate, label }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = differenceInSeconds(new Date(targetDate), new Date());
      if (diff <= 0) {
        setTimeLeft('now');
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <span className="text-xs text-text-muted">
      {label}: <span className="text-primary-light font-mono">{timeLeft}</span>
    </span>
  );
}

function ContestCard({ contest }) {
  const start = new Date(contest.startTime);
  const end = new Date(contest.endTime);
  const isRunning = contest.status === 'RUNNING';
  const isUpcoming = contest.status === 'UPCOMING';

  return (
    <Link
      to={`/contest/${contest._id}`}
      className="block bg-card border border-border rounded-xl p-5 hover:bg-card-hover hover:border-primary/30 transition group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-text group-hover:text-primary-light transition truncate pr-3">{contest.title}</h3>
        <StatusBadge status={contest.status} />
      </div>

      {contest.description && <p className="text-sm text-text-muted mb-3 line-clamp-2">{contest.description}</p>}

      <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted">
        <span className="flex items-center gap-1.5">
          <Calendar size={14} />
          {format(start, 'MMM d, yyyy HH:mm')}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={14} />
          {contest.duration} min
        </span>
        <span className="flex items-center gap-1.5">
          <Trophy size={14} />
          {contest.scoringType}
        </span>
        {contest.problems && (
          <span className="flex items-center gap-1.5">
            <Users size={14} />
            {contest.problems.length} problem{contest.problems.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isRunning && (
        <div className="mt-3">
          <CountdownTimer targetDate={end} label="Ends in" />
        </div>
      )}
      {isUpcoming && (
        <div className="mt-3">
          <CountdownTimer targetDate={start} label="Starts in" />
        </div>
      )}

      <div className="mt-3 flex items-center gap-1 text-primary text-sm opacity-0 group-hover:opacity-100 transition">
        {isRunning ? 'Enter contest' : isUpcoming ? 'View details' : 'View results'}
        <ArrowRight size={14} />
      </div>
    </Link>
  );
}

export default function HomePage() {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchContests = async () => {
      try {
        const { data } = await api.get('/contests');
        setContests(data);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load contests');
      } finally {
        setLoading(false);
      }
    };
    fetchContests();
  }, []);

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
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  const running = contests.filter((c) => c.status === 'RUNNING');
  const upcoming = contests.filter((c) => c.status === 'UPCOMING');
  const ended = contests.filter((c) => c.status === 'ENDED');

  const Section = ({ title, items, emptyText }) => (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-text mb-4">{title}</h2>
      {items.length === 0 ? (
        <p className="text-text-muted text-sm">{emptyText}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <ContestCard key={c._id} contest={c} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-primary">Contests</h1>
        <p className="text-text-muted mt-1">Browse and participate in programming contests</p>
      </div>

      {running.length > 0 && <Section title="🔴 Running Now" items={running} emptyText="" />}
      <Section title="Upcoming" items={upcoming} emptyText="No upcoming contests" />
      <Section title="Past Contests" items={ended} emptyText="No past contests yet" />
    </div>
  );
}
