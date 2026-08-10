import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { CurrencyProvider } from './context/CurrencyContext';
import Login from './Login';
import Dashboard from './Dashboard';
import Governance from './pages/Governance';
import Billing from './pages/Billing';
import PatientFlow from './pages/PatientFlow';
import Patients from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import LegacyEmployees from './pages/LegacyEmployees';
import LegacyPatients from './pages/LegacyPatients';
import OpdQueue from './pages/OpdQueue';
import Reporting from './pages/Reporting';
import AuditLog from './pages/AuditLog';
import OrgAdmin from './pages/OrgAdmin';
import Lab from './pages/Lab';
import Inpatient from './pages/Inpatient';
import Pharmacy from './pages/Pharmacy';
import Appointments from './pages/Appointments';
import Departments from './pages/Departments';
import Doctors from './pages/Doctors';
import Schedule from './pages/Schedule';
import Noticeboard from './pages/Noticeboard';
import CaseManager from './pages/CaseManager';
import Activities from './pages/Activities';
import Insurance from './pages/Insurance';
import Beds from './pages/Beds';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import HRM from './pages/HRM';
import Prescriptions from './pages/Prescriptions';
import FinanceDashboard from './pages/FinanceDashboard';
import FinanceReports from './pages/FinanceReports';
import Search from './pages/Search';
import Profile from './pages/Profile';
import Websites from './pages/Websites';
import PublicSite from './pages/PublicSite';
import DoctorWorkflow from './pages/DoctorWorkflow';
import OperationsNotifications from './pages/OperationsNotifications';
import HelpGuide from './pages/HelpGuide';
import { api } from './api';
import { hasPermission } from './utils/permissions';

const USER_KEY = 'hms_user';

function hasRole(user, allowed) {
  const role = String(user?.role || '').toLowerCase();
  return allowed.some((r) => role.includes(r));
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const s = sessionStorage.getItem(USER_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });
  const [backendOk, setBackendOk] = useState(null);

  useEffect(() => {
    api.health()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    sessionStorage.setItem(USER_KEY, JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem('uhpcms_token');
  };

  if (backendOk === false) {
    return (
      <div className="backend-error-page">
        <div>
          <h2>Backend not reachable</h2>
          <p>Start the API with: <code>cd backend && npm start</code></p>
          <p>Expected: <code>http://localhost:3000</code></p>
        </div>
      </div>
    );
  }

  return (
    <CurrencyProvider>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />} />
        {/* Public hospital website — no auth required */}
        <Route path="/h/:orgId" element={<PublicSite />} />
        <Route path="/dashboard" element={user ? (user.role && String(user.role).toLowerCase().includes('accountant') ? <Navigate to="/finance-dashboard" replace /> : <Dashboard user={user} onLogout={handleLogout} />) : <Navigate to="/login" replace />} />
        <Route path="/governance" element={user ? (hasPermission(user, 'governance:view') ? <Governance user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/billing" element={user ? (hasPermission(user, 'billing:view') ? <Billing user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/workflow" element={user ? ((hasRole(user, ['doctor', 'receptionist', 'representative', 'admin', 'super_admin']) || hasPermission(user, 'encounters:create')) ? <PatientFlow user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/patient-flow" element={user ? ((hasRole(user, ['doctor', 'receptionist', 'representative', 'admin', 'super_admin']) || hasPermission(user, 'encounters:create')) ? <PatientFlow user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/register-patient" element={user ? ((hasRole(user, ['doctor', 'receptionist', 'representative', 'admin', 'super_admin']) || hasPermission(user, 'patients:create')) ? <PatientFlow user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/patients" element={user ? (hasPermission(user, 'patients:view') ? <Patients user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/patients/:id" element={user ? <PatientDetail user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/patients/:id/edit" element={user ? <PatientDetail user={user} onLogout={handleLogout} initialTab="edit" /> : <Navigate to="/login" replace />} />
        <Route path="/employees" element={user ? <LegacyEmployees user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/legacy-patients" element={user ? <LegacyPatients user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/opd" element={user ? <OpdQueue user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/org-admin" element={user ? (hasPermission(user, 'org_admin:manage_users') ? <OrgAdmin user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/lab" element={user ? (hasPermission(user, 'lab:view') ? <Lab user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/inpatient" element={user ? <Inpatient user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/pharmacy" element={user ? (hasPermission(user, 'pharmacy:view') ? <Pharmacy user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/appointments" element={user ? <Appointments user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/departments" element={user ? <Departments user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/doctors" element={user ? <Doctors user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/doctor-workflow" element={user ? ((hasRole(user, ['doctor', 'admin', 'super_admin']) || hasPermission(user, 'encounters:view')) ? <DoctorWorkflow user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/schedule" element={user ? <Schedule user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/noticeboard" element={user ? <Noticeboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/operations-notifications" element={user ? <OperationsNotifications user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/cases" element={user ? <CaseManager user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/activities" element={user ? <Activities user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/insurance" element={user ? <Insurance user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/beds" element={user ? <Beds user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/chat" element={user ? <Chat user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/settings" element={user ? <Settings user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/hrm" element={user ? <HRM user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/prescriptions" element={user ? <Prescriptions user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/finance-dashboard" element={user ? ((hasRole(user, ['accountant', 'admin', 'super_admin']) || hasPermission(user, 'billing:view')) ? <FinanceDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/finance-reports" element={user ? ((hasRole(user, ['accountant', 'admin', 'super_admin']) || hasPermission(user, 'reporting:view')) ? <FinanceReports user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/search" element={user ? <Search user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/profile" element={user ? <Profile user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/websites" element={user ? ((user.role && ['super_admin', 'role_super_admin'].includes(String(user.role).toLowerCase())) ? <Websites user={user} onLogout={handleLogout} /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/help" element={user ? <HelpGuide user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/reporting" element={user ? <Reporting user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/audit" element={user ? <AuditLog user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />} />
        <Route path="/" element={<Navigate to={user ? (user.role && (String(user.role).toLowerCase().includes('accountant') ? '/finance-dashboard' : '/dashboard')) : '/login'} replace />} />
        <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </CurrencyProvider>
  );
}
