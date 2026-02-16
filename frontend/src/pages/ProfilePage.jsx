import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { User, Mail, Shield } from 'lucide-react';

export default function ProfilePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-primary mb-6">Profile</h1>

      {/* User Info */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text mb-4">Account Info</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-text">
            <User size={18} className="text-text-muted" />
            <span className="text-text-muted w-20">Username</span>
            <span className="font-medium">{user.username}</span>
          </div>
          <div className="flex items-center gap-3 text-text">
            <Mail size={18} className="text-text-muted" />
            <span className="text-text-muted w-20">Email</span>
            <span className="font-medium">{user.email}</span>
          </div>
          <div className="flex items-center gap-3 text-text">
            <Shield size={18} className="text-text-muted" />
            <span className="text-text-muted w-20">Role</span>
            <span className={`font-medium ${user.role === 'admin' ? 'text-warning' : ''}`}>{user.role}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
