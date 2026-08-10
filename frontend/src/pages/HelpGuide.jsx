import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../Layout';
import { hasPermission } from '../utils/permissions';

/**
 * In-app Help & Training guide.
 * Collapsible accordion sections, one per module. Sections are role-filtered
 * by permission so each staff member only sees the guides relevant to them.
 */
export default function HelpGuide({ user, onLogout }) {
  const [open, setOpen] = useState(() => new Set());

  const toggle = (key) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isOpen = (key) => open.has(key);

  const modules = useMemo(() => buildModules(user), [user]);

  const visible = modules.filter((m) => m.visible);
  const visibleCount = visible.length;

  return (
    <Layout user={user} onLogout={onLogout}>
      <div className="page-enter page-enter-active">
        <h2 className="section-title">Help &amp; Training</h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', maxWidth: '720px' }}>
          Step-by-step guides for the modules available to you. Click a section to expand it.
          {visibleCount > 0 && ` ${visibleCount} guide${visibleCount === 1 ? '' : 's'} available for your role.`}
        </p>

        {visibleCount === 0 ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>📖</p>
            <p style={{ margin: '0 0 1rem', color: 'var(--color-text-muted)' }}>No training guides are available for your role yet.</p>
            <Link to="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
          </div>
        ) : (
          <div className="help-accordion">
            {visible.map((mod) => (
              <div key={mod.key} className={`help-accordion-item ${isOpen(mod.key) ? 'open' : ''}`}>
                <button
                  type="button"
                  className="help-accordion-header"
                  onClick={() => toggle(mod.key)}
                  aria-expanded={isOpen(mod.key)}
                >
                  <span className="help-accordion-icon">{mod.icon}</span>
                  <span className="help-accordion-title">{mod.title}</span>
                  <span className="help-accordion-role">{mod.audience}</span>
                  <span className="help-accordion-chevron">{isOpen(mod.key) ? '−' : '+'}</span>
                </button>

                {isOpen(mod.key) && (
                  <div className="help-accordion-body">
                    {mod.intro ? <p className="help-intro">{mod.intro}</p> : null}
                    {mod.guides.map((g) => (
                      <div key={g.title} className="help-guide">
                        <h4 className="help-guide-title">{g.title}</h4>
                        <ol className="help-steps">
                          {g.steps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                        <div className="placeholder-image" title="Screenshot placeholder">
                          <span>Preview — {g.title}</span>
                        </div>
                        {g.terms && g.terms.length > 0 && (
                          <div className="help-terms">
                            <strong>Key terms: </strong>
                            {g.terms.join(' · ')}
                          </div>
                        )}
                        {g.tip ? <p className="help-tip">💡 {g.tip}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <style>{HELP_STYLES}</style>
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------------ */
/* Module content — role-filtered via hasPermission(user, perm)        */
/* ------------------------------------------------------------------ */

function buildModules(user) {
  const show = (perm) => hasPermission(user, perm);
  // Admins without an explicit permission list (legacy users) show all modules.
  const allVisible = !Array.isArray(user?.permissions) || user.permissions.length === 0;

  const can = (perm) => allVisible || show(perm);

  const receptionVisible = can('patients:create') || can('clinic:book') || can('appointments:book');
  const doctorVisible = can('encounters:create') || can('triage:create') || can('pharmacy:create');
  const nurseVisible = can('triage:create') || can('inpatient:view');
  const labVisible = can('lab:view') || can('lab:create') || can('lab:result');
  const pharmacyVisible = can('pharmacy:view') || can('pharmacy:dispense') || can('pharmacy:inventory');
  const billingVisible = can('billing:view') || can('billing:create') || can('billing:approve');
  const financeVisible = can('finance:view') || can('reporting:view');
  const adminVisible = can('org_admin:manage_users') || can('org_admin:manage_branding') || can('settings:edit');
  const governanceVisible = can('governance:view') || can('governance:monitor') || can('governance:audit');

  return [
    {
      key: 'reception',
      icon: '🛎️',
      title: 'Reception & Patient Registration',
      audience: 'Receptionists',
      visible: receptionVisible,
      intro: 'Front-desk workflows for registering patients, booking appointments and managing the OPD queue.',
      guides: [
        {
          title: 'Register a New Patient',
          steps: [
            'Open the Patient Flow page (Patient Flow in the sidebar) and click "Register Patient".',
            'Fill in the patient’s full name, date of birth, gender and phone number.',
            'As you type the name or date of birth, the system checks for possible duplicate patients. Review the yellow warning if one appears before continuing.',
            'Complete the remaining fields (contact, next of kin, address) and click Save.',
            'The patient receives a unique MRN (medical record number) — note it down for the patient record.',
          ],
          terms: ['MRN', 'Duplicate check', 'Patient record'],
          tip: 'Always check the duplicate warning before saving — it prevents two files for the same patient.',
        },
        {
          title: 'Book an Appointment',
          steps: [
            'Open Appointments from the sidebar.',
            'Click "New Appointment" and search for the patient by name or MRN.',
            'Pick the department, doctor and preferred date/time.',
            'Save the appointment — the patient shows up in the day’s schedule.',
          ],
          terms: ['Appointment', 'Schedule'],
        },
        {
          title: 'Manage the OPD Queue',
          steps: [
            'Open OPD Queue from the sidebar.',
            'Check in patients as they arrive using the "Check-in" action.',
            'Move patients along the queue as doctors complete their consultations.',
            'Monitor the queue for wait times and escalate long waits to the front desk supervisor.',
          ],
          terms: ['OPD', 'Check-in', 'Queue'],
        },
      ],
    },
    {
      key: 'doctor',
      icon: '🩺',
      title: 'Doctor Workflow & Consultation',
      audience: 'Doctors',
      visible: doctorVisible,
      intro: 'From the waiting list to consultation, notes, orders and follow-up — the doctor workflow keeps patient care moving.',
      guides: [
        {
          title: 'Start a Consultation (Doctor Workflow)',
          steps: [
            'Open Doctor Workflow from the sidebar to see patients waiting for you.',
            'Select a patient to open their encounter.',
            'Review their vitals, triage notes and past encounters in the patient chart.',
            'Write your consultation notes and diagnosis.',
            'Save the encounter — the patient moves to the next stage (billing, pharmacy or discharge).',
          ],
          terms: ['Encounter', 'Triage', 'Consultation notes'],
          tip: 'Encounter notes are saved to the patient’s permanent record and visible to authorised staff.',
        },
        {
          title: 'Perform Triage',
          steps: [
            'From the patient chart, open the Triage section.',
            'Record vital signs: temperature, blood pressure, pulse and oxygen saturation.',
            'Enter symptoms and select an urgency level (low / medium / high / emergency).',
            'Save the triage — urgent patients are prioritised in the queue.',
          ],
          terms: ['Vitals', 'Urgency level', 'Priority'],
        },
        {
          title: 'Write a Prescription',
          steps: [
            'From the patient chart, open Prescriptions.',
            'Add each medication, dose, frequency and duration.',
            'Add any refills or special instructions.',
            'Submit the prescription — it appears in the pharmacy for dispensing.',
          ],
          terms: ['Dose', 'Frequency', 'Dispensing'],
        },
        {
          title: 'Order Lab Tests',
          steps: [
            'From the patient chart, open Lab.',
            'Click "Order Test" and select the tests you need.',
            'Save the order — the lab sees it in their queue.',
            'Check back for results, then review them with the patient.',
          ],
          terms: ['Lab order', 'Results'],
        },
      ],
    },
    {
      key: 'nurse',
      icon: '🩹',
      title: 'Nursing & Inpatient Care',
      audience: 'Nurses',
      visible: nurseVisible,
      intro: 'Capture vitals, perform triage and manage inpatient care for admitted patients.',
      guides: [
        {
          title: 'Record Vitals & Triage',
          steps: [
            'Open the patient from Triage or the OPD queue.',
            'Record temperature, blood pressure, pulse, respiration and oxygen saturation.',
            'Note the patient’s chief complaint.',
            'Assign a triage priority and save.',
          ],
          terms: ['Vitals', 'Triage priority'],
        },
        {
          title: 'Manage Inpatient Care',
          steps: [
            'Open Inpatient from the sidebar to see all admitted patients.',
            'Use the bed assignment view to assign patients to available beds.',
            'Record daily nursing notes and observations on each patient.',
            'Flag any deterioration to the attending doctor through Chat or a case file.',
          ],
          terms: ['Admission', 'Bed assignment', 'Ward'],
          tip: 'Bed availability is shown live on the Beds page — check it before admitting a new patient.',
        },
      ],
    },
    {
      key: 'lab',
      icon: '🧪',
      title: 'Laboratory',
      audience: 'Lab staff',
      visible: labVisible,
      intro: 'Receive lab orders, record samples and publish results back to the requesting clinician.',
      guides: [
        {
          title: 'Process Lab Orders',
          steps: [
            'Open Lab from the sidebar to see pending orders.',
            'Select an order and record the sample details / collection time.',
            'Enter the results for each requested test.',
            'Approve and publish the results — the ordering doctor is notified.',
          ],
          terms: ['Sample', 'Result', 'Approve'],
          tip: 'Only published results are visible to clinicians, so always approve before finishing.',
        },
      ],
    },
    {
      key: 'pharmacy',
      icon: '💊',
      title: 'Pharmacy',
      audience: 'Pharmacists',
      visible: pharmacyVisible,
      intro: 'Dispense prescriptions, manage stock and track inventory.',
      guides: [
        {
          title: 'Dispense a Prescription',
          steps: [
            'Open Pharmacy from the sidebar to see prescriptions awaiting dispensing.',
            'Verify the prescription against the patient chart.',
            'Mark each item as dispensed and record batch / expiry if tracked.',
            'Hand over the medication with instructions to the patient.',
          ],
          terms: ['Prescription', 'Dispense', 'Batch'],
        },
        {
          title: 'Manage Inventory',
          steps: [
            'Open Pharmacy → Inventory.',
            'Review current stock levels and reorder points.',
            'Add stock on receipt of deliveries.',
            'Flag low-stock items so reorders can be placed in time.',
          ],
          terms: ['Stock level', 'Reorder point'],
        },
      ],
    },
    {
      key: 'billing',
      icon: '🧾',
      title: 'Billing & Payments',
      audience: 'Billing & cashiers',
      visible: billingVisible,
      intro: 'Create invoices, record payments and prepare claims.',
      guides: [
        {
          title: 'Create an Invoice',
          steps: [
            'Open Billing from the sidebar and select the patient.',
            'Add line items for consultations, procedures, labs and medication.',
            'Apply any discounts or insurance coverage.',
            'Save the invoice — the balance appears on the patient account.',
          ],
          terms: ['Invoice', 'Line item', 'Balance'],
        },
        {
          title: 'Record a Payment',
          steps: [
            'Open the patient’s open invoice.',
            'Enter the amount received and the payment method (cash / card / mobile money).',
            'Save the payment — it is reflected in the finance dashboard.',
          ],
          terms: ['Payment method', 'Receipt'],
        },
        {
          title: 'Insurance Claims',
          steps: [
            'Open Insurance and select the patient’s policy.',
            'Verify the coverage and co-pay before billing.',
            'Tag claimable line items to the policy when creating the invoice.',
            'Submit the claim for processing.',
          ],
          terms: ['Policy', 'Co-pay', 'Claim'],
        },
      ],
    },
    {
      key: 'finance',
      icon: '💰',
      title: 'Finance & Reporting',
      audience: 'Accountants & managers',
      visible: financeVisible,
      intro: 'Revenue tracking, financial dashboards and exportable reports.',
      guides: [
        {
          title: 'Finance Dashboard',
          steps: [
            'Open Finance Dashboard from the sidebar (or the Dashboard if you are an accountant).',
            'Review today’s revenue, pending payments and outstanding balances.',
            'Drill into any figure to see the underlying invoices.',
          ],
          terms: ['Revenue', 'Outstanding balance'],
        },
        {
          title: 'Generate a Report',
          steps: [
            'Open Reporting or Finance Reports from the sidebar.',
            'Choose the report type and date range.',
            'Preview the report, then export it as PDF or CSV for your records.',
          ],
          terms: ['Report', 'Export'],
        },
      ],
    },
    {
      key: 'admin',
      icon: '⚙️',
      title: 'Administration & Settings',
      audience: 'Org admins',
      visible: adminVisible,
      intro: 'Organisation setup, users, roles, branding and hospital settings.',
      guides: [
        {
          title: 'Set Up Your Organisation',
          steps: [
            'Open Settings → Organisation and confirm the hospital name, address, phone and institutional email.',
            'Upload the hospital logo so it appears on the login screen, receipts and the public website.',
            'Set your country, currency and opening hours.',
          ],
          terms: ['Branding', 'Institutional email', 'Logo'],
          tip: 'The institutional email is shown on the login page and the public website — keep it current.',
        },
        {
          title: 'Manage Staff & Roles',
          steps: [
            'Open Org Admin from the sidebar.',
            'Use the Users tab to create staff accounts and assign a role.',
            'Use the Roles tab to review or adjust permissions per role.',
            'Assign departments so staff only see the work relevant to them.',
          ],
          terms: ['Role', 'Permission', 'Department'],
        },
        {
          title: 'Customise Branding',
          steps: [
            'Open Org Admin → Branding.',
            'Update the logo, signature, address, phone and institutional email.',
            'Save — branding appears on the login screen, receipts and your public website.',
          ],
          terms: ['Logo', 'Signature', 'Branding'],
        },
      ],
    },
    {
      key: 'governance',
      icon: '🏛️',
      title: 'Governance & Super Admin',
      audience: 'Super admins',
      visible: governanceVisible,
      intro: 'Cross-organisation management, monitoring and audit.',
      guides: [
        {
          title: 'Manage Hospitals',
          steps: [
            'Open Governance from the sidebar.',
            'Create or edit hospital organisations with their contact details and email.',
            'Create branches and delegate add-on modules to each branch.',
          ],
          terms: ['Organisation', 'Branch', 'Add-on'],
        },
        {
          title: 'Monitor the Network',
          steps: [
            'Open the Governance monitor to see live activity across all organisations.',
            'Review the audit log for any sensitive actions.',
            'Respond to flagged items and follow up with the responsible org admin.',
          ],
          terms: ['Monitor', 'Audit log'],
        },
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const HELP_STYLES = `
.help-accordion { display: grid; gap: 0.75rem; max-width: 900px; }
.help-accordion-item { background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e2e8f0); border-radius: 12px; overflow: hidden; }
.help-accordion-item.open { border-color: var(--color-primary, #0d9488); box-shadow: 0 4px 16px rgba(13,148,136,0.08); }
.help-accordion-header { display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 1rem 1.25rem; background: none; border: none; cursor: pointer; text-align: left; font: inherit; }
.help-accordion-header:hover { background: rgba(13,148,136,0.04); }
.help-accordion-icon { font-size: 1.25rem; }
.help-accordion-title { font-weight: 700; font-size: 1.02rem; color: var(--color-text, #1e293b); flex: 1; }
.help-accordion-role { font-size: 0.78rem; color: var(--color-text-muted, #64748b); background: rgba(13,148,136,0.08); color: var(--color-primary, #0d9488); padding: 0.2rem 0.55rem; border-radius: 999px; white-space: nowrap; }
.help-accordion-chevron { color: var(--color-text-muted, #64748b); font-size: 1.1rem; width: 1.25rem; text-align: center; }
.help-accordion-body { padding: 0.25rem 1.5rem 1.5rem; }
.help-intro { color: var(--color-text-muted, #64748b); margin: 0 0 1.25rem; font-size: 0.95rem; }
.help-guide { margin-bottom: 1.75rem; }
.help-guide:last-child { margin-bottom: 0; }
.help-guide-title { margin: 0 0 0.6rem; font-size: 1.02rem; color: var(--color-primary, #0d9488); }
.help-steps { margin: 0 0 0.75rem; padding-left: 1.35rem; display: grid; gap: 0.35rem; }
.help-steps li { font-size: 0.9375rem; line-height: 1.55; }
.placeholder-image { border: 1.5px dashed var(--color-border, #cbd5e1); border-radius: 10px; min-height: 96px; display: flex; align-items: center; justify-content: center; color: var(--color-text-muted, #94a3b8); font-size: 0.85rem; margin: 0.6rem 0 0.75rem; background: repeating-linear-gradient(45deg, rgba(148,163,184,0.06), rgba(148,163,184,0.06) 10px, transparent 10px, transparent 20px); }
.help-terms { font-size: 0.85rem; color: var(--color-text-muted, #64748b); background: rgba(13,148,136,0.05); padding: 0.5rem 0.75rem; border-radius: 8px; }
.help-tip { font-size: 0.875rem; color: #065f46; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 0.55rem 0.75rem; border-radius: 8px; margin: 0.6rem 0 0; }
@media (max-width: 640px) {
  .help-accordion-role { display: none; }
  .help-accordion-header { padding: 0.85rem 1rem; }
  .help-accordion-body { padding: 0.25rem 1rem 1.25rem; }
}
`;
