import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../Layout';
import { api } from '../api';
import { useCurrency } from '../context/CurrencyContext';
import { getEffectiveOrgId } from '../utils/org';
import DocumentList from '../components/DocumentList';

const TABS = [
  { id: 'workflow', label: 'Add Bill / Workflow' },
  { id: 'invoices', label: 'Invoice List' },
  { id: 'payments', label: 'Payment Report' },
  { id: 'debit', label: 'Debit Report' },
  { id: 'credit', label: 'Credit Report' },
];

export default function Billing({ user, onLogout }) {
  const [searchParams] = useSearchParams();
  const encounterIdFromUrl = searchParams.get('encounter_id');
  const tabFromUrl = searchParams.get('tab') || 'workflow';
  const { formatMoney } = useCurrency();
  const orgId = getEffectiveOrgId(user);

  const [activeTab, setActiveTab] = useState(tabFromUrl);
  const [encounters, setEncounters] = useState([]);
  const [selectedEnc, setSelectedEnc] = useState(encounterIdFromUrl || null);
  const [charges, setCharges] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [error, setError] = useState('');
  const [newCharge, setNewCharge] = useState({ service_code: '', description: '', amount: '', currency: 'USD' });
  const [newPayment, setNewPayment] = useState({ amount: '', currency: 'USD', invoice_id: '', method: 'cash', reference: '' });
  const [docsForInvoiceId, setDocsForInvoiceId] = useState(null);
  const [invoiceDocuments, setInvoiceDocuments] = useState([]);

  useEffect(() => {
    if (encounterIdFromUrl) setSelectedEnc(encounterIdFromUrl);
  }, [encounterIdFromUrl]);
  useEffect(() => {
    const t = searchParams.get('tab') || 'workflow';
    setActiveTab(t);
  }, [searchParams]);

  useEffect(() => {
    api.uhpcms.getEncounters(orgId ? { org_id: orgId } : {})
      .then((r) => setEncounters(r.data || []))
      .catch(() => setEncounters([]))
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    if (!selectedEnc) { setCharges([]); setInvoices([]); return; }
    setError('');
    Promise.all([
      api.uhpcms.getCharges(selectedEnc).then((r) => r.data || []).catch(() => []),
      api.uhpcms.getInvoices(selectedEnc).then((r) => r.data || []).catch(() => []),
    ]).then(([c, i]) => {
      setCharges(c);
      setInvoices(i);
    });
  }, [selectedEnc]);

  const handleGenerateInitialBill = async () => {
    if (!selectedEnc) return;
    setError('');
    try {
      await api.uhpcms.generateInitialBill(selectedEnc);
      const r = await api.uhpcms.getCharges(selectedEnc);
      setCharges(r.data || []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (activeTab !== 'invoices' && activeTab !== 'payments' && activeTab !== 'debit' && activeTab !== 'credit') return;
    if (!orgId) return setReportsLoading(false);
    setReportsLoading(true);
    const loadInvoices = () =>
      api.uhpcms.getInvoicesForOrg(orgId)
        .then((r) => setAllInvoices(r.data || []))
        .catch(() => setAllInvoices([]));
    const loadPayments = () =>
      api.uhpcms.getPaymentsForOrg(orgId)
        .then((r) => setAllPayments(r.data || []))
        .catch(() => setAllPayments([]));
    if (activeTab === 'payments' || activeTab === 'credit') {
      loadPayments().finally(() => setReportsLoading(false));
    } else {
      loadInvoices().finally(() => setReportsLoading(false));
    }
  }, [activeTab, orgId]);

  useEffect(() => {
    if (!docsForInvoiceId || !orgId) return;
    api.uhpcms.getDocuments({ org_id: orgId, entity_type: 'invoice', entity_id: docsForInvoiceId })
      .then((r) => setInvoiceDocuments(r.data || []))
      .catch(() => setInvoiceDocuments([]));
  }, [docsForInvoiceId, orgId]);

  const handleAddCharge = async (e) => {
    e.preventDefault();
    if (!selectedEnc || !newCharge.service_code || !newCharge.amount) return;
    setError('');
    try {
      await api.uhpcms.addCharge({
        encounter_id: selectedEnc,
        service_code: newCharge.service_code,
        description: newCharge.description,
        amount: parseFloat(newCharge.amount),
        currency: newCharge.currency,
      });
      const r = await api.uhpcms.getCharges(selectedEnc);
      setCharges(r.data || []);
      setNewCharge({ service_code: '', description: '', amount: '', currency: 'USD' });
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCreateInvoice = async () => {
    if (!selectedEnc) return;
    setError('');
    try {
      await api.uhpcms.createInvoice({ encounter_id: selectedEnc, currency: 'USD' });
      const r = await api.uhpcms.getInvoices(selectedEnc);
      setInvoices(r.data || []);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    if (!newPayment.invoice_id || !newPayment.amount) return;
    setError('');
    try {
      await api.uhpcms.addPayment({
        invoice_id: newPayment.invoice_id,
        amount: parseFloat(newPayment.amount),
        currency: newPayment.currency,
        method: newPayment.method || 'cash',
        reference: newPayment.reference || undefined,
      });
      const r = await api.uhpcms.getInvoices(selectedEnc);
      setInvoices(r.data || []);
      setNewPayment({ amount: '', currency: 'USD', invoice_id: '', method: 'cash', reference: '' });
    } catch (e) {
      setError(e.message);
    }
  };

  const debitInvoices = allInvoices.filter((i) => i.status === 'pending' || i.status === 'partial');
  const creditPayments = allPayments;

  const handlePrintInvoice = async (invoiceId) => {
    try {
      const r = await api.uhpcms.getInvoice(invoiceId);
      const inv = r.data;
      const b = inv.branding || {};
      const logoHtml = b.logo ? `<img src="${b.logo}" alt="logo" style="height:56px;object-fit:contain;border-radius:6px;background:#fff;padding:2px">` : '';
      const sigHtml = b.signature ? `<img src="${b.signature}" alt="signature" style="height:40px;object-fit:contain;border-radius:4px;border:1px solid #ddd;background:#fff">` : '';
      const orgInfo = b.name ? `<strong>${b.name}</strong>${b.address ? `<br>${b.address}` : ''}${b.phone ? `<br>${b.phone}${b.country ? ', ' + b.country : ''}` : ''}` : '';
      const win = window.open('', '_blank');
      win.document.write(`
        <!DOCTYPE html><html><head><title>Invoice ${inv.id}</title><style>
          body{font-family:sans-serif;padding:24px;max-width:700px;margin:0 auto}
          table{width:100%;border-collapse:collapse;margin:1rem 0}
          th,td{border:1px solid #ddd;padding:8px;text-align:left}
          .total{font-weight:bold;font-size:1.1rem}
          .inv-header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem}
          .inv-org-info{font-size:0.85rem;line-height:1.4}
          .inv-footer{margin-top:2rem;display:flex;justify-content:space-between;align-items:flex-end}
        </style></head><body>
        <div class="inv-header">
          <div>${logoHtml}<h2 style="margin-top:0.25rem">INVOICE</h2></div>
          <div class="inv-org-info">${orgInfo}</div>
        </div>
        <p><strong>Invoice ID:</strong> ${inv.id} &nbsp; <strong>Encounter:</strong> ${inv.encounter_id} &nbsp; <strong>Patient MRN:</strong> ${inv.patient_mrn || '—'}</p>
        <p><strong>Date:</strong> ${inv.created_at} &nbsp; <strong>Status:</strong> ${inv.status}</p>
        <table><thead><tr><th>Code</th><th>Description</th><th>Amount</th></tr></thead><tbody>
        ${(inv.charges || []).map((c) => `<tr><td>${c.service_code}</td><td>${c.description || '—'}</td><td>${formatMoney((c.amount || 0) * (c.quantity || 1), c.currency)}</td></tr>`).join('')}
        </tbody></table>
        <p class="total">Total: ${formatMoney(inv.total_amount, inv.currency)}</p>
        ${(inv.payments || []).length ? `<p>Payments: ${(inv.payments || []).map((p) => `${formatMoney(p.amount, p.currency)} (${(p.method || 'cash').replace(/_/g, ' ')})`).join(', ')}</p>` : ''}
        ${sigHtml ? `<div class="inv-footer"><div></div><div style="text-align:center;font-size:0.8rem">${sigHtml}<br>Authorised Signature</div></div>` : ''}
        <p style="marginTop:2rem"><button onclick="window.print()">Print</button> <button onclick="window.close()">Close</button></p>
        </body></html>`);
      win.document.close();
    } catch (e) {
      setError(e.message);
    }
  };

  const handlePrintReceipt = async (paymentId) => {
    try {
      const r = await api.uhpcms.getPayment(paymentId);
      const p = r.data;
      const methodLabel = (p.method || 'cash').replace(/_/g, ' ');
      const b = p.branding || {};
      const logoHtml = b.logo ? `<img src="${b.logo}" alt="logo" style="height:48px;object-fit:contain;border-radius:6px;background:#fff;padding:2px">` : '';
      const orgHeader = b.name ? `<div style="margin-bottom:0.5rem">${logoHtml}<br><strong>${b.name}</strong>${b.address ? `<br><span style="font-size:0.8rem">${b.address}</span>` : ''}</div>` : (logoHtml ? `<div style="margin-bottom:0.5rem">${logoHtml}</div>` : '');
      const win = window.open('', '_blank');
      win.document.write(`
        <!DOCTYPE html><html><head><title>Receipt ${p.id}</title><style>
          body{font-family:sans-serif;padding:24px;max-width:400px;margin:0 auto}
          .receipt{border:1px solid #333;padding:1.5rem}
          .center{text-align:center}
          .row{display:flex;justify-content:space-between;margin:0.5rem 0}
        </style></head><body>
        <div class="receipt">
          ${orgHeader}
          <h3 class="center">PAYMENT RECEIPT</h3>
          <div class="row"><span>Receipt #</span><span>${p.id}</span></div>
          <div class="row"><span>Date</span><span>${p.created_at}</span></div>
          <div class="row"><span>Invoice</span><span>${p.invoice_id}</span></div>
          <div class="row"><span>Patient MRN</span><span>${p.patient_mrn || '—'}</span></div>
          <div class="row"><span>Amount</span><span><strong>${formatMoney(p.amount, p.currency)}</strong></span></div>
          <div class="row"><span>Payment method</span><span>${methodLabel}</span></div>
          ${p.reference ? `<div class="row"><span>Reference</span><span>${p.reference}</span></div>` : ''}
        </div>
        <p style="marginTop:1.5rem"><button onclick="window.print()">Print</button> <button onclick="window.close()">Close</button></p>
        </body></html>`);
      win.document.close();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="page-enter page-enter-active">
        <h2 className="section-title">Billing & Account Manager</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Manage billing, invoices, payments. View debit and credit reports.
        </p>

        <div className="billing-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn ${activeTab === t.id ? 'btn-primary' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'workflow' && (
          <>
            <div className="card card-interactive" style={{ marginBottom: '1.5rem' }}>
              <div className="card-body">
                <h3 style={{ marginTop: 0 }}>Select encounter</h3>
                {loading ? <p>Loading encounters…</p> : (
                  <select
                    value={selectedEnc || ''}
                    onChange={(e) => setSelectedEnc(e.target.value || null)}
                    style={{ padding: '0.5rem 0.75rem', minWidth: 280 }}
                  >
                    <option value="">— Select encounter —</option>
                    {encounters.map((enc) => (
                      <option key={enc.id} value={enc.id}>{enc.id} — MRN: {enc.patient_mrn} ({enc.status})</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {selectedEnc && (
              <>
                <section className="section">
                  <h3 className="section-title">Charges (USD)</h3>
                  {charges.length === 0 && (
                    <p style={{ marginBottom: '0.75rem' }}>
                      <button type="button" className="btn-primary" onClick={handleGenerateInitialBill}>
                        Generate bill from services (auto when patient registered/processed)
                      </button>
                      {' '}Creates charges from Org setup → Services. Add manual charges below if needed.
                    </p>
                  )}
                  <form onSubmit={handleAddCharge} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                    <input placeholder="Service code" value={newCharge.service_code} onChange={(e) => setNewCharge((s) => ({ ...s, service_code: e.target.value }))} style={{ padding: '0.5rem', width: 120 }} />
                    <input placeholder="Description" value={newCharge.description} onChange={(e) => setNewCharge((s) => ({ ...s, description: e.target.value }))} style={{ padding: '0.5rem', flex: 1, minWidth: 140 }} />
                    <input type="number" step="0.01" placeholder="Amount (USD)" value={newCharge.amount} onChange={(e) => setNewCharge((s) => ({ ...s, amount: e.target.value }))} style={{ padding: '0.5rem', width: 100 }} />
                    <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem' }}>Add charge</button>
                  </form>
                  <div className="card">
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr><th>Code</th><th>Description</th><th>Amount (USD)</th></tr></thead>
                        <tbody>
                          {charges.map((c) => (
                            <tr key={c.id}>
                              <td>{c.service_code}</td>
                              <td>{c.description || '—'}</td>
                              <td className="money-usd">{formatMoney(c.amount, 'USD')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>

                <section className="section">
                  <h3 className="section-title">Invoices & payments</h3>
                  <button type="button" className="btn-primary" style={{ marginBottom: '1rem' }} onClick={handleCreateInvoice}>
                    Create invoice (USD)
                  </button>
                  <div className="card">
                    <ul className="opd-list">
                      {invoices.map((inv) => (
                        <li key={inv.id}>
                          <strong>{inv.id}</strong> — {formatMoney(inv.total_amount, 'USD')} — {inv.status}
                          {' '}
                          <button type="button" className="btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.85rem' }} onClick={() => handlePrintInvoice(inv.id)}>Print / Download</button>
                          {' '}
                          <button type="button" className="btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.85rem' }} onClick={() => setDocsForInvoiceId(docsForInvoiceId === inv.id ? null : inv.id)}>Documents</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <form onSubmit={handleAddPayment} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem', alignItems: 'flex-end' }}>
                    <select value={newPayment.invoice_id} onChange={(e) => setNewPayment((s) => ({ ...s, invoice_id: e.target.value }))} style={{ padding: '0.5rem', minWidth: 200 }} required>
                      <option value="">Select invoice</option>
                      {invoices.filter((i) => i.status !== 'paid').map((i) => (
                        <option key={i.id} value={i.id}>{i.id} — {formatMoney(i.total_amount, 'USD')}</option>
                      ))}
                    </select>
                    <input type="number" step="0.01" placeholder="Amount (USD)" value={newPayment.amount} onChange={(e) => setNewPayment((s) => ({ ...s, amount: e.target.value }))} style={{ padding: '0.5rem', width: 100 }} required />
                    <select value={newPayment.method} onChange={(e) => setNewPayment((s) => ({ ...s, method: e.target.value }))} style={{ padding: '0.5rem' }} title="Payment method">
                      <option value="cash">Cash</option>
                      <option value="bank">Bank</option>
                      <option value="mobile_money">Mobile Money</option>
                    </select>
                    <input type="text" placeholder="Reference (optional)" value={newPayment.reference} onChange={(e) => setNewPayment((s) => ({ ...s, reference: e.target.value }))} style={{ padding: '0.5rem', width: 140 }} />
                    <button type="submit" className="btn-primary" style={{ padding: '0.5rem 1rem' }}>Record payment → Receipt</button>
                  </form>
                </section>
              </>
            )}
          </>
        )}

        {activeTab === 'invoices' && (
          <section className="section">
            <h3 className="section-title">Invoice List</h3>
            <div className="card">
              {reportsLoading ? <p style={{ padding: '1.5rem', margin: 0 }}>Loading…</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Invoice ID</th>
                        <th>Encounter</th>
                        <th>Patient MRN</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allInvoices.map((i) => (
                        <tr key={i.id}>
                          <td><code>{i.id}</code></td>
                          <td>{i.encounter_id}</td>
                          <td>{i.patient_mrn || '—'}</td>
                          <td className="money-usd">{formatMoney(i.total_amount, i.currency)}</td>
                          <td><span className="badge">{i.status}</span></td>
                          <td>{i.created_at}</td>
                          <td>
                            <button type="button" className="btn" style={{ padding: '0.25rem 0.5rem', marginRight: '0.25rem' }} onClick={() => handlePrintInvoice(i.id)}>Print</button>
                            <button type="button" className="btn" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setDocsForInvoiceId(docsForInvoiceId === i.id ? null : i.id)}>Documents</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'payments' && (
          <section className="section">
            <h3 className="section-title">Payment Report</h3>
            <div className="card">
              {reportsLoading ? <p style={{ padding: '1.5rem', margin: 0 }}>Loading…</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Payment ID</th>
                        <th>Invoice</th>
                        <th>Patient MRN</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allPayments.map((p) => (
                        <tr key={p.id}>
                          <td><code>{p.id}</code></td>
                          <td>{p.invoice_id}</td>
                          <td>{p.patient_mrn || '—'}</td>
                          <td className="money-usd">{formatMoney(p.amount, p.currency)}</td>
                          <td>{(p.method || 'cash').replace(/_/g, ' ')}</td>
                          <td>{p.created_at}</td>
                          <td><button type="button" className="btn" style={{ padding: '0.25rem 0.5rem' }} onClick={() => handlePrintReceipt(p.id)}>Print receipt</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'debit' && (
          <section className="section">
            <h3 className="section-title">Debit Report (Pending / Partial Invoices)</h3>
            <div className="card">
              {reportsLoading ? <p style={{ padding: '1.5rem', margin: 0 }}>Loading…</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Invoice ID</th>
                        <th>Encounter</th>
                        <th>Patient MRN</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debitInvoices.map((i) => (
                        <tr key={i.id}>
                          <td><code>{i.id}</code></td>
                          <td>{i.encounter_id}</td>
                          <td>{i.patient_mrn || '—'}</td>
                          <td className="money-usd">{formatMoney(i.total_amount, i.currency)}</td>
                          <td><span className="badge">{i.status}</span></td>
                          <td>{i.created_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'credit' && (
          <section className="section">
            <h3 className="section-title">Credit Report (Payments)</h3>
            <div className="card">
              {reportsLoading ? <p style={{ padding: '1.5rem', margin: 0 }}>Loading…</p> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Payment ID</th>
                        <th>Invoice</th>
                        <th>Patient MRN</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {creditPayments.map((p) => (
                        <tr key={p.id}>
                          <td><code>{p.id}</code></td>
                          <td>{p.invoice_id}</td>
                          <td>{p.patient_mrn || '—'}</td>
                          <td className="money-usd">{formatMoney(p.amount, p.currency)}</td>
                          <td>{(p.method || 'cash').replace(/_/g, ' ')}</td>
                          <td>{p.created_at}</td>
                          <td><button type="button" className="btn" style={{ padding: '0.25rem 0.5rem' }} onClick={() => handlePrintReceipt(p.id)}>Print receipt</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {docsForInvoiceId && orgId && (
          <div style={{ marginTop: '1rem' }}>
            <DocumentList
              documents={invoiceDocuments}
              onRefresh={(list) => setInvoiceDocuments(list || [])}
              uploadConfig={{ orgId, entityType: 'invoice', entityId: docsForInvoiceId }}
              setError={setError}
              title={`Invoice documents — ${docsForInvoiceId}`}
              emptyMessage="No documents. Upload scanned invoice or receipt."
            />
            <button type="button" className="btn" style={{ marginTop: '0.5rem' }} onClick={() => setDocsForInvoiceId(null)}>Close</button>
          </div>
        )}

        {error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}
      </div>
    </Layout>
  );
}
