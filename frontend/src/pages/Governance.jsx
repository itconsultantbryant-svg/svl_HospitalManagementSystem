import { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '../Layout';
import { api } from '../api';

const TABS = ['Hospitals', 'Roles & Permissions', 'Users', 'Monitor', 'Audit'];

export default function Governance({ user, onLogout }) {
  // ---- Access guard ----
  const role = (user?.role || '').toLowerCase();
  const isAdmin = ['super_admin', 'role_super_admin', 'org_admin', 'administrator', 'admin'].includes(role);
  if (!isAdmin) {
    return (
      <Layout user={user} onLogout={onLogout}>
        <div className="error-state">Access denied. Super-admin only.</div>
      </Layout>
    );
  }

  const [tab, setTab] = useState('Hospitals');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // ---- Hospital list ----
  const [orgs, setOrgs] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgForm, setOrgForm] = useState({ name: '', type: 'hospital', admin_name: '', admin_email: '', admin_password: '', address: '', phone: '', email: '', country: 'Liberia', website_slug: '' });
  const [selectedOrg, setSelectedOrg] = useState(null); // full org row
  const [selectedOrgModules, setSelectedOrgModules] = useState([]);
  const [selectedOrgAddons, setSelectedOrgAddons] = useState([]);
  const [moduleToggles, setModuleToggles] = useState({});
  const [addonToggles, setAddonToggles] = useState({});
  const [editOrgId, setEditOrgId] = useState(null);
  const [editOrgForm, setEditOrgForm] = useState({ name: '', type: 'hospital', subscription_plan: 'standard', address: '', phone: '', email: '', country: 'Liberia', website_slug: '' });

  const loadOrgs = useCallback(() => {
    api.uhpcms.getOrganizations()
      .then((r) => setOrgs(r.data || []))
      .catch(() => {})
      .finally(() => setOrgsLoading(false));
  }, []);
  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  useEffect(() => {
    if (!selectedOrg) { setSelectedOrgModules([]); setSelectedOrgAddons([]); setModuleToggles({}); setAddonToggles({}); return; }
    api.uhpcms.getOrgModules(selectedOrg.id).then((r) => {
      const mods = r.data || [];
      setSelectedOrgModules(mods);
      const t = {};
      mods.forEach((m) => { t[m.module_name] = m.enabled ? 1 : 0; });
      setModuleToggles(t);
    }).catch(() => {});
    api.uhpcms.getOrgAddons(selectedOrg.id).then((r) => {
      const addons = r.data || [];
      setSelectedOrgAddons(addons);
      const t = {};
      addons.forEach((a) => { t[a.addon_name] = a.enabled ? 1 : 0; });
      setAddonToggles(t);
    }).catch(() => {});
  }, [selectedOrg]);

  // ---- Branches ----
  const [selectedOrgBranches, setSelectedOrgBranches] = useState([]);
  const [branchForm, setBranchForm] = useState({ name: '', type: 'branch', admin_name: '', admin_email: '', admin_password: '', address: '', phone: '' });
  const loadBranches = useCallback((orgId) => {
    if (!orgId) { setSelectedOrgBranches([]); return; }
    api.uhpcms.getOrgBranches(orgId).then((r) => setSelectedOrgBranches(r.data || [])).catch(() => setSelectedOrgBranches([]));
  }, []);

  // ---- Roles & permissions ----
  const [rolesOrgId, setRolesOrgId] = useState('');
  const [govRoles, setGovRoles] = useState([]);
  const [permCatalog, setPermCatalog] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePerms, setRolePerms] = useState([]);
  const [newRoleName, setNewRoleName] = useState('');

  useEffect(() => {
    api.uhpcms.getPermissionsCatalog().then((r) => setPermCatalog(r.data || [])).catch(() => {});
  }, []);

  const loadGovRoles = useCallback((orgId) => {
    if (!orgId) { setGovRoles([]); return; }
    api.uhpcms.getGovRoles(orgId).then((r) => setGovRoles(r.data || [])).catch(() => setGovRoles([]));
  }, []);

  const loadRolePerms = useCallback((roleId) => {
    if (!roleId) { setRolePerms([]); return; }
    api.uhpcms.getGovRolePermissions(roleId).then((r) => setRolePerms(r.data || [])).catch(() => setRolePerms([]));
  }, []);

  useEffect(() => { loadGovRoles(rolesOrgId); setSelectedRole(null); setRolePerms([]); }, [rolesOrgId, loadGovRoles]);
  useEffect(() => { if (selectedRole) loadRolePerms(selectedRole.id); }, [selectedRole, loadRolePerms]);

  // ---- Users ----
  const [govUsers, setGovUsers] = useState([]);
  const [usersOrgFilter, setUsersOrgFilter] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ email: '', full_name: '', role_id: '', status: 'active', password: '' });
  const [editUserRoles, setEditUserRoles] = useState([]);

  const loadGovUsers = useCallback((orgId) => {
    api.uhpcms.getGovernanceUsers(orgId || undefined).then((r) => setGovUsers(r.data || [])).catch(() => setGovUsers([]));
  }, []);
  useEffect(() => { loadGovUsers(usersOrgFilter); }, [usersOrgFilter, loadGovUsers]);

  useEffect(() => {
    if (!editUser?.org_id) { setEditUserRoles([]); return; }
    api.uhpcms.getGovRoles(editUser.org_id).then((r) => setEditUserRoles(r.data || [])).catch(() => setEditUserRoles([]));
  }, [editUser?.id, editUser?.org_id]);

  // ---- Monitor ----
  const [monitor, setMonitor] = useState(null);
  const [report, setReport] = useState([]);
  const [monitorAt, setMonitorAt] = useState(null);
  const loadMonitor = useCallback(() => {
    api.uhpcms.getGovernanceMonitor().then((r) => setMonitor(r.data || null)).catch(() => {});
    api.uhpcms.getGovernanceReport().then((r) => setReport(r.data || [])).catch(() => setReport([]));
    setMonitorAt(new Date().toLocaleTimeString());
  }, []);
  useEffect(() => {
    if (tab !== 'Monitor') return;
    loadMonitor();
    // Realtime (polling-based) refresh for the super-admin monitor while the tab is active.
    const id = setInterval(loadMonitor, 15000);
    return () => clearInterval(id);
  }, [tab, loadMonitor]);

  // ---- Audit ----
  const [auditRows, setAuditRows] = useState([]);
  const [auditFilters, setAuditFilters] = useState({ org_id: '', module: '', date: '' });
  const loadAudit = useCallback(() => {
    const p = {};
    if (auditFilters.org_id) p.org_id = auditFilters.org_id;
    if (auditFilters.module) p.module = auditFilters.module;
    if (auditFilters.date) p.date_from = `${auditFilters.date}T00:00:00`;
    api.uhpcms.getGovernanceAudit(p).then((r) => setAuditRows(r.data || [])).catch(() => setAuditRows([]));
  }, [auditFilters]);
  useEffect(() => { if (tab === 'Audit') loadAudit(); }, [tab, auditFilters, loadAudit]);

  // ---- Handlers ----
  const handleCreateOrg = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      await api.uhpcms.createOrganization(orgForm);
      loadOrgs();
      setCreatingOrg(false);
      setOrgForm({ name: '', type: 'hospital', admin_name: '', admin_email: '', admin_password: '', address: '', phone: '', email: '', country: 'Liberia', website_slug: '' });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleLogoUpload = (orgId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setSaving(true);
        await api.uhpcms.patchOrganization(orgId, { logo_base64: reader.result });
        loadOrgs();
        setSelectedOrg((prev) => prev && prev.id === orgId ? { ...prev, logo_base64: reader.result } : prev);
      } catch (err) { setError(err.message); }
      finally { setSaving(false); }
    };
    reader.readAsDataURL(file);
  };

  const handleSigUpload = (orgId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setSaving(true);
        await api.uhpcms.patchOrganization(orgId, { signature_base64: reader.result });
        setSelectedOrg((prev) => prev && prev.id === orgId ? { ...prev, signature_base64: reader.result } : prev);
      } catch (err) { setError(err.message); }
      finally { setSaving(false); }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateBranch = async (e, orgId) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      await api.uhpcms.createBranch(orgId, branchForm);
      loadBranches(orgId);
      setBranchForm({ name: '', type: 'branch', admin_name: '', admin_email: '', admin_password: '', address: '', phone: '' });
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!rolesOrgId || !newRoleName.trim()) return;
    setError(''); setSaving(true);
    try {
      await api.uhpcms.createGovRole(rolesOrgId, { name: newRoleName.trim() });
      loadGovRoles(rolesOrgId);
      setNewRoleName('');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleToggleRolePerm = async (permId) => {
    if (!selectedRole) return;
    const next = rolePerms.includes(permId) ? rolePerms.filter((id) => id !== permId) : [...rolePerms, permId];
    setRolePerms(next);
    try {
      await api.uhpcms.setGovRolePermissions(selectedRole.id, next);
    } catch (err) { setError(err.message); }
  };

  const openEditOrg = (org) => {
    setEditOrgId(org.id);
    setEditOrgForm({ name: org.name, type: org.type, subscription_plan: org.subscription_plan || 'standard', address: org.address || '', phone: org.phone || '', email: org.email || '', country: org.country || 'Liberia', website_slug: org.website_slug || '' });
  };

  const saveEditOrg = async () => {
    if (!editOrgId) return;
    setError(''); setSaving(true);
    try {
      await api.uhpcms.updateOrganization(editOrgId, editOrgForm);
      loadOrgs();
      setEditOrgId(null);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const openEditUser = (u) => {
    setEditUser(u);
    setEditUserForm({ email: u.email, full_name: u.full_name || '', role_id: u.role_id || '', status: u.status || 'active', password: '' });
  };

  const saveEditUser = async () => {
    if (!editUser) return;
    setSaving(true); setError('');
    try {
      await api.uhpcms.updateGovernanceUser(editUser.id, {
        ...editUserForm,
        full_name: editUserForm.full_name || null,
        role_id: editUserForm.role_id || null,
        ...(editUserForm.password ? { password: editUserForm.password } : {}),
      });
      loadGovUsers(usersOrgFilter);
      setEditUser(null);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const deleteGovernanceUserConfirm = async (u) => {
    if (u.id === user?.id) { setError('You cannot delete your own account.'); return; }
    if (!window.confirm(`Deactivate "${u.email}"? They can be reactivated later.`)) return;
    setError('');
    try { await api.uhpcms.deleteGovernanceUser(u.id); loadGovUsers(usersOrgFilter); }
    catch (err) { setError(err.message); }
  };

  const permGrouped = useMemo(() => {
    const groups = {};
    permCatalog.forEach((p) => { (groups[p.module] = groups[p.module] || []).push(p); });
    return groups;
  }, [permCatalog]);

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="page-enter page-enter-active">
        <h2 className="section-title">System Governance</h2>

        {/* Tab bar */}
        <div className="currency-switcher" style={{ marginBottom: '1.5rem' }}>
          {TABS.map((t) => (
            <button key={t} type="button" className={`btn-currency ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {error && <div className="login-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {/* ===== TAB: Hospitals ===== */}
        {tab === 'Hospitals' && (
          <>
            {/* Create hospital */}
            {!creatingOrg ? (
              <button type="button" className="btn-primary" style={{ marginBottom: '1rem' }} onClick={() => setCreatingOrg(true)}>+ Create Hospital</button>
            ) : (
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-body">
                  <h3 style={{ marginTop: 0 }}>Create Hospital</h3>
                  <form onSubmit={handleCreateOrg} style={{ display: 'grid', gap: '0.75rem', maxWidth: 600 }}>
                    <label>Hospital Name<input required type="text" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={orgForm.name} onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))} /></label>
                    <label>Admin Full Name<input required type="text" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={orgForm.admin_name} onChange={(e) => setOrgForm((f) => ({ ...f, admin_name: e.target.value }))} /></label>
                    <label>Admin Email<input required type="email" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={orgForm.admin_email} onChange={(e) => setOrgForm((f) => ({ ...f, admin_email: e.target.value }))} /></label>
                    <label>Admin Password<input required type="password" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={orgForm.admin_password} onChange={(e) => setOrgForm((f) => ({ ...f, admin_password: e.target.value }))} minLength={6} /></label>
                    <label>Address<input type="text" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={orgForm.address} onChange={(e) => setOrgForm((f) => ({ ...f, address: e.target.value }))} /></label>
                    <label>Phone<input type="text" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={orgForm.phone} onChange={(e) => setOrgForm((f) => ({ ...f, phone: e.target.value }))} /></label>
                    <label>Institutional Email<input type="email" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={orgForm.email} onChange={(e) => setOrgForm((f) => ({ ...f, email: e.target.value }))} placeholder="info@hospital.org" /></label>
                    <label>Website Slug<input type="text" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={orgForm.website_slug} onChange={(e) => setOrgForm((f) => ({ ...f, website_slug: e.target.value }))} placeholder="e.g. stmary (public URL: /h/stmary)" /></label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Hospital'}</button>
                      <button type="button" className="btn" onClick={() => setCreatingOrg(false)}>Cancel</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Org list */}
            <h3 className="section-title">Hospitals & Branches ({orgs.length})</h3>
            {orgsLoading ? <div className="loading-state">Loading…</div> : (
              <div className="card">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Name</th><th>Kind</th><th>Status</th><th>Branches</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {orgs.map((org) => {
                        const children = orgs.filter((o) => o.parent_org_id === org.id);
                        const isSel = selectedOrg?.id === org.id;
                        return (
                          <tr key={org.id} style={isSel ? { background: 'var(--color-primary-light, #eef4ff)' } : undefined}>
                            <td><strong>{org.name}</strong><div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{org.id}</div></td>
                            <td><span className="badge">{org.kind || org.type || '—'}</span></td>
                            <td>{org.status}</td>
                            <td>{children.length}</td>
                            <td>
                              <button type="button" className="btn-primary" style={{ padding: '0.25rem 0.5rem', marginRight: '0.35rem' }} onClick={() => { setSelectedOrg(isSel ? null : org); if (!isSel) loadBranches(org.id); }}>
                                {isSel ? 'Close' : 'Manage'}
                              </button>
                              <button type="button" className="btn" style={{ padding: '0.25rem 0.5rem' }} onClick={() => openEditOrg(org)}>Edit</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Selected org detail */}
            {selectedOrg && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-body">
                  <h3 style={{ marginTop: 0 }}>{selectedOrg.name}</h3>

                  {/* Branding */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Hospital Logo</strong>
                      {selectedOrg.logo_base64 ? (
                        <img src={selectedOrg.logo_base64} alt="logo" style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--color-border)' }} />
                      ) : (
                        <div style={{ width: 80, height: 80, borderRadius: 8, border: '2px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>No logo</div>
                      )}
                      <input type="file" accept="image/*" onChange={(e) => handleLogoUpload(selectedOrg.id, e.target.files?.[0])} style={{ marginTop: '0.5rem', fontSize: '0.85rem' }} />
                    </div>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Admin Signature</strong>
                      {selectedOrg.signature_base64 ? (
                        <img src={selectedOrg.signature_base64} alt="sig" style={{ height: 60, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--color-border)' }} />
                      ) : (
                        <div style={{ width: 180, height: 60, borderRadius: 8, border: '2px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>No signature</div>
                      )}
                      <input type="file" accept="image/*" onChange={(e) => handleSigUpload(selectedOrg.id, e.target.files?.[0])} style={{ marginTop: '0.5rem', fontSize: '0.85rem' }} />
                    </div>
                  </div>

                  {/* Modules */}
                  <h4 style={{ marginTop: 0 }}>Modules</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {Object.keys(moduleToggles).map((mod) => (
                      <label key={mod} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <input type="checkbox" checked={!!moduleToggles[mod]} onChange={() => setModuleToggles((t) => ({ ...t, [mod]: t[mod] ? 0 : 1 }))} />
                        {mod}
                      </label>
                    ))}
                    <button type="button" className="btn-primary" style={{ padding: '0.3rem 0.75rem' }} disabled={saving} onClick={async () => {
                      setSaving(true); setError('');
                      try {
                        await api.uhpcms.setOrgModules(selectedOrg.id, Object.entries(moduleToggles).map(([name, enabled]) => ({ name, enabled })));
                      } catch (err) { setError(err.message); }
                      finally { setSaving(false); }
                    }}>Save Modules</button>
                  </div>

                  {/* Add-ons */}
                  <h4 style={{ marginTop: 0 }}>Add-ons</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    {Object.keys(addonToggles).map((name) => (
                      <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <input type="checkbox" checked={!!addonToggles[name]} onChange={() => setAddonToggles((t) => ({ ...t, [name]: t[name] ? 0 : 1 }))} />
                        {name}
                      </label>
                    ))}
                    <button type="button" className="btn-primary" style={{ padding: '0.3rem 0.75rem' }} disabled={saving} onClick={async () => {
                      setSaving(true); setError('');
                      try {
                        await api.uhpcms.setOrgAddons(selectedOrg.id, Object.entries(addonToggles).map(([name, enabled]) => ({ name, enabled })));
                      } catch (err) { setError(err.message); }
                      finally { setSaving(false); }
                    }}>Save Add-ons</button>
                  </div>

                  {/* Branches */}
                  <h4 style={{ marginTop: 0 }}>Branches / Clinics</h4>
                  {selectedOrgBranches.length > 0 && (
                    <table className="table" style={{ marginBottom: '1rem' }}>
                      <thead><tr><th>Name</th><th>Kind</th><th>Status</th></tr></thead>
                      <tbody>{selectedOrgBranches.map((b) => <tr key={b.id}><td>{b.name}</td><td><span className="badge">{b.type}</span></td><td>{b.status}</td></tr>)}</tbody>
                    </table>
                  )}

                  <details>
                    <summary style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 600 }}>+ Add Branch / Clinic</summary>
                    <form onSubmit={(e) => handleCreateBranch(e, selectedOrg.id)} style={{ display: 'grid', gap: '0.6rem', maxWidth: 400, marginTop: '0.75rem' }}>
                      <input required type="text" placeholder="Branch name" className="login-form input" style={{ padding: '0.5rem 0.75rem' }} value={branchForm.name} onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))} />
                      <select style={{ padding: '0.5rem 0.75rem' }} value={branchForm.type} onChange={(e) => setBranchForm((f) => ({ ...f, type: e.target.value }))}>
                        <option value="branch">Branch</option>
                        <option value="clinic">Clinic</option>
                      </select>
                      <input type="text" placeholder="Admin name (optional)" className="login-form input" style={{ padding: '0.5rem 0.75rem' }} value={branchForm.admin_name} onChange={(e) => setBranchForm((f) => ({ ...f, admin_name: e.target.value }))} />
                      <input type="email" placeholder="Admin email (optional)" className="login-form input" style={{ padding: '0.5rem 0.75rem' }} value={branchForm.admin_email} onChange={(e) => setBranchForm((f) => ({ ...f, admin_email: e.target.value }))} />
                      <input type="password" placeholder="Admin password (optional)" className="login-form input" style={{ padding: '0.5rem 0.75rem' }} value={branchForm.admin_password} onChange={(e) => setBranchForm((f) => ({ ...f, admin_password: e.target.value }))} />
                      <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Branch'}</button>
                    </form>
                  </details>
                </div>
              </div>
            )}

            {/* Edit org modal */}
            {editOrgId && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-body">
                  <h3 style={{ marginTop: 0 }}>Edit Organization</h3>
                  <div style={{ display: 'grid', gap: '0.6rem', maxWidth: 400 }}>
                    <label>Name<input type="text" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={editOrgForm.name} onChange={(e) => setEditOrgForm((f) => ({ ...f, name: e.target.value }))} /></label>
                    <label>Address<input type="text" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={editOrgForm.address} onChange={(e) => setEditOrgForm((f) => ({ ...f, address: e.target.value }))} /></label>
                    <label>Phone<input type="text" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={editOrgForm.phone} onChange={(e) => setEditOrgForm((f) => ({ ...f, phone: e.target.value }))} /></label>
                    <label>Institutional Email<input type="email" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={editOrgForm.email} onChange={(e) => setEditOrgForm((f) => ({ ...f, email: e.target.value }))} placeholder="info@hospital.org" /></label>
                    <label>Website Slug<input type="text" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={editOrgForm.website_slug} onChange={(e) => setEditOrgForm((f) => ({ ...f, website_slug: e.target.value }))} placeholder="e.g. stmary (public URL: /h/stmary)" /></label>
                    <label>Plan<input type="text" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={editOrgForm.subscription_plan} onChange={(e) => setEditOrgForm((f) => ({ ...f, subscription_plan: e.target.value }))} /></label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" className="btn-primary" onClick={saveEditOrg}>{saving ? 'Saving…' : 'Save'}</button>
                      <button type="button" className="btn" onClick={() => setEditOrgId(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== TAB: Roles & Permissions ===== */}
        {tab === 'Roles & Permissions' && (
          <>
            <h3 className="section-title">Role Management</h3>
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              Hospital
              <select style={{ marginLeft: '0.5rem', padding: '0.4rem 0.6rem' }} value={rolesOrgId} onChange={(e) => setRolesOrgId(e.target.value)}>
                <option value="">— Select Hospital —</option>
                {orgs.filter((o) => !o.parent_org_id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            {rolesOrgId && (
              <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem', alignItems: 'start' }}>
                {/* Roles list */}
                <div className="card">
                  <div className="card-body">
                    <h4 style={{ marginTop: 0 }}>Roles</h4>
                    <form onSubmit={handleCreateRole} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
                      <input type="text" placeholder="New role name" className="login-form input" style={{ flex: 1, padding: '0.4rem 0.6rem' }} value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} required />
                      <button type="submit" className="btn-primary" style={{ padding: '0.4rem 0.75rem' }} disabled={saving}>Add</button>
                    </form>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {govRoles.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            className={`btn ${selectedRole?.id === r.id ? 'btn-primary' : ''}`}
                            style={{ width: '100%', textAlign: 'left', padding: '0.4rem 0.6rem', marginBottom: '0.35rem', fontSize: '0.9rem' }}
                            onClick={() => setSelectedRole(selectedRole?.id === r.id ? null : r)}
                          >
                            {r.name} {r.is_system ? <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>(system)</span> : ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Permissions matrix */}
                <div className="card">
                  <div className="card-body">
                    {selectedRole ? (
                      <>
                        <h4 style={{ marginTop: 0 }}>Permissions — {selectedRole.name}</h4>
                        {Object.entries(permGrouped).map(([mod, perms]) => (
                          <div key={mod} style={{ marginBottom: '1rem' }}>
                            <strong style={{ textTransform: 'capitalize', fontSize: '0.9rem' }}>{mod}</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                              {perms.map((p) => (
                                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: 6, background: rolePerms.includes(p.id) ? 'var(--color-primary-light, #eef4ff)' : 'transparent', border: '1px solid var(--color-border)' }}>
                                  <input type="checkbox" checked={rolePerms.includes(p.id)} onChange={() => handleToggleRolePerm(p.id)} />
                                  {p.action}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ color: 'var(--color-text-muted)', padding: '2rem', textAlign: 'center' }}>Select a role to edit its permissions</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== TAB: Users ===== */}
        {tab === 'Users' && (
          <>
            <h3 className="section-title">System Users</h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
              <label style={{ fontSize: '0.9rem' }}>Filter by hospital
                <select style={{ marginLeft: '0.4rem', padding: '0.4rem' }} value={usersOrgFilter} onChange={(e) => setUsersOrgFilter(e.target.value)}>
                  <option value="">All</option>
                  {orgs.filter((o) => !o.parent_org_id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <button type="button" className="btn" onClick={() => loadGovUsers(usersOrgFilter)}>Refresh</button>
            </div>
            <div className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Email</th><th>Full Name</th><th>Org</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {govUsers.map((u) => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td>{u.full_name || '—'}</td>
                        <td>{orgs.find((o) => o.id === u.org_id)?.name || u.org_id}</td>
                        <td>{(u.role_name || u.role_id || '—').replace(/_/g, ' ')}</td>
                        <td><span className={`badge ${u.status === 'active' ? 'badge--green' : 'badge--orange'}`}>{u.status}</span></td>
                        <td>
                          <button type="button" className="btn" style={{ padding: '0.2rem 0.5rem', marginRight: '0.25rem' }} onClick={() => openEditUser(u)}>Edit</button>
                          <button type="button" className="btn" style={{ padding: '0.2rem 0.5rem', color: 'var(--color-danger, #c00)' }} disabled={u.id === user?.id} onClick={() => deleteGovernanceUserConfirm(u)}>Deactivate</button>
                        </td>
                      </tr>
                    ))}
                    {govUsers.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--color-text-muted)', padding: '1rem', textAlign: 'center' }}>No users found</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {editUser && (
              <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-body">
                  <h3 style={{ marginTop: 0 }}>Edit User</h3>
                  <div style={{ display: 'grid', gap: '0.6rem', maxWidth: 400 }}>
                    <label>Email<input type="email" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={editUserForm.email} onChange={(e) => setEditUserForm((f) => ({ ...f, email: e.target.value }))} /></label>
                    <label>Full Name<input type="text" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={editUserForm.full_name} onChange={(e) => setEditUserForm((f) => ({ ...f, full_name: e.target.value }))} /></label>
                    <label>Role<select className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={editUserForm.role_id} onChange={(e) => setEditUserForm((f) => ({ ...f, role_id: e.target.value }))}>
                      <option value="">—</option>
                      {editUserRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select></label>
                    <label>Status<select className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={editUserForm.status} onChange={(e) => setEditUserForm((f) => ({ ...f, status: e.target.value }))}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                    </select></label>
                    <label>New Password (blank to keep)<input type="password" className="login-form input" style={{ width: '100%', padding: '0.5rem 0.75rem' }} value={editUserForm.password} onChange={(e) => setEditUserForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 6 chars" /></label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" className="btn-primary" disabled={saving} onClick={saveEditUser}>{saving ? 'Saving…' : 'Save'}</button>
                      <button type="button" className="btn" onClick={() => setEditUser(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== TAB: Monitor ===== */}
        {tab === 'Monitor' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h3 className="section-title" style={{ margin: 0 }}>Cross-Org Monitor</h3>
              {monitorAt && (
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                  <span style={{ color: 'var(--color-success)' }}>● Live</span> · updated {monitorAt} · auto-refresh 15s
                </span>
              )}
            </div>
            {monitor ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                  ['Total Hospitals', monitor.total_orgs ?? '—'],
                  ['Total Users', monitor.total_users ?? '—'],
                  ['Total Patients', monitor.total_patients ?? '—'],
                  ['Total Encounters', monitor.total_encounters ?? '—'],
                  ['Total Revenue', `${monitor.total_revenue ?? 0}`],
                  ['Active Orgs', monitor.active_orgs ?? '—'],
                ].map(([label, val]) => (
                  <div key={label} className="stat-card">
                    <div className="stat-card-label">{label}</div>
                    <div className="stat-card-value">{val}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="loading-state">Loading monitor…</div>
            )}

            {report.length > 0 && (
              <>
                <h4 className="section-title">Per-Hospital Summary</h4>
                <div className="card">
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Hospital</th><th>Kind</th><th>Users</th><th>Active</th><th>Patients</th><th>Encounters</th><th>Modules On</th></tr></thead>
                      <tbody>
                        {report.map((r) => (
                          <tr key={r.id}>
                            <td>{r.name || r.id}</td>
                            <td><span className="badge">{r.kind || r.type || '—'}</span></td>
                            <td>{r.user_count ?? 0}</td>
                            <td>{r.active_user_count ?? 0}</td>
                            <td>{r.patient_count ?? 0}</td>
                            <td>{r.encounter_count ?? 0}</td>
                            <td>{r.module_count ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ===== TAB: Audit ===== */}
        {tab === 'Audit' && (
          <>
            <h3 className="section-title">Cross-Org Audit Log</h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <select style={{ padding: '0.4rem' }} value={auditFilters.org_id} onChange={(e) => setAuditFilters((f) => ({ ...f, org_id: e.target.value }))}>
                <option value="">All Orgs</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <select style={{ padding: '0.4rem' }} value={auditFilters.module} onChange={(e) => setAuditFilters((f) => ({ ...f, module: e.target.value }))}>
                <option value="">All Modules</option>
                {['auth','governance','org_admin','billing','patients','triage','lab','pharmacy','inpatient','clinic','documents','noticeboard','insurance'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="date" style={{ padding: '0.4rem' }} value={auditFilters.date} onChange={(e) => setAuditFilters((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Time</th><th>User</th><th>Org</th><th>Module</th><th>Action</th></tr></thead>
                  <tbody>
                    {auditRows.slice(0, 200).map((a, i) => (
                      <tr key={a.id || i}>
                        <td style={{ fontSize: '0.8rem' }}>{a.created_at || '—'}</td>
                        <td>{a.user_email || a.user_id || '—'}</td>
                        <td>{a.org_name || a.org_id || '—'}</td>
                        <td><span className="badge">{a.module || '—'}</span></td>
                        <td>{a.action || a.description || '—'}</td>
                      </tr>
                    ))}
                    {auditRows.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--color-text-muted)', padding: '1rem', textAlign: 'center' }}>No audit entries</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>
    </Layout>
  );
}
