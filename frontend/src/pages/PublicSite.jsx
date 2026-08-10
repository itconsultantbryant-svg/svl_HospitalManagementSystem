import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';

const FALLBACK_LOGO = null;

/** Branded public hospital website — rendered at /h/:orgId with no login required. */
export default function PublicSite() {
  const { orgId } = useParams();
  const [info, setInfo] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', department_id: '', doctor_id: '', preferred_date: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    setNotFound(false);
    Promise.all([
      api.uhpcms.publicOrgInfo(orgId).then((r) => r.data),
      api.uhpcms.publicDepartments(orgId).then((r) => r.data || []),
      api.uhpcms.publicDoctors(orgId).then((r) => r.data || []),
    ]).then(([i, deps, docs]) => {
      if (!i) { setNotFound(true); return; }
      setInfo(i);
      setDepartments(deps);
      setDoctors(docs);
    }).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [orgId]);

  const submitAppointment = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.full_name.trim()) { setFormError('Please enter your name.'); return; }
    setSubmitting(true);
    try {
      await api.uhpcms.requestPublicAppointment(orgId, form);
      setDone(true);
      setForm({ full_name: '', phone: '', email: '', department_id: '', doctor_id: '', preferred_date: '', message: '' });
    } catch (err) {
      setFormError(err.message || 'Could not submit appointment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="public-site">
        <div className="public-loading">Loading…</div>
        <style>{PUBLIC_STYLES}</style>
      </div>
    );
  }

  if (notFound || !info) {
    return (
      <div className="public-site">
        <div className="public-notfound">
          <h1>Hospital not found</h1>
          <p>We could not find a hospital at this address.</p>
          <Link to="/login">Back to U-HPCMS login</Link>
        </div>
        <style>{PUBLIC_STYLES}</style>
      </div>
    );
  }

  const name = info.name || 'Our Hospital';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <div className="public-site">
      {/* Header */}
      <header className="public-header">
        <div className="public-container public-nav">
          <div className="public-brand">
            {info.logo ? <img src={info.logo} alt={`${name} logo`} className="public-logo" /> : <div className="public-logo public-logo-fallback">{initials}</div>}
            <span className="public-brand-name">{name}</span>
          </div>
          <nav className="public-nav-links">
            <a href="#about">About</a>
            <a href="#departments">Departments</a>
            <a href="#doctors">Doctors</a>
            <a href="#contact">Contact</a>
            <a href="#appointment" className="public-nav-cta">Book Appointment</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="public-hero">
        <div className="public-container">
          <h1 className="public-hero-title">Welcome to {name}</h1>
          <p className="public-hero-sub">
            Compassionate, quality healthcare for {info.country || 'our community'} — book an appointment online in minutes.
          </p>
          <div className="public-hero-actions">
            <a href="#appointment" className="public-btn public-btn-light">Book an Appointment</a>
            <a href="#departments" className="public-btn public-btn-outline">Explore Services</a>
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="public-section">
        <div className="public-container">
          <h2 className="public-section-title">About {name}</h2>
          <p className="public-section-body">
            {name} is committed to delivering safe, accessible and patient-centred care.
            Our team of doctors, nurses and support staff work together to serve you and your family.
          </p>
        </div>
      </section>

      {/* Departments */}
      <section id="departments" className="public-section public-section-alt">
        <div className="public-container">
          <h2 className="public-section-title">Our Departments</h2>
          {departments.length === 0 ? (
            <p className="public-section-body">Department information is coming soon.</p>
          ) : (
            <div className="public-grid public-grid-3">
              {departments.map((d) => (
                <div key={d.id} className="public-card">
                  <div className="public-card-icon">🏥</div>
                  <h3 className="public-card-title">{d.name}</h3>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Doctors */}
      <section id="doctors" className="public-section">
        <div className="public-container">
          <h2 className="public-section-title">Our Doctors</h2>
          {doctors.length === 0 ? (
            <p className="public-section-body">Meet our medical team soon.</p>
          ) : (
            <div className="public-grid public-grid-3">
              {doctors.map((doc) => (
                <div key={doc.id} className="public-card public-doctor">
                  <div className="public-doctor-avatar">{(doc.full_name || 'D')[0].toUpperCase()}</div>
                  <h3 className="public-card-title">{doc.full_name}</h3>
                  <p className="public-card-sub">{doc.department_name || 'Medical Department'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="public-section public-section-alt">
        <div className="public-container">
          <h2 className="public-section-title">Contact Us</h2>
          <div className="public-grid public-grid-3">
            <div className="public-card">
              <div className="public-card-icon">📍</div>
              <h3 className="public-card-title">Address</h3>
              <p className="public-card-sub">{info.address || 'Address coming soon'}{info.country ? `, ${info.country}` : ''}</p>
            </div>
            <div className="public-card">
              <div className="public-card-icon">📞</div>
              <h3 className="public-card-title">Phone</h3>
              <p className="public-card-sub">{info.phone || 'Phone coming soon'}</p>
            </div>
            <div className="public-card">
              <div className="public-card-icon">✉️</div>
              <h3 className="public-card-title">Email</h3>
              <p className="public-card-sub">{info.email || 'Email coming soon'}</p>
            </div>
          </div>
          <div className="public-card public-hours">
            <h3 className="public-card-title">Opening Hours</h3>
            <p className="public-card-sub">Monday – Friday: 8:00 AM – 5:00 PM · Saturday: 9:00 AM – 1:00 PM · Sunday: Emergency only</p>
          </div>
        </div>
      </section>

      {/* Appointment form */}
      <section id="appointment" className="public-section">
        <div className="public-container public-form-wrap">
          <h2 className="public-section-title">Request an Appointment</h2>
          <p className="public-section-body">Fill in the form below and our reception team will confirm your booking.</p>
          {done && (
            <div className="public-success">✅ Thank you! Your appointment request has been received. We will contact you shortly.</div>
          )}
          <form onSubmit={submitAppointment} className="public-form">
            <div className="public-form-row">
              <label>Full name *<input type="text" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Your full name" required /></label>
              <label>Phone <input type="text" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone number" /></label>
            </div>
            <div className="public-form-row">
              <label>Email <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@example.com" /></label>
              <label>Preferred date <input type="date" value={form.preferred_date} onChange={(e) => setForm((f) => ({ ...f, preferred_date: e.target.value }))} /></label>
            </div>
            <div className="public-form-row">
              <label>
                Department
                <select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}>
                  <option value="">— Select —</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label>
                Doctor (optional)
                <select value={form.doctor_id} onChange={(e) => setForm((f) => ({ ...f, doctor_id: e.target.value }))}>
                  <option value="">— Any —</option>
                  {doctors.map((doc) => <option key={doc.id} value={doc.id}>{doc.full_name}</option>)}
                </select>
              </label>
            </div>
            <label>Message <textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} rows={3} placeholder="Briefly describe your concern (optional)" /></label>
            {formError && <div className="public-error">{formError}</div>}
            <button type="submit" className="public-btn public-btn-primary" disabled={submitting}>{submitting ? 'Submitting…' : 'Request Appointment'}</button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="public-footer">
        <div className="public-container">
          <p>{name} · {info.address || ''} {info.phone ? `· ${info.phone}` : ''}</p>
          <p className="public-footer-powered">Powered by U-HPCMS Hospital, Clinic &amp; Pharmacy Management</p>
        </div>
      </footer>

      <style>{PUBLIC_STYLES}</style>
    </div>
  );
}

const PUBLIC_STYLES = `
.public-site {
  font-family: 'Inter', system-ui, sans-serif;
  color: #1f2937;
  background: #ffffff;
  min-height: 100vh;
  line-height: 1.6;
}
.public-container { max-width: 1120px; margin: 0 auto; padding: 0 1.25rem; }
.public-loading, .public-notfound { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; gap: 0.5rem; }
.public-notfound a { color: #0d9488; text-decoration: underline; }

/* Header */
.public-header { background: #ffffff; border-bottom: 1px solid #e5e7eb; position: sticky; top: 0; z-index: 20; }
.public-nav { display: flex; align-items: center; justify-content: space-between; height: 68px; }
.public-brand { display: flex; align-items: center; gap: 0.75rem; }
.public-logo { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; }
.public-logo-fallback { display: flex; align-items: center; justify-content: center; background: #0d9488; color: #fff; font-weight: 700; font-size: 1.05rem; }
.public-brand-name { font-weight: 700; font-size: 1.1rem; }
.public-nav-links { display: flex; align-items: center; gap: 1.25rem; }
.public-nav-links a { color: #374151; text-decoration: none; font-size: 0.95rem; font-weight: 500; }
.public-nav-links a:hover { color: #0d9488; }
.public-nav-cta { background: #0d9488; color: #fff !important; padding: 0.45rem 0.9rem; border-radius: 8px; }

/* Hero */
.public-hero { background: linear-gradient(135deg, #0d9488 0%, #115e59 100%); color: #fff; padding: 5rem 0; text-align: center; }
.public-hero-title { font-size: 2.5rem; font-weight: 800; margin: 0 0 0.75rem; }
.public-hero-sub { font-size: 1.15rem; max-width: 640px; margin: 0 auto 1.75rem; opacity: 0.95; }
.public-hero-actions { display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap; }
.public-btn { display: inline-block; padding: 0.7rem 1.4rem; border-radius: 8px; font-weight: 600; text-decoration: none; border: 2px solid transparent; cursor: pointer; font-size: 0.95rem; }
.public-btn-light { background: #ffffff; color: #0f766e; }
.public-btn-outline { border-color: rgba(255,255,255,0.7); color: #fff; background: transparent; }
.public-btn-primary { background: #0d9488; color: #fff; }
.public-btn-primary:hover { background: #0f766e; }

/* Sections */
.public-section { padding: 4rem 0; }
.public-section-alt { background: #f0fdfa; }
.public-section-title { font-size: 1.75rem; font-weight: 800; margin: 0 0 1rem; text-align: center; }
.public-section-body { text-align: center; max-width: 720px; margin: 0 auto 2rem; color: #4b5563; }
.public-grid { display: grid; gap: 1.25rem; margin-top: 1rem; }
.public-grid-3 { grid-template-columns: repeat(3, 1fr); }
.public-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.5rem; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
.public-card-icon { font-size: 1.75rem; margin-bottom: 0.5rem; }
.public-card-title { font-size: 1.05rem; font-weight: 700; margin: 0 0 0.25rem; }
.public-card-sub { color: #6b7280; margin: 0; font-size: 0.9rem; }
.public-doctor-avatar { width: 56px; height: 56px; border-radius: 50%; background: #ccfbf1; color: #0f766e; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; margin: 0 auto 0.75rem; }
.public-hours { max-width: 720px; margin: 1.5rem auto 0; }

/* Appointment form */
.public-form-wrap { max-width: 720px; }
.public-form { display: grid; gap: 0.9rem; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.5rem; }
.public-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
.public-form label { display: grid; gap: 0.3rem; font-size: 0.9rem; font-weight: 600; color: #374151; }
.public-form input, .public-form select, .public-form textarea { padding: 0.6rem 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; font-family: inherit; background: #fff; }
.public-form input:focus, .public-form select:focus, .public-form textarea:focus { outline: 2px solid #0d9488; border-color: transparent; }
.public-form .public-btn-primary { justify-self: start; }
.public-error { color: #dc2626; font-size: 0.9rem; }
.public-success { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; }

/* Footer */
.public-footer { background: #0f172a; color: #94a3b8; padding: 2rem 0; text-align: center; font-size: 0.9rem; }
.public-footer-powered { margin: 0.35rem 0 0; opacity: 0.8; font-size: 0.8rem; }

@media (max-width: 768px) {
  .public-hero-title { font-size: 1.9rem; }
  .public-nav { height: auto; padding: 0.75rem 1.25rem; flex-direction: column; gap: 0.5rem; }
  .public-nav-links { flex-wrap: wrap; justify-content: center; gap: 0.85rem; }
  .public-grid-3 { grid-template-columns: 1fr; }
  .public-form-row { grid-template-columns: 1fr; }
}
`;

// Keep FALLBACK_LOGO referenced so bundlers don't warn about the unused constant.
export const __publicFallbackLogo = FALLBACK_LOGO;
