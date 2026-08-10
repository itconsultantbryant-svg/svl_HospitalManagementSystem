import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../Layout';
import { api } from '../api';
import { getEffectiveOrgId } from '../utils/org';

const STEPS = [
  { id: 'register', label: '1. Registration' },
  { id: 'triage', label: '2. Triage' },
  { id: 'consultation', label: '3. Consultation' },
  { id: 'lab', label: '4. Lab' },
  { id: 'pharmacy', label: '5. Pharmacy' },
  { id: 'billing', label: '6. Billing' },
];

export default function PatientFlowPage({ user, onLogout }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('register');
  const [patients, setPatients] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [drugs, setDrugs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [mrn, setMrn] = useState('');
  const [searchMrn, setSearchMrn] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [nextMrn, setNextMrn] = useState('MRN001');
  const [registered, setRegistered] = useState('');
  const [regDemographics, setRegDemographics] = useState({ full_name: '', date_of_birth: '', gender: '', phone: '', address: '' });
  const [duplicates, setDuplicates] = useState([]);
  const [duplicatesChecked, setDuplicatesChecked] = useState(false);
  const [encounterId, setEncounterId] = useState('');
  const [triageData, setTriageData] = useState({ vitals: '', severity: '', notes: '' });
  const [soapNotes, setSoapNotes] = useState('');
  const [referralNotes, setReferralNotes] = useState('');
  const [labTestName, setLabTestName] = useState('');
  const [labTestCode, setLabTestCode] = useState('');
  const [rxItems, setRxItems] = useState([{ drug_id: '', quantity: 1, dosage: '', duration: '' }]);
  const [patientFlowBlocked, setPatientFlowBlocked] = useState(false);
  const [pharmacyBlocked, setPharmacyBlocked] = useState(false);

  const currentOrgId = getEffectiveOrgId(user);
  const enabledModules = Array.isArray(user?.enabled_modules) ? user.enabled_modules : [];
  const hasExplicitModules = enabledModules.length > 0;
  const canUsePatientFlow = !hasExplicitModules || enabledModules.includes('hospital') || enabledModules.includes('clinic');
  const canUsePharmacy = !hasExplicitModules || enabledModules.includes('pharmacy');
  const shouldAllowPatientFlow = canUsePatientFlow && !patientFlowBlocked;
  const shouldAllowPharmacy = canUsePharmacy && !pharmacyBlocked;

  const isFeature403 = (err) => {
    const msg = (err?.message || '').toLowerCase();
    return msg.includes('403') || msg.includes('feature is not enabled') || msg.includes('not enabled for your organization');
  };

  const loadDataForOrg = (orgId) => {
    if (!orgId) return;
    if (!shouldAllowPatientFlow) return;
    setLoading(true);
    Promise.all([
      api.uhpcms.getPatients({ org_id: orgId }).then((r) => r.data || []),
      api.uhpcms.getEncounters({ org_id: orgId }).then((r) => r.data || []),
      api.uhpcms.getDepartments(orgId).then((r) => r.data || []),
      api.uhpcms.getNextMrn(orgId).then((r) => r.mrn),
    ]).then(([p, e, d, m]) => {
      setPatients(p);
      setEncounters(e);
      setDepartments(d);
      setNextMrn(m);
    }).catch((err) => {
      if (isFeature403(err)) {
        setPatientFlowBlocked(true);
        setError('This feature is not enabled for your organization. Enable hospital/clinic module in Governance.');
      } else {
        setError(err?.message || 'Failed to load patient flow data.');
      }
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user) return;
  }, [user]);

  useEffect(() => {
    loadDataForOrg(currentOrgId);
  }, [currentOrgId, shouldAllowPatientFlow]);

  useEffect(() => {
    if (!currentOrgId || !shouldAllowPatientFlow || !shouldAllowPharmacy) return;
    api.uhpcms.getDrugs(currentOrgId)
      .then((r) => setDrugs(r.data || []))
      .catch((err) => {
        if (isFeature403(err)) {
          setPharmacyBlocked(true);
          setDrugs([]);
        }
      });
  }, [currentOrgId, shouldAllowPatientFlow, shouldAllowPharmacy]);

  // Debounced duplicate-patient check while the receptionist fills the registration form.
  useEffect(() => {
    if (!currentOrgId || !shouldAllowPatientFlow) return;
    const { full_name, date_of_birth, phone } = regDemographics;
    const name = String(full_name || '').trim();
    const dob = String(date_of_birth || '').trim();
    const ph = String(phone || '').trim();
    if (!name && !dob && !ph) {
      setDuplicates([]);
      setDuplicatesChecked(false);
      return;
    }
    const timer = setTimeout(() => {
      const params = { org_id: currentOrgId };
      if (name) params.full_name = name;
      if (dob) params.date_of_birth = dob;
      if (ph) params.phone = ph;
      api.uhpcms.checkDuplicates(params)
        .then((r) => {
          setDuplicates(r.data || []);
          setDuplicatesChecked(true);
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [regDemographics.full_name, regDemographics.date_of_birth, regDemographics.phone, currentOrgId, shouldAllowPatientFlow]);

  const handleSearchPatient = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!currentOrgId || !searchMrn.trim() || !shouldAllowPatientFlow) return;
    try {
      const r = await api.uhpcms.searchPatient({ org_id: currentOrgId, mrn: searchMrn.trim() });
      setSearchResult(r.data || null);
      if (r.data) setRegistered(r.data.mrn);
    } catch (err) {
      if (isFeature403(err)) {
        setPatientFlowBlocked(true);
        setError('This feature is not enabled for your organization. Enable hospital/clinic module in Governance.');
      } else {
        setError(err.message);
      }
      setSearchResult(null);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!shouldAllowPatientFlow) return;
    try {
      await api.uhpcms.registerPatient({
        org_id: currentOrgId,
        mrn: mrn || nextMrn,
        full_name: regDemographics.full_name || undefined,
        date_of_birth: regDemographics.date_of_birth || undefined,
        gender: regDemographics.gender || undefined,
        phone: regDemographics.phone || undefined,
        address: regDemographics.address || undefined,
      });
      setRegistered(mrn || nextMrn);
      setDuplicates([]);
      setDuplicatesChecked(false);
      const r = await api.uhpcms.getPatients({ org_id: currentOrgId });
      setPatients(r.data || []);
    } catch (err) {
      if (isFeature403(err)) {
        setPatientFlowBlocked(true);
        setError('This feature is not enabled for your organization. Enable hospital/clinic module in Governance.');
      } else {
        setError(err.message);
      }
    }
  };

  const handleCreateEncounter = async (e) => {
    e.preventDefault();
    setError('');
    if (!shouldAllowPatientFlow) return;
    try {
      const r = await api.uhpcms.createEncounter({
        org_id: currentOrgId,
        patient_mrn: registered || mrn,
        department_id: departments[0]?.id || null,
      });
      setEncounterId(r.id);
      const e2 = await api.uhpcms.getEncounters({ org_id: currentOrgId });
      setEncounters(e2.data || []);
    } catch (err) {
      if (isFeature403(err)) {
        setPatientFlowBlocked(true);
        setError('This feature is not enabled for your organization. Enable hospital/clinic module in Governance.');
      } else {
        setError(err.message);
      }
    }
  };

  const handleSaveTriage = async (e) => {
    e.preventDefault();
    if (!encounterId || !shouldAllowPatientFlow) return;
    setError('');
    setSuccessMsg('');
    try {
      await api.uhpcms.saveTriage(encounterId, triageData);
      setSuccessMsg('Triage saved.');
      loadDataForOrg(currentOrgId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveConsultation = async (e) => {
    e.preventDefault();
    if (!encounterId || !shouldAllowPatientFlow) return;
    setError('');
    setSuccessMsg('');
    try {
      await api.uhpcms.updateEncounter(encounterId, { soap_notes: soapNotes, status: 'consultation' });
      setSuccessMsg('Consultation notes saved.');
      loadDataForOrg(currentOrgId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOrderLab = async (e) => {
    e.preventDefault();
    if (!encounterId || !labTestName || !shouldAllowPatientFlow) return;
    setError('');
    setSuccessMsg('');
    try {
      await api.uhpcms.createLabOrder({ encounter_id: encounterId, test_name: labTestName, test_code: labTestCode || undefined });
      setLabTestName('');
      setLabTestCode('');
      setSuccessMsg('Lab order created.');
      loadDataForOrg(currentOrgId);
    } catch (err) { setError(err.message); }
  };

  const addRxLine = () => setRxItems((prev) => [...prev, { drug_id: '', quantity: 1, dosage: '', duration: '' }]);
  const updateRxLine = (i, field, value) => setRxItems((prev) => prev.map((item, j) => (j === i ? { ...item, [field]: value } : item)));

  const handleOrderPrescription = async (e) => {
    e.preventDefault();
    const items = rxItems.filter((it) => it.drug_id).map((it) => ({ drug_id: it.drug_id, quantity: Number(it.quantity) || 1, dosage: it.dosage || undefined, duration: it.duration || undefined }));
    if (!encounterId || items.length === 0 || !shouldAllowPharmacy) return;
    setError('');
    setSuccessMsg('');
    try {
      await api.uhpcms.createPrescription({ encounter_id: encounterId, items });
      setRxItems([{ drug_id: '', quantity: 1, dosage: '', duration: '' }]);
      setSuccessMsg('Prescription created.');
      loadDataForOrg(currentOrgId);
    } catch (err) { setError(err.message); }
  };

  const goToBilling = () => navigate(encounterId ? `/billing?encounter_id=${encounterId}` : '/billing');

  const handleCloseEncounter = async () => {
    if (!encounterId || !shouldAllowPatientFlow) return;
    setError('');
    try {
      const payload = { status: 'discharged' };
      if (referralNotes.trim()) payload.referral_notes = referralNotes.trim();
      await api.uhpcms.updateEncounter(encounterId, payload);
      setReferralNotes('');
      const e2 = await api.uhpcms.getEncounters({ org_id: currentOrgId });
      setEncounters(e2.data || []);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="page-enter page-enter-active">
        <h2 className="section-title">Patient flow</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Registration → Triage → Consultation → Lab → Pharmacy → Billing</p>
        {!canUsePatientFlow && <p className="login-error" style={{ marginBottom: '1rem' }}>Patient flow module is not enabled for your account/organization.</p>}
        {patientFlowBlocked && <p className="login-error" style={{ marginBottom: '1rem' }}>Backend rejected patient-flow access (403). Ask admin to enable hospital/clinic for this organization.</p>}
        <div className="flow-step" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem', display: 'flex' }}>
          {STEPS.map((s) => (
            <button key={s.id} type="button" className={`btn ${step === s.id ? 'btn-primary' : ''}`} style={step === s.id ? {} : { background: 'var(--color-bg)', color: 'var(--color-text)' }} onClick={() => { setStep(s.id); setError(''); setSuccessMsg(''); }}>{s.label}</button>
          ))}
        </div>
        {!currentOrgId && <p className="login-error" style={{ marginBottom: '1rem' }}>Hospital is not configured yet.</p>}
        {error && <div className="login-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        {successMsg && <div className="login-success" style={{ marginBottom: '1rem' }}>{successMsg}</div>}
        {shouldAllowPatientFlow && step === 'register' && (
          <div className="card card-interactive">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Patient registration</h3>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>Search existing patient by MRN, or register new.</p>
              <form onSubmit={handleSearchPatient} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
                <label>
                  Search by MRN
                  <input type="text" value={searchMrn} onChange={(e) => { setSearchMrn(e.target.value); setSearchResult(null); }} placeholder="e.g. MRN001" style={{ display: 'block', padding: '0.5rem', minWidth: 140 }} />
                </label>
                <button type="submit" className="btn-primary" disabled={loading || !currentOrgId}>Search</button>
              </form>
              {searchResult && <p className="login-success" style={{ marginBottom: '0.5rem' }}>Found: <strong>{searchResult.mrn}</strong> (PID: {searchResult.pid || '—'}). Use below to create encounter.</p>}
              {searchResult === null && searchMrn.trim() !== '' && <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>No patient with that MRN. Register new below.</p>}
              <hr style={{ borderColor: 'var(--color-border)', margin: '1rem 0' }} />
              <h4 style={{ marginTop: 0 }}>Register new patient</h4>
              {duplicatesChecked && duplicates.length > 0 && (
                <div style={{ border: '1px solid #e6a817', background: '#fff7e0', color: '#7a5a00', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '0.75rem', maxWidth: 480 }}>
                  <strong>⚠️ Possible duplicate patients found</strong>
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                    {duplicates.map((d) => (
                      <li key={d.id}>
                        <button type="button" onClick={() => navigate(`/patients/${d.id}`)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-primary, #1a6fb5)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>
                          {d.full_name || 'Unknown'} (MRN {d.mrn})
                        </button>
                        {d.date_of_birth ? ` · DOB ${d.date_of_birth}` : ''}
                        {d.phone ? ` · ${d.phone}` : ''}
                      </li>
                    ))}
                  </ul>
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>Please verify before proceeding — you can still register if this is a new patient.</p>
                </div>
              )}
              <form onSubmit={handleRegister} style={{ display: 'grid', gap: '0.5rem', maxWidth: 480 }}>
                <label>MRN (auto: {nextMrn})<input type="text" value={mrn} onChange={(e) => setMrn(e.target.value)} placeholder={nextMrn} style={{ display: 'block', padding: '0.5rem', width: '100%' }} /></label>
                <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Optional demographics</p>
                <label>Full name<input type="text" value={regDemographics.full_name} onChange={(e) => setRegDemographics((d) => ({ ...d, full_name: e.target.value }))} placeholder="Patient name" style={{ display: 'block', padding: '0.5rem', width: '100%' }} /></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <label>DOB<input type="date" value={regDemographics.date_of_birth} onChange={(e) => setRegDemographics((d) => ({ ...d, date_of_birth: e.target.value }))} style={{ display: 'block', padding: '0.5rem', width: '100%' }} /></label>
                  <label>Gender<select value={regDemographics.gender} onChange={(e) => setRegDemographics((d) => ({ ...d, gender: e.target.value }))} style={{ display: 'block', padding: '0.5rem', width: '100%' }}><option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label>
                </div>
                <label>Phone<input type="text" value={regDemographics.phone} onChange={(e) => setRegDemographics((d) => ({ ...d, phone: e.target.value }))} placeholder="Phone" style={{ display: 'block', padding: '0.5rem', width: '100%' }} /></label>
                <label>Address<textarea value={regDemographics.address} onChange={(e) => setRegDemographics((d) => ({ ...d, address: e.target.value }))} rows={2} placeholder="Address" style={{ display: 'block', padding: '0.5rem', width: '100%' }} /></label>
                <button type="submit" className="btn-primary" disabled={loading || !currentOrgId}>Register new</button>
              </form>
              {registered && <p style={{ marginTop: '0.5rem' }}>Current patient MRN: <strong>{registered}</strong></p>}
              <h4 style={{ marginTop: '1rem' }}>Create encounter</h4>
              <form onSubmit={handleCreateEncounter} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
                <input type="text" value={registered || mrn} onChange={(e) => setMrn(e.target.value)} placeholder="MRN" style={{ padding: '0.5rem', minWidth: 120 }} />
                <button type="submit" className="btn-primary" disabled={!currentOrgId || !(registered || mrn)}>Create encounter</button>
              </form>
              {encounterId && <p style={{ marginTop: '0.5rem' }}>Encounter: <strong>{encounterId}</strong></p>}
              <div className="table-wrap" style={{ marginTop: '1rem' }}><table className="table"><thead><tr><th>MRN</th><th>PID</th></tr></thead><tbody>{patients.slice(0, 10).map((p) => <tr key={p.mrn}><td>{p.mrn}</td><td>{p.pid || '—'}</td></tr>)}</tbody></table></div>
            </div>
          </div>
        )}
        {shouldAllowPatientFlow && step === 'triage' && (
          <div className="card card-interactive">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Triage</h3>
              <select value={encounterId} onChange={(e) => setEncounterId(e.target.value)} style={{ padding: '0.5rem', minWidth: 280, marginBottom: '1rem' }}>
                <option value="">Select encounter</option>
                {encounters.filter((e) => e.status === 'registered' || e.status === 'triage').map((e) => <option key={e.id} value={e.id}>{e.id} — {e.patient_mrn}</option>)}
              </select>
              <form onSubmit={handleSaveTriage}>
                <label>Vitals</label><textarea value={triageData.vitals} onChange={(e) => setTriageData((s) => ({ ...s, vitals: e.target.value }))} rows={2} style={{ width: '100%', padding: '0.5rem' }} />
                <label>Severity</label><select value={triageData.severity} onChange={(e) => setTriageData((s) => ({ ...s, severity: e.target.value }))} style={{ padding: '0.5rem' }}><option value="">—</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
                <label>Notes</label><textarea value={triageData.notes} onChange={(e) => setTriageData((s) => ({ ...s, notes: e.target.value }))} rows={2} style={{ width: '100%', padding: '0.5rem' }} />
                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>Save triage</button>
              </form>
            </div>
          </div>
        )}
        {shouldAllowPatientFlow && step === 'consultation' && (
          <div className="card card-interactive">
            <div className="card-body">
              <h3 style={{ marginTop: 0 }}>Consultation (SOAP)</h3>
              <select value={encounterId} onChange={(e) => setEncounterId(e.target.value)} style={{ padding: '0.5rem', minWidth: 280, marginBottom: '1rem' }}>
                <option value="">Select encounter</option>
                {encounters.map((e) => <option key={e.id} value={e.id}>{e.id} — {e.patient_mrn}</option>)}
              </select>
              <form onSubmit={handleSaveConsultation}>
                <label>SOAP notes</label><textarea value={soapNotes} onChange={(e) => setSoapNotes(e.target.value)} rows={4} style={{ width: '100%', padding: '0.5rem' }} />
                <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>Save notes</button>
              </form>
              <hr style={{ margin: '1.5rem 0', borderColor: 'var(--color-border)' }} />
              <h4 style={{ marginTop: 0 }}>Order lab</h4>
              <form onSubmit={handleOrderLab} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
                <input type="text" value={labTestName} onChange={(e) => setLabTestName(e.target.value)} placeholder="Test name" required style={{ padding: '0.5rem' }} />
                <input type="text" value={labTestCode} onChange={(e) => setLabTestCode(e.target.value)} placeholder="Test code" style={{ padding: '0.5rem' }} />
                <button type="submit" className="btn-primary" disabled={!encounterId}>Order lab</button>
              </form>
              <h4 style={{ marginTop: '0.5rem' }}>Order prescription</h4>
              {!shouldAllowPharmacy && <p className="login-error" style={{ marginBottom: '0.5rem' }}>Pharmacy module is not enabled for this organization.</p>}
              <form onSubmit={handleOrderPrescription}>
                {rxItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <select value={item.drug_id} onChange={(e) => updateRxLine(i, 'drug_id', e.target.value)} style={{ padding: '0.5rem', minWidth: 160 }}>
                      <option value="">Drug</option>
                      {drugs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <input type="number" value={item.quantity} onChange={(e) => updateRxLine(i, 'quantity', e.target.value)} min={1} style={{ width: 64, padding: '0.5rem' }} placeholder="Qty" />
                    <input type="text" value={item.dosage} onChange={(e) => updateRxLine(i, 'dosage', e.target.value)} placeholder="Dosage" style={{ width: 90, padding: '0.5rem' }} />
                    <input type="text" value={item.duration} onChange={(e) => updateRxLine(i, 'duration', e.target.value)} placeholder="Duration" style={{ width: 90, padding: '0.5rem' }} />
                  </div>
                ))}
                <button type="button" onClick={addRxLine} style={{ marginRight: '0.5rem' }} disabled={!shouldAllowPharmacy}>+ Line</button>
                <button type="submit" className="btn-primary" disabled={!encounterId || !shouldAllowPharmacy}>Order prescription</button>
              </form>
              <p style={{ marginTop: '1rem' }}>
                <button type="button" className="btn-primary" onClick={goToBilling}>Go to Billing</button>
                {' '}for this encounter (USD only).
              </p>
              <hr style={{ borderColor: 'var(--color-border)', margin: '1rem 0' }} />
              <h4 style={{ marginTop: 0 }}>Close encounter</h4>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Mark encounter as discharged when care is complete. Optionally add referral notes (e.g. refer to hospital).</p>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Referral notes (optional)</label>
              <textarea value={referralNotes} onChange={(e) => setReferralNotes(e.target.value)} placeholder="e.g. Refer to General Hospital for imaging" rows={2} style={{ width: '100%', maxWidth: 400, padding: '0.5rem', marginBottom: '0.5rem' }} />
              <button type="button" className="btn-primary" style={{ background: 'var(--color-text-muted)' }} onClick={handleCloseEncounter} disabled={!encounterId}>Close encounter (discharge)</button>
            </div>
          </div>
        )}
        {shouldAllowPatientFlow && step === 'lab' && (
          <div className="card card-body">
            <h3 style={{ marginTop: 0 }}>Lab</h3>
            <p>Order tests and submit results in the Lab workflow.</p>
            {encounterId && <p><button type="button" className="btn-primary" style={{ marginTop: '0.5rem' }} onClick={() => navigate(`/lab?encounter_id=${encounterId}`)}>Open Lab for encounter {encounterId}</button></p>}
          </div>
        )}
        {shouldAllowPatientFlow && step === 'pharmacy' && (
          <div className="card card-body">
            <h3 style={{ marginTop: 0 }}>Pharmacy</h3>
            <p>Create prescriptions in Consultation; dispense from the Pharmacy page.</p>
            {encounterId && <p><button type="button" className="btn-primary" style={{ marginTop: '0.5rem' }} onClick={() => navigate('/pharmacy')}>Open Pharmacy</button></p>}
          </div>
        )}
        {shouldAllowPatientFlow && step === 'billing' && (
          <div className="card card-body">
            <h3 style={{ marginTop: 0 }}>Billing</h3>
            <p>Add charges, create invoices, and record payments (USD only).</p>
            <button type="button" className="btn-primary" style={{ marginTop: '0.5rem' }} onClick={goToBilling}>{encounterId ? `Open Billing for ${encounterId}` : 'Open Billing'}</button>
          </div>
        )}
      </div>
    </Layout>
  );
}
