import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../Layout';
import { api } from '../api';
import { getEffectiveOrgId } from '../utils/org';

export default function Noticeboard({ user, onLogout }) {
  const [searchParams] = useSearchParams();
  const filter = (searchParams.get('filter') || '').toLowerCase();
  const orgId = getEffectiveOrgId(user);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', is_pinned: false });

  useEffect(() => {
    if (!orgId) return setLoading(false);
    const fetchList = () => {
      setLoading(true);
      api.uhpcms.getNoticeboard({ org_id: orgId })
        .then((r) => setList(r.data || []))
        .catch(() => setList([]))
        .finally(() => setLoading(false));
    };
    fetchList();
    const interval = setInterval(fetchList, 30000);
    return () => clearInterval(interval);
  }, [orgId]);

  const visibleList = useMemo(() => {
    if (filter === 'recent') return (list || []).filter((n) => !n.is_pinned);
    return list || [];
  }, [list, filter]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      await api.uhpcms.createNotice({ org_id: orgId, ...form });
      const r = await api.uhpcms.getNoticeboard({ org_id: orgId });
      setList(r.data || []);
      setModal(false);
      setForm({ title: '', content: '', is_pinned: false });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this notice?')) return;
    try {
      await api.uhpcms.deleteNotice(id);
      setList((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="page-enter page-enter-active">
        <h2 className="section-title">Noticeboard</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
          Hospital notices. Pin important items.
        </p>
        <div style={{ marginBottom: '1rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => setModal(true)}>Add Notice</button>
        </div>
        <div className="card">
          {loading ? <p style={{ padding: '1.5rem', margin: 0 }}>Loading…</p> : (
            <div style={{ padding: '1rem' }}>
              {visibleList.length === 0 ? <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>No notices yet.</p> : (
                visibleList.map((n) => (
                  <div key={n.id} className="flow-step" style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        {n.is_pinned ? <span className="badge" style={{ marginRight: '0.5rem' }}>Pinned</span> : null}
                        <strong>{n.title}</strong>
                      </div>
                      <button type="button" className="btn table-actions btn--danger" onClick={() => handleDelete(n.id)}>Delete</button>
                    </div>
                    {n.content ? <p style={{ margin: '0.5rem 0 0', fontSize: '0.9375rem', color: 'var(--color-text-muted)' }}>{n.content}</p> : null}
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{n.created_at}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Add Notice</h3><button type="button" className="modal-close" onClick={() => setModal(false)}>×</button></div>
            <form className="modal-body" onSubmit={handleSubmit}>
              <div className="modal-form form-group">
                <label className="form-label">Title</label>
                <input type="text" className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="modal-form form-group">
                <label className="form-label">Content</label>
                <textarea className="form-textarea" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input type="checkbox" checked={form.is_pinned} onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })} />
                Pin this notice
              </label>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
