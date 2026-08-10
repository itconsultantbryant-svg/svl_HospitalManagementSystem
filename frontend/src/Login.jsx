import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from './api';

const ROLES = [
  { value: 'administrator', label: 'Administrator' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'pharmacist', label: 'Pharmacist' },
  { value: 'representative', label: 'Representative' },
  { value: 'patient', label: 'Patient' },
  { value: 'lab', label: 'Laboratory' },
];

const DEFAULT_BRAND = {
  name: 'U-HPCMS',
  kind: 'platform',
};

/** Pick the post-login landing page from the user's role / permissions. */
function postLoginPath(user) {
  const role = String(user?.role || '').toLowerCase();
  if (role.includes('super_admin')) return '/governance';
  if (role.includes('accountant')) return '/finance-dashboard';
  if (user?.org_id && (role.includes('org_admin') || role.includes('administrator'))) return '/org-admin';
  return '/dashboard';
}

function BrandLogo({ branding, size = 72 }) {
  const name = branding?.name || DEFAULT_BRAND.name;
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') || 'U';
  if (branding?.logo) {
    return (
      <img
        src={branding.logo}
        alt={`${name} logo`}
        className="login-logo-img"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div className="login-logo-fallback" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState('uhpcms'); // 'legacy' | 'uhpcms'
  const [role, setRole] = useState('administrator');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-login branding resolution
  const [branding, setBranding] = useState(null); // resolved org branding
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandSource, setBrandSource] = useState('default'); // 'default' | 'url' | 'email'
  const debounceRef = useRef(null);

  // Resolve branding from a query param (?org=org_id) on mount.
  useEffect(() => {
    const orgParam = searchParams.get('org');
    if (!orgParam) return;
    let cancelled = false;
    setBrandingLoading(true);
    api.uhpcms
      .orgBranding({ org_id: orgParam })
      .then((res) => {
        if (!cancelled && res?.ok && res.branding) {
          setBranding(res.branding);
          setBrandSource('url');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBrandingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Debounce email → org branding lookup while typing (uhpcms mode only).
  useEffect(() => {
    if (mode !== 'uhpcms' || !email.trim()) {
      setBranding(null);
      setBrandSource('default');
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setBrandingLoading(true);
      api.uhpcms
        .orgBranding({ email: email.trim() })
        .then((res) => {
          if (res?.ok && res.branding) {
            setBranding(res.branding);
            setBrandSource('email');
          } else {
            setBranding(null);
            setBrandSource('default');
          }
        })
        .catch(() => {
          setBranding(null);
          setBrandSource('default');
        })
        .finally(() => setBrandingLoading(false));
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [email, mode]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'uhpcms') {
        const res = await api.uhpcms.login(email, password);
        if (res.ok && res.token && res.user) {
          sessionStorage.setItem('uhpcms_token', res.token);
          onLogin(res.user);
          navigate(postLoginPath(res.user), { replace: true });
          return;
        }
      } else {
        const res = await api.uhpcms.legacyLogin(role, username, password);
        if (res.ok && res.token && res.user) {
          sessionStorage.setItem('uhpcms_token', res.token);
          onLogin(res.user);
          navigate(postLoginPath(res.user), { replace: true });
          return;
        }
        const legacy = await api.login(role, username, password);
        if (legacy.ok) {
          onLogin({ id: legacy.id, role: legacy.role, username: legacy.username });
          const isAccountant = (legacy.role || '').toLowerCase().includes('accountant');
          navigate(isAccountant ? '/finance-dashboard' : '/dashboard', { replace: true });
          return;
        }
      }
    } catch (err) {
      const msg = err.message || 'Login failed';
      setError(msg);
      if (msg.toLowerCase().includes('suspended')) {
        setError('Organization is suspended. Contact your administrator or Super-Admin to reactivate.');
      }
    } finally {
      setLoading(false);
    }
  }

  const activeBrand = branding || DEFAULT_BRAND;
  const isDefault = brandSource === 'default';
  const brandSubtitle = !isDefault && branding
    ? [branding.kind, branding.address, branding.phone, branding.email, branding.country].filter(Boolean).join(' · ')
    : 'Secure Multi-Tenant Hospital, Clinic & Pharmacy Management';

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <BrandLogo branding={isDefault ? null : branding} />
          {brandingLoading && <span className="login-brand-spinner" aria-label="Checking organization" />}
          <h1 className="login-title">{activeBrand.name}</h1>
          <p className="login-subtitle">{brandSubtitle}</p>
          {!isDefault && branding?.parent_name && branding?.kind === 'branch' && (
            <p className="login-org-note">Branch of {branding.parent_name}</p>
          )}
          {isDefault && <p className="login-org-note">Powered by Softwarevala Liberia</p>}
        </div>

        <div className="currency-switcher" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
          <button type="button" className={`btn-currency ${mode === 'legacy' ? 'active' : ''}`} onClick={() => setMode('legacy')}>
            Role / Username
          </button>
          <button type="button" className={`btn-currency ${mode === 'uhpcms' ? 'active' : ''}`} onClick={() => setMode('uhpcms')}>
            Email (U-HPCMS)
          </button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {mode === 'uhpcms' ? (
            <>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="e.g. super@uhpcms.local" />
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Password" />
            </>
          ) : (
            <>
              <label htmlFor="role">Role</label>
              <select id="role" value={role} onChange={(e) => setRole(e.target.value)} required>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <label htmlFor="username">Username</label>
              <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="Username" />
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Password" />
            </>
          )}
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {isDefault && (
          <div className="login-demo-list" style={{ textAlign: 'left', marginTop: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            <p style={{ margin: '0.25rem 0' }}><strong>Super Admin:</strong> super@uhpcms.local / admin123</p>
          </div>
        )}
      </div>
    </div>
  );
}
