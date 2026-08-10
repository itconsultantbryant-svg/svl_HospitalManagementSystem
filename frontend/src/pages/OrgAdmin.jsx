import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../Layout';
import { api } from '../api';
import { getEffectiveOrgId, getSelectedOrgId, setSelectedOrgId } from '../utils/org';

const TABS = [
  { id: 'departments', label: 'Departments', icon: '🏢' },
  { id: 'wards', label: 'Wards', icon: '🛏️' },
  { id: 'stores', label: 'Pharmacy stores', icon: '💊' },
  { id: 'services', label: 'Services (billing)', icon: '📋' },
  { id: 'users', label: 'Users', icon: '👤' },
  { id: 'roles', label: 'Roles & Permissions', icon: '🎭' },
  { id: 'branches', label: 'Branches', icon: '🏥' },
  { id: 'branding', label: 'Branding', icon: '🎨' },
];

export default function OrgAdmin({ user, onLogout }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState('departments');
  const [orgId, setOrgId] = useState(user?.org_id || getSelectedOrgId() || searchParams.get('org_id') || '');
  const [organizations, setOrganizations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [wards, setWards] = useState([]);
  const [stores, setStores] = useState([]);
  const [services, setServices] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [createdUserEmail, setCreatedUserEmail] = useState('');
  const [form, setForm] = useState({ name: '', bed_count: '', code: '', default_amount: '', default_currency: 'USD', email: '', password: '', role_id: '', full_name: '', department_id: '' });
  const [editingUser, setEditingUser] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ email: '', full_name: '', role_id: '', status: 'active', password: '' });
  const [savingEditUser, setSavingEditUser] = useState(false);

  // ---- Branding ----
  const [branding, setBranding] = useState(null);
  const [brandingForm, setBrandingForm] = useState({ name: '', address: '', phone: '', email: '', country: 'Liberia', website_slug: '' });
  const [savingBranding, setSavingBranding] = useState(false);

  // ---- Roles & permissions ----
  const [permCatalog, setPermCatalog] = useState([]);
  const [permGrouped, setPermGrouped] = useState({});
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePerms, setRolePerms] = useState([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [savingRole, setSavingRole] = useState(false);

  // ---- Branches ----
  const [branches, setBranches] = useState([]);
  const [branchForm, setBranchForm] = useState({ name: '', type: 'clinic', admin_email: '', admin_password: '', admin_name: '', address: '', phone: '' });

  const currentOrgId = (user?.org_id ? user.org_id : getEffectiveOrgId(user)) || orgId || organizations[0]?.id;

  useEffect(() => {
    if (!user) return;
    api.uhpcms.getOrganizations().then((r) => {
      const list = r.data || [];
      setOrganizations(list);
      if ((user.role === 'super_admin' || user.role === 'role_super_admin') && !user.org_id) {
        const current = orgId || getSelectedOrgId() || searchParams.get('org_id');
        if (!current && list.length > 0) {
          setOrgId(list[0].id);
          setSelectedOrgId(list[0].id);
        }
      }
    }).catch(() => []);
    if (user.org_id) setOrgId(user.org_id);
    const qOrg = searchParams.get('org_id');
    if (qOrg) {
      setOrgId(qOrg);
      setSelectedOrgId(qOrg);
    }
  }, [user, searchParams]);

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    const q = { org_id: currentOrgId };
    Promise.all([
      api.uhpcms.getDepartments(currentOrgId).then((r) => r.data || []),
      api.uhpcms.getWards(currentOrgId).then((r) => r.data || []),
      api.uhpcms.getPharmacyStores(currentOrgId).then((r) => r.data || []),
      api.uhpcms.getServices(currentOrgId).then((r) => r.data || []),
      api.uhpcms.getUsers(currentOrgId).then((r) => r.data || []),
      api.uhpcms.getRoles(currentOrgId).then((r) => r.data || []),
    ]).then(([d, w, s, sv, u, r]) => {
      setDepartments(d);
      setWards(w);
      setStores(s);
      setServices(sv);
      setUsers(u);
      setRoles(r);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [currentOrgId]);

  // ---- Load branding when Branding tab opens ----
  useEffect(() => {
    if (tab !== 'branding' || !currentOrgId) return;
    api.uhpcms.getOrgBranding(currentOrgId).then((r) => {
      const d = r.data || {};
      setBranding(d);
      setBrandingForm({ name: d.name || '', address: d.address || '', phone: d.phone || '', email: d.email || '', country: d.country || 'Liberia', website_slug: d.website_slug || '' });
    }).catch(() => {});
  }, [tab, currentOrgId]);

  // ---- Load permission catalog when Roles tab opens ----
  useEffect(() => {
    if (tab !== 'roles') return;
    api.uhpcms.getPermsCatalog(currentOrgId).then((r) => {
      setPermCatalog(r.data || []);
      setPermGrouped(r.grouped || {});
    }).catch(() => {});
    setSelectedRole(null);
    setRolePerms([]);
  }, [tab, currentOrgId]);

  // ---- Load role permissions when a role is selected ----
  useEffect(() => {
    if (!selectedRole) { setRolePerms([]); return; }
    api.uhpcms.getRolePermissions(selectedRole.id, currentOrgId).then((r) => setRolePerms(r.data || [])).catch(() => setRolePerms([]));
  }, [selectedRole, currentOrgId]);

  // ---- Load branches when Branches tab opens ----
  useEffect(() => {
    if (tab !== 'branches') return;
    api.uhpcms.getOrgBranchesSelf(currentOrgId).then((r) => setBranches(r.data || [])).catch(() => setBranches([]));
  }, [tab, currentOrgId]);

  const refresh = () => {
    if (!currentOrgId) return;
    Promise.all([
      api.uhpcms.getDepartments(currentOrgId).then((r) => setDepartments(r.data || [])),
      api.uhpcms.getWards(currentOrgId).then((r) => setWards(r.data || [])),
      api.uhpcms.getPharmacyStores(currentOrgId).then((r) => setStores(r.data || [])),
      api.uhpcms.getServices(currentOrgId).then((r) => setServices(r.data || [])),
      api.uhpcms.getUsers(currentOrgId).then((r) => setUsers(r.data || [])),
    ]).catch(() => {});
  };

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.uhpcms.createDepartment({ org_id: currentOrgId, name: form.name });
      setForm((f) => ({ ...f, name: '' }));
      refresh();
    } catch (e) { setError(e.message); }
  };

  const handleCreateWard = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.uhpcms.createWard({ org_id: currentOrgId, name: form.name, bed_count: form.bed_count || 0 });
      setForm((f) => ({ ...f, name: '', bed_count: '' }));
      refresh();
    } catch (e) { setError(e.message); }
  };

  const handleCreateStore = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.uhpcms.createPharmacyStore({ org_id: currentOrgId, name: form.name });
      setForm((f) => ({ ...f, name: '' }));
      refresh();
    } catch (e) { setError(e.message); }
  };

  const handleCreateService = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.uhpcms.createService({
        org_id: currentOrgId,
        code: form.code,
        name: form.name,
        default_amount: form.default_amount ? parseFloat(form.default_amount) : null,
        default_currency: form.default_currency || 'USD',
      });
      setForm((f) => ({ ...f, code: '', name: '', default_amount: '' }));
      refresh();
    } catch (e) { setError(e.message); }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setCreatedUserEmail('');
    try {
      await api.uhpcms.createUser({
        org_id: currentOrgId,
        email: form.email,
        password: form.password,
        role_id: form.role_id || undefined,
        department_id: form.department_id || undefined,
        full_name: form.full_name || undefined,
      });
      const emailCreated = form.email;
      setForm((f) => ({ ...f, email: '', password: '', full_name: '', role_id: '', department_id: '' }));
      setSuccessMsg('User created. Share credentials securely with the user.');
      setCreatedUserEmail(emailCreated);
      refresh();
    } catch (e) { setError(e.message); }
  };

  const copyCreatedEmail = () => {
    if (!createdUserEmail) return;
    navigator.clipboard?.writeText(createdUserEmail).then(() => {
      setSuccessMsg('Email copied to clipboard.');
    }).catch(() => {});
  };

  const openEditUser = (u) => {
    setEditingUser(u);
    setEditUserForm({ email: u.email, full_name: u.full_name || '', role_id: u.role_id || '', status: u.status || 'active', password: '' });
  };
  const saveEditUser = async () => {
    if (!editingUser || !currentOrgId) return;
    setSavingEditUser(true);
    setError('');
    try {
      await api.uhpcms.updateUser(currentOrgId, editingUser.id, {
        email: editUserForm.email,
        full_name: editUserForm.full_name || null,
        role_id: editUserForm.role_id || null,
        status: editUserForm.status,
        ...(editUserForm.password ? { password: editUserForm.password } : {}),
      });
      refresh();
      setEditingUser(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingEditUser(false);
    }
  };
  const deleteUserConfirm = async (u) => {
    if (!window.confirm(`Deactivate ${u.email}? They will no longer be able to log in.`)) return;
    setError('');
    try {
      await api.uhpcms.deleteUser(currentOrgId, u.id);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  // ---- Branding handlers ----
  const handleBrandingFile = (field, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBranding((b) => ({ ...(b || {}), [field]: reader.result }));
    reader.readAsDataURL(file);
  };
  const saveBranding = async () => {
    setSavingBranding(true);
    setError('');
    try {
      const body = { ...brandingForm };
      if (branding?.logo_base64) body.logo_base64 = branding.logo_base64;
      if (branding?.signature_base64) body.signature_base64 = branding.signature_base64;
      const r = await api.uhpcms.updateOrgBranding(body, currentOrgId);
      setBranding(r.data || branding);
      setSuccessMsg('Branding saved. Refresh to see your logo across the app.');
    } catch (e) { setError(e.message); }
    finally { setSavingBranding(false); }
  };

  // ---- Role handlers ----
  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setSavingRole(true); setError('');
    try {
      await api.uhpcms.createRole({ name: newRoleName.trim() }, currentOrgId);
      setNewRoleName('');
      setSuccessMsg(`Role "${newRoleName.trim()}" created. Assign permissions below.`);
      const r = await api.uhpcms.getRoles(currentOrgId);
      setRoles(r.data || []);
    } catch (e) { setError(e.message); }
    finally { setSavingRole(false); }
  };
  const handleToggleRolePerm = async (permId) => {
    if (!selectedRole) return;
    const next = rolePerms.includes(permId) ? rolePerms.filter((id) => id !== permId) : [...rolePerms, permId];
    setRolePerms(next);
    try { await api.uhpcms.setRolePermissions(selectedRole.id, next, currentOrgId); }
    catch (e) { setError(e.message); }
  };
  const handleDeleteRole = async (r) => {
    if (!window.confirm(`Delete role "${r.name}"? This cannot be undone.`)) return;
    setError(''); setSavingRole(true);
    try {
      await api.uhpcms.deleteRole(r.id, currentOrgId);
      const res = await api.uhpcms.getRoles(currentOrgId);
      setRoles(res.data || []);
      setSelectedRole(null);
    } catch (e) { setError(e.message); }
    finally { setSavingRole(false); }
  };

  // ---- Branch handlers ----
  const handleCreateBranch = async (e) => {
    e.preventDefault();
    setSavingRole(true); setError('');
    try {
      await api.uhpcms.createBranchSelf(branchForm, currentOrgId);
      setSuccessMsg(`Branch "${branchForm.name}" created.`);
      setBranchForm({ name: '', type: 'clinic', admin_email: '', admin_password: '', admin_name: '', address: '', phone: '' });
      api.uhpcms.getOrgBranchesSelf(currentOrgId).then((r) => setBranches(r.data || [])).catch(() => {});
    } catch (e) { setError(e.message); }
    finally { setSavingRole(false); }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="page-enter page-enter-active">
        <h2 className="section-title">Organization setup</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Departments, wards, pharmacy stores, services (billing codes), and users.
        </p>
        {!currentOrgId && <p className="login-error">No hospital configured yet. Create hospital in Governance first.</p>}
        <div className="flow-step" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); setSuccessMsg(''); setCreatedUserEmail(''); }}>{t.icon} {t.label}</button>
          ))}
        </div>
        {error && <div className="login-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        {successMsg && <div className="login-success" style={{ marginBottom: '1rem' }}>{successMsg}{createdUserEmail && <button type="button" onClick={copyCreatedEmail} className="btn" style={{ marginLeft: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}>Copy email</button>}</div>}

        {tab === 'departments' && (
          <div className="card card-interactive">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Departments</h3>
              <form onSubmit={handleCreateDepartment} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" style={{ padding: '0.5rem' }} />
                <button type="submit" className="btn-primary" disabled={!currentOrgId || loading}>Add</button>
              </form>
              <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>ID</th></tr></thead><tbody>{departments.map((d) => <tr key={d.id}><td>{d.name}</td><td>{d.id}</td></tr>)}</tbody></table></div>
            </div>
          </div>
        )}

        {tab === 'wards' && (
          <div className="card card-interactive">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Wards</h3>
              <form onSubmit={handleCreateWard} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" style={{ padding: '0.5rem' }} />
                <input type="number" value={form.bed_count} onChange={(e) => setForm((f) => ({ ...f, bed_count: e.target.value }))} placeholder="Beds" style={{ padding: '0.5rem', width: 80 }} />
                <button type="submit" className="btn-primary" disabled={!currentOrgId || loading}>Add</button>
              </form>
              <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Beds</th><th>ID</th></tr></thead><tbody>{wards.map((w) => <tr key={w.id}><td>{w.name}</td><td>{w.bed_count}</td><td>{w.id}</td></tr>)}</tbody></table></div>
            </div>
          </div>
        )}

        {tab === 'stores' && (
          <div className="card card-interactive">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Pharmacy stores</h3>
              <form onSubmit={handleCreateStore} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Store name" style={{ padding: '0.5rem' }} />
                <button type="submit" className="btn-primary" disabled={!currentOrgId || loading}>Add</button>
              </form>
              <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>ID</th></tr></thead><tbody>{stores.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.id}</td></tr>)}</tbody></table></div>
            </div>
          </div>
        )}

        {tab === 'services' && (
          <div className="card card-interactive">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Services (billing codes)</h3>
              <form onSubmit={handleCreateService} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <input type="text" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="Code" style={{ padding: '0.5rem', width: 100 }} />
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" style={{ padding: '0.5rem', width: 180 }} />
                <input type="number" value={form.default_amount} onChange={(e) => setForm((f) => ({ ...f, default_amount: e.target.value }))} placeholder="Amount" style={{ padding: '0.5rem', width: 90 }} />
                <select value={form.default_currency} onChange={(e) => setForm((f) => ({ ...f, default_currency: e.target.value }))} style={{ padding: '0.5rem' }}><option value="USD">USD</option><option value="LRD">LRD</option></select>
                <button type="submit" className="btn-primary" disabled={!currentOrgId || loading}>Add</button>
              </form>
              <div className="table-wrap"><table className="table"><thead><tr><th>Code</th><th>Name</th><th>Amount</th><th>Currency</th></tr></thead><tbody>{services.map((s) => <tr key={s.id}><td>{s.code}</td><td>{s.name}</td><td>{s.default_amount != null ? s.default_amount : '—'}</td><td>{s.default_currency}</td></tr>)}</tbody></table></div>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="card card-interactive">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Users — Create & assign role</h3>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>Create a user for this organization and assign a role (e.g. Org Admin, doctor, nurse).</p>
              <form onSubmit={handleCreateUser} style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem', maxWidth: 400 }}>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" required style={{ padding: '0.5rem' }} />
                <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password" required style={{ padding: '0.5rem' }} />
                <input type="text" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Full name" style={{ padding: '0.5rem' }} />
                <select value={form.role_id} onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))} style={{ padding: '0.5rem' }}>
                  <option value="">Role (optional — defaults to Org Admin)</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name === 'accountant' ? 'Finance Manager (Accountant)' : (r.name || r.id).replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))} style={{ padding: '0.5rem' }}>
                  <option value="">Department (optional)</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button type="submit" className="btn-primary" disabled={!currentOrgId || loading}>Create user</button>
              </form>
              <div className="table-wrap"><table className="table"><thead><tr><th>Email</th><th>Full name</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td>{u.email}</td><td>{u.full_name || '—'}</td><td>{roles.find((r) => r.id === u.role_id)?.name === 'accountant' ? 'Finance Manager (Accountant)' : (roles.find((r) => r.id === u.role_id)?.name || u.role_id || '—').replace(/_/g, ' ')}</td><td>{u.status}</td><td><button type="button" className="btn" style={{ padding: '0.25rem 0.5rem', marginRight: '0.25rem' }} onClick={() => openEditUser(u)}>Edit</button><button type="button" className="btn" style={{ padding: '0.25rem 0.5rem', color: 'var(--color-danger, #c00)' }} onClick={() => deleteUserConfirm(u)}>Deactivate</button></td></tr>)}</tbody></table></div>
              {editingUser && (
                <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <h4 style={{ marginTop: 0 }}>Edit user: {editingUser.email}</h4>
                  <div style={{ display: 'grid', gap: '0.5rem', maxWidth: 400, marginBottom: '0.75rem' }}>
                    <label>Email <input type="email" value={editUserForm.email} onChange={(e) => setEditUserForm((f) => ({ ...f, email: e.target.value }))} style={{ padding: '0.5rem', width: '100%' }} /></label>
                    <label>Full name <input type="text" value={editUserForm.full_name} onChange={(e) => setEditUserForm((f) => ({ ...f, full_name: e.target.value }))} style={{ padding: '0.5rem', width: '100%' }} /></label>
                    <label>Role <select value={editUserForm.role_id} onChange={(e) => setEditUserForm((f) => ({ ...f, role_id: e.target.value }))} style={{ padding: '0.5rem', width: '100%' }}><option value="">—</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name === 'accountant' ? 'Finance Manager' : (r.name || r.id).replace(/_/g, ' ')}</option>)}</select></label>
                    <label>Status <select value={editUserForm.status} onChange={(e) => setEditUserForm((f) => ({ ...f, status: e.target.value }))} style={{ padding: '0.5rem', width: '100%' }}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></label>
                    <label>New password (leave blank to keep) <input type="password" value={editUserForm.password} onChange={(e) => setEditUserForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 6" style={{ padding: '0.5rem', width: '100%' }} /></label>
                  </div>
                  <button type="button" className="btn-primary" disabled={savingEditUser} onClick={saveEditUser}>Save</button>
                  <button type="button" className="btn" style={{ marginLeft: '0.5rem' }} onClick={() => setEditingUser(null)}>Cancel</button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'roles' && (
          <div className="card card-interactive">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Roles & Permissions</h3>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Create custom roles (e.g. Head Nurse) and pick which features each role can access. Changes apply on next login.
              </p>
              <form onSubmit={handleCreateRole} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', maxWidth: 420 }}>
                <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="New role name (e.g. Head Nurse)" style={{ padding: '0.5rem', flex: 1 }} required />
                <button type="submit" className="btn-primary" disabled={savingRole}>Create role</button>
              </form>

              <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1rem', alignItems: 'start' }}>
                <div>
                  <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
                    <table className="table">
                      <thead><tr><th>Role</th><th>Users</th><th></th></tr></thead>
                      <tbody>
                        {roles.map((r) => (
                          <tr key={r.id} style={selectedRole?.id === r.id ? { background: 'var(--color-primary-light, #eef4ff)' } : undefined}>
                            <td>
                              <button type="button" className="btn" style={{ border: 'none', background: 'transparent', padding: 0, fontWeight: selectedRole?.id === r.id ? 700 : 400 }} onClick={() => setSelectedRole(selectedRole?.id === r.id ? null : r)}>
                                {r.name === 'accountant' ? 'Finance Manager' : (r.name || r.id).replace(/_/g, ' ')}{r.is_system ? <span style={{ fontSize: '0.7rem', opacity: 0.5, marginLeft: '0.3rem' }}>system</span> : null}
                              </button>
                            </td>
                            <td>{r.user_count ?? '—'}</td>
                            <td>{!r.is_system && <button type="button" className="btn" style={{ padding: '0.1rem 0.4rem', color: 'var(--color-danger, #c00)' }} onClick={() => handleDeleteRole(r)}>✕</button>}</td>
                          </tr>
                        ))}
                        {roles.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--color-text-muted)', padding: '1rem', textAlign: 'center' }}>No roles found</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  {selectedRole ? (
                    <>
                      <h4 style={{ marginTop: 0 }}>Permissions — {selectedRole.name === 'accountant' ? 'Finance Manager' : (selectedRole.name || selectedRole.id).replace(/_/g, ' ')}</h4>
                      {Object.keys(permGrouped).length === 0 && <div className="loading-state">Loading permissions…</div>}
                      {Object.entries(permGrouped).map(([mod, perms]) => (
                        <div key={mod} style={{ marginBottom: '0.75rem' }}>
                          <strong style={{ textTransform: 'capitalize', fontSize: '0.85rem' }}>{mod}</strong>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.3rem' }}>
                            {perms.map((p) => (
                              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.45rem', borderRadius: 6, background: rolePerms.includes(p.id) ? 'var(--color-primary-light, #eef4ff)' : 'transparent', border: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
                                <input type="checkbox" checked={rolePerms.includes(p.id)} onChange={() => handleToggleRolePerm(p.id)} />
                                {p.action}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ color: 'var(--color-text-muted)', padding: '2rem', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: 8 }}>Select a role on the left to edit its permissions</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'branches' && (
          <div className="card card-interactive">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Branches & Clinics</h3>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Create branch offices or clinics under this hospital. Each branch can have its own admin and inherits this hospital's module settings.
              </p>
              <form onSubmit={handleCreateBranch} style={{ display: 'grid', gap: '0.5rem', maxWidth: 420, marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" value={branchForm.name} onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))} placeholder="Branch name" style={{ padding: '0.5rem', flex: 1 }} required />
                  <select value={branchForm.type} onChange={(e) => setBranchForm((f) => ({ ...f, type: e.target.value }))} style={{ padding: '0.5rem' }}>
                    <option value="branch">Branch</option>
                    <option value="clinic">Clinic</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" value={branchForm.admin_name} onChange={(e) => setBranchForm((f) => ({ ...f, admin_name: e.target.value }))} placeholder="Branch admin name (optional)" style={{ padding: '0.5rem', flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="email" value={branchForm.admin_email} onChange={(e) => setBranchForm((f) => ({ ...f, admin_email: e.target.value }))} placeholder="Branch admin email (optional)" style={{ padding: '0.5rem', flex: 1 }} />
                  <input type="password" value={branchForm.admin_password} onChange={(e) => setBranchForm((f) => ({ ...f, admin_password: e.target.value }))} placeholder="Password" style={{ padding: '0.5rem', flex: 1 }} />
                </div>
                <button type="submit" className="btn-primary" disabled={savingRole}>Create branch</button>
              </form>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Name</th><th>Kind</th><th>Status</th><th>ID</th></tr></thead>
                  <tbody>
                    {branches.map((b) => <tr key={b.id}><td>{b.name}</td><td><span className="badge">{b.kind || b.type}</span></td><td>{b.status}</td><td>{b.id}</td></tr>)}
                    {branches.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--color-text-muted)', padding: '1rem', textAlign: 'center' }}>No branches yet. Create one above.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'branding' && (
          <div className="card card-interactive">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Branding</h3>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Upload your hospital logo and institutional signature. The logo appears on the sidebar, login page, and printed receipts; the signature appears on invoices.
              </p>
              {!branding && <div className="loading-state">Loading branding…</div>}
              {branding && (
                <div style={{ display: 'grid', gap: '1rem', maxWidth: 640 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Hospital Logo</strong>
                      {branding.logo_base64 ? (
                        <img src={branding.logo_base64} alt="logo" style={{ width: 90, height: 90, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff' }} />
                      ) : (
                        <div style={{ width: 90, height: 90, borderRadius: 8, border: '2px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>No logo</div>
                      )}
                      <input type="file" accept="image/*" onChange={(e) => handleBrandingFile('logo_base64', e.target.files?.[0])} style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.85rem' }} />
                    </div>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Institutional Signature</strong>
                      {branding.signature_base64 ? (
                        <img src={branding.signature_base64} alt="signature" style={{ height: 70, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff' }} />
                      ) : (
                        <div style={{ width: 200, height: 70, borderRadius: 8, border: '2px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>No signature</div>
                      )}
                      <input type="file" accept="image/*" onChange={(e) => handleBrandingFile('signature_base64', e.target.files?.[0])} style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.85rem' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <label>Hospital name <input type="text" value={brandingForm.name} onChange={(e) => setBrandingForm((f) => ({ ...f, name: e.target.value }))} style={{ padding: '0.5rem', width: '100%' }} /></label>
                    <label>Address <input type="text" value={brandingForm.address} onChange={(e) => setBrandingForm((f) => ({ ...f, address: e.target.value }))} style={{ padding: '0.5rem', width: '100%' }} /></label>
                    <label>Phone <input type="text" value={brandingForm.phone} onChange={(e) => setBrandingForm((f) => ({ ...f, phone: e.target.value }))} style={{ padding: '0.5rem', width: '100%' }} /></label>
                    <label>Institutional Email <input type="email" value={brandingForm.email} onChange={(e) => setBrandingForm((f) => ({ ...f, email: e.target.value }))} placeholder="info@hospital.org" style={{ padding: '0.5rem', width: '100%' }} /></label>
                    <label>Country <input type="text" value={brandingForm.country} onChange={(e) => setBrandingForm((f) => ({ ...f, country: e.target.value }))} style={{ padding: '0.5rem', width: '100%' }} /></label>
                    <label>Website Slug <input type="text" value={brandingForm.website_slug} onChange={(e) => setBrandingForm((f) => ({ ...f, website_slug: e.target.value }))} placeholder="e.g. stmary (public URL: /h/stmary)" style={{ padding: '0.5rem', width: '100%' }} /></label>
                  </div>
                  <div>
                    <button type="button" className="btn-primary" disabled={savingBranding} onClick={saveBranding}>{savingBranding ? 'Saving…' : 'Save branding'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
