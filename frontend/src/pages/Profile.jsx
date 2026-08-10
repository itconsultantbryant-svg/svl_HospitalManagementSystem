import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../Layout';
import { api } from '../api';

export default function Profile({ user, onLogout }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.uhpcms
      .getMe()
      .then((r) => {
        if (!cancelled) setDetail(r.user || null);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load profile');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const u = detail || user;

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="page-enter page-enter-active">
        <h2 className="section-title">My profile</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
          Your account details and organization context.
        </p>

        {loading && <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}
        {error && !loading && (
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem', borderColor: 'var(--color-danger, #c00)' }}>
            {error}
          </div>
        )}

        {!loading && (
          <div className="card" style={{ padding: '1.5rem', maxWidth: 560 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--color-primary, #1e3a5f), var(--color-primary-light, #2d5a8a))',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
                fontWeight: 700,
                marginBottom: '1rem',
              }}
            >
              {(u?.full_name || u?.username || u?.email || 'U').toString().charAt(0).toUpperCase()}
            </div>
            <dl className="profile-dl">
              <dt>Name</dt>
              <dd>{u?.full_name || u?.username || '—'}</dd>
              <dt>Email</dt>
              <dd>{u?.email || '—'}</dd>
              <dt>Role</dt>
              <dd><span className="badge">{(u?.role || '').replace(/_/g, ' ') || '—'}</span></dd>
              {u?.org_name && (
                <>
                  <dt>Organization</dt>
                  <dd>{u.org_name}</dd>
                </>
              )}
              {!u?.org_name && u?.org_id && (
                <>
                  <dt>Organization ID</dt>
                  <dd><code style={{ fontSize: '0.85rem' }}>{u.org_id}</code></dd>
                </>
              )}
              {u?.department_name && (
                <>
                  <dt>Department</dt>
                  <dd>{u.department_name}</dd>
                </>
              )}
              {Array.isArray(u?.enabled_modules) && u.enabled_modules.length > 0 && (
                <>
                  <dt>Modules</dt>
                  <dd>{u.enabled_modules.join(', ')}</dd>
                </>
              )}
              {u?.legacy && (
                <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  Legacy HMS account. Some fields may be limited.
                </p>
              )}
            </dl>
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link to="/settings" className="btn btn-primary">Account settings</Link>
              <Link to="/dashboard" className="btn">Back to dashboard</Link>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
