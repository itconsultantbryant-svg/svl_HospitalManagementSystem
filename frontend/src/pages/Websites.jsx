import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../Layout';
import { api } from '../api';

export default function Websites({ user, onLogout }) {
  const role = (user?.role || '').toLowerCase();
  const isSuper = ['super_admin', 'role_super_admin'].includes(role);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOrgs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api.uhpcms.getOrganizations();
      setOrgs(res?.data || []);
    } catch (err) { setError(err.message || 'Failed to load organizations'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const siteUrl = (org) => `/h/${org.website_slug || org.id}`;
  const hasSite = (org) => Boolean(org.website_slug);

  if (!isSuper) {
    return (
      <Layout user={user} onLogout={onLogout}>
        <div className="error-state">Access denied. Super-admin only.</div>
      </Layout>
    );
  }

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="page-enter page-enter-active">
        <h2 style={{ marginTop: 0 }}>Hospital Websites</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
          Every organization can have its own public website at <code>/h/&lt;slug&gt;</code>. Assign a
          website slug from <strong>Governance → Edit</strong> or <strong>Org setup → Branding</strong>; once
          assigned, each hospital&apos;s staff see the 🌐 icon in the topbar linking straight to their site.
        </p>

        {error && <div className="login-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {loading ? (
          <div className="loading-state">Loading…</div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Organization</th><th>Kind</th><th>Website Slug</th><th>Public URL</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {orgs.map((org) => (
                    <tr key={org.id}>
                      <td>
                        <strong>{org.name}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{org.id}</div>
                      </td>
                      <td><span className="badge">{org.kind || org.type || '—'}</span></td>
                      <td>
                        {hasSite(org) ? (
                          <code style={{ color: 'var(--color-primary, #2563eb)' }}>{org.website_slug}</code>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>Not assigned</span>
                        )}
                      </td>
                      <td>
                        <Link
                          to={siteUrl(org)}
                          className="btn"
                          style={{ padding: '0.25rem 0.6rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          title="Open public website"
                        >
                          🌐 {hasSite(org) ? org.website_slug : org.id}
                        </Link>
                      </td>
                      <td>{org.status}</td>
                    </tr>
                  ))}
                  {orgs.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>No organizations found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
