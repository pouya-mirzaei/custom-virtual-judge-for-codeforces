import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import ContestPage from './pages/ContestPage';
import ProblemPage from './pages/ProblemPage';
import SubmitPage from './pages/SubmitPage';
import SubmissionsPage from './pages/SubmissionsPage';
import StandingsPage from './pages/StandingsPage';
import AdminPage from './pages/AdminPage';
import AdminContestFormPage from './pages/AdminContestFormPage';
import AdminProblemStatementsPage from './pages/AdminProblemStatementsPage';
import SubmissionDetailPage from './pages/SubmissionDetailPage';

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-text-muted">Loading...</div>;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#242438',
                color: '#e0e0f0',
                border: '1px solid #333355',
              },
            }}
          />
          <Routes>
            {/* Auth pages — no navbar */}
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <LoginPage />
                </GuestRoute>
              }
            />
            <Route
              path="/register"
              element={
                <GuestRoute>
                  <RegisterPage />
                </GuestRoute>
              }
            />

            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/contests" element={<HomePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/contest/:id" element={<ContestPage />} />
              <Route path="/contest/:id/problem/:order" element={<ProblemPage />} />
              <Route path="/contest/:id/problem/:order/submit" element={<SubmitPage />} />
              <Route path="/contest/:id/submissions" element={<SubmissionsPage />} />
              <Route path="/contest/:id/submission/:subId" element={<SubmissionDetailPage />} />
              <Route path="/contest/:id/standings" element={<StandingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/contest/new" element={<AdminContestFormPage />} />
              <Route path="/admin/contest/:id/edit" element={<AdminContestFormPage />} />
              <Route path="/admin/contest/:id/statements" element={<AdminProblemStatementsPage />} />
            </Route>
          </Routes>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
