import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { UserPlus } from 'lucide-react';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await register(username.trim(), email.trim(), password);
      toast.success('Account created successfully');
      navigate('/');
    } catch (err) {
      const data = err.response?.data;
      if (data?.details && Array.isArray(data.details)) {
        data.details.forEach((d) => toast.error(d.message));
      } else {
        toast.error(data?.error || 'Registration failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">algo404</h1>
          <p className="text-text-muted mt-1">Create a new account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3-30 characters, alphanumeric"
              className="w-full px-4 py-3 bg-dark border border-border rounded-lg text-text placeholder-text-muted/50 focus:outline-none focus:border-primary transition"
              autoFocus
              required
              minLength={3}
              maxLength={30}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-dark border border-border rounded-lg text-text placeholder-text-muted/50 focus:outline-none focus:border-primary transition"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full px-4 py-3 bg-dark border border-border rounded-lg text-text placeholder-text-muted/50 focus:outline-none focus:border-primary transition"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="w-full px-4 py-3 bg-dark border border-border rounded-lg text-text placeholder-text-muted/50 focus:outline-none focus:border-primary transition"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus size={18} />
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-text-muted mt-6 text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:text-primary-light transition">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
