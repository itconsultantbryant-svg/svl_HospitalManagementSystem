// API base URL: from build env, or runtime fallback for Render (frontend at x.onrender.com → api at x-api.onrender.com)
function getApiBase() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && typeof fromEnv === 'string') return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const { hostname, protocol } = window.location;
    if (hostname.endsWith('.onrender.com'))
      return `${protocol}//${hostname.replace('.onrender.com', '-api.onrender.com')}`;
  }
  return '';
}
const BASE = getApiBase();

function getToken() {
  return sessionStorage.getItem('uhpcms_token');
}

async function request(path, options = {}, useAuth = false) {
  const url = BASE ? `${BASE}${path}` : path;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = useAuth ? sessionStorage.getItem('uhpcms_token') : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && useAuth) {
    sessionStorage.removeItem('uhpcms_token');
    sessionStorage.removeItem('hms_user');
    window.location.href = '/login';
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok) throw new Error(data.message || res.statusText);
  return data;
}

export const api = {
  health: () => request('/api/health'),
  login: (role, username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ role, username, password }) }),

  getEmployees: () => request('/api/employees'),
  getDoctors: () => request('/api/employees/doctors'),
  createEmployee: (body) => request('/api/employees', { method: 'POST', body: JSON.stringify(body) }),
  updateEmployee: (eid, body) => request(`/api/employees/${eid}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteEmployee: (eid) => request(`/api/employees/${eid}`, { method: 'DELETE' }),
  getPatients: () => request('/api/patients'),
  createPatientLegacy: (body) => request('/api/patients', { method: 'POST', body: JSON.stringify(body) }),
  updatePatientLegacy: (pid, body) => request(`/api/patients/${pid}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePatientLegacy: (pid) => request(`/api/patients/${pid}`, { method: 'DELETE' }),
  getStats: () => request('/api/stats'),
  getOpd: (status) => request(status != null ? `/api/opd?status=${status}` : '/api/opd'),
  getOpdForDoctor: (doctorId) => request(`/api/opd/doctor/${doctorId}`),
  createOpd: (body) => request('/api/opd', { method: 'POST', body: JSON.stringify(body) }),
  completeOpd: (opdid) => request(`/api/opd/${opdid}/complete`, { method: 'PUT' }),
  removeFromOpdQueue: (pid) => request(`/api/opd/queue/${pid}`, { method: 'DELETE' }),
  deleteOpd: (opdid) => request(`/api/opd/${opdid}`, { method: 'DELETE' }),
  getOpdDetails: (opdid) => request(`/api/opd/${opdid}/details`),
  updateOpdDetails: (opdid, body) => request(`/api/opd/${opdid}/details`, { method: 'PUT', body: JSON.stringify(body) }),

  // U-HPCMS
  uhpcms: {
    login: (email, password) =>
      request('/api/uhpcms/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    legacyLogin: (role, username, password) =>
      request('/api/uhpcms/auth/login', { method: 'POST', body: JSON.stringify({ role, username, password }) }),
    getMe: () => request('/api/uhpcms/auth/me', {}, true),
    orgBranding: (params) => {
      const qs = new URLSearchParams(params || {}).toString();
      return request(`/api/uhpcms/auth/org-branding${qs ? `?${qs}` : ''}`);
    },
    getSettings: () => request('/api/uhpcms/settings'),
    publicOrgInfo: (orgId) =>
      request(`/api/uhpcms/public/${orgId}/info`),
    publicDepartments: (orgId) =>
      request(`/api/uhpcms/public/${orgId}/departments`),
    publicDoctors: (orgId) =>
      request(`/api/uhpcms/public/${orgId}/doctors`),
    requestPublicAppointment: (orgId, body) =>
      request(`/api/uhpcms/public/${orgId}/appointments`, { method: 'POST', body: JSON.stringify(body) }),
    getOrganizations: () => request('/api/uhpcms/governance/organizations', {}, true),
    createOrganization: (body) =>
      request('/api/uhpcms/governance/organizations', { method: 'POST', body: JSON.stringify(body) }, true),
    getOrganization: (id) =>
      request(`/api/uhpcms/governance/organizations/${id}`, {}, true),
    patchOrganization: (id, body) =>
      request(`/api/uhpcms/governance/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, true),
    updateOrganization: (id, body) =>
      request(`/api/uhpcms/governance/organizations/${id}`, { method: 'PUT', body: JSON.stringify(body) }, true),
    deleteOrganization: (id) =>
      request(`/api/uhpcms/governance/organizations/${id}`, { method: 'DELETE' }, true),
    getOrgModules: (orgId) =>
      request(`/api/uhpcms/governance/organizations/${orgId}/modules`, {}, true),
    setOrgModules: (orgId, modules) =>
      request(`/api/uhpcms/governance/organizations/${orgId}/modules`, {
        method: 'PUT',
        body: JSON.stringify({ modules }),
      }, true),
    getEncounters: (params) =>
      request(`/api/uhpcms/encounters?${new URLSearchParams(params).toString()}`, {}, true),
    getEncounter: (id) =>
      request(`/api/uhpcms/encounters/${id}`, {}, true),
    createEncounter: (body) =>
      request('/api/uhpcms/encounters', { method: 'POST', body: JSON.stringify(body) }, true),
    updateEncounter: (id, body) =>
      request(`/api/uhpcms/encounters/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, true),
    getCharges: (encounterId) =>
      request(`/api/uhpcms/billing/charges?encounter_id=${encounterId}`, {}, true),
    addCharge: (body) =>
      request('/api/uhpcms/billing/charges', { method: 'POST', body: JSON.stringify(body) }, true),
    getInvoices: (encounterId) =>
      request(`/api/uhpcms/billing/invoices?encounter_id=${encounterId}`, {}, true),
    getInvoicesForOrg: (orgId) =>
      request(`/api/uhpcms/billing/invoices?org_id=${orgId || ''}`, {}, true),
    getPaymentsForOrg: (orgId) =>
      request(`/api/uhpcms/billing/payments?org_id=${orgId || ''}`, {}, true),
    createInvoice: (body) =>
      request('/api/uhpcms/billing/invoices', { method: 'POST', body: JSON.stringify(body) }, true),
    addPayment: (body) =>
      request('/api/uhpcms/billing/payments', { method: 'POST', body: JSON.stringify(body) }, true),
    getInvoice: (id) =>
      request(`/api/uhpcms/billing/invoices/${id}`, {}, true),
    getPayment: (id) =>
      request(`/api/uhpcms/billing/payments/${id}`, {}, true),
    generateInitialBill: (encounterId) =>
      request(`/api/uhpcms/billing/encounters/${encounterId}/initial-bill`, { method: 'POST' }, true),

    getOrgAddons: (orgId) =>
      request(`/api/uhpcms/governance/organizations/${orgId}/addons`, {}, true),
    setOrgAddons: (orgId, addons) =>
      request(`/api/uhpcms/governance/organizations/${orgId}/addons`, { method: 'PUT', body: JSON.stringify({ addons }) }, true),
    getAddonCatalog: () =>
      request('/api/uhpcms/governance/addon-catalog', {}, true),

    getOrgBranches: (orgId) =>
      request(`/api/uhpcms/governance/organizations/${orgId}/branches`, {}, true),
    createBranch: (orgId, body) =>
      request(`/api/uhpcms/governance/organizations/${orgId}/branches`, { method: 'POST', body: JSON.stringify(body) }, true),
    patchBranch: (id, body) =>
      request(`/api/uhpcms/governance/branches/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, true),
    deleteBranch: (id) =>
      request(`/api/uhpcms/governance/branches/${id}`, { method: 'DELETE' }, true),

    getGovRoles: (orgId) =>
      request(`/api/uhpcms/governance/organizations/${orgId}/roles`, {}, true),
    createGovRole: (orgId, body) =>
      request(`/api/uhpcms/governance/organizations/${orgId}/roles`, { method: 'POST', body: JSON.stringify(body) }, true),
    getGovRolePermissions: (roleId) =>
      request(`/api/uhpcms/governance/roles/${roleId}/permissions`, {}, true),
    setGovRolePermissions: (roleId, permissionIds) =>
      request(`/api/uhpcms/governance/roles/${roleId}/permissions`, { method: 'PUT', body: JSON.stringify({ permission_ids: permissionIds }) }, true),
    getPermissionsCatalog: () =>
      request('/api/uhpcms/governance/permissions', {}, true),

    getGovernanceMonitor: () =>
      request('/api/uhpcms/governance/monitor', {}, true),
    getGovernanceAudit: (params) =>
      request(`/api/uhpcms/governance/audit?${new URLSearchParams(params || {}).toString()}`, {}, true),
    getGovernanceReport: () =>
      request('/api/uhpcms/governance/report', {}, true),

    getGovernanceUsers: (orgId) =>
      request(`/api/uhpcms/governance/users${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, {}, true),
    getGovernanceUser: (id) =>
      request(`/api/uhpcms/governance/users/${id}`, {}, true),
    updateGovernanceUser: (id, body) =>
      request(`/api/uhpcms/governance/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, true),
    deleteGovernanceUser: (id) =>
      request(`/api/uhpcms/governance/users/${id}`, { method: 'DELETE' }, true),
    getPatients: (params) =>
      request(`/api/uhpcms/patients?${new URLSearchParams(params || {}).toString()}`, {}, true),
    getPatientFullRecord: (id) =>
      request(`/api/uhpcms/patients/${id}`, {}, true),
    getPatientFullRecordByMrn: (params) =>
      request(`/api/uhpcms/patients/by-mrn?${new URLSearchParams(params).toString()}`, {}, true),
    updatePatient: (id, body) =>
      request(`/api/uhpcms/patients/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, true),
    deletePatient: (id) =>
      request(`/api/uhpcms/patients/${id}`, { method: 'DELETE' }, true),
    transferPatient: (body) =>
      request('/api/uhpcms/patients/transfer', { method: 'POST', body: JSON.stringify(body) }, true),
    searchPatient: (params) =>
      request(`/api/uhpcms/patients/search?${new URLSearchParams(params).toString()}`, {}, true),
    getNextMrn: (orgId) =>
      request(`/api/uhpcms/patients/next-mrn?org_id=${orgId}`, {}, true),
    registerPatient: (body) =>
      request('/api/uhpcms/patients/register', { method: 'POST', body: JSON.stringify(body) }, true),
    checkDuplicates: (params) =>
      request(`/api/uhpcms/patients/duplicates?${new URLSearchParams(params).toString()}`, {}, true),

    getDepartments: (orgId) =>
      request(`/api/uhpcms/org-admin/departments?org_id=${orgId}`, {}, true),
    getWards: (orgId) =>
      request(`/api/uhpcms/org-admin/wards?org_id=${orgId}`, {}, true),
    getPharmacyStores: (orgId) =>
      request(`/api/uhpcms/org-admin/pharmacy-stores?org_id=${orgId}`, {}, true),
    getServices: (orgId) =>
      request(`/api/uhpcms/org-admin/services?org_id=${orgId}`, {}, true),
    getUsers: (orgId) =>
      request(`/api/uhpcms/org-admin/users?org_id=${orgId}`, {}, true),
    getRoles: (orgId) =>
      request(`/api/uhpcms/org-admin/roles?org_id=${orgId || ''}`, {}, true),
    createDepartment: (body) =>
      request('/api/uhpcms/org-admin/departments', { method: 'POST', body: JSON.stringify(body) }, true),
    createWard: (body) =>
      request('/api/uhpcms/org-admin/wards', { method: 'POST', body: JSON.stringify(body) }, true),
    createPharmacyStore: (body) =>
      request('/api/uhpcms/org-admin/pharmacy-stores', { method: 'POST', body: JSON.stringify(body) }, true),
    createService: (body) =>
      request('/api/uhpcms/org-admin/services', { method: 'POST', body: JSON.stringify(body) }, true),
    createUser: (body) =>
      request('/api/uhpcms/org-admin/users', { method: 'POST', body: JSON.stringify(body) }, true),
    updateUser: (orgId, userId, body) =>
      request(`/api/uhpcms/org-admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }, true),
    deleteUser: (orgId, userId) =>
      request(`/api/uhpcms/org-admin/users/${userId}${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, { method: 'DELETE' }, true),

    getOrgBranding: (orgId) =>
      request(`/api/uhpcms/org-admin/branding${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, {}, true),
    updateOrgBranding: (body, orgId) =>
      request(`/api/uhpcms/org-admin/branding${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, { method: 'PUT', body: JSON.stringify(body) }, true),
    getOrgAdminAddons: (orgId) =>
      request(`/api/uhpcms/org-admin/addons${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, {}, true),
    setOrgAdminAddons: (addons, orgId) =>
      request(`/api/uhpcms/org-admin/addons${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, { method: 'PUT', body: JSON.stringify({ addons }) }, true),

    getOrgBranchesSelf: (orgId) =>
      request(`/api/uhpcms/org-admin/branches${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, {}, true),
    createBranchSelf: (body, orgId) =>
      request(`/api/uhpcms/org-admin/branches${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, { method: 'POST', body: JSON.stringify(body) }, true),

    createRole: (body, orgId) =>
      request(`/api/uhpcms/org-admin/roles${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, { method: 'POST', body: JSON.stringify(body) }, true),
    getRolePermissions: (roleId, orgId) =>
      request(`/api/uhpcms/org-admin/roles/${roleId}/permissions${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, {}, true),
    setRolePermissions: (roleId, permissionIds, orgId) =>
      request(`/api/uhpcms/org-admin/roles/${roleId}/permissions${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, { method: 'PUT', body: JSON.stringify({ permission_ids: permissionIds }) }, true),
    deleteRole: (roleId, orgId) =>
      request(`/api/uhpcms/org-admin/roles/${roleId}${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, { method: 'DELETE' }, true),
    getPermsCatalog: (orgId) =>
      request(`/api/uhpcms/org-admin/permissions${orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''}`, {}, true),

    getTriage: (encounterId) =>
      request(`/api/uhpcms/triage/${encounterId}`, {}, true),
    saveTriage: (encounterId, body) =>
      request(`/api/uhpcms/triage/${encounterId}`, { method: 'PUT', body: JSON.stringify(body) }, true),

    getLabOrders: (params) =>
      request(`/api/uhpcms/lab?${new URLSearchParams(params || {}).toString()}`, {}, true),
    createLabOrder: (body) =>
      request('/api/uhpcms/lab', { method: 'POST', body: JSON.stringify(body) }, true),
    updateLabStatus: (id, status) =>
      request(`/api/uhpcms/lab/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, true),
    submitLabResult: (id, body) =>
      request(`/api/uhpcms/lab/${id}/result`, { method: 'PATCH', body: JSON.stringify(body) }, true),

    getAdmissions: (params) =>
      request(`/api/uhpcms/inpatient/admissions?${new URLSearchParams(params || {}).toString()}`, {}, true),
    createAdmission: (body) =>
      request('/api/uhpcms/inpatient/admissions', { method: 'POST', body: JSON.stringify(body) }, true),
    dischargeAdmission: (id) =>
      request(`/api/uhpcms/inpatient/admissions/${id}/discharge`, { method: 'POST' }, true),

    getDrugs: (orgId) =>
      request(`/api/uhpcms/pharmacy/drugs?org_id=${orgId}`, {}, true),
    createDrug: (body) =>
      request('/api/uhpcms/pharmacy/drugs', { method: 'POST', body: JSON.stringify(body) }, true),
    getPrescriptions: (params) =>
      request(`/api/uhpcms/pharmacy/prescriptions?${new URLSearchParams(params || {}).toString()}`, {}, true),
    createPrescription: (body) =>
      request('/api/uhpcms/pharmacy/prescriptions', { method: 'POST', body: JSON.stringify(body) }, true),
    getPrescriptionItems: (id) =>
      request(`/api/uhpcms/pharmacy/prescriptions/${id}/items`, {}, true),
    dispensePrescription: (id, body) =>
      request(`/api/uhpcms/pharmacy/prescriptions/${id}/dispense`, { method: 'PATCH', body: JSON.stringify(body || {}) }, true),
    getInventory: (storeId) =>
      request(`/api/uhpcms/pharmacy/inventory?store_id=${storeId}`, {}, true),
    updateInventory: (body) =>
      request('/api/uhpcms/pharmacy/inventory', { method: 'POST', body: JSON.stringify(body) }, true),

    getAppointments: (params) =>
      request(`/api/uhpcms/clinic/appointments?${new URLSearchParams(params || {}).toString()}`, {}, true),
    createAppointment: (body) =>
      request('/api/uhpcms/clinic/appointments', { method: 'POST', body: JSON.stringify(body) }, true),
    checkInAppointment: (id, body) =>
      request(`/api/uhpcms/clinic/appointments/${id}/check-in`, { method: 'PATCH', body: JSON.stringify(body || {}) }, true),
    completeAppointment: (id) =>
      request(`/api/uhpcms/clinic/appointments/${id}/complete`, { method: 'PATCH' }, true),
    cancelAppointment: (id) =>
      request(`/api/uhpcms/clinic/appointments/${id}/cancel`, { method: 'PATCH' }, true),

    getReportingDashboard: (orgId) =>
      request(`/api/uhpcms/reporting/dashboard?org_id=${orgId || ''}`, {}, true),
    getReportingAnalytics: (orgId) =>
      request(`/api/uhpcms/reporting/analytics?org_id=${orgId || ''}`, {}, true),
    getBedOccupancy: (orgId) =>
      request(`/api/uhpcms/reporting/bed-occupancy?org_id=${orgId}`, {}, true),

    getAuditLog: (params) =>
      request(`/api/uhpcms/audit?${new URLSearchParams(params || {}).toString()}`, {}, true),

    getNoticeboard: (params) =>
      request(`/api/uhpcms/noticeboard?${new URLSearchParams(params || {}).toString()}`, {}, true),
    createNotice: (body) =>
      request('/api/uhpcms/noticeboard', { method: 'POST', body: JSON.stringify(body) }, true),
    updateNotice: (id, body) =>
      request(`/api/uhpcms/noticeboard/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, true),
    deleteNotice: (id) =>
      request(`/api/uhpcms/noticeboard/${id}`, { method: 'DELETE' }, true),

    getCases: (params) =>
      request(`/api/uhpcms/cases?${new URLSearchParams(params || {}).toString()}`, {}, true),
    createCase: (body) =>
      request('/api/uhpcms/cases', { method: 'POST', body: JSON.stringify(body) }, true),
    updateCase: (id, body) =>
      request(`/api/uhpcms/cases/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, true),
    deleteCase: (id) =>
      request(`/api/uhpcms/cases/${id}`, { method: 'DELETE' }, true),

    getActivities: (params) =>
      request(`/api/uhpcms/activities?${new URLSearchParams(params || {}).toString()}`, {}, true),
    logActivity: (body) =>
      request('/api/uhpcms/activities', { method: 'POST', body: JSON.stringify(body) }, true),

    getSchedules: (params) =>
      request(`/api/uhpcms/schedules?${new URLSearchParams(params || {}).toString()}`, {}, true),
    createSchedule: (body) =>
      request('/api/uhpcms/schedules', { method: 'POST', body: JSON.stringify(body) }, true),
    deleteSchedule: (id) =>
      request(`/api/uhpcms/schedules/${id}`, { method: 'DELETE' }, true),

    getBeds: (params) =>
      request(`/api/uhpcms/beds?${new URLSearchParams(params || {}).toString()}`, {}, true),
    getBedAssignments: (params) =>
      request(`/api/uhpcms/beds/assignments?${new URLSearchParams(params || {}).toString()}`, {}, true),
    createBed: (body) =>
      request('/api/uhpcms/beds', { method: 'POST', body: JSON.stringify(body) }, true),
    updateBed: (id, body) =>
      request(`/api/uhpcms/beds/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, true),
    deleteBed: (id) =>
      request(`/api/uhpcms/beds/${id}`, { method: 'DELETE' }, true),

    getInsurancePolicies: (params) =>
      request(`/api/uhpcms/insurance?${new URLSearchParams(params || {}).toString()}`, {}, true),
    createInsurancePolicy: (body) =>
      request('/api/uhpcms/insurance', { method: 'POST', body: JSON.stringify(body) }, true),
    updateInsurancePolicy: (id, body) =>
      request(`/api/uhpcms/insurance/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, true),
    deleteInsurancePolicy: (id) =>
      request(`/api/uhpcms/insurance/${id}`, { method: 'DELETE' }, true),

    getChatRooms: (params) =>
      request(`/api/uhpcms/chat/rooms?${new URLSearchParams(params || {}).toString()}`, {}, true),
    createChatRoom: (body) =>
      request('/api/uhpcms/chat/rooms', { method: 'POST', body: JSON.stringify(body) }, true),
    joinChatRoom: (roomId) =>
      request(`/api/uhpcms/chat/rooms/${roomId}/join`, { method: 'POST' }, true),
    getChatMessages: (roomId, params) =>
      request(`/api/uhpcms/chat/rooms/${roomId}/messages?${new URLSearchParams(params || {}).toString()}`, {}, true),
    sendChatMessage: (roomId, body) =>
      request(`/api/uhpcms/chat/rooms/${roomId}/messages`, { method: 'POST', body: JSON.stringify(body) }, true),

    getDocuments: (params) =>
      request(`/api/uhpcms/documents?${new URLSearchParams(params || {}).toString()}`, {}, true),
    getDocument: (id) =>
      request(`/api/uhpcms/documents/${id}`, {}, true),
    downloadDocument: async (id) => {
      const token = getToken();
      const base = (() => { const e = import.meta.env.VITE_API_URL; if (e && typeof e === 'string') return e.replace(/\/$/, ''); if (typeof window !== 'undefined' && window.location?.hostname?.endsWith('.onrender.com')) return `${window.location.protocol}//${window.location.hostname.replace('.onrender.com', '-api.onrender.com')}`; return ''; })();
      const url = base ? `${base}/api/uhpcms/documents/${id}/download` : `/api/uhpcms/documents/${id}/download`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || 'Download failed'); }
      return await res.blob();
    },
    uploadDocument: (body) =>
      request('/api/uhpcms/documents', { method: 'POST', body: JSON.stringify(body) }, true),
    deleteDocument: (id) =>
      request(`/api/uhpcms/documents/${id}`, { method: 'DELETE' }, true),

    globalSearch: (params) =>
      request(`/api/uhpcms/search?${new URLSearchParams(params || {}).toString()}`, {}, true),
  },
};
