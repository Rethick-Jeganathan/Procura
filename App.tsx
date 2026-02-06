import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Sidebar from './components/Sidebar';
import LandingPage from './pages/LandingPage';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import SubmissionsQueue from './pages/SubmissionsQueue';
import AuditVault from './pages/AuditVault';
import SubmissionWorkspace from './pages/SubmissionWorkspace';
import AccessDenied from './pages/AccessDenied';
import AdminDashboard from './pages/AdminDashboard';
import Settings from './pages/Settings';
import DocumentLibrary from './pages/DocumentLibrary';
import FollowUps from './pages/FollowUps';
import Correspondence from './pages/Correspondence';
import NotFound from './pages/NotFound';

// Protected Route wrapper with optional role-based access control
const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <div className="animate-spin h-8 w-8 border-2 border-gray-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Require authentication
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Role-based access check
  if (allowedRoles) {
    const userRole = (user as any).user_metadata?.role || 'viewer';
    if (!allowedRoles.includes(userRole)) {
      return <Navigate to="/access-denied" replace />;
    }
  }

  return <>{children}</>;
};

// Main App Layout with Sidebar
const AppLayout: React.FC = () => {
  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden">
      <Sidebar />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/submissions" element={<SubmissionsQueue />} />
        <Route path="/audit" element={<AuditVault />} />
        <Route path="/workspace" element={<SubmissionWorkspace />} />
        <Route path="/workspace/:submissionId" element={<SubmissionWorkspace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/documents" element={<DocumentLibrary />} />
        <Route path="/follow-ups" element={<FollowUps />} />
        <Route path="/correspondence" element={<Correspondence />} />
        <Route path="/access-denied" element={<AccessDenied />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Landing Page with Auth */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Admin Dashboard - Full page, no sidebar, admin-only */}
          <Route path="/admin/*" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />

          {/* Main App with Sidebar */}
          <Route path="/*" element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
