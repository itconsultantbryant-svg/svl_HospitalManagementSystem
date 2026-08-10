import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Layout from '../Layout';
import { api } from '../api';
import { getEffectiveOrgId } from '../utils/org';

export default function Search({ user, onLogout }) {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') || '').trim();
  const orgId = getEffectiveOrgId(user);

  const [patients, setPatients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [notices, setNotices] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [legacyEmployees, setLegacyEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q) {
      setLoading(false);
      setPatients([]);
      setEmployees([]);
      setNotices([]);
      setDepartments([]);
      setEncounters([]);
      setInvoices([]);
      setLegacyEmployees([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.uhpcms.globalSearch({ q, org_id: orgId })
      .then((r) => {
        if (cancelled) return;
        const d = r.data || {};
        setPatients(d.patients || []);
        setEmployees(d.users || []);
        setNotices(d.notices || []);
        setDepartments(d.departments || []);
        setEncounters(d.encounters || []);
        setInvoices(d.invoices || []);
        setLegacyEmployees(d.legacy_employees || []);
      })
      .catch(() => {
        if (!cancelled) {
          setPatients([]);
          setEmployees([]);
          setNotices([]);
          setDepartments([]);
          setEncounters([]);
          setInvoices([]);
          setLegacyEmployees([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [q, orgId]);

  const showResults = q && !loading;
  const hasResults =
    (patients?.length > 0) ||
    (employees?.length > 0) ||
    (notices?.length > 0) ||
    (departments?.length > 0) ||
    (encounters?.length > 0) ||
    (invoices?.length > 0) ||
    (legacyEmployees?.length > 0);

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="page-enter page-enter-active">
        <h2 className="section-title">Search</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
          {q ? `Results for “${q}”` : 'Enter a search term above and press Enter or use the header search.'}
        </p>

        {!q && (
          <div className="card" style={{ padding: '1.5rem' }}>
            <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
              Search for patients (name, MRN, phone), doctors, and employees across the system.
            </p>
          </div>
        )}

        {q && loading && <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>}

        {showResults && (
          <>
            {(patients?.length || 0) > 0 && (
              <section className="section">
                <h3 className="section-title">Patients ({patients.length})</h3>
                <div className="card">
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>MRN</th>
                          <th>Name</th>
                          <th>Phone</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {patients.map((p) => (
                          <tr key={p.id || p.mrn}>
                            <td><strong>{p.mrn}</strong></td>
                            <td>{p.full_name || '—'}</td>
                            <td>{p.phone || '—'}</td>
                            <td>
                              <Link to={p.id ? `/patients/${p.id}` : `/patients?q=${encodeURIComponent(p.mrn)}`} className="btn btn--sm btn-primary">View</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {employees?.length > 0 && (
              <section className="section">
                <h3 className="section-title">Doctors / Staff ({employees.length})</h3>
                <div className="card">
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Name</th>
                          <th>Role</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((e) => (
                          <tr key={e.id}>
                            <td><strong>{e.email}</strong></td>
                            <td>{e.full_name || '—'}</td>
                            <td><span className="badge">{(e.role_id || '').replace('role_', '')}</span></td>
                            <td><Link to="/doctors" className="btn btn--sm btn-primary">View list</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {departments?.length > 0 && (
              <section className="section">
                <h3 className="section-title">Departments ({departments.length})</h3>
                <div className="card" style={{ padding: '1rem' }}>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {departments.map((d) => (
                      <li key={d.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)' }}>
                        <strong>{d.name}</strong>
                        <div style={{ marginTop: '0.5rem' }}>
                          <Link to="/departments" className="btn btn--sm btn-primary">Open departments</Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {encounters?.length > 0 && (
              <section className="section">
                <h3 className="section-title">Encounters ({encounters.length})</h3>
                <div className="card">
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>MRN</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {encounters.map((e) => (
                          <tr key={e.id}>
                            <td><strong>{e.id}</strong></td>
                            <td>{e.patient_mrn || '—'}</td>
                            <td><span className="badge">{e.status}</span></td>
                            <td>
                              <Link to={`/billing?tab=workflow&encounter_id=${encodeURIComponent(e.id)}`} className="btn btn--sm btn-primary">Open billing</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {invoices?.length > 0 && (
              <section className="section">
                <h3 className="section-title">Invoices ({invoices.length})</h3>
                <div className="card">
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Encounter</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((i) => (
                          <tr key={i.id}>
                            <td><strong>{i.id}</strong></td>
                            <td>{i.encounter_id}</td>
                            <td><span className="badge">{i.status}</span></td>
                            <td><Link to="/billing?tab=invoices" className="btn btn--sm btn-primary">Open invoices</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {legacyEmployees?.length > 0 && (
              <section className="section">
                <h3 className="section-title">Legacy employees ({legacyEmployees.length})</h3>
                <div className="card">
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>EID</th>
                          <th>Name</th>
                          <th>Role</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {legacyEmployees.map((e) => (
                          <tr key={e.eid}>
                            <td><strong>{e.eid}</strong></td>
                            <td>{[e.firstName, e.lastName].filter(Boolean).join(' ') || '—'}</td>
                            <td><span className="badge">{e.role}</span></td>
                            <td><Link to="/employees" className="btn btn--sm btn-primary">Open employees</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {notices?.length > 0 && (
              <section className="section">
                <h3 className="section-title">Notices ({notices.length})</h3>
                <div className="card">
                  <ul style={{ margin: 0, padding: '1rem', listStyle: 'none' }}>
                    {notices.map((n) => (
                      <li key={n.id} style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                        <strong>{n.title}</strong>
                        {n.content && <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>{n.content}</p>}
                        <Link to="/noticeboard" className="btn btn--sm btn-primary" style={{ marginTop: '0.5rem' }}>View Noticeboard</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {!hasResults && (
              <div className="card" style={{ padding: '1.5rem' }}>
                <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>No patients, staff, or notices match “{q}”.</p>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
