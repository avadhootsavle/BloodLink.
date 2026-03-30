import React, { useEffect, useState } from 'react';
import useAppData from '../hooks/useAppData';
import { updateDonorStatus, fetchTransfers, rejectTransfer, acceptTransfer } from '../services/mockApi';

const Donate = () => {
  const { session, setInventory } = useAppData();
  const cooldownEndsAt = session?.nextEligibleDonationAt ? new Date(session.nextEligibleDonationAt) : null;
  const isInCooldown = Boolean(cooldownEndsAt && cooldownEndsAt.getTime() > Date.now());
  const donationGuidelines = [
    {
      stage: '24 hours before',
      action: 'Drink extra water and avoid alcohol.',
      reason: 'Good hydration helps maintain blood volume and reduces dizziness after donation.',
    },
    {
      stage: 'Night before',
      action: 'Sleep for at least 7 to 8 hours.',
      reason: 'Proper rest lowers fatigue and helps your body recover faster.',
    },
    {
      stage: 'Before leaving home',
      action: 'Eat a light iron-rich meal such as fruits, sprouts, eggs, or roti with vegetables.',
      reason: 'Donating on an empty stomach can make you feel weak or light-headed.',
    },
    {
      stage: 'What to carry',
      action: 'Bring a valid ID and keep your phone number active.',
      reason: 'The hospital may need to verify identity or coordinate appointment timing.',
    },
    {
      stage: 'At the hospital',
      action: 'Wear comfortable sleeves and tell the staff about medicines or recent illness.',
      reason: 'This helps the team assess eligibility and complete the process safely.',
    },
    {
      stage: 'After donation',
      action: 'Rest, hydrate again, and avoid heavy gym or smoking for a few hours.',
      reason: 'Recovery steps reduce the chance of fainting and support safe post-donation recovery.',
    },
  ];
  const [donationForm, setDonationForm] = useState({
    isReadyToDonate: session?.isReadyToDonate || false,
    emergencyContact: session?.emergencyContact || false
  });
  const [submitError, setSubmitError] = useState('');
  const [transfers, setTransfers] = useState([]);

  // Refresh session from backend so toggle reflects actual DB state
  useEffect(() => {
    if (!session?.id) return;
    const API_BASE = process.env.REACT_APP_API_BASE || '/api';
    fetch(`${API_BASE}/user/${session.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) {
          const updated = { ...session, ...data.user };
          localStorage.setItem('lifeline-blood-center-session', JSON.stringify(updated));
          window.dispatchEvent(new Event('storage'));
          setDonationForm({
            isReadyToDonate: updated.isReadyToDonate || false,
            emergencyContact: updated.emergencyContact || false,
          });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (session?.id) {
      fetchTransfers(session.id).then(setTransfers).catch(console.error);
    }
  }, [session?.id]);

  useEffect(() => {
    setDonationForm({
      isReadyToDonate: isInCooldown ? false : (session?.isReadyToDonate || false),
      emergencyContact: session?.emergencyContact || false
    });
  }, [isInCooldown, session]);

  const handleDonationSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    try {
      const payload = {
        donorId: session?.id,
        isReadyToDonate: donationForm.isReadyToDonate,
        emergencyContact: donationForm.emergencyContact
      };
      
      const { inventory: updatedInventory } = await updateDonorStatus(payload, session);
      setInventory(updatedInventory);
      setSubmitError('Preferences saved successfully!');
      setTimeout(() => setSubmitError(''), 3000);
    } catch (err) {
      setSubmitError('Could not save right now. Try again in a moment.');
    }
  };

  const loggedIn = Boolean(session);
  const isHospital = session?.role === 'Hospital';

  if (!loggedIn) {
    return (
      <main className="page">
        <section className="hero">
          <div className="hero__content">
            <p className="eyebrow">Identity check</p>
            <h1>Login required</h1>
            <p className="lead">Sign in as an individual donor to publish available units.</p>
            <a className="btn btn--primary" href="/login">
              Go to login
            </a>
          </div>
        </section>
      </main>
    );
  }

  if (isHospital) {
    return (
      <main className="page">
        <section className="hero">
          <div className="hero__content">
            <p className="eyebrow">Donate</p>
            <h1>Only individual donors can donate.</h1>
            <p className="lead">Switch to an individual account or use the hospital console to find blood.</p>
            <a className="btn btn--primary" href="/hospital">
              Go to hospital console
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="grid" id="donate" style={{ maxWidth: '650px', margin: '0 auto' }}>
        <div className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Donate</p>
              <h3>Manage your donor status</h3>
              <p className="hint">Read the preparation checklist, then update your availability below.</p>
            </div>
            <div className="pill pill--ghost">Verified Donors Only</div>
          </div>

          {isInCooldown ? (
            <div className="panel panel--muted" style={{ marginBottom: '1rem', padding: '1rem 1.1rem' }}>
              <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>Cooldown Active</p>
              <h4 style={{ marginBottom: '0.35rem' }}>You are temporarily not eligible to donate again.</h4>
              <p className="hint">
                Your last completed donation triggered the recovery period. You can mark yourself ready again after{' '}
                {cooldownEndsAt?.toLocaleDateString()}.
              </p>
            </div>
          ) : null}
          
          <div className="guideline-table-wrap" style={{ marginBottom: '2rem' }}>
            <table className="guideline-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What to do</th>
                  <th>Why it matters</th>
                </tr>
              </thead>
              <tbody>
                {donationGuidelines.map((item) => (
                  <tr key={item.stage}>
                    <td>{item.stage}</td>
                    <td>{item.action}</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form className="form" onSubmit={handleDonationSubmit} style={{ borderTop: '1px solid #eaeaea', paddingTop: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #eee' }}>
                <div className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={donationForm.isReadyToDonate} 
                    onChange={(e) => setDonationForm({...donationForm, isReadyToDonate: e.target.checked})}
                    disabled={isInCooldown}
                  />
                  <span className="toggle-slider"></span>
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '0.2rem' }}>Ready to Donate</strong>
                  <p className="hint" style={{ margin: 0, fontSize: '0.9rem' }}>
                    {isInCooldown
                      ? `Disabled during cooldown. Available again after ${cooldownEndsAt?.toLocaleDateString()}.`
                      : 'Allows hospitals to see you in the active inventory.'}
                  </p>
                </div>
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #eee' }}>
                <div className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={donationForm.emergencyContact} 
                    onChange={(e) => setDonationForm({...donationForm, emergencyContact: e.target.checked})} 
                  />
                  <span className="toggle-slider"></span>
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '0.2rem' }}>Emergency Donor</strong>
                  <p className="hint" style={{ margin: 0, fontSize: '0.9rem' }}>Permit emergency notifications when severe shortages occur.</p>
                </div>
              </label>
            </div>

            <button type="submit" className="btn btn--primary" style={{ width: '100%', padding: '0.75rem' }}>
              Save Preferences
            </button>
            {submitError && (
               <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <p className="hint" style={{ color: submitError.includes('success') ? 'green' : 'red', fontWeight: 500, margin: 0 }}>
                  {submitError}
                </p>
              </div>
            )}
          </form>
        </div>

        <div className="panel" style={{ marginTop: '1.5rem' }}>
          <div className="panel__header">
            <div>
              <p className="eyebrow">My Transfers</p>
              <h3>Hospitals requesting your blood</h3>
              <p className="hint">These hospitals have claimed your donation. Please coordinate with them.</p>
            </div>
            <div className="pill pill--warning" style={{ color: '#d97706', borderColor: '#fcd34d', backgroundColor: '#fef3c7' }}>Action Required</div>
          </div>
          <div className="inventory-list">
            {transfers.filter(tx => tx.status === 'In Progress').map((tx) => (
              <div key={tx._id} className="inventory-row">
                <div className="pill pill--ghost">{tx.donorId?.bloodGroup || '?'}</div>
                <div className="inventory-row__meta">
                  <h4>{tx.hospitalId?.organization || tx.hospitalId?.name || 'Verified Hospital'}</h4>
                  <p className="hint">
                    {tx.hospitalId?.city || 'No city'} · {tx.status}
                  </p>
                </div>
                <div className="inventory-row__contact">
                  <p className="inventory-row__contact-label">Contact</p>
                  <p>{tx.hospitalId?.email || 'On file'}</p>
                  <p className="hint">{new Date(tx.createdAt).toLocaleDateString()}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn btn--primary" style={{ padding: '0.5rem 0.9rem', fontSize: '0.85rem' }} onClick={async () => {
                    try {
                      await acceptTransfer(tx._id);
                      const updated = await fetchTransfers(session.id);
                      setTransfers(updated);
                    } catch (err) {
                      console.error('Failed to accept transfer:', err);
                    }
                  }}>
                    Accept
                  </button>
                  <button className="btn btn--ghost" style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '0.5rem 0.9rem', fontSize: '0.85rem' }} onClick={async () => {
                    if (!window.confirm('Reject this blood donation request? You will be made available again.')) return;
                    try {
                      await rejectTransfer(tx._id);
                      const updated = await fetchTransfers(session.id);
                      setTransfers(updated);
                    } catch (err) {
                      console.error('Failed to reject transfer:', err);
                    }
                  }}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {!transfers.filter(tx => tx.status === 'In Progress').length && <p className="hint">No hospitals have requested your blood yet.</p>}
          </div>
        </div>

        <div className="panel" style={{ marginTop: '1.5rem' }}>
          <div className="panel__header">
            <div>
              <p className="eyebrow">Accepted Requests</p>
              <h3>Appointment coordination pending</h3>
              <p className="hint">These hospitals can now call you and schedule the donation appointment.</p>
            </div>
            <div className="pill pill--success">Accepted</div>
          </div>
          <div className="inventory-list">
            {transfers.filter(tx => tx.status === 'Accepted').map((tx) => (
              <div key={tx._id} className="inventory-row">
                <div className="pill pill--ghost">{tx.donorId?.bloodGroup || '?'}</div>
                <div className="inventory-row__meta">
                  <h4>{tx.hospitalId?.organization || tx.hospitalId?.name || 'Verified Hospital'}</h4>
                  <p className="hint">
                    {tx.hospitalId?.city || 'No city'} · Accepted
                  </p>
                  <p className="hint">The hospital will contact you to finalize the appointment.</p>
                </div>
                <div className="inventory-row__contact">
                  <p className="inventory-row__contact-label">Contact</p>
                  <p>{tx.hospitalId?.email || 'On file'}</p>
                  <p className="hint">{new Date(tx.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
            {!transfers.filter(tx => tx.status === 'Accepted').length && <p className="hint">No accepted requests yet.</p>}
          </div>
        </div>

      </section>
    </main>
  );
};

export default Donate;
