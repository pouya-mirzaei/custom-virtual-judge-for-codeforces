import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Home, Trophy, User, Shield, LogIn, LogOut, UserPlus } from 'lucide-react';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navLink = (to, label, Icon, exact = false) => {
    const active = exact ? location.pathname === to : isActive(to);
    return (
      <Link
        to={to}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
          active ? 'bg-primary/20 text-primary-light' : 'text-text-muted hover:text-text hover:bg-card-hover'
        }`}
      >
        <Icon size={16} />
        {label}
      </Link>
    );
  };

  return (
    <nav className="sticky top-0 z-50 bg-darker/95 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Left: Logo + nav links */}
        <div className="flex items-center gap-1">
          <Link to="/" className="text-xl font-bold text-primary mr-4 hover:text-primary-light transition">
            algo404
          </Link>
          {navLink('/', 'Home', Home, true)}
          {navLink('/contests', 'Contests', Trophy)}
          {isAdmin && navLink('/admin', 'Admin', Shield)}
        </div>

        {/* Right: User menu */}
        <div className="flex items-center gap-1">
          {user ? (
            <>
              {navLink('/profile', user.username, User)}
              <button
                onClick={logout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-text-muted hover:text-danger hover:bg-danger/10 transition ml-1"
              >
                <LogOut size={16} />
                Logout
              </button>
            </>
          ) : (
            <>
              {navLink('/login', 'Sign In', LogIn)}
              {navLink('/register', 'Register', UserPlus)}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
